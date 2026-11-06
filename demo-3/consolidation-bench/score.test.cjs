'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {scoreCase,summarize}=require('./score.cjs');
const input={id:'TEST',payload:{mode:'consolidation',documents:[{id:'REQ',kind:'request',text:'Confirm the pump anchor depth. Confirm the drain invert elevation.'},{id:'SPEC',kind:'reference',approval:'approved',current:true,text:'The pump anchor depth is 100 mm.'}],board:{version:2,tasks:[{id:'OLD'}],documents:[]}}};
const ref={id:'TEST',items:[{id:'anchor',sourceDocumentId:'REQ',sourceAnchor:'pump anchor depth',actions:['create_task'],requiredFacts:[{name:'anchor',patterns:['anchor']}],requiredCitationDocumentIds:[]},{id:'drain',sourceDocumentId:'REQ',sourceAnchor:'drain invert elevation',actions:['create_task'],requiredFacts:[{name:'drain',patterns:['drain','invert']}],requiredCitationDocumentIds:[]}],groupSets:[],differentTasks:[['anchor','drain']]};
const item=(id,requirement,sourceQuote,options={})=>({id,sourceDocumentId:'REQ',sourceQuote,title:requirement,requirement,action:'create_task',targetTaskId:null,duplicateOfItemId:null,groupId:null,answer:'',citations:[],...options});
const result=items=>({result:{mode:'consolidation',boardVersion:2,humanDecision:'pending',groups:[],items},totalMs:100});
test('two preserved independent requirements pass independently',()=>{
 const score=scoreCase(input,ref,result([item('a','Confirm pump anchor depth.','Confirm the pump anchor depth.'),item('b','Confirm drain invert elevation.','Confirm the drain invert elevation.')]));
 assert.equal(score.passed,true);assert.equal(summarize([score]).actionAndTargetAccuracyPercent,100);
});
test('one long source quote cannot earn credit for multiple requirements',()=>{
 const score=scoreCase(input,ref,result([item('a','Confirm pump anchor depth.',input.payload.documents[0].text)]));
 assert.equal(score.items.filter(i=>i.matched).length,1);assert.equal(summarize([score]).omittedRequirements,1);assert.equal(score.passed,false);
});
test('abstaining on every question does not inflate action accuracy',()=>{
 const score=scoreCase(input,ref,result([item('a','Confirm pump anchor depth.','Confirm the pump anchor depth.',{action:'needs_review'}),item('b','Confirm drain invert elevation.','Confirm the drain invert elevation.',{action:'needs_review'})]));
 assert.equal(summarize([score]).actionAndTargetAccuracyPercent,0);assert.equal(summarize([score]).extractionRecallPercent,100);
});
test('merging two distinct requirements is counted as an incorrect merge',()=>{
 const score=scoreCase(input,ref,result([item('a','Confirm pump anchor depth.','Confirm the pump anchor depth.'),item('b','Confirm drain invert elevation.','Confirm the drain invert elevation.',{action:'link_duplicate',duplicateOfItemId:'a'})]));
 assert.equal(summarize([score]).incorrectDuplicateMerges,1);assert.equal(score.separation[0].passed,false);
});
test('answering from a nonauthoritative record fails even with an exact quote',()=>{
 const changed=structuredClone(input);changed.payload.documents[1].approval='draft';
 const changedRef=structuredClone(ref);changedRef.items[0].actions=['already_answered'];
 const score=scoreCase(changed,changedRef,result([item('a','Confirm pump anchor depth.','Confirm the pump anchor depth.',{action:'already_answered',answer:'100 mm',citations:[{documentId:'SPEC',quote:'The pump anchor depth is 100 mm.'}]}),item('b','Confirm drain invert elevation.','Confirm the drain invert elevation.')]));
 assert.equal(score.guards.allAnswerEvidenceAuthoritative,false);assert.equal(summarize([score]).incorrectAlreadyAnswered,1);
});
test('duplicate linkage must target the correct existing task',()=>{
 const changedRef={...ref,items:[{...ref.items[0],actions:['link_duplicate'],targetTaskId:'OLD'}],differentTasks:[]};
 const score=scoreCase(input,changedRef,result([item('a','Confirm pump anchor depth.','Confirm the pump anchor depth.',{action:'link_duplicate',targetTaskId:'OTHER'})]));
 assert.equal(score.items[0].targetCorrect,false);assert.equal(score.items[0].unsafeMerge,true);assert.deepEqual(score.guards.invalidReferences,['a']);
});
test('added deadline omitted from a duplicate remains a retention failure',()=>{
 const changedRef={...ref,items:[{...ref.items[0],actions:['link_duplicate'],targetTaskId:'OLD',requiredFacts:[{name:'new deadline',patterns:['November 9','2026-11-09']}]}],differentTasks:[]};
 const score=scoreCase(input,changedRef,result([item('a','Confirm pump anchor depth.','Confirm the pump anchor depth.',{action:'link_duplicate',targetTaskId:'OLD'})]));
 assert.equal(score.items[0].actionCorrect,true);assert.equal(score.items[0].targetCorrect,true);assert.equal(score.items[0].complete,false);assert.equal(score.items[0].passed,false);
});
test('current board version and pending review are mandatory',()=>{
 const run=result([item('a','Confirm pump anchor depth.','Confirm the pump anchor depth.'),item('b','Confirm drain invert elevation.','Confirm the drain invert elevation.')]);run.result.boardVersion=1;run.result.humanDecision='approved';
 const score=scoreCase(input,ref,run);assert.equal(score.guards.boardVersionMatches,false);assert.equal(score.guards.humanDecisionPending,false);assert.equal(score.passed,false);
});
test('missing source quotes and invented citation passages fail independently',()=>{
 const changedRef={...ref,items:[{...ref.items[0],actions:['already_answered'],requiredCitationDocumentIds:['SPEC']}],differentTasks:[]};
 const score=scoreCase(input,changedRef,result([item('a','Confirm pump anchor depth.','Invented question',{action:'already_answered',answer:'200 mm',citations:[{documentId:'SPEC',quote:'The depth is 200 mm.'}]})]));
 assert.equal(score.items[0].sourceQuoteValid,false);assert.equal(score.items[0].invalidCitations,1);assert.equal(score.items[0].unsafeAnswer,true);
});
test('extra extracted requirements are reported instead of silently discarded',()=>{
 const score=scoreCase(input,ref,result([item('a','Confirm pump anchor depth.','Confirm the pump anchor depth.'),item('b','Confirm drain invert elevation.','Confirm the drain invert elevation.'),item('c','Confirm invented paint color.','Confirm the pump anchor depth.')]));
 assert.equal(score.extraItems.length,1);assert.equal(score.passed,false);
});
