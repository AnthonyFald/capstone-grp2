const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../docs/input-history/engine-v18i-frozen.js'),J=require('../engine.js'),C=require('../core.js');
const rows=C.reports([
  {report_id:'L1',report_date:'2026-07-01',issue_or_update:'Grouting was deferred pending witness acceptance. The torque witness sheet is unavailable.'},
  {report_id:'L2',report_date:'2026-07-02',issue_or_update:'Grouting remained on hold pending the issued instruction.'},
  {report_id:'L3',report_date:'2026-07-03',work_completed:'Grouting was completed.',issue_or_update:'The torque witness sheet remains unavailable.'}
]),source=E.inventory(rows),id=quote=>source.facts.find(f=>f.quote===quote).id;
const hold=id('Grouting was deferred pending witness acceptance.'),record=id('The torque witness sheet is unavailable.'),instruction=id('Grouting remained on hold pending the issued instruction.'),completed=id('Grouting was completed.'),missing=id('The torque witness sheet remains unavailable.');
const work={topic:'Was grouting resumed after the witness-acceptance hold?',kind:'progress',status:'resolved',facts:[hold],latest:[completed]},document={topic:'Is the torque witness sheet available?',kind:'record',status:'open',facts:[record],latest:[missing]},related={...work,topic:'Was grouting resumed after the instruction hold?',facts:[instruction]};
const candidates=[work,document,related],allIds=item=>[...new Set([...item.facts,...item.latest])];
const assignment=(aspect,same_as,sourceId,label)=>({aspect,same_as,basisSourceId:sourceId,basisRole:E.ASPECTS[aspect].basisRole,subjectSourceId:sourceId,subjectLabel:label,subjectRole:E.ASPECTS[aspect].subjectRole});
const invalid={'0':assignment('work_progress',1,hold,'Grouting operation'),'1':assignment('supporting_record',1,record,'Torque witness sheet'),'2':assignment('work_progress',2,instruction,'Grouting operation')};
const goodLinks={'0':{same_as:2},'1':{same_as:1},'2':{same_as:2}},reviews={G0:{topic:'Was grouting resumed after its prerequisite holds?',status:'resolved',latest:[completed]},G1:{topic:document.topic,status:'open',latest:[missing]}};
function engine(queue,calls){return {resetChat:async()=>{},chat:{completions:{create:async request=>{calls.push(request);assert.ok(queue.length,'Unexpected inference stage');return {choices:[{message:{content:JSON.stringify(queue.shift())},finish_reason:'stop'}]};}}}};}

test('link repair offers only same-aspect choices for broken links while freezing every valid link',()=>{
  const format=E.assignmentLinkRepairSchema(invalid).properties.links;
  assert.deepEqual(format.required,['0','1','2']);assert.deepEqual(format.properties[0].properties.same_as.enum,[0,2]);assert.deepEqual(format.properties[1].properties.same_as.enum,[1]);assert.deepEqual(format.properties[2].properties.same_as.enum,[2]);
  const untouched=structuredClone(invalid),accepted=E.applyAssignmentLinkRepair(invalid,goodLinks);assert.deepEqual(invalid,untouched);
  for(const key of Object.keys(invalid))assert.deepEqual({...accepted[key],same_as:invalid[key].same_as},invalid[key]);assert.equal(accepted[0].same_as,2);
  assert.deepEqual(E.assignmentGroups(candidates,accepted,source.facts).map(g=>g.members),[[0,2],[1]]);
});

test('one model-selected link correction preserves the invalid critic, exact source evidence and complete candidate accounting',async()=>{
  const calls=[],out=await E.consolidateCandidates(engine([{assignments:invalid},{assignments:invalid},{links:goodLinks},{reviews}],calls),candidates,rows,C),history=out.consolidationHistory[0],repair=history.assignmentRepair;
  assert.equal(calls.length,4);assert.equal(out.findings.length,2);assert.deepEqual(history.boundaryAssignments,invalid);assert.deepEqual(history.initialAssignments,invalid);assert.deepEqual(repair.inputAssignments,invalid);assert.equal(repair.reason,'cross_aspect_same_as');assert.equal(repair.error.code,'CROSS_ASPECT_ASSIGNMENT');
  assert.deepEqual(repair.violations,[{candidateIndex:0,targetIndex:1,aspect:'work_progress',targetAspect:'supporting_record'}]);assert.deepEqual(repair.changedLinks,[{candidateIndex:0,before:1,after:2}]);assert.deepEqual(repair.linkReviews,goodLinks);assert.deepEqual(repair.assignments,history.assignments);assert.equal(history.boundaryChanges.length,1);
  assert.deepEqual(JSON.parse(out.responses[1].raw).assignments,invalid);assert.deepEqual(JSON.parse(out.responses[2].raw),{links:goodLinks});assert.match(out.responses[2].stage,/repair invalid cross-aspect links$/);
  const payload=JSON.parse(calls[2].messages[1].content);assert.deepEqual(payload.invalid_assignments,invalid);assert.deepEqual(payload.reports,source.reports);assert.deepEqual(payload.sources.map(f=>f.text),source.facts.map(f=>f.quote));
  assert.deepEqual(out.preConsolidationCandidates.map(c=>allIds(c)),candidates.map(allIds));assert.deepEqual(out.items.flatMap(item=>item.memberCandidateIndices).sort((a,b)=>a-b),[0,1,2]);
  assert.deepEqual(new Set(out.items.flatMap(allIds)),new Set(candidates.flatMap(allIds)));for(const finding of out.findings)for(const evidence of finding.evidence)assert.ok(source.facts.some(f=>f.quote===evidence.quote&&f.report_id===evidence.report_id));
});

test('missing, repeated, foreign or still-cross-aspect repair decisions fail once without returning partial findings',async()=>{
  for(const links of [undefined,{'0':goodLinks[0],'1':goodLinks[1]},{...goodLinks,'3':{same_as:3}},{...goodLinks,'0':{same_as:1}},{...goodLinks,'0':{same_as:8}},{...goodLinks,'2':{same_as:0}},{...goodLinks,'0':{same_as:0,aspect:'supporting_record'}}]){
    const calls=[];await assert.rejects(()=>E.consolidateCandidates(engine([{assignments:invalid},{assignments:invalid},{links}],calls),candidates,rows,C),error=>{assert.match(error.message,/assignment-link repair/);assert.equal(error.diagnostics.responses.length,3);assert.equal(error.diagnostics.consolidationHistory.length,0);assert.deepEqual(JSON.parse(error.diagnostics.responses[1].raw).assignments,invalid);return true;});assert.equal(calls.length,3);
  }
});

test('invalid classifications, source pointers, roles and missing candidates never trigger a link-repair inference',async()=>{
  for(const bad of [
    {...invalid,'0':{...invalid[0],basisSourceId:record}},
    {...invalid,'0':{...invalid[0],basisRole:E.ASPECTS.supporting_record.basisRole}},
    {...invalid,'0':{...invalid[0],subjectRole:E.ASPECTS.supporting_record.subjectRole}},
    {...invalid,'0':{...invalid[0],subjectSourceId:record}},
    {'0':invalid[0],'1':invalid[1]}
  ]){const calls=[];await assert.rejects(()=>E.consolidateCandidates(engine([{assignments:invalid},{assignments:bad}],calls),candidates,rows,C));assert.equal(calls.length,2);}
});

test('current bounded repair can correct an offending classification while freezing every originally valid assignment',async()=>{
  const corrected={...invalid,'0':assignment('supporting_record',1,hold,'Torque witness sheet')},format=J.assignmentRepairSchema(candidates,invalid);
  assert.deepEqual(format.properties.assignments.properties[1].properties.aspect.enum,['supporting_record']);assert.ok(format.properties.assignments.properties[0].properties.aspect.enum.includes('supporting_record'));
  const scoped={G0:{topic:document.topic,status:'open',latest:[completed,missing]},G2:{topic:related.topic,status:'resolved',latest:[completed]}},calls=[],out=await J.consolidateCandidates(engine([{assignments:invalid},{assignments:invalid},{assignments:corrected},{reviews:scoped}],calls),candidates,rows,C),history=out.consolidationHistory[0],repair=history.assignmentRepair;
  assert.equal(calls.length,4);assert.equal(repair.reason,'cross_aspect_assignment');assert.deepEqual(history.boundaryAssignments,invalid);assert.deepEqual(repair.assignmentReviews,corrected);assert.deepEqual(history.assignments,corrected);assert.deepEqual(history.assignments[1],invalid[1]);assert.deepEqual(history.assignments[2],invalid[2]);
  assert.deepEqual(repair.changedLinks,[]);assert.deepEqual(repair.changedFields,[{candidateIndex:0,fields:['aspect','basisRole','subjectLabel','subjectRole'],before:invalid[0],after:corrected[0]}]);assert.deepEqual(new Set(out.items.flatMap(allIds)),new Set(candidates.flatMap(allIds)));assert.deepEqual(out.items.flatMap(item=>item.memberCandidateIndices).sort((a,b)=>a-b),[0,1,2]);
});

test('current full-assignment repair fails once for frozen-candidate edits, foreign evidence and unresolved cross-aspect links',async()=>{
  for(const corrected of [
    {...invalid,'0':assignment('supporting_record',1,hold,'Torque witness sheet'),'1':{...invalid[1],subjectLabel:'Changed valid record'}},
    {...invalid,'0':assignment('supporting_record',1,record,'Torque witness sheet')},
    invalid,
    {'0':invalid[0],'1':invalid[1]}
  ]){const calls=[];await assert.rejects(()=>J.consolidateCandidates(engine([{assignments:invalid},{assignments:invalid},{assignments:corrected}],calls),candidates,rows,C),error=>{assert.equal(error.diagnostics.responses.length,3);assert.equal(error.diagnostics.consolidationHistory.length,0);return true;});assert.equal(calls.length,3);}
});
