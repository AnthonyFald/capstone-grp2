const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),C=require('../core.js');
const data=path.join(__dirname,'../data'),docs=path.join(__dirname,'../docs');
const read=(dir,file)=>fs.readFileSync(path.join(dir,file),'utf8');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const manifest=JSON.parse(read(data,'source-manifest.json'));

test('all main sample downloads contain the same 18 blind source fields and values',()=>{
  const rows=C.reports(JSON.parse(read(data,'reports-a.json')));
  assert.equal(rows.length,10);
  for(const name of ['reports-a.csv','sample-daily-reports.csv','sample-daily-reports.json']){
    const text=read(data,name),parsed=C.parseInput(text);
    assert.deepEqual(parsed,rows,name);
    for(const annotation of manifest.excluded_from_inference)assert.ok(!text.includes(annotation),name+' leaked '+annotation);
  }
  assert.deepEqual(Object.keys(rows[0]),C.FIELDS);
  assert.deepEqual(rows.filter(r=>!r.weather).map(r=>r.report_id),['DR-A06','DR-A10']);
  assert.equal(sha(JSON.stringify(rows)),manifest.normalized_input_sha256);
});

test('source update retains the earlier normalized input and exactly records its differences',()=>{
  const previous=C.reports(JSON.parse(read(path.join(docs,'input-history'),'reports-a-before-20261022-csv.json')));
  const current=C.reports(JSON.parse(read(data,'reports-a.json')));
  assert.equal(sha(JSON.stringify(previous)),manifest.previous_input.normalized_input_sha256);
  assert.notEqual(manifest.previous_input.normalized_input_sha256,manifest.normalized_input_sha256);
  const changes=current.flatMap(row=>{const prior=previous.find(r=>r.report_id===row.report_id);return C.FIELDS.filter(field=>prior[field]!==row[field]).map(field=>({report_id:row.report_id,field,previous:prior[field],current:row[field]}));});
  assert.deepEqual(changes,manifest.previous_input.normalized_field_changes);
  assert.equal(changes.length,3);
  assert.ok(changes.every(change=>change.field==='due_date'));
  assert.equal(sha(read(data,'reference-a.json').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n')),manifest.reference.canonical_utf8_lf_sha256);
});

test('supplied annotations are kept separately and reference only existing reports and issues',()=>{
  const annotations=JSON.parse(read(docs,'source-annotations-20261022.json'));
  const reportIds=new Set(C.reports(JSON.parse(read(data,'reports-a.json'))).map(r=>r.report_id));
  const issueIds=new Set(JSON.parse(read(data,'reference-a.json')).issues.map(i=>i.issue_id));
  assert.equal(annotations.sourceSha256,manifest.sha256);
  assert.equal(annotations.reports.length,10);
  for(const row of annotations.reports){
    assert.ok(reportIds.has(row.report_id));
    for(const id of row.ground_truth_issue_ids.split(';'))assert.ok(issueIds.has(id),id);
  }
});
