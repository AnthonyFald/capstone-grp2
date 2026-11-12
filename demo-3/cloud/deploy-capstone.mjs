// Run only after the separate Capstone account and scoped token are approved.
// Merely importing this module performs no I/O or cloud calls.
import {readFile,writeFile,mkdir,open,unlink,lstat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {verifiedConfig,CAPSTONE_ACCOUNT_ID} from './prepare-deployment.mjs';

export const ACCOUNT_ID=CAPSTONE_ACCOUNT_ID;
export const ACCOUNT_NAME='Capstone - INFO 492 Team 2';
export const RESOURCE_NAME='capstone-team2-demo3';
// Cloudflare's seven-day expiry can round up to the end of the last day.
export const MAX_TOKEN_REMAINING_MS=8*24*60*60*1000;
const API='https://api.cloudflare.com/client/v4';
const DIRECTORY=path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT=path.resolve(DIRECTORY,'../..');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const digest=value=>createHash('sha256').update(value).digest('hex');

export function assertTokenLifetime(verified,at=Date.now()){
  if(verified?.status!=='active')throw Error('The Capstone API token is not active.');
  const expiry=Date.parse(verified.expires_on);
  if(!Number.isFinite(expiry)||expiry<=at||expiry-at>MAX_TOKEN_REMAINING_MS)throw Error('Use an active Capstone account-owned deployment token with a short expiry (at most eight days remaining).');
}

export function assertSubdomain(value){
  if(value!=='capstone-info-492-team-2')throw Error('Deployment stopped: use the approved Capstone-named workers.dev subdomain in the separate Capstone account. No name is guessed or registered by this script.');
  return value;
}

export async function verifyPublicHealth(origin,{fetchImpl=fetch,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=Date.now}={}){
  const target=new URL(origin);
  if(target.protocol!=='https:'||target.port||target.username||target.password||target.pathname!=='/'||target.search||target.hash||!/^capstone-team2-demo3\.capstone[a-z0-9-]{0,54}\.workers\.dev$/.test(target.hostname))throw Error('Public health verification is restricted to the Capstone workers.dev site.');
  const deadline=now()+30000,transientFailures=[];let attempts=0;
  for(let attempt=1;attempt<=15&&now()<deadline;attempt++){
    attempts=attempt;let response,health,reason;
    try{response=await fetchImpl(target.origin+'/api/capstone/v1/health',{redirect:'error',signal:AbortSignal.timeout(Math.max(1,Math.min(5000,deadline-now())))});}
    catch{reason='network_not_ready';}
    if(response){
      if(!response.ok)reason='http_'+response.status;
      else{try{health=await response.json();}catch{reason='response_not_json';}}
    }
    if(health){
      if(health.service!==RESOURCE_NAME||health.protocol!==1||health.project!=='INFO 492 Team 2 Capstone'||health.costPolicy?.mode!=='free-only'||health.costPolicy?.accountVerifiedFree!==true||health.costPolicy?.paidFallback!==false||health.costPolicy?.cloudInference!==false)throw Error('The public response does not match the expected Capstone identity and free-only policy.');
      if(health.status==='ready')return {verifiedAt:new Date(now()).toISOString(),attempts,transientFailures,health};
      reason='service_not_ready';
    }
    transientFailures.push({attempt,reason:reason||'empty_response'});
    if(attempt<15&&now()<deadline)await pause(Math.min(2000,deadline-now()));
  }
  const error=Error('The Worker was deployed, but its public health check was not ready within 30 seconds. Retry the read-only health check before redeploying.');
  error.healthVerification={attempts,transientFailures};throw error;
}

export function deploymentEnvironment(token,stateRoot,inherited=process.env){
  const env={...inherited};
  for(const key of Object.keys(env))if(/^(?:CF_|CLOUDFLARE_|WRANGLER_)/i.test(key)||key.toUpperCase()==='NODE_OPTIONS')delete env[key];
  return {...env,CI:'true',NO_COLOR:'1',FORCE_COLOR:'0',CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:ACCOUNT_ID,CLOUDFLARE_API_BASE_URL:API,WRANGLER_SEND_METRICS:'false',WRANGLER_WRITE_LOGS:'false',WRANGLER_LOG_SANITIZE:'true',WRANGLER_LOG:'warn',WRANGLER_LOG_PATH:path.join(stateRoot,'logs'),XDG_CONFIG_HOME:path.join(stateRoot,'wrangler-home')};
}

function redact(text,secrets){
  let output=String(text).replace(/\u001b\[[0-9;]*m/g,'');
  for(const secret of secrets)if(secret)output=output.split(secret).join('[REDACTED]');
  return output.replace(/Bearer\s+[^\s"']+/gi,'Bearer [REDACTED]');
}

async function runWrangler({args,input='',env,cwd,logFile,secrets}){
  const executable=path.join(DIRECTORY,'node_modules/wrangler/bin/wrangler.js');
  const chunks=[];let bytes=0;
  await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[executable,...args],{cwd,env,windowsHide:true,stdio:['pipe','pipe','pipe']});
    const timer=setTimeout(()=>{child.kill();reject(Error('The Capstone deployment step timed out. Inspect the sanitized deployment log before retrying.'));},180000);
    const collect=chunk=>{bytes+=chunk.length;if(bytes<=1048576)chunks.push(chunk);};
    child.stdout.on('data',collect);child.stderr.on('data',collect);
    child.on('error',()=>{clearTimeout(timer);reject(Error('The pinned local Wrangler tool could not start.'));});
    child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Wrangler stopped during this Capstone deployment step (exit '+code+'). Inspect the sanitized step log; no paid fallback is attempted.'));});
    child.stdin.on('error',()=>{});child.stdin.end(input);
  }).finally(async()=>{await writeFile(logFile,redact(Buffer.concat(chunks).toString('utf8'),secrets),{mode:0o600});});
}

function allowedApiPath(route,method){
  if(method==='GET'&&(route==='/accounts/'+ACCOUNT_ID+'/tokens/verify'||route==='/accounts/'+ACCOUNT_ID+'/workers/subdomain'))return true;
  const base='/accounts/'+ACCOUNT_ID+'/d1/database';
  return method==='POST'&&route===base||method==='GET'&&(route===base+'?name='+RESOURCE_NAME+'&per_page=100'||route.startsWith(base+'/')&&UUID.test(route.slice(base.length+1)));
}

export async function deployCapstone({execute=false,fetchImpl=fetch,wrangler=runWrangler,appRoot=APP_ROOT,onProgress=console.log}={}){
  if(execute!==true)throw Error('Prepared only. Invoke with --execute after the scoped deployment token has been approved.');
  const privateRoot=path.join(appRoot,'.capstone-local'),stateRoot=path.join(privateRoot,'cloudflare-deployment');
  await mkdir(path.join(stateRoot,'logs'),{recursive:true});
  const tokenPath=path.join(privateRoot,'cloudflare-deploy-token'),ownerPath=path.join(privateRoot,'cloud-owner-token'),pepperPath=path.join(privateRoot,'client-auth-pepper');
  if((await lstat(tokenPath)).isSymbolicLink())throw Error('The Capstone deployment token must be a regular local file.');
  const token=(await readFile(tokenPath,'utf8')).trim();
  if(!/^[A-Za-z0-9._-]{20,4096}$/.test(token))throw Error('The local Capstone deployment token file is invalid.');
  const freePlanEvidence=path.join(appRoot,'desktop-build/demo3/capstone-free-plan.png');
  const freePlanEvidenceSha256=digest(await readFile(freePlanEvidence));
  const lockPath=path.join(stateRoot,'deployment.lock');let lock;
  try{lock=await open(lockPath,'wx',0o600);}catch(error){if(error.code==='EEXIST')throw Error('A Capstone deployment lock already exists. Check the previous deployment before retrying.');throw error;}
  const evidence={project:RESOURCE_NAME,accountId:ACCOUNT_ID,accountName:ACCOUNT_NAME,plan:'workers-free',planVerification:'Independently verified in Cloudflare dashboard; screenshot hash recorded',freePlanEvidenceSha256,startedAt:new Date().toISOString(),status:'preflight',steps:[]};
  const evidencePath=path.join(stateRoot,'deployment-evidence.json');
  const save=()=>writeFile(evidencePath,JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
  await lock.writeFile(JSON.stringify({pid:process.pid,startedAt:evidence.startedAt}));
  const api=async(route,{method='GET',body}={})=>{
    if(!allowedApiPath(route,method))throw Error('Blocked an API route outside the approved Capstone deployment.');
    if(body&&(method!=='POST'||Object.keys(body).sort().join(',')!=='name,read_replication'||body.name!==RESOURCE_NAME||body.read_replication?.mode!=='disabled'))throw Error('Blocked unexpected database creation options.');
    let response;try{response=await fetchImpl(API+route,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});}catch{throw Error('Cloudflare preflight/request could not reach the official API. No alternate account or paid service will be used.');}
    let envelope;try{envelope=await response.json();}catch{throw Error('Cloudflare returned an unreadable API response.');}
    if(!response.ok||envelope.success!==true){const codes=(envelope.errors||[]).map(e=>Number(e.code)).filter(Number.isFinite);const error=Error('Cloudflare API request stopped (HTTP '+response.status+', codes '+(codes.join(',')||'unavailable')+'). Check the scoped token and Capstone account setup.');error.apiCodes=codes;throw error;}
    return envelope;
  };
  try{
    onProgress('Checking the scoped token and separate Capstone account.');
    const verified=(await api('/accounts/'+ACCOUNT_ID+'/tokens/verify')).result;
    assertTokenLifetime(verified);
    evidence.tokenExpiresOn=verified.expires_on;
    evidence.tokenKind='account-owned';
    evidence.scopeVerification='Active token verified against the fixed Capstone account endpoint; account identity independently verified in dashboard';
    let subdomain;
    try{subdomain=assertSubdomain((await api('/accounts/'+ACCOUNT_ID+'/workers/subdomain')).result?.subdomain);}catch(error){if(error.apiCodes?.includes(10007))throw Error('Register a Capstone-named workers.dev subdomain at https://dash.cloudflare.com/'+ACCOUNT_ID+'/workers/onboarding, then retry. No resources were created by this attempt.');throw error;}
    evidence.url='https://'+RESOURCE_NAME+'.'+subdomain+'.workers.dev';evidence.steps.push('account-owned-token-active-for-capstone','existing-capstone-subdomain-verified');await save();
    onProgress('Preparing only the Capstone D1 database.');
    const listed=await api('/accounts/'+ACCOUNT_ID+'/d1/database?name='+RESOURCE_NAME+'&per_page=100');
    if(!Array.isArray(listed.result)||listed.result.some(d=>d.name!==RESOURCE_NAME)||listed.result.length>1||listed.result_info?.total_pages>1)throw Error('The Capstone database lookup was ambiguous; no database was changed.');
    let database=listed.result[0];
    if(!database){database=(await api('/accounts/'+ACCOUNT_ID+'/d1/database',{method:'POST',body:{name:RESOURCE_NAME,read_replication:{mode:'disabled'}}})).result;evidence.steps.push('capstone-database-created');}
    if(database?.name!==RESOURCE_NAME||!UUID.test(database?.uuid||''))throw Error('The Capstone database identity was not confirmed.');
    database=(await api('/accounts/'+ACCOUNT_ID+'/d1/database/'+database.uuid)).result;
    if(database?.name!==RESOURCE_NAME||!UUID.test(database?.uuid||''))throw Error('Database details did not confirm the Capstone resource.');
    evidence.databaseId=database.uuid;
    const config=verifiedConfig({project:RESOURCE_NAME,accountId:ACCOUNT_ID,accountName:ACCOUNT_NAME,accountPlan:'workers-free',verifiedFree:true,databaseId:database.uuid},DIRECTORY);
    config.send_metrics=false;config.keep_vars=false;config.preview_urls=false;
    const configPath=path.join(stateRoot,'wrangler.json');await writeFile(configPath,JSON.stringify(config,null,2)+'\n',{mode:0o600});
    const env=deploymentEnvironment(token,stateRoot),schemaPath=path.join(DIRECTORY,'schema.sql');
    evidence.schemaSha256=digest(await readFile(schemaPath));await save();
    onProgress('Applying the Capstone schema to its exact database.');
    await wrangler({args:['d1','execute','CAPSTONE_DB','--remote','--file',schemaPath,'--config',configPath,'--yes'],env,cwd:stateRoot,logFile:path.join(stateRoot,'logs/schema.log'),secrets:[token]});
    evidence.steps.push('schema-applied');await save();
    let owner;
    try{if((await lstat(ownerPath)).isSymbolicLink())throw Error('The cloud owner key must be a regular local file.');owner=(await readFile(ownerPath,'utf8')).trim();}
    catch(error){if(error.code!=='ENOENT')throw error;owner='capstone_owner_'+randomBytes(32).toString('hex');await writeFile(ownerPath,owner+'\n',{flag:'wx',mode:0o600});}
    if(!/^capstone_owner_[a-f0-9]{64}$/.test(owner))throw Error('The existing cloud owner key is invalid; it was not replaced.');
    let pepper;
    try{if((await lstat(pepperPath)).isSymbolicLink())throw Error('The client authentication pepper must be a regular local file.');pepper=(await readFile(pepperPath,'utf8')).trim();}
    catch(error){if(error.code!=='ENOENT')throw error;pepper=randomBytes(32).toString('hex');await writeFile(pepperPath,pepper+'\n',{flag:'wx',mode:0o600});}
    if(!/^[a-f0-9]{64}$/.test(pepper))throw Error('The existing client authentication pepper is invalid; it was not replaced.');
    onProgress('Setting the Capstone owner secret privately.');
    await wrangler({args:['secret','put','CAPSTONE_OWNER_TOKEN','--name',RESOURCE_NAME,'--config',configPath],input:owner+'\n',env,cwd:stateRoot,logFile:path.join(stateRoot,'logs/secret.log'),secrets:[token,owner]});
    evidence.steps.push('owner-secret-set');await save();
    await wrangler({args:['secret','put','CAPSTONE_CLIENT_AUTH_PEPPER','--name',RESOURCE_NAME,'--config',configPath],input:pepper+'\n',env,cwd:stateRoot,logFile:path.join(stateRoot,'logs/client-auth.log'),secrets:[token,owner,pepper]});
    evidence.steps.push('client-auth-secret-set');await save();
    onProgress('Publishing the Capstone Worker and its static website.');
    await wrangler({args:['deploy','--name',RESOURCE_NAME,'--config',configPath],env,cwd:stateRoot,logFile:path.join(stateRoot,'logs/deploy.log'),secrets:[token,owner,pepper]});
    evidence.steps.push('worker-and-assets-deployed');await save();
    evidence.healthVerification=await verifyPublicHealth(evidence.url,{fetchImpl});
    evidence.status='deployed-and-health-verified';evidence.completedAt=new Date().toISOString();evidence.steps.push('public-health-verified');await save();
    onProgress('Capstone is deployed: '+evidence.url);return evidence;
  }catch(error){evidence.status='stopped';evidence.stoppedAt=new Date().toISOString();evidence.message=redact(error.message,[token]);if(error.healthVerification)evidence.healthVerification=error.healthVerification;await save();throw error;}
  finally{await lock.close();await unlink(lockPath);}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.slice(2).join(' ')!=='--execute'){console.log('Prepared only. After token approval: node demo-3/cloud/deploy-capstone.mjs --execute');process.exitCode=1;}
  else await deployCapstone({execute:true}).catch(error=>{console.error(error.message);process.exitCode=1;});
}
