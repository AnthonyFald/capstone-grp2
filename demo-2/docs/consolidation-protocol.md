# Consolidation evaluation protocol

This revision addresses repeated suggestions without sacrificing distinct concerns or their supporting history. Freeze source/configuration and source/reference hashes before measured revision-18 trials. Score untouched final predictions and retain the pre-consolidation candidates and merge decisions. Reference definitions must not be changed to improve a score.

## Acceptance checks

- Zero semantic duplicate cards in each evaluated case. A different heading, kind, selected subset, or status wording does not create a new concern.
- Preserve every fully found reference concern in the corresponding revision-17 prediction on unchanged A, B, D and F inputs: A 11/12, B 7/8, D 8/9 and F 7/8. Partials remain misses; preserving these counts alone does not establish that the same concerns survived, so compare the actual reference IDs.
- No increase in unsupported distinct findings: the recorded revision-17 native observations have zero. A materially wrong closure or newly asserted event makes the entire finding unsupported, even when each quoted passage exists.
- Preserve all selected source evidence when merging supported candidates: source ID, exact quotation, report date and author. Mechanical checks must establish that every input candidate is retained or explicitly assigned to a surviving issue, with its evidence union preserved. Record any intentional removal and its reason; do not silently drop a whole candidate to achieve fewer cards.
- Resolve status independently for each narrow concern. Evidence union is not authority to transfer acceptance from one work scope to another. Display a specific concern description and latest state; retain complete dated context and the merge map in the full record.
- Routine controls C and E must still produce zero alerts. A zero-reference case has undefined recall, not 100% recall.
- New case G has four reports and five reference concerns. Its target is 5/5 fully found, zero unsupported findings and zero semantic duplicates, including the distinct latest states. These targets are set before revision-18 predictions or reference exposure to the implementing agent.

Exact quote/ID tests, merge-accounting tests and a smaller card count are necessary but insufficient. A separate semantic review must determine whether concerns were incorrectly combined, hidden, or falsely closed. Codex-assisted judgments remain provisional; independent human adjudication is pending.

## Dangerous merges

| Related evidence | Required distinction |
| --- | --- |
| A substrate readiness, verbal inspection-passed account and written substrate release | Combine repeated accounts of that same acceptance gate and retain its explicit signed closure. Do not close separate reinforcement acceptance or missing reinforcement records. |
| A/F physical work completed and record/inspection reference | Physical completion can end a historical work hold. A bare inspection ID does not prove passed inspection or signed acceptance. |
| A/B/D/F technical decision and formal instruction/receipt | May share one issue only if each aspect and its latest state remain explicit. Approved technical direction does not establish transmission or crew receipt. |
| A formal response/inspection acceptance uncertainty and explicit task to attach a record | One card can contain clearly labeled aspects with different states. A single broad resolved state must not conceal an open attachment task. |
| Historical delay, its prerequisite and later completed work | Preserve actual delay dates/durations and later physical completion. Closing the prerequisite is not the same event as completing installation. |
| Temporary trade restriction and uncertain advance-notice receipt | An ended restriction can coexist with an unverified notice-receipt account. Preserve both scopes rather than inheriting one shared resolved state. |
| Completed installation and scheduled curing, testing or commissioning | Installation completion does not prove a test passed or that protection ended. Do not turn a future scheduled task into a failed or overdue test. |
| Different quantities, tests, locations or document IDs | Similar wording, source overlap and a shared author are not sufficient to merge separate concerns. Do not combine unrelated open tasks merely because their evidence appears in one sentence. |

## Matched comparisons and provenance

Revision-17 A used the earlier normalized sample source. The user's new authoritative simulated-report CSV is a revised source and must receive its own input hash and dataset/version label. Preserve the old A source and annotation history. Do not present a revision-18 run on changed input as a matched pipeline-only improvement over revision-17 A. Compare consolidation on the same retained candidates, or rerun both pipelines on the same new input if a causal pipeline comparison is needed. Validate the revised CSV's reference applicability directly and disclose any correction before scoring; never inherit an alias solely because report IDs/counts match.

A, B, D and F are development-informed by the consolidation work. G is authored by a separate agent that inherited the project discussion; its reference contents are withheld from the implementing agent until the source/configuration freeze. This is procedural separation, not an independent human-authored holdout. G source/reference hashes are supplied before inference, and original files remain unchanged during scoring.

Run actual native Qwen 3.5 27B inference serially on the RTX 5080. Report the exact source/prompt/policy/model/seed, continuous end-to-end time, setup time separately, failures and any retries. One observation per case is n=1: no latency distribution, significance or general reliability claim. Replaying earlier responses is a quality-development check and must be excluded from continuous latency summaries. No maximum latency acceptance gate applies; quality takes priority.

## Output and review checks

CSV, readable TXT and full JSON exports must refer to the same consolidated issue identities and reflect user corrections consistently. TXT must show the concern, status, source dates/IDs/authors and complete quotations without losing evidence through truncation. Preserve untouched original findings separately from corrections. Export escaping/format tests do not establish semantic accuracy.
