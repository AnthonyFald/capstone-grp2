import {BoardError,emptyBoard,validateConsolidationResult,validateMutation,applyConsolidation,changeBoardTask,changeBoardDocument,undoBoard,combinedDocuments,validateBoardCapacity} from './consolidation.mjs';
const fail=(status,code,message)=>{throw new BoardError(status,code,message);};
const id=prefix=>prefix+'_'+crypto.randomUUID();
const at=()=>new Date().toISOString();
const json=JSON.stringify;
const rows=r=>r?.results||[];
const changes=r=>Number(r?.meta?.changes||0);
async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export const publicBoard=board=>({version:board.version,tasks:board.tasks,documents:board.documents});
export async function readBoard(db){const row=await db.prepare("SELECT * FROM board_state WHERE id='main'").first();if(!row)fail(503,'board_setup_required','The task board migration has not been installed.');return {...JSON.parse(row.state_json),version:Number(row.version)};}
export async function checkIncomingBoard(db,payload){const board=await readBoard(db);const documents=combinedDocuments(board,payload.documents);validateBoardCapacity({...board,documents});}
export async function freezeBoard(db,jobId){
  await db.prepare("INSERT OR IGNORE INTO board_snapshots(job_id,board_version,state_json,created_at) SELECT ?,version,state_json,? FROM board_state WHERE id='main'").bind(jobId,at()).run();
  const saved=await db.prepare('SELECT * FROM board_snapshots WHERE job_id=?').bind(jobId).first();if(!saved)fail(503,'board_setup_required','The board snapshot could not be prepared.');return publicBoard({...JSON.parse(saved.state_json),version:Number(saved.board_version)});
}
export async function readFrozenBoard(db,jobId){const row=await db.prepare('SELECT * FROM board_snapshots WHERE job_id=?').bind(jobId).first();if(!row)fail(409,'missing_snapshot','This proposal has no frozen board snapshot. Queue it again.');return publicBoard({...JSON.parse(row.state_json),version:Number(row.board_version)});}
function eventView(row,currentVersion){const d=JSON.parse(row.detail_json);return {id:row.id,kind:row.kind,jobId:row.job_id,baseVersion:row.base_version,version:row.version,actorId:row.actor_id,createdAt:row.created_at,undoneBy:row.undone_by,canUndo:row.kind!=='undo'&&!row.undone_by&&row.version===currentVersion,...d};}
function boardReview(row){if(!row)return null;return {id:row.id,eventId:row.event_id,jobId:row.job_id,createdAt:row.created_at,reviewerId:row.reviewer_id,decisions:JSON.parse(row.decisions_json),metrics:JSON.parse(row.metrics_json),applied:!row.undone_by};}
export async function boardJobDetails(db,jobId){
  const snapshot=await db.prepare('SELECT * FROM board_snapshots WHERE job_id=?').bind(jobId).first();
  const review=await db.prepare('SELECT br.*,r.created_at,r.reviewer_id,e.undone_by FROM board_reviews br JOIN reviews r ON r.id=br.id JOIN board_events e ON e.id=br.event_id WHERE br.job_id=? ORDER BY e.version DESC LIMIT 1').bind(jobId).first();
  const current=await readBoard(db),events=rows(await db.prepare('SELECT * FROM board_events WHERE job_id=? ORDER BY version DESC').bind(jobId).all());
  return {boardSnapshot:snapshot?publicBoard({...JSON.parse(snapshot.state_json),version:snapshot.board_version}):null,boardReview:boardReview(review),consolidationEvents:events.map(e=>eventView(e,current.version))};
}
export async function getBoard(db){const board=await readBoard(db),events=rows(await db.prepare('SELECT * FROM board_events ORDER BY version DESC LIMIT 100').all());return {board:publicBoard(board),appliedJobIds:board.appliedJobIds||[],events:events.map(e=>eventView(e,board.version))};}
async function priorMutation(db,principal,request,requestHash){
  const previous=await db.prepare('SELECT * FROM board_events WHERE actor_id=? AND client_mutation_id=?').bind(principal.id,request.clientMutationId).first();
  if(!previous)return null;if(previous.request_hash!==requestHash)fail(409,'idempotency_conflict','This change request ID belongs to a different operation.');
  const board=await readBoard(db);const result={board:publicBoard(board),event:eventView(previous,board.version),idempotent:true};
  if(previous.job_id){const detail=await boardJobDetails(db,previous.job_id);result.review=detail.boardReview;}
  return result;
}
async function writeMutation(db,principal,before,after,{eventId,kind,jobId=null,request,requestHash,detail,review=null,undoEvent=null}){
  const timestamp=at(),afterJson=json(after),version=after.version;
  const conditions="EXISTS(SELECT 1 FROM board_state WHERE id='main' AND version=? AND mutation_id=?)";
  const statements=[
    db.prepare("UPDATE board_state SET version=?,mutation_id=?,updated_at=?,state_json=? WHERE id='main' AND version=?").bind(version,eventId,timestamp,afterJson,before.version),
    db.prepare('INSERT INTO board_events(id,actor_id,created_at,kind,job_id,base_version,version,client_mutation_id,request_hash,before_json,after_json,detail_json) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE '+conditions).bind(eventId,principal.id,timestamp,kind,jobId,before.version,version,request.clientMutationId,requestHash,json(before),afterJson,json(detail),version,eventId)
  ];
  if(review){
    statements.push(db.prepare("INSERT INTO reviews(id,job_id,reviewer_id,created_at,decision,corrected_answer,notes,citations_json,metrics_json) SELECT ?,?,?,?,'needs_review','',?,'[]','{}' WHERE "+conditions).bind(review.id,jobId,principal.id,timestamp,review.notes,version,eventId));
    statements.push(db.prepare('INSERT INTO board_reviews(id,job_id,event_id,decisions_json,metrics_json) SELECT ?,?,?,?,? WHERE '+conditions).bind(review.id,jobId,eventId,json(review.decisions),json(review.metrics),version,eventId));
  }
  if(undoEvent)statements.push(db.prepare('UPDATE board_events SET undone_by=? WHERE id=? AND undone_by IS NULL AND '+conditions).bind(eventId,undoEvent,version,eventId));
  statements.push(db.prepare('INSERT INTO audit_events(id,at,actor_id,event,subject_id,detail_json) SELECT ?,?,?,?,?,? WHERE '+conditions).bind(id('event'),timestamp,principal.id,'board.'+kind,jobId||eventId,json({boardVersion:version,boardEventId:eventId}),version,eventId));
  const result=await db.batch(statements);if(!changes(result[0]))fail(409,'board_changed','Another reviewer changed the board. Refresh and review against its latest version.');
  const saved=await db.prepare('SELECT * FROM board_events WHERE id=?').bind(eventId).first();const response={board:publicBoard(after),event:eventView(saved,version),idempotent:false};
  if(review)response.review={id:review.id,eventId,jobId,reviewerId:principal.id,createdAt:timestamp,decisions:review.decisions,metrics:review.metrics,applied:true};
  return response;
}
export async function applyBoardJob(db,principal,jobId,request){
  validateMutation(request);const requestHash=await digest(json({operation:'apply',jobId,request})),previous=await priorMutation(db,principal,request,requestHash);if(previous)return previous;
  const job=await db.prepare('SELECT * FROM jobs WHERE id=?').bind(jobId).first();if(!job)fail(404,'not_found','Job not found.');
  const payload=JSON.parse(job.payload_json);if(job.status!=='completed'||payload.mode!=='consolidation')fail(409,'invalid_state','Apply a completed consolidation proposal.');
  const snapshot=await readFrozenBoard(db,jobId),proposal=validateConsolidationResult(JSON.parse(job.result_json),payload,snapshot),before=await readBoard(db),timestamp=at();
  const result=applyConsolidation(before,payload,proposal,request,{jobId,newId:id,at:timestamp});const review={id:id('review'),notes:request.notes||'Reviewed consolidation decisions; see the linked immutable board event.',decisions:result.decisions,metrics:result.metrics};
  return writeMutation(db,principal,before,result.board,{eventId:id('board_event'),kind:'apply',jobId,request,requestHash,detail:{notes:request.notes||'',decisions:result.decisions,effects:result.effects,rejected:result.rejected,reviewId:review.id},review});
}
export async function changeTask(db,principal,taskId,request){
  validateMutation(request);const requestHash=await digest(json({operation:'change_task',taskId,request})),previous=await priorMutation(db,principal,request,requestHash);if(previous)return previous;
  const before=await readBoard(db),result=changeBoardTask(before,taskId,request,{newId:id,at:at()});return writeMutation(db,principal,before,result.board,{eventId:id('board_event'),kind:request.operation,request,requestHash,detail:{notes:request.notes||'',effects:result.effects,decisions:[],rejected:[]}});
}
export async function undoChange(db,principal,request){
  validateMutation(request);if(typeof request.eventId!=='string'||request.eventId.length>100)fail(400,'invalid_board_input','Choose the latest board event.');
  const requestHash=await digest(json({operation:'undo',request})),previous=await priorMutation(db,principal,request,requestHash);if(previous)return previous;
  const before=await readBoard(db),event=await db.prepare('SELECT * FROM board_events WHERE id=?').bind(request.eventId).first();if(!event)fail(404,'not_found','Board event not found.');
  const after=undoBoard(before,event,request);return writeMutation(db,principal,before,after,{eventId:id('board_event'),kind:'undo',jobId:event.job_id,request,requestHash,detail:{notes:request.notes||'',undidEventId:event.id,effects:[],decisions:[],rejected:[]},undoEvent:event.id});
}
export async function boardMetrics(db){
  const current=await readBoard(db),records=rows(await db.prepare('SELECT br.*,j.cohort,j.timings_json,e.undone_by FROM board_reviews br JOIN jobs j ON j.id=br.job_id JOIN board_events e ON e.id=br.event_id ORDER BY e.version DESC').all());
  const seen=new Set(),active=records.filter(r=>{if(r.undone_by||seen.has(r.job_id))return false;seen.add(r.job_id);return true;});
  const aggregate=entries=>{
    const counts={reviewedBatches:entries.length,duplicateLinks:0,answeredRequests:0,groupedRequirements:0,createdTasks:0,conflicts:0,rejectedRequirements:0,correctedDecisions:0},assessed={},sums={};
    for(const r of entries){for(const d of JSON.parse(r.decisions_json)){if(d.action==='link_duplicate')counts.duplicateLinks++;if(d.action==='already_answered')counts.answeredRequests++;if(d.action==='add_subtask'||d.groupId)counts.groupedRequirements++;if(d.action==='create_task')counts.createdTasks++;if(d.action==='flag_conflict')counts.conflicts++;if(d.action==='reject')counts.rejectedRequirements++;if(d.corrected||d.action!==d.proposedAction)counts.correctedDecisions++;}
      for(const [k,v] of Object.entries(JSON.parse(r.metrics_json))){assessed[k]=(assessed[k]||0)+1;sums[k]=(sums[k]||0)+v;}}
    return {...counts,measured:Object.fromEntries(Object.entries(sums).map(([k,value])=>[k,{value,samples:assessed[k]}]))};
  };
  return {boardVersion:current.version,...aggregate(active),byCohort:['baseline','learning','holdout'].map(cohort=>({cohort,...aggregate(active.filter(r=>r.cohort===cohort))})),notice:'Task grouping and duplicate links are workflow counts, not measured RFI reduction. Quality fields are reported only when explicitly assessed by a human. Compare matched manual and assisted unnecessary RFI decisions; retained lessons alone do not establish improvement.'};
}

export async function changeDocument(db,principal,documentId,request){
  validateMutation(request);const requestHash=await digest(json({operation:'change_document',documentId,request})),previous=await priorMutation(db,principal,request,requestHash);if(previous)return previous;
  const before=await readBoard(db),result=changeBoardDocument(before,documentId,request,{at:at()});return writeMutation(db,principal,before,result.board,{eventId:id('board_event'),kind:'source_state',request,requestHash,detail:{notes:request.notes||'',effects:result.effects,decisions:[],rejected:[]}});
}
