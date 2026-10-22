# Uploading daily construction reports

Use daily site reports written by a supervisor, superintendent or trade foreman. They record what was planned and completed, inspections, problems, instructions, delays and remaining work. Each row is one report from one author or trade on one date. Include several dates and trades so later updates can be compared with earlier concerns.

Download `data/sample-daily-reports.csv`, open it in Excel or another spreadsheet, and upload the file unchanged to test the workflow. The JSON download contains the same fictional ten-report example. It contains no answer-key columns. Uploading either sample is treated as custom data, so the model cannot receive the included research answers.

Required columns: `report_id` (unique), `report_date` (`YYYY-MM-DD`), and at least one of `work_completed` or `issue_or_update`. Other columns in the template provide useful context: `report_author`, `work_area`, `work_planned`, `schedule_status`, `rfi_change_order_refs`, `action_required`, `responsible_party`, `due_date`, `quantity_or_measurement` and `supporting_evidence`. Keep headings exactly as written. Leave unknown information blank; do not guess missing approvals or measurements.

Upload a UTF-8 CSV spreadsheet export or JSON using the sample's structure. This prototype does not read PDF, Word documents, photos or scanned forms. Use 1–30 reports per batch, a file under 150 KB and at most 42,000 normalized characters. Split larger projects into smaller coherent chronological batches. The page explains validation errors before analysis.

The model processes report text on your device. Review each source passage, status and interpretation before relying on a finding. Download findings for a concise record or open the full-record download for inputs, original predictions, human corrections and measurements.
