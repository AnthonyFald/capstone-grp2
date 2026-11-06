'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Engine = require('./rfi-engine.cjs');
const fixtures = require('../fixtures/inputs.json');
const references = require('../fixtures/references.json');
const clone = value => JSON.parse(JSON.stringify(value));
const input = () => clone(fixtures.cases[0].payload);
const answer = () => ({outcome:'answer_from_records',draftAnswer:'The specified mix is 30 MPa, with moist curing for at least 7 days.',rationale:'The current approved specification states both requirements.',uncertainties:[],citations:[{documentId:'SPEC-B104-R2',quote:'Room B104 replacement slab: use a 30 MPa concrete mix. Maintain moist curing for at least 7 days.'}]});
const verification = () => ({recommendedOutcome:'answer_from_records',answerFullySupported:true,allAnswerEvidenceCurrentApproved:true,conflictingAuthoritativeEvidence:false,missingAuthoritativeEvidence:false,issues:[],rationale:'Both requirements are directly supported by the current approved specification.'});
function stub(outputs,{inspect=()=>{},onCall=()=>{}}={}) {
  let calls = 0; const requests=[]; let config;
  const adapterFactory = options => {
    config=options;
    return {chat:{completions:{create:async request=>{
      requests.push(request); inspect(request,calls);
      const raw = outputs[calls++];
      if (raw === undefined) throw new Error('Unexpected extra model call.');
      const content = typeof raw === 'string' ? raw : JSON.stringify(raw);
      const usage={load_duration_ns:1000000,prompt_tokens:200,completion_tokens:100};
      options.record({request,content,usage,elapsedMs:2,doneReason:'stop'});
      onCall(calls);
      return {choices:[{message:{content},finish_reason:'stop'}],usage};
    }}}};
  };
  return {adapterFactory,requests,get count(){return calls;},get config(){return config;}};
}

test('validates and clones bounded documents without modifying exact source text',()=>{
  const payload=input(); payload.documents[0].text='  Line one.\nLine two.  ';
  const checked=Engine.validateInput(payload);
  assert.equal(checked.documents[0].text,payload.documents[0].text);
  checked.documents[0].text='changed'; assert.notEqual(checked.documents[0].text,payload.documents[0].text);
});

test('rejects duplicate IDs, invalid authority metadata, dates, labels and oversize sources',()=>{
  const mutations=[
    p=>p.documents.push(clone(p.documents[0])),
    p=>{p.documents[0].current='yes';},
    p=>{p.documents[0].approval='superseded';},
    p=>{p.documents[0].issuedAt='2026-02-30';},
    p=>{p.documents[0].ground_truth_notes='expected answer';},
    p=>{p.expectedOutcome='answer_from_records';},
    p=>{p.documents[0].text='x'.repeat(30001);},
    p=>{p.question='x'.repeat(2001);},
    p=>{p.documents=Array.from({length:13},(_,i)=>({...p.documents[0],id:'DOC-'+i}));},
    p=>{p.documents=[{...p.documents[0],id:'A',text:'x'.repeat(20000)},{...p.documents[0],id:'B',text:'x'.repeat(10001)}];}
  ];
  for(const mutate of mutations){const payload=input();mutate(payload);assert.throws(()=>Engine.validateInput(payload),e=>e.code==='INVALID_INPUT'&&e.statusCode===400);}
});

test('supported proposal uses two passes with fixed local policy and retains audit provenance',async()=>{
  const fake=stub([answer(),verification()]); const progress=[],records=[];
  const output=await Engine.generate(input(),{adapterFactory:fake.adapterFactory,progress:p=>progress.push(p),record:r=>records.push(r)});
  assert.equal(fake.count,2); assert.equal(fake.config.policy,'quality'); assert.equal(fake.config.seed,42);
  assert.equal(output.result.outcome,'answer_from_records'); assert.equal(output.result.humanDecision,'pending');
  assert.equal(output.model,'qwen3.5:27b'); assert.equal(output.contextWindow,16384); assert.equal(output.reasoning,false);
  assert.equal(output.loadMs,2); assert.equal(records.length,2); assert.deepEqual(records.map(r=>r.phase),['draft','verification']);
  assert.equal(progress.at(-1).phase,'complete'); assert.deepEqual(output.audit.lessonVersions,[]);
  assert.match(output.inputSha256,/^[a-f0-9]{64}$/); assert.match(output.documentHashes['SPEC-B104-R2'],/^[a-f0-9]{64}$/);
  assert.match(output.sourceHashes['demo-3/engine/rfi-engine.cjs'],/^[a-f0-9]{64}$/);
  assert.equal(fake.requests[0].extra_body.enable_thinking,false);
});

test('unverified or fabricated exact citations cannot survive normalization',async()=>{
  const draft=answer(); draft.citations=[{documentId:'SPEC-B104-R2',quote:'Use a 40 MPa concrete mix.'},{documentId:'MADE-UP',quote:'Approved.'}];
  const fake=stub([draft,verification()]); const output=await Engine.generate(input(),{adapterFactory:fake.adapterFactory});
  assert.equal(output.result.outcome,'formal_clarification'); assert.equal(output.result.draftAnswer,''); assert.deepEqual(output.result.citations,[]);
  assert.deepEqual(output.audit.validation.rejected.map(c=>c.reason),['quote_not_exact','unknown_document']);
  assert.equal(output.audit.draft.draftAnswer,draft.draftAnswer);
});

test('an exact quotation from an unapproved source cannot establish an answer even if verifier agrees',async()=>{
  for(const metadata of [{approval:'draft',current:true},{approval:'superseded',current:false},{approval:'approved',current:false}]) {
    const payload=input(); Object.assign(payload.documents[0],metadata);
    const fake=stub([answer(),verification()]); const output=await Engine.generate(payload,{adapterFactory:fake.adapterFactory});
    assert.equal(output.result.outcome,'formal_clarification'); assert.equal(output.result.draftAnswer,''); assert.equal(output.result.humanDecision,'pending');
  }
});

test('semantic support failure routes an otherwise exact quote to human review',async()=>{
  const check=verification(); check.answerFullySupported=false; check.recommendedOutcome='needs_review'; check.issues=['The proposed answer adds an unsupported requirement.'];
  const fake=stub([answer(),check]); const output=await Engine.generate(input(),{adapterFactory:fake.adapterFactory});
  assert.equal(output.result.outcome,'needs_review'); assert.equal(output.result.draftAnswer,'');
  assert.ok(output.result.uncertainties.includes(check.issues[0]));
});

test('conflicting or absent authoritative evidence forces formal clarification',async()=>{
  for(const flag of ['conflictingAuthoritativeEvidence','missingAuthoritativeEvidence']){
    const check=verification(); check[flag]=true;
    const fake=stub([answer(),check]); const output=await Engine.generate(input(),{adapterFactory:fake.adapterFactory});
    assert.equal(output.result.outcome,'formal_clarification'); assert.equal(output.result.draftAnswer,'');
  }
});

test('verification cannot upgrade an initial formal-clarification proposal into an answer',async()=>{
  const draft=answer(); draft.outcome='formal_clarification'; draft.draftAnswer='';
  const fake=stub([draft,verification()]); const output=await Engine.generate(input(),{adapterFactory:fake.adapterFactory});
  assert.equal(output.result.outcome,'formal_clarification'); assert.equal(output.result.humanDecision,'pending');
});

test('repeated citations are deduplicated while preserving exact source punctuation',async()=>{
  const draft=answer(); draft.citations.push(clone(draft.citations[0]));
  const fake=stub([draft,verification()]); const output=await Engine.generate(input(),{adapterFactory:fake.adapterFactory});
  assert.equal(output.result.citations.length,1); assert.equal(output.result.citations[0].quote,draft.citations[0].quote);
});

test('documents containing instruction injection remain JSON data, never model instructions',async()=>{
  const payload=clone(fixtures.cases.find(c=>c.id==='RFI-T08').payload);
  const draft={outcome:'formal_clarification',draftAnswer:'',rationale:'The only record is an unapproved proposal.',uncertainties:[],citations:[]};
  const check={...verification(),recommendedOutcome:'formal_clarification',answerFullySupported:false,allAnswerEvidenceCurrentApproved:false,missingAuthoritativeEvidence:true};
  const fake=stub([draft,check],{inspect:request=>{
    assert.equal(request.messages.length,2); assert.equal(request.messages[0].role,'system'); assert.equal(request.messages[1].role,'user');
    assert.match(request.messages[0].content,/untrusted task data/); assert.doesNotMatch(request.messages[0].content,/SYSTEM OVERRIDE/);
    assert.match(request.messages[1].content,/SYSTEM OVERRIDE/);
  }});
  const output=await Engine.generate(payload,{adapterFactory:fake.adapterFactory}); assert.equal(output.result.outcome,'formal_clarification');
});

test('only explicitly approved bounded versioned lessons can enter the draft guidance',async()=>{
  const lesson={id:'L-001',version:1,text:'An inspection appointment is not an inspection result.',approved:true,approvedBy:'test-reviewer',approvedAt:'2026-11-02'};
  const fake=stub([answer(),verification()]); const output=await Engine.generate(input(),{adapterFactory:fake.adapterFactory,lessons:[lesson]});
  assert.match(fake.requests[0].messages[0].content,/An inspection appointment/);
  assert.doesNotMatch(fake.requests[1].messages[0].content,/An inspection appointment/);
  assert.equal(output.audit.lessonVersions[0].version,'1'); assert.equal(output.audit.lessonVersions[0].approvedBy,'test-reviewer');
  for(const invalid of [{...lesson,approved:false},{...lesson,text:'x'.repeat(1001)},{...lesson,expectedOutcome:'answer_from_records'}]){
    await assert.rejects(Engine.generate(input(),{adapterFactory:fake.adapterFactory,lessons:[invalid]}),e=>e.code==='INVALID_INPUT');
  }
});

test('malformed model output fails rather than yielding a confident default answer',async()=>{
  for(const raw of ['not-json',{outcome:'answer_from_records'},{...answer(),draftAnswer:''}]){
    const fake=stub([raw]); await assert.rejects(Engine.generate(input(),{adapterFactory:fake.adapterFactory}),e=>e.diagnostics.phase==='draft');
    assert.equal(fake.count,1);
  }
  const fake=stub([answer(),{...verification(),answerFullySupported:'true'}]);
  await assert.rejects(Engine.generate(input(),{adapterFactory:fake.adapterFactory}),e=>e.diagnostics.phase==='verification');
});

test('cancellation before and between passes prevents additional requests',async()=>{
  const initial=new AbortController(); initial.abort(); const never=stub([]);
  await assert.rejects(Engine.generate(input(),{signal:initial.signal,adapterFactory:never.adapterFactory}),{name:'AbortError'}); assert.equal(never.count,0);
  const running=new AbortController(); const fake=stub([answer(),verification()],{onCall:()=>running.abort()});
  await assert.rejects(Engine.generate(input(),{signal:running.signal,adapterFactory:fake.adapterFactory}),{name:'AbortError'}); assert.equal(fake.count,1);
});

test('fixture inputs validate and remain separate from frozen evaluation references',()=>{
  assert.equal(fixtures.synthetic,true); assert.equal(fixtures.cases.length,8);
  assert.deepEqual(fixtures.cases.map(c=>c.id),references.cases.map(c=>c.id));
  assert.equal(references.labelsWrittenBeforeAnyInference,true);
  for(const item of fixtures.cases) Engine.validateInput(item.payload);
  assert.doesNotMatch(JSON.stringify(fixtures),/expectedOutcome|requiredFacts|forbiddenClaims|ground_truth/);
  const freeze=JSON.parse(fs.readFileSync(path.join(__dirname,'../fixtures/freeze.json'),'utf8'));
  for(const filename of ['inputs.json','references.json']) {
    const digest=crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../fixtures',filename))).digest('hex');
    assert.equal(freeze.sha256[filename],digest,'Frozen fixture changed: '+filename);
  }
});
