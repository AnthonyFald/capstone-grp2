import {extractPdf,extractDocx} from './document-extract-core.mjs';
self.onmessage=async event=>{
  if(event.data?.type!=='capstone-document-extract-request')return;
  const requestId=event.data.requestId;
  try{
    let result;
    if(event.data.extension==='pdf'){
      const pdfjs=await import('./vendor/pdfjs/pdf.min.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.min.mjs',import.meta.url).href;
      result=await extractPdf(event.data.buffer,pdfjs,import.meta.url);
    }else{
      await import('./vendor/mammoth/mammoth.browser.min.js');
      result=await extractDocx(event.data.buffer,self.mammoth);
    }
    self.postMessage({type:'capstone-document-extract-result',requestId,ok:true,...result});
  }catch(error){self.postMessage({type:'capstone-document-extract-result',requestId,ok:false,error:error?.message||'The document could not be read. Export its verified text instead.'});}
};
