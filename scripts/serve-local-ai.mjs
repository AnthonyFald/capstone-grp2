import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {handleRequest as staticRequest} from './serve.mjs';
const require=createRequire(import.meta.url),Native=require('../demo-2/native-engine.cjs'),Core=require('../demo-2/core.js'),Engine=require('../demo-2/engine.js');
const NativeNotes=require('../demo-1/native-engine.cjs'),MeetingCore=require('../demo-1/core.js'),MeetingNotes=require('../demo-1/note-engine-27.js');
const Capstone=require('../demo-3/engine/rfi-engine.cjs');
const Consolidation=require('../demo-3/engine/consolidation-engine.cjs');
const token=crypto.randomBytes(24).toString('hex');
const origins=new Set(['https://anthonyfald.github.io','http://127.0.0.1:4177','http://localhost:4177']);
// Existing static preview and packaged audio pages also host the notes UI.
for(let port=4175;port<=4185;port++){origins.add('http://127.0.0.1:'+port);origins.add('http://localhost:'+port);}
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
    try{const response=await fetch(Native.BASE+'/api/tags',{signal:AbortSignal.timeout(3000)});if(!response.ok)throw Error();const data=await response.json();const models=data.models.filter(m=>Native.MODELS.includes(m.name)).map(m=>({name:m.name,digest:m.digest,size:m.size}));return json(res,200,{service:'evergreen-local-ai',version:2,active,pipeline:Core.VERSION,promptVersion:Engine.PROMPT_VERSION,modelPolicy:Native.POLICY,capstone:{version:Capstone.VERSION,protocol:1,consolidationVersion:Consolidation.VERSION},notes:{version:'meeting-native-4',pipeline:MeetingNotes.VERSION,model:NativeNotes.MODEL,policy:NativeNotes.POLICIES.quality.version},token,models});}
    catch{return json(res,503,{error:'Start the local Ollama runtime on 127.0.0.1:11435.'});}
  }
  if(!['/api/local/analyze','/api/local/notes','/api/local/capstone','/api/local/unload'].includes(req.url)||req.method!=='POST')return json(res,404,{error:'Not found.'});
  if(req.headers['x-evergreen-token']!==token)return json(res,403,{error:'Reconnect to the local companion.'});
  if(req.headers['content-type']!=='application/json')return json(res,415,{error:'JSON is required.'});
  if(active)return json(res,409,{error:'Another local analysis is running.'});
  const abort=new AbortController();let acquired=false;res.on('close',()=>{if(!res.writableEnded)abort.abort();});
  try{
    // The Capstone request includes immutable historical originals as well as
    // compact model evidence. Bound transport separately from model capacity.
    const bodyLimit=req.url==='/api/local/capstone'?2*1024*1024:150000;
    let size=0;const chunks=[];for await(const chunk of req){const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=bytes.length;if(size>bodyLimit)return json(res,413,{error:req.url==='/api/local/capstone'?'This task board exceeds the local transfer limit. Review the board before submitting another batch.':'Report batch is too large.',code:'INVALID_INPUT',retryable:false});chunks.push(bytes);}
    const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(req.url==='/api/local/unload'){
      if(active)return json(res,409,{error:'Another local analysis is running.'});active=true;acquired=true;
      const running=await fetch(Native.BASE+'/api/ps',{signal:AbortSignal.timeout(5000)}).then(r=>r.json());
      for(const m of running.models||[])if(Native.MODELS.includes(m.name)){const response=await fetch(Native.BASE+'/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(30000),body:JSON.stringify({model:m.name,keep_alive:0,stream:false})});if(!response.ok)throw Error('Could not release the local model. Stop its runtime before loading a browser model.');}
      return json(res,200,{unloaded:true});
    }
    const meeting=req.url==='/api/local/notes',capstone=req.url==='/api/local/capstone';
    const capstoneEngine=input.payload?.mode==='consolidation'?Consolidation:Capstone;
    const rows=capstone?capstoneEngine.validateInput(input.payload):meeting?MeetingCore.validateTranscript(input.transcript):Core.reports(input.reports);
    if(!meeting&&!capstone&&!Native.MODELS.includes(input.model))return json(res,400,{error:'Unsupported local model.'});
    if(active)return json(res,409,{error:'Another local analysis is running.'});
    active=true;acquired=true;const start=performance.now(),streamed=req.headers.accept==='application/x-ndjson';
    const send=data=>{if(!res.destroyed)res.write(JSON.stringify(data)+'\n');};
    if(streamed){res.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.flushHeaders?.();}
    const progress=stage=>{if(streamed)send({type:'progress',stage});};
    if(meeting||capstone){
      const tags=await fetch(Native.BASE+'/api/tags',{signal:abort.signal}).then(r=>r.json());
      const installed=tags.models?.find(m=>m.name===NativeNotes.MODEL);if(!installed)throw Error('The local Qwen 3.5 27B model is not installed.');
      // generate validates again and records submitted versus effective source
      // authority. Passing normalized rows would erase that audit difference.
      const payload=capstone?await capstoneEngine.generate(input.payload,{signal:abort.signal,progress,lessons:input.lessons||[]}):await NativeNotes.generate(rows,{policy:'quality',engine:MeetingNotes,signal:abort.signal,progress});
      payload.modelDigest=installed.digest;
      if(!res.destroyed){if(streamed){send({type:'result',...payload});res.end();}else json(res,200,payload);}return;
    }
    const result=await Native.analyze(rows,{model:input.model,thorough:input.thorough===true,reasoning:input.reasoning===true,signal:abort.signal,progress});
    const totalMs=performance.now()-start,loadMs=result.timings.reduce((sum,t)=>sum+(t.usage?.load_duration_ns||0)/1e6,0);
    if(!res.destroyed){const payload={result,model:input.model,totalMs,loadMs,elapsedMs:Math.max(0,totalMs-loadMs)};if(streamed){send({type:'result',...payload});res.end();}else json(res,200,payload);}
  }catch(error){if(!res.destroyed){const invalidInput=error.code==='INVALID_INPUT'&&!error.diagnostics,payload={error:error.message||'Local analysis failed.',diagnostics:error.diagnostics||null,...(invalidInput?{code:'INVALID_INPUT',status:400,retryable:false}:{retryable:true})};if(res.headersSent){res.end(JSON.stringify({type:'error',...payload})+'\n');}else json(res,400,{...payload,retryable:false});}}
  finally{if(acquired)active=false;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const server=http.createServer(handleRequest);server.on('error',e=>{console.error(e.message);process.exitCode=1;});server.listen(4177,'127.0.0.1',()=>console.log('Evergreen local AI: http://127.0.0.1:4177/demo-2/\nLocal inference only; keep this window running.'));
}
