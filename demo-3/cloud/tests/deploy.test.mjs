import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ACCOUNT_ID,ACCOUNT_NAME,RESOURCE_NAME,MAX_TOKEN_REMAINING_MS,assertTokenLifetime,assertSubdomain,verifyPublicHealth,deploymentEnvironment,deployCapstone} from '../deploy-capstone.mjs';
const root=fileURLToPath(new URL('../../../desktop-build/demo3/.private/deploy-tests/',import.meta.url));
const databaseId='11111111-2222-3333-4444-555555555555';
const token='mock_capstone_deployment_token_only';
function envelope(result,status=200,errors=[]){return new Response(JSON.stringify({success:status===200,result,errors}),{status,headers:{'Content-Type':'application/json'}});}
async function fixtures(t){await mkdir(root,{recursive:true});const appRoot=await mkdtemp(path.join(root,'case-'));t.after(async()=>{if(!path.resolve(appRoot).startsWith(path.resolve(root)+path.sep))throw Error('Unsafe test cleanup target');await rm(appRoot,{recursive:true,force:true});});await mkdir(path.join(appRoot,'.capstone-local'),{recursive:true});await mkdir(path.join(appRoot,'desktop-build/demo3'),{recursive:true});await writeFile(path.join(appRoot,'.capstone-local/cloudflare-deploy-token'),token);await writeFile(path.join(appRoot,'desktop-build/demo3/capstone-free-plan.png'),'mock verification evidence');return appRoot;}
function mocks({verificationDenied=false,missingSubdomain=false,existingDatabase=false}={}){const calls=[],runs=[];const database={uuid:databaseId,name:RESOURCE_NAME};return {calls,runs,async fetchImpl(url,options={}){calls.push({url,method:options.method||'GET',body:options.body});if(url.endsWith('/accounts/'+ACCOUNT_ID+'/tokens/verify'))return verificationDenied?envelope(null,403,[{code:10000}]):envelope({status:'active',expires_on:new Date(Date.now()+3600000).toISOString()});if(url.endsWith('/workers/subdomain'))return missingSubdomain?envelope(null,404,[{code:10007}]):envelope({subdomain:'capstone-info-492-team-2'});if(url.includes('/d1/database?'))return envelope(existingDatabase?[database]:[]);if(url.endsWith('/d1/database')||url.endsWith('/d1/database/'+databaseId))return envelope(database);if(url.endsWith('/api/capstone/v1/health'))return new Response(JSON.stringify({service:RESOURCE_NAME,protocol:1,project:'INFO 492 Team 2 Capstone',status:'ready',costPolicy:{mode:'free-only',accountVerifiedFree:true,paidFallback:false,cloudInference:false}}));throw Error('Unexpected mock route');},async wrangler(request){runs.push(request);}};}

test('deployment cannot execute implicitly and does not guess a personal subdomain',async()=>{
  await assert.rejects(deployCapstone(),/Prepared only/);
  assert.throws(()=>assertSubdomain('personal-domain'),/Capstone-named/);
  assert.throws(()=>assertSubdomain('capstone-unrelated-project'),/Capstone-named/);
  assert.equal(assertSubdomain('capstone-info-492-team-2'),'capstone-info-492-team-2');
});

test('deployment requires an active token with a bounded, unexpired lifetime',()=>{
  const at=Date.parse('2026-11-12T01:00:00.000Z');
  const credential=offset=>({status:'active',expires_on:new Date(at+offset).toISOString()});
  assert.doesNotThrow(()=>assertTokenLifetime(credential(7*86400000),at));
  assert.doesNotThrow(()=>assertTokenLifetime(credential(MAX_TOKEN_REMAINING_MS),at));
  assert.throws(()=>assertTokenLifetime(credential(MAX_TOKEN_REMAINING_MS+1),at),/short expiry/);
  assert.throws(()=>assertTokenLifetime(credential(0),at),/short expiry/);
  assert.throws(()=>assertTokenLifetime({status:'active'},at),/short expiry/);
  assert.throws(()=>assertTokenLifetime({status:'expired',expires_on:'2026-11-10T07:59:59Z'},at),/not active/);
  assert.throws(()=>assertTokenLifetime({...credential(86400000),status:'disabled'},at),/not active/);
});

test('deployment environment removes inherited authentication and redirects while pinning the Capstone account',()=>{
  const env=deploymentEnvironment(token,'C:/capstone',{PATH:'retained',CF_API_TOKEN:'unrelated',CLOUDFLARE_API_KEY:'unrelated',CLOUDFLARE_ACCOUNT_ID:'paid',CLOUDFLARE_API_BASE_URL:'https://foreign.example',WRANGLER_LOG_SANITIZE:'false',WRANGLER_API_ENVIRONMENT:'staging',NODE_OPTIONS:'--require dangerous'});
  assert.equal(env.CF_API_TOKEN,undefined);assert.equal(env.CLOUDFLARE_API_KEY,undefined);assert.equal(env.NODE_OPTIONS,undefined);assert.equal(env.WRANGLER_API_ENVIRONMENT,undefined);assert.equal(env.CLOUDFLARE_ACCOUNT_ID,ACCOUNT_ID);assert.equal(env.CLOUDFLARE_API_TOKEN,token);assert.equal(env.CLOUDFLARE_API_BASE_URL,'https://api.cloudflare.com/client/v4');assert.equal(env.WRANGLER_WRITE_LOGS,'false');assert.equal(env.WRANGLER_SEND_METRICS,'false');
});

test('account-owned token verification must succeed for Capstone before any resource mutation',async t=>{
  const appRoot=await fixtures(t),m=mocks({verificationDenied:true});
  await assert.rejects(deployCapstone({execute:true,appRoot,...m,onProgress:()=>{}}),/HTTP 403/);
  assert.equal(m.runs.length,0);assert.equal(m.calls.some(c=>c.method!=='GET'),false);assert.equal(m.calls.length,1);assert.equal(m.calls[0].url,'https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT_ID+'/tokens/verify');
});

test('missing workers.dev registration stops before database creation without guessing a name',async t=>{
  const appRoot=await fixtures(t),m=mocks({missingSubdomain:true});
  await assert.rejects(deployCapstone({execute:true,appRoot,...m,onProgress:()=>{}}),/Register a Capstone-named/);
  assert.equal(m.runs.length,0);assert.equal(m.calls.some(c=>c.method!=='GET'),false);
});

test('approved deployment targets only Capstone, sends the owner secret by stdin and records no secrets',async t=>{
  const appRoot=await fixtures(t),m=mocks();
  const evidence=await deployCapstone({execute:true,appRoot,...m,onProgress:()=>{}});
  assert.equal(m.calls.filter(c=>c.url.startsWith('https://api.cloudflare.com/')).every(c=>new URL(c.url).pathname.startsWith('/client/v4/accounts/'+ACCOUNT_ID+'/')),true);
  assert.equal(m.calls.some(c=>c.url.includes('/user/')||c.url.endsWith('/accounts')||c.url.includes('/accounts?')),false);
  assert.equal(evidence.tokenKind,'account-owned');
  assert.equal(evidence.status,'deployed-and-health-verified');assert.equal(evidence.databaseId,databaseId);
  assert.equal(evidence.url,'https://capstone-team2-demo3.capstone-info-492-team-2.workers.dev');
  assert.equal(m.calls.filter(c=>c.method==='POST').length,1);assert.deepEqual(JSON.parse(m.calls.find(c=>c.method==='POST').body),{name:RESOURCE_NAME,read_replication:{mode:'disabled'}});
  assert.equal(m.runs.length,4);assert.deepEqual(m.runs.map(r=>r.args[0]),['d1','secret','secret','deploy']);
  const config=JSON.parse(await readFile(path.join(appRoot,'.capstone-local/cloudflare-deployment/wrangler.json'),'utf8'));assert.equal(config.account_id,ACCOUNT_ID);assert.equal(config.d1_databases[0].database_id,databaseId);assert.equal(config.d1_databases[0].binding,'CAPSTONE_DB');assert.equal(config.name,RESOURCE_NAME);assert.equal(config.preview_urls,false);
  const owner=(await readFile(path.join(appRoot,'.capstone-local/cloud-owner-token'),'utf8')).trim();assert.equal(m.runs[1].input,owner+'\n');assert.equal(m.runs.some(r=>r.args.some(a=>a.includes(owner))),false);
  const pepper=(await readFile(path.join(appRoot,'.capstone-local/client-auth-pepper'),'utf8')).trim();assert.equal(m.runs[2].input,pepper+'\n');assert.equal(m.runs.some(r=>r.args.some(a=>a.includes(pepper))),false);
  const saved=await readFile(path.join(appRoot,'.capstone-local/cloudflare-deployment/deployment-evidence.json'),'utf8');assert.equal(saved.includes(token),false);assert.equal(saved.includes(owner),false);assert.equal(saved.includes(pepper),false);
  await assert.rejects(access(path.join(appRoot,'.capstone-local/cloudflare-deployment/deployment.lock')));
});

test('public health tolerates initial HTML propagation then verifies the exact free Capstone identity',async()=>{
  const origin='https://capstone-team2-demo3.capstone-info-492-team-2.workers.dev';
  const m=mocks();let count=0;const sleeps=[];
  const result=await verifyPublicHealth(origin,{fetchImpl:async(url,options)=>++count===1?new Response('<!DOCTYPE html><title>Not ready</title>'):m.fetchImpl(url,options),pause:async ms=>sleeps.push(ms)});
  assert.equal(result.attempts,2);assert.deepEqual(result.transientFailures,[{attempt:1,reason:'response_not_json'}]);assert.deepEqual(sleeps,[2000]);assert.equal(result.health.service,RESOURCE_NAME);
});

test('public health retries are bounded and a wrong identity is never accepted',async()=>{
  const origin='https://capstone-team2-demo3.capstone-info-492-team-2.workers.dev';let requests=0;
  await assert.rejects(verifyPublicHealth(origin,{fetchImpl:async()=>{requests++;return new Response('<html>Still propagating</html>');},pause:async()=>{}}),error=>error.healthVerification.attempts===15);
  assert.equal(requests,15);
  await assert.rejects(verifyPublicHealth(origin,{fetchImpl:async()=>new Response(JSON.stringify({service:'other-project',status:'ready'})),pause:async()=>{throw Error('Must not retry identity mismatch');}}),/expected Capstone identity/);
});
