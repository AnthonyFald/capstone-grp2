# Demo 2 results and limitations

## Release evaluation

The release method uses core `daily-reports-v18`, prompt `daily-review-18n-consolidated`, native Qwen 3.5 27B and `native-sampling-3`. It prioritizes source coverage and review quality over inference speed. Selected development-informed A/G outputs retain all reference concerns with zero unsupported distinct findings and zero semantic duplicate cards in provisional review. They use staged request replay plus actual new reviews, not complete current-pipeline latency trials. The fresh current C UI control returns zero alerts. E compatibility recovery also returns zero alerts, with its original complete K control retained separately. These observations have different processing scopes and are not pooled into one accuracy or speed estimate.

| Case / source | Method | Fully found | Unsupported distinct findings | Semantic duplicate cards | Timing scope |
| --- | --- | ---: | ---: | ---: | --- |
| Current team CSV A, 18n, 13 cards | 37 verified earlier requests + 13 actual new product reviews | 12/12 | 0 | 0 | Staged; no complete-review latency |
| G, 18n, 5 cards, development-informed | 23 verified earlier requests + 3 actual new product reviews | 5/5 | 0 | 0 | Staged; no complete-review latency |
| Routine C, 18n | Actual complete UI upload, analysis and exports | Undefined: zero refs | 0 | 0 | 209.0 s processing, n=1 |
| Routine E, 18n compatibility recovery | 13 verified K requests, zero new inference | Undefined: zero refs | 0 | 0 | No N latency observation; K actual 454.2 s separate |

Semantic scores are provisional Codex review, **not independent human validation**. Fully found requires the complete material concern, latest supported state and source entailment. A partial counts as missed. A useful finding with a material false claim or wrong subject association is unsupported under the whole-finding rule. Exact quotation does not establish a correct grouping or status. Recall counts reference concerns; output assessments count distinct findings, so their denominators differ. Zero-reference controls have undefined recall and report false alarms as raw counts.

One reference can require several distinct cards; one card can support several reference concerns. Independent tasks may justify more cards than references. **Card count alone does not measure repetition.** The target is zero repeated semantic concerns. Exact passages can recur as provenance for genuinely different questions.

## Matched consolidation component checks

These observations reuse unchanged, accepted revision-17 candidates and run new consolidation steps. They test preservation and redundancy in that saved set, without rerunning source discovery or establishing full current-pipeline coverage on B/D/F.

| Case / revision | Original cards | Final cards | Fully found | Exact prior fully found IDs retained | Unsupported | Duplicates | New processing segment |
| --- | ---: | ---: | ---: | --- | ---: | ---: | --- |
| Earlier-source A, 18f | 18 | 11 | 11/12 | All 11 | 0 | 0 | 610.5 s |
| B, 18f | 10 | 5 | 7/8 | All 7 | 0 | 0 | 268.8 s |
| D, 18j component / 18n verified recovery | 16 | 9 | 8/9 | All 8 | 0 | 0 | J new segment 283.6 s; N zero new inference |
| F, 18f | 16 | 8 | 7/8 | All 7 | 0 | 0 | 490.7 s |

These saved candidates still omit A's strength-test follow-up, B's separate delivery rescheduling, D's later physical setting/grouting completion and F's explicit acknowledgement by both installation supervisors. Consolidation cannot recover unselected source facts. Revision 17 retained 17 F candidates but rendered 16 cards through exact duplicate collapse; no routine candidate was discarded for this comparison. Across the four matched comparisons all 33 previously fully found reference IDs survive. This is preservation evidence, not a pooled accuracy estimate.

Earlier-source A and current team-CSV A have different normalized hashes (`4ae8d9d3...b30e` and `9e38f32a...46dc8`). The revised CSV retains ten reports and twelve references but changes three due-time strings. Changed-input observations are not a controlled pipeline-only comparison. Answer/annotation columns are excluded from inference.

## What the fresh case revealed

First completed fresh G, revision 18f after its recorded freeze, returns **4/5 fully found, one partial, zero unsupported distinct findings and zero semantic duplicates** across five cards in **541.8 seconds**, n=1. It retains scheduled strength testing but omits the explicit protection-until-documented-strength-result requirement. All eleven selected candidates and thirty quotations survive. **The predeclared fresh-G 5/5 coverage target fails:** preserving selected evidence cannot recover a task never selected from source.

G then informs the generic source-obligation revision. Development-informed staged 18j G reaches **5/5, zero unsupported findings and zero duplicate cards** with protection visible alongside testing. Fourteen earlier responses are reused only after whole-request-hash verification; five focused critics are actual new inference. Its 390.7-second new segment is not full-review latency. The first fresh result remains 4/5; later development corrections are not untouched holdout confirmations. Reference definitions are unchanged.

Two internal 18j G ledger labels remain wrong: a future setting plan is labeled already completed, and a signed-release reminder cites an unrelated protection/check-folder passage as closure. These labels do not alter prior cards; final release and physical-completion states independently retain valid evidence. **Final-output scores do not validate every ledger classification or prove exhaustive coverage.** The ledger is an AI interpretation, not proof of closure.

The final 18n A product gate abstains from nine proposed changes, preserving the original findings while withholding ambiguous new assertions. A deterministic subject-support guard overrides a raw model decision to attach an unspecified earlier inspection to reinforcement. A proposed current pour-status conflict is recognized as already represented historical context. Both raw proposals and reasons remain in JSON. The final additional drawing-revision identification question is supported and independently actionable; thirteen cards for twelve reference units is not itself redundancy. The reinforcement formal-record question remains awkwardly worded and must be read as verification, not proof that inspection occurred.

## Retained failures and earlier revisions

The [development log](development-log.json) preserves failed attempts, raw responses and corrections. Rejected attempts receive no final semantic accuracy score.

- Matched 18b A preserves eleven reference concerns but retains two duplicate cards. Matched 18c A removes those duplicates while retaining the same missing strength follow-up.
- Complete 18c UI A finds 12/12 in 874.0 seconds, n=1, but fails consolidation: one redundant hold card and a reinforcement-record task hidden under an RFI-only question. Reference recall does not excuse scope defects.
- Rejected 18d/18e attempts expose incorrect routine removals and invalid subject/pointer contracts. Source-only reconsideration restores two material tasks. Later 18f recovery verifies all eighteen prior request hashes and normalizes one repeated valid pointer. It scores 12/12, zero unsupported and zero duplicates with zero new inference at recovery and no continuous latency observation. Its reinforcement question remains awkwardly worded, scored as verification rather than proof inspection occurred.
- Frozen 18f D fails a cross-aspect guard. Accepted staged 18i D preserves 8/9 references but retains one duplicate: a torque prerequisite relabeled as a grouting hold without a separately documented delay. Mechanical preservation is not a semantic pass.
- Accepted machine output 18k A still fails final-card semantic review: newly attached substrate-inspection passages appear under a reinforcement-inspection question. Reference coverage remains 12/12 across other supported cards, but one whole finding is unsupported. Repeated internal component labels are metadata; exact source passages are deduplicated in the product. Rejected 18l A clones sibling tasks across sources and exceeds the component-list contract; it has no accepted final score.
- Accepted 18m A still fails: a vague earlier inspection is attached to reinforcement, and a historical pass/hold conflict is reopened as a current unknown. Two whole findings are unsupported despite 12/12 reference coverage elsewhere. The 18n product gate withholds those changes, retaining raw failure evidence.
- Rejected 18g/18i G fail closure-pointer guards. Rejected 18j A returns nine orphan additions. Its proposed ledger also links substrate inspection to reinforcement inspection and confuses safe-access notification with advance-notice receipt. These proposed links are diagnostic errors, not accepted predictions. The later gate checks subject, task and temporal fit before applying attachments.

### Historical revision-17 observations

| Native 27B case | Fully found | Partial | Unsupported | Duplicates | Processing |
| --- | ---: | ---: | ---: | ---: | --- |
| Earlier-source A, actual UI upload | 11/12 | 1 | 0 | 7 | 615.1 s |
| B | 7/8 | 0 | 0 | 5 | 277.9 s |
| Routine C | Undefined: zero references | 0 | 0 | 0 | 13.1 s |
| D, staged development review | 8/9 | 1 | 0 | 6 | Not continuous |
| Routine E | Undefined: zero references | 0 | 0 | 0 | 34.4 s |
| F, first completed fresh review | 7/8 | 1 | 0 | 7 | 504.0 s |

These are core-v17/prompt-v17 observations, not current full-pipeline results. Experimental browser 4B routine C produces four unsupported alerts and fails. Earlier core-v8/native-9B finds only 4/12 A concerns with five unsupported findings, and 3/8 B concerns with two unsupported findings. A real citation did not establish invented transmission time, delivery cause or cure completion. Earlier failures remain visible and are not pooled with later profiles.

## Method and interpretation

The app inventories dated source sentences, selects source IDs and groups narrow review questions. Independent boundary review separates acceptance, issue/receipt, supporting records, actual holds, trade access, quantities and quality tasks. Original source unions and candidate membership are retained. Physical completion alone cannot establish inspection acceptance, document receipt or separate record closure.

The obligation audit checks action/schedule clauses, compound sentences and already-cited passages. A further independent, one-source check reviews only new source quotations before they can be attached to a question. It uses the checking sentence to identify tasks and full context to establish subject or closure, with equal original evidence for alternative scopes. Existing quoted components retain their earlier fallible metadata. New requirements must match subject, task/document and temporal scope; independent tasks can become separate reviewed concerns. A final product-entailment review checks proposed new quotations and new concerns; unsupported or ambiguous changes can abstain with an explicit trace. A subject-support check for narrow inspection/record targets prevents an unspecified source subject from being treated as a named inspection. These are safeguards, not guarantees of semantic correctness. Suggested questions, grouping, status and ledger labels remain AI interpretations. TXT, CSV and JSON retain the same issue IDs and review state; untouched predictions remain separate from subsequent corrections.

## Limits and later write-up

A-G contain **44 synthetic reports and 42 reference concerns**. A/B/D inform development; C/E are narrow routine controls. F/G are agent-authored with inherited context and references withheld before their first completed frozen observations. This is procedural separation, not independent human validation. G's author also performs its provisional scoring. Later G results are development-informed. See [data review](data-review.md), [case provenance](new-case-provenance.md), [protocol](protocol.md) and [consolidation protocol](consolidation-protocol.md).

Each actual case observation is **n=1**. Zero-call compatibility recoveries and repeated scoring do not create additional independent observations. No stable latency distribution, significance or general accuracy rate is established. Model size, runtime, prompts and sampling changed; no single change receives a causal accuracy claim. Staged replay, saved-candidate processing and zero-call recovery are excluded from continuous latency summaries. Loading is separate; prior downloads are not measured first-use time.

**H1 remains untested:** human-time and missed-issue improvements require human-only and assisted observations including verification/correction time. Reduced repetition is not measured human productivity. Quality has no maximum-latency threshold. Independent team adjudication and broader unseen cases remain necessary.

Inference is measured on RTX 5080. Apple silicon compatibility is retained without a Mac inference benchmark. Approximate Demo 1 M1 Max/RTX times are context, not controlled hardware evidence. The 27B quality profile uses system RAM as well as GPU memory; lower-memory options are distinguished. Configuration, digest, seed and timings are retained in JSON and the [environment record](environment.json).

Use [selected runs](evaluation-files.json), [annotations](scoring.json), [comparison data](evaluation-summary.csv), [predictions](final-trials.json) and [software verification](verification.json) together. Software tests verify guards, workflow and exports, not model accuracy. Collection guides/templates support later human review. Project documents/slides are not rewritten; private recordings/documents and model binaries are not republished.
