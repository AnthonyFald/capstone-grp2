# Evergreen — INFO 492 Team 2

A static capstone website with a functional Demo 1 tab. GitHub Pages serves the HTML, CSS, and JavaScript directly; no install, build step, API key, or paid inference service is required.

## Demo 1 on Mac and Windows

Open **Demo 1** in the website sidebar. The same page works on Mac and Windows in Chrome or Edge with WebGPU and sufficient GPU memory. No download of this repository, terminal, or local launcher is required for the hosted website.

Click **Load free AI model**, wait for the initial model download (about 5 GB), then generate meeting notes. The app runs the real **Qwen 3 8B** model locally in the visitor's browser through WebLLM. It extracts decisions, action items, owners, deadlines, and unresolved questions. Notes include source lines, editing, human review, reference comparisons, and exports. A separately labeled rule-based mode is available as a baseline, not as evidence of AI performance.

The model download is external; transcript processing stays on the device. No OpenAI account or paid API tokens power this app. Hardware, browser support, download access, and available memory determine whether local AI can run. Do not assume every Mac or PC is compatible.

The GitHub Pages demo URL is https://anthonyfald.github.io/capstone-grp2/demo-1/ . The sidebar, overview, and experiments section all link to it.

## Recorded meetings: optional local companion

Audio transcription and speaker separation run on the device with free CPU models. On Demo 1, expand **Start from a recording** and download the Windows x64 or Apple silicon Mac app. Extract it and open **Evergreen Meeting Demo**; Python and audio libraries are included. Keep the companion open and return to your existing Demo 1 tab, which connects automatically. **Open demo** is an optional button that opens the bundled page in your default browser. The app never launches a browser at startup.

Choose a recorded English MP3/WAV/M4A, review speaker names and roles, and generate notes. Limits are 10 minutes / 80 MB. No paid API, AI account, or GPU is required for the audio stage. The companion listens only on this computer, not your Wi-Fi network; browsers may require website permission to connect to it. See [audio setup](demo-1/audio-setup.html) for permissions, fallback, and first-open help. Exported speaker-transcript JSON can also be imported without the companion.

AI note generation reads discussions in context, writes concise notes with supporting source lines, and checks for answered questions or canceled plans. Owners and deadlines must be present in the cited evidence; human review remains necessary. See [notes evaluation](demo-1/docs/note-quality.txt) for current test scope and limitations.

## Editing and testing

- `index.html`, `styles.css`, `app.js`: the existing documentation website.
- `demo-1/`: the self-contained demo and matching project sidebar.
- `assets/`, `documents/`: existing project rendering and original source documents.

All site paths are relative so they work under the `/capstone-grp2/` GitHub Pages project path. Keep the folder structure intact. Existing Pages settings should continue serving the repository root; no backend or new hosting is needed.

Run the checks with Node.js:

```sh
node --test demo-1/tests/*.test.cjs tests/*.test.cjs
```

For a local preview of the entire site on Mac or Windows, run `node scripts/serve.mjs` and open the printed address. No package install is needed. The server only listens on your computer.

See the [demo README](demo-1/README.md) for requirements and experiment instructions. The [data generator](demo-1/scripts/generate-data.cjs), [prompts](demo-1/note-engine.js), [reference notes](demo-1/data/reference-notes.json), and [demo documentation](demo-1/docs/) are included.

## Evaluation boundary

This project is a hypothesis to test. Synthetic records are not actual Evergreen correspondence. Demo 1 tests meeting documentation; it does not establish a reduction in real RFIs. The reference annotations were authored with Codex assistance and need independent team review. No performance results are assumed. See the demo README for current verification limits.
