# Team 2 Demo 1 — Assisted Meeting Documentation

A simple, free meeting documentation demo for the capstone website. It accepts a text transcript or a recorded meeting processed by the optional local audio companion. There are no paid inference calls, API keys, or AI accounts. The Codex conversation used to develop the app is separate from the app's operating cost.

## Start from text

Open the website's **Demo 1** tab in Chrome or Edge with WebGPU. Choose a sample or paste text, then click **Load AI & generate notes**. It loads free Qwen 2.5 1.5B (roughly 1 GB on first use) and generates notes automatically. Model files use IndexedDB storage. Interrupted downloads retry automatically, up to three load attempts, reusing completed files; a failed load preserves the transcript and offers a retry. Notes run locally on your GPU. The labeled rules mode is a separate non-AI baseline.

For a local preview, run `node scripts/serve.mjs` from the repository root. The standalone `demo-1/Start Demo.cmd` also serves the demo on Windows. Neither requires an npm installation.

## Start from a recording on Windows or Mac

Download the packaged app from [the latest desktop release](https://github.com/AnthonyFald/capstone-grp2/releases/latest). Python and the audio libraries are included. No terminal commands or Python installation are needed.

- Windows x64: Extract All, open the extracted folder, then double-click **Evergreen Meeting Demo.exe**. Keep its _internal folder beside it.
- Apple silicon Mac (M-series): unzip, move **Evergreen Meeting Demo.app** to Applications, and open it. Intel Macs are not supported.

Keep the small companion window open. It opens the local demo in installed Chrome or Edge when available. Expand **Start from a recording**, choose an English MP3/WAV/M4A/OGG/FLAC, set the speaker count if known, and process it. Current limits: 10 minutes and 80 MB. Start with a 1–5 minute recording. Base is faster; Small is larger. First use downloads free model files.

During processing, the app shows percentage, elapsed time and an estimated minutes:seconds countdown. Estimates adjust to progress and prior successful runs in the same session. Model downloads have separate estimates. **Audio completed in…** measures receipt of the local file through the finished transcript, including model setup. **Notes completed in…** measures the generation request through finished notes; automatic model setup is broken out separately. Human review time is not included. Independent model loading before clicking Generate is outside that note run.

Audio uses the CPU; browser notes need WebGPU and sufficient GPU memory. These are unsigned student builds: Windows or macOS may need one-time first-open approval. The setup page explains the platform prompts. Windows ARM is not supported. Packaged-app test reports accompany releases; a teammate should still check a full browser workflow on the presentation computer.

For introductions, use "My name is Maya and I'm the general contractor." Let each person speak separately. The app suggests names and roles from explicit introduction wording. Review those suggestions, listen to timestamped turns, correct text or speaker assignments, and click **Use reviewed transcript for notes**. Export the speaker JSON to reopen it on the hosted website without installing audio tools there.

See [audio setup](audio-setup.html) for the full instructions. The GitHub-hosted static website does not run Python itself; the companion serves the same interface on your computer.

## How processing works

1. PyAV decodes the selected file to mono 16 kHz audio locally.
2. sherpa-onnx combines pyannote segmentation with NeMo TitaNet speaker embeddings and clusters voices across the recording. Labels are anonymous and may be wrong; this is not identity verification.
3. faster-whisper produces English text and word timestamps on the CPU. Words are aligned with speaker intervals. Overlap/unmatched words are flagged. Sentence boundaries become editable turns.
4. A small set of explicit introduction patterns suggests names and roles. This step is rules, not another model. Users can correct labels and every turn.
5. Qwen classifies each transcript line as decision, action, unresolved question, or none. The app copies the selected source wording into the notes instead of letting the small model rewrite facts. Simple source patterns fill explicit owners and deadline phrases for single-commitment turns. Missing or ambiguous fields remain blank. This is an AI-assisted extraction pipeline, not entirely LLM-generated prose.
6. Review and edit notes, then export plain text (.txt), Markdown (.md), or JSON. The plain-text file separates decisions, action items (including owners and deadlines), open questions, and source references; it includes current saved corrections and review status. The rules-only mode remains separately labeled.

Use one sentence or short speaker turn per line. Input is capped at 24,000 characters; AI classifies each turn separately and can miss context across turns. One line may receive only one category, so split mixed-topic turns. A line over 3,000 characters must be split. Models can miss, misclassify, or mishear content. Even a real source quote can be classified incorrectly.

## Local data and cost

First use downloads public models; recordings and transcripts are not sent to an inference service. Model packages are downloaded from public GitHub/Hugging Face/CDN sources. Packaged audio caches live under `%LOCALAPPDATA%/Evergreen Meeting Demo/.models` on Windows or `~/Library/Application Support/Evergreen Meeting Demo/.models` on Mac (source launchers use `local-audio/.models`); recordings get a temporary local copy that is deleted after processing. A forced shutdown can leave a temporary file in `.audio-temp`. The most recent audio transcript remains in server memory until the launcher stops. The browser stores no notes automatically; export before closing or reloading. Exported files remain wherever you save them.

The companion only binds to 127.0.0.1, rejects foreign origins/hosts, and requires a session token for audio submissions. There are no external completion endpoints or fallbacks to paid services. Git ignores caches, virtual environments, temporary audio, and runtime output folders. Do not commit private recordings or transcripts.

## Test the thesis honestly

Demo 1 tests accurate documentation as a step toward reducing avoidable RFIs. It does **not** establish a 30% reduction in real RFIs. Proposed targets are 25% less preparation time and 20% fewer missed details, without more incorrect details.

Collect independent manual notes and record manual preparation, audio processing, transcript correction, note processing, and note review time. The built-in timing comparison covers note processing plus the review time you enter; for audio experiments include transcription and transcript correction in the overall experiment log. Report one-time setup/download separately. Source/category matches are navigation aids, not automatic accuracy scores. Original system output and reviewed notes are exported separately.

Two synthetic text meetings and a single-speaker synthetic audio sample are included. They are not real Evergreen correspondence. Reference checklists were authored with Codex assistance and need independent team review. A single-speaker sample verifies transcription and introductions; it cannot validate multi-speaker accuracy. See `docs/verification.json` for development checks and limits.

## Reproduce

- `ai-worker.js`: actual classification prompt, schema and inference configuration.
- `core.js`: source-backed notes, explicit metadata patterns, comparisons and exports.
- `local-audio/processor.py`: model selection, voice clustering, word alignment, introduction suggestions; also usable as a CLI.
- `local-audio/requirements.txt`: pinned primary audio dependencies.
- `scripts/generate-data.cjs`: deterministic text scenarios and starter references.
- `scripts/generate-audio-sample.ps1`: Windows offline speech synthesis for the fictional audio sample.
- `docs/`: demo note, walkthrough, experiment log, contribution template and dependency notes.

From the repository root:

```sh
node --test demo-1/tests/*.test.cjs tests/*.test.cjs
python -m unittest discover -s demo-1/local-audio -p "test_*.py"
```

Use your installed Python environment for the Python command. The tests do not download models or call paid APIs. CLI example, from `demo-1`: `local-audio/.venv/bin/python local-audio/processor.py meeting.mp3 --speakers 3 --output audio-results/transcript.json` (Windows uses `local-audio\.venv\Scripts\python.exe`).

## Build desktop packages

On the target OS with Python 3.12, install desktop/requirements-build.txt and run desktop/build.py --audio-test from this folder. PyInstaller bundles the runtime, libraries, licenses and public website files. Models and private recordings are excluded. Output is in the ignored desktop-build directory at repository root.

The GitHub workflow uses standard public-repository Windows x64 and macOS arm64 runners. It releases both ZIPs together only after each actual bundled executable passes GUI-runtime, server, transcription and diarization checks. No paid inference API is used. Source-only development launchers remain available: Start Audio Demo.cmd on Windows and Start Audio Demo.command on Mac, with Python 3.12 installed.

## Sources

- https://github.com/SYSTRAN/faster-whisper
- https://k2-fsa.github.io/sherpa/onnx/speaker-diarization/models.html
- https://opennmt.net/CTranslate2/installation.html
- https://webllm.mlc.ai/docs/user/get_started.html
- https://huggingface.co/mlc-ai/Qwen2.5-1.5B-Instruct-q4f16_1-MLC
- Supplied Team 2 final thesis, thesis slides, and Demo 1 assignment. Fictional scenarios must not be attributed to real contractors.
