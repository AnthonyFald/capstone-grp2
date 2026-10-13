"""Free CPU transcription + recording-wide voice clustering. No inference API."""
import argparse
import json
import os
import re
import shutil
import tarfile
import time
import urllib.request
from pathlib import Path
from runtime_paths import data_root

HERE = Path(__file__).resolve().parent
CACHE = data_root() / '.models'
RELEASE = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/'
SEGMENTATION = 'sherpa-onnx-pyannote-segmentation-3-0'
EMBEDDING = 'nemo_en_titanet_small.onnx'
# Do not reuse a user's Hugging Face credentials or send usage telemetry.
os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
os.environ['HF_HUB_DISABLE_SYMLINKS_WARNING'] = '1'
os.environ['HF_HUB_DISABLE_XET'] = '1'
os.environ['HF_HOME'] = str(CACHE / 'huggingface')


def download(url, destination, progress):
    if destination.is_file():
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_suffix(destination.suffix + '.part')
    try:
        progress('Downloading free model: ' + destination.name, stage='download', step=destination.name)
        with urllib.request.urlopen(url, timeout=120) as response, partial.open('wb') as out:
            total = int(response.headers.get('Content-Length', '0'))
            received = 0
            while chunk := response.read(1024 * 1024):
                out.write(chunk)
                received += len(chunk)
                progress('Downloading free model: ' + destination.name, stage='download',
                         step=destination.name, fraction=min(1, received / total) if total else None)
        partial.replace(destination)
    finally:
        partial.unlink(missing_ok=True)


def models(progress):
    segment = CACHE / SEGMENTATION / 'model.onnx'
    if not segment.exists():
        archive = CACHE / (SEGMENTATION + '.tar.bz2')
        download(RELEASE + 'speaker-segmentation-models/' + archive.name, archive, progress)
        # Extract only expected plain files, never arbitrary archive paths/links.
        with tarfile.open(archive) as bundle:
            for name in ['model.onnx', 'LICENSE', 'README.md']:
                member = bundle.getmember(SEGMENTATION + '/' + name)
                if not member.isfile():
                    raise ValueError('Unexpected model archive entry.')
                target = CACHE / SEGMENTATION / name
                target.parent.mkdir(parents=True, exist_ok=True)
                with bundle.extractfile(member) as src, target.open('wb') as dst:
                    shutil.copyfileobj(src, dst)
    embedding = CACHE / EMBEDDING
    download(RELEASE + 'speaker-recongition-models/' + EMBEDDING, embedding, progress)
    return segment, embedding


def assign_words(words, turns):
    """Assign by actual timestamp overlap; keep ambiguous/unmatched words visible."""
    output = []
    for word in words:
        scores = {}
        for turn in turns:
            overlap = max(0, min(word['end'], turn['end']) - max(word['start'], turn['start']))
            if overlap:
                scores[turn['speaker']] = scores.get(turn['speaker'], 0) + overlap
        ranked = sorted(scores.items(), key=lambda pair: pair[1], reverse=True)
        speaker = ranked[0][0] if ranked else 'unknown'
        uncertain = bool(not ranked or (len(ranked) > 1 and ranked[1][1] > ranked[0][1] * .5))
        if output and output[-1]['speaker'] == speaker and not re.search(r'[.!?]$', output[-1]['text'].strip()) and word['start'] - output[-1]['end'] < 1.2 and word['end'] - output[-1]['start'] < 22:
            row = output[-1]
            row['text'] += word['text']
            row['end'] = word['end']
            row['uncertain'] = row['uncertain'] or uncertain
        else:
            output.append(dict(start=word['start'], end=word['end'], speaker=speaker,
                               text=word['text'], uncertain=uncertain))
    for row in output:
        row['text'] = row['text'].strip()
        row['start'], row['end'] = round(float(row['start']), 2), round(float(row['end']), 2)
    return [row for row in output if row['text']]


def suggest_people(segments):
    people = {}
    # Suggestions come only from explicit introduction text, not voice identity lookup.
    pattern = re.compile(r"\b(?:my name is|i am|i'm)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})(?:[,.]?\s+and\s+(?:i am|i'm)|\s*,)\s+(?:the\s+|a\s+)?([^.!?]{2,65})", re.I)
    for row in segments:
        person = people.setdefault(row['speaker'], dict(id=row['speaker'], name='', role='', suggested=False))
        match = pattern.search(row['text'])
        if match and row['speaker'] != 'unknown' and not person['name']:
            person.update(name=match[1].strip(), role=match[2].strip(' ,'), suggested=True)
    return list(people.values())


def console_progress(message, **details):
    print(message, flush=True)


def process(path, speaker_count=0, progress=console_progress, model_size='base.en'):
    started = time.monotonic()
    from faster_whisper import WhisperModel
    from faster_whisper.audio import decode_audio
    import sherpa_onnx

    progress('Reading the recording on this computer…', stage='reading')
    audio = decode_audio(str(path), sampling_rate=16000)
    duration = len(audio) / 16000
    if duration < 2 or duration > 600:
        raise ValueError('Use a recording between 2 seconds and 10 minutes for this demo.')
    if not 0 <= speaker_count <= 12:
        raise ValueError('Speaker count must be 0 (automatic) through 12.')
    progress('Preparing speaker models…', stage='preparing', duration=duration)
    segment, embedding = models(progress)
    config = sherpa_onnx.OfflineSpeakerDiarizationConfig(
        segmentation=sherpa_onnx.OfflineSpeakerSegmentationModelConfig(
            pyannote=sherpa_onnx.OfflineSpeakerSegmentationPyannoteModelConfig(model=str(segment)), num_threads=2),
        embedding=sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=str(embedding), num_threads=2),
        clustering=sherpa_onnx.FastClusteringConfig(num_clusters=speaker_count if speaker_count else -1, threshold=.5),
        min_duration_on=.3, min_duration_off=.5)
    if not config.validate():
        raise RuntimeError('Speaker models could not be loaded. Remove local-audio/.models and retry the download.')
    progress('Grouping voices across the entire recording…', stage='grouping', fraction=0)
    diarizer = sherpa_onnx.OfflineSpeakerDiarization(config)
    def report(done, total):
        fraction = min(1, done / max(1, total))
        progress(f'Grouping voices: {round(100 * fraction)}%', stage='grouping', fraction=fraction)
        return 0
    turns = [dict(start=float(s.start), end=float(s.end), speaker=f'speaker_{s.speaker + 1}')
             for s in diarizer.process(audio, callback=report).sort_by_start_time()]
    del diarizer
    progress('Loading Whisper ' + model_size + ' (first use downloads a free model)…', stage='preparing')
    model_args = dict(device='cpu', compute_type='int8', cpu_threads=4, download_root=str(CACHE / 'whisper'))
    try:
        model = WhisperModel(model_size, local_files_only=True, **model_args)
    except (OSError, ValueError):
        model = WhisperModel(model_size, **model_args)
    progress('Transcribing the recording…', stage='transcription', fraction=0)
    segments, _ = model.transcribe(audio, beam_size=5, language='en', word_timestamps=True,
                                  vad_filter=True, condition_on_previous_text=False)
    words = []
    for segment in segments:
        words.extend(dict(start=w.start, end=w.end, text=w.word) for w in segment.words or [])
        fraction = min(1, segment.end / duration)
        progress(f'Transcribing: {round(100 * fraction)}%', stage='transcription', fraction=fraction)
    progress('Matching words to speakers and preparing your transcript…', stage='finishing', fraction=0)
    rows = assign_words(words, turns)
    if not rows:
        raise ValueError('No speech was transcribed. Try a clearer recording.')
    return dict(format='team2-audio-v1', filename=Path(path).name, duration=round(duration, 2),
                elapsedSeconds=round(time.monotonic() - started, 2),
                models=dict(transcription='faster-whisper/' + model_size,
                            diarization='sherpa-onnx/pyannote-segmentation-3.0 + NeMo TitaNet small'),
                speakers=suggest_people(rows), segments=rows,
                warning='Automatic transcript and speaker labels need review. Introductions are suggestions, not verified identities.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('audio', type=Path)
    parser.add_argument('--speakers', type=int, default=0)
    parser.add_argument('--output', type=Path, default=Path('audio-results/transcript.json'))
    parser.add_argument('--model', choices=['base.en', 'small.en'], default='base.en')
    args = parser.parse_args()
    result = process(args.audio, args.speakers, model_size=args.model)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2), encoding='utf-8')
    print('Saved ' + str(args.output))
