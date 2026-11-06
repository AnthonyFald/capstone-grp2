// Local-only integration replay of a saved real model output. This is not a new
// inference benchmark or independent validation. No cloud state is modified.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compactResult} from './runner.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const origin='http://127.0.0.1:4188',prefix='/api/capstone/v1';
const outputArg=process.argv[2];if(!outputArg)throw Error('Pass a saved DEV-01 model output file.');
const outputPath=path.resolve(outputArg);if(!outputPath.startsWith(root+path.sep))throw Error('Output must be inside the app workspace.');
const output=JSON.parse(await fs.readFile(outputPath,'utf8'));
const cases=JSON.parse(await fs.readFile(path.join(root,'demo-3/consolidation-bench/dev.inputs.json'),'utf8'));
const input=cases.cases.find(c=>c.id==='DEV-01');if(output.id!=='DEV-01'||output.result?.mode!=='consolidation')throw Error('Use a successful DEV-01 consolidation output.');
const owner=(await fs.readFile(path.join(root,'desktop-build/demo3/.private/owner-token'),'utf8')).trim();
async function api(route,{body,token=owner}={}){const res=await fetch(origin+prefix+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await res.json();if(!res.ok)throw Error(route+' '+res.status+': '+(data.error?.message||'failed'));return data;}
const before=(await api('/board')).board;if(before.version!==0||before.tasks.length||before.documents.length)throw Error('This replay requires the empty local board; do not overwrite other work.');
const queued=await api('/jobs',{body:{kind:'rfi',title:'Synthetic consolidation integration check — saved model output',dataClassification:'synthetic',cohort:'baseline',payload:{mode:'consolidation',documents:input.payload.documents},clientRequestId:crypto.randomUUID()}});
const code=await api('/runner/pair-codes',{body:{label:'Temporary local integration check'}});
const runner=await api('/runner/pair',{body:{code:code.code,runnerName:'Temporary local integration check'},token:null});
let claim;
try{
  claim=await api('/runner/claim',{body:{capabilities:['rfi']},token:runner.token});if(claim.job?.id!==queued.job.id)throw Error('A different local job was queued first; no model result was applied.');
  if(JSON.stringify(claim.job.board)!==JSON.stringify(input.payload.board))throw Error('The local board does not match the benchmark input.');
  const completed=await api('/runner/jobs/'+claim.job.id+'/complete',{body:{leaseToken:claim.leaseToken,completionId:crypto.randomUUID(),...compactResult({...output,engineVersion:output.engineVersion+'-integration-replay'},claim)},token:runner.token});
  const after=(await api('/board')).board;if(after.version!==0||after.tasks.length)throw Error('Model completion unexpectedly changed the board.');
  const evidence={verifiedAt:new Date().toISOString(),origin,jobId:claim.job.id,modelOutputFile:path.relative(root,outputPath),modelOutputGeneratedAt:output.completedAt,completed,boardUnchangedUntilHumanReview:true,requiresHumanDecision:true};
  await fs.writeFile(path.join(root,'desktop-build/demo3/consolidation-local-integration.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}catch(error){if(claim?.job?.id===queued.job.id)await api('/runner/jobs/'+claim.job.id+'/fail',{body:{leaseToken:claim.leaseToken,error:'Local integration replay stopped before completion.',retryable:false},token:runner.token}).catch(()=>{});throw error;}
