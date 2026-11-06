// Local integration only. Processes one explicitly synthetic queued RFI; never calls Cloudflare.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CapstoneRunner,API} from './runner.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const privateDir=path.join(root,'desktop-build/demo3/.private');
const owner=(await readFile(path.join(privateDir,'owner-token'),'utf8')).trim();
const base='http://127.0.0.1:4188';
async function api(route,body){const r=await fetch(base+API+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+owner,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw Error(data.error?.message||String(r.status));return data;}
const all=await api('/jobs');const pending=all.jobs.filter(j=>j.status==='queued');
if(pending.length!==1||pending[0].dataClassification!=='synthetic')throw Error('This check requires exactly one synthetic local queued question.');
const paired=await api('/runner/pair-codes',{label:'Local workflow verification PC'});
const runner=await new CapstoneRunner({stateDir:path.join(privateDir,'integration-runner'),allowLocal:true}).init();
await runner.pair(base,paired.code);
const claim=await runner.request('/runner/claim',{capabilities:['rfi']});
if(claim.job?.id!==pending[0].id)throw Error('The expected synthetic question was not claimed.');
await runner.process(claim);
const detail=await api('/jobs/'+pending[0].id);
if(detail.job.status!=='completed')throw Error('The local workflow did not finish: '+runner.snapshot().lastError);
const summary={verifiedAt:new Date().toISOString(),jobId:detail.job.id,status:detail.job.status,title:detail.job.title,result:detail.job.result,provenance:detail.job.provenance,timings:detail.job.timings,humanReviews:detail.reviews.length,notice:'Synthetic local end-to-end integration check. No human quality score or real RFI reduction measured.'};
await mkdir(path.join(root,'desktop-build/demo3'),{recursive:true});
await writeFile(path.join(root,'desktop-build/demo3/local-workflow-check.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify({status:summary.status,outcome:summary.result.outcome,humanDecision:summary.result.humanDecision,engineVersion:summary.provenance.engineVersion,totalMs:summary.timings.totalMs}));
