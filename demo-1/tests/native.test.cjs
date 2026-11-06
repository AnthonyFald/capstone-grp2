const test=require('node:test'),assert=require('node:assert/strict'),{Readable}=require('node:stream'),{EventEmitter}=require('node:events');
const Native=require('../native-engine.cjs'),Client=require('../native-client.js'),Notes=require('../note-engine-27.js');
const request={messages:[{role:'user',content:'Local meeting'}],max_tokens:200,response_format:{schema:'{"type":"object"}'}};
test('meeting adapter keeps baseline settings separate, decodes Unicode, and forwards cancellation',async()=>{
 const previous=global.fetch,signal=new AbortController().signal,calls=[];let sent;
 global.fetch=async(url,options)=>{sent={url,options,body:JSON.parse(options.body)};return {ok:true,body:Readable.from([...Buffer.from(JSON.stringify({message:{content:'{"text":"Renée 李"}'}})+'\n'+JSON.stringify({done:true,done_reason:'stop',prompt_eval_count:50,eval_count:20}))].map(byte=>Buffer.from([byte])))};};
 try{const result=await Native.adapter({signal,record:c=>calls.push(c)}).chat.completions.create(request);assert.equal(sent.url,Native.BASE+'/api/chat');assert.equal(sent.options.signal,signal);assert.equal(sent.body.model,'qwen3.5:27b');assert.equal(sent.body.think,false);assert.equal(sent.body.options.temperature,.1);assert.equal(sent.body.options.num_ctx,16384);assert.match(result.choices[0].message.content,/Renée 李/);assert.equal(calls.length,1);await Native.adapter({policy:'quality'}).chat.completions.create(request);assert.equal(sent.body.options.temperature,.1);assert.equal(sent.body.options.num_ctx,16384);assert.throws(()=>Native.adapter({policy:'remote'}),/Unsupported/);}finally{global.fetch=previous;}
});
test('incomplete native streams and context exhaustion fail instead of publishing partial output',async()=>{
 const previous=global.fetch;
 try{for(const final of [null,{done:true,prompt_eval_count:16380,eval_count:5}]){global.fetch=async()=>({ok:true,body:Readable.from([Buffer.from(JSON.stringify({message:{content:'{}'}})+'\n'+(final?JSON.stringify(final):''))])});await assert.rejects(Native.adapter().chat.completions.create(request),/disconnected|context/);}}finally{global.fetch=previous;}
});
test('quality requests expose the same enforced schema without changing baseline messages',async()=>{
 const previous=global.fetch,bodies=[];
 global.fetch=async(url,options)=>{bodies.push(JSON.parse(options.body));return {ok:true,body:Readable.from([Buffer.from(JSON.stringify({message:{content:'{}'},done:true,done_reason:'stop',prompt_eval_count:50,eval_count:2}))])};};
 try{await Native.adapter({policy:'quality'}).chat.completions.create(request);await Native.adapter({policy:'baseline'}).chat.completions.create(request);assert.match(bodies[0].messages.at(-1).content,/following this schema/);assert.ok(bodies[0].messages.at(-1).content.endsWith(JSON.stringify(bodies[0].format)));assert.deepEqual(bodies[1].messages,request.messages);assert.equal(request.messages.at(-1).content,'Local meeting');}finally{global.fetch=previous;}
});
test('browser stream handles progress, Unicode and disconnects',async()=>{
 const response=text=>({ok:true,headers:new Headers({'Content-Type':'application/x-ndjson'}),body:Readable.from([...Buffer.from(text)].map(byte=>Buffer.from([byte])))}),progress=[];
 const value=await Client.read(response('{"type":"progress","stage":"Checking"}\n{"type":"result","result":{"text":"Renée 李"}}'),s=>progress.push(s));assert.equal(value.result.text,'Renée 李');assert.deepEqual(progress,['Checking']);await assert.rejects(Client.read(response('{"type":"progress","stage":"Checking"}\n'),()=>{}),/disconnected/);await assert.rejects(Client.read(response('{"type":"error","error":"Inference failed"}\n'),()=>{}),/Inference failed/);
});
const questionSource='[1] Rae: Is the interlock approved?\n[2] Bo: The manufacturer can ship it Friday.\n[3] Rae: Is the gate unlocked?\n[4] Bo: Yes, it was unlocked this morning.';
const questionCall={messages:[{role:'system',content:'Review questions.'},{role:'user',content:'<transcript>\n'+questionSource+'\n</transcript>'}],response_format:{schema:JSON.stringify({properties:{unanswered_questions:{type:'array'}}})},max_tokens:2400};
test('27B question coverage retains open groups and verifies every question candidate',()=>{
 const prepared=Notes.questionRequest(questionCall);assert.deepEqual(prepared.ids,['L1','L3']);
 const value={checks:{L1:{resolution:'open',answer_lines:[]},L3:{resolution:'answered',answer_lines:[4]}},open_questions:[{text:'Is the interlock approved?',lines:[1,2],candidate_ids:['L1']}]};
 assert.deepEqual(Notes.validateQuestions(value,prepared.rows,prepared.ids),[{text:'Is the interlock approved?',lines:[1,2]}]);
 for(const bad of [{...value,checks:{L1:value.checks.L1}},{...value,open_questions:[]},{...value,open_questions:[value.open_questions[0],value.open_questions[0]]},{...value,checks:{...value.checks,L3:{resolution:'answered',answer_lines:[99]}}}])assert.throws(()=>Notes.validateQuestions(bad,prepared.rows,prepared.ids));
});
test('native wrapper removes question coverage fields and distinguishes personal actions from team work',async()=>{
 let captured;const engine={chat:{completions:{create:async r=>{captured=r;return {choices:[{finish_reason:'stop',message:{content:JSON.stringify({checks:{L1:{resolution:'open',answer_lines:[]},L3:{resolution:'answered',answer_lines:[4]}},open_questions:[{text:'Is the interlock approved?',lines:[1,2],candidate_ids:['L1']}]})}}]};}}}};
 const wrapped=Notes.wrap(engine),result=await wrapped.chat.completions.create(questionCall);assert.match(captured.messages[0].content,/EVERY candidate/);assert.deepEqual(JSON.parse(result.choices[0].message.content),{unanswered_questions:[{text:'Is the interlock approved?',lines:[1,2]}]});
 const actionCall={...questionCall,response_format:{schema:'{"properties":{"candidate_actions":{}}}'}};await wrapped.chat.completions.create(actionCall);assert.notEqual(captured,actionCall);assert.match(captured.messages[0].content,/third-person team work plan/);assert.equal(actionCall.messages[0].content,'Review questions.');
});
test('incomplete question generation cannot pass as a complete review',async()=>{
 const engine={chat:{completions:{create:async()=>({choices:[{finish_reason:'length',message:{content:'{}'}}]})}}};await assert.rejects(Notes.wrap(engine).chat.completions.create(questionCall),/ran out of space/);
});
test('structured question review is not overwritten by the generic wording reviewer',async()=>{
 let calls=0;const engine={chat:{completions:{create:async request=>{
  calls++;const properties=JSON.parse(request.response_format.schema).properties;let result;
  if(properties.candidate_actions)result={candidate_actions:Object.fromEntries(Object.keys(properties.candidate_actions.properties).map(k=>[k,[]])),additional_actions:[]};
  else if(properties.scope_and_requirements)result={scope_and_requirements:[],known_facts_and_costs:[],restrictions_and_holds:[]};
  else if(properties.milestones)result={milestones:[],...(properties.date_checks?{date_checks:Object.fromEntries(Object.keys(properties.date_checks.properties).map(k=>[k,{classification:'background',milestone_ids:[]}]))}:{})};
  else if(properties.edits)result={edits:[]};
  else if(properties.additions)result={additions:[]};
  else if(properties.open_questions)result={checks:{L1:{resolution:'open',answer_lines:[]}},open_questions:[{text:'Whether the interlock is approved remains unresolved.',lines:[1,2],candidate_ids:['L1']}]};
  else if(properties.answers)result={answers:{L1:{question_requests:'Approval status',source_actually_answers:'Shipping timing only',resolution:'not_answered',remaining_question:'Whether the interlock is approved remains unresolved.',open_group:'G1',lines:[1,2]}}};
  else throw Error('Generic wording review must not overwrite the completed question review.');
  return {choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]};
 }}}};
 const result=await Notes.generate(engine,'[1] Rae: Is the interlock approved?\n[2] Bo: The manufacturer can ship Friday.');assert.equal(result.items.length,1);assert.equal(result.items[0].kind,'question');assert.match(result.items[0].text,/unresolved/);
});
test('source quotation accepts adjacent ASR fragments but rejects invented words and uncited gaps',()=>{
 const rows=[{line:1,raw:'A: If two technicians arrive Tuesday,'},{line:2,raw:'B: packing can finish Friday.'},{line:3,raw:'A: Approval is still pending.'}];
 assert.equal(Notes.sourceContainsQuote('If two technicians arrive Tuesday, packing can finish Friday.',[1,2],rows),true);
 assert.equal(Notes.sourceContainsQuote('If three technicians arrive Tuesday, packing can finish Friday.',[1,2],rows),false);
 assert.equal(Notes.sourceContainsQuote('If two technicians arrive Tuesday, Approval is still pending.',[1,3],rows),false);
 assert.deepEqual(Notes.supportedQuoteLines('If two technicians arrive Tuesday, packing can finish Friday.',[2],rows),[1,2]);
 assert.throws(()=>Notes.supportedQuoteLines('If three technicians arrive Tuesday, packing can finish Friday.',[2],rows),/exact source/);
 assert.throws(()=>Notes.supportedQuoteLines('If two technicians arrive Tuesday, Approval is still pending.',[1,3],rows),/exact source/);
});
test('technical edits require source support and cannot silently change dates or approvals',()=>{
 const rows=[{line:1,raw:'A: Replace the drive rail.'},{line:2,raw:'A: The drive ray is damaged.'}],notes=[{text:'Replace the drive ray.',lines:[2],kind:'decision',status:'active',owner:null,due:null}];
 const edit={note_id:'N1',original_phrase:'drive ray',replacement_phrase:'drive rail',uncertain:false,source_lines:[1],source_quote:'Replace the drive rail.'};
 assert.equal(Notes.applyWordingEdits(notes,{edits:[edit]},rows)[0].text,'Replace the drive rail.');
 const rejected=[];const unproven=Notes.applyWordingEdits(notes,{edits:[{...edit,replacement_phrase:'drive motor'}]},rows,e=>rejected.push(e))[0].text;assert.match(unproven,/source wording unclear/);assert.doesNotMatch(unproven,/motor/);assert.match(rejected[0].reason,/clearer phrase/);
 assert.equal(Notes.applyWordingEdits(notes,{edits:[{...edit,replacement_phrase:'approved drive rail'}]},rows,e=>rejected.push(e))[0].text,notes[0].text);assert.match(rejected[1].reason,/more than a technical phrase/);
 const uncertain=Notes.applyWordingEdits(notes,{edits:[{...edit,replacement_phrase:'drive component',uncertain:true,source_lines:[2],source_quote:'The drive ray is damaged.'}]},rows);assert.match(uncertain[0].text,/source term unclear/);assert.equal(notes[0].text,'Replace the drive ray.');
 const clear=[{text:'Replace the drive rail.',lines:[1,2]}];const downgrade={...edit,original_phrase:'drive rail',replacement_phrase:'drive ray',source_lines:[2],source_quote:'The drive ray is damaged.'};assert.equal(Notes.applyWordingEdits(clear,{edits:[downgrade]},rows)[0].text,clear[0].text);
 const dated=[{text:'Finish re-scoring by Friday.',lines:[1]}],garbled=[{line:1,raw:'A: Finish re-scoring by Friday.'}];const dateEdit={note_id:'N1',original_phrase:'re-scoring by Friday',replacement_phrase:'resurfacing by Friday',uncertain:false,source_lines:[1],source_quote:'Finish re-scoring by Friday.'};const flagged=Notes.applyWordingEdits(dated,{edits:[dateEdit]},garbled)[0].text;assert.match(flagged,/source wording unclear/);assert.match(flagged,/by Friday\.$/);assert.doesNotMatch(flagged,/resurfacing/);
});
test('answer verification reopens a related-but-incomplete answer instead of losing the question',async()=>{
 const prepared=Notes.questionRequest(questionCall),value={checks:{L1:{resolution:'answered',answer_lines:[2]},L3:{resolution:'answered',answer_lines:[4]}},open_questions:[]};
 const answers={L1:{question_requests:'Approval status',source_actually_answers:'Shipping availability',resolution:'not_answered',remaining_question:'Is the interlock approved?',open_group:'new',lines:[1,2]},L3:{question_requests:'Whether gate is unlocked',source_actually_answers:'Gate was unlocked this morning',resolution:'directly_answered',remaining_question:null,open_group:'new',lines:[3,4]}};
 const engine={chat:{completions:{create:async request=>{const id=Object.keys(JSON.parse(request.response_format.schema).properties.answers.properties)[0];return {choices:[{finish_reason:'stop',message:{content:JSON.stringify({answers:{[id]:answers[id]}})}}]};}}}};
 await Notes.verifyAnswers(engine,value,prepared,()=>{});assert.deepEqual(Notes.validateQuestions(value,prepared.rows,prepared.ids),[{text:'Is the interlock approved?',lines:[1,2]}]);
});
test('answer verification removes a falsely open question while preserving other unresolved issues',async()=>{
 const prepared=Notes.questionRequest(questionCall),value={checks:{L1:{resolution:'open',answer_lines:[]},L3:{resolution:'open',answer_lines:[]}},open_questions:[{text:'Is the interlock approved?',lines:[1,2],candidate_ids:['L1']},{text:'Is the gate unlocked?',lines:[3,4],candidate_ids:['L3']}]};
 const answers={L1:{question_requests:'Approval',source_actually_answers:'Shipping timing',resolution:'not_answered',remaining_question:'Is the interlock approved?',open_group:'G1',lines:[1,2]},L3:{question_requests:'Current gate status',source_actually_answers:'Already unlocked',resolution:'directly_answered',remaining_question:null,open_group:'new',lines:[3,4]}};
 const engine={chat:{completions:{create:async request=>{const id=Object.keys(JSON.parse(request.response_format.schema).properties.answers.properties)[0];return {choices:[{finish_reason:'stop',message:{content:JSON.stringify({answers:{[id]:answers[id]}})}}]};}}}};
 await Notes.verifyAnswers(engine,value,prepared,()=>{});assert.deepEqual(Notes.validateQuestions(value,prepared.rows,prepared.ids),[{text:'Is the interlock approved?',lines:[1,2]}]);assert.equal(value.checks.L3.resolution,'answered');
});
test('native milestones keep fulfilled approvals separate from pending conditions and displaced dates',()=>{
 const rows=[{line:1,raw:'A: Approval arrived.'},{line:2,raw:'B: Start Tuesday instead of Monday if the two installers arrive.'}];
 const value={milestones:[{work:'Installation',when:'Tuesday',previous_time:'Monday',performer:'B',status:'tentative',lines:[2],prerequisites:[{requirement:'Two installers arrive',state:'pending',lines:[2]},{requirement:'Approval received',state:'fulfilled',lines:[1]}]}]};
 const [note]=Notes.scheduleNotes(value,rows);assert.match(note.text,/Replaces Monday/);assert.match(note.text,/Conditions: Two installers arrive/);assert.match(note.text,/Already satisfied: Approval received/);assert.deepEqual(note.lines,[2,1]);
 const falselyComplete={milestones:[{...value.milestones[0],status:'active',prerequisites:[{requirement:'Two installers arrive',state:'fulfilled',lines:[2]}]}]};const guarded=Notes.scheduleNotes(falselyComplete,rows)[0];assert.equal(guarded.status,'tentative');assert.doesNotMatch(guarded.text,/Already satisfied/);assert.match(guarded.text,/Conditions: Two installers arrive/);
 const approval={milestones:[{...value.milestones[0],status:'active',lines:[1],prerequisites:[{requirement:'Utility scan signed',state:'fulfilled',lines:[1]}]}]};
 const signed=Notes.scheduleNotes(approval,[{line:1,raw:'A: We received the signed utility scan in May. No pending scan approval remains.'}])[0];assert.equal(signed.status,'active');assert.match(signed.text,/Already satisfied/);
 const revoked=Notes.scheduleNotes(approval,[{line:1,raw:'A: The scan was signed yesterday. That approval was revoked this morning.'}])[0];assert.equal(revoked.status,'tentative');assert.doesNotMatch(revoked.text,/Already satisfied/);
 assert.throws(()=>Notes.scheduleNotes({milestones:[{...value.milestones[0],prerequisites:[{requirement:'Invented approval',state:'pending',lines:[99]}]}]},rows),/evidence/);
 assert.throws(()=>Notes.scheduleNotes({milestones:[{...value.milestones[0],prerequisites:[{requirement:'Approval',state:'unknown',lines:[1]}]}]},rows),/state/);
});
test('fact inventory preserves known constraints and holds as separate supported notes',()=>{
 const rows=[{line:1,raw:'A: Labor is covered. Wait for material approval.'}];
 const value={scope_and_requirements:[],known_facts_and_costs:[{text:'Labor is covered.',lines:[1]}],restrictions_and_holds:[{text:'Wait for material approval.',prohibition_quote:'Wait for material approval.',lines:[1]}]};
 const notes=Notes.scopeNotes(value,rows);assert.equal(notes.length,2);assert.ok(notes.every(n=>n.kind==='decision'));assert.throws(()=>Notes.scopeNotes({...value,known_facts_and_costs:undefined},rows),/inventory/);
 assert.throws(()=>Notes.scopeNotes({...value,restrictions_and_holds:[{text:'Hold demolition.',prohibition_quote:'Hold demolition.',lines:[1]}]},rows),/exact source/);
 const rejected=[];const sequence=Notes.scopeNotes({...value,restrictions_and_holds:[{text:'Hold installation.',prohibition_quote:'after the scan is signed',lines:[1]}]},[{line:1,raw:'A: Labor is covered. Install after the scan is signed.'}],h=>rejected.push(h));assert.equal(sequence.length,1);assert.match(sequence[0].text,/Labor/);assert.equal(rejected.length,1);
 const gate='A replacement lift can happen only after the new permit is approved.';assert.equal(Notes.scopeNotes({...value,known_facts_and_costs:[],restrictions_and_holds:[{text:gate,prohibition_quote:gate,lines:[1]}]},[{line:1,raw:'A: '+gate}]).length,1);
});
class Response extends EventEmitter{constructor(){super();this.headers={};this.destroyed=false;this.chunks='';}setHeader(k,v){this.headers[k]=v;}writeHead(s,h={}){this.status=s;this.headersSent=true;Object.assign(this.headers,h);}write(b){this.chunks+=b;}end(b){this.chunks+=b||'';this.writableEnded=true;}}
const req=(url,body='',headers={})=>Object.assign(Readable.from([body]),{url,method:body?'POST':'GET',headers:{host:'127.0.0.1:4177',...headers}});
test('notes endpoint validates input, shares the inference lock and streams the actual 27B identity',async()=>{
 const {handleRequest}=await import('../../scripts/serve-local-ai.mjs'),previous=global.fetch,old=Native.generate;let release;
 global.fetch=async()=>({ok:true,json:async()=>({models:[{name:Native.MODEL,digest:'test-model-digest'}]})});
 try{const config=new Response();await handleRequest(req('/api/local/config'),config);const info=JSON.parse(config.chunks);assert.equal(info.notes.version,Client.VERSION);assert.equal(info.notes.pipeline,Notes.VERSION);assert.equal(info.notes.policy,Native.POLICIES.quality.version);const headers={'content-type':'application/json','x-evergreen-token':info.token,accept:'application/x-ndjson'};
 const bad=new Response();await handleRequest(req('/api/local/notes','{"transcript":"tiny"}',headers),bad);assert.equal(bad.status,400);
 Native.generate=async(text,{progress,policy,engine})=>{assert.equal(policy,'quality');assert.equal(engine,Notes);progress('Checking');return new Promise(resolve=>{release=()=>resolve({result:{items:[]},model:Native.MODEL,loadMs:0,elapsedMs:1,totalMs:1});});};
 const first=new Response(),running=handleRequest(req('/api/local/notes',JSON.stringify({transcript:'Rae: I will send the plan Friday.'}),headers),first);await new Promise(r=>setImmediate(r));assert.ok(release);
 const second=new Response();await handleRequest(req('/api/local/analyze','{}',headers),second);assert.equal(second.status,409);release();await running;const events=first.chunks.trim().split('\n').map(JSON.parse);assert.equal(events.at(-1).model,Native.MODEL);assert.equal(events.at(-1).modelDigest,'test-model-digest');
 }finally{global.fetch=previous;Native.generate=old;}
});

test('an added dependency must quote the linked outcome, not borrow a nearby event',()=>{
 const rows=[{line:1,raw:'A: Hold the bearing order until coverage is confirmed.'},{line:2,raw:'B: Calibration finishes Friday if the technician arrives Thursday.'}];
 assert.throws(()=>Notes.linkedOutcomeLines({link_quote:'Hold the bearing order until coverage is confirmed.',dependent_outcome_in_source:'Calibration finishes Friday',lines:[1]},rows),/dependent outcome/);
 assert.deepEqual(Notes.linkedOutcomeLines({link_quote:'Calibration finishes Friday if the technician arrives Thursday.',dependent_outcome_in_source:'Calibration finishes Friday',lines:[2]},rows),[2]);
});

test('explicitly separated evidence excerpts must each be real and in source order',()=>{
 const rows=[{line:1,raw:'A: Tuesday morning is booked.'},{line:2,raw:'B: The signed scan arrived.'},{line:3,raw:'A: Tuesday morning is confirmed.'}];
 assert.deepEqual(Notes.supportedExcerptLines('Tuesday morning is booked. ... Tuesday morning is confirmed.',[1,3],rows),[1,3]);
 assert.throws(()=>Notes.supportedExcerptLines('Tuesday morning is booked. ... Wednesday morning is confirmed.',[1,3],rows),/exact source/);
 assert.throws(()=>Notes.supportedExcerptLines('Tuesday morning is confirmed. ... Tuesday morning is booked.',[1,3],rows),/exact source/);
});
test('physical-work responsibility retains a named crew instead of the speaker discussing it',()=>{
 const rows=[{line:1,raw:'Zed: The coating crew is booked Tuesday.'},{line:2,raw:'Ari: Our crew can start removal Monday.'},{line:3,raw:'Ari: Zed will call the office today.'}];
 assert.equal(Notes.reviewedPerformer({performer:'Zed',basis_quote:'The coating crew is booked Tuesday.',lines:[1]},{performer:'coating crew',lines:[1]},rows),'coating crew');
 assert.equal(Notes.reviewedPerformer({performer:'Ari',basis_quote:'Our crew can start removal Monday.',lines:[2]},{performer:'Ari'},rows),"Ari's crew");
 assert.equal(Notes.reviewedPerformer({performer:'Zed',basis_quote:'The coating crew is booked Tuesday.',lines:[1]},{performer:null},rows),null);
});

test('a work start is not a displaced completion date without actual rescheduling language',()=>{
 assert.equal(Notes.displacedTimeSupported('Monday morning',[{line:1,raw:'A: Start Monday morning and finish Wednesday afternoon.'}]),false);
 assert.equal(Notes.displacedTimeSupported('Thursday',[{line:1,raw:'A: Friday completion; we were previously targeting Thursday.'}]),true);
 assert.equal(Notes.displacedTimeSupported('Monday',[{line:1,raw:'A: You were originally going to start Monday, right?'}]),true);
});

test('a promise to ask does not become a release condition for a permission hold',()=>{
 const value={scope_and_requirements:[],known_facts_and_costs:[],restrictions_and_holds:[{text:'No permission for night work until the supervisor is asked.',prohibition_quote:'We do not',lines:[1]}]};
 const rejected=[],notes=Notes.scopeNotes(value,[{line:1,raw:'A: We do not. I will ask the supervisor Friday.'}],x=>rejected.push(x));
 assert.equal(notes[0].text,'No permission for night work.');assert.equal(rejected[0].outcome,'retained_current_restriction');
});

test('physical-work dates require a time anchor in their actual cited evidence',()=>{
 const rows=[{line:1,raw:'A: Replace the worn belt.'},{line:2,raw:'A: I will photograph the label today.'},{line:3,raw:'B: Calibration could finish Friday.'}];
 assert.equal(Notes.timeAnchorsSupported('today',[1],rows),false);
 assert.equal(Notes.timeAnchorsSupported('Friday at the earliest',[3],rows),true);
});
test('two conditions for one outcome do not become dependencies of each other',()=>{
 const quote='Packing can finish Friday if the seals arrive Thursday and the inspection passes Wednesday.';
 assert.equal(Notes.areSiblingConditions(quote,'the seals arrive Thursday','the inspection passes Wednesday'),true);
 assert.equal(Notes.areSiblingConditions(quote,'the seals arrive Thursday','Packing can finish Friday'),false);
 assert.equal(Notes.areSiblingConditions('If the seals arrive Thursday, packing can finish Friday.','the seals arrive Thursday','packing can finish Friday'),false);
});

test('an assigned crew name split by ASR can be recovered without adopting a nearby unrelated person',()=>{
 const rows=[{line:1,raw:'A: Northern'},{line:2,raw:'A: Field Services will mobilize Tuesday.'},{line:3,raw:'A: Jo will call the office Friday.'}];
 const review={performer:'Northern Field Services',basis_quote:'will mobilize Tuesday.',lines:[2]};
 assert.equal(Notes.reviewedPerformer(review,{performer:'Northern Field Services',lines:[2]},rows),'Northern Field Services');
 assert.equal(Notes.reviewedPerformer({...review,performer:'Jo'},{performer:'Jo',lines:[2]},rows),null);
});

test('an adjacent acknowledgment can establish a purchasing hold release without treating a question as approval',()=>{
 const rows=[{line:1,raw:"A: Don't order the valve yet. I will ask Finance tomorrow."},{line:2,raw:"B: We won't order until you give us the word."}];
 const value={scope_and_requirements:[],known_facts_and_costs:[],restrictions_and_holds:[{text:'Do not order the valve until A confirms coverage.',prohibition_quote:"Don't order the valve yet.",lines:[1]}]};
 const notes=Notes.scopeNotes(value,rows);assert.match(notes[0].text,/until A confirms/);assert.deepEqual(notes[0].lines,[1,2]);
 assert.equal(Notes.displacedTimeSupported('next Monday',[{line:1,raw:'A: Can we still keep the hall on schedule for next Monday?'}]),true);
});

test('meetings without explicit question candidates cannot emit a fake none candidate',()=>{
 const request={...questionCall,messages:[{role:'user',content:'<transcript>\n[1] Jo: I will send the plan Friday.\n[2] Val: The permit status remains unknown.\n</transcript>'}]};
 const prepared=Notes.questionRequest(request),schema=JSON.parse(prepared.request.response_format.schema);
 assert.deepEqual(prepared.ids,[]);assert.equal(schema.properties.open_questions.items.properties.candidate_ids.maxItems,0);
 assert.deepEqual(Notes.validateQuestions({checks:{},open_questions:[{text:'Permit status remains unknown.',lines:[2],candidate_ids:[]}]},prepared.rows,prepared.ids),[{text:'Permit status remains unknown.',lines:[2]}]);
});

test('unpunctuated proposed open issues are also checked against a known negative answer',async()=>{
 const call={...questionCall,messages:[{role:'user',content:'<transcript>\n[1] Jo: No inspection appointment is confirmed.\n</transcript>'}]};
 const prepared=Notes.questionRequest(call),value={checks:{},open_questions:[{text:'Whether the inspection appointment is confirmed remains unresolved.',lines:[1],candidate_ids:[]}]};
 const engine={chat:{completions:{create:async request=>{const id=Object.keys(JSON.parse(request.response_format.schema).properties.answers.properties)[0];assert.equal(id,'U1');return {choices:[{finish_reason:'stop',message:{content:JSON.stringify({answers:{[id]:{question_requests:'Current confirmation status',source_actually_answers:'No appointment is confirmed',resolution:'directly_answered',remaining_question:null,open_group:'new',lines:[1]}}})}}]};}}}};
 await Notes.verifyAnswers(engine,value,prepared,()=>{});assert.deepEqual(value.checks,{});assert.deepEqual(Notes.validateQuestions(value,prepared.rows,prepared.ids),[]);
});

test('technical phrase repair neither duplicates surrounding scope nor rewrites question status',()=>{
 const rows=[{line:1,raw:'A: Remove the liner and the damaged roof flaps.'}];
 const notes=[{text:'Remove the liner and the damaged roof flaps.',lines:[1],kind:'decision'}];
 const corrected=Notes.applyWordingEdits(notes,{edits:[{note_id:'N1',original_phrase:'damaged roof flaps',replacement_phrase:'liner and the damaged roof covering',uncertain:true,source_lines:[1],source_quote:'Remove the liner and the damaged roof flaps.'}]},rows)[0];
 assert.equal((corrected.text.match(/liner/g)||[]).length,1);assert.match(corrected.text,/damaged roof covering/);
 const question=[{text:'Whether the liner is in stock remains unresolved.',lines:[1],kind:'question'}];
 const output=Notes.applyWordingEdits(question,{edits:[{note_id:'N1',original_phrase:question[0].text,replacement_phrase:'whether the liner is in stock',uncertain:false,source_lines:[1],source_quote:rows[0].raw}]},rows);
 assert.equal(output[0].text,question[0].text);
});
