import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {EventEmitter} from 'node:events';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {DesktopController,OwnedRuntime,runStdio} from './desktop-host.mjs';

function fixture({paired=true,startRuntime,pairRunner,stopRunner}={}){
  const calls={start:0,stop:0,pair:0,runtimeStart:0,runtimeStop:0};
  const runner={config:paired?{token:'capstone_runner_DO_NOT_OUTPUT_THIS_SECRET'}:null,running:false,busy:false,
    async init(){return this;},snapshot(){return {paired:!!this.config,running:this.running,busy:this.busy,stage:'Waiting for queued work',cloudUrl:'https://capstone-test.workers.dev',completed:0,token:'DO_NOT_OUTPUT_THIS_TOKEN',config:this.config};},
    start(){calls.start++;this.running=true;},async stop(){calls.stop++;this.running=false;await stopRunner?.();this.busy=false;},
    async pair(url,code){calls.pair++;if(pairRunner)await pairRunner(url,code);this.config={token:'capstone_runner_PRIVATE_PAIR_SECRET'};}}
  const runtime={active:false,onExit:()=>{},async start(signal){calls.runtimeStart++;if(startRuntime)await startRuntime(signal);this.active=true;},async stop(){calls.runtimeStop++;this.active=false;},snapshot(){return {modelRunning:this.active,companionRunning:this.active};}};
  const frames=[];const host=new DesktopController({runner,runtime,emit:frame=>frames.push(frame),statusIntervalMs:10000});
  return {host,runner,runtime,calls,frames};
}

test('opening a paired controller is Off with no model, polling, or token disclosure',async()=>{
  const {host,calls}=fixture();const status=host.publish();
  assert.equal(status.power,'off');assert.equal(status.running,false);assert.equal(status.modelRunning,false);assert.equal(status.paired,true);
  assert.deepEqual(calls,{start:0,stop:0,pair:0,runtimeStart:0,runtimeStop:0});
  assert.equal(JSON.stringify(status).includes('SECRET'),false);assert.equal(JSON.stringify(status).includes('TOKEN'),false);
});

test('explicit On starts owned runtime before polling; Off stops both and permits later explicit restart',async()=>{
  const {host,runner,runtime,calls}=fixture();
  await host.on();assert.equal(host.snapshot().power,'on');assert.equal(runner.running,true);assert.equal(runtime.active,true);
  await host.on();assert.equal(calls.runtimeStart,1);
  await host.off();assert.equal(host.snapshot().power,'off');assert.equal(runner.running,false);assert.equal(runtime.active,false);
  await host.on();assert.equal(calls.runtimeStart,2);await host.off();
});

test('unpaired On refuses before starting local model processes',async()=>{
  const {host,calls}=fixture({paired:false});await assert.rejects(host.on(),/pairing code/);assert.equal(calls.runtimeStart,0);assert.equal(calls.start,0);
});

test('an existing listener is never adopted or killed by the owned runtime',async()=>{
  let spawns=0,fetches=0;
  const runtime=new OwnedRuntime({portCheck:async()=>false,spawnImpl:()=>{spawns++;throw Error('Unexpected spawn');},fetchImpl:async()=>{fetches++;}});
  await assert.rejects(runtime.start(new AbortController().signal),/will not take it over/);
  await runtime.stop();assert.equal(spawns,0);assert.equal(fetches,0);
});

test('Off interrupts startup before the queue can begin and cleans partial owned runtime',async()=>{
  let entered;const starting=new Promise(resolve=>entered=resolve);
  const {host,calls}=fixture({startRuntime:signal=>new Promise((resolve,reject)=>{entered();signal.addEventListener('abort',()=>reject(signal.reason),{once:true});})});
  const on=host.on();await starting;const expected=assert.rejects(on,/turned Off/);await host.off();await expected;
  assert.equal(calls.start,0);assert.ok(calls.runtimeStop>=1);assert.equal(host.snapshot().power,'off');assert.equal(host.snapshot().modelRunning,false);
});

test('a startup failure returns Off only after its owned runtime is stopped',async()=>{
  const {host,calls}=fixture({startRuntime:async()=>{throw Error('Model unavailable');}});
  await assert.rejects(host.on(),/Model unavailable/);assert.equal(calls.runtimeStop,1);assert.equal(calls.start,0);assert.equal(host.snapshot().power,'off');assert.match(host.snapshot().lastError,/Model unavailable/);
});

test('pairing while Off is explicit and never starts a model or polling',async()=>{
  let release;const held=new Promise(resolve=>release=resolve);
  const {host,calls}=fixture({paired:false,pairRunner:()=>held});
  const pairing=host.pair('https://capstone-test.workers.dev','ONE_TIME_CODE');await assert.rejects(host.on(),/pairing to finish/);
  release();await pairing;assert.equal(host.snapshot().paired,true);assert.equal(host.snapshot().power,'off');assert.equal(calls.runtimeStart,0);assert.equal(calls.start,0);
});

test('pairing is rejected while On until the user turns it Off',async()=>{
  const {host,calls}=fixture();await host.on();await assert.rejects(host.pair('https://capstone-test.workers.dev','CODE'),/Turn Capstone Off/);assert.equal(calls.pair,0);await host.off();
});

test('unexpected owned process exit stops the whole session and reports Off',async()=>{
  const {host,runtime,runner}=fixture();await host.on();runtime.onExit('model');
  await host.stopping;assert.equal(host.snapshot().power,'off');assert.equal(runner.running,false);assert.equal(runtime.active,false);assert.match(host.snapshot().lastError,/model process stopped/);
});

test('closing the application stops an active session and cannot be followed by On',async()=>{
  const {host,runtime,runner}=fixture();await host.on();await host.quit();
  assert.equal(host.closed,true);assert.equal(runner.running,false);assert.equal(runtime.active,false);await assert.rejects(host.on(),/closing/);
});

test('stdin EOF shuts down without any automatic start or model spawn',async()=>{
  const {runner,runtime,calls}=fixture(),input=new PassThrough(),output=new PassThrough();let text='';output.on('data',chunk=>text+=chunk.toString());
  let finish;const exited=new Promise(resolve=>finish=resolve);
  const session=await runStdio({input,output,createRunner:()=>runner,createRuntime:()=>runtime,exit:finish});input.end();await exited;
  assert.equal(session.host.closed,true);assert.equal(session.host.power,'off');assert.equal(calls.start,0);assert.equal(calls.runtimeStart,0);assert.equal(text.includes('SECRET'),false);assert.equal(text.includes('TOKEN'),false);
  assert.equal(JSON.parse(text.split('\n')[0]).initial,true);
});

test('stdio commands correlate replies and never include pair credentials',async()=>{
  const {runner,runtime}=fixture({paired:false}),input=new PassThrough(),output=new PassThrough();let text='';output.on('data',chunk=>text+=chunk.toString());
  let finish;const exited=new Promise(resolve=>finish=resolve);const session=await runStdio({input,output,createRunner:()=>runner,createRuntime:()=>runtime,exit:finish});
  input.write(JSON.stringify({id:'request-1',command:'pair',url:'https://capstone-test.workers.dev',code:'ONE_TIME_SECRET_CODE'})+'\n');
  await new Promise(resolve=>setImmediate(resolve));
  const frames=text.trim().split('\n').map(line=>JSON.parse(line));const reply=frames.find(f=>f.id==='request-1');assert.equal(reply.ok,true);assert.equal(reply.status.power,'off');assert.equal(text.includes('SECRET'),false);
  await session.close();await exited;
});

test('Windows shutdown targets only a process tree recorded as owned',async()=>{
  const invocations=[],child=new EventEmitter();child.pid=4321;child.kill=()=>{};
  const owned={name:'model',child,exited:false};child.once('exit',()=>owned.exited=true);
  const runtime=new OwnedRuntime({platform:'win32',spawnImpl:(file,args)=>{
    invocations.push({file,args});const killer=new EventEmitter();queueMicrotask(()=>{child.emit('exit',0);killer.emit('exit',0);});return killer;
  }});
  runtime.children.set('model',owned);await runtime.stop();
  assert.equal(invocations.length,1);assert.match(invocations[0].file,/taskkill\.exe$/);assert.deepEqual(invocations[0].args,['/PID','4321','/T','/F']);assert.equal(runtime.children.size,0);
});

test('direct helper launch without the visible-app marker refuses before initialization',async()=>{
  const env={...process.env};delete env.CAPSTONE_DESKTOP_MANAGED;
  const result=await new Promise(resolve=>execFile(process.execPath,[fileURLToPath(new URL('./desktop-host.mjs',import.meta.url))],{env,windowsHide:true},(error,stdout,stderr)=>resolve({error,stdout,stderr})));
  assert.equal(result.error?.code,1);assert.equal(result.stdout,'');assert.match(result.stderr,/visible Capstone app/);
});
