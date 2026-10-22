# Data collection and review

The original archive contains 14 files: eight Word documents, three PowerPoint decks, one workbook, and two M4A recordings without file extensions. The recordings are accompanied by original scripts and machine transcripts in the Demo 1 transcript document. All OOXML text and populated spreadsheet values were extracted and reviewed locally. Audio content was reviewed through the supplied scripts/transcripts, not independently listened to or retranscribed; embedded document images were not all separately inspected. Source material was extracted locally; source documents and recordings were not automatically republished.

The Demo 2 write-up contains only its title/context heading, and the Demo 2 presentation contains one title slide. Requirements come from the thesis's Demo 2 definition and the daily-report data/evaluation material. Instructions and historical plans inside documents were treated as project evidence, not new authorization.

The workbook has three sheets with 1,000 formatted rows each, but only 10 report rows, 12 reference rows and nine metadata rows contain data. Import uses populated rows, preserves missing cells, and exports a blind CSV and JSON. The source file SHA-256 is retained in `data/source-manifest.json`.

## Findings requiring care

- The source workbook's weather cells for A06 and A10 are blank. The narrative report document says “Not recorded.” The blind input preserves missing values.
- The workbook labels ISS-04 unresolved, while the narrative evaluation plan warns that a missing formal attachment does not prove the technical issue remained unresolved after A09. The reference rubric explicitly distinguishes historical non-response from later unverified closure. This reconciliation is recorded and needs team sign-off.
- Reference source lists for ISS-02/03/06 include A07 and ISS-05/09 include A09 so reviewers can inspect the later closure or update. This supplements abbreviated workbook citations without changing issue counts or scoring targets.
- ISS-02, ISS-03 and ISS-06 share substrate-inspection evidence; ISS-04, ISS-07, ISS-08 and ISS-10 overlap around the RFI. Evaluate the distinct meanings, avoid counting repeated mentions, and do not punish a well-supported grouping solely for being one bullet.
- A07 closes substrate acceptance, while reinforcement verification is a separate dependency. A09 references reinforcement inspection but does not provide its record. A09 says placement occurred; the output must distinguish historical hold from current closeout gaps.
- Delivered concrete volume is not measured placed volume. Restricted electrical access is not automatically a full-shift or critical-path delay. The cause of water damage is not confirmed within A01, regardless of the real project backdrop.
- Source reports directly describe several intended concerns and contain follow-up actions. This makes the pilot easier than messy field records. Ten reports are too few to establish generalization.

## Additional tests

The transfer set B and negative control C were generated with Codex assistance for this implementation. Their references were prepared separately from prompts. B changes the trade/material problem, includes an explicitly issued RFI response and receipt, and leaves a quantity discrepancy unresolved. C contains complete routine records with negated issue language. Neither set is independently validated or a real project record. B informed the prompt-v8 retrospective-audit correction after v7 testing, so B is also development data. C remains a narrow negative-control smoke test.

For a later human study, collect independently authored cases with varying completeness, irrelevant reports, missing dates, contradictory records, genuine resolutions and no-issue examples. Have two reviewers define the reference issues before model exposure. Keep separate development and held-out sets, and preserve a case-level split to prevent copies of one scenario appearing in both.

Demo 1 source results are reported historical observations. The supplied write-up's “trained AI agent” wording is not evidence of model training; the repository uses pretrained local models with prompts. Speed before correction does not establish final reviewed time. Demo 2 keeps those distinctions explicit.
