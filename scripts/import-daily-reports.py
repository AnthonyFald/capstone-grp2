"""Rebuild the blind Demo 2 inputs and separate annotations from the supplied workbook."""
import argparse, csv, hashlib, json
from pathlib import Path
from datetime import datetime, date
import openpyxl

p = argparse.ArgumentParser()
p.add_argument('workbook', type=Path)
args = p.parse_args()
root = Path(__file__).resolve().parents[1] / 'demo-2' / 'data'
root.mkdir(parents=True, exist_ok=True)
book = openpyxl.load_workbook(args.workbook, data_only=True)
def records(sheet):
    rows = [list(r) for r in book[sheet].values if any(v is not None for v in r)]
    headers = rows[0]
    return [{k: (v.isoformat(sep=' ', timespec='minutes').removesuffix(' 00:00') if isinstance(v,datetime) else v.isoformat() if isinstance(v,date) else v) for k,v in zip(headers,r) if k} for r in rows[1:]]
reports = records('Daily Reports')
excluded = ['report_completeness','ground_truth_issue_ids','ground_truth_notes']
blind = [{k: v for k,v in r.items() if k not in excluded} for r in reports]
reference = records('Ground Truth')
# Reconcile the spreadsheet's shorthand with the supplied narrative evaluation plan.
# Missing attachments do not prove the technical RFI remains unanswered after placement.
for r in reference:
    if r['issue_id'] == 'ISS-04':
        r['ground_truth_status'] = 'Historically open; reported resolved in DR-A09, formal response unverified'
        r['expected_interpretation'] = 'Track RFI-017 through the earlier unanswered reports. DR-A09 reports resolution but lacks a linked formal response; distinguish a traceability gap from proven technical non-resolution.'
    later = {'ISS-02':'DR-A07', 'ISS-03':'DR-A07', 'ISS-05':'DR-A09', 'ISS-06':'DR-A07', 'ISS-09':'DR-A09'}.get(r['issue_id'])
    if later and later not in r['source_reports'].split(';'): r['source_reports'] += ';' + later
def save(name, data): (root/name).write_text(json.dumps(data, indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
save('reports-a.json', {'id':'reports-a','label':'Original pilot · Room B104','synthetic':True,'reports':blind})
save('reference-a.json', {'dataset':'reports-a','annotation_status':'Team-provided, reconciliation by Codex; independent review pending','issues':reference})
with (root/'reports-a.csv').open('w',newline='',encoding='utf-8') as f:
    writer=csv.DictWriter(f, fieldnames=list(blind[0]));writer.writeheader();writer.writerows(blind)
save('source-manifest.json', {'source':args.workbook.name,'sha256':hashlib.sha256(args.workbook.read_bytes()).hexdigest(),'reports':len(blind),'reference_issues':len(reference),'excluded_from_inference':excluded,'source_empty_weather':['DR-A06','DR-A10'],'notes':['Workbook contains 1000 formatted rows per sheet; only populated rows imported.','Empty weather cells preserved as missing; narrative DOCX says Not recorded.','ISS-04 reconciled with narrative evaluation plan to distinguish missing documentation from a proven unresolved technical issue.','Reference labels are never included in generation requests.']})
print(f'Imported {len(blind)} reports and {len(reference)} separate reference issues.')
