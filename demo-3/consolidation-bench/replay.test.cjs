'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {adapterForReplay,replayArtifact,withoutTiming}=require('./replay.cjs');
test('replay injects verbatim saved content and never fabricates another response',async()=>{
 const records=[{phase:'extract',content:'{"items":[]}',request:{original:true},doneReason:'stop'}],consumed=[];
 const replay=adapterForReplay(records,()=> 'extract',e=>consumed.push(e)),adapter=replay.factory({});
 const response=await adapter.chat.completions.create({candidate:true});assert.equal(response.choices[0].message.content,records[0].content);replay.assertComplete();assert.equal(consumed.length,1);
 await assert.rejects(adapter.chat.completions.create({}),/exhausted/);
});
test('different phase or unconsumed saved responses fail the replay audit',async()=>{
 const replay=adapterForReplay([{phase:'plan',content:'{}',request:{}}],()=> 'extract');
 await assert.rejects(replay.factory({}).chat.completions.create({}),/phase differs/);assert.throws(()=>replay.assertComplete(),/every saved response/);
});
test('replay artifacts cannot carry model runtime measurements as fresh timing',()=>{
 const output=replayArtifact({result:{items:[]},engineVersion:'candidate',totalMs:400,loadMs:300,elapsedMs:100,model:'paid-provider',calls:[{usage:{}}]});
 assert.equal(output.replayOnly,true);assert.equal(output.freshModelGeneration,false);assert.equal(output.timingApplicable,false);assert.ok(!('totalMs' in output));assert.ok(!('model' in output));assert.ok(!('calls' in output));
 assert.deepEqual(withoutTiming({totalMs:9,totalWorkflowMs:10,correctActionsAndTargets:2}),{correctActionsAndTargets:2});
});
