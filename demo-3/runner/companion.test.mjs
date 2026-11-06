// No sockets or model runtime: exercise the actual companion request handler
// with a mocked model adapter, including the candidate engine's audit format.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {handleRequest} from '../../scripts/serve-local-ai.mjs';
const require=createRequire(import.meta.url),Current=require('../engine/consolidation-engine.cjs'),Candidate=require('../engine/consolidation-engine-v2.cjs');
class Reply extends EventEmitter{
  constructor(){super();this.headers={};this.destroyed=false;this.chunks='';}
  setHeader(k,v){this.headers[k]=v;}
  writeHead(status,headers={}){this.status=status;this.headersSent=true;Object.assign(this.headers,headers);}
  write(body){this.chunks+=body;}
  end(body=''){this.chunks+=body;this.body=this.headers['Content-Type']==='application/x-ndjson'?this.chunks.trim().split('\n').filter(Boolean).map(JSON.parse):this.chunks?JSON.parse(this.chunks):null;this.writableEnded=true;}
}
const document=(id,text='Confirm east access by noon.')=>({id,title:id,kind:'request',revision:'1',issuedAt:'2026-11-02',approval:'informal',current:true,text});
const request=document('request-1');
const input={mode:'consolidation',documents:[request],board:{version:1,tasks:[],documents:[]}};
const atom={id:'i1',sourceDocumentId:request.id,sourceQuote:request.text,title:'East access',requirement:request.text,location:'East',discipline:'Access',revision:'1'};
const plan={groups:[],decisions:[{itemId:'i1',action:'create_task',targetTaskId:null,duplicateOfItemId:null,groupId:null,reason:'The access request is new.',answer:'',citations:[],warnings:[]}]};
function adapter(replies=[{items:[atom]},plan,{checks:[{itemId:'i1',confirmed:true}],missingItems:[]}]){return()=>({chat:{completions:{create:async()=>{const next=replies.shift();assert.ok(next,'Unexpected inference call');return {choices:[{message:{content:JSON.stringify(next)},finish_reason:'stop'}]};}}}});}
function req(url,body='',headers={}){return Object.assign(Readable.from([body]),{url,method:body?'POST':'GET',headers:{host:'127.0.0.1:4177',...headers}});}
async function setup(t){
  const oldFetch=globalThis.fetch,oldValidate=Current.validateInput,oldGenerate=Current.generate;
  globalThis.fetch=async()=>({ok:true,json:async()=>({models:[{name:'qwen3.5:27b',digest:'mock-digest'}]})});
  Current.validateInput=Candidate.validateInput;Current.generate=(payload,options)=>Candidate.generate(payload,{...options,adapterFactory:adapter()});
  t.after(()=>{globalThis.fetch=oldFetch;Current.validateInput=oldValidate;Current.generate=oldGenerate;});
  const config=new Reply();await handleRequest(req('/api/local/config'),config);assert.equal(config.status,200);
  return async(payload,extras={},url='/api/local/capstone')=>{const reply=new Reply();await handleRequest(req(url,JSON.stringify({payload,...extras}),{'content-type':'application/json','x-evergreen-token':config.body.token,accept:'application/x-ndjson'}),reply);return reply;};
}
test('prevalidation retains raw stale source flags for the engine audit while effective authority remains safe',async t=>{
  const send=await setup(t),reference={...document('ref','East access is approved.'),kind:'reference',approval:'approved'},payload={...input,documents:[request,reference],board:{...input.board,documents:[{...reference,approval:'draft',current:false}]}};
  const reply=await send(payload);assert.equal(reply.status,200);const out=reply.body.find(x=>x.type==='result');assert.ok(out);
  assert.deepEqual(out.audit.sourceStateOverrides,[{documentId:'ref',submitted:{approval:'approved',current:true},effective:{approval:'draft',current:false}}]);
  assert.equal(out.result.items[0].action,'create_task');assert.equal(payload.documents[1].current,true);
});
test('a valid Unicode history transfers even when originals exceed the compact prompt size',async t=>{
  const send=await setup(t),payload={...input,board:{...input.board,documents:Array.from({length:4},(_,i)=>document('old-'+i,'界'.repeat(29000)))}};
  assert.ok(Buffer.byteLength(JSON.stringify({payload}))>150000);assert.ok(JSON.stringify(Candidate.compactEvidence(Candidate.validateInput(payload))).length<1000);
  const reply=await send(payload);assert.equal(reply.status,200);assert.equal(reply.body.at(-1).type,'result');
});
test('local transport remains bounded and other demo limits stay unchanged',async t=>{
  const send=await setup(t),oversize=await send({...input,extra:'x'.repeat(2*1024*1024)});assert.equal(oversize.status,413);assert.equal(oversize.body.retryable,false);assert.match(oversize.body.error,/transfer limit/);
  const legacy=await send(null,{reports:'x'.repeat(150001)},'/api/local/analyze');assert.equal(legacy.status,413);assert.match(legacy.body.error,/Report batch/);
});
test('pre-inference lesson failures stop retries but malformed model output remains retryable',async t=>{
  const send=await setup(t),invalid=await send(input,{lessons:[{id:'lesson',version:1,text:'Compare locations.',approved:true,approvedBy:'owner',approvedAt:'2026-02-30'}]});
  assert.equal(invalid.status,200);assert.equal(invalid.body.at(-1).type,'error');assert.equal(invalid.body.at(-1).code,'INVALID_INPUT');assert.equal(invalid.body.at(-1).retryable,false);
  Current.generate=(payload,options)=>Candidate.generate(payload,{...options,adapterFactory:adapter([{items:[{...atom,title:''}]}])});
  const malformed=await send(input);assert.equal(malformed.body.at(-1).type,'error');assert.equal(malformed.body.at(-1).retryable,true);assert.equal(malformed.body.at(-1).diagnostics.phase,'extract');
});
