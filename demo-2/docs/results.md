# Demo 2 results and limitations

Demo 2 reviews daily construction reports entirely on device. The accuracy revision uses core `daily-reports-v17` and prompt `daily-review-17-extractive`, with native Qwen 3.5 27B as the quality-focused default. The selected 27B profile meets the pre-set synthetic pilot gates in these observations, with important omissions and repeated suggestions still present. This is an assisted-review prototype; source selection, concern grouping and suggested status still require review.

See the [results page](../research.html), [comparison data](evaluation-summary.csv), [retained predictions](final-trials.json), [annotations](scoring.json) and [evaluation protocol](protocol.md). Semantic scores are provisional Codex-assisted judgments, not independent human validation.

## Current measured results

| Profile / case | Runs | Fully found | Partial | Unsupported | Duplicates | Processing |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Native 27B, uploaded sample A | 1 | 11/12 | 1 | 0 | 7 | 615.1 s |
| Native 27B, B | 1 | 7/8 | 0 | 0 | 5 | 277.9 s |
| Native 27B, routine C | 1 | Undefined: zero references | 0 | 0 | 0 | 13.1 s |
| Native 27B, development D | 1 staged | 8/9 | 1 | 0 | 6 | Not a continuous latency observation |
| Native 27B, routine E | 1 | Undefined: zero references | 0 | 0 | 0 | 34.4 s |
| Native 27B, fresh F | 1 | 7/8 | 1 | 0 | 7 | 504.0 s |
| Experimental browser 4B, routine C | 1 | Undefined: zero references | 0 | 4 | 0 | 14.3 s |

All rows use core-v17/prompt-v17; native rows use native-sampling-3, non-thinking, seed 42. A is an actual CSV upload, analysis and downloaded JSON through the app. Its original dataset ID remains custom; research alias A was added only after exact normalized-input/hash equality. The original UI export is retained separately.

The default still misses A's explicit strength-test follow-up, B's delivery rescheduling, part of D's postponement-to-physical-completion history, and F's explicit trade receipt acknowledgements. Duplicate suggestions impose real review work: A returns 18 cards including seven duplicates; F returns 16 including seven duplicates. Zero unsupported distinct native findings under the provisional rubric is **not 100% overall accuracy**. In particular, A's narrower progress-gate variants are treated as duplicate progress findings, not proof of separate reinforcement inspection acceptance; annotations explain that scope judgment.

The current 4B compatibility run completed, but failed the quality control by turning routine accepted work into four alerts. It is explicitly experimental and not recommended for accuracy. Do not combine that failure with the 27B controls or imply that all model choices pass.

A single per-case observation is **n = 1**; it cannot establish a stable latency distribution, reliability rate or statistical significance. Seeded repetitions and repeated scoring of the same prediction do not create independent test cases.

The selected manifest in [evaluation-files.json](evaluation-files.json) determines which raw runs enter the derived table. Staged replays reuse earlier responses and perform new steps locally; they are development quality checks and are excluded from continuous latency summaries. Setup/model loading is recorded separately from inference, and earlier model downloads are not silently included as measured first-use time.

## Why the earlier release failed

The deployed core-v8/prompt-v8 native 9B condition fully found **4/12** A issues with **five unsupported findings**, and **3/8** B issues with **two unsupported findings**. It could cite a real report while adding an unsupported transmission time, delivery cause, document reconciliation or cure-completion claim. A citation to an existing field did not establish that the field supported the generated assertion.

A separate validation bug accepted an omitted quote, filled it from the original field, then rejected that same short quote on a second validation pass. A seven-character RFI reference triggered a global rewrite that lost useful coverage. Short-citation idempotence now has a regression test. Later development also showed that repeated summarization and focused draft rewrites could discard earlier opposing accounts, historical delays or remaining closeout work even when every surviving quote was exact. All original errors and failed attempts remain visible in the [development log](development-log.json) and retained raw files.

## What changed

The revised method inventories original source sentences, including dates and report authors. The model names a narrow internal review question and selects source IDs. Coverage checks inspect uncited passages and explicit remaining tasks; separate source-only scans retrieve historical work/delivery changes and opposing inspection/release accounts. Materiality checks distinguish actual problems, historical disruptions and remaining tasks from routine completed events, while preserving existing source context for supported concerns. Conflicting exact duplicates receive bounded source-based adjudication; unresolved conflicts or invalid pointers reject the result.

Displayed factual text consists of original dated passages. The app does not generate new causes, downstream impacts, assignments or deadlines. **Exact quotation is a grounding safeguard, not proof of a correct review.** A wrong status, unrelated grouping, omitted resolution or routine-work alert still fails semantic scoring.

The native default is Qwen 3.5 27B, which uses system RAM as well as the RTX 5080's GPU memory. Lower-memory 9B and browser 9B/4B alternatives remain available. Model, runtime, prompt method and sampling configuration changed during development; improved results cannot be causally attributed to model size or any single change. Actual configuration, model digest, seed and per-pass usage/timing remain in exported JSON.

## Data and evaluation limits

The collection contains **40 synthetic reports and 37 reference concerns** across A–F. A, B and D informed development. C and E are narrow routine-work controls. F was authored by a separate agent with inherited project context and references withheld from the implementing agent before a recorded freeze. Its earlier canceled attempt produced no completed evaluation observation. That separation does not make F an independent human-authored or human-validated holdout. See [data review](data-review.md) and [case provenance](new-case-provenance.md).

Score untouched original predictions before corrections. Fully found requires the material concern, correct latest supported state and supporting evidence; partials count as misses. A useful finding containing a material false claim is unsupported under the whole-finding rule. Duplicates are counted separately. Recall counts reference concerns, while precision counts distinct output findings, so their denominators differ. Zero-reference controls have undefined recall; report their false alarms as raw counts. Independent team adjudication remains outstanding.

The preset A gate remains at least 10/12 fully found with at most one unsupported finding; B requires at least 6/8, D at least 8/9, and C/E zero false alarms. The selected 27B profile meets those gates and F's pre-frozen 7/8 target in the recorded observations. The 4B control fails. These are small pilot acceptance criteria, not a general accuracy guarantee.

No controlled human productivity study was conducted. **H1 remains untested:** the targets of 25% lower total assisted time, 20% fewer missed issues and no additional false alarms require actual human-only and assisted observations, including verification/correction time. Inference latency cannot substitute for those observations. H3's original four-subject comparison was superseded by this method; revised comparisons are descriptive. Earlier H4 browser timing observations do not establish the current workflow's relative speed or usefulness. Quality has no maximum-latency acceptance threshold.

Measured inference uses the RTX 5080. Apple silicon browser/local-runtime compatibility is retained, but no Mac inference benchmark was conducted. The user's approximate Demo 1 times of 14 minutes on M1 Max and one minute on RTX 5080 are contextual observations, not a controlled hardware comparison. The [environment record](environment.json) preserves hardware and native model digests; earlier browser weight repository revisions were not captured, limiting exact reproduction.

## Evidence for the later write-up

Use the retained original predictions, reference judgments, errors and failures together. Keep corrected findings and human timing separate. The [collection guide](collection-guide.md) and blank human-study template support a later independent review with calibrated unseen cases; unmeasured participant fields remain blank. [Verification](verification.json) records software-check scope. Unit tests exercise source validation, exports and workflow guards; actual retained model runs establish observed quality. Supplied documents and presentation slides have not been rewritten, and private source recordings/documents or model binaries are not republished.
