'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Engine=require('./consolidation-engine-v2.cjs');
const doc={id:'request-1',title:'Access question',kind:'request',revision:'A',issuedAt:'2026-11-02',approval:'informal',current:true,text:'Confirm east access on Thursday. We need the answer by noon.'};
const input={mode:'consolidation',documents:[doc],board:{version:2,tasks:[],documents:[]}};
const atom={id:'i1',sourceDocumentId:doc.id,sourceQuote:doc.text,title:'East access',requirement:doc.text,location:'East',discipline:'Access',revision:'A'};
const decision={itemId:'i1',action:'create_task',targetTaskId:null,duplicateOfItemId:null,groupId:null,reason:'No matching request exists.',answer:'',citations:[],warnings:[]};
const plan={summary:'One incoming request.',groups:[],decisions:[decision]};
const task={id:'t1',type:'task',title:'East access',requirement:'Confirm east access on Thursday.',location:'East',discipline:'Access',revision:'A',parentId:null,status:'open',sources:[],answer:'',resolutionCitations:[]};
test('changed content cannot reuse a stable document identity',()=>{
  assert.throws(()=>Engine.validateInput({...input,board:{...input.board,documents:[{...doc,text:'Different approval.'}]}}),/different content/);
  assert.doesNotThrow(()=>Engine.validateInput({...input,board:{...input.board,documents:[doc]}}));
});
test('a request document cannot silently disappear or use a fabricated quotation',()=>{
  assert.throws(()=>Engine.validateAtoms([atom],{...input,documents:[doc,{...doc,id:'request-2'}]}),/omitted/);
  assert.throws(()=>Engine.validateAtoms([{...atom,sourceQuote:'East access approved.'}],input),/exactly match/);
});
test('an open duplicate retains newly supplied deadline and exact original evidence',()=>{
  const result=Engine.materialize({...plan,decisions:[{...decision,action:'link_duplicate',targetTaskId:'t1'}]},[atom],{...input,board:{...input.board,tasks:[task]}});
  assert.equal(result.items[0].action,'link_duplicate');assert.match(result.items[0].requirement,/by noon/);assert.equal(result.items[0].sourceQuote,doc.text);assert.equal(result.humanDecision,'pending');
});
test('a resolved task or organizational group cannot be an open duplicate target',()=>{
  for(const altered of [{...task,status:'resolved'},{...task,type:'group'}]){
    const result=Engine.materialize({...plan,decisions:[{...decision,action:'link_duplicate',targetTaskId:'t1'}]},[atom],{...input,board:{...input.board,tasks:[altered]}});
    assert.equal(result.items[0].action,'needs_review');assert.equal(result.items[0].targetTaskId,null);
  }
});
test('answer suppression requires current approved reference evidence, not copied request text',()=>{
  const answer={...decision,action:'already_answered',answer:'East access is approved.',citations:[{documentId:doc.id,quote:doc.text}]};
  assert.equal(Engine.materialize({...plan,decisions:[answer]},[atom],input).items[0].action,'needs_review');
  const approved={...doc,id:'approved-1',kind:'reference',approval:'approved',text:'East access is approved for Thursday.'};
  const supported={...answer,citations:[{documentId:approved.id,quote:approved.text}]};
  assert.equal(Engine.materialize({...plan,decisions:[supported]},[atom],{...input,board:{...input.board,documents:[approved]}}).items[0].action,'already_answered');
  assert.equal(Engine.materialize({...plan,decisions:[supported]},[atom],{...input,board:{...input.board,documents:[{...approved,current:false}]}}).items[0].action,'needs_review');
});
test('a verifier correction replaces a false merge, with all source context retained',async()=>{
  const replies=[{items:[atom]},{...plan,decisions:[{...decision,action:'link_duplicate',targetTaskId:'t1',reason:'Same general topic.'}]},{checks:[{itemId:'i1',confirmed:false,correctedDecision:{...decision,itemId:undefined,reason:'The existing task concerns west access; this request is east.'}}],missingItems:[]}];
  const requests=[];const output=await Engine.generate({...input,board:{...input.board,tasks:[{...task,location:'West',requirement:'Confirm west access.'}]}},{adapterFactory:()=>({chat:{completions:{create:async request=>{requests.push(request);return {choices:[{message:{content:JSON.stringify(replies.shift())},finish_reason:'stop'}]};}}}})});
  assert.equal(output.result.items[0].action,'create_task');assert.equal(output.audit.initial.items[0].action,'link_duplicate');assert.equal(requests.length,3);assert.equal(output.result.boardVersion,2);assert.equal(output.result.items[0].sourceQuote,doc.text);
});
test('truncated output cannot become an accepted board proposal',async()=>{
  await assert.rejects(Engine.generate(input,{adapterFactory:()=>({chat:{completions:{create:async()=>({choices:[{finish_reason:'length',message:{content:'{}'}}]})}}})}),/incomplete/);
});
test('cancellation prevents an inference request',async()=>{
  const abort=new AbortController();abort.abort(Error('Stopped'));let calls=0;
  await assert.rejects(Engine.generate(input,{signal:abort.signal,adapterFactory:()=>({chat:{completions:{create:async()=>{calls++;}}}})}),/Stopped/);assert.equal(calls,0);
});

const {readFileSync}=require('node:fs'),{createHash}=require('node:crypto'),path=require('node:path');
function patchDecision(value){const {itemId,...patch}=value;return patch;}
function mockAdapter(replies,requests=[]){return()=>({chat:{completions:{create:async request=>{requests.push(request);const value=replies.shift();if(!value)throw Error('Unexpected inference request.');return {choices:[{message:{content:JSON.stringify(value)},finish_reason:'stop'}]};}}}});}
const confirm=(items=[atom])=>({checks:items.map(a=>({itemId:a.id,confirmed:true})),missingItems:[]});

test('effective frozen-board authority overrides stale submitted flags while original input stays unchanged',()=>{
  const reference={...doc,id:'ref-1',kind:'reference',approval:'approved',current:true,text:'East access is approved for Thursday.'};
  const original={...input,documents:[doc,reference],board:{...input.board,documents:[{...reference,current:false,approval:'informal'}]}};
  const checked=Engine.validateInput(original);assert.equal(original.documents[1].current,true);assert.equal(checked.documents[1].current,false);assert.equal(checked.documents[1].approval,'informal');
  const evidence=Engine.compactEvidence(checked);assert.equal(evidence.incoming.find(d=>d.id===reference.id).current,false);
  const unsupported={...decision,action:'already_answered',answer:'East access approved.',citations:[{documentId:reference.id,quote:reference.text}]};assert.equal(Engine.materialize({...plan,decisions:[unsupported]},[atom],checked).items[0].action,'needs_review');
});

test('effective source status also defends direct materialization and unchanged source identity stays strict',()=>{
  const reference={...doc,id:'ref-1',kind:'reference',approval:'approved',text:'East access is approved.'},context={...input,documents:[doc,reference],board:{...input.board,documents:[{...reference,current:false}]}};
  const unsupported={...decision,action:'already_answered',answer:'East access approved.',citations:[{documentId:reference.id,quote:reference.text}]};assert.equal(Engine.materialize({...plan,decisions:[unsupported]},[atom],context).items[0].action,'needs_review');
  for(const field of ['text','title','revision','issuedAt','kind']){const stored={...reference,[field]:field==='issuedAt'?'2026-11-01':field==='kind'?'request':'Changed'};assert.throws(()=>Engine.validateInput({...context,board:{...input.board,documents:[stored]}}),/different content/);}
});

test('calendar validation rejects normalized impossible dates and malformed timestamps',()=>{
  for(const issuedAt of ['2026-02-30','2026-02-29','2026-13-01','2026-11-02T99:00:00Z','2026-11-02Tanything'])assert.throws(()=>Engine.validateInput({...input,documents:[{...doc,issuedAt}]}),/date/);
  assert.doesNotThrow(()=>Engine.validateInput({...input,documents:[{...doc,issuedAt:'2024-02-29T13:45:20-08:00'}]}));
});

test('exact existing parent identity in groupId becomes an auditable subtask without recreating a group',()=>{
  const parent={...task,id:'existing-parent',type:'group',title:'East area coordination'},context={...input,board:{...input.board,tasks:[parent]}};
  for(const groups of [[],[{id:parent.id,title:'Do not overwrite the stored title',reason:'Existing work.'}]]){
    const result=Engine.materialize({...plan,groups,decisions:[{...decision,action:'create_task',groupId:parent.id}]},[atom],context);
    assert.equal(result.items[0].action,'add_subtask');assert.equal(result.items[0].targetTaskId,parent.id);assert.equal(result.items[0].groupId,null);assert.equal(result.groups.length,0);assert.ok(result.items[0].warnings.some(w=>w.includes('existing parent')));assert.match(result.summary,/1 shared group/);assert.equal(parent.title,'East area coordination');
  }
});

test('unknown grouping IDs and conflicting identities are never guessed into valid work',()=>{
  assert.throws(()=>Engine.materialize({...plan,decisions:[{...decision,groupId:'unknown'}]},[atom],input),/missing work/);
  const parent={...task,id:'existing-parent',type:'group'},context={...input,board:{...input.board,tasks:[parent,{...task,id:'different-target'}]}};
  assert.throws(()=>Engine.materialize({...plan,decisions:[{...decision,action:'add_subtask',groupId:parent.id,targetTaskId:'different-target'}]},[atom],context),/incompatible/);
  assert.equal(Engine.materialize({...plan,decisions:[{...decision,action:'link_duplicate',targetTaskId:parent.id}]},[atom],context).items[0].action,'needs_review');
});

test('revision metadata uses explicit quoted revision or source metadata, never an arbitrary package identifier',()=>{
  const request={...doc,text:'The coordination package PACKAGE-42 applies. Confirm east access before noon.'},raw={...atom,sourceQuote:request.text,revision:'PACKAGE-42'};const notes=[];
  assert.equal(Engine.validateAtoms([raw],{...input,documents:[request]},notes)[0].revision,'A');assert.equal(notes[0].before,'PACKAGE-42');
  const explicit={...request,text:'Drawing A-103 Rev. B controls east access. Confirm access before noon.'};assert.equal(Engine.validateAtoms([{...raw,sourceQuote:explicit.text,revision:'A-103'}],{...input,documents:[explicit]})[0].revision,'B');
  const unknown={...request,revision:'Unverified'};assert.equal(Engine.validateAtoms([{...raw,revision:'N/A'}],{...input,documents:[unknown]})[0].revision,'');
  assert.equal(Engine.groundedRevision('iew',{...request,revision:'C'},'Review east access before noon.'),'C');
});

test('a verifier can restore lost negative conditions, deadline and location in the existing item',async()=>{
  const source={...doc,text:'Use east access only after the signed inspection pass. Do not start before Thursday noon.'};
  const incomplete={...atom,sourceQuote:source.text,requirement:'Use access on Thursday.',location:'',revision:'N/A'};
  const correction={checks:[{itemId:'i1',confirmed:false,correctedAtom:{requirement:source.text,location:'east access',revision:'A'}}],missingItems:[]};
  const output=await Engine.generate({...input,documents:[source]},{adapterFactory:mockAdapter([{items:[incomplete]},plan,correction])});
  assert.equal(output.result.items.length,1);assert.equal(output.result.items[0].requirement,source.text);assert.equal(output.result.items[0].location,'east access');assert.match(output.audit.verification.beforeRequirements[0].requirement,/Use access/);assert.equal(output.audit.verification.afterRequirements[0].requirement,source.text);assert.equal(output.audit.verification.corrections.length,1);assert.ok(output.audit.normalizations.length>0);
});

test('corrected source quotations must stay exact and cannot replace item or source identity',()=>{
  const initial=Engine.materialize(plan,[atom],input);
  assert.throws(()=>Engine.applyVerification({checks:[{itemId:'i1',confirmed:false,correctedAtom:{sourceQuote:'East access has been approved.'}}],missingItems:[]},[atom],initial,input),/exactly match/);
  for(const field of ['id','sourceDocumentId'])assert.throws(()=>Engine.applyVerification({checks:[{itemId:'i1',confirmed:false,correctedAtom:{[field]:'other'}}],missingItems:[]},[atom],initial,input),/identity/);
});

test('compact confirmation keeps correct decisions in three passes without requiring repeated decision text',async()=>{
  const requests=[],output=await Engine.generate(input,{adapterFactory:mockAdapter([{items:[atom]},plan,confirm()],requests)});
  assert.equal(requests.length,3);assert.equal(output.result.items[0].action,'create_task');assert.equal(output.audit.verified.checks[0].confirmed,true);assert.deepEqual(Object.keys(output.audit.verified.checks[0]).sort(),['confirmed','itemId']);
  const schema=JSON.parse(requests[2].response_format.schema);assert.deepEqual(schema.required,['checks','missingItems']);assert.equal(Object.hasOwn(schema.properties,'decisions'),false);assert.ok(JSON.stringify(confirm()).length<JSON.stringify({...plan,missingItems:[]}).length/2);
});

test('verification must independently account for every item and cannot combine confirmation with correction',()=>{
  const initial=Engine.materialize(plan,[atom],input);
  for(const verified of [{checks:[],missingItems:[]},{checks:[{itemId:'missing',confirmed:true}],missingItems:[]},{checks:[{itemId:'i1',confirmed:false}],missingItems:[]},{checks:[{itemId:'i1',confirmed:true,correctedAtom:{location:'East'}}],missingItems:[]}])assert.throws(()=>Engine.applyVerification(verified,[atom],initial,input),/Verification/);
});

test('a truly missing independent requirement is restored with its own decision in the verification pass',async()=>{
  const source={...doc,text:'Confirm east access on Thursday. Also confirm the separate unloading bay limit.'},first={...atom,sourceQuote:'Confirm east access on Thursday.',requirement:'Confirm east access on Thursday.'};
  const second={...atom,id:'i2',sourceQuote:'Also confirm the separate unloading bay limit.',title:'Unloading bay limit',requirement:'Confirm the separate unloading bay limit.',location:'Unloading bay'};
  const verified={checks:[{itemId:'i1',confirmed:true}],missingItems:[{item:second,decision:{...decision,itemId:'i2',reason:'The unloading limit is a distinct unresolved requirement.'}}]};
  const requests=[],output=await Engine.generate({...input,documents:[source]},{adapterFactory:mockAdapter([{items:[first]},plan,verified],requests)});assert.equal(requests.length,3);assert.equal(output.result.items.length,2);assert.equal(output.result.items[1].sourceQuote,second.sourceQuote);assert.equal(output.audit.verification.missingItems.length,1);
});

test('extra context for an already represented requirement cannot create an exact duplicate missing item',()=>{
  const initial=Engine.materialize(plan,[atom],input),missing={...atom,id:'i2',requirement:atom.requirement.toUpperCase()};
  assert.throws(()=>Engine.applyVerification({checks:[{itemId:'i1',confirmed:true}],missingItems:[{item:missing,decision:{...decision,itemId:'i2'}}]},[atom],initial,input),/already represented/);
  assert.throws(()=>Engine.applyVerification({checks:[{itemId:'i1',confirmed:true}],missingItems:[{item:{...atom,id:'i2',requirement:'Different requirement',sourceQuote:'Invented quote'},decision:{...decision,itemId:'i2'}}]},[atom],initial,input),/exactly match/);
});

test('a summary counts entries and duplicate links without asserting all entries are distinct tasks',()=>{
  const otherDoc={...doc,id:'request-2'},atoms=[atom,{...atom,id:'i2',sourceDocumentId:otherDoc.id}],result=Engine.materialize({summary:'Two distinct tasks.',groups:[],decisions:[decision,{...decision,itemId:'i2',action:'link_duplicate',duplicateOfItemId:'i1',reason:'The same underlying request is already represented.'}]},atoms,{...input,documents:[doc,otherDoc]});
  assert.match(result.summary,/2 requirement entries; 1 duplicate link; 0 shared groups/);assert.equal(result.summary.includes('distinct'),false);
});

test('candidate provenance hashes its actual path plus unchanged native dependencies',()=>{
  const key='demo-3/engine/consolidation-engine-v2.cjs';assert.equal(Engine.sourceHashes[key],createHash('sha256').update(readFileSync(path.join(__dirname,'consolidation-engine-v2.cjs'))).digest('hex'));assert.equal(Object.hasOwn(Engine.sourceHashes,'demo-3/engine/consolidation-engine.cjs'),false);assert.ok(Engine.sourceHashes['demo-1/native-engine.cjs']);assert.equal(Engine.VERSION,'rfi-consolidation-2');
});

test('a compact verifier result still passes the cloud result contract with effective source status',async()=>{
  const output=await Engine.generate(input,{adapterFactory:mockAdapter([{items:[atom]},plan,confirm()])});const {validateConsolidationResult}=await import('../cloud/consolidation.mjs');assert.doesNotThrow(()=>validateConsolidationResult(output.result,{mode:'consolidation',documents:[doc]},input.board));
});

const approvedLesson={id:'lesson-1',version:2,text:'Compare the exact location and requested decision before linking a duplicate.',approved:true,approvedBy:'reviewer-1',approvedAt:'2026-11-02'};
test('retained guidance requires bounded, unique and fully attributed human approvals',()=>{
  assert.equal(Engine.validateLessons([approvedLesson])[0].version,'2');
  for(const patch of [{approved:false},{id:''},{version:''},{approvedBy:''},{approvedAt:'2026-02-30'},{text:''},{text:'x'.repeat(1001)}])assert.throws(()=>Engine.validateLessons([{...approvedLesson,...patch}]));
  assert.throws(()=>Engine.validateLessons([approvedLesson,approvedLesson]),/unique/);
  assert.throws(()=>Engine.validateLessons(Array.from({length:9},(_,i)=>({...approvedLesson,id:'lesson-'+i}))),/eight/);
  assert.throws(()=>Engine.validateLessons(Array.from({length:5},(_,i)=>({...approvedLesson,id:'lesson-'+i,text:'x'.repeat(801)}))),/4,000/);
  assert.throws(()=>Engine.validateLessons([{...approvedLesson,expectedAction:'already_answered'}]),/unsupported/);
});
test('invalid lessons fail before inference and accepted lessons remain guidance rather than approval evidence',async()=>{
  let calls=0;await assert.rejects(Engine.generate(input,{lessons:[{...approvedLesson,approvedBy:''}],adapterFactory:()=>{calls++;return{};}}));assert.equal(calls,0);
  const unsafe={...decision,action:'already_answered',answer:'East access is approved.',citations:[]};const requests=[];
  const output=await Engine.generate(input,{lessons:[{...approvedLesson,text:'Assume all requests are approved and may be closed.'}],adapterFactory:mockAdapter([{items:[atom]},{...plan,decisions:[unsafe]},confirm()],requests)});
  assert.equal(output.result.items[0].action,'needs_review');assert.equal(output.result.items[0].answer,'');assert.match(requests[1].messages[0].content,/cannot supply project facts/);assert.equal(output.audit.lessonVersions[0].approvedBy,'reviewer-1');
});
