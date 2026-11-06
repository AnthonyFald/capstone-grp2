import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {FILE_LIMITS,pdfPageText,zipBounds,extractDocx,extractPdf} from './document-extract-core.mjs';
import {extractFile,extractedDocument} from './document-extract.mjs';
const require=createRequire(import.meta.url);
const mammoth=require('./vendor/mammoth/mammoth.browser.min.js');
const bytes=async name=>{const b=await readFile(new URL('./extraction-fixtures/'+name,import.meta.url));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);};

test('the vendored Mammoth browser bundle extracts a real DOCX fixture with every requirement',async()=>{
  const result=await extractDocx(await bytes('fictional-rfi.docx'),mammoth);
  assert.match(result.text,/Building A, Level 2 east corridor/);
  assert.match(result.text,/access-panel location/);
  assert.match(result.text,/electrical junction box near beam B12/);
  assert.match(result.text,/E-202 revision B/);
  assert.match(result.text,/November 7/);
  assert.ok(result.warnings.some(message=>/Images/.test(message)));
});

test('PDF line assembly preserves separate lines and ignores structural markers',()=>{
  const items=[{str:'First requirement.',transform:[1,0,0,1,20,700],hasEOL:true},{type:'beginMarkedContent'},{str:'Second',transform:[1,0,0,1,20,680]},{str:'requirement.',transform:[1,0,0,1,60,680]}];
  assert.equal(pdfPageText(items),'First requirement.\nSecond requirement.');
});

test('PDF extraction labels every page and refuses an image-only document',async()=>{
  let destroyed=0;
  const makePdf=pages=>({getDocument(){return{promise:Promise.resolve({numPages:pages.length,getPage:async n=>({getTextContent:async()=>({items:pages[n-1].map(str=>({str,hasEOL:true}))}),cleanup(){}})}),destroy:async()=>{destroyed++;}};}});
  const result=await extractPdf(new ArrayBuffer(0),makePdf([['One requirement.'],['A separate request.']]),'https://example.test/document-worker.mjs');
  assert.equal(result.text,'[Page 1]\nOne requirement.\n\n[Page 2]\nA separate request.');
  assert.equal(destroyed,1);
  await assert.rejects(extractPdf(new ArrayBuffer(0),makePdf([[]]),'https://example.test/document-worker.mjs'),/Scanned or image-only/);
  assert.equal(destroyed,2);
});

test('PDF mixed empty pages are explicit and output limits stop oversized imports',async()=>{
  const library=pages=>({getDocument:()=>({promise:Promise.resolve({numPages:pages.length,getPage:async n=>({getTextContent:async()=>({items:[{str:pages[n-1]}]}),cleanup(){}})}),destroy:async()=>{}})});
  const result=await extractPdf(new ArrayBuffer(0),library(['One question.','']),'https://example.test/document-worker.mjs');
  assert.match(result.text,/Page 2/);assert.ok(result.warnings.some(w=>/No readable text on page 2/.test(w)));
  await assert.rejects(extractPdf(new ArrayBuffer(0),library(['x'.repeat(30001)]),'https://example.test/document-worker.mjs'),/30,000/);
});

test('invalid or expansively compressed Word archives are refused before extraction',async()=>{
  assert.throws(()=>zipBounds(new ArrayBuffer(40)),/not a readable/);
  const buffer=await bytes('fictional-rfi.docx'),view=new DataView(buffer);
  for(let pos=0;pos+46<view.byteLength;pos++)if(view.getUint32(pos,true)===0x02014b50){view.setUint32(pos+24,FILE_LIMITS.expandedZipBytes+1,true);break;}
  assert.throws(()=>zipBounds(buffer),/expands beyond/);
});

test('file intake enforces formats and size and leaves source authority unverified',async()=>{
  await assert.rejects(extractFile({name:'legacy.doc',size:10}),/\.docx/);
  await assert.rejects(extractFile({name:'large.pdf',size:FILE_LIMITS.bytes+1}),/10 MB/);
  const source=await extractFile({name:'request.txt',size:20,text:async()=>'  Exact original text.\n'});
  const document=extractedDocument({name:'APPROVED.pdf'},{text:source.text},'doc-1');
  assert.equal(document.approval,'informal');assert.equal(document.current,false);assert.equal(document.revision,'Unverified');assert.equal(document.text,'  Exact original text.\n');
});

test('PDF library protocol messages cannot masquerade as an extraction result',async()=>{
  const original=globalThis.Worker;let terminated=0;
  globalThis.Worker=class{
    postMessage(request){queueMicrotask(()=>{this.onmessage({data:{sourceName:'worker',targetName:'main',action:'ready'}});this.onmessage({data:{type:'capstone-document-extract-result',requestId:'wrong-request',ok:false,error:'unrelated'}});this.onmessage({data:{type:'capstone-document-extract-result',requestId:request.requestId,ok:true,text:'The original requirement.',warnings:[]}});});}
    terminate(){terminated++;}
  };
  try{const result=await extractFile({name:'source.pdf',size:1,arrayBuffer:async()=>new ArrayBuffer(1)});assert.equal(result.text,'The original requirement.');assert.equal(terminated,1);}finally{globalThis.Worker=original;}
});

test('an incomplete error response still reports a useful message and terminates its worker',async()=>{
  const original=globalThis.Worker;let terminated=0;
  globalThis.Worker=class{
    postMessage(request){queueMicrotask(()=>this.onmessage({data:{type:'capstone-document-extract-result',requestId:request.requestId,ok:false}}));}
    terminate(){terminated++;}
  };
  try{await assert.rejects(extractFile({name:'source.pdf',size:1,arrayBuffer:async()=>new ArrayBuffer(1)}),/failed without a diagnostic/);assert.equal(terminated,1);}finally{globalThis.Worker=original;}
});
