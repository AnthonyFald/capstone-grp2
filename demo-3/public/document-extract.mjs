import {FILE_LIMITS} from './document-extract-core.mjs';
import {localDate} from './board-model.mjs';
export {FILE_LIMITS};
export async function extractFile(file,{signal,onStatus=()=>{}}={}){
  const extension=file.name.split('.').pop().toLowerCase();
  if(!['txt','pdf','docx'].includes(extension))throw Error('Choose a PDF, DOCX, TXT source, or one prepared JSON batch. Older .doc files must be saved as .docx first.');
  if(file.size>FILE_LIMITS.bytes)throw Error(file.name+' exceeds the 10 MB file limit. Export a smaller selection.');
  signal?.throwIfAborted();onStatus('Reading '+file.name+' on this device…');
  if(extension==='txt'){
    const text=await file.text();if(text.includes('\0'))throw Error(file.name+' appears to contain binary data. Export plain UTF-8 text.');if(text.length>FILE_LIMITS.characters)throw Error(file.name+' exceeds 30,000 text characters.');if(!text.trim())throw Error(file.name+' has no readable text.');return{text,warnings:[],format:'TXT'};
  }
  const buffer=await file.arrayBuffer();signal?.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./document-worker.mjs',import.meta.url),{type:'module'});let settled=false;
    const requestId=crypto.randomUUID();
    const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);worker.terminate();error?reject(error):resolve({...result,format:extension.toUpperCase()});};
    const abort=()=>finish(Error('Document import canceled.'));
    const timer=setTimeout(()=>finish(Error('Reading '+file.name+' took too long. Export a smaller document or verified text.')),FILE_LIMITS.timeoutMs);
    signal?.addEventListener('abort',abort,{once:true});
    worker.onmessage=event=>{
      if(event.data?.type!=='capstone-document-extract-result'||event.data.requestId!==requestId)return;
      event.data.ok===true?finish(null,event.data):finish(Error(event.data.error||'The document reader failed without a diagnostic. Export verified text and try again.'));
    };
    worker.onerror=()=>finish(Error('The document reader could not start. Reload the page and try again, or paste verified text.'));
    worker.postMessage({type:'capstone-document-extract-request',requestId,extension,buffer},[buffer]);
  });
}
export function extractedDocument(file,result,id){return{id,title:file.name.replace(/\.(txt|pdf|docx)$/i,''),kind:'request',revision:'Unverified',issuedAt:localDate(),approval:'informal',current:false,text:result.text};}
