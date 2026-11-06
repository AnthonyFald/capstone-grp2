import {extractFile,extractedDocument} from '../document-extract.mjs';
const $=id=>document.getElementById(id);
const cases={pdf:{filename:'fictional-rfi.pdf',type:'application/pdf',required:['[Page 1]','Building A','beam B12','November 6']},docx:{filename:'fictional-rfi.docx',type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',required:['Building A','electrical junction box','November 7']},empty:{filename:'no-readable-text.pdf',type:'application/pdf',error:/Scanned or image-only/}};
function add(tag,text,parent){const node=document.createElement(tag);node.textContent=text;parent.append(node);return node;}
async function run(name){
  const item=cases[name],started=performance.now(),panel=document.createElement('article');panel.className='qa-result';$('qa-results').prepend(panel);add('h2',item.filename,panel);$('qa-status').textContent='Reading '+item.filename+'…';
  let passed=false;
  try{
    const response=await fetch(new URL(item.filename,import.meta.url),{cache:'no-store'});if(!response.ok)throw Error('Fixture could not be loaded.');
    const file=new File([await response.arrayBuffer()],item.filename,{type:item.type});
    const result=await extractFile(file,{onStatus:text=>$('qa-status').textContent=text});
    if(item.error)throw Error('Expected an image-only PDF rejection, but extraction succeeded.');
    const missing=item.required.filter(text=>!result.text.includes(text));if(missing.length)throw Error('Missing expected source text: '+missing.join(', '));
    const document=extractedDocument(file,result,'qa-'+name);if(document.approval!=='informal'||document.current!==false)throw Error('Imported file was incorrectly given authority.');
    passed=true;add('strong','PASS · production extractor and temporary worker completed',panel);add('pre',result.text,panel);for(const warning of result.warnings)add('p',warning,panel);add('small','Metadata: informal, not current, revision unverified. Original binary stayed on this device.',panel);
  }catch(error){passed=Boolean(item.error?.test(error.message));add('strong',passed?'PASS · unsupported input refused':'FAIL',panel);add('pre',error.message,panel);if(!passed)panel.classList.add('fail');}
  const elapsed=Math.round(performance.now()-started);add('p','Elapsed: '+elapsed+' ms',panel);$('qa-status').textContent=(passed?'Passed: ':'Failed: ')+item.filename+' ('+elapsed+' ms).';return passed;
}
async function perform(names){const buttons=[...document.querySelectorAll('button')];buttons.forEach(button=>button.disabled=true);try{const results=[];for(const name of names)results.push(await run(name));$('qa-status').textContent=results.filter(Boolean).length+'/'+results.length+' checks passed.';}finally{buttons.forEach(button=>button.disabled=false);}}
$('test-pdf').addEventListener('click',()=>perform(['pdf']));$('test-docx').addEventListener('click',()=>perform(['docx']));$('test-empty').addEventListener('click',()=>perform(['empty']));$('test-all').addEventListener('click',()=>perform(['pdf','docx','empty']));
