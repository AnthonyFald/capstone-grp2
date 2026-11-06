// Pure validation and task-board transitions. No network, model calls or hidden writes.
export class BoardError extends Error {
  constructor(status, code, message) { super(message); this.status=status; this.code=code; }
}
const fail=(status,code,message)=>{throw new BoardError(status,code,message);};
export const BOARD_LIMITS=Object.freeze({incomingDocuments:12,incomingCharacters:30000,items:24,groups:12,tasks:120,documents:120,sourceCharacters:120000});
export const BOARD_ACTIONS=Object.freeze(['create_task','add_subtask','link_duplicate','already_answered','flag_conflict','needs_review']);
const object=(v,label)=>{if(!v||typeof v!=='object'||Array.isArray(v))fail(400,'invalid_board_input',label+' must be an object.');return v;};
const keys=(v,allowed,label)=>{for(const key of Object.keys(v))if(!allowed.includes(key))fail(400,'invalid_board_input',label+' contains unsupported field '+key+'.');};
const text=(v,label,max=4000,empty=false)=>{if(typeof v!=='string'||v.includes('\0')||v.length>max||(!empty&&!v.trim()))fail(400,'invalid_board_input',label+' must contain '+(empty?'0':'1')+'–'+max+' characters.');return v.trim();};
const identifier=(v,label)=>{const s=text(v,label,100);if(!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(s))fail(400,'invalid_board_input',label+' must use letters, numbers, dots, dashes or underscores.');return s;};
const optionalId=(v,label)=>v==null||v===''?null:identifier(v,label);
const list=(v,label,max)=>{if(!Array.isArray(v)||v.length>max)fail(400,'invalid_board_input',label+' must be a list of at most '+max+' items.');return v;};
const version=v=>{if(!Number.isSafeInteger(v)||v<0)fail(400,'invalid_board_input','Board version must be a nonnegative integer.');return v;};
const clone=v=>structuredClone(v);
const choose=(v,values,label)=>{if(!values.includes(v))fail(400,'invalid_board_input','Invalid '+label+'.');return v;};

export function emptyBoard(){return {version:0,tasks:[],documents:[],appliedJobIds:[]};}
export function validateBoardDocument(value){
  const d=object(value,'Document');keys(d,['id','title','kind','revision','issuedAt','approval','current','text'],'Document');
  if(typeof d.current!=='boolean')fail(400,'invalid_board_input','Each document needs an explicit current flag.');
  const issuedAt=text(d.issuedAt,'Issue date',40);
  if(!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(issuedAt)||!Number.isFinite(Date.parse(issuedAt))||new Date(issuedAt.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)!==issuedAt.slice(0,10))fail(400,'invalid_board_input','Document issue date must be a real ISO date.');
  text(d.text,'Source text',BOARD_LIMITS.sourceCharacters);
  return {id:identifier(d.id,'Document ID'),title:text(d.title,'Document title',160),kind:choose(d.kind,['request','reference'],'document kind'),revision:text(d.revision,'Revision',80),issuedAt,approval:choose(d.approval,['approved','draft','informal'],'document approval'),current:d.current,text:d.text};
}
export function validateConsolidationPayload(value){
  object(value,'Payload');keys(value,['mode','documents'],'Payload');
  if(value.mode!=='consolidation')fail(400,'invalid_board_input','Consolidation mode is required.');
  const documents=list(value.documents,'Incoming documents',BOARD_LIMITS.incomingDocuments).map(validateBoardDocument);
  if(!documents.some(d=>d.kind==='request'))fail(400,'invalid_board_input','Include at least one request document.');
  if(new Set(documents.map(d=>d.id)).size!==documents.length)fail(400,'invalid_board_input','Incoming document IDs must be unique.');
  if(documents.reduce((n,d)=>n+d.text.length,0)>BOARD_LIMITS.incomingCharacters)fail(413,'too_large','Incoming text exceeds 30,000 characters.');
  return {mode:'consolidation',documents};
}
export function combinedDocuments(board,incoming){
  const found=new Map((board.documents||[]).map(d=>[d.id,d]));
  for(const d of incoming){const old=found.get(d.id);if(old){const previous=validateBoardDocument(old),immutable=['id','title','kind','revision','issuedAt','text'];if(immutable.some(k=>previous[k]!==d[k]))fail(409,'document_id_conflict','Document '+d.id+' already identifies a different source. Give this revision a new document ID; original content cannot be replaced.');continue;}found.set(d.id,d);}
  return [...found.values()];
}
export function validateBoardCapacity(board){
  if(board.tasks.some(t=>typeof t.requirement!=='string'||t.requirement.length>12000))fail(409,'task_capacity','A task has reached its preserved-detail limit. Review or split the task before adding another linked submission; no details were dropped.');
  if(board.tasks.length>BOARD_LIMITS.tasks||board.documents.length>BOARD_LIMITS.documents||board.documents.reduce((n,d)=>n+d.text.length,0)>BOARD_LIMITS.sourceCharacters)fail(409,'board_capacity','This demonstration board has reached its bounded source/task capacity. Export and review the experiment before starting another project; no records were removed.');
}
export function validateBoardCitations(value,documents,{approvedOnly=false,required=false}={}){
  const citations=list(value,'Citations',16).map(c=>{object(c,'Citation');keys(c,['documentId','quote'],'Citation');const documentId=identifier(c.documentId,'Citation document ID'),quote=text(c.quote,'Citation quotation',4000),d=documents.find(doc=>doc.id===documentId);if(!d||!d.text.includes(quote))fail(400,'invalid_citations','Citations must exactly quote a preserved source document.');if(approvedOnly&&(d.kind!=='reference'||d.approval!=='approved'||d.current!==true))fail(400,'unapproved_source','An answer needs a current approved reference document, not a request or task status.');return {documentId,quote};});
  if(required&&!citations.length)fail(400,'invalid_citations','An answer needs at least one exact approved-source citation.');return citations;
}
export function validateConsolidationResult(value,payload,board){
  object(value,'Consolidation result');keys(value,['mode','version','humanDecision','boardVersion','summary','groups','items'],'Consolidation result');
  if(value.mode!=='consolidation'||value.humanDecision!=='pending')fail(400,'invalid_board_result','Consolidation output must remain pending human review.');
  const boardVersion=version(value.boardVersion);if(boardVersion!==board.version)fail(409,'snapshot_mismatch','The proposal does not match its frozen board snapshot.');
  const documents=combinedDocuments(board,payload.documents),taskById=new Map(board.tasks.map(t=>[t.id,t]));
  const groups=list(value.groups,'Proposed groups',BOARD_LIMITS.groups).map(g=>{object(g,'Group');keys(g,['id','title','reason'],'Group');return {id:identifier(g.id,'Group ID'),title:text(g.title,'Group title',160),reason:text(g.reason,'Group explanation',2000)};});
  const groupIds=new Set(groups.map(g=>g.id));if(groupIds.size!==groups.length)fail(400,'invalid_board_result','Proposed group IDs must be unique.');
  const seen=new Map();
  const items=list(value.items,'Extracted requirements',BOARD_LIMITS.items).map(raw=>{
    object(raw,'Requirement');keys(raw,['id','sourceDocumentId','sourceQuote','title','requirement','location','discipline','revision','action','targetTaskId','duplicateOfItemId','groupId','reason','answer','citations','warnings'],'Requirement');
    const item={id:identifier(raw.id,'Requirement ID'),sourceDocumentId:identifier(raw.sourceDocumentId,'Source document ID'),sourceQuote:text(raw.sourceQuote,'Source quotation',8000),title:text(raw.title,'Task title',160),requirement:text(raw.requirement,'Requirement',4000),location:text(raw.location??'','Location',200,true),discipline:text(raw.discipline??'','Discipline',120,true),revision:text(raw.revision??'','Revision',80,true),action:choose(raw.action,BOARD_ACTIONS,'proposed action'),targetTaskId:optionalId(raw.targetTaskId,'Target task ID'),duplicateOfItemId:optionalId(raw.duplicateOfItemId,'Duplicate requirement ID'),groupId:optionalId(raw.groupId,'Group ID'),reason:text(raw.reason,'Decision explanation',3000),answer:text(raw.answer??'','Answer',4000,true),citations:[],warnings:list(raw.warnings??[],'Warnings',8).map(w=>text(w,'Warning',2200))};
    if(seen.has(item.id))fail(400,'invalid_board_result','Requirement IDs must be unique.');
    const source=payload.documents.find(d=>d.id===item.sourceDocumentId&&d.kind==='request');if(!source||!source.text.includes(item.sourceQuote))fail(400,'invalid_board_result','Every requirement must exactly quote an incoming request document.');
    if(item.targetTaskId&&!taskById.has(item.targetTaskId))fail(400,'invalid_board_result','The proposed target task does not exist in the frozen snapshot.');
    if(item.groupId&&!groupIds.has(item.groupId))fail(400,'invalid_board_result','The proposed group does not exist.');
    const target=taskById.get(item.targetTaskId),duplicate=seen.get(item.duplicateOfItemId);
    if(item.action==='link_duplicate'){
      if(Boolean(item.targetTaskId)===Boolean(item.duplicateOfItemId))fail(400,'invalid_board_result','A duplicate needs exactly one existing task or earlier requirement target.');
      if(target&&(target.type!=='task'||target.status!=='open'))fail(400,'invalid_board_result','Duplicate links need an open task. A resolved task alone is not evidence that a new request is answered.');
      if(item.duplicateOfItemId&&(!duplicate||!['create_task','add_subtask','flag_conflict','needs_review'].includes(duplicate.action)))fail(400,'invalid_board_result','A duplicate may reference only an earlier unresolved non-duplicate requirement.');
      if(item.groupId)fail(400,'invalid_board_result','Duplicate links inherit their target organization.');
    }else if(item.duplicateOfItemId)fail(400,'invalid_board_result','Only duplicate decisions may reference an earlier requirement.');
    if(item.action==='add_subtask'&&Boolean(item.targetTaskId)===Boolean(item.groupId))fail(400,'invalid_board_result','A subtask needs exactly one existing parent or proposed group.');
    if(item.action==='create_task'&&item.targetTaskId)fail(400,'invalid_board_result','A new task cannot replace an existing task.');
    item.citations=validateBoardCitations(raw.citations??[],documents,{approvedOnly:item.action==='already_answered',required:item.action==='already_answered'});
    if(item.action==='already_answered'&&!item.answer)fail(400,'invalid_board_result','An answered request needs an answer and approved evidence.');
    if(item.action!=='already_answered'&&item.answer)fail(400,'invalid_board_result','Unresolved decisions must not contain a definitive answer.');
    seen.set(item.id,item);return item;
  });
  for(const doc of payload.documents.filter(d=>d.kind==='request'))if(!items.some(i=>i.sourceDocumentId===doc.id))fail(400,'missing_requirements','Every incoming request document needs at least one preserved requirement.');
  return {mode:'consolidation',version:text(value.version,'Engine version',100),humanDecision:'pending',boardVersion,summary:text(value.summary,'Summary',4000),groups,items};
}

export function validateBoardMetrics(value={}){
  object(value,'Board review metrics');const counts=['requiredRequirements','preservedRequirements','omittedRequirements','correctDecisions','incorrectDecisions','incorrectMerges','missedDuplicates','unnecessaryRfisAvoided','necessaryRfisSuppressed','manualUnnecessaryRfis','assistedUnnecessaryRfis'];const times=['reviewSeconds','manualSeconds'];const out={};
  for(const [k,v] of Object.entries(value)){if(counts.includes(k)){if(!Number.isSafeInteger(v)||v<0||v>10000)fail(400,'invalid_metrics',k+' needs a nonnegative integer.');out[k]=v;}else if(times.includes(k)){if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>604800)fail(400,'invalid_metrics',k+' needs a nonnegative duration.');out[k]=v;}else fail(400,'invalid_metrics','Unknown consolidation review metric '+k+'.');}
  if(['requiredRequirements','preservedRequirements','omittedRequirements'].every(k=>k in out)&&out.requiredRequirements!==out.preservedRequirements+out.omittedRequirements)fail(400,'invalid_metrics','Required requirements must equal preserved plus omitted.');return out;
}
export function validateMutation(value){object(value,'Board change');return {expectedVersion:version(value.expectedVersion),clientMutationId:identifier(value.clientMutationId,'Change request ID'),notes:text(value.notes??'','Review notes',6000,true)};}
function baseTask(fields,at){return {id:fields.id,type:fields.type??'task',title:fields.title,requirement:fields.requirement??'',location:fields.location??'',discipline:fields.discipline??'',revision:fields.revision??'',parentId:fields.parentId??null,status:fields.status??'open',sources:fields.sources??[],answer:fields.answer??'',resolutionCitations:fields.resolutionCitations??[],createdAt:at,updatedAt:at};}
function appendRequirement(task,item){if(!task.requirement.includes(item.requirement))task.requirement+='\n\nAdditional submission: '+item.requirement;}
function openTaskWithin(board,rootId,includeRoot=false){
  const byId=new Map(board.tasks.map(t=>[t.id,t]));
  return board.tasks.some(task=>{if(task.type!=='task'||task.status!=='open')return false;if(includeRoot&&task.id===rootId)return true;const seen=new Set();let parent=task.parentId;while(parent&&!seen.has(parent)){if(parent===rootId)return true;seen.add(parent);parent=byId.get(parent)?.parentId;}return false;});
}
function reopenAncestors(board,taskId,at){
  const byId=new Map(board.tasks.map(t=>[t.id,t])),changed=[],seen=new Set([taskId]);let parent=byId.get(taskId)?.parentId;
  while(parent&&!seen.has(parent)){seen.add(parent);const task=byId.get(parent);if(!task)break;if(task.status==='resolved'){task.status='open';task.updatedAt=at;changed.push(task.id);}parent=task.parentId;}
  return changed;
}

export function applyConsolidation(board,payload,proposal,request,{jobId,newId,at}){
  validateMutation(request);if(request.expectedVersion!==board.version||proposal.boardVersion!==board.version)fail(409,'board_changed','The board changed after this analysis. Run this batch again against the latest board before applying it.');
  if((board.appliedJobIds||[]).includes(jobId))fail(409,'already_applied','This proposal was already applied to the board.');
  const decisions=list(request.decisions,'Review decisions',BOARD_LIMITS.items),byItem=new Map();
  for(const d of decisions){object(d,'Review decision');keys(d,['itemId','action','targetTaskId','duplicateOfItemId','groupId','notes','answer','citations'],'Review decision');const itemId=identifier(d.itemId,'Requirement ID');if(byItem.has(itemId))fail(400,'invalid_board_input','Each requirement needs exactly one decision.');if(!proposal.items.some(i=>i.id===itemId))fail(400,'invalid_board_input','Review decision names an unknown requirement.');const action=choose(d.action,[...BOARD_ACTIONS,'reject'],'review action'),notes=text(d.notes??'','Decision notes',3000,true);if(action!=='already_answered'&&(Object.hasOwn(d,'answer')||Object.hasOwn(d,'citations')))fail(400,'invalid_board_input','Reviewed answer fields belong only to an already-answered decision.');if(action==='reject'&&!notes)fail(400,'invalid_board_input','Explain why each rejected requirement is not applied.');byItem.set(itemId,{...d,itemId,action,notes});}
  if(byItem.size!==proposal.items.length)fail(400,'invalid_board_input','Review every extracted requirement before applying the batch.');
  const rejected=[];const correctedItems=proposal.items.map(i=>{
    const d=byItem.get(i.id);if(d.action==='reject'){rejected.push({itemId:i.id,notes:d.notes});return null;}
    const changed=d.action!==i.action||['targetTaskId','duplicateOfItemId','groupId'].some(k=>Object.hasOwn(d,k)&&(d[k]||null)!==(i[k]||null))||Object.hasOwn(d,'answer')&&d.answer!==i.answer||Object.hasOwn(d,'citations')&&JSON.stringify(d.citations)!==JSON.stringify(i.citations);if(changed&&!d.notes)fail(400,'correction_reason_required','Explain each corrected action, target or grouping so the decision remains traceable.');d.corrected=changed;const out={...i,action:d.action,reason:changed?'Reviewer correction: '+d.notes:i.reason,answer:Object.hasOwn(d,'answer')?d.answer:i.answer,citations:Object.hasOwn(d,'citations')?d.citations:i.citations};for(const k of ['targetTaskId','duplicateOfItemId','groupId'])out[k]=Object.hasOwn(d,k)?d[k]:(d.action!==i.action?null:i[k]);
    if(out.action!=='already_answered')out.answer='';
    if(out.action==='link_duplicate')out.groupId=null;
    if(out.action!=='link_duplicate')out.duplicateOfItemId=null;
    if(out.action==='create_task')out.targetTaskId=null;
    return out;
  }).filter(Boolean);
  // Validate retained references and answers after human corrections. Rejected
  // requests remain preserved, so coverage is checked against original proposal.
  const activeRequestIds=new Set(correctedItems.map(i=>i.sourceDocumentId));
  const corrected=correctedItems.length?validateConsolidationResult({...proposal,items:correctedItems},{...payload,documents:payload.documents.filter(d=>d.kind==='reference'||activeRequestIds.has(d.id))},board):{...proposal,items:[]};
  const next=clone(board);next.documents=combinedDocuments(board,payload.documents).map(clone);next.appliedJobIds=[...(next.appliedJobIds||[]),jobId];
  const groupMap=new Map(),itemTaskMap=new Map();const effects=[];
  for(const group of corrected.groups.filter(g=>corrected.items.some(i=>i.groupId===g.id))){const task=baseTask({id:newId('group'),type:'group',title:group.title,requirement:group.reason},at);next.tasks.push(task);groupMap.set(group.id,task.id);}
  for(const item of corrected.items){
    const d=byItem.get(item.id),link={jobId,itemId:item.id,documentId:item.sourceDocumentId,quote:item.sourceQuote,relationship:item.action};let task;
    const target=next.tasks.find(t=>t.id===item.targetTaskId);
    if(item.action==='link_duplicate'){
      task=target||next.tasks.find(t=>t.id===itemTaskMap.get(item.duplicateOfItemId));if(!task)fail(400,'invalid_board_result','A duplicate target was rejected or could not be retained.');task.sources.push(link);appendRequirement(task,item);task.updatedAt=at;
    }else{
      const parentId=item.action==='add_subtask'?item.targetTaskId||groupMap.get(item.groupId):item.action==='flag_conflict'&&item.targetTaskId?item.targetTaskId:groupMap.get(item.groupId)||null;
      task=baseTask({...item,id:newId('task'),parentId,sources:[link],status:item.action==='already_answered'?'resolved':'open',resolutionCitations:item.action==='already_answered'?item.citations:[],answer:item.action==='already_answered'?item.answer:''},at);next.tasks.push(task);
      if(item.action==='add_subtask'&&target?.status==='resolved'){target.status='open';target.updatedAt=at;effects.push({type:'reopened_parent',taskId:target.id,itemId:item.id,reason:'A distinct unresolved subtask was added.'});}
      if(item.action==='flag_conflict'&&target){target.status='open';target.updatedAt=at;target.sources.push({...link,relationship:'conflict'});effects.push({type:'flagged_conflict',taskId:target.id,itemId:item.id,reason:item.reason});}
    }
    if(task.status==='open'){const reopened=reopenAncestors(next,task.id,at);if(reopened.length)effects.push({type:'reopened_ancestors',taskIds:reopened,itemId:item.id,reason:'An unresolved descendant is now tracked under this work.'});}
    itemTaskMap.set(item.id,task.id);effects.push({itemId:item.id,action:item.action,taskId:task.id,targetTaskId:item.targetTaskId,duplicateOfItemId:item.duplicateOfItemId,groupId:item.groupId,reason:item.reason,notes:d.notes,requirement:item.requirement});
  }
  next.version=board.version+1;validateBoardCapacity(next);
  const reviewedItems=new Map(corrected.items.map(i=>[i.id,i]));
  return {board:next,decisions:proposal.items.map(i=>{const applied=reviewedItems.get(i.id);return {...byItem.get(i.id),targetTaskId:applied?.targetTaskId??null,duplicateOfItemId:applied?.duplicateOfItemId??null,groupId:applied?.groupId??null,proposedAction:i.action,proposedReason:i.reason,reviewedAnswer:applied?.answer??'',reviewedCitations:applied?.citations??[],requirement:i.requirement,sourceDocumentId:i.sourceDocumentId,sourceQuote:i.sourceQuote};}),effects,rejected,metrics:validateBoardMetrics(request.metrics)};
}
export function changeBoardTask(board,taskId,request,{newId,at}){
  validateMutation(request);if(request.expectedVersion!==board.version)fail(409,'board_changed','The board changed. Refresh before editing this task.');
  const next=clone(board),task=next.tasks.find(t=>t.id===taskId);if(!task)fail(404,'not_found','Task not found.');
  const operation=choose(request.operation,['move','split','resolve','reopen'],'task operation');let createdTask=null;
  if(operation==='move'){
    const parentId=optionalId(request.parentId,'Parent task ID');if(parentId){let p=next.tasks.find(t=>t.id===parentId);if(!p)fail(400,'invalid_board_input','Parent task does not exist.');const visited=new Set([taskId]);while(p){if(visited.has(p.id))fail(400,'task_cycle','A task cannot be moved beneath itself or one of its descendants.');visited.add(p.id);p=p.parentId?next.tasks.find(t=>t.id===p.parentId):null;}}
    task.parentId=parentId;
  }else if(operation==='split'){
    if(task.type!=='task')fail(400,'invalid_board_input','Split a task, not an organizational group.');
    createdTask=baseTask({id:newId('task'),title:text(request.title,'Split task title',160),requirement:text(request.requirement,'Split requirement',4000),location:task.location,discipline:task.discipline,revision:task.revision,parentId:task.parentId,sources:clone(task.sources)},at);next.tasks.push(createdTask);
    // The original and its evidence remain intact; the audit identifies this
    // explicitly reviewed split so no source detail is silently discarded.
  }else if(operation==='resolve'){
    if(task.type==='group')fail(400,'invalid_board_input','Groups organize work and cannot be resolved as if they were an RFI.');
    if(openTaskWithin(next,task.id))fail(409,'open_subtasks','Resolve or move open subtasks before resolving their parent.');
    task.answer=text(request.answer,'Reviewed answer',4000);task.resolutionCitations=validateBoardCitations(request.citations,next.documents,{approvedOnly:true,required:true});task.status='resolved';
  }else{task.status='open';}
  const reopenedTaskIds=[];if(openTaskWithin(next,task.id,true))reopenedTaskIds.push(...reopenAncestors(next,task.id,at));if(createdTask)reopenedTaskIds.push(...reopenAncestors(next,createdTask.id,at));task.updatedAt=at;next.version=board.version+1;validateBoardCapacity(next);
  return {board:next,effects:[{operation,taskId,createdTaskId:createdTask?.id??null,reopenedTaskIds:[...new Set(reopenedTaskIds)],notes:request.notes||''}],createdTask};
}
export function undoBoard(board,event,request){
  validateMutation(request);if(request.expectedVersion!==board.version||event.version!==board.version||event.undone_by||event.kind==='undo')fail(409,'cannot_undo','Only the latest board change can be undone, before any intervening work.');
  const before=JSON.parse(event.before_json),restored=clone(before);restored.version=board.version+1;
  // Undo organizational decisions, never original source ingestion.
  restored.documents=combinedDocuments(before,board.documents).map(clone);validateBoardCapacity(restored);return restored;
}


export function changeBoardDocument(board,documentId,request,{at}){
  object(request,'Source status change');keys(request,['expectedVersion','clientMutationId','notes','current','approval'],'Source status change');
  const mutation=validateMutation(request);if(!mutation.notes)fail(400,'correction_reason_required','Explain the source status change.');
  if(request.expectedVersion!==board.version)fail(409,'board_changed','The board changed. Refresh before changing source status.');
  if(typeof request.current!=='boolean')fail(400,'invalid_board_input','Choose whether the source is current.');
  const next=clone(board),document=next.documents.find(d=>d.id===documentId);if(!document)fail(404,'not_found','Source document not found.');
  const previous={current:document.current,approval:document.approval};document.current=request.current;if(Object.hasOwn(request,'approval'))document.approval=choose(request.approval,['approved','draft','informal'],'source approval');
  const reopened=[];if(!document.current||document.approval!=='approved'||document.kind!=='reference')for(const task of next.tasks){if(task.status==='resolved'&&task.resolutionCitations.some(c=>c.documentId===documentId)){task.status='open';task.updatedAt=at;reopened.push(task.id,...reopenAncestors(next,task.id,at));}}
  next.version=board.version+1;return {board:next,effects:[{operation:'source_state',documentId,previous,current:document.current,approval:document.approval,reopenedTaskIds:[...new Set(reopened)],notes:mutation.notes}]};
}
