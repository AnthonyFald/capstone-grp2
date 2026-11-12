import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {CapstoneRunner,normalizeUrl,approvedLessons,compactResult} from './runner.mjs';
const claim={job:{id:'job_test',kind:'rfi',title:'Test',cohort:'learning',inputSha256:'payloadhash',payload:{question:'When?',documents:[]}},leaseToken:'lease-secret',leaseExpiresAt:new Date(Date.now()+300000).toISOString(),lessons:{releaseId:'lesson1',version:1,items:[]}};
const output={result:{outcome:'formal_clarification',draftAnswer:'',rationale:'No approval.',uncertainties:[],citations:[],humanDecision:'pending'},calls:[{secret:'full local call'}],audit:{draft:'raw'},model:'qwen3.5:27b',totalMs:1000,loadMs:100,elapsedMs:900,inputSha256:'enginehash'};
const response=data=>new Response(JSON.stringify(data));
async function runner(fetchImpl){const r=await new CapstoneRunner({stateDir:await mkdtemp(path.join(os.tmpdir(),'capstone-runner-')),fetchImpl}).init();r.config={url:'https://capstone-test.example.workers.dev',token:'runner-secret'};return r;}
test('production connection rejects foreign, local, credential-bearing and non-HTTPS URLs',()=>{
  assert.equal(normalizeUrl('https://capstone-demo.workers.dev/'),'https://capstone-demo.workers.dev');
  for(const url of ['http://capstone-demo.workers.dev','https://example.com','https://capstone.workers.dev.evil.test','https://secret@capstone.workers.dev','https://capstone.workers.dev/?token=x','http://127.0.0.1:4188'])assert.throws(()=>normalizeUrl(url));
  assert.equal(normalizeUrl('http://127.0.0.1:4188',{allowLocal:true}),'http://127.0.0.1:4188');
});
test('baseline is frozen and learning strips unrelated lesson metadata',()=>{
  const lesson={id:'l1',version:2,text:'Check approval.',approved:true,approvedBy:'Reviewer',approvedAt:'2026-11-02',reviewId:'hidden-review',appliesTo:['rfi']};
  assert.deepEqual(approvedLessons({...claim,job:{...claim.job,cohort:'baseline'},lessons:{items:[lesson]}}),[]);
  assert.equal(approvedLessons({...claim,lessons:{items:[lesson]}})[0].reviewId,undefined);
});
test('cloud result omits raw model calls, records separate job and engine input hashes',()=>{
  const value=compactResult(output,claim);assert.equal(value.provenance.jobInputSha256,'payloadhash');assert.equal(value.provenance.inputSha256,'enginehash');assert.equal(value.calls,undefined);assert.equal(value.audit,undefined);assert.equal(value.result.humanDecision,'pending');
});
test('pairing refuses nonfree health before transmitting pairing code',async()=>{
  const calls=[];const r=await runner(async(url,options)=>{calls.push({url,options});return response({service:'capstone-team2-demo3',protocol:1,costPolicy:{mode:'free-only',cloudInference:false,paidFallback:false,accountVerifiedFree:false}});});
  await assert.rejects(r.pair(r.config.url,'sensitive-code'),/verified Free/);assert.equal(calls.length,1);assert.equal(calls[0].options.body,undefined);
});
test('successful processing saves full local audit and only compact cloud output',async()=>{
  const calls=[];const r=await runner(async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return response(url.endsWith('heartbeat')?{leaseExpiresAt:claim.leaseExpiresAt}:{status:'completed'});});r.infer=async()=>output;
  await r.process(claim);assert.equal(r.state.completed,1);assert.equal((await readdir(path.join(r.dir,'outbox'))).length,0);
  const files=await readdir(path.join(r.dir,'audits'));assert.equal(files.length,1);assert.equal(JSON.parse(await readFile(path.join(r.dir,'audits',files[0]),'utf8')).output.calls[0].secret,'full local call');
  const complete=calls.find(x=>x.url.endsWith('complete')).body;assert.equal(complete.calls,undefined);assert.equal(complete.provenance.localAuditSha256.length,64);
});
test('lost completion response is retried from persistent outbox without rerunning inference',async()=>{
  let disconnected=true,inferences=0,completionId;const r=await runner(async(url,options)=>{if(url.endsWith('heartbeat'))return response({leaseExpiresAt:claim.leaseExpiresAt});const body=JSON.parse(options.body);if(!completionId)completionId=body.completionId;assert.equal(body.completionId,completionId);if(disconnected)throw Error('offline');return response({status:'completed',idempotent:true});});r.infer=async()=>{inferences++;return output;};
  await r.process(claim);assert.equal((await readdir(path.join(r.dir,'outbox'))).length,1);disconnected=false;await r.flushOutbox();assert.equal(inferences,1);assert.equal(r.state.completed,1);
});
test('canceled lease aborts before inference and cannot upload a result',async()=>{
  let inference=false;const calls=[];const r=await runner(async url=>{calls.push(url);return new Response(JSON.stringify({error:{message:'Canceled'}}),{status:409});});r.infer=async()=>{inference=true;return output;};await r.process(claim);assert.equal(inference,false);assert.equal(calls.length,1);assert.match(r.state.lastError,/canceled/);
});
test('a persisted old completion cannot overwrite a reassigned question',async()=>{
  const r=await runner(async()=>new Response(JSON.stringify({error:{message:'Stale'}}),{status:409}));await r.save('outbox/job_test.json',{id:'job_test',body:{leaseToken:'old'},cloudUrl:r.config.url});await r.flushOutbox();assert.equal((await readdir(path.join(r.dir,'outbox'))).length,0);assert.equal((await readdir(path.join(r.dir,'audits'))).length,1);assert.equal(r.state.completed,0);
});

test('compact cloud provenance preserves the engine-provided version',()=>{
  const compact=compactResult({...output,engineVersion:'capstone-rfi-17',version:'unrelated-envelope-version'},claim);
  assert.equal(compact.provenance.engineVersion,'capstone-rfi-17');
});

test('consolidation inference receives the frozen board and readable progress',async()=>{
  const board={version:3,tasks:[],documents:[]};let sent;
  const r=await runner(async(url,options)=>{
    if(url.endsWith('/config'))return response({service:'evergreen-local-ai',capstone:{protocol:1,consolidationVersion:'rfi-consolidation-1'},token:'local-token'});
    sent=JSON.parse(options.body);return new Response(JSON.stringify({type:'progress',stage:{message:'Checking distinct requirements'}})+'\n'+JSON.stringify({type:'result',...output})+'\n');
  });
  await r.infer({...claim,job:{...claim.job,payload:{mode:'consolidation',documents:[]},board}},new AbortController().signal);
  assert.deepEqual(sent.payload.board,board);assert.equal(r.state.stage,'Checking distinct requirements');
  await assert.rejects(r.infer({...claim,job:{...claim.job,payload:{mode:'consolidation',documents:[]}}},new AbortController().signal),/frozen task-board/);
});

test('the desktop runner requests new workflow kinds only after the worker advertises them',async()=>{
  const claims=[];
  const r=await runner(async(url,options)=>{
    assert.ok(url.endsWith('/claim'));
    claims.push(JSON.parse(options.body));
    return response({job:null,clientWorkflows:['rfi','meeting','daily']});
  });
  r.running=true;
  r.schedule=()=>{};
  await r.tick();
  await r.tick();
  assert.deepEqual(claims,[{capabilities:['rfi']},{capabilities:['rfi','meeting','daily'],clientExtendedOnly:true}]);
  await r.stop();
});

test('meeting and daily queue jobs reuse the 27B companion and keep raw diagnostics off the website',async()=>{
  const calls=[];
  const config={service:'evergreen-local-ai',capstone:{protocol:1},notes:{pipeline:'meeting-notes-test'},pipeline:'daily-test',modelPolicy:'policy-test',models:[{name:'qwen3.5:27b',digest:'model-test'}],token:'local-token'};
  const r=await runner(async(url,options)=>{
    if(url.endsWith('/config'))return response(config);
    calls.push({url,body:JSON.parse(options.body)});
    const result=url.endsWith('/notes')?{summary:'Summary',items:[]}:{findings:[],responses:['private model traces'],timings:[]};
    return new Response(JSON.stringify({type:'result',result,model:'qwen3.5:27b',totalMs:500,loadMs:100,elapsedMs:400})+'\n');
  });
  const meeting={job:{kind:'meeting',payload:{transcript:'Alex: Review the fabrication drawing.'}}};
  const daily={job:{kind:'daily',payload:{reports:[{report_id:'F01',report_date:'2026-11-01',issue_or_update:'A clearance check remains open.'}]}}};
  const signal=new AbortController().signal;
  const notes=compactResult(await r.infer(meeting,signal),meeting);
  const reports=compactResult(await r.infer(daily,signal),daily);
  assert.ok(calls[0].url.endsWith('/notes'));
  assert.deepEqual(calls[0].body,meeting.job.payload);
  assert.ok(calls[1].url.endsWith('/analyze'));
  assert.deepEqual(calls[1].body,{reports:daily.job.payload.reports,model:'qwen3.5:27b',thorough:true,reasoning:false});
  assert.deepEqual(notes.result,{summary:'Summary',items:[],humanDecision:'pending'});
  assert.deepEqual(reports.result,{findings:[],humanDecision:'pending'});
  assert.equal(reports.provenance.modelDigest,'model-test');
});

const verifiedHealth={service:'capstone-team2-demo3',protocol:1,costPolicy:{mode:'free-only',cloudInference:false,paidFallback:false,accountVerifiedFree:true}};
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}

test('pairing pauses before health awaits and prevents concurrent starts, claims and pair attempts',async()=>{
  const health=deferred(),calls=[],newUrl='https://capstone-new.example.workers.dev';
  const r=await runner(async(url,options)=>{
    calls.push({url,body:options.body&&JSON.parse(options.body)});
    if(url.endsWith('/health'))return health.promise;
    if(url.endsWith('/runner/pair'))return response({protocol:1,token:'new-runner-token',principal:{id:'runner_new'}});
    throw Error('A job must not be claimed while pairing.');
  });
  try{
    r.start();
    const pairing=r.pair(newUrl,'one-use-code');
    assert.equal(r.running,false);
    assert.equal(r.pairing,true);
    assert.equal(r.timer,null);
    assert.throws(()=>r.start(),/pairing/);
    await r.tick();
    await assert.rejects(r.pair(newUrl,'another-code'),/current question or connection/);
    assert.equal(calls.length,1);
    assert.ok(calls[0].url.endsWith('/health'));
    health.resolve(response(verifiedHealth));
    await pairing;
    assert.equal(r.pairing,false);
    assert.equal(r.running,false);
    assert.equal(r.config.url,newUrl);
    assert.equal(r.config.principalId,'runner_new');
    assert.equal(JSON.parse(await readFile(path.join(r.dir,'connection.json'),'utf8')).url,newUrl);
    await r.tick();
    assert.deepEqual(calls.map(c=>new URL(c.url).pathname),['/api/capstone/v1/health','/api/capstone/v1/runner/pair']);
  }finally{r.pause();}
});

test('failed health verification restores the previous running connection without sending a pairing code',async()=>{
  const health=deferred(),calls=[];
  const r=await runner(async(url,options)=>{calls.push({url,body:options.body});return health.promise;});
  const previous=r.config;
  try{
    r.start();
    const pairing=r.pair('https://unverified-capstone.example.workers.dev','private-code');
    assert.equal(r.running,false);
    assert.equal(r.pairing,true);
    health.resolve(response({...verifiedHealth,costPolicy:{...verifiedHealth.costPolicy,accountVerifiedFree:false}}));
    await assert.rejects(pairing,/verified Free/);
    assert.equal(r.config,previous);
    assert.equal(r.pairing,false);
    assert.equal(r.running,true);
    assert.notEqual(r.timer,null);
    assert.equal(calls.length,1);
    assert.equal(calls[0].body,undefined);
  }finally{r.pause();}
});

test('a failed pairing leaves an already paused runner paused',async()=>{
  const r=await runner(async()=>{throw Error('Network disconnected.');});
  const previous=r.config;
  await assert.rejects(r.pair('https://capstone-new.example.workers.dev','one-use-code'),/Network disconnected/);
  assert.equal(r.config,previous);
  assert.equal(r.pairing,false);
  assert.equal(r.running,false);
  assert.equal(r.timer,null);
});

for(const status of [400,413,422])test(`permanent completion rejection ${status} records failure, preserves output and permits the next claim`,async()=>{
  const calls=[],saved={id:'job_invalid',body:{leaseToken:'invalid-result-lease',completionId:'fixed-completion',result:{invalid:true}},cloudUrl:'https://capstone-test.example.workers.dev'};
  const r=await runner(async(url,options)=>{
    const body=options.body&&JSON.parse(options.body);calls.push({url,body});
    if(url.endsWith('/complete'))return new Response(JSON.stringify({error:{message:'Result validation failed.'}}),{status});
    if(url.endsWith('/fail'))return response({jobId:saved.id,status:'failed'});
    if(url.endsWith('/claim'))return response({job:null,pollAfterMs:15000});
    throw Error('Unexpected request.');
  });
  r.infer=async()=>{throw Error('A rejected saved result must never rerun inference.');};
  try{
    await r.save('outbox/'+saved.id+'.json',saved);
    r.running=true;
    await r.tick();
    r.pause();
    assert.deepEqual(await readdir(path.join(r.dir,'outbox')),[]);
    const archives=await readdir(path.join(r.dir,'audits'));
    assert.equal(archives.length,1);
    assert.match(archives[0],/^job_invalid-undelivered-\d+\.json$/);
    assert.deepEqual(JSON.parse(await readFile(path.join(r.dir,'audits',archives[0]),'utf8')),saved);
    const failure=calls.find(c=>c.url.endsWith('/fail'));
    assert.equal(failure.body.retryable,false);
    assert.equal(failure.body.leaseToken,saved.body.leaseToken);
    assert.equal(r.state.completed,0);
    assert.match(r.state.lastError,/failed website validation/);
    r.running=true;
    await r.tick();
    assert.equal(calls.filter(c=>c.url.endsWith('/claim')).length,1);
    assert.equal(calls.filter(c=>c.url.endsWith('/complete')).length,1);
    assert.equal(calls.filter(c=>c.url.endsWith('/fail')).length,1);
  }finally{r.pause();}
});

test('a transient failure while reporting an invalid result keeps its outbox record for retry',async()=>{
  let unavailable=true;
  const saved={id:'job_invalid',body:{leaseToken:'lease',completionId:'completion'},cloudUrl:'https://capstone-test.example.workers.dev'};
  const r=await runner(async url=>{
    if(url.endsWith('/complete'))return new Response(JSON.stringify({error:{message:'Invalid result.'}}),{status:400});
    if(unavailable)return new Response(JSON.stringify({error:{message:'Temporarily unavailable.'}}),{status:503});
    return response({jobId:saved.id,status:'failed'});
  });
  await r.save('outbox/'+saved.id+'.json',saved);
  await assert.rejects(r.flushOutbox(),/Temporarily unavailable/);
  assert.equal((await readdir(path.join(r.dir,'outbox'))).length,1);
  assert.equal((await readdir(path.join(r.dir,'audits'))).length,0);
  unavailable=false;
  await r.flushOutbox();
  assert.equal((await readdir(path.join(r.dir,'outbox'))).length,0);
  assert.equal((await readdir(path.join(r.dir,'audits'))).length,1);
});

test('loading a saved paired connection stays Off with no network calls or timer',async()=>{
  let calls=0;const r=await runner(async()=>{calls++;throw Error('Network must stay idle while Off.');});
  await r.save('connection.json',r.config);
  const restored=await new CapstoneRunner({stateDir:r.dir,fetchImpl:r.fetch}).init();
  assert.equal(restored.snapshot().paired,true);assert.equal(restored.running,false);assert.equal(restored.state.stage,'Off');assert.equal(restored.timer,null);
  await restored.tick();assert.equal(calls,0);await restored.stop();assert.equal(restored.stopOperation,null);
});

test('Off during a pending claim prevents late response from starting inference',async()=>{
  const pending=deferred(),entered=deferred(),calls=[];let inferred=false;
  const r=await runner(async(url,options)=>{calls.push({url,body:options.body&&JSON.parse(options.body)});if(url.endsWith('/claim')){entered.resolve();return pending.promise;}return response({status:'queued'});});
  r.infer=async()=>{inferred=true;return output;};
  r.start();clearTimeout(r.timer);r.timer=null;const tick=r.tick();await entered.promise;
  const stopped=r.stop({timeoutMs:100});pending.resolve(response(claim));await stopped;await tick;
  assert.equal(inferred,false);assert.equal(r.running,false);assert.equal(r.busy,false);assert.equal(r.timer,null);assert.equal(r.state.stage,'Off');
  assert.equal(calls.filter(c=>c.url.endsWith('/complete')).length,0);
  assert.equal(calls.filter(c=>c.url.endsWith('/fail')).length,1);
  assert.equal(calls.find(c=>c.url.endsWith('/fail')).body.retryable,true);
});

test('Off aborts active inference and waits for its bounded release without publishing',async()=>{
  const entered=deferred(),release=deferred(),releasing=deferred(),calls=[];
  const r=await runner(async(url,options)=>{calls.push(url);if(url.endsWith('/heartbeat'))return response({leaseExpiresAt:claim.leaseExpiresAt});if(url.endsWith('/fail')){releasing.resolve();return release.promise;}throw Error('Unexpected publication.');});
  r.infer=async(_claim,signal)=>{entered.resolve();return new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});};
  const processing=r.process(claim);await entered.promise;let settled=false;const stopping=r.stop({timeoutMs:500}).then(s=>{settled=true;return s;});
  await releasing.promise;assert.equal(settled,false);release.resolve(response({status:'queued'}));const state=await stopping;await processing;
  assert.equal(state.stage,'Off');assert.equal(r.abort,null);assert.equal(r.operations.size,0);assert.equal(r.state.currentJob,null);assert.equal(calls.some(url=>url.endsWith('/complete')),false);
});

test('Off during pairing prevents failed health from restarting an earlier On session',async()=>{
  const health=deferred(),calls=[];const r=await runner(async(url,options)=>{calls.push({url,body:options.body});return health.promise;});
  r.start();const pairing=r.pair('https://capstone-new.example.workers.dev','private-code');
  const rejected=assert.rejects(pairing,/switched off/);const stopping=r.stop({timeoutMs:200});
  health.resolve(response(verifiedHealth));await rejected;await stopping;
  assert.equal(r.running,false);assert.equal(r.timer,null);assert.equal(r.pairing,false);assert.equal(r.state.stage,'Off');assert.equal(calls.length,1);assert.equal(calls[0].body,undefined);
});

test('a stalled request cannot keep stop waiting forever or later start inference',async()=>{
  const pending=deferred(),entered=deferred();let inferred=false;
  const r=await runner(async url=>{if(url.endsWith('/claim')){entered.resolve();return pending.promise;}return response({status:'queued'});});
  r.infer=async()=>{inferred=true;return output;};r.start();clearTimeout(r.timer);r.timer=null;const tick=r.tick();await entered.promise;
  await r.stop({timeoutMs:10});assert.equal(r.running,false);assert.equal(r.state.stage,'Off');assert.throws(()=>r.start(),/shutdown/);
  pending.resolve(response(claim));await tick;assert.equal(inferred,false);assert.equal(r.busy,false);
});

test('repeated idle Off and explicit On cycles do not leave a stale stop promise',async()=>{
  const r=await runner(async()=>response({job:null}));
  for(let i=0;i<3;i++){await r.stop();assert.equal(r.stopOperation,null);r.start();assert.equal(r.running,true);assert.notEqual(r.timer,null);const state=await r.stop();assert.equal(state.stage,'Off');assert.equal(r.running,false);assert.equal(r.timer,null);}
});

test('Off during audit persistence retains the completed result locally without uploading it',async()=>{
  const writing=deferred(),resume=deferred(),calls=[];const r=await runner(async url=>{calls.push(url);return response({leaseExpiresAt:claim.leaseExpiresAt});});
  const realSave=r.save.bind(r);r.save=async(name,value)=>{if(name.startsWith('audits/')){writing.resolve();await resume.promise;}return realSave(name,value);};r.infer=async()=>output;
  const processing=r.process(claim);await writing.promise;const stopping=r.stop({timeoutMs:500});resume.resolve();await processing;await stopping;
  assert.equal(calls.some(url=>url.endsWith('/complete')),false);assert.equal((await readdir(path.join(r.dir,'outbox'))).length,1);assert.equal((await readdir(path.join(r.dir,'audits'))).length,1);assert.equal(r.state.stage,'Off');
});

test('the retired browser runner exits without starting a listener',async()=>{
  const entry=fileURLToPath(new URL('./server.mjs',import.meta.url));
  const result=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[entry],{windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);child.on('error',reject);child.on('close',code=>resolve({code,output}));});
  assert.equal(result.code,1);assert.match(result.output,/background browser runner has been removed/);assert.match(result.output,/visible app On button/);
});

for(const status of [400,413,422,409,503])test(`local HTTP failure ${status} distinguishes permanent input from a temporary runtime problem`,async()=>{
  const calls=[];const r=await runner(async(url,options)=>{
    if(url.endsWith('/heartbeat'))return response({leaseExpiresAt:claim.leaseExpiresAt});
    if(url.endsWith('/config'))return response({service:'evergreen-local-ai',capstone:{protocol:1},token:'local-token'});
    if(url.endsWith('/capstone'))return new Response(JSON.stringify({error:'The batch exceeds local review capacity.'}),{status});
    calls.push({url,body:JSON.parse(options.body)});return response({status:'failed'});
  });
  await r.process(claim);assert.equal(calls.length,1);assert.ok(calls[0].url.endsWith('/fail'));assert.equal(calls[0].body.retryable,![400,413,422].includes(status));
  if([400,413,422].includes(status))assert.match(calls[0].body.error,/batch exceeds local review capacity/);
  assert.deepEqual(await readdir(path.join(r.dir,'outbox')),[]);assert.equal(r.state.completed,0);
});

for(const retryable of [false,true])test(`streamed errors preserve explicit retryable=${retryable} classification`,async()=>{
  let failed;const r=await runner(async(url,options)=>{
    if(url.endsWith('/heartbeat'))return response({leaseExpiresAt:claim.leaseExpiresAt});
    if(url.endsWith('/config'))return response({service:'evergreen-local-ai',capstone:{protocol:1},token:'local-token'});
    if(url.endsWith('/capstone'))return new Response(JSON.stringify({type:'error',error:'Input or structured output is invalid.',code:'INVALID_INPUT',status:400,retryable})+'\n');
    failed=JSON.parse(options.body);return response({status:'failed'});
  });
  await r.process(claim);assert.equal(failed.retryable,retryable);assert.equal(r.state.completed,0);
});
