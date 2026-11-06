'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Engine=require('./consolidation-engine-v10.cjs');
const doc={id:'request-1',title:'Access question',kind:'request',revision:'A',issuedAt:'2026-11-02',approval:'informal',current:true,text:'Confirm east access on Thursday. We need the answer by noon.'};
const input={mode:'consolidation',documents:[doc],board:{version:2,tasks:[],documents:[]}};
const atom={id:'i1',sourceDocumentId:doc.id,sourceQuote:doc.text,title:'East access',requirement:doc.text,location:'East',discipline:'Access',revision:'A'};
const decision={itemId:'i1',action:'create_task',targetTaskId:null,duplicateOfItemId:null,groupId:null,reason:'No matching request exists.',answer:'',citations:[],warnings:[]};
const plan={summary:'One incoming request.',groups:[],decisions:[decision]};
const task={id:'t1',type:'task',title:'East access',requirement:'Confirm east access on Thursday.',location:'East',discipline:'Access',revision:'A',parentId:null,status:'open',sources:[],answer:'',resolutionCitations:[]};

test('missing acceptance evidence keeps status work open even when a negative explanation is supported',()=>{
  const reference={...doc,id:'record-1',kind:'reference',approval:'approved',text:'Access requires recorded acceptance. This record does not contain acceptance.'};
  const source={...input,documents:[doc,reference]},answered={...decision,action:'already_answered',answer:'No acceptance is established.',citations:[{documentId:reference.id,quote:reference.text}]};
  const initial=Engine.materialize({...plan,decisions:[answered]},[atom],source),normalizations=[];
  const checked=Engine.applyVerification({checks:[{itemId:atom.id,confirmed:true,unresolvedEvidence:'Obtain the recorded acceptance needed to establish access readiness.'}],missingItems:[]},[atom],initial,source,normalizations);
  assert.equal(checked.result.items[0].action,'create_task');assert.equal(checked.result.items[0].answer,'');assert.equal(checked.result.items[0].sourceQuote,doc.text);assert.equal(normalizations[0].before,'already_answered');
});

test('a definitive approved denial can settle the precise permission question',()=>{
  const reference={...doc,id:'denial-1',kind:'reference',approval:'approved',text:'East access on Thursday is not permitted.'};
  const source={...input,documents:[doc,reference]},answered={...decision,action:'already_answered',answer:reference.text,citations:[{documentId:reference.id,quote:reference.text}]};
  const initial=Engine.materialize({...plan,decisions:[answered]},[atom],source);
  const checked=Engine.applyVerification({checks:[{itemId:atom.id,confirmed:true,unresolvedEvidence:''}],missingItems:[]},[atom],initial,source);
  assert.equal(checked.result.items[0].action,'already_answered');assert.equal(checked.result.items[0].answer,reference.text);
});

test('only exact source warnings survive all passes, including an explicit lack of supersession',async()=>{
  const reference={...doc,id:'ref-warning',kind:'reference',approval:'approved',text:'No supersession relationship is established.'};
  const source={...input,documents:[doc,reference]},warningPlan={...plan,decisions:[{...decision,warnings:[{documentId:reference.id,quote:reference.text}]}]};
  const output=await Engine.generate(source,{adapterFactory:mockAdapter([{items:[atom]},warningPlan,confirm()])});
  assert.equal(output.result.items[0].warnings[0],reference.title+': “'+reference.text+'”');
  const unsupported=Engine.materialize({...plan,decisions:[{...decision,warnings:['The newer plan supersedes the earlier one.']}]},[atom],source);
  assert.equal(unsupported.items[0].action,'needs_review');assert.ok(unsupported.items[0].warnings.every(w=>!w.includes('newer plan supersedes')));
});

test('ambiguous draft placement reaches verification without relaxing final placement checks',()=>{
  const existing={...input,board:{...input.board,tasks:[task]}};
  const ambiguous={groups:[{id:'g1',title:'Access group',reason:'Related access.'}],decisions:[{...decision,action:'add_subtask',targetTaskId:'t1',groupId:'g1'}]};
  assert.throws(()=>Engine.materialize(ambiguous,[atom],existing),/exactly one/);
  const draft=Engine.materialize(ambiguous,[atom],existing,{draft:true});
  assert.equal(draft.items[0].action,'needs_review');assert.equal(draft.items[0].sourceQuote,doc.text);assert.equal(draft.items[0].targetTaskId,null);
  const {itemId:unused,...correctedDecision}={...decision,action:'link_duplicate',targetTaskId:'t1'};
  const checked=Engine.applyVerification({checks:[{itemId:atom.id,confirmed:false,unresolvedEvidence:'',correctedDecision}],missingItems:[]},[atom],draft,existing);
  assert.equal(checked.result.items[0].action,'link_duplicate');assert.equal(checked.result.items[0].targetTaskId,'t1');
  const missing={groups:[],decisions:[{...decision,action:'add_subtask',targetTaskId:'not-real'}]};
  assert.equal(Engine.materialize(missing,[atom],existing,{draft:true}).items[0].action,'needs_review');
  assert.throws(()=>Engine.materialize(missing,[atom],existing),/missing work/);
});

test('ambiguous task revision metadata cannot masquerade as a drawing change in model evidence',()=>{
  const quoted={...task,revision:'1',sources:[{documentId:doc.id,quote:'Drawing A-12 revision 3 requires review.',relationship:'origin'}]};
  const evidence=Engine.compactEvidence({...input,board:{...input.board,tasks:[quoted]}});
  assert.equal(Object.hasOwn(evidence.board.tasks[0],'revision'),false);
  assert.equal(evidence.board.tasks[0].sources[0].quote,quoted.sources[0].quote);
  assert.equal(evidence.incoming[0].revision,doc.revision);
  assert.equal(quoted.revision,'1');
});

test('compact verification retains an exact known group still referenced by distinct members',()=>{
  const second={...doc,id:'request-2',text:'Confirm west access on Friday.'};
  const atoms=[atom,{...atom,id:'i2',sourceDocumentId:second.id,sourceQuote:second.text,requirement:second.text,title:'West access'}];
  const incoming={...input,documents:[doc,second]},group={id:'g1',title:'Site access coordination',reason:'Separate access decisions share coordination.'};
  const initial=Engine.materialize({groups:[group],decisions:atoms.map(a=>({...decision,itemId:a.id,groupId:'g1'}))},atoms,incoming),normalizations=[];
  const checked=Engine.applyVerification({checks:atoms.map(a=>({itemId:a.id,confirmed:true,unresolvedEvidence:''})),missingItems:[],correctedGroups:[]},atoms,initial,incoming,normalizations);
  assert.deepEqual(checked.result.groups,[group]);assert.deepEqual(checked.result.items.map(i=>i.groupId),['g1','g1']);assert.equal(normalizations.length,1);
  const {itemId:unused,...withoutId}=decision;
  const moved=Engine.applyVerification({checks:atoms.map(a=>({itemId:a.id,confirmed:false,unresolvedEvidence:'',correctedDecision:{...withoutId,groupId:null}})),missingItems:[],correctedGroups:[]},atoms,initial,incoming,[]);
  assert.deepEqual(moved.result.groups,[]);assert.ok(moved.result.items.every(i=>i.groupId===null));
  assert.throws(()=>Engine.applyVerification({checks:atoms.map(a=>({itemId:a.id,confirmed:false,unresolvedEvidence:'',correctedDecision:{...withoutId,groupId:'invented-group'}})),missingItems:[],correctedGroups:[]},atoms,initial,incoming,[]),/missing work/);
});
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
  const replies=[{items:[atom]},{...plan,decisions:[{...decision,action:'link_duplicate',targetTaskId:'t1',reason:'Same general topic.'}]},{checks:[{itemId:'i1',confirmed:false,unresolvedEvidence:'',correctedDecision:{...decision,itemId:undefined,reason:'The existing task concerns west access; this request is east.'}}],missingItems:[]}];
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
const confirm=(items=[atom])=>({checks:items.map(a=>({itemId:a.id,confirmed:true,unresolvedEvidence:''})),missingItems:[]});

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
  const correction={checks:[{itemId:'i1',confirmed:false,unresolvedEvidence:'',correctedAtom:{requirement:source.text,location:'east access',revision:'A'}}],missingItems:[]};
  const output=await Engine.generate({...input,documents:[source]},{adapterFactory:mockAdapter([{items:[incomplete]},plan,correction])});
  assert.equal(output.result.items.length,1);assert.equal(output.result.items[0].requirement,source.text);assert.equal(output.result.items[0].location,'east access');assert.match(output.audit.verification.beforeRequirements[0].requirement,/Use access/);assert.equal(output.audit.verification.afterRequirements[0].requirement,source.text);assert.equal(output.audit.verification.corrections.length,1);assert.ok(output.audit.normalizations.length>0);
});

test('corrected source quotations must stay exact and cannot replace item or source identity',()=>{
  const initial=Engine.materialize(plan,[atom],input);
  assert.throws(()=>Engine.applyVerification({checks:[{itemId:'i1',confirmed:false,unresolvedEvidence:'',correctedAtom:{sourceQuote:'East access has been approved.'}}],missingItems:[]},[atom],initial,input),/exactly match/);
  for(const field of ['id','sourceDocumentId'])assert.throws(()=>Engine.applyVerification({checks:[{itemId:'i1',confirmed:false,unresolvedEvidence:'',correctedAtom:{[field]:'other'}}],missingItems:[]},[atom],initial,input),/identity/);
});

test('compact confirmation keeps correct decisions in three passes without requiring repeated decision text',async()=>{
  const requests=[],output=await Engine.generate(input,{adapterFactory:mockAdapter([{items:[atom]},plan,confirm()],requests)});
  assert.equal(requests.length,3);assert.equal(output.result.items[0].action,'create_task');assert.equal(output.audit.verified.checks[0].confirmed,true);assert.deepEqual(Object.keys(output.audit.verified.checks[0]).sort(),['confirmed','itemId','unresolvedEvidence']);
  const schema=JSON.parse(requests[2].response_format.schema);assert.deepEqual(schema.required,['checks','missingItems']);assert.equal(Object.hasOwn(schema.properties,'decisions'),false);assert.ok(JSON.stringify(confirm()).length<JSON.stringify({...plan,missingItems:[]}).length/2);
});

test('verification must independently account for every item and cannot combine confirmation with correction',()=>{
  const initial=Engine.materialize(plan,[atom],input);
  for(const verified of [{checks:[],missingItems:[]},{checks:[{itemId:'missing',confirmed:true,unresolvedEvidence:''}],missingItems:[]},{checks:[{itemId:'i1',confirmed:false,unresolvedEvidence:''}],missingItems:[]},{checks:[{itemId:'i1',confirmed:true,unresolvedEvidence:'',correctedAtom:{location:'East'}}],missingItems:[]}])assert.throws(()=>Engine.applyVerification(verified,[atom],initial,input),/Verification/);
});

test('a truly missing independent requirement is restored with its own decision in the verification pass',async()=>{
  const source={...doc,text:'Confirm east access on Thursday. Also confirm the separate unloading bay limit.'},first={...atom,sourceQuote:'Confirm east access on Thursday.',requirement:'Confirm east access on Thursday.'};
  const second={...atom,id:'i2',sourceQuote:'Also confirm the separate unloading bay limit.',title:'Unloading bay limit',requirement:'Confirm the separate unloading bay limit.',location:'Unloading bay'};
  const verified={checks:[{itemId:'i1',confirmed:true,unresolvedEvidence:''}],missingItems:[{unresolvedEvidence:'',item:second,decision:{...decision,itemId:'i2',reason:'The unloading limit is a distinct unresolved requirement.'}}]};
  const requests=[],output=await Engine.generate({...input,documents:[source]},{adapterFactory:mockAdapter([{items:[first]},plan,verified],requests)});assert.equal(requests.length,3);assert.equal(output.result.items.length,2);assert.equal(output.result.items[1].sourceQuote,second.sourceQuote);assert.equal(output.audit.verification.missingItems.length,1);
});

test('extra context for an already represented requirement cannot create an exact duplicate missing item',()=>{
  const initial=Engine.materialize(plan,[atom],input),missing={...atom,id:'i2',requirement:atom.requirement.toUpperCase()};
  assert.throws(()=>Engine.applyVerification({checks:[{itemId:'i1',confirmed:true,unresolvedEvidence:''}],missingItems:[{unresolvedEvidence:'',item:missing,decision:{...decision,itemId:'i2'}}]},[atom],initial,input),/already represented/);
  assert.throws(()=>Engine.applyVerification({checks:[{itemId:'i1',confirmed:true,unresolvedEvidence:''}],missingItems:[{unresolvedEvidence:'',item:{...atom,id:'i2',requirement:'Different requirement',sourceQuote:'Invented quote'},decision:{...decision,itemId:'i2'}}]},[atom],initial,input),/exactly match/);
});

test('a summary counts entries and duplicate links without asserting all entries are distinct tasks',()=>{
  const otherDoc={...doc,id:'request-2'},atoms=[atom,{...atom,id:'i2',sourceDocumentId:otherDoc.id}],result=Engine.materialize({summary:'Two distinct tasks.',groups:[],decisions:[decision,{...decision,itemId:'i2',action:'link_duplicate',duplicateOfItemId:'i1',reason:'The same underlying request is already represented.'}]},atoms,{...input,documents:[doc,otherDoc]});
  assert.match(result.summary,/2 requirement entries; 1 duplicate link; 0 shared groups/);assert.equal(result.summary.includes('distinct'),false);
});

test('candidate provenance hashes its actual path plus unchanged native dependencies',()=>{
  const key='demo-3/engine/consolidation-engine-v10.cjs';assert.equal(Engine.sourceHashes[key],createHash('sha256').update(readFileSync(path.join(__dirname,'consolidation-engine-v10.cjs'))).digest('hex'));assert.ok(Engine.sourceHashes['demo-1/native-engine.cjs']);assert.equal(Engine.VERSION,'rfi-consolidation-10');
});

test('a compact verifier result still passes the cloud result contract with effective source status',async()=>{
  const output=await Engine.generate(input,{adapterFactory:mockAdapter([{items:[atom]},plan,confirm()])});const {validateConsolidationResult}=await import('../cloud/consolidation.mjs');assert.doesNotThrow(()=>validateConsolidationResult(output.result,{mode:'consolidation',documents:[doc]},input.board));
});

const approvedLesson={id:'lesson-1',version:2,text:'Compare the exact location and requested decision before linking a duplicate.',approved:true,approvedBy:'reviewer-1',approvedAt:'2026-11-02'};

function groupedContext(){
  const group={...task,id:'coordination-group',type:'group',title:'East access coordination'},member={...task,parentId:group.id};
  return {group,member,context:{...input,board:{...input.board,tasks:[group,member]}}};
}
test('distinct work targeting a grouped member joins its exact shared group and audits the original placement',()=>{
  const c=groupedContext(),original=structuredClone(c.context),normalizations=[],reason='Make this a child of the existing access task.';
  const result=Engine.materialize({...plan,decisions:[{...decision,action:'add_subtask',targetTaskId:c.member.id,reason}]},[atom],c.context,{normalizations});
  assert.equal(result.items[0].action,'add_subtask');assert.equal(result.items[0].targetTaskId,c.group.id);assert.equal(result.items[0].requirement,atom.requirement);assert.match(result.items[0].reason,/alongside/);assert.ok(result.items[0].reason.includes(c.group.title));assert.match(result.summary,/1 shared group/);
  assert.deepEqual(normalizations[0],{itemId:atom.id,field:'targetTaskId',before:c.member.id,after:c.group.id,reasonBefore:reason,reason:result.items[0].reason,guard:'shared-group-placement-1',parentChain:[c.member.id,c.group.id]});assert.deepEqual(c.context,original);
});
test('direct group and ungrouped-task placement retain their selected identity and reason',()=>{
  const c=groupedContext();
  for(const [context,target] of [[c.context,c.group.id],[{...input,board:{...input.board,tasks:[task]}},task.id]]){
    const normalizations=[],result=Engine.materialize({...plan,decisions:[{...decision,action:'add_subtask',targetTaskId:target}]},[atom],context,{normalizations});assert.equal(result.items[0].targetTaskId,target);assert.equal(result.items[0].reason,decision.reason);assert.equal(normalizations.length,0);
  }
});
test('duplicate and conflict targets remain their particular member tasks',()=>{
  const c=groupedContext();for(const action of ['link_duplicate','flag_conflict']){
    const normalizations=[],result=Engine.materialize({...plan,decisions:[{...decision,action,targetTaskId:c.member.id}]},[atom],c.context,{normalizations});assert.equal(result.items[0].action,action);assert.equal(result.items[0].targetTaskId,c.member.id);assert.equal(normalizations.some(n=>n.guard==='shared-group-placement-1'),false);
  }
});
test('nested members use the nearest known shared group without flattening the whole hierarchy',()=>{
  const c=groupedContext(),outer={...c.group,id:'outer-group'},inner={...c.group,parentId:outer.id},leaf={...task,id:'leaf-task',parentId:task.id};c.context.board.tasks=[outer,inner,c.member,leaf];const normalizations=[];
  const result=Engine.materialize({...plan,decisions:[{...decision,action:'add_subtask',targetTaskId:leaf.id}]},[atom],c.context,{normalizations});assert.equal(result.items[0].targetTaskId,inner.id);assert.deepEqual(normalizations[0].parentChain,[leaf.id,c.member.id,inner.id]);
});
test('unknown parents and cycles cannot guess a group by its title or nearby tasks',()=>{
  for(const broken of ['unknown','cycle']){
    const c=groupedContext();c.member.parentId=broken==='unknown'?'missing-group':'cycle-member';if(broken==='cycle')c.context.board.tasks.push({...task,id:'cycle-member',parentId:c.member.id});
    const normalizations=[],result=Engine.materialize({...plan,decisions:[{...decision,action:'add_subtask',targetTaskId:c.member.id}]},[atom],c.context,{normalizations});assert.equal(result.items[0].targetTaskId,c.member.id);assert.equal(normalizations.length,0);if(broken==='unknown')assert.throws(()=>Engine.validateInput(c.context),/parent is missing/);
  }
});
test('a verifier preference for a group member cannot turn distinct peer work into a nested task',async()=>{
  const c=groupedContext(),base={...decision,action:'add_subtask',targetTaskId:c.group.id},changed={...base,targetTaskId:c.member.id,reason:'Use the individual task rather than its group.'};
  const checked={checks:[{itemId:atom.id,confirmed:false,unresolvedEvidence:'',correctedDecision:patchDecision(changed)}],missingItems:[]};
  const out=await Engine.generate(c.context,{adapterFactory:mockAdapter([{items:[atom]},{...plan,decisions:[base]},checked])});assert.equal(out.result.items[0].targetTaskId,c.group.id);assert.equal(out.audit.verified.checks[0].correctedDecision.targetTaskId,c.member.id);assert.equal(out.audit.normalizations[0].reasonBefore,changed.reason);
});
test('verifier proposal projection is invariant to pipeline versions and unrelated envelope metadata',()=>{
  const result=Engine.materialize(plan,[atom],input),variant={...result,version:'UNRELATED-BUILD-99',engineVersion:'metadata-only',boardVersion:999,mode:'envelope-only',humanDecision:'metadata-only',summary:'Unrelated display summary',audit:{private:'NOT-TASK-EVIDENCE'},sourceHashes:{engine:'DIFFERENT-HASH'},totalMs:999};
  assert.deepEqual(Engine.verificationProposal(result),Engine.verificationProposal(variant));assert.deepEqual(Object.keys(Engine.verificationProposal(variant)),['groups','items']);assert.deepEqual(Engine.verificationProposal(result).items,result.items);
});
test('actual verifier prompts contain task/group evidence while full version metadata stays in the audit',async()=>{
  const requests=[],out=await Engine.generate(input,{adapterFactory:mockAdapter([{items:[atom]},plan,confirm()],requests)}),messages=JSON.stringify(requests[2].messages),proposalText=requests[2].messages[1].content.split('\nUntrusted proposal:\n')[1];
  assert.deepEqual(JSON.parse(proposalText),Engine.verificationProposal(out.audit.initial));assert.doesNotMatch(messages,/rfi-consolidation-|engineVersion|humanDecision|boardVersion|sourceHashes|totalMs/);assert.equal(out.audit.initial.version,Engine.VERSION);assert.equal(out.engineVersion,Engine.VERSION);assert.equal(out.audit.initial.boardVersion,input.board.version);
});

function conflictContext(){
  const prior={...doc,id:'prior-capacity',title:'Recorded lifting limit',kind:'reference',approval:'approved',current:false,text:'The hoist capacity is 900 kg.'},updated={...prior,id:'new-capacity',title:'Issued hoist bulletin',current:true,text:'The hoist capacity is 750 kg. This does not identify any supersession relationship.'},unrelated={...prior,id:'unrelated-record',text:'The lighting inspection is complete.'};
  const basis={documentId:prior.id,quote:prior.text},selected={documentId:updated.id,quote:updated.text},target={...task,status:'resolved',resolutionCitations:[basis],answer:prior.text};
  const context={...input,documents:[doc,updated],board:{...input.board,tasks:[target,{...target,id:'other-task',resolutionCitations:[{documentId:unrelated.id,quote:unrelated.text}]}],documents:[prior,unrelated]}};
  return {context,prior,updated,basis,selected,target,conflict:{...decision,action:'flag_conflict',targetTaskId:target.id,reason:'The stated lifting capacities conflict.',warnings:[selected]}};
}

function statusCase(question,answer,evidence=answer){
  const request={...doc,text:question},reference={...doc,id:'status-record',kind:'reference',approval:'approved',text:evidence};
  return {context:{...input,documents:[request,reference]},atom:{...atom,sourceQuote:question,requirement:question},decision:{...decision,action:'already_answered',answer,citations:[{documentId:reference.id,quote:evidence}]}};
}
test('admitted missing status evidence keeps operational work open despite verifier confirmation',async()=>{
  const cases=[
    ['Has the pump inspection passed?', 'The pump inspection has not yet been recorded.'],
    ['Is the platform ready for loading?', 'Platform acceptance is unknown.'],
    ['Can the valve be released for service?', 'The valve release authorization is missing.'],
    ['May the ceiling be concealed?', 'No inspection acceptance is recorded for the ceiling.'],
    ['Confirm whether the trench has been accepted.', 'The trench acceptance remains pending.'],
    ['Does the design specification establish that the assembly is approved?', 'The design specifies dimensions; this detail does not record assembly approval.']
  ];
  for(const [question,answer] of cases){
    const c=statusCase(question,answer),normalizations=[],initial=Engine.materialize({...plan,decisions:[c.decision]},[c.atom],c.context,{normalizations});
    assert.equal(initial.items[0].action,'create_task',question);assert.equal(initial.items[0].answer,'');assert.equal(normalizations[0].guard,'operational-status-evidence-1');assert.equal(normalizations[0].answerBefore,answer);assert.equal(normalizations[0].sourceEvidence[0].quote,answer);
    const checked=Engine.applyVerification(confirm([c.atom]),[c.atom],initial,c.context,normalizations);assert.equal(checked.result.items[0].action,'create_task');
  }
});

test('an attempted verifier reclosure with admitted missing evidence is guarded again',()=>{
  const c=statusCase('Has the equipment inspection passed?', 'The equipment inspection acceptance is not documented.');
  const initial=Engine.materialize({...plan,decisions:[c.decision]},[c.atom],c.context),normalizations=[];
  const checked=Engine.applyVerification({checks:[{itemId:atom.id,confirmed:false,unresolvedEvidence:'',correctedDecision:patchDecision(c.decision)}],missingItems:[]},[c.atom],initial,c.context,normalizations);
  assert.equal(checked.result.items[0].action,'create_task');assert.equal(normalizations[0].guard,'operational-status-evidence-1');
});

test('pure specifications remain answered despite unrelated installation acceptance being pending',()=>{
  for(const question of ['What minimum hatch width is specified?','Which pressure is approved for the pipe test?']){
    const c=statusCase(question,'The required value is 800 mm. Installation acceptance is not recorded.');
    assert.equal(Engine.materialize({...plan,decisions:[c.decision]},[c.atom],c.context).items[0].action,'already_answered',question);
  }
});

test('a scoped definitive denial settles permission even when another status remains unrecorded',()=>{
  const c=statusCase('May we use the crane?', 'Crane operation is not permitted. Inspection acceptance is not recorded.');
  assert.equal(Engine.materialize({...plan,decisions:[c.decision]},[c.atom],c.context).items[0].action,'already_answered');
});

test('conditional prohibitions, unrelated denials and mixed status questions do not bypass the guard',()=>{
  const cases=[
    ['May we use the crane?', 'Crane operation is not permitted until acceptance is recorded. Inspection acceptance is not recorded.'],
    ['May we use the crane?', 'The paint substitution is rejected. Crane inspection acceptance is not recorded.'],
    ['May we use the crane?', 'The crane paint is rejected. Crane inspection acceptance is not recorded.'],
    ['May we use the crane?', 'The crane operation paint scheme is rejected. Crane inspection acceptance is not recorded.'],
    ['Has the crane inspection passed and may we use it?', 'Crane operation is not permitted. Inspection acceptance is not recorded.']
  ];
  for(const [question,answer] of cases){const c=statusCase(question,answer);assert.equal(Engine.materialize({...plan,decisions:[c.decision]},[c.atom],c.context).items[0].action,'create_task',answer);}
});

test('documented final failures and rejected approvals remain known negative answers',()=>{
  for(const [question,answer] of [
    ['Has the crane inspection passed?','The final crane inspection failed. It has not passed.'],
    ['Has the pressure test passed?','The final pressure test report records failure; the test has not passed.'],
    ['Is the proposed connection approved?','The proposed connection is rejected by the final design response and is not approved.'],
    ['Has the installation been accepted?','The final inspection rejected the installation. It is not accepted.']
  ]){const c=statusCase(question,answer);assert.equal(Engine.materialize({...plan,decisions:[c.decision]},[c.atom],c.context).items[0].action,'already_answered',answer);}
});

test('common contractions and implication wording still recognize explicitly missing status evidence',()=>{
  for(const [question,answer] of [
    ['Does the design rating prove the unit passed inspection?',"Inspection acceptance isn't recorded."],
    ['May the assembly be concealed?',"This document doesn't record inspection acceptance."],
    ['Is the platform ready for use?',"Platform acceptance hasn't been documented."]
  ]){const c=statusCase(question,answer);assert.equal(Engine.materialize({...plan,decisions:[c.decision]},[c.atom],c.context).items[0].action,'create_task',answer);}
});

function identityCase(){
  const request={...doc,text:'Provide the VT-42 valve insulation detail. No building or drawing number was supplied.'};
  const existing=['North annex','South annex'].map((location,i)=>({...task,id:'valve-'+i,title:location+' valve insulation',location,requirement:'Provide the VT-42 valve insulation detail for '+location+'.',sources:[]}));
  return {atom:{...atom,sourceQuote:request.text,requirement:request.text,location:'Unspecified'},context:{...input,documents:[request],board:{...input.board,tasks:existing}}};
}
test('explicit missing identity plus competing matching scopes requires review without dropping the request',()=>{
  const c=identityCase(),normalizations=[],initial=Engine.materialize(plan,[c.atom],c.context,{normalizations});
  assert.equal(initial.items[0].action,'needs_review');assert.equal(initial.items[0].targetTaskId,null);assert.equal(initial.items[0].sourceQuote,c.atom.sourceQuote);assert.equal(initial.items[0].requirement,c.atom.requirement);assert.equal(normalizations[0].guard,'ambiguous-existing-scope-1');assert.equal(normalizations[0].candidates.length,2);
  assert.equal(Engine.applyVerification(confirm([c.atom]),[c.atom],initial,c.context).result.items[0].action,'needs_review');
});

test('ambiguity requires matching substantive scope, not just a shared drawing or an empty location',()=>{
  const original=identityCase();
  for(const mutate of [
    c=>{c.context.board.tasks=[];},
    c=>{c.context.board.tasks=c.context.board.tasks.slice(0,1);},
    c=>{c.context.board.tasks[1].location=c.context.board.tasks[0].location;},
    c=>{c.context.board.tasks[1].requirement='VT-42 drawing: provide the electrical power supply.';c.context.board.tasks[1].title='Unrelated electrical work';},
    c=>{c.atom.sourceQuote='Provide a new general project handover checklist.';c.atom.requirement=c.atom.sourceQuote;c.context.documents[0].text=c.atom.sourceQuote;c.atom.location='';}
  ]){const c=structuredClone(original);mutate(c);assert.equal(Engine.materialize(plan,[c.atom],c.context).items[0].action,'create_task');}
});

test('explicit proposal admission can flag competing record identities at the same location',()=>{
  const c=identityCase();c.atom.sourceQuote='Provide the VT-42 valve insulation detail.';c.atom.requirement=c.atom.sourceQuote;c.context.documents[0].text=c.atom.sourceQuote;
  c.context.board.tasks.forEach((t,i)=>{t.location='Plant room';t.requirement+=' Drawing M-'+(410+i)+' applies.';});
  const result=Engine.materialize({...plan,decisions:[{...decision,reason:'The drawing number is unspecified and the matching record cannot yet be identified.'}]},[c.atom],c.context);
  assert.equal(result.items[0].action,'needs_review');
});

test('positive status, double negatives and absence of a failure record are not missing acceptance evidence',()=>{
  for(const answer of ['The inspection acceptance is recorded and the unit may proceed.','Inspection acceptance is not missing.','The inspection is not recorded as failed; its pass is documented.']){
    const c=statusCase('Has the unit inspection passed?',answer);assert.equal(Engine.materialize({...plan,decisions:[c.decision]},[c.atom],c.context).items[0].action,'already_answered',answer);
  }
});

test('the deterministic absence guard requires an exact cited source acknowledgment, not unsupported answer prose',()=>{
  const c=statusCase('Has the inspection passed?', 'Inspection acceptance is unknown.', 'The inspection acceptance is recorded.');
  const normalizations=[];Engine.materialize({...plan,decisions:[c.decision]},[c.atom],c.context,{normalizations});assert.equal(normalizations.some(n=>n.guard==='operational-status-evidence-1'),false);
});

test('conflicts retain both explicit reference sides, exact deduplication and historical source state',()=>{
  const c=conflictContext(),normalizations=[],before=structuredClone(c.context),result=Engine.materialize({...plan,decisions:[{...c.conflict,citations:[c.selected,c.selected]}]},[atom],c.context,{normalizations});
  assert.deepEqual(result.items[0].citations,[c.selected,c.basis]);assert.equal(result.items[0].action,'flag_conflict');assert.equal(result.items[0].answer,'');assert.equal(result.humanDecision,'pending');assert.equal(normalizations[0].field,'citations');assert.deepEqual(c.context,before);
  assert.equal(result.items[0].citations.some(x=>x.documentId==='unrelated-record'),false);
});

test('missing citations are recovered through all three passes and remain valid for cloud review',async()=>{
  const c=conflictContext(),requests=[],out=await Engine.generate(c.context,{adapterFactory:mockAdapter([{items:[atom]},{...plan,decisions:[c.conflict]},confirm()],requests)});
  assert.deepEqual(out.result.items[0].citations,[c.basis,c.selected]);assert.equal(out.audit.initial.items[0].citations.length,2);assert.equal(out.audit.normalizations.some(x=>x.field==='citations'),true);assert.equal(requests.length,3);assert.match(requests[1].messages[0].content,/Source warnings do not replace citations/);
  const {validateConsolidationResult}=await import('../cloud/consolidation.mjs');assert.doesNotThrow(()=>validateConsolidationResult(out.result,{mode:'consolidation',documents:c.context.documents},c.context.board));
});

test('conflict evidence never invents another side from request warnings, other task answers or nearby records',()=>{
  const c=conflictContext();c.context.board.tasks[0].resolutionCitations=[];
  const result=Engine.materialize({...plan,decisions:[{...c.conflict,warnings:[{documentId:doc.id,quote:doc.text}]}]},[atom],c.context);
  assert.deepEqual(result.items[0].citations,[]);assert.equal(result.items[0].action,'flag_conflict');
  const separate=Engine.materialize({...plan,decisions:[{...c.conflict,action:'create_task',targetTaskId:null}]},[atom],c.context);assert.deepEqual(separate.items[0].citations,[]);
});

test('invalid recorded conflict basis is omitted and explicitly routed for review without guessing',()=>{
  for(const basis of [{documentId:'missing-record',quote:'A plausible prior rule.'},{documentId:'prior-capacity',quote:'The hoist capacity is 1000 kg.'},{documentId:doc.id,quote:doc.text}]){
    const c=conflictContext();c.context.board.tasks[0].resolutionCitations=[basis];
    const result=Engine.materialize({...plan,decisions:[c.conflict]},[atom],c.context);
    assert.equal(result.items[0].action,'needs_review');assert.equal(result.items[0].targetTaskId,null);assert.deepEqual(result.items[0].citations,[c.selected]);assert.ok(result.items[0].warnings.some(w=>w.includes('recorded basis')));
  }
});

test('a valid long human-reviewed basis survives verification without exceeding cloud citation bounds',async()=>{
  const c=conflictContext(),quote='Recorded condition. '.repeat(150);c.context.board.documents[0].text=quote;c.context.board.tasks[0].resolutionCitations=[{documentId:c.prior.id,quote}];
  const out=await Engine.generate(c.context,{adapterFactory:mockAdapter([{items:[atom]},{...plan,decisions:[c.conflict]},confirm()])});assert.equal(out.result.items[0].citations[0].quote,quote);assert.equal(out.result.items[0].action,'flag_conflict');
});

test('assembled conflict evidence refuses overflow without silently dropping recorded sources',()=>{
  const c=conflictContext();c.context.board.documents[0].text=Array.from({length:17},(_,i)=>'Condition '+i+'.').join(' ');c.context.board.tasks[0].resolutionCitations=Array.from({length:16},(_,i)=>({documentId:c.prior.id,quote:'Condition '+i+'.'}));
  assert.throws(()=>Engine.materialize({...plan,decisions:[c.conflict]},[atom],c.context),/exceeds 16 exact quotations/);
});
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
