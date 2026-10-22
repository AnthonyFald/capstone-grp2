const os=require('node:os'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
(async()=>{
 let gpu;try{gpu=execFileSync('nvidia-smi',['--query-gpu=name,memory.total,driver_version','--format=csv,noheader,nounits'],{encoding:'utf8',windowsHide:true}).trim();}catch{gpu='NVIDIA details unavailable';}
 const runtime=await fetch('http://127.0.0.1:11435/api/version').then(r=>r.json());
 const models=await fetch('http://127.0.0.1:11435/api/tags').then(r=>r.json());
 const environment={collectedAt:new Date().toISOString(),platform:os.platform(),osRelease:os.release(),architecture:os.arch(),cpu:os.cpus()[0].model,logicalProcessors:os.cpus().length,totalSystemMemoryBytes:os.totalmem(),gpu,ollama:runtime.version,node:process.version,webllm:'0.2.85',models:models.models.map(({name,digest,size,details})=>({name,digest,size,details})),privacy:'No hostname, username, machine serial number or environment secrets collected.',macTesting:'Not performed; runtime compatibility only.'};
 fs.writeFileSync(path.join(__dirname,'../docs/environment.json'),JSON.stringify(environment,null,2)+'\n');console.log('Environment and model digests recorded.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
