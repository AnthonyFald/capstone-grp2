// Opt-in local Cloudflare runtime integration. No Cloudflare account/network APIs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {derivePasswordProof} from '../../public/client/auth.mjs';

const require=createRequire(import.meta.url);
const {Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[require.resolve('wrangler/package.json')]}));
test('real local Workers/D1 runtime stores claims, immutable completion, review and lesson release',async t=>{
  const owner='capstone_runtime_test_'+'x'.repeat(40);
  const mf=new Miniflare(convertV4MiniflareOptions({name:'capstone-local-test',modules:[{type:'ESModule',path:fileURLToPath(new URL('../entry.mjs',import.meta.url))},{type:'ESModule',path:fileURLToPath(new URL('../worker.mjs',import.meta.url))},{type:'ESModule',path:fileURLToPath(new URL('../consolidation.mjs',import.meta.url))},{type:'ESModule',path:fileURLToPath(new URL('../board-api.mjs',import.meta.url))},{type:'ESModule',path:fileURLToPath(new URL('../client-api.mjs',import.meta.url))}],modulesRoot:fileURLToPath(new URL('..',import.meta.url)),compatibilityDate:'2026-10-23',bindings:{CAPSTONE_OWNER_TOKEN:owner,CAPSTONE_FREE_ACCOUNT_VERIFIED:'false'},d1Databases:['CAPSTONE_DB'],host:'127.0.0.1',port:0}));
  t.after(()=>mf.dispose());
  const db=await mf.getD1Database('CAPSTONE_DB');
  const schema=await readFile(new URL('../schema.sql',import.meta.url),'utf8');
  await db.batch(schema.split(';').map(s=>s.trim()).filter(Boolean).map(sql=>db.prepare(sql)));
  async function api(route,body,credential=owner){const response=await mf.dispatchFetch('https://capstone.example/api/capstone/v1'+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+credential,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();assert.ok(response.ok,JSON.stringify({status:response.status,data}));return data;}
  const pair=await api('/runner/pair-codes',{label:'Runtime PC'});
  const runner=await api('/runner/pair',{code:pair.code,runnerName:'Runtime PC'},'');
  const document={id:'record.A',title:'Approved location',revision:'A',issuedAt:'2026-11-02',approval:'approved',current:true,text:'The equipment pad is in Zone A.'};
  const {job}=await api('/jobs',{kind:'rfi',title:'Locate equipment',cohort:'baseline',dataClassification:'synthetic',clientRequestId:'runtime-1',payload:{question:'Where is the equipment pad?',documents:[document]}});
  const claim=await api('/runner/claim',{capabilities:['rfi']},runner.token);
  assert.equal(claim.job.id,job.id);assert.deepEqual(claim.lessons.items,[]);
  await api('/runner/jobs/'+job.id+'/heartbeat',{leaseToken:claim.leaseToken,stage:'Local processing'},runner.token);
  const complete={leaseToken:claim.leaseToken,completionId:'runtime-complete-1',result:{outcome:'answer_from_records',draftAnswer:'The equipment pad is in Zone A.',rationale:'The current approved record states the location.',uncertainties:[],citations:[{documentId:document.id,quote:document.text}],humanDecision:'pending'},provenance:{jobInputSha256:claim.job.inputSha256},timings:{totalMs:200}};
  await api('/runner/jobs/'+job.id+'/complete',complete,runner.token);
  assert.equal((await api('/runner/jobs/'+job.id+'/complete',complete,runner.token)).idempotent,true);
  const {review}=await api('/jobs/'+job.id+'/reviews',{decision:'answer_from_records',notes:'Checked source.',metrics:{incorrectClosure:false,unnecessaryRfiAvoided:true}});
  const proposal=await api('/lessons',{reviewId:review.id,title:'Preserve exact location',text:'Use the exact location stated in the current approved document.'});
  assert.equal((await api('/lesson-releases',{label:'Runtime-reviewed release',proposalIds:[proposal.proposal.id]})).release.version,1);
  const detail=await api('/jobs/'+job.id);assert.equal(detail.job.reviewState,'reviewed');assert.equal(detail.job.result.humanDecision,'pending');assert.equal(detail.attempts[0].status,'completed');
  const metrics=await api('/metrics');assert.equal(metrics.incorrectClosures.count,0);assert.equal(metrics.incorrectClosures.assessed,1);assert.equal(metrics.unnecessaryRfisAvoided.count,1);
  const request={id:'request-A',title:'Sleeve request',kind:'request',revision:'A',issuedAt:'2026-11-02',approval:'draft',current:true,text:'Clarify the sleeve opening before Thursday.'};
  const batch=await api('/jobs',{kind:'rfi',title:'Consolidate requests',cohort:'baseline',clientRequestId:'runtime-board-1',payload:{mode:'consolidation',documents:[request]}});
  const boardClaim=await api('/runner/claim',{capabilities:['rfi']},runner.token);assert.equal(boardClaim.job.id,batch.job.id);assert.equal(boardClaim.job.board.version,0);
  const boardResult={mode:'consolidation',version:'rfi-consolidation-1',humanDecision:'pending',boardVersion:0,summary:'A distinct task needs review.',groups:[],items:[{id:'item-A',sourceDocumentId:request.id,sourceQuote:request.text,title:'Sleeve opening',requirement:request.text,location:'',discipline:'Coordination',revision:'A',action:'create_task',targetTaskId:null,duplicateOfItemId:null,groupId:null,reason:'This request is not yet tracked.',answer:'',citations:[],warnings:[]}]};
  await api('/runner/jobs/'+batch.job.id+'/complete',{leaseToken:boardClaim.leaseToken,completionId:'runtime-board-completion',result:boardResult,provenance:{jobInputSha256:boardClaim.job.inputSha256},timings:{totalMs:250}},runner.token);
  const applied=await api('/jobs/'+batch.job.id+'/apply',{expectedVersion:0,clientMutationId:'runtime-board-apply',notes:'Checked the preserved request.',decisions:[{itemId:'item-A',action:'create_task'}]});assert.equal(applied.board.version,1);assert.equal(applied.board.tasks[0].sources[0].quote,request.text);
  assert.equal((await api('/jobs/'+batch.job.id)).boardReview.applied,true);
  const undone=await api('/board/undo',{expectedVersion:1,eventId:applied.event.id,clientMutationId:'runtime-board-undo',notes:'Recheck classification.'});assert.equal(undone.board.version,2);assert.equal(undone.board.tasks.length,0);assert.equal(undone.board.documents[0].text,request.text);
  assert.equal((await api('/jobs/'+batch.job.id)).boardReview.applied,false);
  assert.equal((await api('/metrics')).consolidation.reviewedBatches,0);

  const clientEmail='runtime-client@example.test';
  const created=await mf.dispatchFetch('https://capstone.example/api/capstone/v1/client/signup',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name:'Runtime fictional client',email:clientEmail,passwordProof:await derivePasswordProof(clientEmail,'runtime test passphrase'),role:'gc',projectName:'Fictional runtime project'})
  });
  assert.equal(created.status,201,await created.clone().text());
  const cookie=created.headers.get('Set-Cookie').split(';')[0];
  async function client(route,body){
    const response=await mf.dispatchFetch('https://capstone.example/api/capstone/v1/client'+route,{
      method:body?'POST':'GET',headers:{Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{})
    });
    const data=await response.json();
    assert.ok(response.ok,JSON.stringify(data));
    return data;
  }
  const clientBatch=await client('/runs',{kind:'rfi',title:'Client sleeve request',dataClassification:'synthetic',clientRequestId:'runtime-client-run',payload:{mode:'consolidation',documents:[request]}});
  const isolated=await api('/runner/claim',{capabilities:['rfi']},runner.token);
  assert.equal(isolated.job.id,clientBatch.run.id);
  assert.deepEqual(isolated.job.board,{version:0,tasks:[],documents:[]});
  assert.deepEqual(isolated.lessons.items,[]);
  await api('/runner/jobs/'+isolated.job.id+'/complete',{leaseToken:isolated.leaseToken,completionId:'runtime-client-complete',result:boardResult,provenance:{jobInputSha256:isolated.job.inputSha256},timings:{totalMs:300}},runner.token);
  await client('/runs/'+isolated.job.id+'/review',{decision:'accept',notes:'Checked the fictional request.',metrics:{reviewSeconds:3}});
  const clientDashboard=await client('/dashboard');
  assert.equal(clientDashboard.board.tasks.length,1);
  assert.equal(clientDashboard.evaluation.reviewedRuns,1);
  assert.equal((await api('/jobs')).jobs.some(job=>job.id===isolated.job.id),false);

});
