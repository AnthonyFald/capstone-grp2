import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {LocalD1} from '../local-d1.mjs';
import {derivePasswordProof} from '../../public/client/auth.mjs';
import {handle,PREFIX,sha256} from '../worker.mjs';

const schema = await readFile(new URL('../schema.sql',import.meta.url),'utf8');
const owner = 'capstone_test_owner_' + 'x'.repeat(40);
const password = 'fictional test passphrase';
const proof = await derivePasswordProof('trade@example.test',password);

function setup(t) {
  const db = new LocalD1();
  db.exec(schema);
  t.after(()=>db.close());
  const env = {CAPSTONE_DB:db,CAPSTONE_OWNER_TOKEN:owner};
  const call = async (route,{body,cookie,token,origin}={})=>{
    const headers = new Headers();
    if (cookie) headers.set('Cookie',cookie);
    if (token) headers.set('Authorization','Bearer '+token);
    if (origin) headers.set('Origin',origin);
    if (body) headers.set('Content-Type','application/json');
    const response = await handle(new Request('https://capstone.example'+PREFIX+route,{headers,method:body?'POST':'GET',...(body?{body:JSON.stringify(body)}:{})}),env);
    const setCookie = response.headers.get('Set-Cookie');
    return {status:response.status,data:await response.json(),setCookie,cookie:setCookie?.split(';')[0]};
  };
  const client = (route,options)=>call('/client'+route,options);
  const legacy = (route,body)=>call(route,{body,token:owner});
  return {db,env,call,client,legacy};
}

function assertStatus(result, status) {
  assert.equal(result.status,status,JSON.stringify(result.data));
  return result;
}

async function registration(local,role='gc',extra={}) {
  const email = local+'@example.test';
  return {name:local+' Example',email,passwordProof:await derivePasswordProof(email,password),role,projectName:'Fictional North Annex',...extra};
}

async function signup(s,local,role,extra) {
  return assertStatus(await s.client('/signup',{body:await registration(local,role,extra)}),201);
}

async function runner(s) {
  const {code} = assertStatus(await s.legacy('/runner/pair-codes',{label:'Synthetic host'}),201).data;
  const {token} = assertStatus(await s.call('/runner/pair',{body:{code,runnerName:'Synthetic host'}}),201).data;
  return token;
}

function rfi(name,text,extra={}) {
  return {
    kind:'rfi', title:name, clientRequestId:crypto.randomUUID(), dataClassification:'synthetic',
    payload:{mode:'consolidation',documents:[{id:name,title:name,kind:'request',revision:'A',issuedAt:'2026-11-02',approval:'draft',current:true,text}]},
    ...extra
  };
}

async function complete(s,token,claim,result) {
  const {job,leaseToken} = claim;
  return assertStatus(await s.call('/runner/jobs/'+job.id+'/complete',{token,body:{
    leaseToken,completionId:crypto.randomUUID(),result,provenance:{jobInputSha256:job.inputSha256},
    timings:{totalMs:1900,loadMs:100,elapsedMs:1800}
  }}),200);
}

function consolidation(claim) {
  const {board,payload} = claim.job, source = payload.documents[0];
  return {
    mode:'consolidation',version:'rfi-consolidation-12',humanDecision:'pending',boardVersion:board.version,
    summary:'One task requires coordination.',groups:[],
    items:[{
      id:'item-A',sourceDocumentId:source.id,sourceQuote:source.text,title:'Confirm coordination requirement',requirement:source.text,
      location:'',discipline:'Coordination',revision:'A',action:'create_task',targetTaskId:null,duplicateOfItemId:null,groupId:null,
      reason:'This remains a distinct request.',answer:'',citations:[],warnings:[]
    }]
  };
}

test('client signup and sessions are independent of legacy access; invites bind project, email and role',async t=>{
  const s = setup(t);
  const gc = await signup(s,'gc');
  assert.match(gc.setCookie,/HttpOnly; SameSite=Strict; Secure/);
  const stored = await s.db.prepare('SELECT * FROM client_users WHERE id=?').bind(gc.data.user.id).first();
  assert.notEqual(stored.password_hash,await derivePasswordProof('gc@example.test',password));
  const session = await s.db.prepare('SELECT token_hash FROM client_sessions WHERE user_id=?').bind(gc.data.user.id).first();
  assert.equal(session.token_hash,await sha256(gc.cookie.split('=')[1]));
  assertStatus(await s.client('/dashboard',{token:owner}),401);
  assertStatus(await s.call('/jobs',{cookie:gc.cookie}),401);
  const independent = await signup(s,'independent','sub');
  assert.notEqual(independent.data.project.id,gc.data.project.id);
  assert.equal(independent.data.capabilities.share,false);
  assertStatus(await s.client('/invites',{cookie:independent.cookie,body:{email:'trade@example.test'}}),403);
  const {code} = assertStatus(await s.client('/invites',{cookie:gc.cookie,body:{email:'trade@example.test',trade:'Electrical'}}),201).data;
  assertStatus(await s.client('/signup',{body:await registration('wrong','sub',{inviteCode:code})}),400);
  assertStatus(await s.client('/signup',{body:await registration('trade','gc',{inviteCode:code})}),400);
  const trade = await signup(s,'trade','sub',{inviteCode:code});
  assert.equal(trade.data.user.trade,'Electrical');
  assert.equal(trade.data.project.id,gc.data.project.id);
  assert.equal(trade.data.capabilities.share,true);
  assertStatus(await s.client('/signup',{body:await registration('trade','sub',{inviteCode:code})}),400);
  assertStatus(await s.client('/logout',{cookie:trade.cookie,origin:'https://foreign.example',body:{}}),403);
  assertStatus(await s.client('/logout',{cookie:trade.cookie,body:{}}),200);
  assertStatus(await s.client('/dashboard',{cookie:trade.cookie}),401);
  assertStatus(await s.client('/login',{body:{email:'trade@example.test',passwordProof:'f'.repeat(64)}}),401);
  const login = assertStatus(await s.client('/login',{body:{email:'TRADE@example.test',passwordProof:proof}}),200);
  assertStatus(await s.client('/dashboard',{cookie:login.cookie}),200);
  s.env.CAPSTONE_CLIENT_SIGNUPS='closed';
  assertStatus(await s.client('/signup',{body:await registration('closed')}),403);
});

test('client queue, accepted project history, sharing and review metrics stay within authorized scopes',async t=>{
  const s = setup(t), gc = await signup(s,'gc'), other = await signup(s,'other');
  const {code} = assertStatus(await s.client('/invites',{cookie:gc.cookie,body:{email:'trade@example.test'}}),201).data;
  const sub = await signup(s,'trade','sub',{inviteCode:code}), token = await runner(s);
  const privateBody = rfi('P1','Confirm the private duct clearance before Friday.');
  const privateRun = assertStatus(await s.client('/runs',{body:privateBody,cookie:sub.cookie}),201).data.run;
  const duplicate = assertStatus(await s.client('/runs',{body:privateBody,cookie:sub.cookie}),200).data.run;
  assert.equal(duplicate.id,privateRun.id);
  for (const cookie of [gc.cookie,other.cookie]) assertStatus(await s.client('/runs/'+privateRun.id,{cookie}),404);
  assertStatus(await s.legacy('/jobs/'+privateRun.id),404);
  assertStatus(await s.legacy('/jobs/'+privateRun.id+'/apply',{}),404);
  assert.deepEqual(assertStatus(await s.legacy('/jobs'),200).data.jobs,[]);
  assert.equal(assertStatus(await s.legacy('/metrics'),200).data.jobs.total,0);
  const marker = {version:6,tasks:[{title:'LEGACY BOARD SECRET MARKER'}],documents:[],appliedJobIds:[]};
  await s.db.prepare("UPDATE board_state SET state_json=?,version=6 WHERE id='main'").bind(JSON.stringify(marker)).run();
  const claim = async()=>assertStatus(await s.call('/runner/claim',{token,body:{capabilities:['rfi']}}),200).data;
  const first = await claim();
  assert.equal(first.job.id,privateRun.id);
  assert.deepEqual(first.job.board,{version:0,tasks:[],documents:[]});
  assert.deepEqual(first.lessons.items,[]);
  await complete(s,token,first,consolidation(first));
  const assessment = {decision:'accept',notes:'I checked the original request.',metrics:{correctFacts:1,incorrectFacts:0,missingFacts:0,extraErrors:0,reviewSeconds:15,manualSeconds:50}};
  assert.equal(assertStatus(await s.client('/runs/'+privateRun.id+'/review',{cookie:sub.cookie,body:assessment}),201).data.review.applied,true);
  assertStatus(await s.client('/runs/'+privateRun.id+'/share',{cookie:sub.cookie,body:{shared:true}}),403);
  const next = assertStatus(await s.client('/runs',{cookie:sub.cookie,body:rfi('P2','Coordinate the next private inspection.') }),201).data.run;
  const second = await claim();
  assert.equal(second.job.id,next.id);
  assert.equal(second.job.board.version,1);
  assert.match(second.job.board.documents[0].text,/private duct clearance/);
  const shared = assertStatus(await s.client('/runs',{cookie:sub.cookie,body:rfi('S1','Coordinate the shared electrical sleeve.',{shared:true})}),201).data.run;
  const sharedClaim = await claim();
  assert.equal(sharedClaim.job.id,shared.id);
  assert.deepEqual(sharedClaim.job.board,{version:0,tasks:[],documents:[]});
  assert.doesNotMatch(JSON.stringify(sharedClaim),/private duct|LEGACY BOARD SECRET/);
  await complete(s,token,sharedClaim,consolidation(sharedClaim));
  assertStatus(await s.client('/runs/'+shared.id,{cookie:other.cookie}),404);
  assertStatus(await s.client('/runs/'+shared.id,{cookie:gc.cookie}),200);
  assert.equal(assertStatus(await s.client('/runs/'+shared.id+'/review',{cookie:gc.cookie,body:assessment}),201).data.review.applied,false);
  const gcDashboard = assertStatus(await s.client('/dashboard',{cookie:gc.cookie}),200).data;
  assert.deepEqual(gcDashboard.runs.map(run=>run.id),[shared.id]);
  assert.equal(gcDashboard.board.tasks.length,0);
  assert.equal(gcDashboard.evaluation.accuracy,100);
  assert.equal(gcDashboard.evaluation.assistedSeconds,16.9);
  assertStatus(await s.client('/runs/'+shared.id+'/share',{cookie:sub.cookie,body:{shared:false}}),200);
  assertStatus(await s.client('/runs/'+shared.id,{cookie:gc.cookie}),404);
  assert.deepEqual(assertStatus(await s.client('/dashboard',{cookie:gc.cookie}),200).data.runs,[]);
});

test('extended runner claims select client meeting and daily jobs without claiming legacy extended work',async t=>{
  const s = setup(t), user = await signup(s,'gc'), token = await runner(s);
  const meeting = {kind:'meeting',title:'Fictional handoff',payload:{transcript:'Maya: The drawing review is due Friday afternoon.'},clientRequestId:crypto.randomUUID(),dataClassification:'synthetic'};
  const daily = {kind:'daily',title:'Fictional site log',payload:{reports:[{report_id:'D1',report_date:'2026-11-02',work_completed:'Verified staging area.'}]},clientRequestId:crypto.randomUUID(),dataClassification:'synthetic'};
  assertStatus(await s.legacy('/jobs',meeting),201);
  const queued = [];
  for (const body of [meeting,daily]) queued.push(assertStatus(await s.client('/runs',{cookie:user.cookie,body}),201).data.run);
  const old = assertStatus(await s.call('/runner/claim',{token,body:{capabilities:['rfi']}}),200).data;
  assert.equal(old.job,null);
  assert.deepEqual(old.clientWorkflows,['rfi','meeting','daily']);
  const seen = [];
  for (let count=0;count<queued.length;count++) {
    const claim = assertStatus(await s.call('/runner/claim',{token,body:{capabilities:old.clientWorkflows,clientExtendedOnly:true}}),200).data;
    seen.push(claim.job.id);
    assert.equal(claim.job.board,undefined);
    await complete(s,token,claim,claim.job.kind==='meeting'?{humanDecision:'pending',items:[]}:{humanDecision:'pending',findings:[]});
    assert.equal(assertStatus(await s.client('/runs/'+claim.job.id,{cookie:user.cookie}),200).data.run.result.humanDecision,'pending');
  }
  assert.deepEqual(seen.sort(),queued.map(run=>run.id).sort());
  const none = assertStatus(await s.call('/runner/claim',{token,body:{capabilities:old.clientWorkflows,clientExtendedOnly:true}}),200).data;
  assert.equal(none.job,null);
  assert.equal(assertStatus(await s.legacy('/jobs'),200).data.jobs[0].status,'queued');
});
