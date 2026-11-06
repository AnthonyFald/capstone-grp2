'use strict';

// Deterministic replay only. Saved responses are injected; no model may run.
// Separate artifact names prevent these results being published as fresh runs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {scoreCase,summarize}=require('./score.cjs');
const APP=path.resolve(__dirname,'../..'),WORKSPACE=path.dirname(APP);
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
function confined(file){const value=path.resolve(file),relative=path.relative(WORKSPACE,value);if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('Replay paths must stay inside Capstone.');return value;}
function adapterForReplay(records,getPhase,onConsumed=()=>{}){
 let cursor=0;
 const factory=options=>({chat:{completions:{create:async request=>{
  const prior=records[cursor];if(!prior)throw Error('Replay exhausted saved responses; real inference is forbidden.');
  if(prior.phase!==getPhase())throw Error('Replay phase differs from the saved response sequence.');
  if(typeof prior.content!=='string')throw Error('Saved model content is missing.');
  const index=cursor++;
  onConsumed({index,phase:prior.phase,contentSha256:hash(prior.content),originalRequestSha256:hash(JSON.stringify(prior.request)),candidateRequestSha256:hash(JSON.stringify(request)),savedResponseReused:true});
  options.record?.({request,content:prior.content,usage:{},doneReason:prior.doneReason||'stop',replayed:true});
  return {choices:[{message:{content:prior.content},finish_reason:prior.doneReason||'stop'}]};
 }}}});
 return {factory,assertComplete:()=>{if(cursor!==records.length)throw Error('Replay did not consume every saved response.');},get consumed(){return cursor;}};
}
function replayArtifact(response){return {result:response.result,audit:response.audit,trace:response.trace,engineVersion:response.engineVersion,sourceHashes:response.sourceHashes,inputSha256:response.inputSha256,documentHashes:response.documentHashes,replayOnly:true,freshModelGeneration:false,timingApplicable:false};}
function withoutTiming(score){const copy={...score};delete copy.totalMs;delete copy.totalWorkflowMs;return copy;}
function snapshot(Engine,enginePath,output){
 const files=new Set([enginePath,...Object.keys(Engine.sourceHashes||{}).map(name=>path.resolve(APP,name))]),hashes={};
 for(const file of files){const relative=path.relative(APP,file);if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Candidate source must remain in app.');const bytes=fs.readFileSync(file),destination=path.join(output,'source-snapshot',relative);hashes[relative.replaceAll('\\','/')]=hash(bytes);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,bytes,{flag:'wx'});}
 return hashes;
}
function verifySnapshot(hashes){for(const[name,digest]of Object.entries(hashes))if(hash(fs.readFileSync(path.join(APP,name)))!==digest)throw Error('Candidate source changed during replay: '+name);}
function changes(before,after){
 const old=new Map(before.items.map(i=>[i.id,i]));return after.items.flatMap(item=>{const prior=old.get(item.id);if(!prior)return[{itemId:item.id,addedItem:true}];const fields=[...new Set([...Object.keys(prior),...Object.keys(item)])];const changedFields=fields.filter(f=>JSON.stringify(prior[f])!==JSON.stringify(item[f]));return changedFields.length?[{itemId:item.id,changedFields,beforeAction:prior.action,afterAction:item.action}]:[];});
}
async function main(){
 let engineArgument,outputArgument;const sources=[];
 for(let i=2;i<process.argv.length;i++){const flag=process.argv[i];if(flag==='--replay-only')continue;const value=process.argv[++i];if(!value)throw Error('Missing value for '+flag);if(flag==='--engine')engineArgument=value;else if(flag==='--source-run')sources.push(value);else if(flag==='--output')outputArgument=value;else throw Error('Unknown replay option: '+flag);}
 if(!process.argv.includes('--replay-only')||!engineArgument||!outputArgument||!sources.length)throw Error('Provide --replay-only, --engine, explicit --source-run paths, and a new --output.');
 const enginePath=confined(engineArgument),output=confined(outputArgument);fs.mkdirSync(output,{recursive:true});if(fs.readdirSync(output).length)throw Error('Replay output directory must be empty.');
 // The production adapter and global fetch are disabled in this process even
 // if candidate code accidentally attempts to fall back to real inference.
 globalThis.fetch=async()=>{throw Error('Network access is forbidden during deterministic replay.');};
 require(path.join(APP,'demo-1/native-engine.cjs')).adapter=()=>{throw Error('Real model adapter is forbidden during deterministic replay.');};
 const Engine=require(enginePath),sourceHashes=snapshot(Engine,enginePath,output),records=[],outcomes=[];
 for(const argument of sources){
  const directory=confined(argument),manifest=read(path.join(directory,'manifest.json'));
  if(!manifest.completedAt||!['dev','holdout','closure-dev'].includes(manifest.split))throw Error('Only completed, explicitly consumed development source runs may be replayed; transfer is forbidden.');
  if(manifest.cases.length!==manifest.selectedCaseIds.length||manifest.cases.some(c=>!c.success))throw Error('Replay source must contain every selected successful raw result.');
  const split=manifest.split,inputName=split+'.inputs.json',inputs=read(path.join(__dirname,inputName));
  if(hash(fs.readFileSync(path.join(__dirname,inputName)))!==manifest.freeze?.sha256?.[inputName])throw Error('Source fixture hash differs from saved run.');
  for(const c of manifest.cases){
   verifySnapshot(sourceHashes);
   const input=inputs.cases.find(i=>i.id===c.id);if(!input)throw Error('Saved case not found in frozen inputs.');
   const resultPath=path.join(directory,c.id+'.json'),callsPath=path.join(directory,c.id+'.calls.jsonl'),original=read(resultPath),saved=fs.readFileSync(callsPath,'utf8').trim().split(/\r?\n/).map(JSON.parse);
   if(original.benchmarkInputSha256!==hash(JSON.stringify(input.payload)))throw Error('Original submitted input does not match fixture.');
   const key=path.basename(directory)+'--'+c.id;let phase='extract';const consumption=[];
   const replay=adapterForReplay(saved,()=>phase,event=>consumption.push(event));
   const provenance={key,caseId:c.id,split,sourceDirectory:directory,originalEngineVersion:manifest.engineVersion,originalResultSha256:hash(fs.readFileSync(resultPath)),savedCallsSha256:hash(fs.readFileSync(callsPath)),fixtureSha256:manifest.freeze.sha256[inputName],originalModelDigest:manifest.runtime?.model?.digest||null};
   try{
    const response=await Engine.generate(input.payload,{lessons:manifest.lessons||[],progress:event=>{if(['extract','plan','verify'].includes(event.phase))phase=event.phase;},adapterFactory:replay.factory});
    replay.assertComplete();verifySnapshot(sourceHashes);
    const artifact={...provenance,...replayArtifact(response),consumption,changes:changes(original.result,response.result)};write(path.join(output,key+'.replay.json'),artifact);
    outcomes.push({key,caseId:c.id,split,input,response:artifact,success:true,changes:artifact.changes});
   }catch(error){
    const artifact={...provenance,replayOnly:true,freshModelGeneration:false,timingApplicable:false,error:error.message,phase,consumption};write(path.join(output,key+'.replay-error.json'),artifact);outcomes.push({key,caseId:c.id,split,input,success:false,error:error.message});
   }
   records.push(provenance);
  }
 }
 const scored=outcomes.map(o=>{
  const reference=read(path.join(__dirname,o.split+'.references.json')).cases.find(c=>c.id===o.caseId);
  const score=scoreCase(o.input,reference,o.success?o.response:{result:{items:[],groups:[]}});
  return {...withoutTiming(score),id:o.key,sourceCaseId:o.caseId,split:o.split,replayOnly:true,...(!o.success?{error:o.error}:{})};
 });
 const summary=withoutTiming(summarize(scored));
 const audit={artifactType:'deterministic-saved-response-replay',createdAt:new Date().toISOString(),candidateEngineVersion:Engine.VERSION,candidateSourceHashes:sourceHashes,replayOnly:true,freshModelGeneration:false,modelCalls:0,timingApplicable:false,sourceRuns:sources.map(confined),cases:records,limitations:['Reuses saved V8 model responses; does not test how the candidate prompts change fresh model generation.','Evaluates deterministic validation/normalization effects on known development responses only.','Not a timing benchmark, speed comparison, untouched evaluation, or independent human validation.','Original raw responses, outputs, and scores are unchanged.']};
 write(path.join(output,'replay-manifest.json'),audit);write(path.join(output,'replay-score.json'),{replayOnly:true,freshModelGeneration:false,timingApplicable:false,cases:scored,summary});
 const lines=['DETERMINISTIC SAVED-RESPONSE REPLAY — NOT FRESH INFERENCE',`Candidate: ${Engine.VERSION}`,`Model calls: 0. Timing/speed: not applicable.`,`${summary.requirementsPassingAllLabeledChecks}/${summary.expectedRequirements} expected requirements pass known-case checks.`,...outcomes.map(o=>`${o.key}: ${o.success?'replayed':'ERROR '+o.error}${o.changes?.length?' | '+o.changes.map(c=>c.itemId+': '+c.beforeAction+' -> '+c.afterAction+' ['+c.changedFields.join(', ')+']').join('; '):''}`),'',...audit.limitations];
 fs.writeFileSync(path.join(output,'replay-report.txt'),lines.join('\n')+'\n',{flag:'wx'});
 console.log(JSON.stringify({replayOnly:true,freshModelGeneration:false,modelCalls:0,candidate:Engine.VERSION,requirementsPassed:summary.requirementsPassingAllLabeledChecks,requirements:summary.expectedRequirements,replayFailures:outcomes.filter(o=>!o.success).length,changes:outcomes.filter(o=>o.changes?.length).map(o=>({case:o.caseId,changes:o.changes}))}));
 if(outcomes.some(o=>!o.success)||summary.requirementsPassingAllLabeledChecks!==summary.expectedRequirements)process.exitCode=1;
}
module.exports={adapterForReplay,replayArtifact,withoutTiming};
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
