'use strict';

// This module never calls a model. Labels and generated results meet only here.
const norm=s=>String(s||'').toLowerCase().replace(/\s+/g,' ').trim();
const matches=(text,patterns)=>patterns.some(pattern=>new RegExp(pattern,'i').test(String(text||'')));
const missingFacts=(text,facts=[])=>facts.filter(f=>!matches(text,f.patterns)).map(f=>f.name);
const tokens=s=>norm(s).match(/[a-z0-9]+/g)||[];

function pairWeight(reference,item){
 if(item.sourceDocumentId!==reference.sourceDocumentId)return -1;
 const content=[item.title,item.requirement].join(' '),anchor=norm(reference.sourceAnchor);
 let score=10;
 if(anchor){
  const anchorWords=tokens(anchor).filter(w=>w.length>2&&!['the','and','for'].includes(w));
  const coverage=anchorWords.filter(w=>norm(content).includes(w)).length;
  const sourceHasAnchor=norm(item.sourceQuote).includes(anchor);
  if(!sourceHasAnchor&&coverage===0)return -1;
  score+=coverage*20+(norm(content).includes(anchor)?50:0)+(sourceHasAnchor?5:0);
 }
 score+=(reference.requiredFacts||[]).filter(f=>matches(content,f.patterns)).length*8;
 return score;
}

// An output can cover only one expected atomic requirement. A single long quote
// containing three source questions therefore cannot earn three coverage points.
function matchItems(references,items){
 let best={score:-1,pairs:[]};
 function walk(at,used,pairs,score){
  if(at===references.length){if(score>best.score)best={score,pairs:[...pairs]};return;}
  walk(at+1,used,[...pairs,null],score);
  for(let j=0;j<items.length;j++){
   if(used.has(j))continue;
   const weight=pairWeight(references[at],items[j]);if(weight<0)continue;
   used.add(j);walk(at+1,used,[...pairs,j],score+1000+weight);used.delete(j);
  }
 }
 walk(0,new Set(),[],0);return best.pairs;
}

function scoreCase(inputCase,reference,run){
 const result=run?.result||run||{},items=Array.isArray(result.items)?result.items:[];
 const payload=inputCase.payload,docs=new Map([...(payload.board?.documents||[]),...payload.documents].map(d=>[d.id,d]));
 const groups=Array.isArray(result.groups)?result.groups:[];
 const groupIds=new Set(groups.map(g=>g.id)),outputIds=new Set(items.map(i=>i.id));
 const requestDocs=payload.documents.filter(d=>d.kind==='request');
 const matched=matchItems(reference.items,items),byExpected=new Map(),used=new Set();
 reference.items.forEach((r,index)=>{if(matched[index]!==null){byExpected.set(r.id,items[matched[index]]);used.add(matched[index]);}});
 const sourceValid=item=>{const doc=docs.get(item.sourceDocumentId);return !!doc&&doc.kind==='request'&&typeof item.sourceQuote==='string'&&!!item.sourceQuote.trim()&&doc.text.includes(item.sourceQuote);};
 const citationValid=c=>{const d=docs.get(c.documentId);return !!d&&typeof c.quote==='string'&&!!c.quote.trim()&&d.text.includes(c.quote);};
 const citationAuthoritative=c=>{const d=docs.get(c.documentId);return citationValid(c)&&d.kind==='reference'&&d.current===true&&d.approval==='approved';};
 const assessed=reference.items.map((r,index)=>{
  const item=matched[index]===null?null:items[matched[index]];
  if(!item)return {id:r.id,sourceDocumentId:r.sourceDocumentId,matched:false,actionCorrect:false,targetCorrect:false,complete:false,passed:false,omitted:true,unsafeMerge:false,unsafeAnswer:false,missingRequiredFacts:r.requiredFacts.map(f=>f.name),missingAnswerFacts:(r.answerFacts||[]).map(f=>f.name)};
  const actionCorrect=r.actions.includes(item.action);
  const duplicateTarget=r.duplicateOf?byExpected.get(r.duplicateOf):null;
  const targetCorrect=r.targetTaskId?item.targetTaskId===r.targetTaskId:r.duplicateOf?!!duplicateTarget&&item.duplicateOfItemId===duplicateTarget.id:true;
  const missingRequiredFacts=missingFacts([item.title,item.requirement].join(' '),r.requiredFacts);
  const missingAnswerFacts=missingFacts(item.answer,r.answerFacts);
  const citations=Array.isArray(item.citations)?item.citations:[];
  const missingExpectedCitations=(r.requiredCitationDocumentIds||[]).filter(id=>!citations.some(c=>c.documentId===id&&citationValid(c)));
  const invalidCitations=citations.filter(c=>!citationValid(c));
  const unsafeMerge=item.action==='link_duplicate'&&(!r.actions.includes('link_duplicate')||!targetCorrect);
  const unsafeAnswer=item.action==='already_answered'&&(!r.actions.includes('already_answered')||!citations.length||!citations.every(citationAuthoritative));
  const knownUnsupportedAnswer=(r.forbiddenAnswerPatterns||[]).filter(pattern=>new RegExp(pattern,'i').test(String(item.answer||'')));
  const sourceQuoteValid=sourceValid(item);
  const complete=!missingRequiredFacts.length&&!missingAnswerFacts.length;
  const passed=actionCorrect&&targetCorrect&&complete&&sourceQuoteValid&&!missingExpectedCitations.length&&!invalidCitations.length&&!unsafeMerge&&!unsafeAnswer&&!knownUnsupportedAnswer.length;
  return {id:r.id,sourceDocumentId:r.sourceDocumentId,matched:true,outputItemId:item.id,expectedActions:r.actions,observedAction:item.action,expectedTarget:r.targetTaskId||r.duplicateOf||null,observedTarget:item.targetTaskId||item.duplicateOfItemId||null,actionCorrect,targetCorrect,complete,passed,omitted:false,unsafeMerge,unsafeAnswer,sourceQuoteValid,missingRequiredFacts,missingAnswerFacts,missingExpectedCitations,invalidCitations:invalidCitations.length,knownUnsupportedAnswer};
 });
 const taskIdentity=(item,seen=new Set())=>{
  if(!item)return null;
  if(seen.has(item.id))return 'cycle';seen.add(item.id);
  if(item.action==='link_duplicate'){
   if(item.targetTaskId)return 'existing:'+item.targetTaskId;
   return taskIdentity(items.find(i=>i.id===item.duplicateOfItemId),seen);
  }
  // Related children remain distinct even when their parent task is the same.
  return 'new:'+item.id;
 };
 const grouping=(reference.groupSets||[]).map(ids=>{
  const selected=ids.map(id=>byExpected.get(id));
  const parents=selected.map(i=>i?.groupId||(i?.action==='add_subtask'?i.targetTaskId:null));
  const parent=parents[0];
  return {items:ids,passed:selected.every(Boolean)&&!!parent&&parents.every(p=>p===parent)&&(!selected[0].groupId||groupIds.has(parent)),observedParents:parents};
 });
 const separation=(reference.differentTasks||[]).map(([left,right])=>{
  const a=taskIdentity(byExpected.get(left)),b=taskIdentity(byExpected.get(right));
  return {items:[left,right],passed:!!a&&!!b&&a!==b,observed:[a,b]};
 });
 const invalidReferences=items.filter((item,index)=>
  (item.groupId&&!groupIds.has(item.groupId))||
  (item.duplicateOfItemId&&(!outputIds.has(item.duplicateOfItemId)||!items.slice(0,index).some(i=>i.id===item.duplicateOfItemId&&i.action!=='link_duplicate')))||
  (item.targetTaskId&&!(payload.board?.tasks||[]).some(t=>t.id===item.targetTaskId))
 ).map(i=>i.id);
 const extraItems=items.filter((_,index)=>!used.has(index)).map(i=>i.id);
 const missingRequestDocuments=requestDocs.filter(d=>!items.some(i=>i.sourceDocumentId===d.id)).map(d=>d.id);
 const guards={humanDecisionPending:result.humanDecision==='pending',boardVersionMatches:result.boardVersion===payload.board.version,allSourceQuotesExact:items.every(sourceValid),uniqueItemIds:items.every(i=>typeof i.id==='string'&&i.id)&&outputIds.size===items.length,invalidReferences,missingRequestDocuments,allAnswerEvidenceAuthoritative:items.filter(i=>i.action==='already_answered').every(i=>Array.isArray(i.citations)&&i.citations.length>0&&i.citations.every(citationAuthoritative))};
 const guardPass=guards.humanDecisionPending&&guards.boardVersionMatches&&guards.allSourceQuotesExact&&guards.uniqueItemIds&&!invalidReferences.length&&!missingRequestDocuments.length&&guards.allAnswerEvidenceAuthoritative;
 return {id:inputCase.id,expectedRequirements:reference.items.length,outputItems:items.length,items:assessed,grouping,separation,extraItems,guards,passed:assessed.every(i=>i.passed)&&grouping.every(g=>g.passed)&&separation.every(g=>g.passed)&&!extraItems.length&&guardPass,totalMs:Number.isFinite(run?.totalMs)?run.totalMs:null,engineVersion:run?.engineVersion||result.version||null,inputSha256:run?.inputSha256||null,unsupportedFactsAssessed:false,notice:'Exact strings and labeled action/target checks are automated. Unanticipated unsupported assertions still require human semantic review.'};
}

function summarize(cases){
 const items=cases.flatMap(c=>c.items||[]),groups=cases.flatMap(c=>c.grouping||[]),separations=cases.flatMap(c=>c.separation||[]);
 const successful=cases.filter(c=>!c.error),expected=cases.reduce((n,c)=>n+(c.expectedRequirements||0),0);
 const pct=(a,b)=>b?Math.round(a/b*1000)/10:null;
 const matched=items.filter(i=>i.matched).length,correct=items.filter(i=>i.actionCorrect&&i.targetCorrect).length;
 return {cases:cases.length,successfulRuns:successful.length,fullyPassingCases:cases.filter(c=>c.passed).length,expectedRequirements:expected,matchedRequirements:matched,omittedRequirements:expected-matched,extractionRecallPercent:pct(matched,expected),correctActionsAndTargets:correct,actionAndTargetAccuracyPercent:pct(correct,expected),requirementsPassingAllLabeledChecks:items.filter(i=>i.passed).length,allLabeledChecksPercent:pct(items.filter(i=>i.passed).length,expected),completeRetainedRequirements:items.filter(i=>i.complete).length,retentionCompletenessPercent:pct(items.filter(i=>i.complete).length,expected),extraExtractedItems:cases.reduce((n,c)=>n+(c.extraItems?.length||0),0),incorrectDuplicateMerges:items.filter(i=>i.unsafeMerge).length,incorrectAlreadyAnswered:items.filter(i=>i.unsafeAnswer).length,groupingChecksPassed:groups.filter(g=>g.passed).length,groupingChecks:groups.length,separationChecksPassed:separations.filter(g=>g.passed).length,separationChecks:separations.length,totalWorkflowMs:successful.reduce((n,c)=>n+(c.totalMs||0),0),independentHumanValidation:false,unnecessaryRfiReductionMeasured:false,humanReviewTimeMeasured:false,unsupportedFactsFullyAssessed:false};
}

module.exports={scoreCase,summarize,matchItems};
