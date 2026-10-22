const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../core.js'),E=require('../engine.js');
const read=file=>JSON.parse(fs.readFileSync(path.join(__dirname,'../docs',file),'utf8'));
const run=file=>{const value=read(file);return value.runs?value.runs[0]:value;};
const allIds=item=>[...new Set([...item.facts,...item.latest])];
const fixturePlans={
  a:{file:'final-v17-native27-a-ui.json',groups:[[0],[1,2,14,18],[3,13,15],[4,19],[5],[6,9],[7,8],[10,16],[11],[12],[17]],latest:{1:['S065','S066'],2:['S089','S092'],7:['S085','S090']}},
  b:{file:'final-v17-native27-b.json',groups:[[0,5,7],[1,6,8],[2,9],[3],[4]]},
  d:{file:'development-v17-native27-d-staged.json',groups:[[0],[1,13],[2,14],[3,7,11,15],[4],[5],[6,8],[9,10],[12]],latest:{3:['S083','S090','S092'],7:['S068','S069','S070','S073']}},
  f:{file:'final-v17-native27-f.json',groups:[[0,13],[1,14],[2,7,15],[3,8],[4,9],[5,10,16],[6,11],[12]],latest:{2:['S077','S078','S080'],3:['S078','S080','S081'],5:['S103'],6:['S062']}}
};
function fixture(key){const plan=fixturePlans[key],saved=run(plan.file),rows=C.reports(saved.reports),facts=E.inventory(rows).facts;
  const groups=plan.groups.map((members,index)=>{const primary=saved.items[members[0]],topic=primary.topic.endsWith('?')?primary.topic:primary.topic+'?';return {members,topic,kind:primary.kind,status:primary.status,latest:plan.latest?.[index]||primary.latest};});
  return {saved,rows,facts,groups};
}
for(const key of Object.keys(fixturePlans))test('saved '+key.toUpperCase()+' evidence survives consolidation without a sentence being discarded or invented',()=>{
  const {saved,rows,facts,groups}=fixture(key),items=E.consolidatePartition(saved.items,groups,facts,rows),out=E.render(items,facts,rows,C);
  assert.equal(items.length,groups.length);
  assert.equal(items.flatMap(item=>item.memberCandidateIndices).length,saved.items.length);
  assert.deepEqual([...new Set(items.flatMap(item=>item.memberCandidateIndices))].sort((a,b)=>a-b),saved.items.map((_,index)=>index));
  for(const item of items){const expected=new Set(item.memberCandidateIndices.flatMap(index=>allIds(saved.items[index])));assert.deepEqual(new Set(allIds(item)),expected);const finding=out.findings.find(f=>f.concernId===item.concernId);assert.ok(finding);assert.equal(finding.evidence.length,expected.size);assert.match(finding.scopeTitle,/^Review question: .*\?$/);assert.equal(finding.scopeQuestion,item.topic);for(const evidence of finding.evidence)assert.ok(rows.find(row=>row.report_id===evidence.report_id)[evidence.field].includes(evidence.quote));}
});

test('the sample acceptance, written-release subset and later release audit become one scoped concern',()=>{
  const {saved,rows,facts,groups}=fixture('a'),items=E.consolidatePartition(saved.items,groups,facts,rows);
  const acceptance=items.find(item=>item.memberCandidateIndices.includes(1));
  for(const member of [1,2,18])assert.ok(acceptance.memberCandidateIndices.includes(member));
  assert.equal(acceptance.status,'resolved');assert.ok(allIds(acceptance).includes('S066'));
  assert.notEqual(items.find(item=>item.memberCandidateIndices.includes(5)).concernId,acceptance.concernId);
  assert.equal(items.find(item=>item.memberCandidateIndices.includes(5)).status,'needs_verification');
  assert.equal(items.find(item=>item.memberCandidateIndices.includes(12)).status,'open');
});

const rows=C.reports([{report_id:'R1',report_date:'2026-09-01',work_area:'Pump P6',issue_or_update:'Bearing-face release is missing. Torque witness record is unavailable.'},{report_id:'R2',report_date:'2026-09-02',work_area:'Pump P6',work_completed:'Bearing faces accepted in signed release BF-2.',issue_or_update:'Torque witness record remains unavailable.'}]);
const facts=E.inventory(rows).facts,id=quote=>facts.find(f=>f.quote===quote).id;
const physical={topic:'Were the Pump P6 bearing faces accepted?',kind:'acceptance',status:'resolved',facts:[id('Bearing-face release is missing.')],latest:[id('Bearing faces accepted in signed release BF-2.')]};
const release={topic:'Was the Pump P6 bearing-face written release received?',kind:'release',status:'resolved',facts:[id('Bearing-face release is missing.')],latest:[id('Bearing faces accepted in signed release BF-2.')]};
const record={topic:'Is the Pump P6 torque witness record available?',kind:'record',status:'open',facts:[id('Torque witness record is unavailable.')],latest:[id('Torque witness record remains unavailable.')]};
const correct=[{members:[0,1],topic:physical.topic,kind:'acceptance',status:'resolved',latest:physical.latest},{members:[2],topic:record.topic,kind:'record',status:'open',latest:record.latest}];

test('resolved physical acceptance cannot overwrite a separate outstanding record concern',()=>{const out=E.consolidatePartition([physical,release,record],correct,facts,rows);assert.equal(out.length,2);assert.equal(out[0].status,'resolved');assert.equal(out[1].status,'open');assert.notEqual(out[0].concernId,out[1].concernId);assert.ok(!out[1].latest.includes(physical.latest[0]));});

test('complete partition proof rejects missing, repeated, duplicate and invented members',()=>{const candidates=[physical,release,record];for(const groups of [[],[correct[0]],[correct[0],{...correct[1],members:[1,2]}],[{...correct[0],members:[0,0,1]},correct[1]],[correct[0],{...correct[1],members:[3]}],[correct[0],{...correct[1],members:[2.5]}]])assert.throws(()=>E.consolidatePartition(candidates,groups,facts,rows),/partition|member|omitted/);});

test('consolidation cannot add a new quote, cross-concern state pointer, false closure, or declarative scope',()=>{const candidates=[physical,release,record];for(const change of [{latest:['S99999']},{latest:physical.latest},{status:'resolved'},{topic:'The test failed.'}])assert.throws(()=>E.consolidatePartition(candidates,[correct[0],{...correct[1],...change}],facts,rows),/evidence|state|question/);});

test('stable concern identity survives candidate order, sentence-ID shifts and an additional later update',()=>{
  const original=E.consolidatePartition([physical,release,record],correct,facts,rows),reversed=E.consolidatePartition([record,release,physical],[{...correct[1],members:[0]},{...correct[0],members:[2,1]}],facts,rows);
  assert.equal(original[0].concernId,reversed.find(item=>item.kind==='acceptance').concernId);
  const mapping=new Map(facts.map((fact,index)=>[fact.id,'S'+(index+100)])),renumber=item=>({...item,facts:item.facts.map(id=>mapping.get(id)),latest:item.latest.map(id=>mapping.get(id))});
  const renumbered=E.consolidatePartition([physical,release,record].map(renumber),correct.map(group=>({...group,latest:group.latest.map(id=>mapping.get(id))})),facts.map(fact=>({...fact,id:mapping.get(fact.id)})),rows);
  assert.deepEqual(renumbered.map(item=>item.concernId),original.map(item=>item.concernId));
  const continuedRows=C.reports([...rows,{report_id:'R3',report_date:'2026-09-03',work_area:'Pump P6',issue_or_update:'Bearing-face release BF-2 remains in the package.'}]),continuedFacts=E.inventory(continuedRows).facts,newId=continuedFacts.find(f=>f.report_id==='R3').id;
  const continued=E.consolidatePartition([physical,release,{...physical,facts:physical.latest,latest:[newId]}],[{...correct[0],members:[0,1,2],latest:[newId]}],continuedFacts,continuedRows);
  assert.equal(continued[0].concernId,original[0].concernId);
});

test('the shared ledger collapses exact/subset rediscovery and preserves added context without merging different aspects',()=>{const shared=E.mergeExactCandidates([physical,{...physical},{...physical,facts:[...physical.facts,record.facts[0]]},record]);assert.equal(shared.length,2);assert.deepEqual(new Set(allIds(shared[0])),new Set([...allIds(physical),record.facts[0]]));assert.equal(shared[1].kind,'record');assert.equal(E.mergeExactCandidates([physical,{...physical,topic:'Is the independent torque witness accepted?'}]).length,2);const distinct={...physical,topic:'Is the independent torque witness accepted?',facts:[record.facts[0]]};assert.equal(E.mergeExactCandidates([physical,distinct]).length,2);});

function fakeEngine(queue,calls){return {resetChat:async()=>{},chat:{completions:{create:async request=>{calls.push(request);assert.ok(queue.length,'An unplanned inference request was made');return {choices:[{message:{content:JSON.stringify(queue.shift())},finish_reason:'stop'}]};}}}};}

function grounded(aspect,same_as,basisSourceId){const roles={physical_acceptance:'acceptance_or_release',supporting_record:'explicit_record_submission_or_availability',access_notice:'advance_notice_receipt',trade_disruption:'actual_trade_restriction_or_resumption'},subjectRoles={physical_acceptance:'inspected_scope',supporting_record:'supporting_document',access_notice:'notice_event',trade_disruption:'trade_access_event'},sourceId=basisSourceId||(['supporting_record','trade_disruption'].includes(aspect)?record.latest[0]:physical.latest[0]),source=facts.find(fact=>fact.id===sourceId);return {aspect,same_as,basisSourceId:sourceId,basisRole:roles[aspect]||'unknown',subjectSourceId:sourceId,subjectLabel:source?.quote.startsWith('Torque')?'Torque witness record':'Bearing faces',subjectRole:subjectRoles[aspect]||'unknown'};}
const assignments={'0':grounded('physical_acceptance',0),'1':grounded('physical_acceptance',0),'2':grounded('supporting_record',2)};
const scopeReviews={G0:{topic:physical.topic,status:'resolved',latest:physical.latest},G2:{topic:record.topic,status:'open',latest:record.latest}};

test('fixed per-candidate and per-group schema properties require complete coverage',()=>{
  const format=E.consolidationSchema([physical,release,record]);
  assert.deepEqual(format.properties.assignments.required,['0','1','2']);
  assert.equal(format.properties.assignments.additionalProperties,false);
  const groups=E.assignmentGroups([physical,release,record],assignments),scoped=E.scopeReviewSchema(groups,[physical,release,record]);
  assert.deepEqual(scoped.properties.reviews.required,['G0','G2']);
  assert.deepEqual(scoped.properties.reviews.properties.G2.properties.status.enum,['open','needs_verification']);
  assert.ok(!scoped.properties.reviews.properties.G2.properties.status.enum.includes('resolved'));
  assert.ok(!scoped.properties.reviews.properties.G2.properties.status.enum.includes('historical'));
});

test('fixed candidate assignments reject missing, invented, invalid and cross-aspect members',()=>{
  for(const changed of [
    {'0':assignments[0],'1':assignments[1]},
    {...assignments,'3':assignments[2]},
    {...assignments,'2':grounded('supporting_record',20)},
    {...assignments,'2':grounded('made_up',2)},
    {...assignments,'2':grounded('supporting_record',0)}
  ])assert.throws(()=>E.assignmentGroups([physical,release,record],changed),/omitted|invented|invalid|aspects/);
});

test('assignment chains normalize into a complete disjoint partition without depending on representative choice',()=>{
  const chain={'0':grounded('physical_acceptance',1),'1':grounded('physical_acceptance',0),'2':grounded('supporting_record',2)};
  assert.deepEqual(E.assignmentGroups([physical,release,record],chain),[{id:'G0',members:[0,1],aspect:'physical_acceptance'},{id:'G2',members:[2],aspect:'supporting_record'}]);
});

test('scope checks cannot omit a group or assign a record an ended work-state or new false closure',()=>{
  const candidates=[physical,release,record],groups=E.assignmentGroups(candidates,assignments);
  for(const changed of [{G0:scopeReviews.G0},{...scopeReviews,G9:scopeReviews.G2},{...scopeReviews,G2:{...scopeReviews.G2,status:'resolved'}},{...scopeReviews,G2:{...scopeReviews.G2,status:'historical'}}])assert.throws(()=>E.partitionFromReviews(groups,changed,candidates),/omitted|invented|unsupported/);
});

test('final assignment checks cannot merge a notice concern with an ended trade restriction',()=>{
  const candidates=[{...physical,concernAspect:'access_notice',status:'needs_verification'},{...record,concernAspect:'trade_disruption',status:'historical'}];
  assert.throws(()=>E.assignmentGroups(candidates,{'0':grounded('access_notice',1),'1':grounded('trade_disruption',1)}),/aspects/);
  assert.throws(()=>E.assignmentGroups(candidates,{'0':grounded('trade_disruption',1,physical.latest[0]),'1':grounded('trade_disruption',1)}),/changed/);
  const groups=E.assignmentGroups(candidates,{'0':grounded('access_notice',0),'1':grounded('trade_disruption',1)}),format=E.scopeReviewSchema(groups,candidates);
  assert.deepEqual(format.properties.reviews.properties.G0.properties.status.enum,['needs_verification']);
  assert.ok(format.properties.reviews.properties.G1.properties.status.enum.includes('historical'));
});

test('standalone consolidation retains untouched candidates, fixed assignments and exact original quotations',async()=>{
  const calls=[],queue=[{assignments},{assignments},{reviews:scopeReviews}],out=await E.consolidateCandidates(fakeEngine(queue,calls),[physical,release,record],rows,C);
  assert.equal(calls.length,3);assert.equal(out.findings.length,2);assert.equal(out.preConsolidationCandidates.length,3);assert.equal(out.consolidationHistory.length,1);assert.equal(out.method,'saved-candidate-consolidation-only');
  for(const stage of out.consolidationHistory){assert.equal(stage.candidateToConcern.length,stage.inputCandidates.length);assert.ok(stage.candidateToConcern.every(mapping=>mapping.concernId));assert.deepEqual(stage.assignments,assignments);}
  assert.deepEqual(out.items.flatMap(item=>item.memberCandidateIndices),[0,1,2]);assert.deepEqual(out.findings.map(f=>f.status),['resolved','open']);assert.deepEqual(out.items.map(item=>item.concernAspect),['physical_acceptance','supporting_record']);
  for(const call of calls){const payload=JSON.parse(call.messages[1].content);assert.ok(!JSON.stringify(payload).includes('reference_issue'));assert.ok(!payload.reports);assert.ok(payload.candidates.every(candidate=>!Object.hasOwn(candidate,'kind')));assert.equal(payload.sources.length,facts.length);assert.equal(new Set(payload.sources.map(source=>source.id)).size,facts.length);}
  const format=JSON.parse(calls[0].response_format.schema);assert.deepEqual(format.properties.assignments.required,['0','1','2']);
});

test('failed assignment validation preserves raw model output and untouched inputs for diagnosis',async()=>{const calls=[],bad={'0':assignments[0],'1':assignments[1]},queue=[{assignments:bad}];await assert.rejects(()=>E.consolidateCandidates(fakeEngine(queue,calls),[physical,release,record],rows,C),error=>{assert.match(error.message,/omitted/);assert.equal(error.diagnostics.responses.length,1);assert.deepEqual(JSON.parse(error.diagnostics.responses[0].raw),{assignments:bad});assert.equal(error.diagnostics.preConsolidationCandidates.length,3);return true;});});

test('an empty saved control remains empty without a forced consolidation response',async()=>{const calls=[],out=await E.consolidateCandidates(fakeEngine([],calls),[],rows,C);assert.deepEqual(out.findings,[]);assert.equal(calls.length,0);});

test('full review verifies atomic candidates before one independently audited final consolidation',async()=>{
  const calls=[],selections=[physical,release,record],verification={'0':{verdict:'supported',reasonCode:'material_concern',facts:physical.facts,latest:physical.latest,status:physical.status},'1':{verdict:'supported',reasonCode:'material_concern',facts:release.facts,latest:release.latest,status:release.status},'2':{verdict:'supported',reasonCode:'material_concern',facts:record.facts,latest:record.latest,status:record.status}};
  const queue=[{items:selections},{edits:[],additional:[]},{items:[]},{items:[]},{items:[]},{reviews:verification},{assignments},{assignments},{reviews:scopeReviews}];
  const out=await E.generate(fakeEngine(queue,calls),rows,C,{thorough:true,auditObligations:false});
  assert.equal(out.findings.length,2);assert.equal(out.materialityReviews.length,3);assert.equal(out.preConsolidationCandidates.length,3);assert.equal(out.consolidationHistory.length,1);assert.equal(out.candidateHistory.length,5);
  assert.match(out.responses[5].stage,/Verifying relevance/);assert.match(out.responses[6].stage,/final concern boundaries.*identify independent/);assert.match(out.responses[7].stage,/independently audit concern boundaries/);assert.match(out.responses[8].stage,/verify each concern state/);
  assert.equal(JSON.parse(calls[5].messages[1].content).all_candidates.length,3);assert.ok(out.findings.every(f=>f.concernId&&f.scopeTitle&&f.concernAspect&&f.subjectEvidence.length));
  const schema=JSON.parse(calls[5].response_format.schema);assert.deepEqual(schema.properties.reviews.required,['0','1','2']);assert.ok(!Object.hasOwn(schema.properties.reviews.properties['0'].properties,'topic'));assert.ok(!Object.hasOwn(schema.properties.reviews.properties['0'].properties,'kind'));
  assert.match(out.findings[0].observation,/Latest cited update for this question/);assert.match(out.findings[0].uncertainty,/Status applies only to this question/);
});

test('rendering preserves distinct scoped identities even when their generic kind and source passages are identical',()=>{
  const base={...physical,kind:'progress',status:'historical'},items=[{...base,concernId:'ISSUE-work_progress-001',concernAspect:'work_progress',scopeQuestion:'When did Pump P6 setting resume?',scopeTitle:'Review question: When did Pump P6 setting resume?'},{...base,concernId:'ISSUE-trade_disruption-001',concernAspect:'trade_disruption',scopeQuestion:'When did adjacent trade access resume?',scopeTitle:'Review question: When did adjacent trade access resume?'}];
  const rendered=E.render(items,facts,rows,C);assert.equal(rendered.findings.length,2);assert.deepEqual(rendered.findings.map(f=>f.concernId),items.map(item=>item.concernId));assert.deepEqual(rendered.findings[0].evidence,rendered.findings[1].evidence);
  assert.throws(()=>E.render([items[0],{...items[0],facts:[...items[0].facts,record.facts[0]]}],facts,rows,C),/conflicting/);
});

test('atomic materiality decisions cannot change their original question or kind',async()=>{
  const prefix=[{items:[physical,release,record]},{edits:[],additional:[]},{items:[]},{items:[]},{items:[]}];
  for(const extra of [{kind:'record'},{topic:'Is another inspection closed?'},{concernAspect:'supporting_record'}]){
    const calls=[],queue=[...prefix,{reviews:{'0':{verdict:'supported',reasonCode:'material_concern',facts:physical.facts,latest:physical.latest,status:physical.status,...extra},'1':{verdict:'supported',reasonCode:'material_concern',facts:release.facts,latest:release.latest,status:release.status},'2':{verdict:'supported',reasonCode:'material_concern',facts:record.facts,latest:record.latest,status:record.status}}}];
    await assert.rejects(()=>E.generate(fakeEngine(queue,calls),rows,C,{thorough:true,auditObligations:false}),error=>{assert.match(error.message,/change its independent aspect/);assert.equal(error.diagnostics.responses.length,6);assert.equal(error.diagnostics.consolidationHistory.length,0);return true;});
  }
});

test('a candidate pool can exceed the final output bound before semantic consolidation',()=>{
  const candidates=Array.from({length:40},(_,index)=>({...physical,topic:'Is independent reported concern '+index+' resolved?'}));
  assert.throws(()=>E.validateItems(candidates,facts),/valid evidence selection/);
  assert.equal(E.validateItems(candidates,facts,{maxItems:144}).length,40);
  assert.equal(E.mergeExactCandidates(candidates).length,40);
  assert.throws(()=>E.validateItems(Array.from({length:145},()=>physical),facts,{maxItems:144}),/valid evidence selection/);
});

test('different quality questions sharing one compound source sentence survive the early shared ledger',()=>{
  const one={...physical,kind:'closeout',status:'open',topic:'Is concrete strength-test follow-up complete?'},two={...one,topic:'Is concrete curing/protection complete?'};
  assert.equal(E.mergeExactCandidates([one,two]).length,2);
  assert.equal(E.mergeExactCandidates([one,{...one}]).length,1);
});

test('routine atomic removal retains source membership and explicit reason before semantic identity is assigned',async()=>{
  const calls=[],queue=[{items:[physical,release,record]},{edits:[],additional:[]},{items:[]},{items:[]},{items:[]},{reviews:{'0':{verdict:'routine',reasonCode:'routine_completed_work',facts:physical.facts,latest:physical.latest,status:physical.status},'1':{verdict:'routine',reasonCode:'routine_completed_work',facts:release.facts,latest:release.latest,status:release.status},'2':{verdict:'supported',reasonCode:'material_concern',facts:record.facts,latest:record.latest,status:record.status}}},{reviews:{'0':{verdict:'routine',reasonCode:'routine_completed_work',facts:physical.facts,latest:physical.latest,status:physical.status},'1':{verdict:'routine',reasonCode:'routine_completed_work',facts:release.facts,latest:release.latest,status:release.status}}},{assignments:{'0':grounded('supporting_record',0)}},{assignments:{'0':grounded('supporting_record',0)}},{reviews:{G0:scopeReviews.G2}}];
  const out=await E.generate(fakeEngine(queue,calls),rows,C,{thorough:true,auditObligations:false});
  assert.equal(out.findings.length,1);assert.equal(out.materialityRemovals.length,2);assert.equal(out.materialityReconsiderations.length,2);assert.ok(out.materialityReconsiderations.every(review=>review.outcome==='confirmed_routine'));
  for(const [index,removed] of out.materialityRemovals.entries()){assert.equal(removed.reasonCode,'routine_completed_work');assert.match(removed.explanation,/Independent source review confirmed/);assert.deepEqual(removed.memberCandidateIndices,[index]);assert.deepEqual(new Set(removed.retainedSourceFactIds),new Set(allIds([physical,release][index])));assert.equal(removed.concernId,null);assert.equal(removed.question,[physical,release][index].topic);}
  assert.equal(out.preConsolidationCandidates.length,3);assert.deepEqual(out.items[0].memberCandidateIndices,[2]);
});

test('aspect assignment requires grounding in its own source and a matching semantic basis role',()=>{
  for(const bad of [{...assignments,'1':{...assignments[1],basisSourceId:record.latest[0]}},{...assignments,'1':{...assignments[1],basisRole:'explicit_record_submission_or_availability'}},{...assignments,'1':{aspect:'physical_acceptance',same_as:0}}])assert.throws(()=>E.assignmentGroups([physical,release,record],bad),/basis/);
  const format=E.consolidationSchema([physical,release,record]);assert.ok(format.properties.assignments.properties['0'].required.includes('basisSourceId'));assert.ok(format.properties.assignments.properties['0'].required.includes('basisRole'));assert.deepEqual(format.properties.assignments.properties['0'].properties.basisSourceId.enum,allIds(physical));
});


test('independent boundary critic splits two document tasks hidden in one compound source sentence',async()=>{
  const input=C.reports([{report_id:'DOCS',report_date:'2026-09-04',work_area:'Pump room',work_completed:'Installation completed.',action_required:'Attach the formal design response and the torque witness record.'}]),source=E.inventory(input).facts.find(fact=>fact.field==='action_required');
  const candidates=[{topic:'Is the formal design response attached?',kind:'record',status:'open',facts:[source.id],latest:[source.id]},{topic:'Is the torque witness record attached?',kind:'record',status:'open',facts:[source.id],latest:[source.id]}];
  const assignment=(index,text)=>({aspect:'supporting_record',same_as:index,basisSourceId:source.id,basisRole:'explicit_record_submission_or_availability',subjectSourceId:source.id,subjectLabel:text,subjectRole:'supporting_document'});
  const corrected={'0':assignment(0,'formal design response'),'1':assignment(1,'torque witness record')},bad={'0':corrected[0],'1':{...corrected[1],same_as:0}};
  const calls=[],queue=[{assignments:bad},{assignments:corrected},{reviews:{G0:{topic:candidates[0].topic,status:'open',latest:[source.id]},G1:{topic:candidates[1].topic,status:'open',latest:[source.id]}}}],out=await E.consolidateCandidates(fakeEngine(queue,calls),candidates,input,C);
  assert.equal(out.findings.length,2);assert.notEqual(out.findings[0].concernId,out.findings[1].concernId);assert.deepEqual(out.items.map(item=>item.subjectLabel),['formal design response','torque witness record']);
  const history=out.consolidationHistory[0];assert.equal(history.initialAssignments[1].same_as,0);assert.equal(history.assignments[1].same_as,1);assert.equal(history.boundaryChanges.length,1);assert.deepEqual(out.items.map(item=>item.memberCandidateIndices),[[0],[1]]);
  assert.match(calls[1].messages[0].content,/SPLIT/);assert.match(calls[1].messages[0].content,/ALL ORIGINAL/);assert.equal(JSON.parse(calls[1].messages[1].content).candidates.length,2);
  const changedQuestions=E.consolidatePartition(candidates,history.partition.map(group=>({...group,topic:'Does the supplied record verify '+group.subjectEvidence[0].label+'?'})),E.inventory(input).facts,input);assert.deepEqual(changedQuestions.map(item=>item.concernId),out.items.map(item=>item.concernId));
});

test('independent boundary critic merges prerequisite fragments into one continuous physical work timeline',async()=>{
  const input=C.reports([{report_id:'HOLD',report_date:'2026-09-01',work_area:'Room C',work_completed:'No concrete placed.',schedule_status:'Concrete pour held pending substrate release. Concrete pour also awaits reinforcement inspection.'},{report_id:'DONE',report_date:'2026-09-02',work_area:'Room C',work_completed:'Substrate acceptance signed. Concrete placement completed.'}]),source=E.inventory(input).facts,sourceId=text=>source.find(fact=>fact.quote===text).id;
  const substrate=sourceId('Concrete pour held pending substrate release.'),reinforcement=sourceId('Concrete pour also awaits reinforcement inspection.'),release=sourceId('Substrate acceptance signed.'),complete=sourceId('Concrete placement completed.');
  const candidates=[{topic:'Was the concrete pour held for substrate release?',kind:'progress',status:'resolved',facts:[substrate],latest:[release]},{topic:'Was the concrete pour held for reinforcement inspection?',kind:'progress',status:'resolved',facts:[reinforcement],latest:[complete]}];
  const assignment=(index,basis)=>({aspect:'work_progress',same_as:index,basisSourceId:basis,basisRole:'actual_work_hold_or_completion',subjectSourceId:basis,subjectLabel:'Concrete pour',subjectRole:'work_operation'});
  const first={'0':assignment(0,substrate),'1':assignment(1,reinforcement)},corrected={'0':first[0],'1':{...first[1],same_as:0}},calls=[],queue=[{assignments:first},{assignments:corrected},{reviews:{G0:{topic:'Did concrete placement resume after its prerequisite holds?',status:'resolved',latest:[complete]}}}];
  const out=await E.consolidateCandidates(fakeEngine(queue,calls),candidates,input,C);assert.equal(out.findings.length,1);assert.deepEqual(out.items[0].memberCandidateIndices,[0,1]);assert.deepEqual(out.items[0].latest,[complete]);assert.deepEqual(new Set(allIds(out.items[0])),new Set([substrate,reinforcement,release,complete]));assert.equal(out.consolidationHistory[0].boundaryChanges.length,1);assert.match(out.findings[0].observation,/Concrete placement completed/);
});

test('AI subject labels are bounded and anchored to member sources with matching roles',()=>{
  for(const changed of [{subjectSourceId:record.latest[0]},{subjectLabel:'<b>invalid markup</b>'},{subjectRole:'supporting_document'},{subjectLabel:''}])assert.throws(()=>E.assignmentGroups([physical,release,record],{...assignments,'0':{...assignments[0],...changed}},facts),/subject/);
  const format=E.consolidationSchema([physical]);for(const key of ['subjectSourceId','subjectLabel','subjectRole'])assert.ok(format.properties.assignments.properties['0'].required.includes(key));
});


test('independent removal adjudication restores an explicit remaining task while retaining the mistaken initial decision',async()=>{
  const input=C.reports([{report_id:'QUALITY',report_date:'2026-09-02',work_completed:'Concrete placement completed.',schedule_status:'Curing/protection and strength-test follow-up remain in progress.'}]),source=E.inventory(input).facts.find(fact=>fact.field==='schedule_status');
  const task={topic:'Which quality follow-up remains after placement?',kind:'closeout',status:'open',facts:[source.id],latest:[source.id]},selection={facts:task.facts,latest:task.latest,status:'open'},first={verdict:'routine',reasonCode:'no_material_concern',...selection},second={verdict:'supported',reasonCode:'material_concern',...selection};
  const grouped={'0':{aspect:'quality_followup',same_as:0,basisSourceId:source.id,basisRole:'explicit_quality_or_handoff_task',subjectSourceId:source.id,subjectLabel:'Remaining concrete quality checks',subjectRole:'quality_task'}},calls=[],queue=[{items:[task]},{edits:[],additional:[]},{items:[]},{items:[]},{items:[]},{items:[]},{reviews:{'0':first}},{reviews:{'0':second}},{assignments:grouped},{assignments:grouped},{reviews:{G0:{topic:task.topic,status:'open',latest:[source.id]}}}];
  const out=await E.generate(fakeEngine(queue,calls),input,C,{thorough:true,auditObligations:false});
  assert.equal(out.findings.length,1);assert.equal(out.materialityReviews[0].verdict,'routine');assert.equal(out.materialityRemovals.length,0);assert.equal(out.materialityReconsiderations.length,1);
  const reconsidered=out.materialityReconsiderations[0];assert.equal(reconsidered.outcome,'restored');assert.equal(reconsidered.initialReview.reasonCode,'no_material_concern');assert.equal(reconsidered.review.verdict,'supported');assert.deepEqual(reconsidered.memberCandidateIndices,[0]);assert.deepEqual(reconsidered.acceptedSourceFactIds,[source.id]);
  assert.match(out.responses[7].stage,/Independently rechecking proposed routine removals/);assert.match(calls[7].messages[0].content,/Preserve the candidate as supported when materiality is uncertain/);assert.match(out.findings[0].observation,/strength-test follow-up remain in progress/);
  assert.equal(out.items[0].subjectLabel,'Remaining concrete quality checks');assert.equal(out.items[0].sourceAnchor.quote,source.quote);assert.ok(!out.findings[0].observation.includes('Remaining concrete quality checks'));assert.ok(!C.textReport({...out,reports:input}).includes('"Remaining concrete quality checks"'));
});

test('the independent critic can repair semantic errors in an initial draft before final strict validation',async()=>{
  const bad={'0':{...assignments[0],basisRole:'explicit_record_submission_or_availability'},'1':{...assignments[1],aspect:'supporting_record',same_as:0},'2':assignments[2]},calls=[],queue=[{assignments:bad},{assignments},{reviews:scopeReviews}];
  const out=await E.consolidateCandidates(fakeEngine(queue,calls),[physical,release,record],rows,C);assert.equal(out.findings.length,2);assert.equal(out.consolidationHistory[0].boundaryChanges.length,2);assert.deepEqual(out.consolidationHistory[0].initialAssignments,bad);assert.deepEqual(out.consolidationHistory[0].assignments,assignments);
  assert.throws(()=>E.assignmentGroups([physical,release,record],bad,facts),/basis role/);
});

test('subjectLabel is an AI interpretation while both new and historical source anchors preserve exact quotation identity',()=>{
  const oldAnchor={report_id:'R1',report_date:'2026-09-01',field:'issue_or_update',quote:'Bearing-face release is missing.',work_area:'Pump P6',subjectText:'Bearing-face release'},newAnchor={...oldAnchor,subjectLabel:oldAnchor.subjectText};delete newAnchor.subjectText;
  assert.equal(E.stableConcernId('physical_acceptance',newAnchor),E.stableConcernId('physical_acceptance',oldAnchor));
  const interpreted={...assignments,'0':{...assignments[0],subjectLabel:'Physical readiness gate'}};assert.doesNotThrow(()=>E.assignmentGroups([physical,release,record],interpreted,facts));
  assert.equal(interpreted[0].subjectSourceId,physical.latest[0]);assert.ok(!facts.find(fact=>fact.id===interpreted[0].subjectSourceId).quote.includes(interpreted[0].subjectLabel));
});


test('duplicate source pointer normalization is lossless, idempotent and leaves the original scope response untouched',()=>{
  const raw={G5:{topic:record.topic,status:'open',latest:[record.latest[0],record.latest[0]]}},before=JSON.stringify(raw),normalized=E.normalizeScopeReviews(raw);
  assert.equal(JSON.stringify(raw),before);assert.deepEqual(normalized.normalizedReviews.G5.latest,record.latest);assert.deepEqual(normalized.pointerNormalizations,[{groupId:'G5',field:'latest',original:[...record.latest,...record.latest],normalized:record.latest,reason:'duplicate_source_pointer'}]);
  const twice=E.normalizeScopeReviews(normalized.normalizedReviews);assert.deepEqual(twice.normalizedReviews,normalized.normalizedReviews);assert.deepEqual(twice.pointerNormalizations,[]);
});

test('duplicate pointer normalization retains the raw model response and explicit repair trace in a completed review',async()=>{
  const raw={...scopeReviews,G0:{...scopeReviews.G0,latest:[...physical.latest,...physical.latest]}},calls=[],queue=[{assignments},{assignments},{reviews:raw}],out=await E.consolidateCandidates(fakeEngine(queue,calls),[physical,release,record],rows,C);
  assert.equal(out.findings.length,2);assert.equal(out.pointerNormalizations.length,1);assert.deepEqual(out.consolidationHistory[0].scopeReviews,raw);assert.deepEqual(out.consolidationHistory[0].normalizedScopeReviews.G0.latest,physical.latest);assert.deepEqual(JSON.parse(out.responses.at(-1).raw).reviews.G0.latest,[...physical.latest,...physical.latest]);assert.deepEqual(out.items[0].latest,physical.latest);
});

test('pointer-set normalization cannot borrow foreign evidence, relax a scoped status or hide a stale source date',()=>{
  const candidates=[physical,release,record],withForeign=E.normalizeScopeReviews({G0:{...scopeReviews.G0,latest:[...physical.latest,...physical.latest,record.latest[0]]},G2:scopeReviews.G2});
  assert.ok(withForeign.normalizedReviews.G0.latest.includes(record.latest[0]));const groups=E.assignmentGroups(candidates,assignments,facts),partition=E.partitionFromReviews(groups,withForeign.normalizedReviews,candidates,assignments);assert.throws(()=>E.consolidatePartition(candidates,partition,facts,rows),/outside its members/);
  assert.throws(()=>E.consolidatePartition(candidates,[{...correct[0],latest:[...physical.latest,...physical.latest]},correct[1]],facts,rows),/repeated a source pointer/);
  const stale=E.normalizeScopeReviews({G0:{...scopeReviews.G0,latest:[...physical.facts,...physical.facts]},G2:scopeReviews.G2}),stalePartition=E.partitionFromReviews(groups,stale.normalizedReviews,candidates,assignments);assert.throws(()=>E.consolidatePartition(candidates,stalePartition,facts,rows),/predates/);
  assert.throws(()=>E.partitionFromReviews(groups,{...scopeReviews,G2:{...scopeReviews.G2,status:'resolved'}},candidates,assignments),/unsupported state/);
});
