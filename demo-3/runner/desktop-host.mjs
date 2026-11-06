// Stdio-only controller for the visible Capstone Windows app. Opening it does
// not start the model, a server, or queue polling. The parent owns a Windows
// kill-on-close Job Object containing this process and every child below it.
import {spawn} from 'node:child_process';
import {access,mkdir,open} from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import readline from 'node:readline';
import {fileURLToPath} from 'node:url';
import {CapstoneRunner} from './runner.mjs';

export const DESKTOP_VERSION='capstone-desktop-host-1';
const directory=path.dirname(fileURLToPath(import.meta.url));
const appRoot=path.resolve(directory,'../..');
const workspace=path.dirname(appRoot);
const wait=(ms,signal)=>new Promise((resolve,reject)=>{
  signal?.throwIfAborted();
  const finish=()=>{signal?.removeEventListener('abort',abort);resolve();};
  const timer=setTimeout(finish,ms);
  const abort=()=>{clearTimeout(timer);reject(signal.reason||Error('Stopped.'));};
  signal?.addEventListener('abort',abort,{once:true});
});
const safeError=error=>String(error?.message||error||'Capstone could not complete that action.').replace(/Bearer\s+\S+/gi,'Bearer [hidden]').replace(/capstone_(?:owner|runner)_[A-Za-z0-9_-]+/g,'[hidden]').slice(0,500);

export async function portAvailable(port){
  return new Promise(resolve=>{
    const probe=net.createServer();
    probe.once('error',()=>resolve(false));
    probe.listen({host:'127.0.0.1',port,exclusive:true},()=>probe.close(()=>resolve(true)));
  });
}

export class OwnedRuntime{
  constructor({root=appRoot,work=workspace,spawnImpl=spawn,fetchImpl=fetch,portCheck=portAvailable,platform=process.platform,onExit=()=>{}}={}){
    this.root=root;this.work=work;this.spawn=spawnImpl;this.fetch=fetchImpl;this.portCheck=portCheck;this.platform=platform;this.onExit=onExit;
    this.children=new Map();this.stopping=null;this.intentionalStop=false;
  }
  async launch(name,executable,args,env,signal){
    const logRoot=path.join(this.root,'.capstone-local');await mkdir(logRoot,{recursive:true,mode:0o700});
    const output=await open(path.join(logRoot,'desktop-'+name+'.log'),'a',0o600);
    const errors=await open(path.join(logRoot,'desktop-'+name+'-error.log'),'a',0o600);
    let child,owned;
    try{
      signal?.throwIfAborted();child=this.spawn(executable,args,{cwd:this.root,env,windowsHide:true,detached:false,stdio:['ignore',output.fd,errors.fd]});
      owned={name,child,exited:false};this.children.set(name,owned);
      // Attach immediately: spawn errors may arrive before asynchronous log closes.
      child.once('error',()=>{owned.exited=true;if(!this.intentionalStop&&this.children.get(name)===owned)this.onExit(name);});
      child.once('exit',()=>{owned.exited=true;if(!this.intentionalStop&&this.children.get(name)===owned)this.onExit(name);});
    }
    finally{await Promise.all([output.close(),errors.close()]);}
    return owned;
  }
  async ready(url,owned,predicate,signal){
    const deadline=Date.now()+20000;
    while(Date.now()<deadline){
      signal.throwIfAborted();
      if(owned.exited)throw Error('The '+owned.name+' process could not start. Check its Capstone log.');
      try{const response=await this.fetch(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(1000)]),redirect:'error'});if(response.ok&&predicate(await response.json()))return;}
      catch(error){if(signal.aborted)throw error;}
      await wait(200,signal);
    }
    throw Error('The '+owned.name+' process did not become ready.');
  }
  async start(signal){
    signal.throwIfAborted();this.intentionalStop=false;
    for(const port of [11435,4177,4186]){
      if(!await this.portCheck(port))throw Error('Another local demo is using port '+port+'. Close that demo first; Capstone will not take it over.');
      signal.throwIfAborted();
    }
    const ollama=path.join(this.work,'.runtime/ollama/ollama.exe');
    await access(ollama);await access(path.join(this.root,'scripts/serve-local-ai.mjs'));
    signal.throwIfAborted();
    const cleanEnv={...process.env};
    for(const key of Object.keys(cleanEnv))if(/^(?:CF_|CLOUDFLARE_|WRANGLER_)/i.test(key))delete cleanEnv[key];
    const env={...cleanEnv,OLLAMA_HOST:'127.0.0.1:11435',OLLAMA_MODELS:path.join(this.work,'.runtime/models'),OLLAMA_NO_CLOUD:'1',OLLAMA_NUM_PARALLEL:'1',OLLAMA_DEBUG:'false'};
    const model=await this.launch('model',ollama,['serve'],env,signal);
    signal.throwIfAborted();
    await this.ready('http://127.0.0.1:11435/api/version',model,data=>typeof data.version==='string',signal);
    signal.throwIfAborted();
    const companion=await this.launch('companion',process.execPath,['scripts/serve-local-ai.mjs'],env,signal);
    signal.throwIfAborted();
    await this.ready('http://127.0.0.1:4177/api/local/config',companion,data=>data.service==='evergreen-local-ai'&&data.capstone?.protocol===1,signal);
  }
  async killTree(owned){
    const child=owned.child;
    if(!child.pid||owned.exited)return;
    if(this.platform==='win32'){
      const tool=path.join(process.env.SystemRoot||'C:\\Windows','System32/taskkill.exe');
      await new Promise(resolve=>{
        const killer=this.spawn(tool,['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
        let settled=false;const done=()=>{if(!settled){settled=true;clearTimeout(timer);resolve();}};
        const timer=setTimeout(()=>{try{child.kill();}catch{}done();},3000);
        killer.once('error',()=>{try{child.kill();}catch{}done();});killer.once('exit',done);
      });
    }else{try{child.kill('SIGTERM');}catch{}await wait(100);if(!owned.exited)try{child.kill('SIGKILL');}catch{}}
    if(!owned.exited)await Promise.race([new Promise(resolve=>child.once('exit',resolve)),wait(500)]);
  }
  async stop(){
    if(this.stopping)return this.stopping;
    this.intentionalStop=true;
    this.stopping=(async()=>{
      // The model parent is killed while it still exists so /T reaches its GPU child.
      for(const owned of [...this.children.values()].reverse())await this.killTree(owned);
      this.children.clear();
    })();
    try{await this.stopping;}finally{this.stopping=null;}
  }
  snapshot(){return {modelRunning:this.children.has('model')&&!this.children.get('model').exited,companionRunning:this.children.has('companion')&&!this.children.get('companion').exited};}
}

export class DesktopController{
  constructor({runner,runtime,emit=()=>{},statusIntervalMs=2000}={}){
    this.runner=runner;this.runtime=runtime;this.emit=emit;this.intervalMs=statusIntervalMs;
    this.power='off';this.lastError=null;this.generation=0;this.lifetime=null;this.starting=null;this.stopping=null;this.timer=null;this.pairing=false;this.closed=false;
    runtime.onExit=name=>{if(['on','starting'].includes(this.power)){this.lastError='The '+name+' process stopped. Capstone is turning Off.';void this.off();}};
  }
  snapshot(){
    const s=this.runner.snapshot();
    return {version:DESKTOP_VERSION,power:this.power,paired:s.paired===true,cloudUrl:s.cloudUrl||null,running:this.power==='on'&&s.running===true,busy:s.busy===true,
      stage:this.power==='off'?'Off — no model or queue processing':this.power==='starting'?'Starting local processing…':this.power==='stopping'?'Stopping and releasing the local model…':s.stage,
      currentJob:s.currentJob?{id:s.currentJob.id,title:s.currentJob.title}:null,completed:s.completed||0,lastCompletedAt:s.lastCompletedAt||null,lastError:this.lastError||s.lastError||null,
      ...this.runtime.snapshot()};
  }
  publish(extra={}){const status=this.snapshot();if(status.lastError)status.lastError=safeError(status.lastError);this.emit({type:'status',...extra,...status});return status;}
  async on(){
    if(this.closed)throw Error('This Capstone application is closing.');
    if(this.pairing)throw Error('Wait for pairing to finish.');
    if(this.power==='on')return this.snapshot();
    if(this.starting)return this.starting;
    if(this.stopping)throw Error('Wait until Capstone is Off before starting again.');
    if(!this.runner.config)throw Error('Connect this PC using a Capstone pairing code first.');
    const generation=++this.generation,controller=new AbortController();this.lifetime=controller;
    this.power='starting';this.lastError=null;this.publish();
    this.starting=(async()=>{
      try{
        await this.runtime.start(controller.signal);controller.signal.throwIfAborted();
        if(generation!==this.generation)throw Error('Stopped during startup.');
        this.runner.start();this.power='on';this.publish();
        this.timer=setInterval(()=>this.publish(),this.intervalMs);return this.snapshot();
      }catch(error){
        await this.runtime.stop();
        if(generation===this.generation){this.power='off';this.lastError=controller.signal.aborted?null:safeError(error);this.publish();}
        throw error;
      }finally{this.starting=null;}
    })();
    return this.starting;
  }
  async off(){
    if(this.stopping)return this.stopping;
    ++this.generation;this.lifetime?.abort(Error('Capstone turned Off.'));clearInterval(this.timer);this.timer=null;
    this.power='stopping';this.publish();
    const startup=this.starting;
    this.stopping=(async()=>{
      try{
        await this.runner.stop({timeoutMs:2000});
        if(startup)await startup.catch(()=>{});
      }finally{
        await this.runtime.stop();this.power='off';this.publish();
      }
      return this.snapshot();
    })();
    try{return await this.stopping;}finally{this.stopping=null;}
  }
  async pair(url,code){
    if(this.closed||this.power!=='off'||this.pairing)throw Error('Turn Capstone Off before pairing.');
    this.pairing=true;this.lastError=null;
    try{await this.runner.pair(url,code);return this.publish();}finally{this.pairing=false;}
  }
  async quit(){this.closed=true;return this.off();}
  async command(input){
    if(!input||typeof input!=='object'||!['status','on','off','pair','quit'].includes(input.command))throw Error('Unsupported Capstone desktop command.');
    if(input.command==='status')return this.snapshot();
    if(input.command==='pair')return this.pair(input.url,input.code);
    return this[input.command]();
  }
}

export async function runStdio({input=process.stdin,output=process.stdout,createRunner,createRuntime,exit=code=>{process.exitCode=code;}}={}){
  let host;
  const emit=value=>{if(!output.destroyed)output.write(JSON.stringify(value)+'\n');};
  const runner=await (createRunner?createRunner():new CapstoneRunner({stateDir:path.join(appRoot,'.capstone-local')})).init();
  const runtime=createRuntime?createRuntime():new OwnedRuntime();
  host=new DesktopController({runner,runtime,emit});host.publish({initial:true});
  const lines=readline.createInterface({input,crlfDelay:Infinity});
  let closing=false;
  const close=async()=>{if(closing)return;closing=true;lines.close();await host.quit();exit(0);};
  lines.on('line',line=>{
    if(closing)return;
    if(line.length>6000){emit({type:'reply',id:null,ok:false,error:'Command too large.'});return;}
    let message;try{message=JSON.parse(line);}catch{emit({type:'reply',id:null,ok:false,error:'Invalid desktop command.'});return;}
    const id=typeof message.id==='string'||Number.isInteger(message.id)?message.id:null;
    void (async()=>{
      try{const status=await host.command(message);emit({type:'reply',id,ok:true,status});if(message.command==='quit')await close();}
      catch(error){emit({type:'reply',id,ok:false,error:safeError(error),status:host.snapshot()});}
    })();
  });
  lines.once('close',()=>{void close();});
  input.once('error',()=>{void close();});
  const shutdown=()=>{void close();};
  process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
  return {host,close};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.env.CAPSTONE_DESKTOP_MANAGED!=='1'){
    process.stderr.write('Open the visible Capstone app using Open Demo 3.cmd. This helper cannot run separately.\n');process.exitCode=1;
  }else await runStdio().catch(()=>{process.stdout.write(JSON.stringify({type:'fatal',error:'The Capstone desktop controller could not start.'})+'\n');process.exitCode=1;});
}
