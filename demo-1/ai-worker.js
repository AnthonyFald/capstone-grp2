/* Free local AI reads discussions, drafts source-linked notes, and checks relevance. */
import './model-download.js';
import './note-engine.js?v=notes-4';
self.fetch=ModelDownload.resilientFetch(self.fetch.bind(self),{notify:text=>self.postMessage({type:'download-status',text})});
let engine;
self.onmessage=async({data})=>{
  try{
    if(data.type==='load'){
      const webllm=await import('https://esm.run/@mlc-ai/web-llm@0.2.85');
      // IndexedDB avoids the Cache.add path that can fail while saving remote files.
      // Keep the version's model records so its WASM and model weights stay compatible.
      const appConfig={...webllm.prebuiltAppConfig,cacheBackend:'indexeddb'};
      engine=await webllm.CreateMLCEngine(data.model,{appConfig,initProgressCallback:report=>self.postMessage({type:'progress',progress:report.progress,text:report.text})},MeetingNotes.CHAT_OPTIONS);
      self.postMessage({type:'ready',model:data.model});
    }
    if(data.type==='generate'){
      if(!engine)throw new Error('Load the local model first.');
      const notes=await MeetingNotes.generate(engine,data.transcript,text=>self.postMessage({type:'generation-progress',text}),{temperature:data.temperature,trace:data.debug?(phase,value)=>self.postMessage({type:'debug',phase,value}):undefined});
      self.postMessage({type:'result',content:JSON.stringify(notes)});
    }
  }catch(error){self.postMessage({type:'error',phase:data.type,retryable:ModelDownload.retryable(error),message:error.message||String(error)});}
};
