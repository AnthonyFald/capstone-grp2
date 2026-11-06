// Local-only meeting notes. The legacy policy preserves Demo 1's explicit
// sampling settings for the hardware/model rerun; quality is a separate trial.
const Core=require('./core.js'),Notes=require('./note-engine.js');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sourceHashes=Object.fromEntries(['native-engine.cjs','note-engine.js','note-engine-27.js','core.js'].filter(name=>fs.existsSync(path.join(__dirname,name))).map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,name))).digest('hex')]));
const BASE='http://127.0.0.1:11435',MODEL='qwen3.5:27b';
const POLICIES={
  baseline:{version:'meeting-native-baseline-1',context:16384,sampling:{temperature:.1,top_p:.8,presence_penalty:0,top_k:0,min_p:0,repeat_penalty:1}},
  quality:{version:'meeting-native-quality-27',context:16384,sampling:{temperature:.1,top_p:.8,presence_penalty:0,top_k:0,min_p:0,repeat_penalty:1}}
};
function adapter({policy='baseline',seed=42,signal,record=()=>{}}={}){
  const config=POLICIES[policy];if(!config)throw Error('Unsupported meeting model policy.');
  return {resetChat:async()=>{},chat:{completions:{create:async request=>{
    const started=performance.now();
    const reasoning=policy==='quality'&&request.extra_body?.enable_thinking===true;
    const sampling=reasoning?{temperature:1,top_p:.95,top_k:20,min_p:0,presence_penalty:1.5,repeat_penalty:1}:config.sampling;
    const format=JSON.parse(request.response_format.schema),messages=request.messages.map(message=>({...message}));
    // Constrained decoding enforces syntax; the model also needs to SEE the
    // requested fields to understand their meaning. Preserve the frozen
    // baseline's original messages, and ground only the tuned native policy.
    if(policy==='quality')messages.at(-1).content+='\n\nReturn exactly one JSON object following this schema. Use empty arrays or null where the task permits them; do not invent facts to fill fields.\n'+JSON.stringify(format);
    const body={model:MODEL,messages,stream:true,think:reasoning,format,keep_alive:'15m',options:{...sampling,num_ctx:config.context,num_predict:request.max_tokens,seed}};
    let content='',done=null;
    try{
      signal?.throwIfAborted();
      const response=await fetch(BASE+'/api/chat',{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      if(!response.ok)throw Error((await response.json()).error||'Local model request failed.');
      const decoder=new TextDecoder();let buffer='',bytes=0;
      const consume=line=>{if(!line.trim())return;const value=JSON.parse(line);if(value.error)throw Error(value.error);content+=value.message?.content||'';if(value.done)done=value;};
      for await(const chunk of response.body){bytes+=chunk.length;if(bytes>5000000)throw Error('Local response exceeded the size limit.');buffer+=decoder.decode(chunk,{stream:true});let end;while((end=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,end));buffer=buffer.slice(end+1);}}
      buffer+=decoder.decode();consume(buffer);
      if(!done)throw Error('The local model disconnected before completion.');
      if((done.prompt_eval_count||0)+(done.eval_count||0)>=config.context)throw Error('The meeting exceeded the model context. Use a shorter transcript.');
      const usage={reasoning,sampling,prompt_tokens:done.prompt_eval_count,completion_tokens:done.eval_count,load_duration_ns:done.load_duration,prompt_eval_duration_ns:done.prompt_eval_duration,eval_duration_ns:done.eval_duration,total_duration_ns:done.total_duration};
      record({request:body,content,usage,doneReason:done.done_reason,elapsedMs:performance.now()-started});
      return {choices:[{message:{content},finish_reason:done.done_reason==='length'?'length':'stop'}],usage};
    }catch(error){record({request:body,content,error:error.message,elapsedMs:performance.now()-started});throw error;}
  }}}};
}
async function generate(transcript,{policy='baseline',seed=42,signal,progress=()=>{},record=()=>{},engine=Notes,core=Core}={}){
  const text=core.validateTranscript(transcript),calls=[],trace=[],start=performance.now();
  try{
    const raw=await engine.generate(adapter({policy,seed,signal,record:call=>{calls.push(call);record(call);}}),text.split(/\r?\n/).map((line,i)=>'['+(i+1)+'] '+line).join('\n'),progress,{trace:(phase,value)=>trace.push({phase,value})});
    const totalMs=performance.now()-start,loadMs=calls.reduce((sum,c)=>sum+(c.usage?.load_duration_ns||0)/1e6,0);
    return {result:{...core.normalizeModelOutput(raw,text),model:MODEL},raw,calls,trace,model:MODEL,backend:'ollama',policy:POLICIES[policy].version,contextWindow:POLICIES[policy].context,sampling:POLICIES[policy].sampling,seed,reasoning:calls.some(c=>c.usage?.reasoning),totalMs,loadMs,elapsedMs:Math.max(0,totalMs-loadMs),sourceHashes,inputSha256:crypto.createHash('sha256').update(text).digest('hex')};
  }catch(error){error.diagnostics={calls,trace,totalMs:performance.now()-start};throw error;}
}
module.exports={BASE,MODEL,POLICIES,sourceHashes,adapter,generate};
