# Demo 4 — Evergreen Workspace

Demo 4 extends the [workspace](../demo-3/docs/client-workspace.md) with project roles, shared construction records, and PDF/Word intake for daily report review. The evaluation checks which of 100 synthetic RFI questions can be answered from existing records.

## November 20 results

The RTX 5080 ran Qwen 3.5 27B on **100 RFIs with 200 supporting records** in **20 min 40 sec** of wall time, including model startup and loading. The review itself took **20 min 38 sec** after the local service became available. Both times exclude workbook preparation and human review. All 100 cases returned decisions.

| Expected decision | Answer from records | Formal clarification | Hold for review |
| --- | ---: | ---: | ---: |
| Answer from existing records (60) | 52 | 8 | 0 |
| Formal clarification needed (40) | 0 | 40 | 0 |

- **Decision accuracy:** 92/100 (92%). All 40 necessary RFIs remained on the formal clarification path.
- **Unnecessary formal recommendations:** 8/60 answerable RFIs (13.3%). The other 52 were routed to proposed answers from existing records.
- **Answer evidence:** All 52 proposed answers cited at least one expected source, and 42 cited every expected source. One proposed quotation on an escalation failed exact source validation and was excluded.

In five of the eight unnecessary escalations, the model treated a meeting's lack of a recorded answer as evidence against an answer recorded in a daily report. Two escalations gave too much weight to pending or rough notes, and one overemphasized inconsistent location wording. Some correctly routed drafts left approval conditions out of the explanation even when the exact citation preserved them. Reviewers should check those conditions before acting. The corpus includes recurring question patterns, so these findings describe this synthetic set.

The 30% relative reduction and changes in total review time require a matched manual run on these 100 RFIs. Every evaluation recommendation stayed pending human review.

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

Close another Evergreen model session before running the benchmark. The runner starts a local process for the experiment and stops it when finished. Input preparation, individual batch timings, review wall time, model digest, and input hash are recorded. `rfi-decisions.csv` contains proposals and citations. The scored comparison, original local run audit, and restricted answer key stay in the ignored `desktop-build` directory and out of Git.
