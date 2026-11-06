import {rejectReferenceFields} from './model.mjs';

export const ACTIONS = Object.freeze({
  create_task:'Create a task', add_subtask:'Add a distinct subtask',
  link_duplicate:'Link an essential duplicate', already_answered:'Covered by an approved answer',
  flag_conflict:'Flag a conflict', needs_review:'Keep for further review', reject:'Reject this suggestion'
});
export const ACTION_TONES = Object.freeze({create_task:'green',add_subtask:'green',link_duplicate:'blue',already_answered:'green',flag_conflict:'red',needs_review:'amber',reject:'neutral'});
export const DOC_LIMITS = Object.freeze({count:12,characters:30000});
const allowedDocFields=['id','title','kind','revision','issuedAt','approval','current','text'];
function plain(value,label){if(!value||typeof value!=='object'||Array.isArray(value))throw Error(label+' must be an object.');}
function text(value,label,max){if(typeof value!=='string'||!value.trim())throw Error(label+' is required.');if(value.length>max||value.includes('\0'))throw Error(label+' is too long or contains unsupported characters.');return value.trim();}
export function validateBatchDocuments(documents){
  if(!Array.isArray(documents)||!documents.length||documents.length>DOC_LIMITS.count)throw Error('Add 1–12 documents to this batch.');
  const ids=new Set();let count=0;
  const normalized=documents.map((doc,index)=>{
    const label='Document '+(index+1);plain(doc,label);
    for(const key of Object.keys(doc))if(!allowedDocFields.includes(key))throw Error(label+' has an unsupported field: '+key+'.');
    const id=text(doc.id,label+' ID',80);
    if(!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)||ids.has(id))throw Error('Document IDs must be unique letters, numbers, dots, dashes or underscores.');ids.add(id);
    if(!['request','reference'].includes(doc.kind))throw Error('Choose Request or Reference for every document.');
    if(!['approved','draft','informal'].includes(doc.approval))throw Error('Choose the authority of each document.');
    if(typeof doc.current!=='boolean')throw Error('Mark whether each document is current.');
    const issuedAt=text(doc.issuedAt,label+' date',40);
    if(!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(issuedAt)||!Number.isFinite(Date.parse(issuedAt))||new Date(issuedAt.slice(0,10)).toISOString().slice(0,10)!==issuedAt.slice(0,10))throw Error('Use a valid issued date for every document.');
    text(doc.text,label+' text',DOC_LIMITS.characters);const content=doc.text;count+=content.length;
    return {id,title:text(doc.title,label+' title',160),kind:doc.kind,revision:text(doc.revision,label+' revision',80),issuedAt,approval:doc.approval,current:doc.current,text:content};
  });
  if(!normalized.some(doc=>doc.kind==='request'))throw Error('Include at least one request document to organize.');
  if(count>DOC_LIMITS.characters)throw Error('Keep the combined source text at or below 30,000 characters.');
  return normalized;
}
export function importBatch(input){
  rejectReferenceFields(input);plain(input,'Import');
  for(const key of Object.keys(input))if(!['kind','title','dataClassification','payload','documents','mode','cohort','notBefore'].includes(key))throw Error('Unsupported import field: '+key+'.');
  if(input.kind&&input.kind!=='rfi')throw Error('Use an RFI document batch.');
  const payload=input.payload||input;
  if(input.payload)for(const key of Object.keys(payload))if(!['mode','documents'].includes(key))throw Error('Import source documents only. The task board is supplied by the workspace.');
  if(payload.mode&&payload.mode!=='consolidation')throw Error('This file is not a consolidation batch.');
  const dataClassification=input.dataClassification||'synthetic';if(!['synthetic','authorized'].includes(dataClassification))throw Error('Choose fictional or authorized project information.');
  const cohort=input.cohort||'learning';if(!['learning','baseline','holdout'].includes(cohort))throw Error('Unknown experiment group.');
  return {title:text(input.title||'Imported RFI documents','Batch title',140),dataClassification,cohort,payload:{mode:'consolidation',documents:validateBatchDocuments(payload.documents)}};
}
export function boardTotals(board={tasks:[],documents:[]}){
  const tasks=board.tasks||[],groups=tasks.filter(task=>task.type==='group'||task.kind==='group');
  const work=tasks.filter(task=>!groups.includes(task));
  return {tasks:work.length,open:work.filter(task=>task.status!=='resolved').length,resolved:work.filter(task=>task.status==='resolved').length,groups:groups.length,documents:(board.documents||[]).length};
}
export function batchResult(job){return job?.result?.result?.mode==='consolidation'?job.result.result:job?.result;}
export function reviewedProposalItems(items,decisions){
  const byId=new Map((decisions||[]).map(decision=>[decision.itemId,decision]));
  return (items||[]).map(item=>{
    const decision=byId.get(item.id);if(!decision)return item;
    return {...item,...decision,
      answer:decision.action==='already_answered'?(decision.reviewedAnswer??decision.answer??item.answer):'',
      citations:decision.action==='already_answered'?(decision.reviewedCitations??decision.citations??item.citations):[],
      reason:decision.notes||item.reason,originalReason:item.reason,originalAction:item.action,
      originalAnswer:item.answer,originalCitations:item.citations};
  });
}
export function isBatch(job){return job?.payload?.mode==='consolidation'||batchResult(job)?.mode==='consolidation';}
export function sourceDocument(documents,id){return (documents||[]).find(doc=>doc.id===id);}
export function actionLabel(action){return ACTIONS[action]||'Review this suggestion';}
export function appendChildren(node,...children){node.append(...children.flat(Infinity).filter(value=>value!==null&&value!==undefined&&value!==false));}
export function localDate(){const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);}
export function textDocument(name,content,id){
  if(!/\.txt$/i.test(name))throw Error('Choose a .txt source or a prepared .json batch. Export PDF or Word text first.');
  if(content.includes('\0'))throw Error('This file appears to be binary. Export it as plain UTF-8 text first.');
  return{id,title:name.replace(/\.txt$/i,''),kind:'request',revision:'Unverified',issuedAt:localDate(),approval:'informal',current:false,text:content};
}
export const STARTER_BATCH = Object.freeze({
  kind:'rfi',title:'Level 2 ceiling coordination · fictional batch',dataClassification:'synthetic',cohort:'learning',
  payload:{mode:'consolidation',documents:[
    {id:'fictional-mechanical-001',title:'Mechanical request · east corridor clearance',kind:'request',revision:'M-201 Rev C',issuedAt:'2026-11-02',approval:'informal',current:true,text:'Fictional Capstone exercise. Location: Building A, Level 2 east corridor. Drawing: M-201 revision C. The supply duct conflicts with beam B12. Please confirm a revised duct route and the required clearance before installation. Mechanical crew needs a response by November 6.'},
    {id:'fictional-field-002',title:'Field request · beam B12 duct conflict',kind:'request',revision:'M-201 Rev C',issuedAt:'2026-11-02',approval:'informal',current:true,text:'Fictional Capstone exercise. In Building A, Level 2 east corridor, the supply duct shown on M-201 revision C will not clear beam B12. Please confirm the duct route and clearance. This is the same physical conflict reported by the mechanical crew. Delivery is booked for November 5.'},
    {id:'fictional-electrical-003',title:'Electrical request · access panel',kind:'request',revision:'E-202 Rev B',issuedAt:'2026-11-02',approval:'informal',current:true,text:'Fictional Capstone exercise. Building A, Level 2 east corridor ceiling coordination: please confirm the access-panel location required to reach the electrical junction box near beam B12. This is a separate decision from the supply duct route and clearance. Electrical foreman needs a response by November 7.'}
  ]}
});
