# Evergreen — INFO 492 Team 2

A static capstone website with functional Demo 1 and Demo 2 tabs. GitHub Pages serves the HTML, CSS, and JavaScript directly. Browser models need no install, build step, API key or paid inference service. Both demos now support the local Qwen 3.5 27B model through a shared companion; browser alternatives remain available.

## Demo 3: document consolidation and task review

[Evergreen Workspace](demo-3/public/client/) is the client entry point for general contractors and subcontractors. See the [workspace guide](demo-3/docs/client-workspace.md) for project roles, the three queued workflows, the Free hosting setup, and the November 11 evaluation.

[Demo 3](https://capstone-team2-demo3.capstone-info-492-team-2.workers.dev/) uses a separate, free Capstone Cloudflare account. Incoming RFI/request documents become proposed tasks, shared groups, duplicate links, evidence-backed answers, or open conflicts. A reviewer approves changes to a persistent board; original text and change history remain available. [Operation and evaluation notes](demo-3/README.md) describe the workflow and its limits.

Open the **Capstone Demo 3** desktop shortcut, or `Open Demo 3.cmd` at the repository root, then select **Turn ON** to process the website queue with local Qwen 3.5 27B. The app opens **Off**. Turning it Off or closing it stops its model and helpers. The website remains available while queued work waits. No paid cloud inference, automatic startup, or permanently running PC process is part of this demo. A new clone requires the [Windows runtime setup](demo-3/docs/setup.txt) and its own pairing; no credentials or model weights are included.

See the [Demo 3 quick start](demo-3/docs/quick-start.txt) and sanitized [consolidation benchmark report](demo-3/docs/consolidation-results.txt) for operation, final V12 synthetic results, limitations, and preserved failures. Benchmark completion is separate from remote deployment verification and does not establish human superiority, RFI reduction, or a learning gain.

## Mid-quarter analysis

**[Read the mid-quarter analysis →](https://anthonyfald.github.io/capstone-grp2/mid-quarter/)**

The completed 28 October 2026 analysis brings together the first two demo comparisons, our interview with Cornerstone project engineer Trent McMorrow, class feedback, personal reflection, and the revised plan for Demos 3 and 4. We are University of Washington Information School students working under **Professor Frank Martinez**.

The demos support narrower information-retrieval and review tasks; they do **not** validate our original 30% RFI-reduction target. Demo 1 reduced preparation time before verification, but did not match manual accuracy. Demo 2’s ten-report comparison showed promising issue coverage; its claimed time reduction remains unverified. Our revised hypothesis tests avoidable RFI submissions and total review time while preserving questions needing formal clarification.

Read in this order:

1. [Where we stand and demo findings](https://anthonyfald.github.io/capstone-grp2/mid-quarter/#findings)
2. [Stakeholder insights](https://anthonyfald.github.io/capstone-grp2/mid-quarter/#interview) and [full interview transcript](https://anthonyfald.github.io/capstone-grp2/mid-quarter/transcript.html) ([TXT](mid-quarter/transcript.txt))
3. [Class feedback and personal reflection](https://anthonyfald.github.io/capstone-grp2/mid-quarter/#reflection), including an [AI-assisted feedback summary](mid-quarter/feedback-summary.md)
4. [Changes to our thesis and workflow](https://anthonyfald.github.io/capstone-grp2/mid-quarter/#adjustments)
5. [Next experiments and evaluation rules](https://anthonyfald.github.io/capstone-grp2/mid-quarter/#next-steps)
6. [Sources and documented contributions](https://anthonyfald.github.io/capstone-grp2/mid-quarter/#resources)

Full artifacts: [completed paper with Appendix A (DOCX)](mid-quarter/mid-quarter-analysis.docx), [live paper](https://docs.google.com/document/d/1Eqvt3zFc2_1ebm7PxlRq8MhTS4HF9y4bMdoyByjlu64/edit), and [presentation with speaker notes](https://docs.google.com/presentation/d/1TkNwcUMK5-fYrf6V7gZWsYC_h88qdyQXfYHnDY0pEQU/edit).

## Project contents

| Material | Demo 1: meeting notes | Demo 2: daily reports |
| --- | --- | --- |
| Working demo | [Open Demo 1](https://anthonyfald.github.io/capstone-grp2/demo-1/) | [Open Demo 2](https://anthonyfald.github.io/capstone-grp2/demo-2/) |
| Code and overview | [README](demo-1/README.md), [app](demo-1/app.js), [note engine](demo-1/note-engine.js) | [README](demo-2/README.md), [app](demo-2/app.js), [engine](demo-2/engine.js) |
| Synthetic data and references | [Input data](demo-1/data/), [reference notes](demo-1/data/reference-notes.json) | [Input data and reference files](demo-2/data/), [data review](demo-2/docs/data-review.md) |
| LLM prompts | [Note-generation prompts](demo-1/note-engine.js) | [Review and verification prompts](demo-2/engine.js) |
| Dependencies and setup | [Dependencies](demo-1/docs/dependencies.txt), [audio setup](demo-1/audio-setup.html) | [Runtime dependencies](demo-2/README.md), [local setup](demo-2/docs/local-setup.md) |
| Evaluation evidence | [Notes evaluation](demo-1/docs/note-quality.txt), [experiment log](demo-1/docs/experiment-log.csv) | [Results](demo-2/docs/results.md), [protocol](demo-2/docs/protocol.md), [retained run files](demo-2/docs/) |

Project-level material: [original thesis](documents/team-2-thesis.docx), [proposal slides](documents/team-2-proposal.pptx), [mid-quarter analysis](mid-quarter/), [stakeholder transcript](mid-quarter/transcript.txt), and [class-feedback summary](mid-quarter/feedback-summary.md).

## Demo 2 on this device

Open [Demo 2](https://anthonyfald.github.io/capstone-grp2/demo-2/) to compare daily construction site updates across dates and trades. The main sample follows the team's supplied **Simulated Daily Reports CSV - Daily Reports.csv**: ten synthetic Room B104 reports. The [sample CSV](demo-2/data/sample-daily-reports.csv) and [sample JSON](demo-2/data/sample-daily-reports.json) contain its 18 report fields; the supplied answer annotations are kept separately and excluded from model inputs. Start with the sample or upload another CSV/JSON export using the [upload guide](demo-2/docs/upload-guide.md).

Select Analyze, review each concern's question and source timeline, then Keep/Correct/Reject it. Repeated candidate concerns are consolidated while their quotations are retained. The suggested status applies only to the question shown: a completed pour does not establish that a missing inspection record or testing task is closed. Download the readable **TXT review** for notes or discussion, the findings CSV for a spreadsheet, or the full JSON for the complete audit record. Model settings and research controls are optional collapsed sections.

Quality takes priority over speed. The installed local Qwen 3.5 27B is preferred when available; 9B and browser 9B/4B are lower-memory alternatives. The revised pipeline selects exact report sentences, reconciles later status and checks uncited passages for missed concerns. It does not generate consequences, new causes or assignments. Grouping and status still require review. RTX 5080 measurements, earlier failures and remaining misses are published in the [results](demo-2/docs/results.md). Apple silicon runtime paths remain supported, but Mac inference was not benchmarked. See [setup](demo-2/docs/local-setup.md) and [protocol](demo-2/docs/protocol.md).

## Demo 1 on Mac and Windows

Demo 1 now prefers **Qwen 3.5 27B**, using the same local companion as Demo 2. Start the companion and open **http://127.0.0.1:4177/demo-1/**, or use `Open Demo 1.cmd` in the current Windows workspace. It extracts decisions, action items, owners, deadlines, schedules and unresolved questions with sources, editing, human review, reference comparisons and exports. The original browser Qwen 3.5 9B model remains an explicit alternative requiring Chrome/Edge with WebGPU. See [setup and comparison protocol](demo-1/local-setup.html).

The selected local notes workflow is v27, with separate scope/cost extraction, source-checked timelines and holds, and question/terminology review. The two-meeting development rescore is 96.7% accuracy and 95.2% completeness under the reconstructed checklist; this is not independent field validation. See [the comparison](demo-1/docs/demo3-rerun.txt) and [tuning record](demo-1/docs/demo3-tuning-round2.txt) for timing, remaining errors and all evaluation limits.

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
- `mid-quarter/`: completed analysis, full interview transcript, feedback summary, and paper download.

All site paths are relative so they work under the `/capstone-grp2/` GitHub Pages project path. Keep the folder structure intact. Existing Pages settings should continue serving the repository root; no backend or new hosting is needed.

Run the checks with Node.js:

```sh
node --test demo-2/tests/*.test.cjs demo-1/tests/*.test.cjs tests/*.test.cjs
node --test demo-3/cloud/tests/*.test.mjs demo-3/engine/*.test.cjs demo-3/runner/*.test.mjs demo-3/public/*.test.mjs demo-3/consolidation-bench/*.test.cjs
```

For a local preview of the entire site on Mac or Windows, run `node scripts/serve.mjs` and open the printed address. No package install is needed. The server only listens on your computer.

See the [demo README](demo-1/README.md) for requirements and experiment instructions. The [data generator](demo-1/scripts/generate-data.cjs), [prompts](demo-1/note-engine.js), [reference notes](demo-1/data/reference-notes.json), and [demo documentation](demo-1/docs/) are included.

## Evaluation boundary

This project is a hypothesis to test. Synthetic records are not actual Evergreen correspondence. Neither completed demo establishes a reduction in real RFIs. The stakeholder interview is evidence about practice, not a controlled evaluation of our tool. Reference annotations authored with Codex assistance need independent team review. The mid-quarter analysis distinguishes the team’s small human comparisons from the broader software-development runs; results and limitations should be read together. See the analysis and demo READMEs for the relevant scope.
