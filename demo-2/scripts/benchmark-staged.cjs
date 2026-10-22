// Verify and reuse unchanged source-discovery requests; run every changed stage locally.
// A staged quality observation never supplies an end-to-end latency measurement.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const C=require('../core.js'),N=require('../native-engine.cjs');
const args=process.argv.slice(2),arg=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const file=arg('--source',null),out=arg('--out',null),model=arg('--model','qwen3.5:27b');
const analysisSnapshot=path.resolve(arg('--analysis-snapshot',path.join(__dirname,'../engine.js'))),E=require(analysisSnapshot),freshLimit=arg('--fresh-limit',null);
if(freshLimit!==null&&(!Number.isInteger(Number(freshLimit))||Number(freshLimit)<1))throw Error('Use a positive --fresh-limit for an intentional unscored checkpoint.');
const snapshot=path.resolve(arg('--snapshot',path.join(__dirname,'../docs/input-history/engine-v18c-frozen.js'))),previous=require(snapshot);
if(!file||!out)throw Error('Use --source retained-full-run.json --out staged-review.json.');
const saved=JSON.parse(fs.readFileSync(file,'utf8')),source=saved.runs?.at(-1)||saved,rows=C.reports(source.reports);
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const inputSha256=sha(JSON.stringify(rows));
if(fs.existsSync(out))throw Error('Refusing to overwrite '+out);
const sourcePrompt=source.promptVersion||source.diagnostics?.promptVersion;
if(inputSha256!==source.inputSha256||sourcePrompt!==previous.PROMPT_VERSION)throw Error('Source prediction/input snapshot mismatch.');
if(source.model!==model||source.nativePolicy!==N.POLICY||source.seed!==42||source.reasoning!==false||source.contextWindow!==N.CONTEXT)throw Error('Retained discovery configuration differs from the requested model policy.');
const retained=source.responses||source.diagnostics?.responses||[],requestedCount=arg('--prefix-count',null);
const prefix=[];for(const response of retained){if(requestedCount!==null){if(prefix.length===Number(requestedCount))break;}else if(response.stage.startsWith('Organizing one shared list')||response.stage.includes('Checking final concern boundaries')||response.stage.includes('Auditing proposed routine removals'))break;prefix.push(response);}
if(requestedCount!==null&&(!Number.isInteger(Number(requestedCount))||Number(requestedCount)!==prefix.length))throw Error('Invalid retained request count.');
if(prefix.length<6)throw Error('The retained run must contain at least the six completed source-discovery stages.');
const engineSha256=sha(fs.readFileSync(analysisSnapshot));

async function capturePrefix(){
  let stage='',index=0;const hashes=[];
  const adapter={resetChat:async()=>{},chat:{completions:{create:async request=>{
    if(index===prefix.length)throw Error('SOURCE_PREFIX_COMPLETE');
    const response=prefix[index++];if(response.stage!==stage)throw Error('Old source-stage order mismatch.');
    hashes.push({stage,requestSha256:sha(JSON.stringify(request))});
    if(index===prefix.length)throw Error('SOURCE_PREFIX_COMPLETE');
    return {choices:[{message:{content:response.raw},finish_reason:'stop'}],usage:{retainedSourceResponse:true}};
  }}}};
  try{await previous.generate(adapter,rows,C,{thorough:true,progress:value=>stage=value});}
  catch(error){if(error.message!=='SOURCE_PREFIX_COMPLETE')throw error;}
  if(index!==prefix.length)throw Error('The retained source prefix was incomplete.');
  return hashes;
}

(async()=>{
  const verifiedHashes=await capturePrefix(),tags=await fetch(N.BASE+'/api/tags').then(r=>r.json());
  if(tags.models.find(m=>m.name===model)?.digest!==source.modelDigest)throw Error('The retained discovery model digest has changed.');
  let stage='',index=0,freshInferenceCalls=0;const native=N.adapter(model),replayStages=new Set(prefix.map(r=>r.stage));
  const adapter={resetChat:()=>native.resetChat(),chat:{completions:{create:async request=>{
    if(index<prefix.length){
      const expected=verifiedHashes[index],response=prefix[index];
      if(stage!==expected.stage||sha(JSON.stringify(request))!==expected.requestSha256)throw Error('Source request changed; replay refused at '+stage);
      index++;
      return {choices:[{message:{content:response.raw},finish_reason:'stop'}],usage:{retainedSourceResponse:true,sourceRunId:source.runId,requestSha256:expected.requestSha256}};
    }
    if(freshLimit!==null&&freshInferenceCalls===Number(freshLimit))throw Error('INTENTIONAL_INFERENCE_CHECKPOINT');
    freshInferenceCalls++;return native.chat.completions.create(request);
  }}}};
  const start=performance.now(),run={runId:crypto.randomUUID(),createdAt:new Date().toISOString(),pipeline:C.VERSION,backend:'ollama',profile:'native-thorough',thorough:true,model,modelDigest:tags.models.find(m=>m.name===model)?.digest||null,reasoning:false,seed:42,nativePolicy:N.POLICY,contextWindow:N.CONTEXT,datasetId:source.datasetId,evaluationDatasetId:source.evaluationDatasetId,inputSha256,reports:rows,sourceRunId:source.runId,sourcePipeline:source.pipeline,sourcePromptVersion:sourcePrompt,sourceStatus:source.status||'completed',sourceFile:path.basename(file),reusedStageCount:prefix.length,sourcePrefixRequestHashes:verifiedHashes,sourcePrefixEngineSha256:sha(fs.readFileSync(snapshot)),sourcePrefixEngineFile:path.basename(snapshot),analysisEngineSha256:engineSha256,sourcePrefixTimings:(source.timings||source.diagnostics?.timings||[]).filter(t=>replayStages.has(t.stage)),timingMode:'verified-prefix-replay-not-end-to-end',elapsedMs:null,totalMs:null,loadMs:null};
  try{
    const result=await E.generate(adapter,rows,C,{thorough:true,progress:value=>{stage=value;console.log((index<prefix.length?'Reusing verified source response · ':'New local inference · ')+value);}});
    if(index!==prefix.length)throw Error('Not every retained source request was verified.');
    Object.assign(run,result,{pipelineMethod:result.method,method:freshInferenceCalls?'staged-verified-prefix-replay':'verified-response-recovery',freshInferenceCalls,originalFindings:structuredClone(result.findings),newSegmentElapsedMs:performance.now()-start});
    if(!freshInferenceCalls)run.timingMode='deterministic-recovery-not-end-to-end';
    console.log(JSON.stringify({findings:result.findings.length,reusedSourceStages:index,newSegmentSeconds:run.newSegmentElapsedMs/1000,endToEndSeconds:null}));
  }catch(error){const checkpoint=error.message==='INTENTIONAL_INFERENCE_CHECKPOINT';Object.assign(run,{status:checkpoint?'checkpoint':'failed',method:checkpoint?'staged-inference-checkpoint':'staged-verified-prefix-replay-attempt',analysisEngineFile:path.basename(analysisSnapshot),freshInferenceCalls,verifiedReusedStageCount:index,error:checkpoint?null:error.message,stopReason:checkpoint?'Intentionally stopped before the next new request; no accepted final predictions or quality score.':undefined,diagnostics:error.diagnostics||null,newSegmentElapsedMs:performance.now()-start});console.error(checkpoint?'Saved unscored intermediate checkpoint.':error.message);if(!checkpoint)process.exitCode=1;}
  fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({version:C.VERSION,note:'Staged development quality check: '+prefix.length+' unchanged requests were verified by exact request hashes against the archived engine before reusing their retained responses. Fresh inference calls: '+freshInferenceCalls+'. Retained intermediate responses are not accepted quality predictions. Zero-call recovery changes only deterministic validation/normalization, retaining original raw responses and explicit repair traces. No end-to-end latency measurement.',runs:[run]},null,2)+'\n');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
