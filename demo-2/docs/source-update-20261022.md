# Main sample source update — October 22, 2026

The team-supplied **Simulated Daily Reports CSV - Daily Reports.csv** is now the authoritative main Demo 2 sample. It contains 10 synthetic daily construction reports for Room B104, May 11–15, 2026. Its original SHA-256 is `816995d528766a419c61f4994ade392ec34519ed0f9137aee004b04fc91d2e4b`. The original attachment was read without modification.

`data/reports-a.json`, `data/reports-a.csv`, and both `data/sample-daily-reports` downloads contain exactly the 18 daily-report input fields. They preserve the supplied text and blank values under the application's existing whitespace/string normalization. The source's `report_completeness`, `ground_truth_issue_ids`, and `ground_truth_notes` columns are excluded from every inference input and sample download. Those supplied annotations are retained separately in `source-annotations-20261022.json` for provenance and evaluation.

The report narratives match the previous main sample. After the same application normalization used for model requests, exactly three values change:

| Report | Field | Previous value | Supplied CSV value |
| --- | --- | --- | --- |
| DR-A04 | due_date | 2026-05-13 08:00 | 2026-05-13 8:00 |
| DR-A06 | due_date | 2026-05-14 09:00 | 2026-05-14 9:00 |
| DR-A08 | due_date | 2026-05-15 08:00 | 2026-05-15 8:00 |

The older raw JSON stored crew counts as numbers and two weather cells as null. Standard normalization had already converted those to integer strings and empty strings; the new CSV preserves those normalized values. An empty weather value is not replaced with “Not recorded.”

The normalized input hash changes from `4ae8d9d3b59811dcfe4284f650ba78c528303c646b643fcfa8243a8baee4b30e` to `9e38f32a4dc4f47ed8c30776ef50e1d9e930bd10ea4df0c467c399cf4b946dc8`. This hash is SHA-256 of UTF-8 `JSON.stringify(DailyCore.reports(input))`, excluding dataset metadata and annotations. Previous A inputs, sample downloads and source manifest are preserved in `input-history/` with the suffix `-before-20261022-csv`.

The existing 12 reference definitions in `data/reference-a.json` remain unchanged. All supplied row-level issue IDs are already represented by those definitions. The supplied notes support the same concerns: uncertain water cause, inspection/release discrepancies, design/RFI communication and traceability, delayed placement, testing/quantity closeout and adjacent-trade access. Reference definitions must not be rewritten to make new predictions score better. ISS-02, ISS-03 and ISS-06 describe related but distinguishable inspection prerequisites, informal readiness and opposing accounts; a well-supported consolidated finding can cover more than one reference concern.

Earlier run files keep their original predictions, input hashes and source pipeline versions. They remain historical results on the earlier input; a new run must record the new hash. Even though the three changes are only time formatting, runs on different normalized input hashes must not be pooled silently. The machine-readable details and unchanged reference hash are in `data/source-manifest.json`.

The attachment hash describes the original CSV bytes; the normalized input hash describes the report values after parsing. Freeze manifests separately retain original workspace byte hashes and canonical UTF-8/LF hashes for Git publication. A published LF archive should be checked against its canonical hash, rather than replacing or reinterpreting the original Windows execution hash. Exact whole-request replay verifies the generated request content separately.

These are synthetic development records. Neither the source update nor automated scoring establishes accuracy on real construction projects. Independent team adjudication and the controlled human study remain outstanding.
