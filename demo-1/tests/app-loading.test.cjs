const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const core=require('../core.js'),download=require('../model-download.js');require('../data/scenarios.js');
function app(){
  const elements=new Map(),workers=[],timers=new Map(),intervals=new Map();let nextTimer=0,clock=1;
  const element=id=>{if(!elements.has(id))elements.set(id,{value:id==='mode'?'ai':id==='scenario'?'repair':'',textContent:'',hidden:false,disabled:false,classList:{toggle(){}},setAttribute(){},removeAttribute(){}});return elements.get(id);};
  class Worker{constructor(){workers.push(this);this.messages=[];}postMessage(message){this.messages.push(message);}terminate(){this.terminated=true;}emit(data){this.onmessage({data});}}
  const context={document:{getElementById:element},MeetingCore:core,DEMO_SCENARIOS,ModelDownload:download,Worker,
    navigator:{gpu:{requestAdapter:async()=>({features:new Set(['shader-f16'])})}},window:{isSecureContext:true},location:{protocol:'http:'},
    console:{warn(){}},performance:{now:()=>clock},setTimeout(fn,ms){const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},setInterval(fn,ms){const id=++nextTimer;intervals.set(id,{fn,ms});return id;},clearInterval(id){intervals.delete(id);}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../app.js'),'utf8'),context);
  return {element,workers,timers,intervals,tick(){for(const {fn} of intervals.values())fn();},setTime(value){clock=value;},async generate(){await element('generate').onclick();},retry(){const entry=[...timers].find(([,v])=>v.ms<10000);assert.ok(entry);timers.delete(entry[0]);entry[1].fn();}};
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
test('generation continues beyond five minutes even after lengthy audio, with a live elapsed timer',async()=>{
 const a=app();a.element('transcript').dataset={audioProcessingMs:'600000'};await a.generate();
 assert.equal(a.element('generation-elapsed').hidden,true);
 a.setTime(1000);a.workers[0].emit({type:'ready'});
 assert.equal(a.workers[0].messages[1].type,'generate');assert.equal(a.workers[0].messages[1].budgetMs,undefined);
 assert.equal(a.timers.size,0);assert.equal(a.element('generation-elapsed').hidden,false);
 assert.equal(a.element('generation-elapsed').textContent,'Note generation elapsed: 0:00');
 a.setTime(661000);a.tick();assert.equal(a.element('generation-elapsed').textContent,'Note generation elapsed: 11:00');
 a.workers[0].emit({type:'generation-progress',text:'Writing notes…'});
 assert.equal(a.workers[0].terminated,undefined);assert.equal(a.element('generate').disabled,true);
 assert.equal(a.element('generation-elapsed').textContent,'Note generation elapsed: 11:00');
});
test('manual cancellation stops the elapsed timer and ignores late results',async()=>{
 const a=app();await a.generate();a.workers[0].emit({type:'ready'});a.setTime(310001);a.tick();
 a.element('cancel').onclick();assert.equal(a.intervals.size,0);assert.equal(a.workers[0].terminated,true);
 const elapsed=a.element('generation-elapsed').textContent;a.setTime(400001);a.tick();
 a.workers[0].emit({type:'result',content:JSON.stringify({items:[]})});
 assert.equal(a.element('generation-elapsed').textContent,elapsed);assert.match(a.element('status').textContent,/canceled/);
});
test('completion and failure stop the clock, and a new run starts from zero',async()=>{
 const a=app();await a.generate();a.workers[0].emit({type:'ready'});a.setTime(700001);
 a.workers[0].emit({type:'result',content:JSON.stringify({items:[]})});assert.equal(a.intervals.size,0);
 assert.equal(a.element('generation-elapsed').textContent,'Note generation elapsed: 11:40');
 a.setTime(800001);await a.generate();assert.equal(a.element('generation-elapsed').textContent,'Note generation elapsed: 0:00');
 a.setTime(803001);a.workers[0].emit({type:'error',phase:'generate',message:'GPU error'});
 assert.equal(a.intervals.size,0);assert.equal(a.element('generation-elapsed').textContent,'Note generation elapsed: 0:03');
});
