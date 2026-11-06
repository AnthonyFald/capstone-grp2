// Explicit synthetic acceptance checks against the existing, isolated Capstone
// deployment. No inference helper is started and no proposal is auto-approved.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const origin='https://capstone-team2-demo3.capstone-info-492-team-2.workers.dev';
const directory=path.join(root,'desktop-build/demo3/live-consolidation-check');
const token=(await fs.readFile(path.join(root,'.capstone-local/cloud-owner-token'),'utf8')).trim();
async function api(route,body){const response=await fetch(origin+'/api/capstone/v1'+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(20000)});const value=await response.json();if(!response.ok)throw Error(route+': '+response.status+' '+(value.error?.message||'Request failed'));return value;}
const document=(id,title,text)=>({id,title:'Fictional demo — '+title,kind:'request',revision:'1',issuedAt:'2026-11-02',approval:'informal',current:true,text});
const initial=[
 document('SYN-DEMO3-W4-A','Duct clearance request','For coordination package WEST-L2 at Level 2 west corridor, grid W4, confirm the required clearance between the supply duct and ceiling beam. Drawing M-201 revision 2 does not specify the clearance. A response is needed by November 10, 2026.'),
 document('SYN-DEMO3-W4-B','Repeated duct clearance question','Under coordination package WEST-L2 at Level 2 west corridor grid W4, what duct-to-ceiling-beam clearance is required? This is the same clearance missing from M-201 revision 2. Please respond by November 10, 2026.'),
 document('SYN-DEMO3-W4-C','Separate firestop requirement','For coordination package WEST-L2 at the same Level 2 west corridor grid W4 penetration, identify the approved firestop assembly. This requires a firestop answer separate from the duct-to-beam clearance answer. No approved assembly is included in these requests.')
];
const followup=[
 document('SYN-DEMO3-W4-D','Clearance follow-up and deadline','Following up on coordination package WEST-L2 at Level 2 west corridor grid W4: confirm the duct-to-ceiling-beam clearance missing from M-201 revision 2. The installation team now needs the response by November 9, 2026. This follow-up adds no clearance answer.'),
 document('SYN-DEMO3-W4-E','New access-panel requirement','Also under coordination package WEST-L2 at Level 2 west corridor grid W4, confirm the minimum access-panel dimensions needed for damper maintenance. This is a distinct access requirement; it is not the duct clearance or firestop assembly question.')
];
const mode=process.argv[2];
if(!['initial','followup','inspect'].includes(mode))throw Error('Use initial, followup or inspect. Mutations also require --execute.');
await fs.mkdir(directory,{recursive:true});
if(mode==='inspect'){
 const board=(await api('/board')).board;
 const records=[];for(const name of ['initial','followup']){let saved;try{saved=JSON.parse(await fs.readFile(path.join(directory,name+'-submission.json'),'utf8'));}catch(error){if(error.code==='ENOENT')continue;throw error;}const current=await api('/jobs/'+saved.jobId);await fs.writeFile(path.join(directory,name+'-observed.json'),JSON.stringify(current,null,2));const job=current.job;records.push({name,id:job.id,status:job.status,error:job.error,engineVersion:job.result?.version||job.provenance?.engineVersion,items:job.result?.items?.map(({id,title,action,targetTaskId,duplicateOfItemId,groupId,requirement,reason})=>({id,title,action,targetTaskId,duplicateOfItemId,groupId,requirement,reason}))});}
 const evidence={observedAt:new Date().toISOString(),origin,synthetic:true,independentHumanValidation:false,board,records};await fs.writeFile(path.join(directory,'latest.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({observedAt:evidence.observedAt,boardVersion:board.version,tasks:board.tasks.filter(t=>t.type==='task').length,groups:board.tasks.filter(t=>t.type==='group').length,documents:board.documents.length,records}));
}else{
 if(!process.argv.includes('--execute'))throw Error('Add --execute to queue the clearly labeled synthetic acceptance batch.');
 const board=(await api('/board')).board;
 if(mode==='initial'&&(board.version!==0||board.tasks.length||board.documents.length))throw Error('The initial check requires an empty board. Existing work is never replaced.');
 if(mode==='followup'&&!initial.every(d=>board.documents.some(s=>s.id===d.id)))throw Error('First review and apply the initial synthetic batch.');
 const destination=path.join(directory,mode+'-submission.json');
 try{await fs.access(destination);throw Error('This acceptance batch was already submitted. Inspect the saved job instead.');}catch(error){if(error.code!=='ENOENT')throw error;}
 const payload={kind:'rfi',title:mode==='initial'?'Fictional demo: consolidate the first W4 requests':'Fictional demo: match new requests to existing W4 work',cohort:'baseline',dataClassification:'synthetic',payload:{mode:'consolidation',documents:mode==='initial'?initial:followup},clientRequestId:'synthetic-consolidation-acceptance-'+mode+'-20261102'};
 const result=await api('/jobs',payload);const evidence={submittedAt:new Date().toISOString(),origin,jobId:result.job.id,payload,boardBefore:board,synthetic:true,notABenchmark:true};await fs.writeFile(destination,JSON.stringify(evidence,null,2),{flag:'wx'});console.log(JSON.stringify({jobId:result.job.id,status:result.job.status,mode,synthetic:true,requiresHumanReview:true}));
}
