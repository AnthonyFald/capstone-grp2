# Collect the human-review evidence

The automated trial files are model measurements. The human-study CSV is intentionally empty: nobody has completed a controlled human-only versus assisted study here.

1. Ask two team members to independently inspect each synthetic report set and its answer key. Resolve disagreements before scoring the model. Keep the original reference and document revisions; do not silently edit the key to match a prediction.
2. Prepare additional comparable report sets. A and B currently differ in length and difficulty and are not interchangeable timed tasks. Keep final holdout cases unseen during prompt development.
3. Assign anonymized participant codes. Counterbalance which condition is performed first. Use different but calibrated cases across conditions to reduce recall from rereading the same reports.
4. Human-only: provide the blind report CSV/JSON, a findings worksheet and a timer. Record the completed final findings before revealing the reference. Do not show AI suggestions.
5. Assisted: start with model inference, then time the participant's reading, verification and corrections. Export the run JSON and findings CSV. Keep download/setup time separately and include it in a first-use total.
6. Have reviewers score original AI output and final human-reviewed output separately. Apply found/partial/missed and supported/unsupported/duplicate rules from the protocol. A source quote alone is not evidence of a correct interpretation.
7. Fill `data/human-study-template.csv` with observed values. Leave unmeasured fields blank. Record case-level results, not just percentages. Keep personal names and real project identifiers out of public exports.

Keep a participant's final findings, the original model run, both independent annotations and the adjudication notes together. Report sample size, task differences, order, correction effort, disagreements and uncertainty in the eventual document and presentation. H1 is supported only if the paired, calibrated observations meet all three targets; model latency cannot substitute for this study.
