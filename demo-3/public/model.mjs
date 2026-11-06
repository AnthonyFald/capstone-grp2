// UI-side checks are repeated on the service. Reference answers never belong in a job input.
export const API_PREFIX='/api/capstone/v1';
export const OUTCOMES={answer_from_records:'Answer from approved records',formal_clarification:'Formal clarification needed',needs_review:'Further review needed'};
export const COHORTS={baseline:'Baseline · no lessons',learning:'With reviewed lessons',holdout:'Separate evaluation'};
export const STATUS={queued:'Waiting',running:'Processing',completed:'Ready for review',failed:'Needs attention',canceled:'Canceled'};
export const SAMPLE={title:'East corridor access for the flooring crew',dataClassification:'synthetic',payload:{question:'Which entrance should the flooring crew use to access Corridor C on Thursday, November 5?',documents:[{id:'access-c',title:'Approved corridor access plan',revision:'C',issuedAt:'2026-10-30',approval:'approved',current:true,text:'Fictional Capstone project — approved access plan, revision C. For Thursday, November 5, the flooring crew shall enter Corridor C through the east service entrance. The north entrance remains closed while the overhead protection is inspected. The site superintendent approved this access plan on October 30.'},{id:'proposal-north',title:'Discussion of a possible north entrance reopening',revision:'Draft 1',issuedAt:'2026-11-01',approval:'draft',current:true,text:'Fictional coordination discussion. The team proposed reopening the north entrance on Thursday to shorten the delivery route. This proposal has not been approved. The current approved access plan remains in effect until a revised plan is issued.'}]}};

const forbidden=/^(?:ground[_ -]?truth(?:[_ -].*)?|expected(?:[_ -].*)?|answer[_ -]?key(?:[_ -].*)?|reference(?:[_ -].*)?|gold(?:[_ -].*)?|evaluation|ratings|scores|correct[_ -]?answer)$/i;
export function rejectReferenceFields(value,path='input'){
  if(!value||typeof value!=='object')return;
  for(const [key,child] of Object.entries(value)){
    if(forbidden.test(key))throw Error('This file contains evaluation or answer-key fields ('+path+'.'+key+'). Import question and source records only.');
    rejectReferenceFields(child,path+'.'+key);
  }
}
function onlyKeys(obj,allowed,label){if(!obj||typeof obj!=='object'||Array.isArray(obj))throw Error(label+' must be an object.');for(const key of Object.keys(obj))if(!allowed.includes(key))throw Error('Unsupported '+label+' field: '+key+'. Use the input example format.');}
function string(value,label,max,required=true){if(typeof value!=='string')throw Error(label+' must be text.');const text=value.trim();if(required&&!text)throw Error(label+' is required.');if(text.length>max)throw Error(label+' is too long.');return text;}
export function validatePayload(input){
  onlyKeys(input,['question','documents'],'question input');
  const question=string(input.question,'Question',2000);
  if(!Array.isArray(input.documents)||!input.documents.length||input.documents.length>12)throw Error('Provide between 1 and 12 source records.');
  if(question.length<5)throw Error('Write a question of at least five characters.');
  const ids=new Set();
  const documents=input.documents.map((doc,i)=>{
    onlyKeys(doc,['id','title','revision','issuedAt','approval','current','text'],'record '+(i+1));
    const id=string(doc.id,'Record ID',80);if(!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id))throw Error('Record IDs may contain only letters, numbers, dots, dashes and underscores.');if(ids.has(id))throw Error('Every source record needs a unique ID.');ids.add(id);
    if(!['approved','draft','superseded'].includes(doc.approval))throw Error('Choose an approval state for every record.');
    if(typeof doc.current!=='boolean')throw Error('Mark whether each record is current.');
    if(doc.approval==='superseded'&&doc.current)throw Error('A superseded record cannot also be current.');
    const issuedAt=string(doc.issuedAt,'Record date',40);if(!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(issuedAt)||!Number.isFinite(Date.parse(issuedAt))||new Date(issuedAt.slice(0,10)).toISOString().slice(0,10)!==issuedAt.slice(0,10))throw Error('Use a valid date for every source record.');
    return{id,title:string(doc.title,'Record title',160),revision:string(doc.revision,'Revision',80),issuedAt,approval:doc.approval,current:doc.current,text:string(doc.text,'Record text',30000)};
  });
  if(question.length+documents.reduce((n,d)=>n+d.text.length,0)>30000)throw Error('The question and source text must total 30,000 characters or fewer.');
  return{question,documents};
}
export function importQuestion(value){
  rejectReferenceFields(value);
  onlyKeys(value,['kind','title','dataClassification','payload','question','documents','cohort','notBefore'],'import');
  if(value.kind&&value.kind!=='rfi')throw Error('This form imports RFI questions only.');
  if(value.payload&&(value.question||value.documents))throw Error('Use payload or top-level question/documents, not both.');
  const payload=validatePayload(value.payload||{question:value.question,documents:value.documents});
  const dataClassification=value.dataClassification||'synthetic';
  if(!['synthetic','authorized'].includes(dataClassification))throw Error('Choose synthetic or authorized source information.');
  const cohort=value.cohort||'learning';if(!Object.hasOwn(COHORTS,cohort))throw Error('Unknown experiment group.');
  if(value.notBefore&&!Number.isFinite(Date.parse(value.notBefore)))throw Error('The scheduled time is invalid.');
  return{title:string(value.title||'Imported question','Title',140),dataClassification,payload,cohort,notBefore:value.notBefore||''};
}
export function workspaceOrigin(value){
  let url;try{url=new URL(value);}catch{throw Error('Enter the complete workspace address, including https://.');}
  if(url.username||url.password||url.search||url.hash)throw Error('Use the workspace address without credentials, query values, or fragments.');
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('Use HTTPS for the online workspace. HTTP is allowed only for a local preview.');
  if(url.pathname!=='/'&&url.pathname!=='')throw Error('Use the workspace’s main address without an extra page path.');
  return url.origin;
}
export function sourceMatches(citation,documents){
  const doc=documents?.find(d=>d.id===citation.documentId);
  return{doc,eligible:Boolean(doc?.current&&doc?.approval==='approved'),exact:Boolean(doc&&typeof citation.quote==='string'&&citation.quote.trim()&&doc.text.includes(citation.quote))};
}
export function asNumber(value){return typeof value==='number'&&Number.isFinite(value)?value:null;}
export function duration(value){const n=asNumber(value);if(n===null)return'Not recorded';const seconds=Math.max(0,Math.round(n));if(seconds<60)return seconds+'s';return Math.floor(seconds/60)+'m '+String(seconds%60).padStart(2,'0')+'s';}
export function percentage(value){const n=asNumber(value);return n===null?'Not assessed':n.toFixed(1)+'%';}
export function reviewMetrics(form){
  const out={};for(const name of ['requiredFacts','correctFacts','incorrectFacts','missingFacts','extraErrors','reviewSeconds','manualSeconds']){const field=form.elements.namedItem(name);if(!field||field.value==='')continue;const n=Number(field.value);if(!Number.isFinite(n)||n<0||(!['reviewSeconds','manualSeconds'].includes(name)&&!Number.isInteger(n)))throw Error('Review measurements must be nonnegative numbers; fact counts must be whole numbers.');out[name]=n;}
  for(const name of ['incorrectClosure','unnecessaryRfiAvoided','missedIssue','falseAlert']){const field=form.elements.namedItem(name);if(field?.value==='yes')out[name]=true;else if(field?.value==='no')out[name]=false;}
  if(['requiredFacts','correctFacts','incorrectFacts','missingFacts'].every(k=>Object.hasOwn(out,k))&&out.correctFacts+out.incorrectFacts+out.missingFacts!==out.requiredFacts)throw Error('Correct + incorrect + missing facts must equal the required-fact count.');
  return out;
}
