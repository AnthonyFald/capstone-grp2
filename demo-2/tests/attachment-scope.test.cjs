const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const E=require('../engine.js'),C=require('../core.js'),J=require('../docs/input-history/engine-v18j-frozen.js'),K=require('../docs/input-history/engine-v18k-frozen.js'),L=require('../docs/input-history/engine-v18l-frozen.js');
const rows=C.reports([
  {report_id:'T1',report_date:'2026-06-01',issue_or_update:'Pump-face inspection is on hold. Advance notice receipt is unconfirmed.',action_required:'Attach the torque record and notify adjacent trades when access is safe.'},
  {report_id:'T2',report_date:'2026-06-02',work_completed:'Pump-face acceptance was signed.',issue_or_update:'Anchor inspection remains unverified.',schedule_status:'Strength-result follow-up remains open.'},
  {report_id:'T3',report_date:'2026-06-03',issue_or_update:'The protected work area remains in use.',action_required:'Maintain enclosure protection until the strength result is documented.'}
]),source=E.inventory(rows),fact=quote=>source.facts.find(f=>f.quote===quote),ids=item=>[...new Set([...item.facts,...item.latest])];
const held=fact('Pump-face inspection is on hold.'),accepted=fact('Pump-face acceptance was signed.'),notice=fact('Advance notice receipt is unconfirmed.'),compound=fact('Attach the torque record and notify adjacent trades when access is safe.'),anchor=fact('Anchor inspection remains unverified.'),strength=fact('Strength-result follow-up remains open.'),protection=fact('Maintain enclosure protection until the strength result is documented.');
function concern(id,aspect,question,selected,status='open',latest=selected){return {concernId:id,concernAspect:aspect,kind:E.ASPECTS[aspect].kind,topic:question,scopeQuestion:question,scopeTitle:'Review question: '+question,status,facts:[selected],latest:[latest],memberCandidateIndices:[Number(id.at(-1))||0]};}
const face=concern('C-face-0','physical_acceptance','Was the pump-face inspection accepted?',held.id,'resolved',accepted.id),anchors=concern('C-anchor-1','physical_acceptance','Was the separate anchor inspection accepted?',anchor.id,'needs_verification'),record=concern('C-record-2','supporting_record','Is the torque record attached?',compound.id),advance=concern('C-advance-3','access_notice','Was the advance notice received?',notice.id,'needs_verification'),quality=concern('C-quality-4','quality_followup','Is strength-result follow-up complete?',strength.id),items=[face,anchors,record,advance,quality];
function component(kind,aspect,label,extra={}){return {componentLabel:label,aspect,disposition:kind,reasonCode:{routine:'ordinary_plan',already_completed_state:'source_reports_completed_state',closed:'explicit_later_closure',represented:'same_open_concern',add:'independent_unclosed_requirement'}[kind],evidenceRole:E.OBLIGATION_ROLES[kind],targetConcernId:'none',additionKey:'none',closureSourceId:'none',...extra};}
const represented=(target,label)=>component('represented',target.concernAspect,label,{targetConcernId:target.concernId});
function ledger(checking,coverage,additions=[]){return {checkingSourceFactIds:checking,coverage,additions};}
const proposed=ledger([held.id,compound.id],{[held.id]:[represented(anchors,'Inspection status')],[compound.id]:[represented(advance,'Torque attachment and safe-access notification')]});
function nestedTask(aspect,label,question,sourceId){const value=component('add',aspect,label);delete value.additionKey;value.addition={topic:question,status:'open',facts:[sourceId],latest:[sourceId]};return value;}

test('orphan-list correction preserves every linked candidate and cannot rewrite coverage, sources or valid additions',()=>{
  const linked={key:'A0-0',aspect:'quality_followup',topic:'Is enclosure protection complete?',status:'open',facts:[protection.id],latest:[protection.id]},orphan={...linked,key:'A0-1'},input=ledger([protection.id],{[protection.id]:[component('add','quality_followup','Protection',{additionKey:linked.key})]},[linked,orphan]);
  assert.throws(()=>E.applyObligationCoverage(items,[input],source,rows,5,{typed:true}),error=>error.code==='ORPHAN_OBLIGATION_ADDITION');
  const before=structuredClone(input),fixed=E.applyObligationAdditionRepair(input,{additions:[linked]});assert.deepEqual(input,before);assert.deepEqual(fixed.coverage,input.coverage);assert.deepEqual(fixed.additions,[linked]);assert.equal(E.applyObligationCoverage(items,[fixed],source,rows,5,{typed:true}).coverageAddedCandidates.length,1);
  for(const response of [{additions:[]},{additions:[{...linked,topic:'Changed question?'}]},{additions:[linked,orphan]},{additions:[linked],coverage:{}}])assert.throws(()=>E.applyObligationAdditionRepair(input,response),/repair/);
  const empty=ledger([protection.id],{[protection.id]:[represented(quality,'Protection condition')]},[orphan]),schema=E.obligationAdditionRepairSchema(empty);assert.equal(schema.properties.additions.maxItems,0);assert.deepEqual(E.applyObligationAdditionRepair(empty,{additions:[]}).additions,[]);
});

test('every represented component is reviewed once, including already-cited compound sources',()=>{
  const cases=E.requirementAttachmentCases([proposed]);assert.deepEqual(cases.map(c=>[c.caseId,c.sourceFactId,c.componentIndex]),[['L0',held.id,0],['L1',compound.id,0]]);assert.ok(ids(record).includes(compound.id));
  const format=E.requirementAttachmentSchema(cases,items,source,0);assert.deepEqual(format.properties.reviews.required,['L0','L1']);assert.ok(format.$defs.add.properties.addition);assert.ok(!Object.hasOwn(format.$defs.add.properties,'additionKey'));assert.deepEqual(format.$defs.add.properties.addition.properties.status.enum,['open','needs_verification']);
});

test('a mismatched physical subject can be closed by its own later proof without attaching it to another open inspection',()=>{
  const cases=E.requirementAttachmentCases([proposed]),reviews={L0:[component('closed','physical_acceptance','Pump-face inspection',{closureSourceId:accepted.id})],L1:[represented(record,'Torque record attachment'),nestedTask('quality_followup','Safe-access release notification','Has the safe-access release been communicated?',compound.id)]},out=E.applyRequirementAttachments([proposed],cases,[{checkingCaseIds:['L0','L1'],reviews}],source,items),applied=E.applyObligationCoverage(items,out.appliedLedgers,source,rows,5,{typed:true});
  assert.equal(out.appliedLedgers[0].coverage[held.id][0].disposition,'closed');assert.deepEqual(ids(applied.items.find(i=>i.concernId===anchors.concernId)),ids(anchors));assert.equal(applied.items.find(i=>i.concernId===anchors.concernId).coverageRequirements.length,0);assert.equal(applied.items.find(i=>i.concernId===face.concernId).status,'resolved');
  assert.equal(out.appliedLedgers[0].coverage[compound.id].length,2);assert.equal(out.appliedLedgers[0].additions[0].key,'R-L1-1');assert.deepEqual(out.appliedLedgers[0].additions[0].independentOfConcernIds,items.map(i=>i.concernId));assert.equal(applied.coverageAddedCandidates.length,1);assert.equal(applied.coverageAddedCandidates[0].coverageRequirements[0].quote,compound.quote);assert.equal(applied.items.find(i=>i.concernId===record.concernId).coverageRequirements[0].quote,compound.quote);
  for(const old of items){const after=applied.items.find(i=>i.concernId===old.concernId);assert.equal(after.scopeQuestion,old.scopeQuestion);assert.equal(after.status,old.status);for(const id of ids(old))assert.ok(ids(after).includes(id));}
});

test('compatible uncited conditions may enrich an open scope with the complete exact quotation',()=>{
  const input=ledger([protection.id],{[protection.id]:[represented(quality,'Protection until result')]}),cases=E.requirementAttachmentCases([input]),review={checkingCaseIds:['L0'],reviews:{L0:[represented(quality,'Protection until result')]}},fixed=E.applyRequirementAttachments([input],cases,[review],source,items),out=E.applyObligationCoverage(items,fixed.appliedLedgers,source,rows,5,{typed:true}),target=out.items.find(i=>i.concernId===quality.concernId);
  assert.equal(target.status,'open');assert.equal(target.scopeQuestion,quality.scopeQuestion);assert.ok(ids(target).includes(protection.id));assert.equal(target.coverageRequirements[0].quote,protection.quote);assert.equal(out.coverageAddedCandidates.length,0);
});

test('missing, repeated and malformed attachment reviews or unsupported nested sources fail closed',()=>{
  const cases=E.requirementAttachmentCases([proposed]);for(const answers of [[],[{checkingCaseIds:['L0','L1'],reviews:{L0:[proposed.coverage[held.id][0]]}}],[{checkingCaseIds:['L0'],reviews:{L0:[]} }],[{checkingCaseIds:['L0'],reviews:{L0:[proposed.coverage[held.id][0]]}},{checkingCaseIds:['L0'],reviews:{L0:[proposed.coverage[held.id][0]]}}]])assert.throws(()=>E.applyRequirementAttachments([proposed],cases,answers,source,items),/review/);
  const invalid=nestedTask('quality_followup','Unrelated task','Is an unrelated task complete?',strength.id);assert.throws(()=>E.applyRequirementAttachments([proposed],cases,[{checkingCaseIds:['L0','L1'],reviews:{L0:[component('closed','physical_acceptance','Inspection',{closureSourceId:accepted.id})],L1:[invalid]}}],source,items),/own source/);
  const wrongClosed=E.applyRequirementAttachments([proposed],cases,[{checkingCaseIds:['L0','L1'],reviews:{L0:[component('closed','physical_acceptance','Inspection',{closureSourceId:held.id})],L1:[represented(record,'Record')]}}],source,items);assert.throws(()=>E.applyObligationCoverage(items,wrongClosed.appliedLedgers,source,rows,5,{typed:true}),/separate dated closure/);
});

test('an independent task cannot merge back into any original concern directly or through another new candidate',()=>{
  const old={...quality,coverageLock:{concernId:quality.concernId,scopeQuestion:quality.scopeQuestion,status:quality.status}},fresh={topic:'Is enclosure protection complete?',kind:'closeout',concernAspect:'quality_followup',status:'open',facts:[protection.id],latest:[protection.id],independentOfConcernIds:items.map(i=>i.concernId),memberCandidateIndices:[5]},bridge={...fresh,independentOfConcernIds:[],memberCandidateIndices:[6]},pool=[old,fresh,bridge],assignment=(same_as,sourceId)=>({aspect:'quality_followup',same_as,basisSourceId:sourceId,basisRole:E.ASPECTS.quality_followup.basisRole,subjectSourceId:sourceId,subjectLabel:'Quality follow-up',subjectRole:E.ASPECTS.quality_followup.subjectRole});
  const format=E.consolidationSchema(pool).properties.assignments.properties;assert.ok(!format[0].properties.same_as.enum.includes(1));assert.ok(!format[1].properties.same_as.enum.includes(0));
  assert.throws(()=>E.assignmentGroups(pool,{'0':assignment(2,strength.id),'1':assignment(2,protection.id),'2':assignment(2,protection.id)},source.facts),/independently scoped/);
  assert.throws(()=>E.consolidatePartition(pool,[{members:[0,1,2],aspect:'quality_followup',kind:'closeout',topic:quality.topic,status:'open',latest:[protection.id]}],source.facts,rows),/independently scoped/);
  const merged=E.consolidatePartition([fresh,{...fresh,memberCandidateIndices:[6]}],[{members:[0,1],aspect:'quality_followup',kind:'closeout',topic:fresh.topic,status:'open',latest:[protection.id]}],source.facts,rows);assert.equal(merged.length,1);assert.deepEqual(merged[0].independentOfConcernIds,items.map(i=>i.concernId));
});

function fake(respond,calls){return {resetChat:async()=>{},chat:{completions:{create:async request=>{calls.push(request);return {choices:[{message:{content:JSON.stringify(await respond(request,calls.length-1))},finish_reason:'stop'}]};}}}};}
test('the actual rejected A response set reuses all26 whole J requests unchanged before the new repair and subject gate',async()=>{
  const parsed=JSON.parse(fs.readFileSync(require.resolve('../docs/development-v18j-native27-a-staged.json'),'utf8')),run=(parsed.runs||[parsed]).find(r=>r.runId==='f8ef6d40-7cbf-4a3a-a575-2757d19adbb0'),prior=run.diagnostics.responses,input=C.reports(run.reports),oldCalls=[],calls=[];
  assert.equal(prior.length,26);await assert.rejects(()=>J.generate(fake((request,index)=>JSON.parse(prior[index].raw),oldCalls),input,C),/no ledger component/);
  await assert.rejects(()=>E.generate(fake((request,index)=>{if(index<26)return JSON.parse(prior[index].raw);if(index===26)return {additions:[]};throw Error('STOP_BEFORE_NEW_SUBJECT_INFERENCE');},calls),input,C),error=>{assert.match(error.message,/STOP_BEFORE_NEW_SUBJECT_INFERENCE/);assert.equal(error.diagnostics.responses.length,27);assert.equal(error.diagnostics.responses.at(-1).stage,'Repairing unlinked obligation additions');return true;});
  assert.deepEqual(calls.slice(0,26),oldCalls);assert.equal(JSON.parse(calls[26].messages[1].content).orphan_addition_keys.length,9);assert.ok(JSON.parse(calls[27].messages[1].content).checking_source.id);
});

test('a full basic run publishes an unmatched requirement as an independent card after locked consolidation',async()=>{
  const input=C.reports([{report_id:'FULL1',report_date:'2026-06-01',issue_or_update:'The laboratory result remains unavailable.',schedule_status:'Strength-result follow-up remains open.',action_required:'Maintain enclosure protection until the strength result is documented.'}]),inventory=E.inventory(input),followup=inventory.facts[1],protect=inventory.facts[2],oldQuestion='Is strength-result follow-up complete?',newQuestion='Is enclosure protection complete after the documented result?',atom={topic:oldQuestion,kind:'closeout',status:'open',facts:[followup.id],latest:[followup.id]},calls=[];
  const assign=(same_as,fact,label)=>({aspect:'quality_followup',same_as,basisSourceId:fact.id,basisRole:E.ASPECTS.quality_followup.basisRole,subjectSourceId:fact.id,subjectLabel:label,subjectRole:E.ASPECTS.quality_followup.subjectRole});
  const oldAssignment=assign(0,followup,'Strength-result follow-up'),newAssignment=assign(1,protect,'Enclosure protection');
  const out=await E.generate(fake((request,index)=>{
    const data=JSON.parse(request.messages[1].content);
    if(index===0)return {items:[atom]};if(index===1||index===2)return {assignments:{0:oldAssignment}};if(index===3)return {reviews:{G0:{topic:oldQuestion,status:'open',latest:[followup.id]}}};
    if(index===4||index===5)return {coverage:Object.fromEntries(data.checking_source_ids.map(id=>[id,[id===protect.id?represented({concernId:data.existing_concerns[0].concernId,concernAspect:'quality_followup'},'Protection condition'):component('routine','quality_followup','Synthetic context')]])),additions:[]};
    if(index===6)return {reviews:{L0:[nestedTask('quality_followup','Enclosure protection',newQuestion,protect.id)]}};
    if(index===7||index===8)return {assignments:{0:oldAssignment,1:newAssignment}};
    if(index===9)return {reviews:{G0:{topic:oldQuestion,status:'open',latest:[followup.id]},G1:{topic:newQuestion,status:'open',latest:[protect.id]}}};
    return {reviews:{P0:{verdict:'retain',reasonCode:'source_scope_and_current_state_supported',sourceProofId:protect.id,sourceSpan:'Maintain enclosure protection',targetProofId:protect.id,targetSpan:'Maintain enclosure protection',chronologySourceIds:[protect.id],overlappingConcernId:'none'}}};
  },calls),input,C,{thorough:false});
  assert.equal(calls.length,11);assert.equal(out.findings.length,2);assert.equal(out.sourceObligationAudit.attachmentCases.length,1);assert.equal(out.sourceObligationAudit.attachmentReviewBatches.length,1);assert.equal(out.sourceObligationAudit.additionRepairs.length,0);assert.equal(out.coverageAddedCandidates.length,1);assert.equal(out.sourceObligationAudit.finalProductReview.cases.length,1);assert.equal(out.sourceObligationAudit.finalProductReview.abstentions.length,0);
  const old=out.sourceObligationAudit.beforeConcerns[0],kept=out.items.find(item=>item.concernId===old.concernId),added=out.items.find(item=>item.concernId!==old.concernId);assert.equal(kept.scopeQuestion,oldQuestion);assert.equal(kept.status,'open');assert.deepEqual(added.independentOfConcernIds,[old.concernId]);assert.equal(added.scopeQuestion,newQuestion);assert.equal(added.coverageRequirements[0].quote,protect.quote);assert.ok(ids(added).includes(protect.id));assert.ok(!ids(kept).includes(protect.id));assert.deepEqual(out.items.flatMap(item=>item.memberCandidateIndices).sort((a,b)=>a-b),[0,1]);
});

test('the retained G run reuses all19 whole J requests unchanged before new subject decisions',async()=>{
  const parsed=JSON.parse(fs.readFileSync(require.resolve('../docs/development-v18j-native27-g-staged.json'),'utf8')),run=(parsed.runs||[parsed]).at(-1),prior=run.responses,input=C.reports(run.reports),oldCalls=[],calls=[];assert.equal(prior.length,19);
  const old=await J.generate(fake((request,index)=>JSON.parse(prior[index].raw),oldCalls),input,C);assert.ok(old.findings.length);
  await assert.rejects(()=>E.generate(fake((request,index)=>{if(index<19)return JSON.parse(prior[index].raw);throw Error('STOP_BEFORE_NEW_SUBJECT_INFERENCE');},calls),input,C),/STOP_BEFORE_NEW_SUBJECT_INFERENCE/);
  assert.deepEqual(calls.slice(0,19),oldCalls);assert.ok(JSON.parse(calls[19].messages[1].content).checking_source.id);
});

test('independent source matching hides prior targets and treats resolved and open original scopes equally after the exact K prefixes',async()=>{
  for(const [name,prefix] of [['a',27],['g',19]]){
    const parsed=JSON.parse(fs.readFileSync(require.resolve('../docs/development-v18k-native27-'+name+'-staged.json'),'utf8')),run=(parsed.runs||[parsed]).at(-1),prior=run.responses,input=C.reports(run.reports),oldCalls=[],calls=[];
    const stop=(request,index)=>{if(index<prefix)return JSON.parse(prior[index].raw);throw Error('STOP_BEFORE_INDEPENDENT_SOURCE_MATCHING');};
    await assert.rejects(()=>K.generate(fake(stop,oldCalls),input,C),/STOP_BEFORE_INDEPENDENT_SOURCE_MATCHING/);
    await assert.rejects(()=>L.generate(fake(stop,calls),input,C),/STOP_BEFORE_INDEPENDENT_SOURCE_MATCHING/);
    assert.deepEqual(calls.slice(0,prefix),oldCalls.slice(0,prefix));assert.notDeepEqual(calls[prefix],oldCalls[prefix]);
    const data=JSON.parse(calls[prefix].messages[1].content),original=run.sourceObligationAudit.beforeConcerns,inventory=E.inventory(input),byId=new Map(inventory.facts.map(f=>[f.id,f]));
    assert.deepEqual(data.reports,inventory.reports);assert.equal(data.existing_concerns.length,original.length);assert.ok(data.existing_concerns.some(item=>item.status==='resolved'));assert.ok(data.existing_concerns.some(item=>['open','needs_verification'].includes(item.status)));
    for(const [index,scope] of data.existing_concerns.entries()){
      assert.equal(scope.concernId,original[index].concernId);assert.equal(scope.question,original[index].scopeQuestion);assert.equal(scope.status,original[index].status);
      assert.deepEqual(scope.original_evidence,ids(original[index]).map(id=>byId.get(id)));
    }
    for(const item of data.cases){assert.deepEqual(Object.keys(item),['caseId','sourceFactId','source','componentLabel','other_component_labels']);assert.equal(item.source.id,item.sourceFactId);assert.equal(typeof item.componentLabel,'string');assert.ok(item.other_component_labels.every(label=>typeof label==='string'));}
    for(const key of ['proposedComponent','proposed_target','targetConcernId','disposition','other_source_components'])assert.ok(!JSON.stringify(data.cases).includes('"'+key+'"'));
    assert.match(calls[prefix].messages[0].content,/resolved alternatives/);assert.match(calls[prefix].messages[0].content,/same\/later source/);
  }
});

test('novel source cases group selected indices once and preserve already-cited siblings and original additions',()=>{
  const input=ledger([compound.id],{[compound.id]:[represented(record,'Torque record attachment'),represented(advance,'Safe-access release'),represented(anchors,'Safe-access scope')]});
  const before=structuredClone(input),cases=E.novelRequirementAttachmentCases([input],items);assert.equal(cases.length,1);assert.deepEqual(cases[0].componentIndices,[1,2]);assert.equal(cases[0].proposedComponents.length,2);
  const reviews={L0:[nestedTask('quality_followup','Safe-access release notification','Has the safe-access release been communicated?',compound.id)]},out=E.applyNovelRequirementAttachments([input],cases,[{checkingCaseIds:['L0'],reviews}],source,items);
  assert.deepEqual(input,before);assert.deepEqual(out.appliedLedgers[0].coverage[compound.id][0],input.coverage[compound.id][0]);assert.equal(out.appliedLedgers[0].coverage[compound.id].length,2);assert.deepEqual(out.attachmentDecisions[0].before,input.coverage[compound.id].slice(1));assert.equal(out.appliedLedgers[0].additions[0].key,'R-L0-0');
  const applied=E.applyObligationCoverage(items,out.appliedLedgers,source,rows,5,{typed:true});assert.equal(applied.coverageAddedCandidates.length,1);assert.ok(!ids(applied.items.find(i=>i.concernId===anchors.concernId)).includes(compound.id));
  assert.throws(()=>E.applyNovelRequirementAttachments([input],[{...cases[0],componentIndices:[1]}],[{checkingCaseIds:['L0'],reviews}],source,items),/cases changed/);
  const citedOnly=ledger([compound.id],{[compound.id]:[represented(record,'Existing record citation')]});assert.deepEqual(E.novelRequirementAttachmentCases([citedOnly],items),[]);assert.deepEqual(E.applyNovelRequirementAttachments([citedOnly],[],[],source,items).appliedLedgers,[citedOnly]);
});

test('one-source review keeps the six-component final source cap and rejects an oversized replacement',()=>{
  const retained=Array.from({length:5},(_,i)=>represented(record,'Retained record '+i)),input=ledger([compound.id],{[compound.id]:[...retained,represented(advance,'Safe release')]}),cases=E.novelRequirementAttachmentCases([input],items),reviews={L0:[nestedTask('quality_followup','Release notification','Has the safe release been communicated?',compound.id),nestedTask('quality_followup','Release confirmation','Is safe access confirmed?',compound.id)]};
  const out=E.applyNovelRequirementAttachments([input],cases,[{checkingCaseIds:['L0'],reviews}],source,items);assert.throws(()=>E.applyObligationCoverage(items,out.appliedLedgers,source,rows,5,{typed:true}),/component list is invalid/);
});

test('M checks only novel attachments once per source after exact A27 and G19 prefixes',async()=>{
  for(const [name,prefix,count] of [['a',27,7],['g',19,4]]){
    const parsed=JSON.parse(fs.readFileSync(require.resolve('../docs/development-v18k-native27-'+name+'-staged.json'),'utf8')),run=(parsed.runs||[parsed]).at(-1),prior=run.responses,input=C.reports(run.reports),oldCalls=[],calls=[],stop=(request,index)=>{if(index<prefix)return JSON.parse(prior[index].raw);throw Error('STOP_BEFORE_SINGLE_SOURCE_INFERENCE');};
    await assert.rejects(()=>K.generate(fake(stop,oldCalls),input,C),/STOP_BEFORE_SINGLE_SOURCE_INFERENCE/);await assert.rejects(()=>E.generate(fake(stop,calls),input,C),/STOP_BEFORE_SINGLE_SOURCE_INFERENCE/);assert.deepEqual(calls.slice(0,prefix),oldCalls.slice(0,prefix));
    const audit=run.sourceObligationAudit,cases=E.novelRequirementAttachmentCases(audit.postOrphanLedgers,audit.beforeConcerns),data=JSON.parse(calls[prefix].messages[1].content),inventory=E.inventory(input),byId=new Map(inventory.facts.map(f=>[f.id,f]));assert.equal(cases.length,count);assert.equal(new Set(cases.map(c=>c.sourceFactId)).size,count);
    assert.deepEqual(Object.keys(data),['reports','checking_source','caseId','focus_component_labels','preserved_component_labels','existing_concerns']);assert.equal(data.checking_source.id,cases[0].sourceFactId);assert.equal(data.caseId,cases[0].caseId);assert.deepEqual(data.focus_component_labels,cases[0].proposedComponents.map(c=>c.componentLabel));
    for(const key of ['proposedComponents','targetConcernId','disposition','aspect'])assert.ok(!JSON.stringify({checking_source:data.checking_source,focus_component_labels:data.focus_component_labels,preserved_component_labels:data.preserved_component_labels}).includes('"'+key+'"'));
    for(const [index,scope] of data.existing_concerns.entries())assert.deepEqual(scope.original_evidence,ids(audit.beforeConcerns[index]).map(id=>byId.get(id)));
    const schema=JSON.parse(calls[prefix].response_format.schema);assert.deepEqual(schema.properties.reviews.required,[cases[0].caseId]);assert.match(calls[prefix].messages[0].content,/exactly ONE source sentence/);assert.match(calls[prefix].messages[0].content,/do NOT authorize importing another report's task/);
  }
});
