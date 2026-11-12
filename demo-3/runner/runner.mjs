import {readFile,writeFile,mkdir,rename,unlink,readdir} from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const SERVICE='capstone-team2-demo3',VERSION='capstone-runner-3-manual';
export const API='/api/capstone/v1';
const workflowKinds=['rfi','meeting','daily'];
const localModel='qwen3.5:27b';
export function normalizeUrl(value,{allowLocal=false}={}){
  const u=new URL(value);
  const local=allowLocal&&u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname);
  if((!local&&(u.protocol!=='https:'||!u.hostname.endsWith('.workers.dev')))||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('Use the Capstone https://…workers.dev address.');
  return u.origin;
}
export function approvedLessons(claim){
  if(claim.job.cohort==='baseline')return [];
  return (claim.lessons?.items||[]).filter(x=>!x.appliesTo||x.appliesTo.includes('rfi')).map(({id,version,text,approved,approvedBy,approvedAt})=>({id,version,text,approved,approvedBy,approvedAt}));
}
export function compactResult(output,claim){
  const {result:original,model,modelDigest,backend,policy,contextWindow,sampling,seed,reasoning,sourceHashes,inputSha256,documentHashes,totalMs,loadMs,elapsedMs}=output;
  let result=original;
  if(claim.job.kind==='meeting'&&Array.isArray(original?.items))result={summary:original.summary,items:original.items,humanDecision:'pending'};
  if(claim.job.kind==='daily'&&Array.isArray(original?.findings))result={findings:original.findings,humanDecision:'pending'};
  if(!result||result.humanDecision!=='pending')throw Error('The local model did not return a reviewable proposal.');
  return {result,provenance:{runnerVersion:VERSION,engineVersion:output.engineVersion,model,modelDigest,backend,policy,contextWindow,sampling,seed,reasoning,sourceHashes,inputSha256,documentHashes,jobInputSha256:claim.job.inputSha256,lessonReleaseId:claim.lessons?.releaseId||null,lessonVersion:claim.lessons?.version||null},timings:{totalMs,loadMs,elapsedMs}};
}
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
export class CapstoneRunner{
  constructor({stateDir,fetchImpl=fetch,allowLocal=false,companion='http://127.0.0.1:4177',pollMs=15000,heartbeatMs=30000}={}){
    this.dir=stateDir;this.fetch=fetchImpl;this.allowLocal=allowLocal;this.companion=companion;this.pollMs=pollMs;this.heartbeatMs=heartbeatMs;
    this.config=null;this.running=false;this.busy=false;this.timer=null;this.abort=null;this.failures=0;
    this.epoch=0;this.control=null;this.pairAbort=null;this.operations=new Set();this.stopping=false;this.stopOperation=null;this.clientWorkflows=false;
    this.state={version:VERSION,paired:false,running:false,stage:'Off',currentJob:null,lastCompletedAt:null,lastError:null,completed:0,cloudUrl:null};
  }
  async init(){
    await mkdir(path.join(this.dir,'audits'),{recursive:true,mode:0o700});await mkdir(path.join(this.dir,'outbox'),{recursive:true,mode:0o700});
    try{this.config=JSON.parse(await readFile(path.join(this.dir,'connection.json'),'utf8'));this.config.url=normalizeUrl(this.config.url,{allowLocal:this.allowLocal});this.state.paired=true;this.state.cloudUrl=this.config.url;}catch(error){if(error.code!=='ENOENT'){this.config=null;this.state.lastError='Saved connection could not be loaded. Pair this PC again.';}}
    return this;
  }
  snapshot(){return {...this.state,running:this.running,busy:this.busy};}
  track(operation){this.operations.add(operation);operation.then(()=>this.operations.delete(operation),()=>this.operations.delete(operation));return operation;}
  async save(name,value){const dest=path.join(this.dir,name);await writeFile(dest+'.tmp',JSON.stringify(value,null,2),{mode:0o600});await rename(dest+'.tmp',dest);}
  async request(route,body,{url=this.config?.url,token=this.config?.token,signal,timeout=20000}={}){
    const headers={'Content-Type':'application/json'};if(token)headers.Authorization='Bearer '+token;
    const combined=signal?AbortSignal.any([signal,AbortSignal.timeout(timeout)]):AbortSignal.timeout(timeout);
    const response=await this.fetch(url+API+route,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),signal:combined,redirect:'error'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok){const error=Error(data.error?.message||'Capstone service returned '+response.status);error.status=response.status;throw error;}
    return data;
  }
  pair(url,code){return this.track(this.performPair(url,code));}
  async performPair(url,code){
    if(this.busy||this.pairing||this.stopping)throw Error('Wait for the current question or connection before pairing.');
    const normalized=normalizeUrl(url,{allowLocal:this.allowLocal});
    const wasRunning=this.running;this.pause();this.pairing=true;let succeeded=false;
    const pairingEpoch=this.epoch,controller=new AbortController();this.pairAbort=controller;const signal=controller.signal;
    try{
    const health=await this.request('/health',undefined,{url:normalized,token:null,signal});signal.throwIfAborted();
    const localDev=this.allowLocal&&new URL(normalized).protocol==='http:';
    if(health.service!==SERVICE||health.protocol!==1||health.costPolicy?.mode!=='free-only'||health.costPolicy?.cloudInference!==false||health.costPolicy?.paidFallback!==false||(!localDev&&health.costPolicy?.accountVerifiedFree!==true))throw Error('This is not a verified Free Capstone deployment.');
    const paired=await this.request('/runner/pair',{code:code.trim(),runnerName:'Capstone local PC'},{url:normalized,token:null,signal});signal.throwIfAborted();
    if(paired.protocol!==1||typeof paired.token!=='string')throw Error('The pairing response was invalid.');
    const connection={url:normalized,token:paired.token,principalId:paired.principal.id,pairedAt:new Date().toISOString()};await this.save('connection.json',connection);this.config=connection;succeeded=true;
    Object.assign(this.state,{paired:true,cloudUrl:normalized,stage:'Off',lastError:null});
    return this.snapshot();
    }finally{this.pairing=false;if(this.pairAbort===controller)this.pairAbort=null;if(!succeeded&&wasRunning&&pairingEpoch===this.epoch&&!signal.aborted&&!this.stopping)this.start();}
  }
  start(){if(this.pairing)throw Error('Wait for pairing to finish.');if(this.stopping||this.busy&&!this.running)throw Error('Wait for the current shutdown to finish.');if(!this.config)throw Error('Pair this PC with the Capstone website first.');if(this.running)return this.snapshot();this.epoch++;this.control=new AbortController();this.running=true;this.clientWorkflows=false;this.state.lastError=null;this.schedule(0);return this.snapshot();}
  pause(){this.epoch++;this.running=false;clearTimeout(this.timer);this.timer=null;if(!this.busy)this.state.stage='Off';return this.snapshot();}
  stop({timeoutMs=4000}={}){
    if(this.stopOperation)return this.stopOperation;
    this.stopping=true;this.pause();const reason=Error('Local runner switched off.');this.control?.abort(reason);this.abort?.abort(reason);this.pairAbort?.abort(reason);
    this.stopOperation=(async()=>{await Promise.resolve();let timeout;try{const pending=[...this.operations];if(pending.length)await Promise.race([Promise.allSettled(pending),new Promise(resolve=>{timeout=setTimeout(resolve,Math.max(0,Math.min(10000,timeoutMs)));})]);}finally{clearTimeout(timeout);this.stopping=false;this.stopOperation=null;this.state.stage='Off';}return this.snapshot();})();
    return this.stopOperation;
  }
  schedule(delay){clearTimeout(this.timer);if(this.running&&!this.stopping)this.timer=setTimeout(()=>{this.tick().catch(()=>{});},delay);}
  tick(){
    if(this.busy||this.pairing||this.stopping||!this.running)return Promise.resolve();
    this.busy=true;
    return this.track(this.performTick(this.epoch,this.control?.signal));
  }
  async performTick(epoch,signal){
    const current=()=>this.running&&!this.stopping&&epoch===this.epoch&&!signal?.aborted;
    try{
      // A saved result is delivered before another claim; transient failures never trigger duplicate inference.
      if(await this.flushOutbox(signal)||!current())return;
      this.state.stage='Waiting for queued work';
      const claimOptions=this.clientWorkflows?{capabilities:workflowKinds,clientExtendedOnly:true}:{capabilities:['rfi']};
      const claim=await this.request('/runner/claim',claimOptions,{signal});
      if(!current()){if(claim.job)await this.releaseClaim(claim);return;}
      this.clientWorkflows=Array.isArray(claim.clientWorkflows)&&workflowKinds.every(kind=>claim.clientWorkflows.includes(kind));
      if(claim.job){await this.process(claim,{signal});this.failures=0;}else this.failures=0;
    }catch(error){if(!current())return;this.failures++;this.state.lastError=error.status===401?'Connection revoked. Pair this PC again.':error.status===429?'The free service limit was reached. Waiting before retrying.':error.status===503?'The website is temporarily unavailable. Questions remain queued.':'Connection interrupted. Waiting before retrying.';this.state.stage='Waiting to reconnect';if([401,403].includes(error.status))this.pause();}
    finally{this.busy=false;if(current())this.schedule(Math.min(300000,this.pollMs*2**Math.min(this.failures,5)));else this.state.stage='Off';}
  }
  async releaseClaim(claim){await this.request('/runner/jobs/'+claim.job.id+'/fail',{leaseToken:claim.leaseToken,error:'Processing stopped by the user before local work finished.',retryable:true},{timeout:1500}).catch(()=>{});}
  async infer(claim,signal){
    const config=await this.fetch(this.companion+'/api/local/config',{signal:AbortSignal.any([signal,AbortSignal.timeout(5000)]),redirect:'error'}).then(async r=>{if(!r.ok)throw Error('Start the local model companion.');return r.json();});
    if(config.service!=='evergreen-local-ai'||config.capstone?.protocol!==1)throw Error('The local companion needs the Demo 3 update.');
    const {kind,payload:originalPayload}=claim.job;
    let endpoint,body;
    if(kind==='rfi'){
      const consolidation=originalPayload?.mode==='consolidation';
      if(consolidation&&!claim.job.board)throw Error('The website did not provide a frozen task-board snapshot.');
      if(consolidation&&!config.capstone.consolidationVersion)throw Error('Turn the Capstone app Off and On to load the task-board update.');
      endpoint='capstone';
      body={payload:consolidation?{...originalPayload,board:claim.job.board}:originalPayload,lessons:approvedLessons(claim)};
    }else if(kind==='meeting'){
      endpoint='notes';
      body={transcript:originalPayload.transcript};
    }else if(kind==='daily'){
      endpoint='analyze';
      body={reports:originalPayload.reports,model:localModel,thorough:true,reasoning:false};
    }else throw Error('Unsupported local workflow.');
    const response=await this.fetch(this.companion+'/api/local/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Evergreen-Token':config.token,Accept:'application/x-ndjson'},body:JSON.stringify(body),signal:AbortSignal.any([signal,AbortSignal.timeout(30*60*1000)]),redirect:'error'});
    if(!response.ok){const details=await response.json().catch(()=>({})),error=Error(details.error||'The local model is unavailable.');error.status=response.status;error.code=details.code;if(typeof details.retryable==='boolean')error.retryable=details.retryable;throw error;}
    const decoder=new TextDecoder();let buffer='',bytes=0,output;
    const consume=line=>{if(!line.trim())return;const item=JSON.parse(line);if(item.type==='error'){const error=Error(item.error||'Local processing failed.');error.code=item.code;if(Number.isInteger(item.status))error.status=item.status;if(typeof item.retryable==='boolean')error.retryable=item.retryable;throw error;}if(item.type==='progress')this.state.stage=String(item.stage?.message||item.stage).slice(0,180);if(item.type==='result')output=item;};
    for await(const chunk of response.body){bytes+=chunk.length;if(bytes>12e6)throw Error('The local response exceeded its size limit.');buffer+=decoder.decode(chunk,{stream:true});let at;while((at=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,at));buffer=buffer.slice(at+1);}}
    consume(buffer+decoder.decode());if(!output)throw Error('The local response ended before the result arrived.');
    if(kind==='meeting')return {...output,engineVersion:config.notes?.pipeline};
    if(kind==='daily')return {...output,engineVersion:config.pipeline,backend:'ollama',policy:config.modelPolicy,modelDigest:config.models?.find(model=>model.name===localModel)?.digest};
    return output;
  }
  process(claim,options={}){return this.track(this.performProcess(claim,options));}
  async performProcess(claim,{signal:parentSignal}={}){
    if(!workflowKinds.includes(claim.job.kind))throw Error('Unsupported local workflow.');
    const id=claim.job.id;if(!/^[a-zA-Z0-9_-]+$/.test(id))throw Error('Invalid question identifier.');
    const controller=new AbortController();this.abort=controller;let lost=false,heartbeatBusy=false,expires=Date.parse(claim.leaseExpiresAt);const signal=parentSignal?AbortSignal.any([controller.signal,parentSignal]):controller.signal;
    const beat=async()=>{
      if(heartbeatBusy||signal.aborted)return;heartbeatBusy=true;
      try{const ack=await this.request('/runner/jobs/'+id+'/heartbeat',{leaseToken:claim.leaseToken,stage:this.state.stage},{signal,timeout:10000});expires=Date.parse(ack.leaseExpiresAt);}
      catch(error){if([401,403,409].includes(error.status)||Date.now()>expires-15000){lost=true;controller.abort(Error('This question is no longer assigned to this PC.'));}}
      finally{heartbeatBusy=false;}
    };
    const interval=setInterval(beat,this.heartbeatMs);this.state.currentJob={id,title:claim.job.title};this.state.stage='Reading project records';
    try{
      signal.throwIfAborted();await beat();signal.throwIfAborted();
      const output=await this.infer(claim,signal);signal.throwIfAborted();
      const completionId=crypto.randomUUID(),body={leaseToken:claim.leaseToken,completionId,...compactResult(output,claim)};
      const audit={jobId:id,cohort:claim.job.cohort,attempt:claim.job.attempt,completedAt:new Date().toISOString(),input:claim.job.payload,...(claim.job.board?{board:claim.job.board}:{}),lessons:claim.lessons,output};
      await this.save('audits/'+id+'-'+completionId+'.json',audit);
      body.provenance.localAuditSha256=sha(JSON.stringify(audit));
      await this.save('outbox/'+id+'.json',{id,body,cloudUrl:this.config.url});
      signal.throwIfAborted();this.state.stage='Saving proposal for review';await this.deliver(id,body,{signal});
    }catch(error){
      const saved=await readFile(path.join(this.dir,'outbox',id+'.json'),'utf8').catch(()=>null);
      if(saved){this.state.lastError='Result saved on this PC; waiting to send it to the website.';}
      else if(!lost){if(signal.aborted)await this.releaseClaim(claim);else{const permanent=error.retryable===false||error.retryable!==true&&[400,413,422].includes(error.status);await this.request('/runner/jobs/'+id+'/fail',{leaseToken:claim.leaseToken,error:permanent?'This batch needs attention: '+error.message.slice(0,1800):error.status===409?'Local model is busy.':'Local processing failed; inspect the PC runner.',retryable:!permanent},{timeout:1500}).catch(()=>{});}this.state.lastError=signal.aborted?null:error.message;}
      else this.state.lastError='Question canceled or reassigned. The old result was not published.';
    }finally{clearInterval(interval);if(this.abort===controller)this.abort=null;this.state.currentJob=null;}
  }
  async deliver(id,body,{signal}={}){
    try{signal?.throwIfAborted();await this.request('/runner/jobs/'+id+'/complete',body,{signal});await unlink(path.join(this.dir,'outbox',id+'.json'));this.state.completed++;this.state.lastCompletedAt=new Date().toISOString();this.state.lastError=null;}
    catch(error){if([400,409,413,422].includes(error.status)){
      if(error.status!==409)await this.request('/runner/jobs/'+id+'/fail',{leaseToken:body.leaseToken,error:'The saved local result did not pass website validation. Its audit remains on the PC.',retryable:false},{signal});
      await rename(path.join(this.dir,'outbox',id+'.json'),path.join(this.dir,'audits',id+'-undelivered-'+Date.now()+'.json'));
      this.state.lastError=error.status===409?'A canceled or reassigned question was retained locally, without publishing.':'A result failed website validation and was retained locally. The question needs attention.';return;
    }throw error;}
  }
  async flushOutbox(signal){
    const names=(await readdir(path.join(this.dir,'outbox'))).filter(x=>x.endsWith('.json'));
    signal?.throwIfAborted();
    if(!names.length)return false;this.state.stage='Sending saved result';
    const saved=JSON.parse(await readFile(path.join(this.dir,'outbox',names[0]),'utf8'));
    if(saved.cloudUrl!==this.config.url)throw Error('A saved result belongs to a different Capstone website.');
    signal?.throwIfAborted();await this.deliver(saved.id,saved.body,{signal});return true;
  }
}
