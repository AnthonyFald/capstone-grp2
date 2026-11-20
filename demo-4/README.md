# Demo 4 — Evergreen Workspace

Demo 4 extends the [workspace](../demo-3/docs/client-workspace.md) with project roles, shared construction records, and PDF/Word intake for daily report review. The evaluation checks which of 100 synthetic RFI questions can be answered from existing records.

## Synthetic RFI evaluation

The upload workbook supplies 100 RFIs, 100 daily reports, and 100 meeting transcripts. Every RFI identifies a daily report and a meeting transcript. The evaluation presents those two linked records to Qwen 3.5 27B, in groups of five independent questions, through Evergreen's existing local model adapter. This is a batch evaluation of RFI routing. The workspace's interactive document-to-board tool uses a separate consolidation workflow.

The reviewer proposes using an existing documented answer, seeking formal clarification, or keeping the question open for human review. The runner checks that citations match exact passages in that RFI's linked records. The synthetic reports and transcripts stand in for the approval records they explicitly describe. Exact text matches alone do not establish that an answer is correct or authorize work.

The restricted ground truth is held separately and used only after inference. We report both exact decisions and rubric-compatible routing. In the latter measure, deferring a necessary RFI for human review keeps it open and counts as an acceptable route. We also count unnecessary formal recommendations, incorrectly bypassed necessary RFIs, and citations to the expected answer document. No official RFI is submitted or resolved by this run.

The 30% target requires a manual review of these same records under the same rubric. Model runtime excludes human verification, so a total review time improvement also requires matched measurement.

## Reproduce locally

From the repository root, with Node.js, Python with `openpyxl`, and the [local model setup](../demo-3/docs/setup.txt):

```text
python demo-4/evaluation/prepare.py PATH_TO_TEAM_ZIP desktop-build/demo4/reproduction
node demo-4/evaluation/run.mjs --run-local desktop-build/demo4/reproduction/inputs desktop-build/demo4/reproduction/run
node demo-4/evaluation/score.mjs desktop-build/demo4/reproduction/run desktop-build/demo4/reproduction/ground-truth.restricted.json
```

Close another Evergreen model session before running the benchmark. The runner starts a local process for the experiment and stops it when finished. Input preparation, individual batch timings, review wall time, model digest, and input hash are recorded. The decisions, quotes, and scoring export stay in the ignored `desktop-build` directory together with the original local run audit. Keep the source archive and restricted answer key out of Git.
