# Evergreen Field Office · INFO 492 Team 2

We studied whether a concrete flooring subcontractor could use existing construction records to answer a question before submitting a request for information (RFI). The May 2024 water damage during the Evergreen High School replacement project motivated our case. The experiments use synthetic records. Our Week 2 target was 30% fewer unnecessary RFIs while preserving questions that need formal clarification.

**Final assessment.** The small matched Demo 3 comparison met the target. One unnecessary recommendation across two manual reviews accounts for the entire difference. Demo 4 correctly routed 92 of 100 synthetic RFIs and escalated all 40 that needed clarification. Its 52 proposed answers out of 60 answerable cases measure recognition of existing answers. A matched manual review of those 100 cases is still needed to estimate a reduction. The project did not measure submissions on an active construction site.

[Final paper and individual contributions](https://docs.google.com/document/d/1L6IZAQRwA88hgFA1sjHMe4LLFTYQSffalDDJ4wtfV8A/edit) · [Final presentation with speaker notes](https://docs.google.com/presentation/d/1AA3uGYlsSEzDDn87RPepBazs-ET2jnTyUYBjwOjvhhk/edit) · [Open Field Office for Demo 5](https://capstone-team2-demo3.capstone-info-492-team-2.workers.dev/client/). Google Drive materials use their existing team permissions.

## Experiments and evidence

| Activity | Inputs, method, and implementation | Outcome and evidence |
| --- | --- | --- |
| RFI Lab · concrete removal | A flooring subcontractor drafts SUB-RFI-001 from Change Order 1, identifies six questions and asks the GC for written clarification. This was a written classroom exercise. | [Lab case and questions](documents/rfi-lab.md). No model run or scored comparison. |
| Demo 1 · meeting notes | Two synthetic meetings. Compare the decisions, owners and deadlines in manual and AI drafts. [Transcripts and references](demo-1/data/), [note prompts](demo-1/note-engine.js), [local model implementation](demo-1/native-engine.cjs), [dependencies](demo-1/docs/dependencies.txt). | Manual preparation totaled 60 minutes, AI preparation 27 min 31 sec, before verification. Average accuracy was about 92% manually and 88% with AI. [Class comparison](https://anthonyfald.github.io/capstone-grp2/mid-quarter/#findings) and [later development evaluation](demo-1/docs/demo3-rerun.txt). |
| Demo 2 · daily reports | Compare ten Room B104 reports across dates and trades, keeping facts and approval status separate. [Reports and reference files](demo-2/data/), [prompts and engine](demo-2/engine.js), [dependencies and local setup](demo-2/docs/local-setup.md). | The AI covered 12 of 12 expected issue categories. Two people covered 11 and 7. The recorded 209-second timing has inconsistent workload descriptions. [Class analysis](https://anthonyfald.github.io/capstone-grp2/mid-quarter/#findings), [protocol](demo-2/docs/protocol.md), [broader development runs](demo-2/docs/results.md). |
| Demo 3 · RFI and task review | Two manual runs and one agent run on the same 12 synthetic RFIs, 12 daily reports and 12 meeting records. The board also tests linking duplicates and retaining separate requirements. [Team evaluation files](https://drive.google.com/drive/u/0/folders/1DylOdzVVKradyALoZTsUbsNuDVLUvxWp), [model prompts and logic](demo-3/engine/consolidation-engine-v12.cjs), [software benchmark inputs](demo-3/consolidation-bench/), [setup](demo-3/docs/setup.txt). | Manual average and agent each scored 11/12. On five answerable cases, unnecessary recommendations averaged 0.5 manually versus 0 for the agent. Reported review time was 53.7 versus 15 minutes. [Class write-up and slides](documents/demo-3/). [Separate engineering benchmark](demo-3/docs/consolidation-results.txt). |
| Demo 4 · RFI routing and project roles | The batch evaluation gave each RFI one linked daily report and one linked meeting record. [Synthetic input workbook](https://docs.google.com/spreadsheets/d/1yKYOxtbT1sxFzX4OSsmwz4J4Z-9zsDFg/edit), [workbook preparation](demo-4/evaluation/prepare.py), [model prompt and runner](demo-4/evaluation/run.mjs), [scoring](demo-4/evaluation/score.mjs). Requires Node.js, Python with openpyxl and the local Qwen runtime. The team's restricted answer key is used only after model inference. | 52/60 answerable cases received a proposed answer and 8/60 were escalated. All 40/40 necessary RFIs were escalated. Wall time was 20 min 40 sec, excluding workbook preparation and human review. [Full results and reproduction steps](demo-4/README.md). |
| Demo 5 · final live walkthrough | The [Field Office workspace](https://capstone-team2-demo3.capstone-info-492-team-2.workers.dev/client/) brings the earlier workflows together. [Client code](demo-3/public/client/), [role and workflow guide](demo-3/docs/client-workspace.md), [hosted service](demo-3/cloud/), [local runner](demo-3/runner/). | The presenter inspects a previously completed synthetic case in the live interface. This illustrates how a reviewer checks a draft. It adds no separate experimental result. |

## Final live demo

Allow about two minutes. Before class, sign in to the team's test project and locate the completed D-24 door-opening draft in the review queue. Open the request, expand its source evidence, and compare the 910 mm width with the cited door schedule for the Mezzanine M2 west service vestibule. Check the revision and location. Show where the reviewer can accept the draft or request changes. A distinct firestop question still needs its own direction. Slide 7 includes the captured synthetic draft if the classroom connection is unavailable.

## Hosting and model operation

GitHub Pages serves the early demos and documentation. Field Office uses a Cloudflare Worker and D1 for the website, project records, queue, and review history. The hosted website remains available while the project PC is off. Local inference runs on the paired PC with Qwen 3.5 27B only while an operator turns on the Capstone desktop app. The earlier background processes were stopped on November 2. Queued requests wait when the runner is off. The hosted queue is distinct from a continuously running model. [Hosting history and limits](demo-3/README.md) · [Operator quick start](demo-3/docs/quick-start.txt) · [Cloud implementation and dependencies](demo-3/cloud/package.json).

## Stakeholder evidence and individual contributions

Trent McMorrow, a Cornerstone project engineer on Evergreen, described checking questions against current specifications and drawings and obtaining formal direction when needed. The owner prohibited meeting recording and AI note-taking. His Demo 3 feedback informed the seven project roles and wider document intake. He was unavailable for a separate Demo 4 review. [Complete mid-quarter interview transcript](mid-quarter/transcript.txt) · [Demo 3 feedback and class write-up](documents/demo-3/) · [Demo 4 team write-up](https://docs.google.com/document/d/1v4Z8Bvm4umAvvBgWZIEXXZ9aep784Qf_4SgA0chEvv0/edit).

| Student | Section | Documented contribution |
| --- | --- | --- |
| Anthony Faldetta | Software and model evaluation | Built the agents and interfaces, integrated local drafting, added role-based access and document intake, and ran the Demo 4 evaluation. |
| Crystal Doan Tran | Evaluation and synthetic data | Prepared manual notes, developed and analyzed evaluations, and created the synthetic Demo 4 records and answer key. |
| Haohao Li | Manual review and documentation | Prepared manual notes, reviewed daily reports and Demo 3 cases, documented Demo 4, and supported evaluation planning. |
| Cole Wieland | Scenario development and stakeholder research | Created meeting transcripts, recorded sample audio, contributed to human testing, and coordinated stakeholder interviews and feedback. |

## Demo 4: workspace roles and RFI evaluation

Field Office adds project roles, a shared area for construction documents, tasks and schedule, and PDF/Word intake for daily reports. See the [Demo 4 guide](demo-4/README.md) for the 100-RFI synthetic evaluation and how to reproduce it locally.

## Demo 3: document consolidation and task review

[Field Office](https://capstone-team2-demo3.capstone-info-492-team-2.workers.dev/client/) is the live workspace for general contractors, subcontractors, and architects. See the [workspace guide](demo-3/docs/client-workspace.md) for project roles, the three queued workflows, and how to run it locally.

[Demo 3](https://capstone-team2-demo3.capstone-info-492-team-2.workers.dev/) uses a separate, free Capstone Cloudflare account. Incoming RFI/request documents become proposed tasks, shared groups, duplicate links, evidence-backed answers, or open conflicts. A reviewer approves changes to a persistent board; original text and change history remain available. [Operation and evaluation notes](demo-3/README.md) describe the workflow and its limits.

Open the **Capstone Demo 3** desktop shortcut, or `Open Demo 3.cmd` at the repository root, then select **Turn ON** to process the website queue with local Qwen 3.5 27B. The app opens **Off**. Turning it Off or closing it stops its model and helpers. The website remains available while queued work waits. No paid cloud inference, automatic startup, or permanently running PC process is part of this demo. A new clone requires the [Windows runtime setup](demo-3/docs/setup.txt) and its own pairing; no credentials or model weights are included.

See the [Demo 3 quick start](demo-3/docs/quick-start.txt) and sanitized [consolidation benchmark report](demo-3/docs/consolidation-results.txt) for operation, final V12 synthetic results, limitations, and preserved failures. Benchmark completion is separate from remote deployment verification and does not establish human superiority, RFI reduction, or a learning gain.

## Mid-quarter analysis (October 28)

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

The following limits apply to the first two experiments. Synthetic records are not actual Evergreen correspondence. Neither completed demo establishes a reduction in real RFIs. The stakeholder interview is evidence about practice, not a controlled evaluation of our tool. Reference annotations authored with Codex assistance need independent team review. The mid-quarter analysis distinguishes the team’s small human comparisons from the broader software-development runs; results and limitations should be read together. See the analysis and demo READMEs for the relevant scope.
