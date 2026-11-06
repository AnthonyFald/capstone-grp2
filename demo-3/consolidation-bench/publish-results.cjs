'use strict';

// Publish allowlisted aggregate measurements only. The data files, labels,
// generated item text, diagnostics, raw calls, and local paths stay private.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {summarize}=require('./score.cjs');
const APP=path.resolve(__dirname,'../..'),WORKSPACE=path.dirname(APP);
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const finite=(value,label)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw Error(label+' must be a nonnegative number.');return value;};
const count=(value,label)=>{finite(value,label);if(!Number.isInteger(value))throw Error(label+' must be an integer.');return value;};
const text=(value,label,max=160)=>{if(typeof value!=='string'||!value.trim()||value.length>max||/Bearer\s|capstone_(?:owner|runner)_|[A-Z]:[\\/]|\\Users\\|\.capstone-local/i.test(value))throw Error(label+' is not a safe public label.');return value;};
const sum=values=>values.reduce((a,b)=>a+b,0);
const median=values=>{if(!values.length)return null;const v=[...values].sort((a,b)=>a-b),i=Math.floor(v.length/2);return v.length%2?v[i]:(v[i-1]+v[i])/2;};
const seconds=ms=>Math.round(ms/100)/10;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const unique=values=>[...new Set(values)];
const safeTime=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const setting=r=>({contextWindow:r.contextWindow,sampling:r.sampling,seed:r.seed,reasoning:r.reasoning,backend:r.backend});

function loadRun(spec){
 const directory=path.resolve(typeof spec==='string'?spec:spec.directory),overrides=typeof spec==='string'?{}:spec;
 const manifest=read(path.join(directory,'manifest.json')),score=read(path.join(directory,'score.json'));
 if(!safeTime(manifest.startedAt)||!safeTime(manifest.completedAt)||Date.parse(manifest.completedAt)<Date.parse(manifest.startedAt))throw Error('Run has not completed: '+path.basename(directory));
 if(!Array.isArray(manifest.cases)||!manifest.cases.length||!Array.isArray(manifest.selectedCaseIds)||!Array.isArray(score.cases))throw Error('Run case lists are missing.');
 const ids=manifest.selectedCaseIds;
 if(unique(ids).length!==ids.length||manifest.cases.length!==ids.length||score.cases.length!==ids.length)throw Error('Run case lists are incomplete or duplicated.');
 if(!same([...ids].sort(),manifest.cases.map(c=>c.id).sort())||!same([...ids].sort(),score.cases.map(c=>c.id).sort()))throw Error('Manifest and score cases do not match.');
 const reviewPath=path.join(directory,'semantic-review.json');
 if(!fs.existsSync(reviewPath))throw Error('A completed AI-agent semantic review is required before publication.');
 const semanticReview=read(reviewPath);
 if(semanticReview.status!=='complete'||semanticReview.reviewer?.type!=='AI agent'||semanticReview.reviewer.independentHumanValidation!==false)throw Error('Semantic review must identify its completed AI-agent review; no independent human validation is established.');
 if(!Array.isArray(semanticReview.reviewedCaseIds)||!same([...ids].sort(),[...semanticReview.reviewedCaseIds].sort())||semanticReview.sourceRunEngineVersion!==manifest.engineVersion)throw Error('Semantic review does not cover this exact completed run.');
 if(score.split!==manifest.split||score.fixtureVersion!==manifest.fixtureVersion)throw Error('Manifest and score fixture identity do not match.');
 if(!manifest.freeze?.sha256||!manifest.sourceHashes||!Object.keys(manifest.sourceHashes).length)throw Error('Run is missing frozen input/source provenance.');
 if(!manifest.runtime?.model?.digest||!manifest.runtime?.ollamaVersion||!manifest.runtime?.hardware)throw Error('Run is missing model/runtime/hardware provenance.');
 const recomputed=summarize(score.cases);
 for(const field of ['cases','successfulRuns','fullyPassingCases','expectedRequirements','matchedRequirements','correctActionsAndTargets','requirementsPassingAllLabeledChecks','completeRetainedRequirements','incorrectDuplicateMerges','incorrectAlreadyAnswered','groupingChecksPassed','groupingChecks','separationChecksPassed','separationChecks']){
  count(score.summary?.[field],'Score '+field);if(score.summary[field]!==recomputed[field])throw Error('Score summary is inconsistent for '+field+'. Re-score the run first.');
 }
 const attempts=[],outputs=new Map();
 for(const c of manifest.cases){
  const scored=score.cases.find(s=>s.id===c.id);finite(c.totalMs,'Attempt time');
  if(typeof c.success!=='boolean'||c.success===Boolean(scored.error))throw Error('Manifest and score success state differs for '+c.id+'.');
  if(c.success){
   const result=read(path.join(directory,c.id+'.json'));
   if(result.id!==c.id||!result.result||!Array.isArray(result.result.items))throw Error('Successful result is incomplete for '+c.id+'.');
   finite(result.totalMs,'Result total time');finite(result.loadMs,'Result model load time');
   if(Math.abs(result.totalMs-c.totalMs)>1)throw Error('Result and manifest timing differs for '+c.id+'.');
   if(result.engineVersion!==manifest.engineVersion)throw Error('Run mixes engine versions.');
   if(result.result.humanDecision!=='pending')throw Error('Benchmark result claims a human decision.');
   if(!result.inputSha256||!result.sourceHashes)throw Error('Result is missing source/input hashes.');
   for(const [name,digest]of Object.entries(manifest.sourceHashes))if(result.sourceHashes[name]!==digest)throw Error('Result source hash differs from frozen manifest for '+name+'.');
   const elapsedMs=result.elapsedMs===undefined?Math.max(0,result.totalMs-result.loadMs):finite(result.elapsedMs,'Elapsed model workflow time');
   if(Math.abs(elapsedMs-Math.max(0,result.totalMs-result.loadMs))>1)throw Error('Load-adjusted time is inconsistent.');
   outputs.set(c.id,result);attempts.push({id:c.id,success:true,totalMs:result.totalMs,loadMs:result.loadMs,elapsedMs});
  }else{
   const failure=read(path.join(directory,c.id+'.error.json'));
   if(failure.id!==c.id||failure.success!==false||Math.abs(finite(failure.totalMs,'Failure time')-c.totalMs)>1)throw Error('Failure artifact does not match the manifest.');
   const calls=failure.diagnostics?.calls;
   const loadMs=Array.isArray(calls)?sum(calls.map(call=>Number.isFinite(call.usage?.load_duration_ns)?call.usage.load_duration_ns/1e6:0)):null;
   attempts.push({id:c.id,success:false,totalMs:c.totalMs,loadMs,elapsedMs:loadMs===null?null:Math.max(0,c.totalMs-loadMs)});
  }
 }
 if(attempts.filter(a=>a.success).length!==recomputed.successfulRuns)throw Error('Successful run totals do not match.');
 const runtime=manifest.runtime,model=text(runtime.model.name||runtime.model.model,'Model'),gpuNames=runtime.hardware.gpus?.map(g=>g.name).filter(Boolean)||[];
 const hardware=gpuNames.length?gpuNames.join(' + '):runtime.hardware.cpu||'GPU not recorded';
 const label=text(overrides.label||manifest.label||manifest.engineVersion,'Run label');
 const informedHoldout=manifest.split==='holdout'&&/informed|regression|used for tuning/i.test([manifest.label,semanticReview.evaluationStatusAtGeneration].filter(Boolean).join(' '));
 const phase=text(overrides.phase||(informedHoldout?'Informed development (former holdout)':manifest.split==='holdout'?'Held-out synthetic evaluation':manifest.split==='transfer'?'Additional synthetic transfer':manifest.split==='closure-dev'?'Development boundary check':'Synthetic development'),'Phase',80);
 if(informedHoldout&&[label,phase].some(value=>/untouched|unseen|held[- ]?out|holdout/i.test(value)&&!/informed|former|development|regression/i.test(value)))throw Error('An informed former-holdout run cannot be labeled as untouched evaluation.');
 const totalMs=sum(attempts.map(a=>a.totalMs)),knownLoadMs=sum(attempts.map(a=>a.loadMs||0)),failures=attempts.filter(a=>!a.success).length;
 const publicRun={label,phase,pipelineVersion:text(manifest.engineVersion,'Pipeline version',100),cases:ids.length,fullyPassingCases:recomputed.fullyPassingCases,groupingChecksPassed:recomputed.groupingChecksPassed,groupingChecks:recomputed.groupingChecks,separationChecksPassed:recomputed.separationChecksPassed,separationChecks:recomputed.separationChecks,checksPassed:recomputed.requirementsPassingAllLabeledChecks,checksTotal:recomputed.expectedRequirements,routeCorrect:recomputed.correctActionsAndTargets,routeTotal:recomputed.expectedRequirements,completeRequirements:recomputed.completeRetainedRequirements,requirements:recomputed.expectedRequirements,incorrectMerges:recomputed.incorrectDuplicateMerges,omittedRequirements:recomputed.omittedRequirements,incorrectAnsweredRequests:recomputed.incorrectAlreadyAnswered,medianSeconds:seconds(median(attempts.map(a=>a.totalMs))),totalSeconds:seconds(totalMs),note:`${recomputed.successfulRuns}/${ids.length} cases returned usable proposals; ${failures} failed. Requirement checks include failed cases in the denominator. Total and median workflow time include failed attempts. Recorded model loading: ${seconds(knownLoadMs)} seconds. Incorrect-merge/answer counts describe returned proposals. Unavailable requirements from failed runs are included in the omitted/unreturned count.`};
 return {directory,manifest,score,recomputed,attempts,outputs,publicRun,model,hardware:text(hardware,'Hardware',200),totalMs,knownLoadMs,semanticReview,scoreSha256:hash(path.join(directory,'score.json'))};
}

function comparison(left,right){
 const reasons=[];
 if(left.manifest.fixtureVersion!==right.manifest.fixtureVersion||left.manifest.split!==right.manifest.split)reasons.push('different scenario set');
 const inputName=left.manifest.split+'.inputs.json';if(left.manifest.freeze.sha256[inputName]!==right.manifest.freeze.sha256[inputName])reasons.push('different frozen inputs');
 if(left.manifest.runtime.model.digest!==right.manifest.runtime.model.digest)reasons.push('different model digest');
 if(left.manifest.runtime.ollamaVersion!==right.manifest.runtime.ollamaVersion)reasons.push('different model runtime');
 const hardware=r=>({cpu:r.manifest.runtime.hardware.cpu,systemMemoryBytes:r.manifest.runtime.hardware.systemMemoryBytes,gpus:r.manifest.runtime.hardware.gpus});
 if(!same(hardware(left),hardware(right)))reasons.push('different hardware/driver metadata');
 if(left.manifest.lessonsSha256!==right.manifest.lessonsSha256)reasons.push('different retained lesson set');
 const paired=left.attempts.filter(a=>a.success&&right.outputs.has(a.id)).map(a=>({id:a.id,left:a,right:right.attempts.find(b=>b.id===a.id)}));
 for(const p of paired){
  const a=left.outputs.get(p.id),b=right.outputs.get(p.id);
  if((a.benchmarkInputSha256||a.inputSha256)!==(b.benchmarkInputSha256||b.inputSha256)&&!reasons.includes('different submitted input'))reasons.push('different submitted input');
  if(!same(setting(a),setting(b))&&!reasons.includes('different model settings'))reasons.push('different model settings');
 }
 if(!paired.length)reasons.push('no matched successful cases');
 if(reasons.length)return {baseline:left.publicRun.label,candidate:right.publicRun.label,comparable:false,reasons};
 const baselineMs=sum(paired.map(p=>p.left.totalMs)),candidateMs=sum(paired.map(p=>p.right.totalMs)),baselineElapsedMs=sum(paired.map(p=>p.left.elapsedMs)),candidateElapsedMs=sum(paired.map(p=>p.right.elapsedMs));
 return {baseline:left.publicRun.label,candidate:right.publicRun.label,comparable:true,caseIds:paired.map(p=>p.id),baselineMs,candidateMs,baselineElapsedMs,candidateElapsedMs,workflowChangePercent:baselineMs?100*(candidateMs-baselineMs)/baselineMs:null,loadAdjustedChangePercent:baselineElapsedMs?100*(candidateElapsedMs-baselineElapsedMs)/baselineElapsedMs:null,baselineFailures:left.attempts.filter(a=>!a.success).length,candidateFailures:right.attempts.filter(a=>!a.success).length};
}

async function buildPublication(specs,{generatedAt=new Date().toISOString(),additionalLimitations=[]}={}){
 if(!Array.isArray(specs)||!specs.length||specs.length>12)throw Error('Provide 1–12 explicit completed runs.');
 if(!Array.isArray(additionalLimitations)||additionalLimitations.length>4)throw Error('Provide at most four additional public limitations.');
 additionalLimitations=additionalLimitations.map(line=>text(line,'Public limitation',1500));
 const runs=specs.map(loadRun);
 const models=unique(runs.map(r=>r.model)),hardware=unique(runs.map(r=>r.hardware));
 const aggregate={generatedAt,model:models.join(' / '),hardware:hardware.join(' / '),limitations:[
  'Synthetic scenarios with agent-authored labels. These are development/evaluation checks, not independently human-validated field results.',
  'Requirement-level action, target, retained-detail and exact-source checks are separate from whole-case, grouping and separation checks. A full requirement score does not mean every grouping passed. Software tests are not model-quality scores.',
  'Unanticipated unsupported assertions require semantic review; the automated benchmark does not fully score every possible factual error.',
  'These scenarios use supplied document text and frozen board snapshots. They do not measure scanned-document OCR accuracy or a multi-day field deployment.',
  'Failed runs remain in quality denominators and all-attempt timing. No incorrect merge observed in returned proposals does not establish a universal zero-error rate.',
  'Workflow times include model processing and recorded loading, but exclude human checking/correction. Cold/warm loading and incomplete runs affect direct speed comparisons.',
  'Comparing pipeline versions measures development changes. It does not by itself establish automatic learning or gains from retained reviewer lessons.',
  'Grouping cards is not a measured reduction in unnecessary RFIs. No matched human baseline, actual RFI-submission reduction, or human review-time improvement is established.',
  ...additionalLimitations
 ],runs:runs.map(r=>r.publicRun)};
 const {validateBenchmarkReport}=await import(pathToFileURL(path.join(APP,'demo-3/public/benchmark-model.mjs')).href);
 const publicReport=validateBenchmarkReport(aggregate);
 const comparisons=runs.slice(1).map(r=>comparison(runs[0],r));
 const lines=['DEMO 3 — CONSOLIDATION BENCHMARK RESULTS','Generated: '+generatedAt,'','MODEL: '+publicReport.model,'HARDWARE: '+publicReport.hardware,''];
 for(const run of runs){
  const r=run.publicRun;
  lines.push(r.label+' ['+r.pipelineVersion+'; '+r.phase+']',`  Requirements passing all labeled checks: ${r.checksPassed}/${r.checksTotal} (${r.checksTotal?(100*r.checksPassed/r.checksTotal).toFixed(1):'n/a'}%).`,`  Correct action and target: ${r.routeCorrect}/${r.routeTotal}. Retained detail complete: ${r.completeRequirements}/${r.requirements}.`,`  Fully passing cases: ${r.fullyPassingCases}/${r.cases}. Usable cases: ${run.recomputed.successfulRuns}/${r.cases}. Incorrect merges observed: ${r.incorrectMerges}. Incorrectly answered requests observed: ${r.incorrectAnsweredRequests}.`,`  All-attempt workflow: ${r.totalSeconds}s; median attempt: ${r.medianSeconds}s; recorded model loading: ${seconds(run.knownLoadMs)}s.`,`  Grouping checks: ${run.recomputed.groupingChecksPassed}/${run.recomputed.groupingChecks}; separation checks: ${run.recomputed.separationChecksPassed}/${run.recomputed.separationChecks}.`,'  Semantic review: completed by an AI agent, not independent human validation; consult the review artifact for findings.','  Source run: '+run.directory,'');
 }
 lines.push('MATCHED SUCCESSFUL-CASE TIMING (first listed run is the comparison baseline)');
 for(const c of comparisons){
  if(!c.comparable){lines.push('  '+c.baseline+' -> '+c.candidate+': no controlled timing comparison ('+c.reasons.join('; ')+').');continue;}
  lines.push(`  ${c.baseline} -> ${c.candidate}: ${c.caseIds.length} matched successful cases (${c.caseIds.join(', ')}).`,`    Including loading: ${seconds(c.baselineMs)}s -> ${seconds(c.candidateMs)}s (${c.workflowChangePercent>=0?'+':''}${c.workflowChangePercent.toFixed(1)}%).`,`    Excluding recorded model loading: ${seconds(c.baselineElapsedMs)}s -> ${seconds(c.candidateElapsedMs)}s (${c.loadAdjustedChangePercent>=0?'+':''}${c.loadAdjustedChangePercent.toFixed(1)}%).`,`    Failed cases: baseline ${c.baselineFailures}, candidate ${c.candidateFailures}; failures excluded from this paired comparison but included in each run's workload total.`);
 }
 lines.push('','LIMITATIONS',...publicReport.limitations.map(s=>'  - '+s),'','The public JSON contains only allowlisted aggregate measurements. Source documents, expected labels, item text, model calls, diagnostics, credentials and local run paths are excluded.');
 return {publicReport,localReport:lines.join('\n')+'\n',comparisons,privateProvenance:runs.map(r=>({directory:r.directory,scoreSha256:r.scoreSha256,sourceHashes:r.manifest.sourceHashes,modelDigest:r.manifest.runtime.model.digest}))};
}

function confined(destination){const resolved=path.resolve(destination),relative=path.relative(WORKSPACE,resolved);if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('Publication destinations must stay inside the Capstone workspace.');return resolved;}
async function main(){
 const specs=[],additionalLimitations=[];let output,report;
 for(let i=2;i<process.argv.length;i++){
  const flag=process.argv[i],value=process.argv[++i];if(!value)throw Error('Missing value for '+flag+'.');
  if(flag==='--run')specs.push({directory:value});
  else if(flag==='--label'||flag==='--phase'){if(!specs.length)throw Error(flag+' must follow its --run.');specs.at(-1)[flag.slice(2)]=value;}
  else if(flag==='--output')output=confined(value);
  else if(flag==='--report')report=confined(value);
  else if(flag==='--limitation')additionalLimitations.push(value);
  else throw Error('Unknown option: '+flag);
 }
 if(!output||!report)throw Error('Provide --run for each selected result, --output for public JSON, and --report for the private readable report.');
 const publicRoot=path.join(APP,'demo-3/public'),reportRelative=path.relative(publicRoot,report);
 if(!reportRelative.startsWith('..')&&!path.isAbsolute(reportRelative))throw Error('The readable report contains local provenance and must stay outside the public site folder.');
 const built=await buildPublication(specs,{additionalLimitations});
 fs.mkdirSync(path.dirname(output),{recursive:true});fs.mkdirSync(path.dirname(report),{recursive:true});
 fs.writeFileSync(output,JSON.stringify(built.publicReport,null,2)+'\n');fs.writeFileSync(report,built.localReport);
 console.log(JSON.stringify({publishedRuns:built.publicReport.runs.length,requirementChecks:built.publicReport.runs.map(r=>({label:r.label,passed:r.checksPassed,total:r.checksTotal})),publicAggregateOnly:true}));
}
module.exports={loadRun,comparison,buildPublication};
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
