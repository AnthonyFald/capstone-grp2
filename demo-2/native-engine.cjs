// Optional on-device Ollama adapter. This never contacts a hosted inference API.
const Core=require('./core.js'),Engine=require('./engine.js');
const MODELS=['qwen3.5:27b','qwen3.5:9b','qwen3:14b','qwen3:8b'];
const BASE='http://127.0.0.1:11435';
const POLICY='native-sampling-3';
const CONTEXT=32768;
function adapter(model,{signal,reasoning=false,seed=42}={}){
  if(!MODELS.includes(model))throw Error('Unsupported local model.');
  return {resetChat:async()=>{},chat:{completions:{create:async request=>{
    const sampling=model.startsWith('qwen3.5')?{temperature:reasoning?1:.7,top_p:reasoning?.95:.8,top_k:20,min_p:0,presence_penalty:1.5,repeat_penalty:1}:{temperature:request.temperature,top_p:request.top_p};
    const response=await fetch(BASE+'/api/chat',{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({model,messages:request.messages.map(m=>({...m,content:reasoning?m.content.replaceAll('/no_think','').replace('no hidden reasoning.','put the final answer in the requested schema.'):m.content})),stream:true,think:reasoning,format:JSON.parse(request.response_format.schema),keep_alive:'15m',options:{...sampling,num_ctx:CONTEXT,num_predict:reasoning?12000:request.max_tokens,seed}})});
    if(!response.ok){const error=await response.json();throw Error(error.error||'Local model request failed.');}
    // Streaming prevents Node's five-minute response-header timeout during long local runs.
    const decoder=new TextDecoder();let buffer='',content='',data=null,bytes=0;
    function consume(line){if(!line.trim())return;const chunk=JSON.parse(line);if(chunk.error)throw Error(chunk.error);content+=chunk.message?.content||'';if(chunk.done)data=chunk;}
    for await(const chunk of response.body){bytes+=chunk.length;if(bytes>5000000)throw Error('Local response exceeded the size limit.');buffer+=decoder.decode(chunk,{stream:true});let end;while((end=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,end));buffer=buffer.slice(end+1);}}
    buffer+=decoder.decode();consume(buffer);if(!data)throw Error('The local model connection ended before completion.');
    if(data.prompt_eval_count+data.eval_count>=CONTEXT)throw Error('The local model exhausted its context window. Split these reports into a smaller chronological batch.');
    return {choices:[{message:{content},finish_reason:data.done_reason==='length'?'length':'stop'}],usage:{prompt_tokens:data.prompt_eval_count,completion_tokens:data.eval_count,load_duration_ns:data.load_duration,prompt_eval_duration_ns:data.prompt_eval_duration,eval_duration_ns:data.eval_duration,total_duration_ns:data.total_duration,sampling,policy:POLICY,contextWindow:CONTEXT}};
  }}}};
}
async function analyze(rows,{model='qwen3.5:9b',thorough=true,reasoning=false,seed=42,signal,progress,resume}={}){return Engine.generate(adapter(model,{signal,reasoning,seed}),Core.reports(rows),Core,{thorough,progress,resume});}
module.exports={adapter,analyze,BASE,MODELS,POLICY,CONTEXT};
