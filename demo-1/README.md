# Team 2 Demo 1 — Assisted Meeting Documentation

A simple, free meeting documentation demo for the capstone website. It accepts a text transcript or a recorded meeting processed by the optional local audio companion. There are no paid inference calls, API keys, or AI accounts. The Codex conversation used to develop the app is separate from the app's operating cost.

## Start from text

Open the website's **Demo 1** tab in Chrome or Edge with WebGPU. Choose a sample or paste text, then click **Load AI & generate notes**. It loads free Qwen 3.5 9B (about 5 GB on first use) and generates notes automatically. Model files use IndexedDB storage. Interrupted downloads retry automatically, up to three load attempts, reusing completed files; a failed load preserves the transcript and offers a retry. Notes run locally on your GPU. This replaces the previous Qwen 3 8B notes model; 16 GB or more system memory and sufficient GPU memory are recommended. Performance varies by device; the evaluation process and limitations are in `docs/note-quality.txt`. The labeled rules mode is a separate non-AI baseline.

For a local preview, run `node scripts/serve.mjs` from the repository root. The standalone `demo-1/Start Demo.cmd` also serves the demo on Windows. Neither requires an npm installation.

## Start from a recording on Windows or Mac

Download the packaged app from [the latest desktop release](https://github.com/AnthonyFald/capstone-grp2/releases/latest). Python and the audio libraries are included. No terminal commands or Python installation are needed.

- Windows x64: Extract All, open the extracted folder, then double-click **Evergreen Meeting Demo.exe**. Keep its _internal folder beside it.
- Apple silicon Mac (M-series): unzip, move **Evergreen Meeting Demo.app** to Applications, and open it. Intel Macs are not supported.

Keep the small companion window open. Return to your existing Demo 1 tab; it connects automatically, including when the app starts after the page. The app opens a page only when you click **Open demo**, using your default browser. The connection protocol works across browsers, but some Safari/WebKit versions block the published HTTPS page from contacting the HTTP loopback service. In those versions, use **Open demo** for the bundled local page. AI notes still need a compatible WebGPU browser. Expand **Start from a recording**, choose an English MP3/WAV/M4A/OGG/FLAC, set the speaker count if known, and process it. Current limits: 10 minutes and 80 MB. Start with a 1–5 minute recording. Whisper Small is the accuracy default; Base is the faster option. Optional names and terminology provide spelling hints without replacing the transcript. First use downloads free model files.

During processing, the app shows percentage, elapsed time and an estimated minutes:seconds countdown. Estimates adjust to progress and prior successful runs in the same session. Model downloads have separate estimates. **Audio completed in…** measures receipt of the local file through the finished transcript, including model setup. **Notes completed in…** measures the generation request through finished notes; automatic model setup is broken out separately. Human review time is not included. Independent model loading before clicking Generate is outside that note run. Note generation has no elapsed-time cutoff and continues until completion, cancellation, or an error. A live minutes:seconds timer runs during note generation, separately from model loading. Audio processing time remains available in the completion summary and exports.

Audio uses the CPU; browser notes need WebGPU and sufficient GPU memory. These are unsigned student builds: Windows or macOS may need one-time first-open approval. The setup page explains the platform prompts. Windows ARM is not supported. Packaged-app test reports accompany releases; a teammate should still check a full browser workflow on the presentation computer.

For introductions, use "My name is Maya and I'm the general contractor." Let each person speak separately. The app suggests names and roles from explicit introduction wording. Review those suggestions, listen to timestamped turns, correct text or speaker assignments, and click **Use reviewed transcript for notes**. Export the speaker JSON to reopen it on the hosted website without installing audio tools there.

See [audio setup](audio-setup.html) for the full instructions. The GitHub-hosted static website connects to the companion on this computer for audio processing. The companion also serves a bundled local page as a fallback. Browser permissions can block the hosted-to-loopback connection; the setup page explains how to reconnect or use Open demo.

## How processing works

1. PyAV decodes the selected file to mono 16 kHz audio locally.
2. sherpa-onnx combines pyannote segmentation with NeMo TitaNet speaker embeddings and clusters voices across the recording. Labels are anonymous and may be wrong; this is not identity verification.
3. faster-whisper produces English text and word timestamps on the CPU. Words are aligned with speaker intervals. Overlap/unmatched words are flagged. Sentence boundaries become editable turns.
4. A small set of explicit introduction patterns suggests names and roles. This step is rules, not another model. Users can correct labels and every turn.
5. Qwen 3.5 9B reads the complete meeting separately for follow-ups, scope/decisions, project milestones and unanswered questions. Long turns are split for extraction while source links still point to the original transcript. Potential commitments receive an explicit review; implicit commitments can be added too. Spoken coordination is separated into review candidates without changing the source words, so one job’s deadline is less likely to attach to its neighbor. Each non-schedule draft receives an additional check of its operation, object, owner, date and wording against the original transcript. Stable claim IDs keep the checks separate; a model duplicate label cannot delete notes. Each milestone receives a separate source check that can correct its draft label and select prerequisite evidence. Selected dependency wording is retained across speakers and topics, including resource requirements without a date. The model is instructed to use clearer mentions in the same meeting for garbled terms or flag uncertainty; no replacement dictionary or outside inference is used. These checks can still omit or misinterpret facts. Unique short/full speaker names are matched from cited evidence; ambiguous identities stay unassigned, and companies are not replaced with their managers. These checks improve extraction and provenance, but do not prove semantic correctness or change model weights.
6. Review and edit notes, then export plain text (.txt), Markdown (.md), or JSON. The plain-text file separates decisions, schedules and dependencies, action items (including owners and deadlines), open questions, and source references; it includes current saved corrections and review status. The rules-only mode remains separately labeled.

Use one sentence or short speaker turn per line. Input is capped at 24,000 characters and 3,000 characters per turn. Each model pass receives the complete meeting so late answers and cancellations remain visible. The model reads all topics instead of filtering input to phrase-matched action candidates. There is also a limit of 30,000 UTF-8 bytes; generation allows up to 12 notes per category and 36 notes overall. Inputs that exceed the model space fail instead of silently discarding the ending. Notes link to all cited source turns. Generated summaries can still omit details, misread context, or assign the wrong owner or date; valid citations alone do not prove a note is accurate. Correct transcription errors before generating notes. The unchanged rules mode is intentionally a simpler comparison baseline.

## Local data and cost

First use downloads public models; recordings and transcripts are not sent to an inference service. Model packages are downloaded from public GitHub/Hugging Face/CDN sources. Packaged audio caches live under `%LOCALAPPDATA%/Evergreen Meeting Demo/.models` on Windows or `~/Library/Application Support/Evergreen Meeting Demo/.models` on Mac (source launchers use `local-audio/.models`); recordings get a temporary local copy that is deleted after processing. A forced shutdown can leave a temporary file in `.audio-temp`. The most recent audio transcript remains in server memory until the launcher stops. The browser stores no notes automatically; export before closing or reloading. Exported files remain wherever you save them.

The companion only binds to 127.0.0.1, rejects foreign hosts and origins except the exact published site origin (`https://anthonyfald.github.io`) on its audio API, and requires a session token for audio submissions, status, and browser heartbeats. Browser heartbeats identify an open Demo 1 page without inspecting browser tabs or launching a browser. No LAN discovery is performed. Browsers may require website permission to reach loopback; macOS LAN-device access is not required for this loopback-only service. There are no external completion endpoints or fallbacks to paid services. Git ignores caches, virtual environments, temporary audio, and runtime output folders. Do not commit private recordings or transcripts.

## Test the thesis honestly

Demo 1 tests accurate documentation as a step toward reducing avoidable RFIs. It does **not** establish a 30% reduction in real RFIs. Proposed targets are 25% less preparation time and 20% fewer missed details, without more incorrect details.

Collect independent manual notes and record manual preparation, audio processing, transcript correction, note processing, and note review time. The built-in timing comparison covers note processing plus the review time you enter; for audio experiments include transcription and transcript correction in the overall experiment log. Report one-time setup/download separately. Source/category matches are navigation aids, not automatic accuracy scores. Original system output and reviewed notes are exported separately.

Two synthetic text meetings and a single-speaker synthetic audio sample are included. They are not real Evergreen correspondence. Reference checklists were authored with Codex assistance and need independent team review. A single-speaker sample verifies transcription and introductions; it cannot validate multi-speaker accuracy. See `docs/note-quality.txt` for the current notes evaluation process and `docs/verification.json` for historical audio and browser checks.

## Reproduce

- `note-engine.js`: contextual extraction prompt, final-output validation, source matching, and inference pipeline.
- `ai-worker.js`: local model loading and worker messages.
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

On the target OS with Python 3.12, install desktop/requirements-build.txt and run desktop/build.py --audio-test from this folder. PyInstaller bundles the runtime, libraries, licenses and public website files. The certifi CA bundle is explicitly included and the speaker-model downloader uses it with certificate and hostname verification enabled. Models and private recordings are excluded. Output is in the ignored desktop-build directory at repository root.

The GitHub workflow uses standard public-repository Windows x64 and macOS arm64 runners. It releases both ZIPs together only after each actual bundled executable passes GUI-runtime, server, HTTPS download with empty system certificate paths, transcription and diarization checks. Pull requests run the same checks without publishing a release. No paid inference API is used. Source-only development launchers remain available: Start Audio Demo.cmd on Windows and Start Audio Demo.command on Mac, with Python 3.12 installed.

## Sources

- https://github.com/SYSTRAN/faster-whisper
- https://k2-fsa.github.io/sherpa/onnx/speaker-diarization/models.html
- https://opennmt.net/CTranslate2/installation.html
- https://webllm.mlc.ai/docs/user/get_started.html
- https://huggingface.co/mlc-ai/Qwen3.5-9B-q4f16_1-MLC
- Supplied Team 2 final thesis, thesis slides, and Demo 1 assignment. Fictional scenarios must not be attributed to real contractors.
