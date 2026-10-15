const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const core=require('../core.js'),download=require('../model-download.js');require('../data/scenarios.js');
function app(){
  const elements=new Map(),workers=[],timers=new Map();let nextTimer=0,clock=1;
  const element=id=>{if(!elements.has(id))elements.set(id,{value:id==='mode'?'ai':id==='scenario'?'repair':'',textContent:'',hidden:false,disabled:false,classList:{toggle(){}},setAttribute(){},removeAttribute(){}});return elements.get(id);};
  class Worker{constructor(){workers.push(this);this.messages=[];}postMessage(message){this.messages.push(message);}terminate(){this.terminated=true;}emit(data){this.onmessage({data});}}
  const context={document:{getElementById:element},MeetingCore:core,DEMO_SCENARIOS,ModelDownload:download,Worker,
    navigator:{gpu:{requestAdapter:async()=>({features:new Set(['shader-f16'])})}},window:{isSecureContext:true},location:{protocol:'http:'},
    console:{warn(){}},performance:{now:()=>clock},setTimeout(fn,ms){const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../app.js'),'utf8'),context);
  return {element,workers,timers,setTime(value){clock=value;},async generate(){await element('generate').onclick();},retry(){const entry=[...timers].find(([,v])=>v.ms<10000);assert.ok(entry);timers.delete(entry[0]);entry[1].fn();}};
}
test('Generate loads AI once and continues with the preserved transcript',async()=>{
  const a=app(),before=a.element('transcript').value;await a.generate();
  assert.equal(a.workers.length,1);assert.equal(a.workers[0].messages[0].type,'load');
  a.workers[0].emit({type:'ready'});assert.equal(a.workers[0].messages[1].type,'generate');
  assert.equal(a.element('transcript').value,before);assert.equal(a.element('generate').disabled,true);
});
test('interrupted model loads retry at most three times, preserve text, and remain retryable',async()=>{
  const a=app(),before=a.element('transcript').value;await a.generate();
  for(let i=0;i<3;i++){a.workers[i].emit({type:'error',phase:'load',retryable:true,message:'Failed to fetch'});if(i<2)a.retry();}
  assert.equal(a.workers.length,3);assert.equal(a.element('load-model').textContent,'Retry AI model download');
  assert.equal(a.element('generate').disabled,false);assert.equal(a.element('transcript').value,before);
  await a.generate();assert.equal(a.workers.length,4);a.workers[3].emit({type:'ready'});
  assert.equal(a.workers[3].messages[1].type,'generate');
});
test('cancel during recovery prevents stale workers or queued retries from generating notes',async()=>{
  const a=app();await a.generate();const stale=a.workers[0];
  stale.emit({type:'error',phase:'load',retryable:true,message:'Failed to fetch'});
  a.element('cancel').onclick();stale.emit({type:'ready'});
  assert.equal(a.timers.size,0);assert.equal(stale.messages.length,1);assert.equal(a.element('generate').disabled,false);
});
test('completion time includes automatic model loading but repeated generation measures a fresh run',async()=>{
  const a=app();a.setTime(1000);await a.generate();a.setTime(6000);a.workers[0].emit({type:'ready'});
  a.setTime(7000);a.workers[0].emit({type:'result',content:JSON.stringify({items:[]})});
  assert.match(a.element('elapsed').textContent,/Notes completed in 6.0s \(model setup: 5.0s; processing: 1.0s\)/);
  a.setTime(10000);await a.generate();a.setTime(12000);a.workers[0].emit({type:'result',content:JSON.stringify({items:[]})});
  assert.equal(a.element('elapsed').textContent,'Notes completed in 2.0s');
});
test('five-minute worker deadline includes the processing time of the applied recording',async()=>{
 const a=app();a.element('transcript').dataset={audioProcessingMs:'60000'};await a.generate();a.workers[0].emit({type:'ready'});
 assert.equal(a.workers[0].messages[1].budgetMs,240000);const timer=[...a.timers.values()].find(t=>t.ms===240000);assert.ok(timer);timer.fn();assert.equal(a.workers[0].terminated,true);assert.match(a.element('status').textContent,/five-minute/);
});
test('audio that already consumed the budget does not trigger a model download',async()=>{
 const a=app();a.element('transcript').dataset={audioProcessingMs:'300001'};await a.generate();assert.equal(a.workers.length,0);assert.match(a.element('status').textContent,/five-minute limit/);
});
