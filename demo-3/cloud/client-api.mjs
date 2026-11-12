import {applyConsolidation, combinedDocuments, emptyBoard, validateBoardCapacity} from './consolidation.mjs';
import {publicBoard, readFrozenBoard} from './board-api.mjs';

export const CLIENT_PREFIX = '/client';
export class ClientError extends Error {
  constructor(status, code, message) {
    super(message);
    Object.assign(this, {status, code});
  }
}

const fail = (status, code, message) => { throw new ClientError(status, code, message); };
const encoder = new TextEncoder();
const id = label => label + '_' + crypto.randomUUID();
const hex = buffer => Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');
const random = length => hex(crypto.getRandomValues(new Uint8Array(length)));
const now = () => new Date().toISOString();
const future = ms => new Date(Date.now() + ms).toISOString();
const json = JSON.stringify;
const parse = (value, fallback = null) => value == null ? fallback : JSON.parse(value);
const sessionAge = 12 * 60 * 60;
const cookieName = 'evergreen_client';

function string(value, label, min, max) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max || /\u0000/.test(value)) {
    fail(400, 'invalid_input', label + ' must contain ' + min + '–' + max + ' characters.');
  }
  return value.trim();
}

function email(value) {
  const address = string(value, 'Email address', 5, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) fail(400, 'invalid_email', 'Enter a valid email address.');
  return address;
}

function passwordProof(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(400, 'invalid_password', 'Refresh the page and use the sign-in form.');
  return value;
}

async function digest(value) {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

async function passwordHash(value, salt, env) {
  // Domain separation keeps client-password material distinct from owner-key use.
  // Deployments can set a dedicated stable pepper before creating any accounts.
  const pepper = env.CAPSTONE_CLIENT_AUTH_PEPPER || env.CAPSTONE_OWNER_TOKEN;
  if (typeof pepper !== 'string' || pepper.length < 32) fail(503, 'setup_required', 'Client sign-in is not available yet.');
  const mac = await crypto.subtle.importKey('raw', encoder.encode(pepper), {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', mac, encoder.encode('evergreen-client-password-proof-v1\u0000' + salt + '\u0000' + value)));
}

function equal(left, right) {
  let difference = left.length ^ right.length;
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}

function setSessionCookie(request, response, token, age) {
  const headers = new Headers(response.headers);
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  headers.set('Set-Cookie', cookieName + '=' + token + '; Path=/api/capstone/v1/client; Max-Age=' + age + '; HttpOnly; SameSite=Strict' + secure);
  return new Response(response.body, {status:response.status, headers});
}

function sessionToken(request) {
  const cookie = (request.headers.get('cookie') || '').split(';').map(part => part.trim()).find(part => part.startsWith(cookieName + '='));
  const token = cookie?.slice(cookieName.length + 1);
  return /^[a-f0-9]{64}$/.test(token || '') ? token : null;
}

async function userFor(request, db) {
  const token = sessionToken(request);
  if (!token) fail(401, 'unauthorized', 'Sign in to open your project.');
  const user = await db.prepare("SELECT u.id,u.project_id,u.name,u.email,u.role,u.trade,p.name AS project_name,EXISTS(SELECT 1 FROM client_users g WHERE g.project_id=u.project_id AND g.role='gc') AS joined_project FROM client_sessions s JOIN client_users u ON u.id=s.user_id JOIN client_projects p ON p.id=u.project_id WHERE s.token_hash=? AND s.expires_at>?").bind(await digest(token), now()).first();
  if (!user) fail(401, 'unauthorized', 'Your session ended. Sign in again.');
  return user;
}

function accountView(user) {
  return {
    user:{id:user.id,name:user.name,email:user.email,role:user.role,trade:user.trade},
    project:{id:user.project_id,name:user.project_name},
    capabilities:{submit:true,review:true,invite:user.role === 'gc',share:user.role === 'sub' && !!user.joined_project}
  };
}

async function newSession(request, env, user, reply, status) {
  const token = random(32);
  const db = env.CAPSTONE_DB;
  const at = now();
  await db.batch([
    db.prepare('DELETE FROM client_sessions WHERE expires_at<=?').bind(at),
    db.prepare('DELETE FROM client_sessions WHERE user_id=? AND token_hash IN (SELECT token_hash FROM client_sessions WHERE user_id=? ORDER BY created_at DESC,token_hash LIMIT -1 OFFSET 7)').bind(user.id,user.id),
    db.prepare('INSERT INTO client_sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)').bind(await digest(token),user.id,at,future(sessionAge*1000))
  ]);
  return setSessionCookie(request, reply(accountView(user),status), token, sessionAge);
}

async function throttle(request, db, operation, address) {
  const bucket = Math.floor(Date.now() / 900000);
  const connection = request.headers.get('CF-Connecting-IP') || 'local';
  const limits = operation === 'signup' ? [24, 6, 4] : [300, 35, 12];
  const scopes = [operation + ':all', operation + ':ip:' + await digest(connection), operation + ':email:' + await digest(address)];
  for (let index = 0; index < scopes.length; index++) {
    const allowed = await db.prepare('INSERT INTO client_auth_rates(scope,bucket,hits) VALUES(?,?,1) ON CONFLICT(scope,bucket) DO UPDATE SET hits=hits+1 WHERE hits<? RETURNING hits').bind(scopes[index],bucket,limits[index]).first();
    if (!allowed) fail(429, 'try_later', 'Too many attempts. Try again in a few minutes.');
  }
  await db.prepare('DELETE FROM client_auth_rates WHERE bucket<?').bind(bucket-1).run();
}

async function signUp(request, env, tools) {
  if (env.CAPSTONE_CLIENT_SIGNUPS === 'closed') fail(403, 'signup_closed', 'New project signups are closed.');
  const db = env.CAPSTONE_DB, body = await tools.body(request);
  const address = email(body.email), name = string(body.name, 'Name', 2, 100), credential = passwordProof(body.passwordProof);
  const role = body.role;
  if (!['gc','sub'].includes(role)) fail(400, 'invalid_role', 'Choose general contractor or subcontractor.');
  await throttle(request, db, 'signup', address);
  const at = now(), userId = id('client'), salt = random(16);
  let projectId, projectName, trade = '', invitation = null, codeHash = null;
  if (typeof body.inviteCode === 'string' && body.inviteCode.trim()) {
    const code = body.inviteCode.trim();
    if (role !== 'sub' || !/^invite_[a-f0-9]{48}$/.test(code)) fail(400, 'invalid_invite', 'Use the subcontractor invite from your general contractor.');
    codeHash = await digest(code);
    invitation = await db.prepare('SELECT i.*,p.name AS project_name FROM client_invites i JOIN client_projects p ON p.id=i.project_id WHERE i.code_hash=? AND i.email=? AND i.used_by IS NULL AND i.expires_at>?').bind(codeHash,address,at).first();
    if (!invitation) fail(400, 'invalid_invite', 'This invitation is unavailable for this email address.');
    ({project_id:projectId, project_name:projectName, trade} = invitation);
  } else {
    projectId = id('project');
    projectName = string(body.projectName, 'Project name', 2, 120);
    if (role === 'sub' && body.trade) trade = string(body.trade,'Trade or scope',1,100);
  }
  const hash = await passwordHash(credential, salt, env);
  const statements = [];
  if (invitation) {
    statements.push(db.prepare('UPDATE client_invites SET used_by=? WHERE code_hash=? AND email=? AND used_by IS NULL AND expires_at>? AND (SELECT COUNT(*) FROM client_users)<200').bind(userId,codeHash,address,at));
    statements.push(db.prepare('INSERT INTO client_users(id,project_id,name,email,role,trade,password_salt,password_hash,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM client_invites WHERE code_hash=? AND used_by=?)').bind(userId,projectId,name,address,role,trade,salt,hash,at,codeHash,userId));
  } else {
    statements.push(db.prepare('INSERT INTO client_projects(id,name,created_at) SELECT ?,?,? WHERE (SELECT COUNT(*) FROM client_users)<200').bind(projectId,projectName,at));
    statements.push(db.prepare('INSERT INTO client_users(id,project_id,name,email,role,trade,password_salt,password_hash,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM client_projects WHERE id=?)').bind(userId,projectId,name,address,role,trade,salt,hash,at,projectId));
  }
  let results;
  try { results = await db.batch(statements); }
  catch (error) {
    if (/UNIQUE constraint.*client_users\.email/i.test(error.message)) fail(409, 'account_exists', 'An account already uses this email. Sign in.');
    throw error;
  }
  if (!results[1]?.meta?.changes) {
    if (invitation) fail(409, 'invite_unavailable', 'The invitation has already been used or the free signup limit was reached.');
    fail(429, 'signup_capacity', 'The free demo has reached its signup limit.');
  }
  return newSession(request,env,{id:userId,project_id:projectId,project_name:projectName,name,email:address,role,trade,joined_project:!!invitation},tools.reply,201);
}

async function signIn(request, env, tools) {
  const db = env.CAPSTONE_DB, body = await tools.body(request);
  const address = email(body.email), credential = passwordProof(body.passwordProof);
  await throttle(request,db,'login',address);
  const user = await db.prepare("SELECT u.*,p.name AS project_name,EXISTS(SELECT 1 FROM client_users g WHERE g.project_id=u.project_id AND g.role='gc') AS joined_project FROM client_users u JOIN client_projects p ON p.id=u.project_id WHERE u.email=?").bind(address).first();
  const actual = await passwordHash(credential, user?.password_salt || '0'.repeat(32), env);
  if (!equal(actual,user?.password_hash || '0'.repeat(64)) || !user) fail(401,'invalid_credentials','The email or password is incorrect.');
  return newSession(request,env,user,tools.reply,200);
}

async function invite(request, db, user, tools) {
  if (user.role !== 'gc') fail(403,'forbidden','Only the general contractor can invite teammates.');
  const body = await tools.body(request);
  const address = email(body.email), trade = body.trade ? string(body.trade,'Trade or scope',1,100) : '';
  const at = now(), expiresAt = future(48*3600000), code = 'invite_' + random(24);
  const created = await db.prepare('INSERT INTO client_invites(code_hash,project_id,email,trade,created_at,expires_at) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM client_invites WHERE project_id=? AND expires_at>? AND used_by IS NULL)<15').bind(await digest(code),user.project_id,address,trade,at,expiresAt,user.project_id,at).run();
  if (!created.meta?.changes) fail(429,'invite_capacity','This project has reached its open-invitation limit.');
  return tools.reply({code,expiresAt},201);
}

const access = '(cr.user_id=? OR (cr.project_id=? AND cr.shared=1 AND ?=\'gc\'))';
const accessParams = user => [user.id,user.project_id,user.role];
const latestEvaluation = 'LEFT JOIN client_evaluations e ON e.id=(SELECT id FROM client_evaluations WHERE job_id=j.id ORDER BY created_at DESC,id DESC LIMIT 1)';

function runView(row, user) {
  return {
    id:row.id,title:row.title,kind:row.kind,status:row.status,stage:row.stage,
    createdAt:row.created_at,completedAt:row.completed_at,
    shared:!!row.shared,owner:row.user_id===user.id,submittedBy:row.submitted_by,
    reviewed:!!row.review_id,timings:parse(row.timings_json),
    canReview:row.status==='completed'&&!row.own_review,
    canShare:row.user_id===user.id&&!!row.shareable,
    error:row.status==='failed'?'The processing host could not complete this run.':null
  };
}

function reviewView(row) {
  return row?.review_id ? {decision:row.review_decision,notes:row.review_notes,metrics:parse(row.metrics_json,{}),createdAt:row.review_at,applied:!!row.review_applied} : null;
}

const runFields = 'j.id,j.title,j.kind,j.status,j.stage,j.created_at,j.completed_at,j.timings_json,cr.user_id,cr.project_id,cr.shared,cr.shareable,u.name AS submitted_by,e.id AS review_id,e.metrics_json,e.decision AS review_decision,e.notes AS review_notes,e.created_at AS review_at,e.applied AS review_applied';
const ownReview = 'EXISTS(SELECT 1 FROM client_evaluations WHERE job_id=j.id AND reviewer_id=?) AS own_review';
const runTables = 'FROM client_runs cr JOIN jobs j ON j.id=cr.job_id JOIN client_users u ON u.id=cr.user_id ' + latestEvaluation;

async function getRun(db, user, runId) {
  const row = await db.prepare('SELECT '+runFields+','+ownReview+',j.payload_json,j.result_json,j.provenance_json '+runTables+' WHERE j.id=? AND '+access).bind(user.id,runId,...accessParams(user)).first();
  if (!row) fail(404,'not_found','This run is unavailable.');
  return row;
}

async function readClientBoard(db, userId, shareable) {
  const row = await db.prepare('SELECT state_json FROM client_boards WHERE user_id=? AND shareable=?').bind(userId,shareable).first();
  return row ? parse(row.state_json) : emptyBoard();
}

function metricsView(rows) {
  const evaluation = {reviewedRuns:0, assessedRuns:0, generationSeconds:0, reviewSeconds:0, manualSeconds:0, matchedRuns:0, assistedSeconds:0, matchedManualSeconds:0, correctFacts:0, incorrectFacts:0, missingFacts:0, extraErrors:0, accuracy:null, completeness:null};
  for (const row of rows) {
    const generation = parse(row.timings_json)?.totalMs;
    if (Number.isFinite(generation)) evaluation.generationSeconds += generation / 1000;
    const metrics = reviewView(row)?.metrics;
    if (!metrics) continue;
    evaluation.reviewedRuns++;
    if (Number.isFinite(metrics.reviewSeconds)) evaluation.reviewSeconds += metrics.reviewSeconds;
    if (Number.isFinite(metrics.manualSeconds)) evaluation.manualSeconds += metrics.manualSeconds;
    if (Number.isFinite(generation) && Number.isFinite(metrics.reviewSeconds) && metrics.manualSeconds>0) {
      evaluation.matchedRuns++;
      evaluation.assistedSeconds += generation/1000 + metrics.reviewSeconds;
      evaluation.matchedManualSeconds += metrics.manualSeconds;
    }
    const keys = ['correctFacts','incorrectFacts','missingFacts','extraErrors'];
    if (keys.every(key => Number.isInteger(metrics[key]))) {
      evaluation.assessedRuns++;
      for (const key of keys) evaluation[key] += metrics[key];
    }
  }
  const claims = evaluation.correctFacts + evaluation.incorrectFacts + evaluation.extraErrors;
  const required = evaluation.correctFacts + evaluation.incorrectFacts + evaluation.missingFacts;
  if (claims) evaluation.accuracy = 100*evaluation.correctFacts/claims;
  if (required) evaluation.completeness = 100*evaluation.correctFacts/required;
  return evaluation;
}

async function dashboard(db, user, reply) {
  const result = await db.prepare('SELECT '+runFields+','+ownReview+' '+runTables+' WHERE '+access+' ORDER BY j.created_at DESC,j.id DESC LIMIT 40').bind(user.id,...accessParams(user)).all();
  const rows = result.results || [];
  const last = await db.prepare("SELECT MAX(last_seen_at) AS last_seen_at FROM principals WHERE role='runner' AND revoked_at IS NULL").first();
  const lastSeenAt = last?.last_seen_at || null;
  const board = publicBoard(await readClientBoard(db,user.id,0));
  const sharedBoard = user.role==='sub' && user.joined_project ? publicBoard(await readClientBoard(db,user.id,1)) : null;
  return reply({...accountView(user), runner:{online:!!lastSeenAt&&Date.parse(lastSeenAt)>Date.now()-90000,lastSeenAt},runs:rows.map(row=>runView(row,user)),board,sharedBoard,evaluation:metricsView(rows)});
}

async function queue(request, db, user, tools) {
  const body = await tools.body(request);
  const kind = body.kind;
  if (!['rfi','meeting','daily'].includes(kind)) fail(400,'invalid_kind','Choose a project workflow.');
  const title = string(body.title,'Run name',2,140);
  const clientRequestId = string(body.clientRequestId,'Request ID',1,100);
  const dataClassification = body.dataClassification;
  if (!['synthetic','authorized'].includes(dataClassification)) fail(400,'invalid_classification','Confirm the project data is fictional or authorized.');
  const payload = tools.validatePayload(kind,body.payload);
  if (kind==='rfi' && payload.mode!=='consolidation') fail(400,'invalid_mode','Submit a document consolidation batch.');
  const canShare = user.role==='sub' && user.joined_project;
  if (body.shared===true && !canShare) fail(400,'invalid_share','Only invited subcontractors can share runs with their general contractor.');
  const shareable = canShare && body.shared===true ? 1 : 0;
  const requestHash = await digest(json({kind,title,payload,dataClassification,shareable}));
  const existing = async () => {
    const previous = await db.prepare('SELECT id,request_hash FROM jobs WHERE created_by=? AND client_request_id=?').bind(user.id,clientRequestId).first();
    if (!previous) return null;
    if (previous.request_hash!==requestHash) fail(409,'idempotency_conflict','This request ID belongs to a different run.');
    return tools.reply({run:runView(await getRun(db,user,previous.id),user)});
  };
  const duplicate = await existing();
  if (duplicate) return duplicate;
  const at = now(), runId = id('job'), inputHash = await digest(json(payload));
  let board = null;
  if (kind==='rfi') {
    board = await readClientBoard(db,user.id,shareable);
    validateBoardCapacity({...board,documents:combinedDocuments(board,payload.documents)});
  }
  const insert = db.prepare(`INSERT OR IGNORE INTO jobs(id,kind,title,data_classification,status,cohort,payload_json,input_sha256,request_hash,client_request_id,created_by,created_at,not_before,lesson_policy,lesson_version,lesson_snapshot_json)
    SELECT ?,?,?,?,'queued','baseline',?,?,?,?,?,?,?,'fixed',0,'[]'
    WHERE (SELECT COUNT(*) FROM client_runs)<200 AND (SELECT COUNT(*) FROM client_runs WHERE user_id=?)<30
    AND (SELECT COUNT(*) FROM client_runs cr JOIN jobs j ON j.id=cr.job_id WHERE j.status IN ('queued','running'))<20
    AND (SELECT COUNT(*) FROM client_runs cr JOIN jobs j ON j.id=cr.job_id WHERE cr.user_id=? AND j.status IN ('queued','running'))<3`)
    .bind(runId,kind,title,dataClassification,json(payload),inputHash,requestHash,clientRequestId,user.id,at,at,user.id,user.id);
  const statements = [insert, db.prepare('INSERT INTO client_runs(job_id,user_id,project_id,shareable,shared) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM jobs WHERE id=?)').bind(runId,user.id,user.project_id,shareable,shareable,runId)];
  if (board) statements.push(db.prepare('INSERT INTO board_snapshots(job_id,board_version,state_json,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM client_runs WHERE job_id=?)').bind(runId,board.version,json(board),at,runId));
  const saved = await db.batch(statements);
  if (!saved[0]?.meta?.changes) return await existing() || fail(429,'queue_capacity','The free queue is full for this account or site. Check pending runs before trying again.');
  return tools.reply({run:runView(await getRun(db,user,runId),user)},201);
}

async function shareRun(request, db, user, runId, tools) {
  const row = await getRun(db,user,runId), body = await tools.body(request);
  if (row.user_id!==user.id || !row.shareable || typeof body.shared!=='boolean') fail(403,'forbidden','Choose sharing when queueing the run. Private analysis can contain private project history.');
  await db.prepare('UPDATE client_runs SET shared=? WHERE job_id=? AND user_id=? AND shareable=1').bind(body.shared?1:0,runId,user.id).run();
  return tools.reply({run:runView(await getRun(db,user,runId),user)});
}

async function reviewRun(request, db, user, runId, tools) {
  const row = await getRun(db,user,runId), body = await tools.body(request);
  if (row.status!=='completed' || row.own_review) fail(409,'invalid_state','Review each completed result once.');
  if (!['accept','revise'].includes(body.decision)) fail(400,'invalid_decision','Choose accept or needs changes.');
  const notes = body.notes ? string(body.notes,'Review note',1,3000) : '';
  const metrics = tools.validateMetrics(body.metrics);
  const reviewId = id('client_eval'), at = now();
  const applied = body.decision==='accept' && row.user_id===user.id && row.kind==='rfi';
  const statements = [];
  let condition = '';
  let conditionParams = [];
  if (applied) {
    const frozen = await readFrozenBoard(db,runId);
    const before = await readClientBoard(db,user.id,row.shareable);
    if (frozen.version!==before.version) fail(409,'board_changed','Your saved project history changed. Run the batch again to accept it against the latest version.');
    const proposal = parse(row.result_json), payload = parse(row.payload_json);
    const decisions = proposal.items.map(item=>({itemId:item.id,action:item.action}));
    const result = applyConsolidation(before,payload,proposal,{expectedVersion:frozen.version,clientMutationId:reviewId,notes,decisions},{jobId:runId,newId:id,at});
    statements.push(db.prepare('INSERT INTO client_boards(user_id,shareable,version,mutation_id,state_json) SELECT ?,?,?,?,? WHERE ?=0 OR EXISTS(SELECT 1 FROM client_boards WHERE user_id=? AND shareable=?) ON CONFLICT(user_id,shareable) DO UPDATE SET version=excluded.version,mutation_id=excluded.mutation_id,state_json=excluded.state_json WHERE version=?').bind(user.id,row.shareable,result.board.version,reviewId,json(result.board),before.version,user.id,row.shareable,before.version));
    condition = ' AND EXISTS(SELECT 1 FROM client_boards WHERE user_id=? AND shareable=? AND mutation_id=?)';
    conditionParams = [user.id,row.shareable,reviewId];
  }
  statements.push(db.prepare('INSERT INTO client_evaluations(id,job_id,reviewer_id,decision,notes,metrics_json,created_at,applied) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM client_runs cr WHERE cr.job_id=? AND '+access+')'+condition).bind(reviewId,runId,user.id,body.decision,notes,json(metrics),at,applied?1:0,runId,...accessParams(user),...conditionParams));
  let results;
  try { results = await db.batch(statements); }
  catch (error) {
    if (/UNIQUE constraint.*client_evaluations/i.test(error.message)) fail(409,'already_reviewed','You already reviewed this run.');
    throw error;
  }
  if (!results.at(-1)?.meta?.changes) fail(409,'review_changed','The run or project history changed. Refresh before reviewing it.');
  const current = await getRun(db,user,runId);
  return tools.reply({run:runView(current,user),review:{decision:body.decision,notes,metrics,createdAt:at,applied}},201);
}

export async function handleClient(request, env, route, tools) {
  const db = env.CAPSTONE_DB, method = request.method;
  const name = route.slice(CLIENT_PREFIX.length);
  if (method==='POST' && name==='/signup') return signUp(request,env,tools);
  if (method==='POST' && name==='/login') return signIn(request,env,tools);
  if (method==='POST' && name==='/logout') {
    const token = sessionToken(request);
    if (token) await db.prepare('DELETE FROM client_sessions WHERE token_hash=?').bind(await digest(token)).run();
    return setSessionCookie(request,tools.reply({signedOut:true}),'',0);
  }
  const user = await userFor(request,db);
  if (method==='GET' && name==='/dashboard') return dashboard(db,user,tools.reply);
  if (method==='POST' && name==='/runs') return queue(request,db,user,tools);
  if (method==='POST' && name==='/invites') return invite(request,db,user,tools);
  const match = name.match(/^\/runs\/(job_[A-Za-z0-9-]+)(?:\/(review|share))?$/);
  if (match) {
    const [,runId,action] = match;
    if (method==='GET' && !action) {
      const row = await getRun(db,user,runId);
      const recorded = parse(row.provenance_json,{});
      const provenance = Object.fromEntries(['model','modelDigest','backend','policy','engineVersion','jobInputSha256'].filter(key=>typeof recorded[key]==='string').map(key=>[key,recorded[key]]));
      return tools.reply({run:{...runView(row,user),payload:parse(row.payload_json),result:parse(row.result_json),provenance},review:reviewView(row)});
    }
    if (method==='POST' && action==='share') return shareRun(request,db,user,runId,tools);
    if (method==='POST' && action==='review') return reviewRun(request,db,user,runId,tools);
  }
  fail(404,'not_found','Client endpoint not found.');
}
