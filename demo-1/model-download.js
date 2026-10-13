/* Download recovery shared by the worker and UI. Inference stays on the device. */
(function(root){
  'use strict';
  function retryable(error){
    const message=String(error?.message||error);
    if(/quota|disk|storage.*full|out of memory|device lost|GPU|HTTP 4\d\d(?!\d)/i.test(message)&&!/HTTP (408|429)/.test(message))return false;
    return /fetch|network|download|request failed|failed to store|cache|timeout|timed out|HTTP (408|429|5\d\d)/i.test(message);
  }
  function explain(error){
    const message=String(error?.message||error);
    if(/quota|disk|storage.*full/i.test(message))return 'The browser could not save the AI model. Free some disk space and retry in a regular Chrome or Edge window.';
    if(/out of memory|device lost|GPU/i.test(message))return 'The graphics device could not load the model. Close other GPU-heavy tabs or apps, then retry in Chrome or Edge with hardware acceleration enabled.';
    if(retryable(error)||/HTTP \d+/.test(message))return 'The AI model download was interrupted or blocked. Check your connection and click Retry AI model download. Your transcript is still here.';
    if(/indexeddb|database|storage/i.test(message))return 'The browser could not open model storage. Try a regular Chrome or Edge window with site storage enabled. Your transcript is still here.';
    return message;
  }
  function resilientFetch(fetchImpl,{notify=()=>{},sleep=ms=>new Promise(r=>setTimeout(r,ms)),attempts=3}={}){
    return async(input,init)=>{
      const method=init?.method||input?.method||'GET';
      if(method.toUpperCase()!=='GET')return fetchImpl(input,init);
      const signal=init?.signal||input?.signal;
      for(let attempt=1;attempt<=attempts;attempt++){
        try{
          if(signal?.aborted)throw signal.reason||new DOMException('Canceled','AbortError');
          const response=await fetchImpl(input,init);
          if(!response.ok){
            await response.body?.cancel();
            throw new Error('Model download HTTP '+response.status);
          }
          return response;
        }catch(error){
          if(signal?.aborted||error.name==='AbortError'||!retryable(error)||attempt===attempts)throw error;
          notify('Download interrupted. Retrying file ('+(attempt+1)+'/'+attempts+')…');
          await sleep(1000*attempt);
        }
      }
    };
  }
  const api={retryable,explain,resilientFetch};root.ModelDownload=api;
  if(typeof module!=='undefined')module.exports=api;
})(globalThis);
