export const FILE_LIMITS=Object.freeze({bytes:10*1024*1024,pages:50,characters:30000,expandedZipBytes:40*1024*1024,zipEntries:2000,timeoutMs:25000});

export function zipBounds(buffer){
  const view=new DataView(buffer);let eocd=-1;
  for(let pos=view.byteLength-22;pos>=Math.max(0,view.byteLength-65557);pos--)if(view.getUint32(pos,true)===0x06054b50){eocd=pos;break;}
  if(eocd<0)throw Error('This DOCX is not a readable Word document. Re-save it as .docx and try again.');
  const entries=view.getUint16(eocd+10,true),offset=view.getUint32(eocd+16,true);
  if(entries===65535||entries>FILE_LIMITS.zipEntries||offset===0xffffffff)throw Error('This Word document is too complex for the demo. Export a smaller selection.');
  let position=offset,total=0;
  for(let i=0;i<entries;i++){
    if(position+46>view.byteLength||view.getUint32(position,true)!==0x02014b50)throw Error('The Word document’s archive is damaged or unsupported.');
    const expanded=view.getUint32(position+24,true);total+=expanded;
    if(expanded===0xffffffff||total>FILE_LIMITS.expandedZipBytes)throw Error('This Word document expands beyond the demo limit. Export a smaller selection.');
    position+=46+view.getUint16(position+28,true)+view.getUint16(position+30,true)+view.getUint16(position+32,true);
  }
  return{entries,expandedBytes:total};
}

export function pdfPageText(items){
  let text='',lastY=null;
  for(const item of items){
    if(typeof item.str!=='string')continue;
    const y=Array.isArray(item.transform)?item.transform[5]:null;
    if(text&&!text.endsWith('\n'))text+=(lastY!==null&&y!==null&&Math.abs(y-lastY)>2)?'\n':' ';
    text+=item.str;if(item.hasEOL)text+='\n';if(y!==null)lastY=y;
  }
  return text.replace(/[ \t]+\n/g,'\n').trim();
}

export async function extractPdf(buffer,pdfjs,base){
  let password=false,pdf;
  const loading=pdfjs.getDocument({data:new Uint8Array(buffer),isEvalSupported:false,useWasm:false,disableFontFace:true,useSystemFonts:true,disableWorkerRendering:true,cMapUrl:new URL('./vendor/pdfjs/cmaps/',base).href,cMapPacked:true,standardFontDataUrl:new URL('./vendor/pdfjs/standard_fonts/',base).href,stopAtErrors:true,verbosity:0});
  loading.onPassword=()=>{password=true;void loading.destroy();};
  try{
    pdf=await loading.promise;
    if(pdf.numPages>FILE_LIMITS.pages)throw Error('This PDF has more than 50 pages. Export the relevant pages before importing.');
    const pages=[],empty=[];let total=0;
    for(let n=1;n<=pdf.numPages;n++){
      const page=await pdf.getPage(n);const content=await page.getTextContent();const text=pdfPageText(content.items);page.cleanup();
      if(!text.trim())empty.push(n);const labeled='[Page '+n+']\n'+(text||'[No readable text on this page.]');total+=labeled.length;
      if(total>FILE_LIMITS.characters)throw Error('The extracted PDF text exceeds 30,000 characters. Import a smaller set of relevant pages.');pages.push(labeled);
    }
    if(empty.length===pdf.numPages)throw Error('This PDF has no readable text. Scanned or image-only PDFs require OCR, which this demo does not perform. Export verified text first.');
    return{text:pages.join('\n\n'),warnings:['PDF text was extracted locally. Check reading order, tables, symbols, and any diagrams against the original. Images and handwritten annotations are not read.',...(empty.length?['No readable text on page'+(empty.length===1?' ':'s ')+empty.join(', ')+'. Check those pages and add any missing requirements manually.']:[])],pageCount:pdf.numPages};
  }catch(error){if(password||error.name==='PasswordException')throw Error('This PDF is password protected. Import an unlocked copy that you are authorized to use.');if(error.name==='InvalidPDFException')throw Error('This file is not a valid readable PDF. Re-export it and try again.');throw error;}
  finally{try{await loading.destroy();}catch{}}
}

export async function extractDocx(buffer,mammoth){
  zipBounds(buffer);
  let result;try{result=await mammoth.extractRawText({arrayBuffer:buffer});}catch{throw Error('This Word document could not be read. Use an unencrypted .docx file, or export its text.');}
  if(result.messages?.some(message=>message.type==='error'))throw Error('The Word reader reported a document error. Re-export the document before importing.');
  if(!result.value?.trim())throw Error('This Word document contains no readable text. Images, scans, and drawings need verified text; this demo does not perform OCR.');
  if(result.value.length>FILE_LIMITS.characters)throw Error('The extracted Word text exceeds 30,000 characters. Export a smaller selection.');
  return{text:result.value,warnings:['Word text was extracted locally. Check tables, symbols, and layout against the original. Images and drawings are not read.',...(result.messages||[]).filter(m=>m.type==='warning').slice(0,4).map(m=>m.message)],pageCount:null};
}
