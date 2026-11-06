'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {summarize}=require('./score.cjs');
const {buildPublication,loadRun,comparison}=require('./publish-results.cjs');
const stamp='2026-11-03T01:00:00Z';
function fixture(t,{failed=false,unfinished=false,scoreMismatch=false,label='Example run',totalMs=2000,loadMs=200}={}){
 const tempRoot=path.resolve(os.tmpdir()),dir=fs.mkdtempSync(path.join(tempRoot,'capstone-publication-'));t.after(()=>{const target=path.resolve(dir);if(path.dirname(target)!==tempRoot||!path.basename(target).startsWith('capstone-publication-'))throw Error('Refusing cleanup outside this test directory.');fs.rmSync(target,{recursive:true,force:true});});
 const sourceHashes={'demo-3/engine/fake.cjs':'hash'};
 const caseScore={id:'CASE-1',expectedRequirements:1,items:[{matched:!failed,actionCorrect:!failed,targetCorrect:!failed,complete:!failed,passed:!failed}],grouping:[],separation:[],extraItems:[],passed:!failed,...(failed?{error:'Private source quoted in a failure message.'}:{})};
 const score={split:'dev',fixtureVersion:'fixture-1',cases:[caseScore],summary:summarize([caseScore])};if(scoreMismatch)score.summary.correctActionsAndTargets=9;
 const manifest={startedAt:stamp,completedAt:unfinished?null:'2026-11-03T01:01:00Z',label,engineVersion:'engine-1',split:'dev',fixtureVersion:'fixture-1',freeze:{sha256:{'dev.inputs.json':'input-hash'}},sourceHashes,runtime:{model:{name:'qwen3.5:27b',digest:'model-digest'},ollamaVersion:'0.40.8',hardware:{cpu:'CPU',systemMemoryBytes:100,gpus:[{name:'RTX 5080',driverVersion:'1',memoryMiB:16384}]}},lessonsSha256:'none',selectedCaseIds:['CASE-1'],cases:[{id:'CASE-1',success:!failed,totalMs}]};
 const write=(name,data)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(data));write('manifest.json',manifest);write('score.json',score);
 write('semantic-review.json',{status:'complete',reviewer:{type:'AI agent',independentHumanValidation:false},reviewedCaseIds:['CASE-1'],sourceRunEngineVersion:'engine-1',evaluationStatusAtGeneration:'Synthetic development'});
 if(failed)write('CASE-1.error.json',{id:'CASE-1',success:false,totalMs,error:'Private original document text.',diagnostics:{calls:[{usage:{load_duration_ns:loadMs*1e6}}]}});
 else write('CASE-1.json',{id:'CASE-1',engineVersion:'engine-1',result:{humanDecision:'pending',items:[{requirement:'PRIVATE ORIGINAL TASK TEXT'}]},inputSha256:'normalized',benchmarkInputSha256:'submitted',sourceHashes,totalMs,loadMs,elapsedMs:totalMs-loadMs,contextWindow:16384,sampling:{temperature:0.1},seed:42,reasoning:false,backend:'ollama'});
 return dir;
}
test('aggregate publication includes failed-attempt time without exposing private text',async t=>{
 const dir=fixture(t,{failed:true,totalMs:3500,loadMs:500});const built=await buildPublication([dir],{generatedAt:stamp});
 assert.equal(built.publicReport.runs[0].totalSeconds,3.5);assert.equal(built.publicReport.runs[0].checksPassed,0);assert.equal(built.publicReport.runs[0].checksTotal,1);
 const publicText=JSON.stringify(built.publicReport);assert.doesNotMatch(publicText,/Private|PRIVATE|capstone-publication-|sourceHashes|input-hash|model-digest/);assert.match(built.localReport,/All-attempt workflow: 3.5s/);
});
test('perfect requirement scores retain failed grouping and separation checks in public and local reports',async t=>{
 const dir=fixture(t),file=path.join(dir,'score.json'),score=JSON.parse(fs.readFileSync(file));
 score.cases[0].grouping=[{passed:true},{passed:false}];score.cases[0].separation=[{passed:true},{passed:false},{passed:true}];score.cases[0].passed=false;score.summary=summarize(score.cases);
 fs.writeFileSync(file,JSON.stringify(score));
 const built=await buildPublication([dir],{generatedAt:stamp});
 const run=built.publicReport.runs[0];assert.equal(run.checksPassed,1);assert.equal(run.checksTotal,1);
 assert.equal(run.fullyPassingCases,0);assert.equal(run.cases,1);
 assert.equal(run.groupingChecksPassed,1);assert.equal(run.groupingChecks,2);
 assert.equal(run.separationChecksPassed,2);assert.equal(run.separationChecks,3);
 assert.match(built.localReport,/Fully passing cases: 0\/1/);
 assert.match(built.localReport,/Grouping checks: 1\/2; separation checks: 2\/3\./);
 assert.ok(built.publicReport.limitations.some(line=>line.includes('full requirement score does not mean every grouping passed')));
});
test('unfinished runs cannot be published',t=>{assert.throws(()=>loadRun(fixture(t,{unfinished:true})),/not completed/);});
test('a stale or inconsistent aggregate score is rejected',t=>{assert.throws(()=>loadRun(fixture(t,{scoreMismatch:true})),/inconsistent/);});
test('paired timing separates recorded loading and compares matched successful cases',async t=>{
 const a=fixture(t,{label:'Baseline',totalMs:3000,loadMs:1000}),b=fixture(t,{label:'Candidate',totalMs:1500,loadMs:100});
 const built=await buildPublication([a,b],{generatedAt:stamp}),c=built.comparisons[0];assert.equal(c.comparable,true);assert.equal(c.baselineMs,3000);assert.equal(c.candidateMs,1500);assert.equal(c.baselineElapsedMs,2000);assert.equal(c.candidateElapsedMs,1400);
});
test('different model digest blocks a controlled timing comparison',t=>{
 const a=loadRun(fixture(t)),b=loadRun(fixture(t));b.manifest.runtime.model.digest='different';const c=comparison(a,b);assert.equal(c.comparable,false);assert.ok(c.reasons.includes('different model digest'));
});
test('successful output source provenance must match the frozen manifest',t=>{
 const dir=fixture(t),file=path.join(dir,'CASE-1.json'),data=JSON.parse(fs.readFileSync(file));data.sourceHashes['demo-3/engine/fake.cjs']='changed';fs.writeFileSync(file,JSON.stringify(data));assert.throws(()=>loadRun(dir),/source hash differs/);
});
test('bounded semantic limitations appear in public and local reports without private paths or credentials',async t=>{
 const dir=fixture(t),finding='One development item retained ambiguous information-request wording; human review remains required.';
 const built=await buildPublication([dir],{generatedAt:stamp,additionalLimitations:[finding]});
 assert.ok(built.publicReport.limitations.includes(finding));assert.ok(built.localReport.includes(finding));
 for(const value of ['C:\\Users\\private\\run.json','Bearer secret-value','capstone_owner_secret-value'])await assert.rejects(buildPublication([dir],{additionalLimitations:[value]}),/not a safe public label/);
 await assert.rejects(buildPublication([dir],{additionalLimitations:Array(5).fill(finding)}),/at most four/);
});
test('missing or partial semantic reviews cannot authorize publication',t=>{
 const dir=fixture(t),file=path.join(dir,'semantic-review.json');fs.unlinkSync(file);assert.throws(()=>loadRun(dir),/semantic review is required/);
 fs.writeFileSync(file,JSON.stringify({status:'complete',reviewer:{type:'AI agent',independentHumanValidation:false},reviewedCaseIds:[],sourceRunEngineVersion:'engine-1'}));assert.throws(()=>loadRun(dir),/exact completed run/);
});
test('former holdout used for tuning is labeled informed and cannot be presented as untouched',t=>{
 const dir=fixture(t),mp=path.join(dir,'manifest.json'),sp=path.join(dir,'score.json'),rp=path.join(dir,'semantic-review.json');
 const m=JSON.parse(fs.readFileSync(mp)),s=JSON.parse(fs.readFileSync(sp)),r=JSON.parse(fs.readFileSync(rp));m.split=s.split='holdout';m.label='informed-regression';m.freeze.sha256={'holdout.inputs.json':'input-hash'};r.evaluationStatusAtGeneration='Informed development after original holdout findings were used for tuning';
 fs.writeFileSync(mp,JSON.stringify(m));fs.writeFileSync(sp,JSON.stringify(s));fs.writeFileSync(rp,JSON.stringify(r));
 assert.equal(loadRun(dir).publicRun.phase,'Informed development (former holdout)');
 assert.throws(()=>loadRun({directory:dir,phase:'Untouched held-out evaluation'}),/cannot be labeled/);
 assert.throws(()=>loadRun({directory:dir,label:'Unseen evaluation',phase:'Informed development'}),/cannot be labeled/);
});
