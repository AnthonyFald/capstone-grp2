const test=require('node:test'),assert=require('node:assert/strict');
// Retain the pre-attachment J stage contracts; current K scope-gate tests are separate.
const C=require('../core.js'),E=require('../docs/input-history/engine-v18j-frozen.js');
const Previous=require('../docs/input-history/engine-v18f-frozen.js');
const PreviousDraft=require('../docs/input-history/engine-v18g-pilot.js');
const PreviousCompact=require('../docs/input-history/engine-v18h-compact.js');

// These deliberately small examples have no relationship to evaluation answers.
const rows=C.reports([
  {report_id:'M1',report_date:'2026-08-01',work_area:'Motor M9',issue_or_update:'Motor M9 vibration certificate is unavailable.',schedule_status:'The acceptance-result follow-up remains open.',action_required:'Submit the Motor M9 vibration certificate and attach its torque witness record.'},
  {report_id:'M2',report_date:'2026-08-02',work_area:'Motor M9',work_completed:'Motor M9 installation completed.',action_required:'Keep Motor M9 protected until the acceptance result is issued.'}
]);
const source=E.inventory(rows),fact=text=>source.facts.find(f=>f.quote===text),ids=item=>[...new Set([...item.facts,...item.latest])];
const certificate=fact('Motor M9 vibration certificate is unavailable.'),followup=fact('The acceptance-result follow-up remains open.'),compound=fact('Submit the Motor M9 vibration certificate and attach its torque witness record.'),protection=fact('Keep Motor M9 protected until the acceptance result is issued.');
function concern(aspect,concernId,question,selected,status='open'){
  return {topic:question,scopeQuestion:question,scopeTitle:'Review question: '+question,concernId,concernAspect:aspect,kind:E.ASPECTS[aspect].kind,status,facts:[selected],latest:[selected],memberCandidateIndices:[Number(concernId.at(-1))||0]};
}
const quality=concern('quality_followup','C-quality-2','Is Motor M9 protection and acceptance-result follow-up complete?',followup.id),cert=concern('supporting_record','C-cert-0','Is the Motor M9 vibration certificate submitted?',certificate.id),torque=concern('supporting_record','C-torque-1','Is the Motor M9 torque witness record attached?',compound.id);
const disposition=(label,aspect,kind,extra={})=>({componentLabel:label,aspect,disposition:kind,reasonCode:{routine:'ordinary_plan',already_completed_state:'source_reports_completed_state',closed:'explicit_later_closure',represented:'same_open_concern',add:'independent_unclosed_requirement'}[kind],targetConcernId:'none',additionKey:'none',closureSourceId:'none',...extra});
const typed=component=>({...component,evidenceRole:E.OBLIGATION_ROLES[component.disposition]});
const represented=(label,target,aspect=target.concernAspect)=>disposition(label,aspect,'represented',{targetConcernId:target.concernId});
const answer=(checking,coverage,additions=[])=>({checkingSourceFactIds:checking,coverage,additions});

test('the final audit checks compound tasks even when their sentence is already cited, plus conditional source passages',()=>{
  const checked=E.obligationSources(source).map(f=>f.id);
  assert.ok(checked.includes(compound.id));assert.ok(ids(torque).includes(compound.id));assert.ok(checked.includes(protection.id));assert.ok(checked.includes(followup.id));
  const input=C.reports([{report_id:'C1',report_date:'2026-08-01',supporting_evidence:'Protection remains required until the witness result is available.',work_completed:'A routine unloading operation completed.'}]);
  assert.equal(E.obligationSources(E.inventory(input)).length,1);
  const format=E.obligationSchema(E.obligationSources(source),[cert,torque,quality],source,0);
  assert.deepEqual(format.properties.coverage.required,checked);
  assert.equal(format.properties.coverage.additionalProperties,false);
  assert.ok(format.properties.coverage.properties[protection.id].items.properties.targetConcernId.enum.includes(quality.concernId));
  assert.deepEqual(format.properties.additions.items.properties.status.enum,['open','needs_verification']);
});

test('an omitted protection condition enriches its compatible open question with exact full evidence and an explicit pointer trace',()=>{
  const original=structuredClone(quality),out=E.applyObligationCoverage([quality],[answer([protection.id],{[protection.id]:[represented('Protection until the acceptance result',quality)]})],source,rows,3),item=out.items[0];
  assert.deepEqual(quality,original);assert.equal(item.concernId,quality.concernId);assert.equal(item.scopeQuestion,quality.scopeQuestion);assert.equal(item.status,'open');
  assert.deepEqual(new Set(ids(item)),new Set([followup.id,protection.id]));assert.equal(item.latest[0],protection.id);assert.equal(out.coverageAddedCandidates.length,0);
  assert.equal(item.coverageRequirements[0].quote,protection.quote);assert.equal(item.coverageRequirements[0].sourceFactId,protection.id);assert.equal(item.coverageRequirements[0].report_author,protection.report_author);assert.equal(item.coverageRequirements[0].disposition,'represented');
  assert.deepEqual(out.latestPointerAdjustments,[{concernId:quality.concernId,priorLatest:[followup.id],latest:[protection.id,followup.id],reason:'additional_open_obligation'}]);
  assert.deepEqual(out.appendOperations[0].priorSourceFactIds,[followup.id]);assert.equal(out.entries[0].components[0].quote,protection.quote);
  const rendered=E.render(out.items,source.facts,rows,C).findings[0];assert.ok(rendered.sourceFactIds.includes(protection.id));assert.equal(rendered.coverageRequirements[0].quote,protection.quote);assert.ok(rendered.evidence.some(e=>e.quote===protection.quote));
});

test('two requirements in an already-cited sentence remain linked to independently answerable document questions',()=>{
  const out=E.applyObligationCoverage([cert,torque],[answer([compound.id],{[compound.id]:[represented('Vibration certificate submission',cert),represented('Torque witness record attachment',torque)]})],source,rows,3);
  assert.equal(out.items.length,2);assert.equal(out.entries[0].components.length,2);assert.equal(out.appendOperations.length,2);
  assert.notEqual(out.items[0].coverageRequirements[0].requirementId,out.items[1].coverageRequirements[0].requirementId);
  assert.equal(out.items[0].scopeQuestion,cert.scopeQuestion);assert.equal(out.items[1].scopeQuestion,torque.scopeQuestion);
  for(const item of out.items)assert.equal(item.coverageRequirements[0].quote,compound.quote);
});

test('a remaining requirement cannot inherit a closed status, another aspect, or a missing target',()=>{
  for(const target of [{...quality,status:'resolved'},{...quality,status:'historical'},{...quality,concernAspect:'supporting_record'}])assert.throws(()=>E.applyObligationCoverage([target],[answer([protection.id],{[protection.id]:[represented('Protection condition',quality)]})],source,rows,3),/closed concern|another aspect/);
  assert.throws(()=>E.applyObligationCoverage([],[answer([protection.id],{[protection.id]:[represented('Protection condition',quality)]})],source,rows,3),/closed concern|another aspect/);
  const format=E.obligationSchema([protection],[{...quality,status:'resolved'},torque],source,0);assert.deepEqual(format.properties.coverage.properties[protection.id].items.properties.targetConcernId.enum,['none',torque.concernId]);
});

test('every audited source needs a bounded typed disposition and no invented ledger source or label is accepted',()=>{
  const valid=represented('Protection condition',quality);
  for(const coverage of [{},{[protection.id]:[valid],S999:[valid]},{[protection.id]:[]},{[protection.id]:[{...valid,componentLabel:'<b>Protection</b>'}]},{[protection.id]:[{...valid,componentLabel:'Protection\ncondition'}]},{[protection.id]:[{...valid,reasonCode:'ordinary_plan'}]},{[protection.id]:[{...valid,closureSourceId:followup.id}]}])assert.throws(()=>E.applyObligationCoverage([quality],[answer([protection.id],coverage)],source,rows,3),/ledger|component|disposition|closure/);
});

test('a closed component needs a separate dated closure citation and cannot silently mutate an existing concern',()=>{
  const laterRows=C.reports([...rows,{report_id:'M3',report_date:'2026-08-03',work_completed:'Protection was released after the accepted witness result.'}]),later=E.inventory(laterRows),closure=later.facts.at(-1);
  const closed=disposition('Protection condition','quality_followup','closed',{closureSourceId:closure.id});
  const out=E.applyObligationCoverage([quality],[answer([protection.id],{[protection.id]:[closed]})],later,laterRows,3);assert.deepEqual(ids(out.items[0]),ids(quality));assert.equal(out.items[0].status,'open');assert.equal(out.appendOperations.length,0);
  for(const closureSourceId of [protection.id,followup.id,'S999','none'])assert.throws(()=>E.applyObligationCoverage([quality],[answer([protection.id],{[protection.id]:[{...closed,closureSourceId}]})],later,laterRows,3),/separate dated closure/);
});

test('new independent obligations extend the global candidate indices and require their own component source',()=>{
  const addition={key:'A0-0',aspect:'quality_followup',topic:'Is Motor M9 protection complete after the acceptance result?',status:'open',facts:[protection.id],latest:[protection.id]},component=disposition('Protection condition','quality_followup','add',{additionKey:addition.key});
  const out=E.applyObligationCoverage([cert],[answer([protection.id],{[protection.id]:[component]},[addition])],source,rows,7);
  assert.equal(out.items[0].concernId,cert.concernId);assert.equal(out.coverageAddedCandidates.length,1);assert.deepEqual(out.coverageAddedCandidates[0].memberCandidateIndices,[7]);assert.equal(out.coverageAddedCandidates[0].origin,'source-obligation-audit');assert.equal(out.coverageAddedCandidates[0].coverageRequirements[0].disposition,'added');
  for(const invalid of [{...addition,status:'resolved'},{...addition,facts:[followup.id],latest:[followup.id]},{...addition,aspect:'supporting_record'}])assert.throws(()=>E.applyObligationCoverage([cert],[answer([protection.id],{[protection.id]:[component]},[invalid])],source,rows,7),/invalid addition|source component/);
  assert.throws(()=>E.applyObligationCoverage([cert],[answer([protection.id],{[protection.id]:[disposition('Routine plan','quality_followup','routine')]},[addition])],source,rows,7),/no ledger component/);
});

test('additional-obligation consolidation locks existing questions and states and refuses to merge two prior identities',()=>{
  const lock=item=>({...item,coverageLock:{concernId:item.concernId,scopeQuestion:item.scopeQuestion,status:item.status}}),old=lock(quality),fresh={...quality,concernId:undefined,memberCandidateIndices:[7]},group={id:'G0',members:[0,1],aspect:'quality_followup'};
  const format=E.scopeReviewSchema([group],[old,fresh],{preserveExisting:true}).properties.reviews.properties.G0.properties;
  assert.deepEqual(format.topic.enum,[quality.scopeQuestion]);assert.deepEqual(format.status.enum,['open']);
  assert.throws(()=>E.scopeReviewSchema([group],[old,lock({...quality,concernId:'C-other'})],{preserveExisting:true}),/two existing/);
  assert.throws(()=>E.scopeReviewSchema([group],[lock({...quality,status:'resolved'}),fresh],{preserveExisting:true}),/closed concern/);
  for(const change of [{topic:'Is some other task complete?'},{status:'needs_verification'}])assert.throws(()=>E.partitionFromReviews([group],{G0:{topic:quality.scopeQuestion,status:'open',latest:[followup.id],...change}},[old,fresh],null,{preserveExisting:true}),/existing concern identity/);
});

function fakeEngine(respond,calls){return {resetChat:async()=>{},chat:{completions:{create:async request=>{calls.push(request);const body=respond(request,calls.length-1);return {choices:[{message:{content:JSON.stringify(body)},finish_reason:'stop'}]};}}}};}
const atom={topic:quality.topic,kind:'closeout',status:'open',facts:[followup.id],latest:[followup.id]};
const assignment={aspect:'quality_followup',same_as:0,basisSourceId:followup.id,basisRole:E.ASPECTS.quality_followup.basisRole,subjectSourceId:followup.id,subjectLabel:'Motor M9 acceptance-result follow-up',subjectRole:E.ASPECTS.quality_followup.subjectRole};
const prefix=[{items:[atom]},{edits:[],additional:[]},{items:[]},{items:[]},{items:[]},{items:[]},{reviews:{'0':{verdict:'supported',reasonCode:'material_concern',facts:atom.facts,latest:atom.latest,status:'open'}}},{assignments:{'0':assignment}},{assignments:{'0':assignment}},{reviews:{G0:{topic:quality.topic,status:'open',latest:[followup.id]}}}];
function lastAudit(request){
  const data=JSON.parse(request.messages[1].content),target=data.existing_concerns[0];
  return {coverage:Object.fromEntries(data.checking_source_ids.map(id=>{const component=id===protection.id?disposition('Protection until acceptance result','quality_followup','represented',{targetConcernId:target.concernId}):disposition('Routine component review','quality_followup','routine');return [id,[Object.hasOwn(data,'draft_coverage')?typed(component):component]];})),additions:[]};
}

test('the entire previous request prefix remains byte-identical before the appended obligation audit',async()=>{
  const previousCalls=[],old=await Previous.generate(fakeEngine((request,index)=>{assert.ok(prefix[index]);return structuredClone(prefix[index]);},previousCalls),rows,C,{thorough:true});
  const calls=[],out=await E.generate(fakeEngine((request,index)=>index<prefix.length?structuredClone(prefix[index]):lastAudit(request),calls),rows,C,{thorough:true});
  assert.equal(previousCalls.length,10);assert.equal(calls.length,12);
  for(let index=0;index<previousCalls.length;index++)assert.equal(JSON.stringify(calls[index]),JSON.stringify(previousCalls[index]),'Earlier request '+index+' changed');
  assert.equal(out.responses.at(-1).stage,'Independently verifying source-obligation coverage');assert.equal(out.consolidationHistory.length,1);assert.equal(out.preConsolidationCandidates.length,1);assert.equal(out.coverageAddedCandidates.length,0);
  const finding=out.findings[0];assert.equal(finding.concernId,old.findings[0].concernId);assert.equal(finding.scopeQuestion,old.findings[0].scopeQuestion);assert.equal(finding.status,old.findings[0].status);assert.ok(finding.sourceFactIds.includes(protection.id));assert.equal(finding.coverageRequirements[0].quote,protection.quote);
  assert.equal(out.sourceObligationAudit.beforeConcerns[0].coverageRequirements,undefined);assert.equal(out.sourceObligationAudit.reconsolidated,false);assert.deepEqual(out.sourceObligationAudit.checkedSourceFactIds,E.obligationSources(source).map(f=>f.id));
  for(const call of calls){assert.ok(!JSON.stringify(call).includes('reference_issue'));assert.ok(!JSON.stringify(call).includes('expected_findings'));}
});

test('the basic model path also receives the final obligation audit',async()=>{
  const calls=[],base=[prefix[0],prefix[7],prefix[8],prefix[9]],out=await E.generate(fakeEngine((request,index)=>index<base.length?structuredClone(base[index]):lastAudit(request),calls),rows,C,{thorough:false});
  assert.equal(calls.length,6);assert.equal(out.responses.at(-1).stage,'Independently verifying source-obligation coverage');assert.ok(out.findings[0].sourceFactIds.includes(protection.id));assert.equal(out.materialityReviews.length,0);
});

test('an independent new document task receives boundary review while the old concern and its source anchor remain intact',async()=>{
  const calls=[],newQuestion='Is the Motor M9 torque witness record attached?',newAssignment={aspect:'supporting_record',same_as:1,basisSourceId:compound.id,basisRole:E.ASPECTS.supporting_record.basisRole,subjectSourceId:compound.id,subjectLabel:'Motor M9 torque witness record',subjectRole:E.ASPECTS.supporting_record.subjectRole};
  const out=await E.generate(fakeEngine((request,index)=>{
    if(index<prefix.length)return structuredClone(prefix[index]);
    if(index<=prefix.length+1){const value=lastAudit(request),component=disposition('Torque witness attachment','supporting_record','add',{additionKey:'A0-0'});value.coverage[compound.id]=[index===prefix.length+1?typed(component):component];value.additions=[{key:'A0-0',aspect:'supporting_record',topic:newQuestion,status:'open',facts:[compound.id],latest:[compound.id]}];return value;}
    if(index<prefix.length+4)return {assignments:{'0':{...assignment,subjectLabel:'Motor M9 acceptance-result task'},'1':newAssignment}};
    return {reviews:{G0:{topic:quality.topic,status:'open',latest:[protection.id]},G1:{topic:newQuestion,status:'open',latest:[compound.id]}}};
  },calls),rows,C,{thorough:true});
  assert.equal(calls.length,15);assert.equal(out.consolidationHistory.length,2);assert.equal(out.preConsolidationCandidates.length,1);assert.equal(out.coverageAddedCandidates.length,1);assert.deepEqual(out.coverageAddedCandidates[0].memberCandidateIndices,[1]);
  const first=out.consolidationHistory[0].concerns[0],preserved=out.items.find(item=>item.concernId===first.concernId),newItem=out.items.find(item=>item.concernId!==first.concernId);
  assert.equal(preserved.status,first.status);assert.equal(preserved.scopeQuestion,first.scopeQuestion);assert.deepEqual(preserved.sourceAnchor,first.sourceAnchor);assert.ok(ids(preserved).includes(followup.id));assert.ok(ids(preserved).includes(protection.id));assert.equal(newItem.scopeQuestion,newQuestion);assert.equal(newItem.coverageRequirements[0].quote,compound.quote);
  assert.deepEqual(out.consolidationHistory[1].preservedConcernIds,[first.concernId]);assert.equal(out.sourceObligationAudit.reconsolidated,true);assert.deepEqual(out.sourceObligationAudit.addedCandidateKeys,['A0-0']);
  assert.deepEqual(out.items.flatMap(item=>item.memberCandidateIndices).sort((a,b)=>a-b),[0,1]);
});

test('the typed critic schema fixes inactive pointers and constrains completion and closure to distinct evidence roles',()=>{
  const format=E.obligationReviewSchema([protection],[quality,cert,{...torque,status:'resolved'}],source,0),branches=format.properties.coverage.properties[protection.id].items.anyOf.map(b=>b.$ref?format.$defs[b.$ref.slice('#/$defs/'.length)]:b),branch=kind=>branches.filter(b=>b.properties.disposition.enum[0]===kind);
  for(const kind of ['routine','already_completed_state','closed'])for(const b of branch(kind)){assert.deepEqual(b.properties.targetConcernId.enum,['none']);assert.deepEqual(b.properties.additionKey.enum,['none']);assert.deepEqual(b.properties.evidenceRole.enum,[E.OBLIGATION_ROLES[kind]]);}
  assert.deepEqual(branch('already_completed_state')[0].properties.closureSourceId.enum,[protection.id]);assert.ok(!branch('closed')[0].properties.closureSourceId.enum.includes(protection.id));assert.ok(!branch('closed')[0].properties.closureSourceId.enum.includes(followup.id));
  const targets=branch('represented');assert.equal(targets.length,2);assert.deepEqual(targets.find(b=>b.properties.aspect.enum[0]==='quality_followup').properties.targetConcernId.enum,[quality.concernId]);assert.deepEqual(targets.find(b=>b.properties.aspect.enum[0]==='supporting_record').properties.targetConcernId.enum,[cert.concernId]);
});

test('an already-completed-state reminder cites its own exact source and cannot mutate a finding or relax pending-task closure',()=>{
  const contextRows=C.reports([...rows,{report_id:'M3',report_date:'2026-08-03',issue_or_update:'The signed motor release remains acknowledged.'}]),context=E.inventory(contextRows),reminder=context.facts.at(-1),component=typed(disposition('Acknowledged motor release reminder','physical_acceptance','already_completed_state',{closureSourceId:reminder.id}));
  const out=E.applyObligationCoverage([quality],[answer([reminder.id],{[reminder.id]:[component]})],context,contextRows,3,{typed:true});
  assert.equal(out.items[0].concernId,quality.concernId);assert.equal(out.items[0].scopeQuestion,quality.scopeQuestion);assert.equal(out.items[0].status,quality.status);assert.deepEqual(ids(out.items[0]),ids(quality));assert.equal(out.appendOperations.length,0);assert.equal(out.coverageAddedCandidates.length,0);assert.equal(out.entries[0].components[0].quote,reminder.quote);
  for(const change of [{closureSourceId:certificate.id},{targetConcernId:quality.concernId},{additionKey:'A0-0'},{evidenceRole:E.OBLIGATION_ROLES.closed}])assert.throws(()=>E.applyObligationCoverage([quality],[answer([reminder.id],{[reminder.id]:[{...component,...change}]})],context,contextRows,3,{typed:true}),/own source|disposition/);
  const pending=typed(disposition('Protection until documented result','quality_followup','closed',{closureSourceId:protection.id}));assert.throws(()=>E.applyObligationCoverage([quality],[answer([protection.id],{[protection.id]:[pending]})],source,rows,3,{typed:true}),/separate dated closure/);
});

test('all prior 18g requests including the draft ledger stay byte-identical before the appended strict critic',async()=>{
  const oldCalls=[],calls=[],respond=(request,index)=>index<prefix.length?structuredClone(prefix[index]):lastAudit(request);
  const old=await PreviousDraft.generate(fakeEngine(respond,oldCalls),rows,C,{thorough:true}),out=await E.generate(fakeEngine(respond,calls),rows,C,{thorough:true});
  assert.equal(oldCalls.length,11);assert.equal(calls.length,12);for(let index=0;index<oldCalls.length;index++)assert.equal(JSON.stringify(calls[index]),JSON.stringify(oldCalls[index]),'Prior draft-path request '+index+' changed');
  assert.deepEqual(out.sourceObligationAudit.initialRawLedgers,old.sourceObligationAudit.rawLedgers);assert.equal(out.sourceObligationAudit.version,'source-obligation-coverage-3');assert.equal(out.responses.at(-1).stage,'Independently verifying source-obligation coverage');
});

test('an invalid untrusted draft is retained unchanged and only the independent corrected ledger can affect evidence',async()=>{
  const calls=[],out=await E.generate(fakeEngine((request,index)=>{
    if(index<prefix.length)return structuredClone(prefix[index]);
    const value=lastAudit(request);
    if(index===prefix.length){const data=JSON.parse(request.messages[1].content);value.coverage[protection.id]=[disposition('Protection dismissed by earlier installation','work_progress','closed',{targetConcernId:data.existing_concerns[0].concernId,closureSourceId:certificate.id})];}
    return value;
  },calls),rows,C,{thorough:true});
  const audit=out.sourceObligationAudit,draft=audit.initialRawLedgers[0].coverage[protection.id],final=audit.rawLedgers[0].coverage[protection.id],correction=audit.ledgerCorrections[0].sourceComponents.find(c=>c.sourceFactId===protection.id);
  assert.equal(draft[0].disposition,'closed');assert.equal(draft[0].closureSourceId,certificate.id);assert.notEqual(draft[0].targetConcernId,'none');assert.equal(final[0].disposition,'represented');assert.equal(final[0].evidenceRole,E.OBLIGATION_ROLES.represented);
  assert.deepEqual(correction.before,draft);assert.deepEqual(correction.after,final);assert.deepEqual(audit.ledgerCorrections[0].beforeAdditions,[]);assert.deepEqual(audit.ledgerCorrections[0].afterAdditions,[]);
  assert.deepEqual(JSON.parse(out.responses[prefix.length].raw).coverage[protection.id],draft);assert.equal(out.findings[0].status,'open');assert.ok(out.findings[0].sourceFactIds.includes(protection.id));assert.equal(out.findings[0].coverageRequirements[0].quote,protection.quote);
});

test('standalone saved-candidate consolidation requests remain exactly compatible with the archived 18f component engine',async()=>{
  const queue=[{assignments:{'0':assignment}},{assignments:{'0':assignment}},{reviews:{G0:{topic:quality.topic,status:'open',latest:[followup.id]}}}],oldCalls=[],calls=[],respond=(request,index)=>structuredClone(queue[index]);
  const old=await Previous.consolidateCandidates(fakeEngine(respond,oldCalls),[atom],rows,C),out=await E.consolidateCandidates(fakeEngine(respond,calls),[atom],rows,C);
  assert.equal(calls.length,3);assert.deepEqual(calls,oldCalls);assert.equal(out.findings[0].concernId,old.findings[0].concernId);assert.equal(out.findings[0].scopeQuestion,old.findings[0].scopeQuestion);assert.deepEqual(out.findings[0].evidence,old.findings[0].evidence);
});

test('four-source critic batches retain source-specific closure bounds within a practical local-model prompt size',()=>{
  const input=C.reports(Array.from({length:20},(_,i)=>({report_id:'SAMPLE-'+i,report_date:'2026-08-'+String(i+1).padStart(2,'0'),issue_or_update:'Protection remains until witness result '+i+' is documented.'}))),inventory=E.inventory(input),format=E.obligationReviewSchema(inventory.facts.slice(0,4),[quality],inventory,0);
  assert.ok(JSON.stringify(format).length<20000,'Repeated full branch schemas would consume the local model context before the source audit');
  for(const def of Object.values(format.$defs))assert.ok(!JSON.stringify(def).includes('"$ref"'),'Shared branch definitions are deliberately non-recursive');
  for(const value of Object.values(format.properties.coverage.properties))for(const branch of value.items.anyOf)if(branch.$ref)assert.ok(Object.hasOwn(format.$defs,branch.$ref.slice('#/$defs/'.length)));
});

test('all full-review requests before the changed typed critic stay unchanged from 18h',async()=>{
  const oldCalls=[],calls=[],respond=(request,index)=>index<prefix.length?structuredClone(prefix[index]):lastAudit(request),old=await PreviousCompact.generate(fakeEngine(respond,oldCalls),rows,C,{thorough:true}),out=await E.generate(fakeEngine(respond,calls),rows,C,{thorough:true});
  assert.equal(calls.length,12);assert.deepEqual(calls.slice(0,-1),oldCalls.slice(0,-1));assert.notDeepEqual(calls.at(-1),oldCalls.at(-1));assert.equal(out.findings[0].concernId,old.findings[0].concernId);assert.equal(out.consolidationHistory[0].assignmentRepair,undefined);assert.equal(out.consolidationHistory[0].boundaryAssignments,undefined);
});

test('twenty sources retain one unchanged draft and receive five independent complete four-source reviews',async()=>{
  const input=C.reports(Array.from({length:20},(_,i)=>({report_id:'SAMPLE-'+i,report_date:'2026-08-'+String(i+1).padStart(2,'0'),issue_or_update:'The observation record '+i+' remains pending.'}))),calls=[];
  const out=await E.generate(fakeEngine((request,index)=>{if(index===0)return {items:[]};const data=JSON.parse(request.messages[1].content),isCritic=Object.hasOwn(data,'draft_coverage');return {coverage:Object.fromEntries(data.checking_source_ids.map(id=>{const component=disposition('Synthetic context disposition','supporting_record','routine');return [id,[isCritic?typed(component):component]];})),additions:[]};},calls),input,C,{thorough:false});
  assert.equal(calls.length,7);const audit=out.sourceObligationAudit;assert.equal(audit.initialRawLedgers.length,1);assert.equal(audit.rawLedgers.length,5);assert.equal(audit.criticBatchSize,4);assert.equal(audit.draftBatchSize,30);assert.deepEqual(audit.rawLedgers.flatMap(l=>l.checkingSourceFactIds),audit.checkedSourceFactIds);
  for(const correction of audit.ledgerCorrections){assert.equal(correction.checkingSourceFactIds.length,4);assert.deepEqual(correction.draftLedgerIndices,[0]);for(const entry of correction.sourceComponents)assert.deepEqual(entry.before,audit.initialRawLedgers[0].coverage[entry.sourceFactId]);}
  for(const request of calls.slice(2))assert.equal(JSON.parse(request.messages[1].content).reports.length,20);
});
