// Apply new consolidation to retained candidates without rerunning source discovery.
// This is a matched-source quality check, never an end-to-end latency benchmark.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const C=require('../core.js'),N=require('../native-engine.cjs');
const args=process.argv.slice(2),arg=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const file=arg('--source',null),out=arg('--out',null),model=arg('--model','qwen3.5:27b');
const engineFile=path.resolve(arg('--engine-snapshot',path.join(__dirname,'../engine.js'))),E=require(engineFile);
const engineSha256=crypto.createHash('sha256').update(fs.readFileSync(engineFile)).digest('hex');
if(!file||!out)throw Error('Use --source retained-run.json --out new-consolidation.json.');
if(fs.existsSync(out))throw Error('Refusing to overwrite '+out);
const saved=JSON.parse(fs.readFileSync(file,'utf8')),prior=saved.runs?.at(-1)||saved,rows=C.reports(prior.reports);
const inputSha256=crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
if(!prior.items||inputSha256!==prior.inputSha256)throw Error('Retained candidate source hash mismatch.');
(async()=>{
  const begin=performance.now(),createdAt=new Date().toISOString();
  const tags=await fetch(N.BASE+'/api/tags').then(r=>r.json());
  const run={runId:crypto.randomUUID(),createdAt,pipeline:C.VERSION,backend:'ollama',profile:'native-thorough',thorough:true,model,modelDigest:tags.models.find(m=>m.name===model)?.digest||null,reasoning:false,seed:42,nativePolicy:N.POLICY,contextWindow:N.CONTEXT,datasetId:prior.datasetId,evaluationDatasetId:prior.evaluationDatasetId,inputSha256,reports:rows,sourceRunId:prior.runId,sourcePipeline:prior.pipeline,sourceFile:path.basename(file),sourceCandidateCount:prior.items.length,sourceOriginalFindings:prior.originalFindings,sourceMaterialityRemovals:prior.materialityRemovals||[],candidateSelection:'Previously accepted items; rejected candidates are not reintroduced.',analysisEngineSha256:engineSha256,analysisEngineSnapshot:engineFile===path.resolve(__dirname,'../engine.js')?null:path.basename(engineFile),timingMode:'postprocessing-only-not-end-to-end',elapsedMs:null,totalMs:null,loadMs:null};
  try{const result=await E.consolidateCandidates(N.adapter(model),prior.items,rows,C,{progress:console.log});Object.assign(run,result,{originalFindings:structuredClone(result.findings),newSegmentElapsedMs:performance.now()-begin});console.log(JSON.stringify({findings:run.findings.length,candidates:run.sourceCandidateCount,newSegmentSeconds:run.newSegmentElapsedMs/1000}));}
  catch(error){Object.assign(run,{status:'failed',error:error.message,diagnostics:error.diagnostics||null,newSegmentElapsedMs:performance.now()-begin});console.error(error.message);process.exitCode=1;}
  fs.writeFileSync(out,JSON.stringify({version:C.VERSION,note:'New local inference consolidates unchanged retained candidates. Source discovery is reused; original source/predictions remain retained. No end-to-end latency measurement.',runs:[run]},null,2)+'\n');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
