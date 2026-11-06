(function(root){
  'use strict';
  const BASE='http://127.0.0.1:4177',MODEL='qwen3.5:27b',VERSION='meeting-native-4';
  async function connect(signal){
    const deadline=AbortSignal.timeout(5000);
    const response=await fetch(BASE+'/api/local/config',{signal:signal?AbortSignal.any([signal,deadline]):deadline,cache:'no-store'});
    const config=await response.json();
    if(!response.ok)throw Error(config.error||'The local model is unavailable.');
    if(config.service!=='evergreen-local-ai'||config.notes?.version!==VERSION)throw Error('Restart the local companion to load the updated meeting notes support.');
    const model=config.models?.find(m=>m.name===MODEL);if(!model)throw Error('The local Qwen 3.5 27B model is not installed. See local setup.');
    return {...config,model};
  }
  async function read(response,progress){
    if(!response.ok)throw Error((await response.json()).error||'Local notes failed.');
    if(!response.headers.get('content-type')?.includes('application/x-ndjson'))throw Error('The companion returned an unexpected response. Restart it.');
    const decoder=new TextDecoder();let buffer='',result=null,bytes=0;
    const consume=line=>{if(!line.trim())return;const value=JSON.parse(line);if(value.type==='error')throw Error(value.error||'Local notes failed.');if(value.type==='progress')progress(value.stage);if(value.type==='result')result=value;};
    for await(const chunk of response.body){bytes+=chunk.length;if(bytes>10000000)throw Error('The companion response is too large.');buffer+=decoder.decode(chunk,{stream:true});let end;while((end=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,end));buffer=buffer.slice(end+1);}}
    buffer+=decoder.decode();consume(buffer);if(!result)throw Error('The companion disconnected before notes were complete.');return result;
  }
  async function generate(transcript,config,{signal,progress=()=>{}}={}){
    const response=await fetch(BASE+'/api/local/notes',{method:'POST',signal,headers:{'Content-Type':'application/json',Accept:'application/x-ndjson','X-Evergreen-Token':config.token},body:JSON.stringify({transcript})});
    return read(response,progress);
  }
  async function release(config,signal){
    const response=await fetch(BASE+'/api/local/unload',{method:'POST',signal,headers:{'Content-Type':'application/json','X-Evergreen-Token':config.token},body:'{}'});
    if(!response.ok)throw Error((await response.json()).error||'Could not release local model memory.');
  }
  const api={BASE,MODEL,VERSION,connect,generate,read,release};root.NativeNotes=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
