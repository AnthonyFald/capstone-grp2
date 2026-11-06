// Serial real-inference evaluation. References are saved for review, never sent
// to inference. Output directories must be new so failed trials stay preserved.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os'),{execFileSync}=require('node:child_process');
const Native=require('../native-engine.cjs');
const args=process.argv.slice(2),arg=(key,fallback)=>{const i=args.indexOf('--'+key);return i<0?fallback:args[i+1];};
const fixtures=path.resolve(arg('fixtures','demo-1/tests/fixtures/note-quality-v4-timing.json'));
const output=path.resolve(arg('output','desktop-build/note-evaluation/native-'+Date.now()));
const policy=arg('policy','baseline'),seed=Number(arg('seed','42')),snapshot=arg('snapshot',null),only=arg('case',null);
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
async function main(){
  if(!Native.POLICIES[policy]||!Number.isInteger(seed))throw Error('Invalid policy or seed.');
  const cases=JSON.parse(fs.readFileSync(fixtures,'utf8')).filter(c=>!only||c.id===only);if(!cases.length)throw Error('No evaluation cases selected.');
  if(cases.some(c=>!/^[-a-zA-Z0-9_]+$/.test(c.id))||new Set(cases.map(c=>c.id)).size!==cases.length)throw Error('Use unique safe case IDs.');
  if(fs.existsSync(output))throw Error('Choose a new output directory; previous attempts are immutable.');
  fs.mkdirSync(output,{recursive:true});
  const source=path.resolve(snapshot||path.join(__dirname,'..'));
  const frozen=path.join(output,'source');fs.mkdirSync(frozen);
  for(const name of ['note-engine.js','core.js','note-engine-27.js'])if(fs.existsSync(path.join(source,name)))fs.copyFileSync(path.join(source,name),path.join(frozen,name));
  const adapterSource=path.join(source,'native-engine.cjs');
  fs.copyFileSync(fs.existsSync(adapterSource)?adapterSource:path.join(__dirname,'../native-engine.cjs'),path.join(frozen,'native-engine.cjs'));
  const hashes=Object.fromEntries(fs.readdirSync(frozen).map(name=>[name,hash(fs.readFileSync(path.join(frozen,name)))]));
  const engine=require(path.join(frozen,policy==='quality'?'note-engine-27.js':'note-engine.js')),core=require(path.join(frozen,'core.js')),frozenNative=require(path.join(frozen,'native-engine.cjs'));
  const cancellation=new AbortController();
  const cancel=()=>cancellation.abort(new Error('Evaluation canceled.'));
  process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
  const report={createdAt:new Date().toISOString(),status:'running',model:frozenNative.MODEL,policy:frozenNative.POLICIES[policy],seed,pipeline:engine.VERSION,sourceHashes:hashes,fixtureSha256:hash(fs.readFileSync(fixtures)),platform:{os:os.release(),arch:os.arch(),memoryBytes:os.totalmem(),node:process.version,cpu:os.cpus()[0]?.model},scope:'Development rerun; no independent human scoring or RFI outcome measurement. References never enter inference.',cases:[]};
  const save=()=>fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2)+'\n');save();
  try{
    const tags=await fetch(Native.BASE+'/api/tags').then(r=>r.json());report.installedModel=tags.models.find(m=>m.name===Native.MODEL);if(!report.installedModel)throw Error('Install the local Qwen 3.5 27B model first.');
    report.runtime=await fetch(Native.BASE+'/api/version').then(r=>r.json());
    try{report.platform.gpu=execFileSync('nvidia-smi',['--query-gpu=name,memory.total,driver_version','--format=csv,noheader'],{encoding:'utf8'}).trim();}catch{}
    save();
    for(const c of cases){
      if(cancellation.signal.aborted)break;
      const record={id:c.id,inputSha256:hash(c.transcript),transcript:c.transcript,review:c.review||null,facts:c.facts||null,status:'running',startedAt:new Date().toISOString()};report.cases.push(record);save();
      console.log('START',c.id);
      try{
        const result=await frozenNative.generate(c.transcript,{policy,seed,engine,core,signal:cancellation.signal,progress:stage=>console.log(c.id,stage),record:call=>fs.appendFileSync(path.join(output,c.id+'-calls.ndjson'),JSON.stringify(call)+'\n')});
        Object.assign(record,result,{sourceHashes:hashes,status:'complete',completedAt:new Date().toISOString()});
        fs.writeFileSync(path.join(output,c.id+'-notes.txt'),core.exportPlainText({...result.result,...result,items:result.result.items,transcript:c.transcript,createdAt:record.completedAt},c.id));
        console.log('DONE',c.id,Math.round(result.totalMs/1000)+'s',result.result.items.length+' notes');
      }catch(error){Object.assign(record,{status:'failed',error:error.message,diagnostics:error.diagnostics});console.log('FAILED',c.id,error.message);}
      save();
    }
    report.status=cancellation.signal.aborted?'canceled':report.cases.length===cases.length&&report.cases.every(c=>c.status==='complete')?'complete':'failed';
  }catch(error){report.status='failed';report.error=error.message;throw error;}
  finally{process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);report.finishedAt=new Date().toISOString();save();}
  if(report.status!=='complete')process.exitCode=1;
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
