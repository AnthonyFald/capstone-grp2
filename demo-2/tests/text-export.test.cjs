const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../core.js');
const quote='Signed checklist accepted the substrate only.';
const run=()=>({runId:'sample-run',createdAt:'2026-10-22T19:00:00Z',model:'local-model',pipeline:C.VERSION,elapsedMs:1234,reports:[{report_id:'R1',report_date:'2026-05-11',report_author:'Site inspector'}],sourceInventory:[{id:'S001',report_id:'R1',report_date:'2026-05-11',report_author:'Site inspector',field:'work_completed',quote}],findings:[{id:'F1',title:'Inspection and acceptance',scopeTitle:'Review question: Is substrate acceptance complete?',status:'resolved',review:'pending',owner:null,due:null,sourceFactIds:['S001'],latestFactIds:['S001'],evidence:[{report_id:'R1',field:'work_completed',quote}],observation:quote,consequence:'Not assessed. No downstream impact is inferred beyond the cited reports.',action:'Review the cited record and confirm any follow-up with the project team.'}]});
test('text export has an explicit concern scope, readable status and exact dated source quotation',()=>{
  const text=C.textReport(run());
  for(const value of ['DAILY REPORT REVIEW','Reports: 1','Review question: Is substrate acceptance complete?','Suggested status: Resolved for this concern','Your decision: Not reviewed','2026-05-11 / R1 / Site inspector','Latest cited update: "'+quote+'"','1.2 seconds'])assert.ok(text.includes(value),value);
  assert.ok(!text.includes('No downstream impact'));
  assert.ok(!text.includes('Review the cited record and confirm'));
});
test('review decisions and notes remain separate from original quoted evidence without mutating the run',()=>{
  const value=run();value.findings[0].review='corrected';value.findings[0].correction='Check reinforcement records separately.';value.findings[0].owner='Inspector';value.findings[0].due='2026-05-12';
  const before=JSON.stringify(value),text=C.textReport(value);
  assert.ok(text.includes('Corrected / see reviewer note'));
  assert.ok(text.includes('Reviewer note: Check reinforcement records separately.'));
  assert.ok(text.includes('Owner stated in the source: Inspector'));
  assert.ok(text.includes('Due stated in the source: 2026-05-12'));
  assert.ok(text.includes('"'+quote+'"'));assert.equal(JSON.stringify(value),before);
});
test('legacy findings use source report metadata and repeated evidence is printed once per finding',()=>{
  const value=run();delete value.sourceInventory;delete value.findings[0].sourceFactIds;delete value.findings[0].scopeTitle;
  value.findings[0].evidence.push({...value.findings[0].evidence[0]});const text=C.textReport(value);
  assert.ok(text.includes('1. Inspection and acceptance'));assert.ok(text.includes('2026-05-11 / R1 / Site inspector'));
  assert.equal(text.split('"'+quote+'"').length-1,1);
});
test('zero findings do not claim perfect recall and rejected findings remain clearly labelled',()=>{
  const empty={...run(),findings:[]},text=C.textReport(empty);assert.ok(text.includes('Findings: 0'));assert.ok(text.includes('does not establish'));
  const value=run();value.findings[0].review='rejected';assert.ok(C.textReport(value).includes('Your decision: Rejected'));
  assert.throws(()=>C.textReport(null),/Analyze reports/);
});

test('withheld unverified proposals are disclosed without inventing accepted findings or changing the stored audit',()=>{
  const value={...run(),findings:[],sourceObligationAudit:{finalProductReview:{abstentions:[{caseId:'one',type:'attachment',reasonCode:'ambiguous_subject'}]}}},before=JSON.stringify(value),text=C.textReport(value);
  assert.ok(text.includes('Some proposed additions could not be verified. Review the complete reports; details are in the full record.'));
  assert.ok(text.includes('Findings: 0'));assert.ok(text.includes('does not establish'));assert.equal(JSON.stringify(value),before);
  assert.equal(C.reviewCaution(run()),'');assert.equal(C.reviewCaution({sourceObligationAudit:{finalProductReview:{abstentions:[]}}}),'');
});
test('an incomplete inventory falls back to all retained evidence and preserves the stable issue reference',()=>{
  const value=run();value.findings[0].concernId='ISSUE-stable';value.findings[0].sourceFactIds.push('S002');
  delete value.findings[0].scopeTitle;value.findings[0].scopeQuestion='Is the separate record attached?';value.findings[0].latestFactIds=['S002'];
  value.findings[0].evidence.push({report_id:'R1',field:'action_required',quote:'Attach the separate inspection record.'});
  const text=C.textReport(value);
  assert.ok(text.includes('Issue reference: ISSUE-stable'));assert.ok(text.includes(quote));assert.ok(text.includes('Latest cited update: "Attach the separate inspection record."'));assert.ok(text.includes('Review question: Is the separate record attached?'));
});
test('an audited source requirement remains complete and appears once in its dated timeline',()=>{
  const value=run(),requirement='Maintain protection until the test result is documented. '+('Keep the stated condition visible. '.repeat(9));
  value.sourceInventory.push({id:'S002',report_id:'R1',report_date:'2026-05-11',report_author:'Site inspector',field:'action_required',quote:requirement});
  value.findings[0].sourceFactIds.push('S002');value.findings[0].latestFactIds=['S002'];
  value.findings[0].evidence.push({report_id:'R1',field:'action_required',quote:requirement});
  value.findings[0].coverageRequirements=[{sourceFactId:'S002',report_id:'R1',field:'action_required',quote:requirement}];
  const before=JSON.stringify(value),text=C.textReport(value);
  assert.ok(text.includes('Reported requirement: "'+requirement+'"'));assert.equal(text.split(requirement).length-1,1);assert.equal(JSON.stringify(value),before);
});
