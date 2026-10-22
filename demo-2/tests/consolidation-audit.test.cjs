const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {auditRun,auditFiles}=require('../scripts/verify-consolidation.cjs');
const E=require('../engine.js'),D=require('../docs/input-history/engine-v18d-frozen.js'),C=require('../core.js');
// Retained model outputs only. These tests never load reference answers or judge model quality.
const fixturePath=path.join(__dirname,'../docs/development-v18c-consolidated-a-attempt3.json');
const fixture=JSON.parse(fs.readFileSync(fixturePath,'utf8')).runs[0];
const recoveredPath=path.join(__dirname,'../docs/development-v18f-native27-a-recovered.json');
const recoveredFixture=JSON.parse(fs.readFileSync(recoveredPath,'utf8')).runs[0];
const fresh=()=>structuredClone(fixture);
const freshRecovered=()=>structuredClone(recoveredFixture);
const hasCode=(result,code)=>result.errors.some(error=>error.code===code);
const selected=item=>[...new Set([...item.facts,...item.latest])];

function removalFixture(){
  const run=fresh(),removed=run.items.shift();
  const stage=run.consolidationHistory[0],prior=stage.concerns.find(item=>item.concernId===removed.concernId),index=stage.concerns.indexOf(prior);
  run.findings=run.findings.filter(finding=>finding.concernId!==removed.concernId);
  run.originalFindings=run.originalFindings.filter(finding=>finding.concernId!==removed.concernId);
  run.materialityReviews=[{index,verdict:'routine',reasonCode:'no_material_concern'}];
  run.materialityRemovals=[{index,concernId:removed.concernId,memberCandidateIndices:removed.memberCandidateIndices,verdict:'routine',reasonCode:'no_material_concern',explanation:'Test-only removal accounting fixture; this is not a semantic judgment.',retainedSourceFactIds:selected(prior),reviewedSourceFactIds:selected(prior)}];
  return run;
}

// Structural 18d fixtures derive only from retained source/output, with arbitrary exact
// substrings as subjects. They test grounding/accounting mechanics, never subject semantics.
function subjectFixture(){
  const run=fresh(),stage=run.consolidationHistory[0],bySource=new Map(run.sourceInventory.map(source=>[source.id,source])),byReport=new Map(run.reports.map(report=>[report.report_id,report]));
  run.promptVersion='daily-review-18d-consolidated';
  for(const [index,assignment] of Object.entries(stage.assignments)){
    const source=bySource.get(assignment.basisSourceId);
    Object.assign(assignment,{subjectSourceId:source.id,subjectText:source.quote.slice(0,Math.min(12+Number(index),source.quote.length)),subjectRole:D.ASPECTS[assignment.aspect].subjectRole});
  }
  stage.initialAssignments=structuredClone(stage.assignments);stage.boundaryChanges=[];
  const replacements=new Map();
  for(const group of stage.partition){
    group.subjectEvidence=group.members.map(index=>{const assignment=stage.assignments[index];return {candidateIndex:index,sourceId:assignment.subjectSourceId,text:assignment.subjectText,role:assignment.subjectRole};});
    const oldId=stage.candidateToConcern.find(mapping=>mapping.index===group.members[0]).concernId,concern=stage.concerns.find(item=>item.concernId===oldId),subject=group.subjectEvidence[0],source=bySource.get(subject.sourceId);
    const anchor={report_id:source.report_id,report_date:source.report_date,field:source.field,quote:source.quote,work_area:byReport.get(source.report_id).work_area,subjectText:subject.text};
    Object.assign(concern,{subjectEvidence:structuredClone(group.subjectEvidence),subjectText:subject.text,subjectRole:subject.role,sourceAnchor:anchor,concernId:D.stableConcernId(concern.concernAspect,anchor)});
    replacements.set(oldId,concern);
  }
  for(const mapping of stage.candidateToConcern)mapping.concernId=replacements.get(mapping.concernId).concernId;
  run.items=run.items.map(item=>structuredClone(replacements.get(item.concernId)));
  for(const collection of [run.findings,run.originalFindings])for(const finding of collection){
    const concern=replacements.get(finding.concernId);
    for(const key of ['concernId','sourceAnchor','subjectEvidence','subjectText','subjectRole'])finding[key]=structuredClone(concern[key]);
  }
  return run;
}

function atomicRemovalFixture(){
  const run=subjectFixture(),stage=run.consolidationHistory[0],group=stage.partition.find(value=>value.members.length===1&&value.members[0]<stage.inputCandidates.length-1);
  assert.ok(group);
  const index=group.members[0],removedId=stage.candidateToConcern.find(mapping=>mapping.index===index).concernId,prior=run.preConsolidationCandidates[index],rebase=value=>value>index?value-1:value;
  const rebaseAssignments=assignments=>Object.fromEntries(Object.entries(assignments).filter(([key])=>Number(key)!==index).map(([key,value])=>[String(rebase(Number(key))),{...value,same_as:rebase(value.same_as)}]));
  stage.inputCandidates.splice(index,1);
  stage.assignments=rebaseAssignments(stage.assignments);stage.initialAssignments=rebaseAssignments(stage.initialAssignments);
  stage.partition=stage.partition.filter(value=>value!==group).map(value=>({...value,members:value.members.map(rebase),subjectEvidence:value.subjectEvidence.map(subject=>({...subject,candidateIndex:rebase(subject.candidateIndex)}))}));
  stage.concerns=stage.concerns.filter(value=>value.concernId!==removedId).map(value=>({...value,subjectEvidence:value.subjectEvidence.map(subject=>({...subject,candidateIndex:rebase(subject.candidateIndex)}))}));
  stage.candidateToConcern=stage.candidateToConcern.filter(mapping=>mapping.index!==index).map(mapping=>({...mapping,index:rebase(mapping.index)}));
  run.items=structuredClone(stage.concerns);
  for(const key of ['findings','originalFindings'])run[key]=run[key].filter(finding=>finding.concernId!==removedId).map(finding=>({...finding,subjectEvidence:structuredClone(run.items.find(item=>item.concernId===finding.concernId).subjectEvidence)}));
  run.method='source-inventory-shared-concern-consolidation';
  run.materialityReviews=run.preConsolidationCandidates.map((candidate,i)=>({...structuredClone(candidate),index:i,verdict:i===index?'routine':'supported',reasonCode:i===index?'no_material_concern':'material_concern'}));
  run.materialityRemovals=[{index,concernId:null,memberCandidateIndices:prior.memberCandidateIndices,verdict:'routine',reasonCode:'no_material_concern',explanation:'Test-only atomic removal accounting; no semantic judgment.',retainedSourceFactIds:selected(prior),reviewedSourceFactIds:selected(prior)}];
  return run;
}

function labelFixture(base=subjectFixture()){
  const run=base,stage=run.consolidationHistory[0],bySource=new Map(run.sourceInventory.map(source=>[source.id,source]));
  run.promptVersion='daily-review-18e-consolidated';
  for(const key of ['assignments','initialAssignments'])for(const [index,assignment] of Object.entries(stage[key])){
    assignment.subjectLabel='AI grouping interpretation '+index;delete assignment.subjectText;
  }
  const replacements=new Map();
  for(const group of stage.partition){
    group.subjectEvidence=group.members.map(index=>{const assignment=stage.assignments[index];return {candidateIndex:index,sourceId:assignment.subjectSourceId,label:assignment.subjectLabel,role:assignment.subjectRole};});
    const oldId=stage.candidateToConcern.find(mapping=>mapping.index===group.members[0]).concernId,concern=stage.concerns.find(item=>item.concernId===oldId),subject=group.subjectEvidence[0],source=bySource.get(subject.sourceId);
    const anchor={...concern.sourceAnchor,report_id:source.report_id,report_date:source.report_date,field:source.field,quote:source.quote,subjectLabel:subject.label};delete anchor.subjectText;
    Object.assign(concern,{subjectEvidence:structuredClone(group.subjectEvidence),subjectLabel:subject.label,sourceAnchor:anchor,concernId:E.stableConcernId(concern.concernAspect,anchor)});delete concern.subjectText;
    replacements.set(oldId,concern);
  }
  for(const mapping of stage.candidateToConcern)mapping.concernId=replacements.get(mapping.concernId).concernId;
  run.items=run.items.map(item=>structuredClone(replacements.get(item.concernId)));
  for(const collection of [run.findings,run.originalFindings])for(const finding of collection){
    const concern=replacements.get(finding.concernId);
    for(const key of ['concernId','sourceAnchor','subjectEvidence','subjectLabel','subjectRole'])finding[key]=structuredClone(concern[key]);
    delete finding.subjectText;
  }
  run.materialityReconsiderations=[];
  return run;
}

function confirmedRoutineFixture(){
  const run=labelFixture(atomicRemovalFixture()),removal=run.materialityRemovals[0],initial=run.materialityReviews.find(review=>review.index===removal.index);
  const review={index:removal.index,verdict:'routine',reasonCode:'routine_completed_work',facts:[...initial.facts],latest:[...initial.latest],status:initial.status};
  run.materialityReconsiderations=[{index:removal.index,memberCandidateIndices:[...removal.memberCandidateIndices],initialReview:structuredClone(initial),review,outcome:'confirmed_routine',retainedSourceFactIds:[...removal.retainedSourceFactIds],acceptedSourceFactIds:[],explanation:'Test-only confirmed-removal trace; no semantic judgment.'}];
  Object.assign(removal,{initialReasonCode:initial.reasonCode,reasonCode:review.reasonCode,reviewedSourceFactIds:selected(review),adjudicated:true});
  return run;
}

function restoredRoutineFixture(){
  const run=labelFixture(),index=0,prior=run.preConsolidationCandidates[index];
  run.method='source-inventory-shared-concern-consolidation';
  run.materialityReviews=run.preConsolidationCandidates.map((candidate,i)=>({...structuredClone(candidate),index:i,verdict:i===index?'routine':'supported',reasonCode:i===index?'no_material_concern':'material_concern'}));
  const initial=run.materialityReviews[index],review={index,verdict:'supported',reasonCode:'material_concern',facts:[...prior.facts],latest:[...prior.latest],status:prior.status};
  run.materialityRemovals=[];
  run.materialityReconsiderations=[{index,memberCandidateIndices:[...prior.memberCandidateIndices],initialReview:structuredClone(initial),review,outcome:'restored',retainedSourceFactIds:selected(prior),acceptedSourceFactIds:selected(prior),explanation:'Test-only restored-candidate trace; no semantic judgment.'}];
  return run;
}

function syncScopeResponse(run,entry){
  const response=run.responses.find(value=>value.stage===entry.stage+' · verify each concern state');
  assert.ok(response);response.raw=JSON.stringify({reviews:entry.scopeReviews});
  run.pointerNormalizations=run.consolidationHistory.flatMap(history=>history.pointerNormalizations.map(trace=>({stage:history.stage,...trace})));
}
function refreshBoundaryChanges(entry){entry.boundaryChanges=entry.inputCandidates.flatMap((_,index)=>JSON.stringify(entry.initialAssignments[index])===JSON.stringify(entry.assignments[index])?[]:[{index,prior:structuredClone(entry.initialAssignments[index]),corrected:structuredClone(entry.assignments[index])}]);}

function obligationFixture(mode='routine'){
  // Every disposition here is a structural test choice, not an adjudication of these reports.
  const run=freshRecovered(),before=structuredClone(run.items),source={facts:run.sourceInventory},checking=E.obligationSources(source),covered=new Set(before.flatMap(selected)),ledgers=[];
  run.promptVersion='daily-review-18g-consolidated';
  for(let offset=0;offset<checking.length;offset+=30){
    const batch=checking.slice(offset,offset+30);
    ledgers.push({checkingSourceFactIds:batch.map(fact=>fact.id),coverage:Object.fromEntries(batch.map(fact=>[fact.id,[{componentLabel:'Structural audit component',aspect:'quality_followup',disposition:'routine',reasonCode:'ordinary_plan',targetConcernId:'none',additionKey:'none',closureSourceId:'none'}]])),additions:[]});
  }
  if(mode==='represented'){
    const target=before.find(item=>['open','needs_verification'].includes(item.status)),existing=new Set(selected(target)),newest=target.latest.map(id=>source.facts.find(fact=>fact.id===id).report_date).sort().at(-1),fact=checking.find(value=>!existing.has(value.id)&&value.report_date>newest);
    assert.ok(target);assert.ok(fact);
    const component=ledgers.find(ledger=>ledger.checkingSourceFactIds.includes(fact.id)).coverage[fact.id][0];
    Object.assign(component,{aspect:target.concernAspect,disposition:'represented',reasonCode:'same_open_concern',targetConcernId:target.concernId});
  }else if(mode==='add'){
    const fact=checking[0],component=ledgers[0].coverage[fact.id][0];
    Object.assign(component,{disposition:'add',reasonCode:'independent_unclosed_requirement',additionKey:'A0-0'});
    ledgers[0].additions.push({key:'A0-0',aspect:'quality_followup',topic:'Does this source requirement remain open?',status:'open',facts:[fact.id],latest:[fact.id]});
  }
  const applied=E.applyObligationCoverage(before,ledgers,source,run.reports,run.preConsolidationCandidates.length);
  run.coverageAddedCandidates=applied.coverageAddedCandidates;
  for(const ledger of ledgers)run.responses.push({stage:'Checking every remaining source obligation',raw:JSON.stringify({coverage:ledger.coverage,additions:ledger.additions})});
  let final=applied.items;
  if(applied.coverageAddedCandidates.length){
    const candidates=[...applied.items.map(item=>({...item,coverageLock:{concernId:item.concernId,scopeQuestion:item.scopeQuestion,status:item.status}})),...applied.coverageAddedCandidates],assignments={},reviews={},partition=[];
    for(const [index,candidate] of candidates.entries()){
      const sourceId=candidate.sourceAnchor?source.facts.find(fact=>fact.report_id===candidate.sourceAnchor.report_id&&fact.field===candidate.sourceAnchor.field&&fact.quote===candidate.sourceAnchor.quote).id:candidate.facts[0],aspect=candidate.concernAspect,spec=E.ASPECTS[aspect],label=candidate.subjectLabel||'Structural added requirement';
      assignments[index]={aspect,same_as:index,basisSourceId:sourceId,basisRole:spec.basisRole,subjectSourceId:sourceId,subjectLabel:label,subjectRole:spec.subjectRole};
      const review={topic:candidate.scopeQuestion||candidate.topic,status:candidate.status,latest:[...candidate.latest]};reviews['G'+index]=review;
      partition.push({...review,members:[index],aspect,kind:spec.kind,subjectEvidence:[{candidateIndex:index,sourceId,label,role:spec.subjectRole}]});
    }
    final=E.consolidatePartition(candidates,partition,source.facts,run.reports);
    const stage='Checking additional source obligations',history={stage,preservedConcernIds:before.map(item=>item.concernId),inputCandidates:candidates,initialAssignments:structuredClone(assignments),assignments,boundaryChanges:[],scopeReviews:structuredClone(reviews),normalizedScopeReviews:structuredClone(reviews),pointerNormalizations:[],partition,concerns:structuredClone(final),candidateToConcern:candidates.map((candidate,index)=>({index,concernId:final.find(item=>candidate.memberCandidateIndices.every(member=>item.memberCandidateIndices.includes(member))).concernId}))};
    run.consolidationHistory.push(history);
    run.responses.push({stage:stage+' · verify each concern state',raw:JSON.stringify({reviews})});
  }
  run.items=final;run.findings=E.render(final,source.facts,run.reports,C).findings;run.originalFindings=structuredClone(run.findings);
  run.pointerNormalizations=run.consolidationHistory.flatMap(entry=>entry.pointerNormalizations.map(trace=>({stage:entry.stage,...trace})));
  run.sourceObligationAudit={version:'source-obligation-coverage-1',checkedSourceFactIds:checking.map(fact=>fact.id),uncitedSourceFactIds:checking.filter(fact=>!covered.has(fact.id)).map(fact=>fact.id),entries:applied.entries,rawLedgers:ledgers,beforeConcerns:before,afterConcerns:structuredClone(final),candidateStartIndex:run.preConsolidationCandidates.length,representedAdditions:applied.appendOperations,latestPointerAdjustments:applied.latestPointerAdjustments,addedCandidateKeys:applied.coverageAddedCandidates.map(item=>item.coverageKey),reconsolidated:applied.coverageAddedCandidates.length>0};
  return run;
}

function criticFixture(mode='routine'){
  const run=obligationFixture(),audit=run.sourceObligationAudit;
  run.promptVersion='daily-review-18h-consolidated';audit.version='source-obligation-coverage-2';
  audit.initialRawLedgers=structuredClone(audit.rawLedgers);
  const sourceFactId=audit.rawLedgers[0].checkingSourceFactIds[0],draft=audit.initialRawLedgers[0].coverage[sourceFactId][0],component=audit.rawLedgers[0].coverage[sourceFactId][0];
  // Invalid inert draft references and an unused draft addition must remain unapplied.
  draft.targetConcernId=audit.beforeConcerns[0].concernId;
  audit.initialRawLedgers[0].additions.push({key:'A0-0',aspect:'quality_followup',topic:'Is this a draft-only requirement?',status:'open',facts:[sourceFactId],latest:[sourceFactId]});
  if(mode==='completed')Object.assign(component,{disposition:'already_completed_state',reasonCode:'source_reports_completed_state',closureSourceId:sourceFactId});
  if(mode==='closed'){
    const source=run.sourceInventory.find(fact=>fact.id===sourceFactId),closure=run.sourceInventory.find(fact=>fact.id!==sourceFactId&&fact.report_date>=source.report_date);
    Object.assign(component,{disposition:'closed',reasonCode:'explicit_later_closure',closureSourceId:closure.id});
  }
  if(mode==='split')audit.rawLedgers[0].coverage[sourceFactId].push({...component,componentLabel:'Second independently classified structural component'});
  for(const ledger of audit.rawLedgers)for(const components of Object.values(ledger.coverage))for(const entry of components)entry.evidenceRole=E.OBLIGATION_ROLES[entry.disposition];
  audit.ledgerCorrections=audit.rawLedgers.map((ledger,index)=>({checkingSourceFactIds:[...ledger.checkingSourceFactIds],sourceComponents:ledger.checkingSourceFactIds.map(id=>({sourceFactId:id,before:structuredClone(audit.initialRawLedgers[index].coverage[id]),after:structuredClone(ledger.coverage[id])})),beforeAdditions:structuredClone(audit.initialRawLedgers[index].additions),afterAdditions:structuredClone(ledger.additions)}));
  const drafts=run.responses.filter(response=>response.stage==='Checking every remaining source obligation');
  for(const [index,response] of drafts.entries())response.raw=JSON.stringify({coverage:audit.initialRawLedgers[index].coverage,additions:audit.initialRawLedgers[index].additions});
  for(const ledger of audit.rawLedgers)run.responses.push({stage:'Independently verifying source-obligation coverage',raw:JSON.stringify({coverage:ledger.coverage,additions:ledger.additions})});
  const applied=E.applyObligationCoverage(audit.beforeConcerns,audit.rawLedgers,{facts:run.sourceInventory},run.reports,run.preConsolidationCandidates.length,{typed:true});
  run.items=applied.items;run.findings=E.render(run.items,run.sourceInventory,run.reports,C).findings;run.originalFindings=structuredClone(run.findings);
  Object.assign(audit,{entries:applied.entries,afterConcerns:structuredClone(run.items),representedAdditions:applied.appendOperations,latestPointerAdjustments:applied.latestPointerAdjustments});
  return run;
}

function smallCriticFixture(mode='routine'){
  const run=criticFixture(mode),audit=run.sourceObligationAudit,old=structuredClone(audit.rawLedgers),originalDrafts=structuredClone(audit.initialRawLedgers);
  // Extra source-only test context exercises the nonaligned 30/4 batch boundary;
  // these structural ledger choices make no semantic claim about model output.
  run.reports=C.reports([...run.reports,{report_id:'AUDIT_BATCH',report_date:'2026-06-01',report_author:'Structural test fixture',issue_or_update:'Additional structural test context.',action_required:Array.from({length:32},(_,index)=>'Structural component '+index+' is listed.').join(' ')}]);
  run.sourceInventory=E.inventory(run.reports).facts;
  run.inputSha256=crypto.createHash('sha256').update(JSON.stringify(run.reports)).digest('hex');
  const sourceIds=E.obligationSources({facts:run.sourceInventory}).map(fact=>fact.id),routine={componentLabel:'Structural audit component',aspect:'quality_followup',disposition:'routine',reasonCode:'ordinary_plan',targetConcernId:'none',additionKey:'none',closureSourceId:'none'},beforeIds=new Set(audit.beforeConcerns.flatMap(selected));
  Object.assign(audit,{checkedSourceFactIds:sourceIds,uncitedSourceFactIds:sourceIds.filter(id=>!beforeIds.has(id)),initialRawLedgers:[]});
  for(let offset=0;offset<sourceIds.length;offset+=30){
    const checkingSourceFactIds=sourceIds.slice(offset,offset+30);
    audit.initialRawLedgers.push({checkingSourceFactIds,coverage:Object.fromEntries(checkingSourceFactIds.map(id=>[id,structuredClone(originalDrafts.find(ledger=>ledger.checkingSourceFactIds.includes(id))?.coverage[id]||[routine])])),additions:offset===0?structuredClone(originalDrafts[0].additions):[]});
  }
  run.promptVersion='daily-review-18j-consolidated';
  Object.assign(audit,{version:'source-obligation-coverage-3',draftBatchSize:30,criticBatchSize:4});
  audit.rawLedgers=[];
  for(let offset=0;offset<sourceIds.length;offset+=4){
    const checkingSourceFactIds=sourceIds.slice(offset,offset+4);
    audit.rawLedgers.push({checkingSourceFactIds,coverage:Object.fromEntries(checkingSourceFactIds.map(id=>[id,structuredClone(old.find(ledger=>ledger.checkingSourceFactIds.includes(id))?.coverage[id]||[{...routine,evidenceRole:E.OBLIGATION_ROLES.routine}])])),additions:[]});
  }
  audit.ledgerCorrections=audit.rawLedgers.map(ledger=>{
    const draftLedgerIndices=audit.initialRawLedgers.flatMap((draft,index)=>ledger.checkingSourceFactIds.some(id=>draft.checkingSourceFactIds.includes(id))?[index]:[]),drafts=draftLedgerIndices.map(index=>audit.initialRawLedgers[index]);
    return {checkingSourceFactIds:[...ledger.checkingSourceFactIds],draftLedgerIndices,sourceComponents:ledger.checkingSourceFactIds.map(id=>({sourceFactId:id,before:structuredClone(audit.initialRawLedgers.find(draft=>draft.checkingSourceFactIds.includes(id)).coverage[id]),after:structuredClone(ledger.coverage[id])})),beforeAdditions:drafts.every(draft=>Array.isArray(draft.additions))?structuredClone(drafts.flatMap(draft=>draft.additions)):null,afterAdditions:structuredClone(ledger.additions)};
  });
  run.responses=run.responses.filter(response=>!['Checking every remaining source obligation','Independently verifying source-obligation coverage'].includes(response.stage));
  for(const ledger of audit.initialRawLedgers)run.responses.push({stage:'Checking every remaining source obligation',raw:JSON.stringify({coverage:ledger.coverage,additions:ledger.additions})});
  for(const ledger of audit.rawLedgers)run.responses.push({stage:'Independently verifying source-obligation coverage',raw:JSON.stringify({coverage:ledger.coverage,additions:ledger.additions})});
  const applied=E.applyObligationCoverage(audit.beforeConcerns,audit.rawLedgers,{facts:run.sourceInventory},run.reports,run.preConsolidationCandidates.length,{typed:true});
  run.items=applied.items;run.findings=E.render(run.items,run.sourceInventory,run.reports,C).findings;run.originalFindings=structuredClone(run.findings);
  Object.assign(audit,{entries:applied.entries,afterConcerns:structuredClone(run.items),representedAdditions:applied.appendOperations,latestPointerAdjustments:applied.latestPointerAdjustments});
  return run;
}

function assignmentRepairFixture({repair=true}={}){
  const run=criticFixture(),history=run.consolidationHistory[0];run.promptVersion='daily-review-18i-consolidated';
  if(!repair)return run;
  const accepted=structuredClone(history.assignments),index=0,foreign=history.inputCandidates.findIndex((_,i)=>accepted[i].aspect!==accepted[index].aspect);
  assert.ok(foreign>=0);
  const boundary=structuredClone(accepted);boundary[index].same_as=foreign;
  const links=Object.fromEntries(history.inputCandidates.map((_,i)=>[String(i),{same_as:accepted[i].same_as}])),stage=history.stage+' · repair invalid cross-aspect links';
  history.boundaryAssignments=structuredClone(boundary);
  history.assignmentRepair={stage,reason:'cross_aspect_same_as',error:{code:'CROSS_ASPECT_ASSIGNMENT',message:'Different concern aspects cannot be merged.'},violations:[{candidateIndex:index,targetIndex:foreign,aspect:boundary[index].aspect,targetAspect:boundary[foreign].aspect}],inputAssignments:structuredClone(boundary),linkReviews:links,assignments:structuredClone(accepted),changedLinks:[{candidateIndex:index,before:foreign,after:accepted[index].same_as}]};
  const criticIndex=run.responses.findIndex(response=>response.stage===history.stage+' · independently audit concern boundaries');
  assert.ok(criticIndex>=0);run.responses[criticIndex].raw=JSON.stringify({assignments:boundary});
  run.responses.splice(criticIndex+1,0,{stage,raw:JSON.stringify({links})});
  return run;
}

function fullAssignmentRepairFixture(){
  const run=smallCriticFixture(),history=run.consolidationHistory[0],accepted=structuredClone(history.assignments),index=history.inputCandidates.findIndex((_,i)=>accepted[i].same_as!==i&&!Object.entries(accepted).some(([key,value])=>Number(key)!==i&&value.same_as===i));
  assert.ok(index>=0);
  const boundary=structuredClone(accepted),aspect=accepted[index].aspect==='work_progress'?'supporting_record':'work_progress',spec=E.ASPECTS[aspect];
  Object.assign(boundary[index],{aspect,basisRole:spec.basisRole,subjectLabel:'Structural incorrect draft classification',subjectRole:spec.subjectRole});
  const stage=history.stage+' · repair invalid concern assignments',changedFields=Object.keys(accepted).flatMap(key=>{const fields=Object.keys(accepted[key]).filter(field=>accepted[key][field]!==boundary[key][field]);return fields.length?[{candidateIndex:Number(key),fields,before:structuredClone(boundary[key]),after:structuredClone(accepted[key])}]:[];});
  history.boundaryAssignments=structuredClone(boundary);
  history.assignmentRepair={stage,reason:'cross_aspect_assignment',error:{code:'CROSS_ASPECT_ASSIGNMENT',message:'Different concern aspects cannot be merged.'},violations:[{candidateIndex:index,targetIndex:boundary[index].same_as,aspect,targetAspect:boundary[boundary[index].same_as].aspect}],inputAssignments:structuredClone(boundary),assignmentReviews:structuredClone(accepted),assignments:structuredClone(accepted),changedLinks:[],changedFields};
  const criticIndex=run.responses.findIndex(response=>response.stage===history.stage+' · independently audit concern boundaries');
  assert.ok(criticIndex>=0);run.responses[criticIndex].raw=JSON.stringify({assignments:boundary});
  run.responses.splice(criticIndex+1,0,{stage,raw:JSON.stringify({assignments:accepted})});
  return run;
}

function finishCoverageFixture(run,audit){
  const source={facts:run.sourceInventory},applied=E.applyObligationCoverage(audit.beforeConcerns,audit.appliedLedgers,source,run.reports,run.preConsolidationCandidates.length,{typed:true});
  run.coverageAddedCandidates=applied.coverageAddedCandidates;let final=applied.items;
  run.consolidationHistory=run.consolidationHistory.slice(0,1);
  if(applied.coverageAddedCandidates.length){
    const candidates=[...applied.items.map(item=>({...item,coverageLock:{concernId:item.concernId,scopeQuestion:item.scopeQuestion,status:item.status}})),...applied.coverageAddedCandidates],assignments={},reviews={},partition=[];
    for(const [index,candidate] of candidates.entries()){
      const sourceId=candidate.sourceAnchor?source.facts.find(fact=>fact.report_id===candidate.sourceAnchor.report_id&&fact.field===candidate.sourceAnchor.field&&fact.quote===candidate.sourceAnchor.quote).id:candidate.facts[0],aspect=candidate.concernAspect,spec=E.ASPECTS[aspect],label=candidate.subjectLabel||'Structural independently reviewed task';
      assignments[index]={aspect,same_as:index,basisSourceId:sourceId,basisRole:spec.basisRole,subjectSourceId:sourceId,subjectLabel:label,subjectRole:spec.subjectRole};
      const review={topic:candidate.scopeQuestion||candidate.topic,status:candidate.status,latest:[...candidate.latest]};reviews['G'+index]=review;
      partition.push({...review,members:[index],aspect,kind:spec.kind,subjectEvidence:[{candidateIndex:index,sourceId,label,role:spec.subjectRole}]});
    }
    final=E.consolidatePartition(candidates,partition,source.facts,run.reports);
    const stage='Checking additional source obligations',history={stage,preservedConcernIds:audit.beforeConcerns.map(item=>item.concernId),inputCandidates:candidates,initialAssignments:structuredClone(assignments),assignments,boundaryChanges:[],scopeReviews:structuredClone(reviews),normalizedScopeReviews:structuredClone(reviews),pointerNormalizations:[],partition,concerns:structuredClone(final),candidateToConcern:candidates.map((candidate,index)=>({index,concernId:final.find(item=>candidate.memberCandidateIndices.every(member=>item.memberCandidateIndices.includes(member))).concernId}))};
    run.consolidationHistory.push(history);
    run.responses.push({stage:stage+' · independently audit concern boundaries',raw:JSON.stringify({assignments})},{stage:stage+' · verify each concern state',raw:JSON.stringify({reviews})});
  }
  run.items=final;run.findings=E.render(final,source.facts,run.reports,C).findings;run.originalFindings=structuredClone(run.findings);
  run.pointerNormalizations=run.consolidationHistory.flatMap(entry=>entry.pointerNormalizations.map(trace=>({stage:entry.stage,...trace})));
  Object.assign(audit,{entries:applied.entries,afterConcerns:structuredClone(final),representedAdditions:applied.appendOperations,latestPointerAdjustments:applied.latestPointerAdjustments,addedCandidateKeys:applied.coverageAddedCandidates.map(item=>item.coverageKey),reconsolidated:applied.coverageAddedCandidates.length>0});
}

function attachmentFixture({split=false,linkedAddition=false,orphan=true}={}){
  const run=smallCriticFixture(),audit=run.sourceObligationAudit,ledger=audit.rawLedgers[0],sourceFactId=ledger.checkingSourceFactIds[0],target=audit.beforeConcerns.find(item=>['open','needs_verification'].includes(item.status));
  run.promptVersion='daily-review-18k-consolidated';audit.version='source-obligation-coverage-4';audit.attachmentBatchSize=4;
  Object.assign(ledger.coverage[sourceFactId][0],{aspect:target.concernAspect,disposition:'represented',reasonCode:'same_open_concern',evidenceRole:E.OBLIGATION_ROLES.represented,targetConcernId:target.concernId});
  if(linkedAddition){
    ledger.coverage[sourceFactId].push({...ledger.coverage[sourceFactId][0],componentLabel:'An independently listed structural component',aspect:'quality_followup',disposition:'add',reasonCode:'independent_unclosed_requirement',evidenceRole:E.OBLIGATION_ROLES.add,targetConcernId:'none',additionKey:'A0-0'});
    ledger.additions.push({key:'A0-0',aspect:'quality_followup',topic:'Does this originally linked structural task remain open?',status:'open',facts:[sourceFactId],latest:[sourceFactId]});
  }
  if(orphan)ledger.additions.push({key:'A0-23',aspect:'quality_followup',topic:'Is this unlinked draft addition still present?',status:'open',facts:[sourceFactId],latest:[sourceFactId]});
  audit.ledgerCorrections=audit.rawLedgers.map(raw=>{
    const draftLedgerIndices=audit.initialRawLedgers.flatMap((draft,index)=>raw.checkingSourceFactIds.some(id=>draft.checkingSourceFactIds.includes(id))?[index]:[]),drafts=draftLedgerIndices.map(index=>audit.initialRawLedgers[index]);
    return {checkingSourceFactIds:[...raw.checkingSourceFactIds],draftLedgerIndices,sourceComponents:raw.checkingSourceFactIds.map(id=>({sourceFactId:id,before:structuredClone(audit.initialRawLedgers.find(draft=>draft.checkingSourceFactIds.includes(id)).coverage[id]),after:structuredClone(raw.coverage[id])})),beforeAdditions:structuredClone(drafts.flatMap(draft=>draft.additions)),afterAdditions:structuredClone(raw.additions)};
  });
  run.responses=run.responses.filter(response=>response.stage!=='Independently verifying source-obligation coverage');
  for(const raw of audit.rawLedgers)run.responses.push({stage:'Independently verifying source-obligation coverage',raw:JSON.stringify({coverage:raw.coverage,additions:raw.additions})});
  audit.postOrphanLedgers=structuredClone(audit.rawLedgers);audit.additionRepairs=[];
  if(orphan){
    const before=structuredClone(ledger),response={additions:structuredClone(ledger.additions.filter(addition=>addition.key!=='A0-23'))},after=E.applyObligationAdditionRepair(before,response),stage='Repairing unlinked obligation additions';
    audit.postOrphanLedgers[0]=after;audit.additionRepairs.push({stage,checkingSourceFactIds:[...ledger.checkingSourceFactIds],orphanAdditionKeys:['A0-23'],error:{code:'ORPHAN_OBLIGATION_ADDITION',message:'An obligation addition has no ledger component.'},before,response,after:structuredClone(after)});
    run.responses.push({stage,raw:JSON.stringify(response)});
  }
  audit.attachmentCases=E.requirementAttachmentCases(audit.postOrphanLedgers);audit.attachmentReviewBatches=[];
  for(let offset=0;offset<audit.attachmentCases.length;offset+=4){
    const cases=audit.attachmentCases.slice(offset,offset+4),reviews=Object.fromEntries(cases.map(item=>{
      const components=[structuredClone(item.proposedComponent)];
      if(split){const {additionKey:ignored,...component}=item.proposedComponent;components.push({...component,componentLabel:'A separate structural test task',aspect:'quality_followup',disposition:'add',reasonCode:'independent_unclosed_requirement',evidenceRole:E.OBLIGATION_ROLES.add,targetConcernId:'none',addition:{topic:'Does the separately reviewed structural task remain open?',status:'open',facts:[item.sourceFactId],latest:[item.sourceFactId]}});}
      return [item.caseId,components];
    }));
    audit.attachmentReviewBatches.push({checkingCaseIds:cases.map(item=>item.caseId),reviews});run.responses.push({stage:'Independently verifying requirement attachments',raw:JSON.stringify({reviews})});
  }
  const attached=E.applyRequirementAttachments(audit.postOrphanLedgers,audit.attachmentCases,audit.attachmentReviewBatches,{facts:run.sourceInventory},audit.beforeConcerns);
  Object.assign(audit,attached);finishCoverageFixture(run,audit);return JSON.parse(JSON.stringify(run));
}

function novelSourceFixture(){
  // The source/retained prefix is real; replacement choices below are structural
  // fixtures only and do not adjudicate any source task or model prediction.
  const run=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/development-v18k-native27-a-staged.json'),'utf8')).runs[0],audit=run.sourceObligationAudit;
  run.promptVersion='daily-review-18m-consolidated';
  Object.assign(audit,{version:'source-obligation-coverage-5',attachmentSelection:'novel-original-evidence-only',attachmentReviewScope:'Only new source quotations are independently matched; already-cited component labels remain unverified AI metadata.',attachmentBatchSize:1});
  const sourceCase=E.novelRequirementAttachmentCases(audit.postOrphanLedgers,audit.beforeConcerns).find(item=>item.componentIndices.length>1),raw=audit.rawLedgers[sourceCase.ledgerIndex],post=audit.postOrphanLedgers[sourceCase.ledgerIndex],sourceId=sourceCase.sourceFactId;
  assert.ok(sourceCase);
  const routine={componentLabel:'Untouched structural context between selected tasks',aspect:'quality_followup',disposition:'routine',reasonCode:'ordinary_plan',evidenceRole:E.OBLIGATION_ROLES.routine,targetConcernId:'none',additionKey:'none',closureSourceId:'none'};
  raw.coverage[sourceId].splice(1,0,structuredClone(routine));post.coverage[sourceId].splice(1,0,structuredClone(routine));
  audit.ledgerCorrections[sourceCase.ledgerIndex].sourceComponents.find(component=>component.sourceFactId===sourceId).after=structuredClone(raw.coverage[sourceId]);
  const critics=run.responses.filter(response=>response.stage==='Independently verifying source-obligation coverage');
  critics[sourceCase.ledgerIndex].raw=JSON.stringify({coverage:raw.coverage,additions:raw.additions});
  run.responses=run.responses.filter(response=>response.stage!=='Independently verifying requirement attachments');
  audit.attachmentCases=E.novelRequirementAttachmentCases(audit.postOrphanLedgers,audit.beforeConcerns);
  audit.attachmentReviewBatches=audit.attachmentCases.map(item=>({checkingCaseIds:[item.caseId],reviews:{[item.caseId]:item.sourceFactId===sourceId?[structuredClone(item.proposedComponents[0])]:structuredClone(item.proposedComponents)}}));
  for(const batch of audit.attachmentReviewBatches)run.responses.push({stage:'Independently verifying requirement attachments',raw:JSON.stringify({reviews:batch.reviews})});
  Object.assign(audit,E.applyNovelRequirementAttachments(audit.postOrphanLedgers,audit.attachmentCases,audit.attachmentReviewBatches,{facts:run.sourceInventory},audit.beforeConcerns));
  finishCoverageFixture(run,audit);return JSON.parse(JSON.stringify(run));
}

function productFixture({retainNew=false,retainGuardedAttachment=false}={}){
  // Final-review verdicts below are structural test decisions, never model scores.
  const run=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/development-v18m-native27-a-staged.json'),'utf8')).runs[0],audit=run.sourceObligationAudit,source={facts:run.sourceInventory},preEntailmentConcerns=structuredClone(run.items),preEntailmentLedgers=structuredClone(audit.appliedLedgers),preEntailmentAddedCandidates=structuredClone(run.coverageAddedCandidates),cases=E.productChangeCases(audit.beforeConcerns,preEntailmentConcerns,preEntailmentAddedCandidates,preEntailmentLedgers),byId=new Map(source.facts.map(fact=>[fact.id,fact]));
  run.promptVersion='daily-review-18n-consolidated';audit.version='source-obligation-coverage-6';
  const retainedNew=retainNew?cases.filter(item=>item.type==='new_concern').at(-1):null,guarded=retainGuardedAttachment?cases.find(item=>item.type==='attachment'&&!E.subjectDisambiguation(audit.beforeConcerns.find(target=>target.concernId===item.originalConcernId),audit.beforeConcerns,source,item.sourceFactId).passed):null;
  if(retainGuardedAttachment)assert.ok(guarded,'Fixture must exercise the explicit subject-disambiguation guard.');
  const stage='Independently checking final product changes',rawReviews=cases.map(item=>{
    const review={verdict:'abstain',reasonCode:'unverified_remaining_state',sourceProofId:'none',sourceSpan:'',targetProofId:'none',targetSpan:'',chronologySourceIds:[source.facts.at(-1).id],overlappingConcernId:'none'};
    if(item===retainedNew||item===guarded){const target=(item.type==='attachment'?audit.beforeConcerns:preEntailmentConcerns).find(concern=>concern.concernId===(item.originalConcernId||item.proposedConcernId)),sourceProof=byId.get(item.sourceFactIds[0]),targetProof=byId.get(selected(target)[0]);Object.assign(review,{verdict:'retain',reasonCode:'source_scope_and_current_state_supported',sourceProofId:sourceProof.id,sourceSpan:sourceProof.quote.slice(0,30),targetProofId:targetProof.id,targetSpan:targetProof.quote.slice(0,30)});}
    run.responses.push({stage,raw:JSON.stringify({reviews:{[item.caseId]:review}})});return {checkingCaseIds:[item.caseId],reviews:{[item.caseId]:review}};
  });
  const applied=E.applyProductChangeReviews(audit.beforeConcerns,preEntailmentConcerns,preEntailmentAddedCandidates,preEntailmentLedgers,cases,rawReviews,source,run.reports,run.preConsolidationCandidates.length);
  audit.finalProductReview={version:'product-change-entailment-1',stage,batchSize:1,preEntailmentConcerns,preEntailmentLedgers,preEntailmentAddedCandidates,cases,rawReviews,decisions:applied.decisions,abstentions:applied.abstentions,additionRemovals:applied.additionRemovals};
  Object.assign(audit,{appliedLedgers:applied.appliedLedgers,entries:applied.entries,afterConcerns:structuredClone(applied.items),representedAdditions:applied.appendOperations,latestPointerAdjustments:applied.latestPointerAdjustments,addedCandidateKeys:applied.coverageAddedCandidates.map(item=>item.coverageKey)});
  run.items=applied.items;run.coverageAddedCandidates=applied.coverageAddedCandidates;run.findings=E.render(run.items,source.facts,run.reports,C).findings;run.originalFindings=structuredClone(run.findings);
  return JSON.parse(JSON.stringify(run));
}

test('retained 18c model output passes evidence, accounting and complete TXT checks',()=>{
  const result=auditRun(fresh());
  assert.equal(result.ok,true,JSON.stringify(result.errors));
  assert.equal(result.counts.concerns,11);
  assert.equal(result.counts.partitionCandidates,20);
  assert.equal(result.counts.renderedEvidenceQuotes,65);
  assert.equal(result.counts.txtQuotedPassages,result.counts.renderedEvidenceQuotes);
  assert.equal(result.counts.finalPreservedCandidatePassages,65);
});

test('audit rejects a corrupted source quotation without relying on a reference answer',()=>{
  const run=fresh();run.sourceInventory[0].quote='This sentence was never supplied by the report author.';
  const result=auditRun(run);
  assert.equal(result.ok,false);
  assert.ok(hasCode(result,'SOURCE_QUOTE_MISMATCH'));
});

test('audit rejects source author or date misattribution even when the quotation matches',()=>{
  for(const [field,value,code] of [['report_author','Different report author','SOURCE_AUTHOR_MISMATCH'],['report_date','2026-05-01','SOURCE_DATE_MISMATCH']]){
    const run=fresh();run.sourceInventory[0][field]=value;
    const result=auditRun(run);
    assert.equal(result.ok,false);
    assert.ok(hasCode(result,code),field);
  }
});

test('rendered factual prose cannot change while leaving valid source pointers and quotations behind',()=>{
  const run=fresh();run.findings[0].observation+='\nThe inspection failed and the work must be replaced.';
  const result=auditRun(run);
  assert.equal(result.ok,false);
  assert.ok(hasCode(result,'RENDERED_OBSERVATION_CHANGED'));
});

test('audit rejects candidates omitted from or repeated in a consolidation partition',()=>{
  const missing=fresh();missing.consolidationHistory[0].partition[0].members.pop();
  const missingResult=auditRun(missing);
  assert.equal(missingResult.ok,false);
  assert.ok(hasCode(missingResult,'CANDIDATE_NOT_PARTITIONED_EXACTLY_ONCE'));
  const repeated=fresh(),stage=repeated.consolidationHistory[0];stage.partition[1].members.push(stage.partition[0].members[0]);
  const repeatedResult=auditRun(repeated);
  assert.equal(repeatedResult.ok,false);
  assert.ok(hasCode(repeatedResult,'CANDIDATE_NOT_PARTITIONED_EXACTLY_ONCE'));
});

test('audit detects evidence lost within a merge and between initial candidates and final output',()=>{
  const merged=fresh(),concern=merged.consolidationHistory[0].concerns.find(item=>item.facts.some(id=>!item.latest.includes(id)));
  assert.ok(concern);concern.facts=[];
  const mergedResult=auditRun(merged);
  assert.equal(mergedResult.ok,false);
  assert.ok(hasCode(mergedResult,'MEMBER_EVIDENCE_UNION_CHANGED'));
  const final=fresh(),item=final.items.find(value=>value.facts.some(id=>!value.latest.includes(id)));
  assert.ok(item);item.facts=[];
  const finalResult=auditRun(final);
  assert.equal(finalResult.ok,false);
  assert.ok(hasCode(finalResult,'ORIGINAL_MEMBER_EVIDENCE_LOST_BEFORE_FINAL_OUTPUT'));
});

test('18c requires aspect grounding while the retained 18b history remains auditable',()=>{
  const run=fresh(),assignment=run.consolidationHistory[0].assignments[0];
  assert.ok(assignment.basisSourceId);assert.ok(assignment.basisRole);
  delete assignment.basisSourceId;delete assignment.basisRole;
  const result=auditRun(run);
  assert.equal(result.ok,false);
  assert.ok(hasCode(result,'MISSING_ASPECT_GROUNDING'));
  const older=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/development-v18b-consolidated-a-attempt2.json'),'utf8')).runs[0];
  assert.equal(Object.hasOwn(older.consolidationHistory[0].assignments[0],'basisSourceId'),false);
  const compatible=auditRun(older);
  assert.equal(compatible.ok,true,JSON.stringify(compatible.errors));
});

test('audit rejects a rendered review question that differs from its canonical concern',()=>{
  const run=fresh();run.findings[0].scopeQuestion='Was a different independent requirement completed?';
  const result=auditRun(run);
  assert.equal(result.ok,false);
  assert.ok(hasCode(result,'RENDERED_QUESTION_CHANGED'));
});

test('explicit reason-coded removal retains candidate and quotation accounting',()=>{
  const run=removalFixture(),result=auditRun(run);
  assert.equal(result.ok,true,JSON.stringify(result.errors));
  assert.equal(result.counts.explicitRemovals,1);
  assert.ok(result.counts.removedCandidates>0);
  assert.equal(result.counts.findings,fixture.findings.length-1);
});

test('audit rejects silently removed candidates and removal decisions without an explicit reason',()=>{
  const silent=removalFixture();silent.materialityRemovals=[];
  const silentResult=auditRun(silent);
  assert.equal(silentResult.ok,false);
  assert.ok(hasCode(silentResult,'SILENT_ROUTINE_REMOVAL'));
  assert.ok(hasCode(silentResult,'ORIGINAL_CANDIDATE_NOT_ACCOUNTED_EXACTLY_ONCE'));
  const unexplained=removalFixture();unexplained.materialityRemovals[0].reasonCode='';
  const unexplainedResult=auditRun(unexplained);
  assert.equal(unexplainedResult.ok,false);
  assert.ok(hasCode(unexplainedResult,'UNEXPLAINED_MATERIALITY_REMOVAL'));
});

test('public audit metadata exposes a filename without local directory or source text',()=>{
  const result=auditFiles([fixturePath]);
  assert.equal(result.ok,true);
  assert.equal(result.results[0].file,path.basename(fixturePath));
  assert.ok(!JSON.stringify(result).includes(path.dirname(fixturePath)));
  assert.ok(!JSON.stringify(result).includes(fixture.sourceInventory[0].quote));
});

test('18d grounds initial/final assignments, subject evidence and subject-dependent identities',()=>{
  const result=auditRun(subjectFixture());
  assert.equal(result.ok,true,JSON.stringify(result.errors));
  assert.equal(result.counts.concerns,fixture.items.length);
  const missing=subjectFixture();delete missing.consolidationHistory[0].assignments[0].subjectSourceId;
  const missingResult=auditRun(missing);
  assert.equal(missingResult.ok,false);assert.ok(hasCode(missingResult,'MISSING_SUBJECT_GROUNDING'));
  const initial=subjectFixture();delete initial.consolidationHistory[0].initialAssignments;
  const initialResult=auditRun(initial);
  assert.equal(initialResult.ok,false);assert.ok(hasCode(initialResult,'INCOMPLETE_INITIAL_ASSIGNMENTS'));
});

test('18d rejects invented subject phrases and roles in either assignment draft',()=>{
  for(const key of ['assignments','initialAssignments']){
    const invented=subjectFixture();invented.consolidationHistory[0][key][0].subjectText='A subject absent from the cited source';
    const inventedResult=auditRun(invented);
    assert.equal(inventedResult.ok,false);assert.ok(hasCode(inventedResult,'SUBJECT_NOT_EXACT_MEMBER_PHRASE'),key);
    const wrongRole=subjectFixture();wrongRole.consolidationHistory[0][key][0].subjectRole='invalid_subject_role';
    const roleResult=auditRun(wrongRole);
    assert.equal(roleResult.ok,false);assert.ok(hasCode(roleResult,'SUBJECT_ROLE_MISMATCH'),key);
  }
});

test('18d preserves subject provenance through partition, concern identity and rendering',()=>{
  const group=subjectFixture();group.consolidationHistory[0].partition[0].subjectEvidence=[];
  const groupResult=auditRun(group);
  assert.equal(groupResult.ok,false);assert.ok(hasCode(groupResult,'GROUP_SUBJECT_PROVENANCE_CHANGED'));
  const anchor=subjectFixture();anchor.items[0].sourceAnchor.subjectText='Invented identity subject';
  const anchorResult=auditRun(anchor);
  assert.equal(anchorResult.ok,false);assert.ok(hasCode(anchorResult,'UNSTABLE_CONCERN_ID'));assert.ok(hasCode(anchorResult,'INVALID_CONCERN_SUBJECT_ANCHOR'));
  const rendered=subjectFixture();rendered.findings[0].subjectText='A different subject';
  const renderedResult=auditRun(rendered);
  assert.equal(renderedResult.ok,false);assert.ok(hasCode(renderedResult,'RENDERED_SUBJECT_CHANGED'));
});

test('18d atomic removals use original pre-pool indices while surviving subjects use current stage indices',()=>{
  const run=atomicRemovalFixture(),result=auditRun(run);
  assert.equal(result.ok,true,JSON.stringify(result.errors));
  assert.equal(run.materialityRemovals[0].concernId,null);
  assert.equal(run.preConsolidationCandidates.length,run.consolidationHistory[0].inputCandidates.length+1);
  assert.equal(result.counts.explicitRemovals,1);
  assert.equal(result.counts.removedCandidates,1);
  const invalid=atomicRemovalFixture();invalid.materialityRemovals[0].index=invalid.preConsolidationCandidates.length;
  const invalidResult=auditRun(invalid);
  assert.equal(invalidResult.ok,false);assert.ok(hasCode(invalidResult,'ATOMIC_REMOVAL_INDEX_MISMATCH'));
});

test('18e AI grouping labels need valid source pointers and roles but are not treated as quotations',()=>{
  const run=labelFixture(),assignment=run.consolidationHistory[0].assignments[0];
  assert.ok(!run.sourceInventory.find(source=>source.id===assignment.subjectSourceId).quote.includes(assignment.subjectLabel));
  const result=auditRun(run);
  assert.equal(result.ok,true,JSON.stringify(result.errors));
  assert.match(result.subjectGrounding,/AI grouping label/);
  const invalid=labelFixture();invalid.consolidationHistory[0].assignments[0].subjectSourceId='S-NOT-PRESENT';
  const invalidResult=auditRun(invalid);
  assert.equal(invalidResult.ok,false);assert.ok(hasCode(invalidResult,'INVALID_SUBJECT_LABEL_OR_SOURCE'));
  const quote=labelFixture();quote.items[0].sourceAnchor.quote='A rewritten factual quotation';
  const quoteResult=auditRun(quote);
  assert.equal(quoteResult.ok,false);assert.ok(hasCode(quoteResult,'SOURCE_QUOTE_MISMATCH'));
});

test('18e confirmed routine removals retain the original and changed adjudication reasons',()=>{
  const run=confirmedRoutineFixture(),result=auditRun(run);
  assert.equal(result.ok,true,JSON.stringify(result.errors));
  assert.notEqual(run.materialityRemovals[0].initialReasonCode,run.materialityRemovals[0].reasonCode);
  assert.equal(result.counts.confirmedRoutineCandidates,1);
  assert.equal(result.counts.restoredCandidates,0);
  const invalid=confirmedRoutineFixture();invalid.materialityRemovals[0].reviewedSourceFactIds=[];
  const invalidResult=auditRun(invalid);
  assert.equal(invalidResult.ok,false);assert.ok(hasCode(invalidResult,'REMOVAL_VERDICT_EVIDENCE_CHANGED'));
});

test('18e restored candidates retain reversal history, accepted evidence and final accounting',()=>{
  const run=restoredRoutineFixture(),result=auditRun(run);
  assert.equal(result.ok,true,JSON.stringify(result.errors));
  assert.equal(result.counts.restoredCandidates,1);
  assert.equal(result.counts.explicitRemovals,0);
  const invalid=restoredRoutineFixture();invalid.materialityReconsiderations[0].acceptedSourceFactIds=[];
  const invalidResult=auditRun(invalid);
  assert.equal(invalidResult.ok,false);assert.ok(hasCode(invalidResult,'RESTORED_EVIDENCE_UNION_CHANGED'));
});

test('18e rejects a missing independent removal review or changed original verdict trace',()=>{
  const missing=restoredRoutineFixture();missing.materialityReconsiderations=[];
  const missingResult=auditRun(missing);
  assert.equal(missingResult.ok,false);assert.ok(hasCode(missingResult,'MISSING_INDEPENDENT_REMOVAL_REVIEW'));
  const changed=restoredRoutineFixture();changed.materialityReconsiderations[0].initialReview.verdict='supported';
  const changedResult=auditRun(changed);
  assert.equal(changedResult.ok,false);assert.ok(hasCode(changedResult,'RECONSIDERATION_INITIAL_TRACE_CHANGED'));
});

test('atomic verification covers every original candidate and preserves added verdict evidence',()=>{
  const missing=restoredRoutineFixture();missing.materialityReviews.pop();
  const missingResult=auditRun(missing);
  assert.equal(missingResult.ok,false);assert.ok(hasCode(missingResult,'INCOMPLETE_ATOMIC_MATERIALITY_REVIEWS'));
  const lost=restoredRoutineFixture(),index=1,review=lost.materialityReviews[index],owner=lost.items.find(item=>item.memberCandidateIndices.includes(index)),existing=new Set(selected(owner)),latestDate=lost.sourceInventory.find(source=>source.id===review.latest[0]).report_date;
  const added=lost.sourceInventory.find(source=>!existing.has(source.id)&&source.report_date<=latestDate);
  assert.ok(added);review.facts.push(added.id);
  const lostResult=auditRun(lost);
  assert.equal(lostResult.ok,false);assert.ok(hasCode(lostResult,'SUPPORTED_VERDICT_EVIDENCE_LOST_BEFORE_FINAL_OUTPUT'));
});

test('actual rejected 18e inference is skipped with diagnostic prompt metadata and no accepted results',()=>{
  const result=auditFiles([path.join(__dirname,'../docs/development-v18e-native27-a-staged.json')]);
  assert.equal(result.ok,false);
  assert.equal(result.passed,0);
  assert.equal(result.failed,0);
  assert.equal(result.skippedFailedInference,1);
  assert.equal(result.results[0].status,'skipped_failed_inference');
  assert.equal(result.results[0].promptVersion,'daily-review-18e-consolidated');
  assert.equal(result.results[0].counts.findings,0);
});

test('actual recovered 18f output preserves raw responses and records only exact duplicate pointer removal',()=>{
  const run=freshRecovered(),result=auditRun(run);
  assert.equal(result.ok,true,JSON.stringify(result.errors));
  assert.equal(result.counts.rawScopeResponsesVerified,1);
  assert.equal(result.counts.pointerNormalizations,1);
  assert.equal(result.counts.txtQuotedPassages,70);
  const prior=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/development-v18e-native27-a-staged.json'),'utf8')).runs[0];
  assert.deepEqual(run.responses.map(response=>[response.stage,response.raw]),prior.diagnostics.responses.map(response=>[response.stage,response.raw]));
  const trace=run.consolidationHistory[0].pointerNormalizations[0];
  assert.deepEqual(trace.original,['S090','S090']);assert.deepEqual(trace.normalized,['S090']);
  assert.equal(run.freshInferenceCalls,0);
});

test('18f duplicate scope pointers require an exact complete normalization trace',()=>{
  const missing=freshRecovered();missing.consolidationHistory[0].pointerNormalizations=[];missing.pointerNormalizations=[];
  const missingResult=auditRun(missing);
  assert.equal(missingResult.ok,false);assert.ok(hasCode(missingResult,'MISSING_OR_REPEATED_POINTER_NORMALIZATION_TRACE'));
  const changed=freshRecovered();changed.consolidationHistory[0].pointerNormalizations[0].original=['S090'];
  changed.pointerNormalizations=changed.consolidationHistory.flatMap(entry=>entry.pointerNormalizations.map(trace=>({stage:entry.stage,...trace})));
  const changedResult=auditRun(changed);
  assert.equal(changedResult.ok,false);assert.ok(hasCode(changedResult,'NORMALIZATION_ORIGINAL_MISMATCH'));
});

test('18f normalization cannot drop a distinct pointer or change status while removing repeats',()=>{
  const dropped=freshRecovered(),entry=dropped.consolidationHistory[0],trace=entry.pointerNormalizations[0];
  entry.normalizedScopeReviews[trace.groupId].latest=[];trace.normalized=[];syncScopeResponse(dropped,entry);
  const droppedResult=auditRun(dropped);
  assert.equal(droppedResult.ok,false);assert.ok(hasCode(droppedResult,'NORMALIZATION_REMOVED_MORE_THAN_EXACT_REPEATS'));
  const status=freshRecovered(),history=status.consolidationHistory[0],groupId=history.pointerNormalizations[0].groupId;
  history.normalizedScopeReviews[groupId].status=history.scopeReviews[groupId].status==='open'?'resolved':'open';
  const statusResult=auditRun(status);
  assert.equal(statusResult.ok,false);assert.ok(hasCode(statusResult,'NORMALIZED_SCOPE_CHANGED_MORE_THAN_REPEATS'));
});

test('18f raw scope responses remain unchanged even when a duplicate pointer is normalized',()=>{
  const run=freshRecovered(),entry=run.consolidationHistory[0],groupId=entry.pointerNormalizations[0].groupId;
  const response=run.responses.find(value=>value.stage===entry.stage+' · verify each concern state'),parsed=JSON.parse(response.raw);
  parsed.reviews[groupId].latest=[...new Set(parsed.reviews[groupId].latest)];response.raw=JSON.stringify(parsed);
  const result=auditRun(run);
  assert.equal(result.ok,false);assert.ok(hasCode(result,'RAW_SCOPE_HISTORY_CHANGED'));
});

test('18f still rejects nonexistent and foreign-member pointers under an otherwise exact normalization trace',()=>{
  for(const nonexistent of [true,false]){
    const run=freshRecovered(),entry=run.consolidationHistory[0],trace=entry.pointerNormalizations[0],group=entry.partition.find(value=>'G'+Math.min(...value.members)===trace.groupId),allowed=new Set(group.members.flatMap(index=>selected(entry.inputCandidates[index])));
    const pointer=nonexistent?'S-ABSENT':run.sourceInventory.find(source=>!allowed.has(source.id)).id;
    entry.scopeReviews[trace.groupId].latest.push(pointer);
    entry.normalizedScopeReviews[trace.groupId].latest=[...new Set(entry.scopeReviews[trace.groupId].latest)];
    trace.original=[...entry.scopeReviews[trace.groupId].latest];trace.normalized=[...entry.normalizedScopeReviews[trace.groupId].latest];group.latest=[...trace.normalized];syncScopeResponse(run,entry);
    const result=auditRun(run);
    assert.equal(result.ok,false);assert.ok(hasCode(result,'SCOPE_POINTER_OUTSIDE_GROUP'));
    assert.equal(hasCode(result,'UNKNOWN_SOURCE_ID'),nonexistent);
  }
});

test('historical revisions cannot silently accept duplicated raw scope pointers',()=>{
  const run=freshRecovered();run.promptVersion='daily-review-18e-consolidated';
  const result=auditRun(run);
  assert.equal(result.ok,false);assert.ok(hasCode(result,'UNTRACED_DUPLICATE_SCOPE_POINTER'));
});

test('18g accounts for every eligible source/component without claiming a semantic disposition is correct',()=>{
  const run=obligationFixture(),result=auditRun(run);
  assert.equal(result.ok,true,JSON.stringify(result.errors));
  assert.ok(result.counts.obligationSources>0);
  assert.equal(result.counts.obligationComponents,result.counts.obligationSources);
  assert.equal(result.counts.preservedEarlierConcerns,recoveredFixture.items.length);
  assert.equal(result.counts.rawObligationResponsesVerified,run.sourceObligationAudit.rawLedgers.length);
  const missing=obligationFixture();missing.sourceObligationAudit.checkedSourceFactIds.pop();
  const missingResult=auditRun(missing);
  assert.equal(missingResult.ok,false);assert.ok(hasCode(missingResult,'OBLIGATION_SOURCE_SET_CHANGED'));
});

test('18g represented obligations append exact evidence while preserving prior identity, scope and state',()=>{
  const run=obligationFixture('represented'),result=auditRun(run);
  assert.equal(result.ok,true,JSON.stringify(result.errors));
  assert.equal(result.counts.obligationRepresentedComponents,1);
  assert.ok(run.sourceObligationAudit.latestPointerAdjustments.length>0);
  const changed=obligationFixture('represented');changed.sourceObligationAudit.representedAdditions[0].priorSourceFactIds=[];
  const changedResult=auditRun(changed);
  assert.equal(changedResult.ok,false);assert.ok(hasCode(changedResult,'OBLIGATION_APPLICATION_TRACE_CHANGED'));
});

test('18g additional candidates use a separate global index extension and lossless locked reconsolidation',()=>{
  const run=obligationFixture('add'),result=auditRun(run);
  assert.equal(result.ok,true,JSON.stringify(result.errors));
  assert.equal(result.counts.coverageAddedCandidates,1);
  assert.equal(result.counts.materialityReviews,run.preConsolidationCandidates.length);
  assert.equal(run.coverageAddedCandidates[0].memberCandidateIndices[0],run.preConsolidationCandidates.length);
  assert.equal(result.counts.preservedEarlierConcerns,recoveredFixture.items.length);
  const invalid=obligationFixture('add');invalid.coverageAddedCandidates[0].memberCandidateIndices=[0];
  const invalidResult=auditRun(invalid);
  assert.equal(invalidResult.ok,false);assert.ok(hasCode(invalidResult,'INVALID_COVERAGE_CANDIDATE_INDEX'));
});

test('18g rejects rewritten requirement quotes, missing raw ledger evidence and changed old scopes',()=>{
  const quote=obligationFixture('represented'),target=quote.items.find(item=>item.coverageRequirements?.length);
  target.coverageRequirements[0].quote='A factual task that was not in the source.';
  const quoteResult=auditRun(quote);
  assert.equal(quoteResult.ok,false);assert.ok(hasCode(quoteResult,'SOURCE_QUOTE_MISMATCH'));
  const raw=obligationFixture();raw.responses=raw.responses.filter(response=>response.stage!=='Checking every remaining source obligation');
  const rawResult=auditRun(raw);
  assert.equal(rawResult.ok,false);assert.ok(hasCode(rawResult,'RAW_OBLIGATION_RESPONSE_COUNT_CHANGED'));
  const scope=obligationFixture('represented');scope.items[0].scopeQuestion='A newly rewritten concern question?';
  const scopeResult=auditRun(scope);
  assert.equal(scopeResult.ok,false);assert.ok(hasCode(scopeResult,'OBLIGATION_CHANGED_PRESERVED_CONCERN'));
});

test('18g independent critic may correct typed draft-role mistakes but final assignments remain strict',()=>{
  const run=obligationFixture(),stage=run.consolidationHistory[0],assignment=stage.initialAssignments[0],different=Object.values(E.ASPECTS).find(spec=>spec.subjectRole!==E.ASPECTS[assignment.aspect].subjectRole&&spec.basisRole!==E.ASPECTS[assignment.aspect].basisRole);
  assignment.subjectRole=different.subjectRole;assignment.basisRole=different.basisRole;
  refreshBoundaryChanges(stage);
  const result=auditRun(run);
  assert.equal(result.ok,true,JSON.stringify(result.errors));
  stage.assignments[0].subjectRole=different.subjectRole;
  const rejected=auditRun(run);
  assert.equal(rejected.ok,false);assert.ok(hasCode(rejected,'SUBJECT_ROLE_MISMATCH'));
});

test('18g reconsolidation preserves inherited identity anchors while recording current subject labels',()=>{
  const run=obligationFixture('add'),stage=run.consolidationHistory.at(-1),candidateIndex=0;
  stage.assignments[candidateIndex].subjectLabel='A rephrased current grouping interpretation';
  stage.partition[0].subjectEvidence[0].label=stage.assignments[candidateIndex].subjectLabel;
  refreshBoundaryChanges(stage);
  stage.concerns=E.consolidatePartition(stage.inputCandidates,stage.partition,run.sourceInventory,run.reports);
  run.items=structuredClone(stage.concerns);run.findings=E.render(run.items,run.sourceInventory,run.reports,C).findings;run.originalFindings=structuredClone(run.findings);run.sourceObligationAudit.afterConcerns=structuredClone(run.items);
  const result=auditRun(run);
  assert.equal(result.ok,true,JSON.stringify(result.errors));
  assert.equal(run.items[0].sourceAnchor.subjectLabel,run.sourceObligationAudit.beforeConcerns[0].sourceAnchor.subjectLabel);
  assert.notEqual(run.items[0].subjectEvidence[0].label,run.items[0].sourceAnchor.subjectLabel);
  stage.boundaryChanges=[];
  const missingTrace=auditRun(run);
  assert.equal(missingTrace.ok,false);assert.ok(hasCode(missingTrace,'BOUNDARY_CORRECTION_TRACE_CHANGED'));
});

test('18h preserves invalid unapplied drafts while only strict critic ledgers drive the output',()=>{
  const run=criticFixture(),result=auditRun(run),audit=run.sourceObligationAudit;
  assert.equal(result.ok,true,JSON.stringify(result.errors));
  assert.equal(result.counts.rawInitialObligationResponsesVerified,audit.initialRawLedgers.length);
  assert.equal(result.counts.rawObligationResponsesVerified,audit.rawLedgers.length);
  assert.equal(result.counts.obligationLedgerCorrections,audit.rawLedgers.length);
  assert.equal(run.items.length,audit.beforeConcerns.length);
  assert.equal(audit.ledgerCorrections[0].beforeAdditions.length,1);
  assert.equal(audit.ledgerCorrections[0].afterAdditions.length,0);
});

test('18h records complete source-component arrays when a critic splits one draft component',()=>{
  const run=criticFixture('split'),correction=run.sourceObligationAudit.ledgerCorrections[0].sourceComponents[0],result=auditRun(run);
  assert.equal(correction.before.length,1);assert.equal(correction.after.length,2);
  assert.equal(result.ok,true,JSON.stringify(result.errors));
  correction.before=[];
  const changed=auditRun(run);
  assert.equal(changed.ok,false);assert.ok(hasCode(changed,'OBLIGATION_LEDGER_CORRECTION_TRACE_CHANGED'));
});

test('18h separates self-source completed states from independently dated closure evidence',()=>{
  const completed=criticFixture('completed'),completedResult=auditRun(completed);
  assert.equal(completedResult.ok,true,JSON.stringify(completedResult.errors));
  assert.equal(completedResult.counts.obligationCompletedComponents,1);
  assert.equal(completedResult.counts.obligationClosedComponents,0);
  assert.deepEqual(completed.items.map(item=>[item.concernId,item.status,item.scopeQuestion,selected(item)]),completed.sourceObligationAudit.beforeConcerns.map(item=>[item.concernId,item.status,item.scopeQuestion,selected(item)]));
  const closed=criticFixture('closed'),closedResult=auditRun(closed);
  assert.equal(closedResult.ok,true,JSON.stringify(closedResult.errors));
  assert.equal(closedResult.counts.obligationClosedComponents,1);
  const invalid=criticFixture('completed'),audit=invalid.sourceObligationAudit,sourceId=audit.rawLedgers[0].checkingSourceFactIds[0];
  audit.rawLedgers[0].coverage[sourceId][0].closureSourceId=invalid.sourceInventory.find(fact=>fact.id!==sourceId).id;
  const invalidResult=auditRun(invalid);
  assert.equal(invalidResult.ok,false);assert.ok(hasCode(invalidResult,'OBLIGATION_COMPLETED_STATE_POINTER_INVALID'));
});

test('18h rejects rewritten initial drafts, missing critic responses and altered addition corrections',()=>{
  const draft=criticFixture();draft.sourceObligationAudit.initialRawLedgers[0].additions=[];
  const draftResult=auditRun(draft);
  assert.equal(draftResult.ok,false);assert.ok(hasCode(draftResult,'RAW_INITIAL_OBLIGATION_RESPONSE_HISTORY_CHANGED'));
  const critic=criticFixture();critic.responses=critic.responses.filter(response=>response.stage!=='Independently verifying source-obligation coverage');
  const criticResult=auditRun(critic);
  assert.equal(criticResult.ok,false);assert.ok(hasCode(criticResult,'RAW_OBLIGATION_RESPONSE_COUNT_CHANGED'));
  const addition=criticFixture();addition.sourceObligationAudit.ledgerCorrections[0].beforeAdditions=[];
  const additionResult=auditRun(addition);
  assert.equal(additionResult.ok,false);assert.ok(hasCode(additionResult,'OBLIGATION_LEDGER_CORRECTION_TRACE_CHANGED'));
  const role=criticFixture(),sourceId=role.sourceObligationAudit.rawLedgers[0].checkingSourceFactIds[0];
  delete role.sourceObligationAudit.rawLedgers[0].coverage[sourceId][0].evidenceRole;
  const roleResult=auditRun(role);
  assert.equal(roleResult.ok,false);assert.ok(hasCode(roleResult,'INVALID_OBLIGATION_EVIDENCE_ROLE'));
});

test('18i conditional repair retains invalid boundary evidence and changes only one offending link',()=>{
  const run=assignmentRepairFixture(),result=auditRun(run);
  assert.equal(result.ok,true,JSON.stringify(result.errors));
  assert.equal(result.counts.assignmentRepairCalls,1);
  assert.equal(result.counts.repairedAssignmentLinks,1);
  assert.deepEqual(run.items.map(item=>[item.concernId,item.status,item.scopeQuestion,selected(item)]),run.sourceObligationAudit.beforeConcerns.map(item=>[item.concernId,item.status,item.scopeQuestion,selected(item)]));
  const ordinary=auditRun(assignmentRepairFixture({repair:false}));
  assert.equal(ordinary.ok,true,JSON.stringify(ordinary.errors));
  assert.equal(ordinary.counts.assignmentRepairCalls,0);
});

test('18i repair cannot change a previously valid link or any source classification field',()=>{
  const link=assignmentRepairFixture(),repair=link.consolidationHistory[0].assignmentRepair,index=1;
  repair.linkReviews[index].same_as=repair.linkReviews[index].same_as===0?index:0;
  const linkResult=auditRun(link);
  assert.equal(linkResult.ok,false);assert.ok(hasCode(linkResult,'ASSIGNMENT_REPAIR_CHANGED_VALID_LINK'));
  const field=assignmentRepairFixture(),history=field.consolidationHistory[0];
  history.assignments[0].subjectLabel='A rewritten grouping classification';history.assignmentRepair.assignments[0].subjectLabel=history.assignments[0].subjectLabel;
  const fieldResult=auditRun(field);
  assert.equal(fieldResult.ok,false);assert.ok(hasCode(fieldResult,'ASSIGNMENT_REPAIR_CHANGED_FIXED_FIELDS'));
});

test('18i repair must have one matching raw model response and preserve its original trigger',()=>{
  const duplicate=assignmentRepairFixture(),repair=duplicate.consolidationHistory[0].assignmentRepair,response=duplicate.responses.find(value=>value.stage===repair.stage);
  duplicate.responses.push(structuredClone(response));
  const duplicateResult=auditRun(duplicate);
  assert.equal(duplicateResult.ok,false);assert.ok(hasCode(duplicateResult,'ASSIGNMENT_REPAIR_NOT_BOUNDED_TO_ONE_RESPONSE'));
  const trigger=assignmentRepairFixture();trigger.consolidationHistory[0].assignmentRepair.violations=[];
  const triggerResult=auditRun(trigger);
  assert.equal(triggerResult.ok,false);assert.ok(hasCode(triggerResult,'INVALID_ASSIGNMENT_REPAIR_TRIGGER'));
});

test('18i rejects silent boundary rewrites and repairs attempted on invalid source pointers',()=>{
  const silent=assignmentRepairFixture(),history=silent.consolidationHistory[0];
  delete history.assignmentRepair;delete history.boundaryAssignments;
  const silentResult=auditRun(silent);
  assert.equal(silentResult.ok,false);assert.ok(hasCode(silentResult,'RAW_BOUNDARY_ASSIGNMENT_TRACE_CHANGED'));assert.ok(hasCode(silentResult,'ORPHAN_ASSIGNMENT_REPAIR_RESPONSE'));
  const pointer=assignmentRepairFixture(),entry=pointer.consolidationHistory[0];entry.boundaryAssignments[0].subjectSourceId='S-ABSENT';entry.assignmentRepair.inputAssignments=structuredClone(entry.boundaryAssignments);
  pointer.responses.find(value=>value.stage===entry.stage+' · independently audit concern boundaries').raw=JSON.stringify({assignments:entry.boundaryAssignments});
  const pointerResult=auditRun(pointer);
  assert.equal(pointerResult.ok,false);assert.ok(hasCode(pointerResult,'INVALID_SUBJECT_LABEL_OR_SOURCE'));
});

test('18j separately accounts for unchanged large drafts and complete four-source critic batches',()=>{
  const run=smallCriticFixture('split'),audit=run.sourceObligationAudit,result=auditRun(run);
  assert.ok(audit.rawLedgers.length>audit.initialRawLedgers.length);
  assert.equal(result.ok,true,JSON.stringify(result.errors));
  assert.equal(result.counts.rawInitialObligationResponsesVerified,audit.initialRawLedgers.length);
  assert.equal(result.counts.rawObligationResponsesVerified,audit.rawLedgers.length);
  const crossing=audit.ledgerCorrections.find(correction=>correction.draftLedgerIndices.length===2);
  assert.ok(crossing,'The fixture must exercise a critic batch spanning two retained draft ledgers.');
  assert.deepEqual(crossing.draftLedgerIndices,[0,1]);
  assert.equal(audit.ledgerCorrections[0].sourceComponents[0].before.length,1);
  assert.equal(audit.ledgerCorrections[0].sourceComponents[0].after.length,2);
  assert.equal(run.items.length,audit.beforeConcerns.length);
});

test('18j rejects missing draft provenance and altered whole-array corrections across batch boundaries',()=>{
  const run=smallCriticFixture(),audit=run.sourceObligationAudit,crossing=audit.ledgerCorrections.find(correction=>correction.draftLedgerIndices.length===2);
  crossing.draftLedgerIndices=[1,0];
  const reordered=auditRun(run);
  assert.equal(reordered.ok,false);assert.ok(hasCode(reordered,'OBLIGATION_LEDGER_CORRECTION_TRACE_CHANGED'));
  const changed=smallCriticFixture();changed.sourceObligationAudit.ledgerCorrections[1].beforeAdditions=[];
  const dropped=auditRun(changed);
  assert.equal(dropped.ok,false);assert.ok(hasCode(dropped,'OBLIGATION_LEDGER_CORRECTION_TRACE_CHANGED'));
  const source=smallCriticFixture();source.sourceObligationAudit.ledgerCorrections.at(-1).sourceComponents[0].before=[];
  const lost=auditRun(source);
  assert.equal(lost.ok,false);assert.ok(hasCode(lost,'OBLIGATION_LEDGER_CORRECTION_TRACE_CHANGED'));
});

test('18j rejects changed critic batch sizes and source partitions even if flattened IDs remain complete',()=>{
  const size=smallCriticFixture();size.sourceObligationAudit.criticBatchSize=30;
  const sizeResult=auditRun(size);
  assert.equal(sizeResult.ok,false);assert.ok(hasCode(sizeResult,'OBLIGATION_BATCH_PARTITION_CHANGED'));
  const split=smallCriticFixture(),ledgers=split.sourceObligationAudit.rawLedgers;
  ledgers[1].checkingSourceFactIds.unshift(ledgers[0].checkingSourceFactIds.pop());
  const splitResult=auditRun(split);
  assert.equal(splitResult.ok,false);assert.ok(hasCode(splitResult,'OBLIGATION_BATCH_PARTITION_CHANGED'));
});

test('18j repair reclassifies only an original offender while preserving its appropriate existing link',()=>{
  const run=fullAssignmentRepairFixture(),repair=run.consolidationHistory[0].assignmentRepair,result=auditRun(run);
  assert.equal(result.ok,true,JSON.stringify(result.errors));
  assert.equal(result.counts.assignmentRepairCalls,1);
  assert.equal(result.counts.repairedAssignmentLinks,0);
  assert.equal(repair.changedFields.length,1);
  assert.ok(repair.changedFields[0].fields.includes('aspect'));
  assert.deepEqual(run.items.map(item=>[item.concernId,item.status,item.scopeQuestion,selected(item)]),run.sourceObligationAudit.beforeConcerns.map(item=>[item.concernId,item.status,item.scopeQuestion,selected(item)]));
});

test('18j full repair freezes valid candidates and still enforces previously verified aspect locks',()=>{
  const changed=fullAssignmentRepairFixture(),entry=changed.consolidationHistory[0],offender=entry.assignmentRepair.violations[0].candidateIndex,valid=entry.inputCandidates.findIndex((_,index)=>index!==offender);
  entry.assignmentRepair.assignmentReviews[valid].subjectLabel='A rewritten originally valid candidate';
  const changedResult=auditRun(changed);
  assert.equal(changedResult.ok,false);assert.ok(hasCode(changedResult,'ASSIGNMENT_REPAIR_CHANGED_VALID_CANDIDATE'));
  const locked=fullAssignmentRepairFixture(),history=locked.consolidationHistory[0],index=history.assignmentRepair.violations[0].candidateIndex;
  history.inputCandidates[index].concernAspect=history.boundaryAssignments[index].aspect;
  const lockedResult=auditRun(locked);
  assert.equal(lockedResult.ok,false);assert.ok(hasCode(lockedResult,'FIXED_ASPECT_CHANGED'));
});

test('18j full repair requires exact field-level history and the original complete raw response',()=>{
  const trace=fullAssignmentRepairFixture();trace.consolidationHistory[0].assignmentRepair.changedFields=[];
  const traceResult=auditRun(trace);
  assert.equal(traceResult.ok,false);assert.ok(hasCode(traceResult,'ASSIGNMENT_REPAIR_FIELD_TRACE_CHANGED'));
  const raw=fullAssignmentRepairFixture(),history=raw.consolidationHistory[0],response=raw.responses.find(item=>item.stage===history.assignmentRepair.stage);
  response.raw=JSON.stringify({assignments:history.boundaryAssignments});
  const rawResult=auditRun(raw);
  assert.equal(rawResult.ok,false);assert.ok(hasCode(rawResult,'RAW_ASSIGNMENT_REPAIR_RESPONSE_CHANGED'));
  const pointer=fullAssignmentRepairFixture(),entry=pointer.consolidationHistory[0],index=entry.assignmentRepair.violations[0].candidateIndex;
  entry.assignments[index].basisSourceId='S-ABSENT';entry.assignmentRepair.assignments=structuredClone(entry.assignments);entry.assignmentRepair.assignmentReviews=structuredClone(entry.assignments);
  const pointerResult=auditRun(pointer);
  assert.equal(pointerResult.ok,false);assert.ok(hasCode(pointerResult,'ASPECT_BASIS_OUTSIDE_MEMBER'));
});

test('retained staged consolidation is audited as an explicit component run with no full-review phases',()=>{
  const file=path.join(__dirname,'../docs/development-v18i-consolidated-d-staged.json'),run=JSON.parse(fs.readFileSync(file,'utf8')).runs[0],result=auditRun(run);
  assert.equal(run.method,'staged-saved-candidate-consolidation');
  assert.equal(run.pipelineMethod,'saved-candidate-consolidation-only');
  assert.equal(result.ok,true,JSON.stringify(result.errors));
  assert.equal(result.counts.assignmentRepairCalls,1);
  assert.equal(result.counts.materialityReviews,0);
  assert.equal(result.counts.obligationSources,0);
  assert.equal(result.timingMode,'verified-prefix-replay-not-end-to-end');
  assert.equal(result.counts.txtQuotedPassages,result.counts.renderedEvidenceQuotes);
});

test('18k removes only an explicitly reviewed orphan while preserving referenced additions and raw critics',()=>{
  const run=attachmentFixture({linkedAddition:true}),audit=run.sourceObligationAudit,result=auditRun(run);
  assert.equal(result.ok,true,JSON.stringify(result.errors));
  assert.equal(result.counts.obligationAdditionRepairs,1);
  assert.equal(result.counts.removedOrphanAdditions,1);
  assert.equal(result.counts.rawAdditionRepairResponsesVerified,1);
  assert.equal(audit.rawLedgers[0].additions.length,2);
  assert.deepEqual(audit.postOrphanLedgers[0].additions,[audit.rawLedgers[0].additions[0]]);
  assert.equal(result.counts.attachmentCases,1);
  assert.equal(result.counts.rawAttachmentResponsesVerified,1);
});

test('18k bounds orphan repair to its original error and unchanged linked candidates/coverage',()=>{
  const changed=attachmentFixture({linkedAddition:true});changed.sourceObligationAudit.postOrphanLedgers[0].additions[0].topic='A changed linked task?';
  const changedResult=auditRun(changed);
  assert.equal(changedResult.ok,false);assert.ok(hasCode(changedResult,'OBLIGATION_ADDITION_REPAIR_CHANGED_FROZEN_FIELDS'));
  const coverage=attachmentFixture();coverage.sourceObligationAudit.postOrphanLedgers[0].coverage[coverage.sourceObligationAudit.checkedSourceFactIds[0]][0].componentLabel='A rewritten original component';
  const coverageResult=auditRun(coverage);
  assert.equal(coverageResult.ok,false);assert.ok(hasCode(coverageResult,'OBLIGATION_ADDITION_REPAIR_CHANGED_FROZEN_FIELDS'));
  const missing=attachmentFixture();missing.responses=missing.responses.filter(response=>response.stage!=='Repairing unlinked obligation additions');
  const missingResult=auditRun(missing);
  assert.equal(missingResult.ok,false);assert.ok(hasCode(missingResult,'RAW_ADDITION_REPAIR_RESPONSE_COUNT_CHANGED'));
});

test('18k independently reviews every represented component and can split a new requirement without merging an old concern',()=>{
  const run=attachmentFixture({split:true}),audit=run.sourceObligationAudit,result=auditRun(run),added=run.coverageAddedCandidates[0];
  assert.equal(result.ok,true,JSON.stringify(result.errors));
  assert.equal(audit.attachmentDecisions[0].before.disposition,'represented');
  assert.equal(audit.attachmentDecisions[0].after.length,2);
  assert.equal(added.coverageKey,'R-L0-1');
  assert.deepEqual(added.independentOfConcernIds,audit.beforeConcerns.map(item=>item.concernId));
  assert.equal(run.items.length,audit.beforeConcerns.length+1);
  assert.equal(result.counts.preservedEarlierConcerns,audit.beforeConcerns.length);
  assert.equal(result.counts.txtQuotedPassages,result.counts.renderedEvidenceQuotes);
});

test('18k rejects unreviewed attachment mutations, omitted cases and rewritten raw gate decisions',()=>{
  const omitted=attachmentFixture();omitted.sourceObligationAudit.attachmentCases=[];
  const omittedResult=auditRun(omitted);
  assert.equal(omittedResult.ok,false);assert.ok(hasCode(omittedResult,'ATTACHMENT_CASE_ACCOUNTING_CHANGED'));
  const untouched=attachmentFixture(),ledger=untouched.sourceObligationAudit.appliedLedgers[1],sourceId=ledger.checkingSourceFactIds[0];ledger.coverage[sourceId][0].componentLabel='A change outside every gate case';
  const untouchedResult=auditRun(untouched);
  assert.equal(untouchedResult.ok,false);assert.ok(hasCode(untouchedResult,'ATTACHMENT_APPLICATION_CHANGED_UNREVIEWED_FIELDS'));
  const raw=attachmentFixture();raw.responses.find(response=>response.stage==='Independently verifying requirement attachments').raw='{"reviews":{}}';
  const rawResult=auditRun(raw);
  assert.equal(rawResult.ok,false);assert.ok(hasCode(rawResult,'RAW_ATTACHMENT_RESPONSE_CHANGED'));
});

test('18k preserves independent-task separation through direct links, group partitions and exported metadata',()=>{
  const run=attachmentFixture({split:true}),history=run.consolidationHistory.at(-1),index=history.inputCandidates.length-1,target=history.inputCandidates.findIndex(item=>item.concernId===history.inputCandidates[index].independentOfConcernIds[0]);
  history.assignments[index].same_as=target;
  const linked=auditRun(run);
  assert.equal(linked.ok,false);assert.ok(hasCode(linked,'INDEPENDENT_CONCERN_LINK_FORBIDDEN'));
  const metadata=attachmentFixture({split:true}),newItem=metadata.items.find(item=>item.independentOfConcernIds?.length);newItem.independentOfConcernIds=[];
  const metadataResult=auditRun(metadata);
  assert.equal(metadataResult.ok,false);
  assert.ok(hasCode(metadataResult,'OBLIGATION_RECONSOLIDATION_LINEAGE_CHANGED')||hasCode(metadataResult,'OBLIGATION_FINAL_SNAPSHOT_CHANGED'));
});

test('18m groups novel components by source and inserts their combined review once',()=>{
  const run=novelSourceFixture(),audit=run.sourceObligationAudit,result=auditRun(run),selected=audit.attachmentCases.find(item=>item.componentIndices.length>1),decision=audit.attachmentDecisions.find(item=>item.caseId===selected.caseId),before=audit.postOrphanLedgers[selected.ledgerIndex].coverage[selected.sourceFactId],after=audit.appliedLedgers[selected.ledgerIndex].coverage[selected.sourceFactId];
  assert.equal(result.ok,true,JSON.stringify(result.errors));
  assert.equal(audit.attachmentBatchSize,1);
  assert.equal(new Set(audit.attachmentCases.map(item=>item.sourceFactId)).size,audit.attachmentCases.length);
  assert.deepEqual(selected.componentIndices,[0,2]);
  assert.equal(decision.before.length,2);assert.equal(decision.after.length,1);
  assert.equal(after.length,2);
  assert.deepEqual(after,[decision.after[0],before[1]]);
  assert.equal(result.counts.rawAttachmentResponsesVerified,audit.attachmentCases.length);
});

test('18m rejects selected-source omissions, changed novelty criteria and missing scope limitations',()=>{
  const omitted=novelSourceFixture(),selected=omitted.sourceObligationAudit.attachmentCases.find(item=>item.componentIndices.length>1);selected.componentIndices.pop();selected.proposedComponents.pop();
  const omittedResult=auditRun(omitted);
  assert.equal(omittedResult.ok,false);assert.ok(hasCode(omittedResult,'ATTACHMENT_CASE_ACCOUNTING_CHANGED'));
  const scope=novelSourceFixture();delete scope.sourceObligationAudit.attachmentReviewScope;
  const scopeResult=auditRun(scope);
  assert.equal(scopeResult.ok,false);assert.ok(hasCode(scopeResult,'ATTACHMENT_CASE_ACCOUNTING_CHANGED'));
  const extra=novelSourceFixture(),audit=extra.sourceObligationAudit,represented=audit.postOrphanLedgers.flatMap(ledger=>ledger.checkingSourceFactIds.flatMap(sourceFactId=>ledger.coverage[sourceFactId].flatMap((component,index)=>component.disposition==='represented'&&!audit.attachmentCases.some(item=>item.sourceFactId===sourceFactId&&item.componentIndices.includes(index))?[{sourceFactId,index,component}]:[])))[0];
  assert.ok(represented,'Fixture must retain an already-cited represented component.');
  audit.attachmentCases.push({caseId:'L-extra',ledgerIndex:0,sourceFactId:represented.sourceFactId,componentIndices:[represented.index],proposedComponents:[represented.component]});
  const extraResult=auditRun(extra);
  assert.equal(extraResult.ok,false);assert.ok(hasCode(extraResult,'ATTACHMENT_CASE_ACCOUNTING_CHANGED'));
});

test('18m rejects per-sibling cloning and preserves all unselected source components',()=>{
  const cloned=novelSourceFixture(),audit=cloned.sourceObligationAudit,selected=audit.attachmentCases.find(item=>item.componentIndices.length>1),decision=audit.attachmentDecisions.find(item=>item.caseId===selected.caseId);
  audit.appliedLedgers[selected.ledgerIndex].coverage[selected.sourceFactId].push(...structuredClone(decision.after));
  const clonedResult=auditRun(cloned);
  assert.equal(clonedResult.ok,false);assert.ok(hasCode(clonedResult,'ATTACHMENT_APPLICATION_CHANGED_UNREVIEWED_FIELDS'));
  const changed=novelSourceFixture(),scope=changed.sourceObligationAudit,item=scope.attachmentCases.find(value=>value.componentIndices.length>1);scope.appliedLedgers[item.ledgerIndex].coverage[item.sourceFactId][1].componentLabel='Changed untouched context';
  const changedResult=auditRun(changed);
  assert.equal(changedResult.ok,false);assert.ok(hasCode(changedResult,'ATTACHMENT_APPLICATION_CHANGED_UNREVIEWED_FIELDS'));
});

test('18n explicit abstentions roll back only proposed changes while preserving the complete prior pool',()=>{
  const run=productFixture(),audit=run.sourceObligationAudit,review=audit.finalProductReview,result=auditRun(run);
  assert.equal(result.ok,true,JSON.stringify(result.errors));
  assert.equal(run.items.length,audit.beforeConcerns.length);
  assert.equal(run.coverageAddedCandidates.length,0);
  assert.equal(review.additionRemovals.length,review.preEntailmentAddedCandidates.length);
  assert.equal(result.counts.productAbstentions,review.cases.length);
  assert.equal(result.counts.rawProductResponsesVerified,review.cases.length);
  assert.ok(audit.appliedLedgers.some(ledger=>Object.values(ledger.coverage).flat().some(component=>component.disposition==='unresolved'&&component.reasonCode==='unverified_association')));
  assert.ok(C.textReport(run).includes(C.reviewCaution(run)));
  for(const original of audit.beforeConcerns){const final=run.items.find(item=>item.concernId===original.concernId);assert.equal(final.scopeQuestion,original.scopeQuestion);assert.equal(final.status,original.status);assert.ok(selected(original).every(id=>selected(final).includes(id)));}
});

test('18n retained additions keep their original global indices after an earlier new concern abstains',()=>{
  const run=productFixture({retainNew:true}),result=auditRun(run),review=run.sourceObligationAudit.finalProductReview;
  assert.equal(result.ok,true,JSON.stringify(result.errors));
  assert.ok(run.coverageAddedCandidates.length>0);
  assert.ok(run.coverageAddedCandidates[0].memberCandidateIndices[0]>run.preConsolidationCandidates.length,'An earlier withheld atom must leave an index gap.');
  for(const candidate of run.coverageAddedCandidates)assert.deepEqual(candidate,review.preEntailmentAddedCandidates.find(prior=>prior.coverageKey===candidate.coverageKey));
  run.coverageAddedCandidates[0].memberCandidateIndices=[run.preConsolidationCandidates.length];
  const renumbered=auditRun(run);
  assert.equal(renumbered.ok,false);assert.ok(hasCode(renumbered,'ACCEPTED_COVERAGE_CANDIDATE_CHANGED_OR_RENUMBERED'));
});

test('18n rejects invented proof spans and a missing final raw model review',()=>{
  const span=productFixture({retainNew:true}),review=span.sourceObligationAudit.finalProductReview,retained=review.rawReviews.find(batch=>Object.values(batch.reviews)[0].verdict==='retain');Object.values(retained.reviews)[0].sourceSpan='Invented grounding outside all source passages';
  const spanResult=auditRun(span);
  assert.equal(spanResult.ok,false);assert.ok(hasCode(spanResult,'PRODUCT_RETAIN_WITHOUT_EXACT_GROUNDING'));
  const raw=productFixture();raw.responses=raw.responses.filter((response,index)=>response.stage!=='Independently checking final product changes'||index!==raw.responses.length-1);
  const rawResult=auditRun(raw);
  assert.equal(rawResult.ok,false);assert.ok(hasCode(rawResult,'RAW_PRODUCT_RESPONSE_COUNT_CHANGED'));
});

test('18n subject-guard overrides retain without silently declaring the source closed or routine',()=>{
  const run=productFixture({retainGuardedAttachment:true}),review=run.sourceObligationAudit.finalProductReview,decision=review.decisions.find(item=>item.rawVerdict==='retain'),result=auditRun(run);
  assert.equal(result.ok,true,JSON.stringify(result.errors));
  assert.equal(decision.effectiveVerdict,'abstain');assert.equal(decision.reasonCode,'subject_scope_not_explicit');assert.equal(decision.subjectSupport.passed,false);
  decision.effectiveVerdict='retain';
  const changed=auditRun(run);
  assert.equal(changed.ok,false);assert.ok(hasCode(changed,'PRODUCT_DECISION_OR_ABSTENTION_TRACE_CHANGED'));
});

test('18n rejects silent proposal removal and converting an abstention into a routine source claim',()=>{
  const removed=productFixture();removed.sourceObligationAudit.finalProductReview.additionRemovals.pop();
  const removedResult=auditRun(removed);
  assert.equal(removedResult.ok,false);assert.ok(hasCode(removedResult,'PRODUCT_REVIEW_CHANGED_UNAUTHORIZED_FIELDS'));
  const routine=productFixture(),ledger=routine.sourceObligationAudit.appliedLedgers.find(ledger=>Object.values(ledger.coverage).flat().some(component=>component.disposition==='unresolved')),component=Object.values(ledger.coverage).flat().find(component=>component.disposition==='unresolved');Object.assign(component,{disposition:'routine',reasonCode:'ordinary_plan',evidenceRole:E.OBLIGATION_ROLES.routine});
  const routineResult=auditRun(routine);
  assert.equal(routineResult.ok,false);assert.ok(hasCode(routineResult,'PRODUCT_REVIEW_CHANGED_UNAUTHORIZED_FIELDS'));
});
