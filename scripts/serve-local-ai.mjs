import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {handleRequest as staticRequest} from './serve.mjs';
const require=createRequire(import.meta.url),Native=require('../demo-2/native-engine.cjs'),Core=require('../demo-2/core.js');
const token=crypto.randomBytes(24).toString('hex');
const origins=new Set(['https://anthonyfald.github.io','http://127.0.0.1:4177','http://localhost:4177']);
let active=false;
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
export function allowedOrigin(origin){return !origin||origins.has(origin);}
export async function handleRequest(req,res){
  if(!['127.0.0.1:4177','localhost:4177'].includes(req.headers.host))return json(res,403,{error:'Invalid host.'});
  if(!req.url.startsWith('/api/local/'))return staticRequest(req,res);
  const origin=req.headers.origin;
  if(!allowedOrigin(origin))return json(res,403,{error:'This origin is not allowed.'});
  if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
  if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, X-Evergreen-Token');res.setHeader('Access-Control-Allow-Private-Network','true');res.writeHead(204);res.end();return;}
  if(req.url==='/api/local/config'&&req.method==='GET'){
    try{const response=await fetch(Native.BASE+'/api/tags',{signal:AbortSignal.timeout(3000)});if(!response.ok)throw Error();const data=await response.json();const models=data.models.filter(m=>Native.MODELS.includes(m.name)).map(m=>({name:m.name,digest:m.digest,size:m.size}));return json(res,200,{service:'evergreen-local-ai',version:2,pipeline:Core.VERSION,modelPolicy:Native.POLICY,token,models});}
    catch{return json(res,503,{error:'Start the local Ollama runtime on 127.0.0.1:11435.'});}
  }
  if(!['/api/local/analyze','/api/local/unload'].includes(req.url)||req.method!=='POST')return json(res,404,{error:'Not found.'});
  if(req.headers['x-evergreen-token']!==token)return json(res,403,{error:'Reconnect to the local companion.'});
  if(req.headers['content-type']!=='application/json')return json(res,415,{error:'JSON is required.'});
  if(active)return json(res,409,{error:'Another local analysis is running.'});
  const abort=new AbortController();let acquired=false;res.on('close',()=>{if(!res.writableEnded)abort.abort();});
  try{
    let size=0;const chunks=[];for await(const chunk of req){const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=bytes.length;if(size>150000)return json(res,413,{error:'Report batch is too large.'});chunks.push(bytes);}
    const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(req.url==='/api/local/unload'){
      if(active)return json(res,409,{error:'Another local analysis is running.'});active=true;acquired=true;
      const running=await fetch(Native.BASE+'/api/ps',{signal:AbortSignal.timeout(5000)}).then(r=>r.json());
      for(const m of running.models||[])if(Native.MODELS.includes(m.name)){const response=await fetch(Native.BASE+'/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(30000),body:JSON.stringify({model:m.name,keep_alive:0,stream:false})});if(!response.ok)throw Error('Could not release the local model. Stop its runtime before loading a browser model.');}
      return json(res,200,{unloaded:true});
    }
    const rows=Core.reports(input.reports);
    if(!Native.MODELS.includes(input.model))return json(res,400,{error:'Unsupported local model.'});
    if(active)return json(res,409,{error:'Another local analysis is running.'});
    active=true;acquired=true;const start=performance.now(),streamed=req.headers.accept==='application/x-ndjson';
    const send=data=>{if(!res.destroyed)res.write(JSON.stringify(data)+'\n');};
    if(streamed){res.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.flushHeaders?.();}
    const result=await Native.analyze(rows,{model:input.model,thorough:input.thorough===true,reasoning:input.reasoning===true,signal:abort.signal,progress:stage=>{if(streamed)send({type:'progress',stage});}});
    const totalMs=performance.now()-start,loadMs=result.timings.reduce((sum,t)=>sum+(t.usage?.load_duration_ns||0)/1e6,0);
    if(!res.destroyed){const payload={result,model:input.model,totalMs,loadMs,elapsedMs:Math.max(0,totalMs-loadMs)};if(streamed){send({type:'result',...payload});res.end();}else json(res,200,payload);}
  }catch(error){if(!res.destroyed){const payload={error:error.message||'Local analysis failed.',diagnostics:error.diagnostics||null};if(res.headersSent){res.end(JSON.stringify({type:'error',...payload})+'\n');}else json(res,400,payload);}}
  finally{if(acquired)active=false;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const server=http.createServer(handleRequest);server.on('error',e=>{console.error(e.message);process.exitCode=1;});server.listen(4177,'127.0.0.1',()=>console.log('Evergreen local AI: http://127.0.0.1:4177/demo-2/\nLocal inference only; keep this window running.'));
}
