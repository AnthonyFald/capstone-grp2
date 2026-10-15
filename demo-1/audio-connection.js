/* The open Demo 1 tab connects to the companion; no browser inspection is needed. */
(function(root){
  'use strict';
  const HOSTED='https://anthonyfald.github.io';
  function candidates(location){
    if(location.hostname==='127.0.0.1'&&location.protocol==='http:')return [location.origin];
    if(location.origin===HOSTED&&/^\/capstone-grp2\/demo-1\/(?:index\.html)?$/.test(location.pathname)){
      return Array.from({length:10},(_,i)=>'http://127.0.0.1:'+(4176+i));
    }
    return [];
  }
  function create({location,fetchImpl=root.fetch.bind(root),timeoutMs=15000}){
    let base=null,token=null,transcriptionHints=false;
    async function fetchAt(origin,path,options={}){
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),path==='/api/audio/jobs'?60000:timeoutMs);
      try{
        return await fetchImpl(origin+path,{...options,cache:'no-store',credentials:'omit',signal:controller.signal});
      }finally{clearTimeout(timer);}
    }
    async function request(path,options={}){
      if(!base||!token)throw Error('Keep the companion open and reconnect to process audio.');
      const response=await fetchAt(base,path,{...options,headers:{...options.headers,'X-Local-Token':token}});
      if(response.status===403){base=token=null;throw Error('The companion restarted. Reconnecting…');}
      return response;
    }
    async function heartbeat(){
      const response=await request('/api/audio/heartbeat',{method:'POST',headers:{'X-Demo-Page':location.origin+location.pathname}});
      if(!response.ok)throw Error('The companion could not connect to this Demo 1 tab.');
    }
    async function connect(){
      if(base){
        try{await heartbeat();return false;}catch{base=token=null;}
      }
      // Only these ten loopback ports belong to the desktop companion.
      // Promise.all waits for bounded probes before selecting the lowest port.
      const found=await Promise.all(candidates(location).map(async origin=>{
        try{
          const response=await fetchAt(origin,'/api/audio/config');
          if(!response.ok)return null;
          const info=await response.json();
          if(info.app==='evergreen-meeting-demo'&&info.protocol===1&&info.localAudio&&typeof info.token==='string'&&info.token.length>=32)return {origin,token:info.token,transcriptionHints:info.transcriptionHints===true};
        }catch{}
        return null;
      }));
      const match=found.find(Boolean);
      if(!match)throw Error('Open the companion and keep this tab open. If your browser asks to connect to the local network, allow it to reach the companion on this computer. If blocked, use Open demo in the app.');
      base=match.origin;token=match.token;transcriptionHints=match.transcriptionHints;
      try{await heartbeat();}catch(error){base=token=null;throw error;}
      return true;
    }
    return {connect,request,get connected(){return !!token;},get supportsHints(){return !!token&&transcriptionHints;}};
  }
  const api={create,candidates};root.AudioConnection=api;
  if(typeof module!=='undefined')module.exports=api;
})(globalThis);
