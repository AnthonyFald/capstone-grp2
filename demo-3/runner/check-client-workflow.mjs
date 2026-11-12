import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as wait} from 'node:timers/promises';
import {OwnedRuntime} from './desktop-host.mjs';
import {API,CapstoneRunner} from './runner.mjs';
import {LocalD1} from '../cloud/local-d1.mjs';
import {handle} from '../cloud/worker.mjs';
import {derivePasswordProof} from '../public/client/auth.mjs';

if(process.argv[2]!=='--run-synthetic'){
  console.log('Add --run-synthetic to start a bounded local GPU test of all three workflows.');
  process.exit(0);
}

const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const folder=path.join(root,'desktop-build','demo3','client-queue-'+new Date().toISOString().replaceAll(':','-'));
await mkdir(folder,{recursive:true});
const origin='http://127.0.0.1:4188';
const db=new LocalD1();
db.exec(await readFile(path.join(root,'demo-3/cloud/schema.sql'),'utf8'));
const secret=()=>randomBytes(32).toString('hex');
const env={CAPSTONE_DB:db,CAPSTONE_OWNER_TOKEN:'capstone_owner_'+secret(),CAPSTONE_CLIENT_AUTH_PEPPER:secret()};
const lifetime=new AbortController();
const stop=()=>lifetime.abort(Error('Local client test session ended.'));
const timeout=setTimeout(stop,20*60*1000);
process.once('SIGINT',stop);
process.once('SIGTERM',stop);
const fetchImpl=(url,options)=>url.startsWith(origin+API+'/')?handle(new Request(url,options),env):fetch(url,options);
const runner=await new CapstoneRunner({stateDir:folder,fetchImpl,allowLocal:true,pollMs:1100}).init();
const runtime=new OwnedRuntime({root,work:path.dirname(root),onExit:stop});
const summary={scope:'Local client API, SQLite adapter and real RTX 5080 runner',synthetic:true,liveHosted:false,reviewer:'AI-assisted software acceptance',jobs:[]};
const save=()=>writeFile(path.join(folder,'summary.json'),JSON.stringify(summary,null,2)+'\n');
async function request(route,{body,cookie,owner=false,status=200}={}){
  const response=await fetchImpl(origin+API+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(owner?{Authorization:'Bearer '+env.CAPSTONE_OWNER_TOKEN}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();
  assert.equal(response.status,status,route+' '+(data.error?.code||''));
  return {data,cookie:response.headers.get('Set-Cookie')?.split(';')[0]};
}
async function account(name,address,role,inviteCode){
  const passwordProof=await derivePasswordProof(address,secret());
  const signedUp=await request('/client/signup',{status:201,body:{name,email:address,passwordProof,role,projectName:'Fictional Pump House',inviteCode}});
  await request('/client/logout',{body:{},cookie:signedUp.cookie});
  return (await request('/client/login',{body:{email:address,passwordProof}})).cookie;
}
const fixtures=[
  {kind:'rfi',title:'Pump house installation requests',payload:{mode:'consolidation',documents:[{id:'DEMO-Q1',title:'Fictional field request',kind:'request',revision:'A',issuedAt:'2026-11-11',approval:'draft',current:true,text:'Please confirm the north wall sleeve centerline before Tuesday. Reminder: Confirm the north wall sleeve centerline before Tuesday. Verify that the access panel stays reachable after duct installation.'}]}},
  {kind:'meeting',title:'Fictional entry finish meeting',payload:{transcript:'Maya: We approved the east entry panel finish as shown on drawing A-12.\nLeo: I will send the approved finish schedule to the general contractor by Friday.\nMaya: Does the alternate latch have written approval?\nLeo: We still need the designer’s response.'}},
  {kind:'daily',title:'Fictional daily field report',payload:{reports:[{report_id:'FIELD-01',report_date:'2026-11-11',work_area:'Pump house',work_completed:'Installed the temporary barriers.',issue_or_update:'The pump base inspection request is logged. No inspector acceptance is on file. Keep the pour on hold until written inspection acceptance.'}]}}
];

try{
  const gc=await account('GC test reviewer','gc@example.test','gc');
  const {data:invitation}=await request('/client/invites',{body:{email:'sub@example.test',trade:'Mechanical'},cookie:gc,status:201});
  const sub=await account('Subcontractor test reviewer','sub@example.test','sub',invitation.code);
  const outsider=await account('Separate project reviewer','separate@example.test','gc');
  for(const fixture of fixtures){
    const cookie=fixture.kind==='daily'?sub:gc;
    const {data}=await request('/client/runs',{body:{...fixture,clientRequestId:randomUUID(),dataClassification:'synthetic',shared:fixture.kind==='daily'},cookie,status:201});
    assert.equal(data.run.status,'queued');
    summary.jobs.push({kind:fixture.kind,id:data.run.id,status:'queued',queuedAt:data.run.createdAt});
  }
  const list=async cookie=>(await request('/client/dashboard',{cookie})).data.runs;
  assert.equal((await list(gc)).length,3);
  assert.equal((await list(sub)).length,1);
  assert.equal((await list(outsider)).length,0);
  await request('/client/runs/'+summary.jobs[0].id,{cookie:sub,status:404});
  await request('/client/runs/'+summary.jobs[2].id,{cookie:outsider,status:404});
  summary.accessVerified=true;
  const {data:pair}=await request('/runner/pair-codes',{owner:true,status:201,body:{label:'Local synthetic acceptance'}});
  await runner.pair(origin,pair.code);
  assert.equal(runner.snapshot().running,false);
  console.log('Three synthetic client runs queued while the GPU runner is Off. Project visibility verified.');
  await save();
  await runtime.start(lifetime.signal);
  runner.start();
  let progress;
  while(summary.jobs.some(job=>job.status==='queued'||job.status==='running')){
    await wait(1200,undefined,{signal:lifetime.signal});
    const state=runner.snapshot();
    if(state.stage!==progress){progress=state.stage;console.log(progress);}
    for(const job of summary.jobs.filter(j=>j.status==='queued'||j.status==='running')){
      const {data:{run}}=await request('/client/runs/'+job.id,{cookie:gc});
      if(run.status===job.status)continue;
      job.status=run.status;
      if(run.status==='completed'){
        assert.equal(run.result.humanDecision,'pending');
        job.timings=run.timings;
        job.completedAt=run.completedAt;
        job.resultCount=(run.result.items||run.result.findings||[]).length;
        await writeFile(path.join(folder,job.kind+'-result.json'),JSON.stringify(run.result,null,2)+'\n');
      }
      console.log(JSON.stringify({workflow:job.kind,status:job.status,timingMs:job.timings?.totalMs??null,items:job.resultCount??null}));
      await save();
    }
  }
  assert.ok(summary.jobs.every(job=>job.status==='completed'),'At least one workflow failed the acceptance run.');
  summary.completed=true;
}catch(error){
  summary.completed=false;
  console.error(error.message);
  process.exitCode=1;
}finally{
  await runner.stop();
  await runtime.stop();
  clearTimeout(timeout);
  summary.runtimeStopped=!runtime.snapshot().modelRunning&&!runtime.snapshot().companionRunning;
  await save();
  db.close();
  console.log('Local client session ended. Output: '+path.relative(root,folder));
}
