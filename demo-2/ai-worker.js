import '../demo-1/model-download.js';
import './core.js';
import './engine.js';
self.fetch=ModelDownload.resilientFetch(self.fetch.bind(self),{notify:text=>self.postMessage({type:'progress',text})});
let engine,model;
self.onmessage=async({data})=>{
  try{
    if(data.type==='load'){
      if(engine)await engine.unload();
      const webllm=await import('https://esm.run/@mlc-ai/web-llm@0.2.85');
      model=data.model;
      engine=await webllm.CreateMLCEngine(model,{appConfig:{...webllm.prebuiltAppConfig,cacheBackend:'indexeddb'},initProgressCallback:r=>self.postMessage({type:'progress',text:r.text,progress:r.progress})},{context_window_size:16384});
      self.postMessage({type:'ready',model});
    }else if(data.type==='generate'){
      if(!engine)throw Error('Load a model first.');
      const rows=DailyCore.reports(data.reports);
      const result=await DailyEngine.generate(engine,rows,DailyCore,{thorough:data.thorough,progress:text=>self.postMessage({type:'progress',text})});
      self.postMessage({type:'result',result,model});
    }
  }catch(e){self.postMessage({type:'error',message:e.message||String(e),diagnostics:e.diagnostics});}
};
