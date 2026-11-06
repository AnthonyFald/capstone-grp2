'use strict';

// Explicit, local-only benchmark. Original outputs and raw model calls are
// retained. No service is started here; the user/root owns runtime lifetime.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const os=require('node:os'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const {scoreCase,summarize}=require('./score.cjs');
const DIR=__dirname,APP=path.resolve(DIR,'../..'),WORKSPACE=path.dirname(APP);
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const arg=(name,fallback)=>{const at=process.argv.indexOf(name);return at<0?fallback:process.argv[at+1];};
const read=name=>JSON.parse(fs.readFileSync(path.join(DIR,name),'utf8'));
const save=(filename,value,options={})=>fs.writeFileSync(filename,JSON.stringify(value,null,2)+'\n',options);
function verifyFreeze(split){const freeze=read(['transfer','closure-dev'].includes(split)?split+'.freeze.json':'freeze.json');for(const [name,expected]of Object.entries(freeze.sha256)){if(hash(fs.readFileSync(path.join(DIR,name)))!==expected)throw Error('Frozen fixture changed: '+name);}return freeze;}
function withinWorkspace(destination){const relative=path.relative(WORKSPACE,destination);if(relative.startsWith('..')||path.isAbsolute(relative)||!relative)throw Error('Output must be inside the Capstone workspace.');}
function snapshotSources(Engine,enginePath,output){
 const files=new Set([enginePath]);
 for(const name of Object.keys(Engine.sourceHashes||{})){
  const file=path.resolve(APP,name),relative=path.relative(APP,file);
  if(!relative.startsWith('..')&&!path.isAbsolute(relative)&&fs.existsSync(file)&&fs.statSync(file).isFile())files.add(file);
 }
 const hashes={};
 for(const file of files){const relative=path.relative(APP,file);if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Engine source must remain in the app.');const dest=path.join(output,'source',relative);fs.mkdirSync(path.dirname(dest),{recursive:true});const data=fs.readFileSync(file);fs.writeFileSync(dest,data,{flag:'wx'});hashes[relative.replaceAll('\\','/')]=hash(data);}
 return hashes;
}
function verifySources(hashes){for(const[name,expected]of Object.entries(hashes))if(hash(fs.readFileSync(path.join(APP,name)))!==expected)throw Error('Engine source changed during benchmark: '+name);}
async function runtimeProvenance(){
 const readLocal=async route=>{const r=await fetch('http://127.0.0.1:11435'+route,{signal:AbortSignal.timeout(5000),redirect:'error'});if(!r.ok)throw Error('Local runtime metadata request failed ('+r.status+').');return r.json();};
 const [version,tags]=await Promise.all([readLocal('/api/version'),readLocal('/api/tags')]);
 const model=(tags.models||[]).find(m=>m.name==='qwen3.5:27b'||m.model==='qwen3.5:27b');
 if(!model)throw Error('The required local qwen3.5:27b model is unavailable.');
 const provenance={collectedAt:new Date().toISOString(),ollamaVersion:version.version,model:{name:model.name,model:model.model,digest:model.digest,size:model.size,details:model.details},hardware:{platform:process.platform,architecture:process.arch,cpu:os.cpus()[0]?.model||null,systemMemoryBytes:os.totalmem(),gpus:[],gpuQueryError:null},nodeVersion:process.version};
 try{
  const {stdout}=await promisify(execFile)('nvidia-smi',['--query-gpu=name,driver_version,memory.total','--format=csv,noheader,nounits'],{windowsHide:true,timeout:5000,maxBuffer:65536});
  provenance.hardware.gpus=stdout.trim().split(/\r?\n/).filter(Boolean).map(line=>{const [name,driverVersion,memoryMiB]=line.split(',').map(v=>v.trim());return {name,driverVersion,memoryMiB:Number(memoryMiB)};});
 }catch(error){provenance.hardware.gpuQueryError=error.code||'GPU metadata unavailable';}
 return provenance;
}
async function main(){
 const split=arg('--split','dev');if(!['dev','holdout','transfer','closure-dev'].includes(split))throw Error('--split must be dev, holdout, transfer, or closure-dev.');
 const outputArgument=arg('--output');if(!outputArgument)throw Error('Provide a new --output directory. Existing run manifests are never overwritten.');
 const output=path.resolve(outputArgument);withinWorkspace(output);
 const freeze=verifyFreeze(split),inputs=read(split+'.inputs.json');
 const selection=arg('--cases')?.split(',');if(selection?.some(id=>!inputs.cases.some(c=>c.id===id)))throw Error('Unknown case ID.');
 const cases=selection?inputs.cases.filter(c=>selection.includes(c.id)):inputs.cases;
 if(!cases.length)throw Error('No selected cases.');
 const scoringOnly=process.argv.includes('--score-only');
 if(scoringOnly){
  const references=read(split+'.references.json');
  const scored=cases.map(input=>{const file=path.join(output,input.id+'.json');if(!fs.existsSync(file))return failure(input,references.cases.find(r=>r.id===input.id),'No successful result file.');return scoreCase(input,references.cases.find(r=>r.id===input.id),JSON.parse(fs.readFileSync(file,'utf8')));});
  const report={scoredAt:new Date().toISOString(),split,fixtureVersion:inputs.version,synthetic:true,independentHumanValidation:false,cases:scored,summary:summarize(scored)};save(path.join(output,'score.json'),report);console.log(JSON.stringify(report.summary));return;
 }
 if(!process.argv.includes('--run-local'))throw Error('Inference is opt-in: pass --run-local. This script does not start a model service.');
 const enginePath=path.resolve(arg('--engine',path.join(APP,'demo-3/engine/consolidation-engine.cjs')));withinWorkspace(enginePath);
 const Engine=require(enginePath);if(typeof Engine.generate!=='function')throw Error('Engine must export generate(payload, options).');
 fs.mkdirSync(output,{recursive:true});
 if(fs.readdirSync(output).length)throw Error('Output directory must be empty; previous artifacts are never mixed into a new run.');
 const manifestPath=path.join(output,'manifest.json');
 if(fs.existsSync(manifestPath))throw Error('Run already exists; choose a new output directory.');
 const sourceHashes=snapshotSources(Engine,enginePath,output);
 const runtime=await runtimeProvenance();
 const lessonsFile=arg('--lessons');const lessons=lessonsFile?JSON.parse(fs.readFileSync(path.resolve(lessonsFile),'utf8')):[];
 if(!Array.isArray(lessons))throw Error('--lessons must contain a JSON array.');
 const manifest={startedAt:new Date().toISOString(),label:arg('--label','unlabeled'),engineVersion:Engine.VERSION||null,split,fixtureVersion:inputs.version,freeze,synthetic:true,independentHumanValidation:false,selectedCaseIds:cases.map(c=>c.id),sourceHashes,runtime,lessons,lessonsSha256:hash(JSON.stringify(lessons)),cases:[]};
 save(manifestPath,manifest,{flag:'wx'});
 for(const input of cases){
  verifySources(sourceHashes);const startedAt=new Date().toISOString(),started=performance.now();
  console.log(JSON.stringify({event:'started',id:input.id,split,startedAt}));
  const callsFile=path.join(output,input.id+'.calls.jsonl');
  try{
   const response=await Engine.generate(input.payload,{lessons,progress:event=>console.log(JSON.stringify({id:input.id,...event})),record:event=>fs.appendFileSync(callsFile,JSON.stringify(event)+'\n')});
   verifySources(sourceHashes);const ended=performance.now();
   const run={id:input.id,startedAt,completedAt:new Date().toISOString(),benchmarkWallMs:ended-started,benchmarkInputSha256:hash(JSON.stringify(input.payload)),...response};
   save(path.join(output,input.id+'.json'),run,{flag:'wx'});
   manifest.cases.push({id:input.id,success:true,totalMs:response.totalMs??ended-started,inputSha256:response.inputSha256||run.benchmarkInputSha256,model:response.model,modelDigest:response.modelDigest});
   console.log(JSON.stringify({event:'completed',...manifest.cases.at(-1)}));
  }catch(error){
   const failed={id:input.id,success:false,error:error.message,totalMs:performance.now()-started,diagnostics:error.diagnostics};save(path.join(output,input.id+'.error.json'),failed,{flag:'wx'});manifest.cases.push({id:failed.id,success:false,error:failed.error,totalMs:failed.totalMs});console.log(JSON.stringify({event:'failed',id:input.id,error:error.message,totalMs:failed.totalMs}));
  }
  save(manifestPath,manifest);
 }
 // Reference labels are opened only after all selected generation calls finish.
 const references=read(split+'.references.json');
 const scored=cases.map(input=>{const outcome=manifest.cases.find(c=>c.id===input.id),reference=references.cases.find(r=>r.id===input.id);return outcome.success?scoreCase(input,reference,JSON.parse(fs.readFileSync(path.join(output,input.id+'.json'),'utf8'))):failure(input,reference,outcome.error);});
 const report={scoredAt:new Date().toISOString(),split,fixtureVersion:inputs.version,synthetic:true,independentHumanValidation:false,cases:scored,summary:summarize(scored)};
 manifest.completedAt=new Date().toISOString();save(manifestPath,manifest);save(path.join(output,'score.json'),report,{flag:'wx'});console.log(JSON.stringify({event:'scored',...report.summary}));
 if(manifest.cases.some(c=>!c.success))process.exitCode=1;
}
function failure(input,reference,error){return {id:input.id,error,passed:false,expectedRequirements:reference.items.length,items:reference.items.map(r=>({id:r.id,matched:false,omitted:true,actionCorrect:false,targetCorrect:false,complete:false,passed:false})),grouping:(reference.groupSets||[]).map(items=>({items,passed:false,observedParents:[]})),separation:(reference.differentTasks||[]).map(items=>({items,passed:false,observed:[]})),extraItems:[],totalMs:null};}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
