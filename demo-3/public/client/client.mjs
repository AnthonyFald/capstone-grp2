import {extractFile, extractedDocument} from '../document-extract.mjs';
import {localDate} from '../board-model.mjs';
import {derivePasswordProof} from './auth.mjs';

const $ = id => document.getElementById(id);
const apiRoot = '/api/capstone/v1/client';
const staticLanding = location.hostname === 'anthonyfald.github.io' || location.pathname.includes('/demo-3/public/client/');
const hostedWorkspace = 'https://capstone-team2-demo3.capstone-info-492-team-2.workers.dev/client/';
if (staticLanding) {
  for (const link of document.querySelectorAll('a[href="#signin"], a[href="#signup"]')) {
    link.href = hostedWorkspace + link.getAttribute('href');
  }
}
const kinds = {
  rfi: {label: 'RFI coordination', description: 'Include at least one request and any records needed to check it.', placeholder:'East wing flooring requests'},
  meeting: {label: 'Meeting notes', description: 'Add a transcript to extract decisions, action items, and open questions.', placeholder:'East wing coordination meeting'},
  daily: {label: 'Daily reports', description: 'Add a JSON batch to check progress, blockers, and follow-up work.', placeholder:'East wing weekly reports'}
};
const statuses = {queued:'Waiting', running:'Processing', completed:'Draft ready', failed:'Needs attention', canceled:'Canceled'};
const actions = {
  create_task:'New task', add_subtask:'Related task', link_duplicate:'Link duplicate',
  already_answered:'Answer found', flag_conflict:'Conflict', needs_review:'Needs a decision'
};
const state = {dashboard:null, timer:null, dashboardRequest:0, detailRequest:0, submissionKey:null, benchmark:null};
const views = ['home', 'auth', 'workspace', 'evaluation'];
const active = status => status === 'queued' || status === 'running';
const shortDate = value => {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? date.toLocaleString(undefined, {dateStyle:'medium', timeStyle:'short'}) : '';
};
const duration = value => Number.isFinite(value) && value >= 0 ? `${Math.round(value)} s` : 'Unmeasured';
const arr = value => Array.isArray(value) ? value : [];

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(label, handler, className = 'button-secondary') {
  const node = element('button', label, 'button ' + className);
  node.type = 'button';
  node.addEventListener('click', handler);
  return node;
}
function badge(label, tone) {
  return element('span', label, 'badge ' + tone);
}
function metric(value, label) {
  const card = element('div', null, 'metric');
  card.append(element('strong', String(value)), element('span', label));
  return card;
}
function formError(form, message = '') {
  const target = form.querySelector('.form-error');
  target.textContent = message;
  target.hidden = !message;
}
function notice(message = '') {
  $('global-message').textContent = message;
  $('global-message').hidden = !message;
}
function busy(form, pending) {
  const submit = form.querySelector('[type=submit]');
  submit.disabled = pending;
  form.setAttribute('aria-busy', String(pending));
}
async function api(path, body) {
  const response = await fetch(apiRoot + path, {
    credentials:'same-origin', cache:'no-store',
    ...(body === undefined ? {} : {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)})
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || typeof data !== 'object') {
    const error = new Error(data?.error?.message || (typeof data?.error === 'string' ? data.error : 'The workspace did not respond. Try again.'));
    error.status = response.status;
    throw error;
  }
  return data;
}

function currentView() {
  const route = location.hash.slice(1);
  if (route === 'evaluation') return 'evaluation';
  if (state.dashboard) return 'workspace';
  if (!staticLanding && (route === 'signin' || route === 'signup')) return 'auth';
  return 'home';
}
function paintRoute() {
  const selected = currentView();
  for (const id of views) $(id).hidden = selected !== id;
  $('header-signin').hidden = Boolean(state.dashboard);
  $('signout').hidden = !state.dashboard;
  $('workspace-link').hidden = !state.dashboard;
  if (selected === 'auth') {
    const signup = location.hash === '#signup';
    $('auth-heading').textContent = signup ? 'Create your account.' : 'Welcome back.';
    $('auth-intro').textContent = signup ? 'Choose your role and start a private project, or join a GC with an invitation.' : 'Sign in to see your project and its review queue.';
    $('signin-form').hidden = signup;
    $('signup-form').hidden = !signup;
    for (const [id, selectedTab] of [['signin-tab', !signup], ['signup-tab', signup]]) {
      if (selectedTab) $(id).setAttribute('aria-current', 'page');
      else $(id).removeAttribute('aria-current');
    }
  }
  if (selected === 'workspace') paintDashboard();
  if (selected === 'evaluation') renderEvaluation();
  scheduleRefresh();
}
function navigate(route) {
  if (location.hash === '#' + route) paintRoute();
  else location.hash = route;
}
async function refreshDashboard({quiet = false} = {}) {
  const requestId = ++state.dashboardRequest;
  try {
    const data = await api('/dashboard');
    if (requestId !== state.dashboardRequest) return;
    if (!data.user || !data.project) throw Error('The workspace returned an incomplete session.');
    state.dashboard = data;
    if (!quiet) notice();
  } catch (error) {
    if (requestId !== state.dashboardRequest) return;
    if (error.status === 401) {
      const hadSession = Boolean(state.dashboard);
      state.dashboard = null;
      if (hadSession) {
        for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
        notice('Your session ended. Sign in again to continue.');
        navigate('signin');
      }
    } else if (!quiet) notice(error.message);
  }
  if (requestId !== state.dashboardRequest) return;
  paintRoute();
}
function scheduleRefresh() {
  clearTimeout(state.timer);
  if (document.hidden || currentView() !== 'workspace' || !arr(state.dashboard?.runs).some(run => active(run.status))) return;
  state.timer = setTimeout(() => refreshDashboard({quiet:true}), 12000);
}
function authForm(form, path, payload) {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    formError(form);
    busy(form, true);
    try {
      const {password, ...fields} = payload(new FormData(form));
      const passwordProof = await derivePasswordProof(fields.email, password);
      await api(path, {...fields, passwordProof});
      form.reset();
      syncSignup();
      await refreshDashboard();
      if (state.dashboard) navigate('workspace');
      else formError(form, 'Sign-in could not be confirmed. Please try again.');
    } catch (error) {
      formError(form, error.message);
    } finally {
      busy(form, false);
    }
  });
}
const signupForm = $('signup-form');
function syncSignup() {
  const controls = signupForm.elements;
  const canJoin = controls.role.value === 'sub';
  controls.projectMode.options[1].disabled = !canJoin;
  if (!canJoin) controls.projectMode.value = 'create';
  const joining = controls.projectMode.value === 'join';
  $('role-help').textContent = canJoin ? 'Review your own runs and choose what to share when you join a GC’s project.' : 'Create a project, invite subcontractors, and review the runs they share.';
  $('project-name-field').hidden = joining;
  controls.projectName.disabled = joining;
  controls.projectName.required = !joining;
  $('invite-code-field').hidden = !joining;
  controls.inviteCode.disabled = !joining;
  controls.inviteCode.required = joining;
  $('trade-field').hidden = !canJoin || joining;
  controls.trade.disabled = $('trade-field').hidden;
}
signupForm.elements.role.addEventListener('change', syncSignup);
signupForm.elements.projectMode.addEventListener('change', syncSignup);
authForm($('signin-form'), '/login', form => ({email:String(form.get('email')).trim(),password:form.get('password')}));
authForm(signupForm, '/signup', form => ({
  name:String(form.get('name')).trim(),email:String(form.get('email')).trim(),password:form.get('password'),role:form.get('role'),
  ...(form.get('projectMode') === 'join' ? {inviteCode:String(form.get('inviteCode')).trim()} :
    {projectName:String(form.get('projectName')).trim(),trade:String(form.get('trade') || '').trim()})
}));
$('signout').addEventListener('click', async () => {
  $('signout').disabled = true;
  ++state.dashboardRequest;
  try {
    await api('/logout', {});
    state.dashboard = null;
    $('runs').replaceChildren();
    $('board-list').replaceChildren();
    $('shared-board-list').replaceChildren();
    $('guidance-lists').replaceChildren();
    $('project-evaluation-content').replaceChildren();
    $('result-body').replaceChildren();
    notice('Signed out.');
    navigate('home');
  } catch (error) {
    notice(error.message);
  } finally {
    $('signout').disabled = false;
  }
});

function paintDashboard() {
  const {user, project, capabilities, runner, runs, board, sharedBoard, guidance} = state.dashboard;
  const isGc = user.role === 'gc';
  $('project-role').textContent = isGc ? 'GENERAL CONTRACTOR' : ['SUBCONTRACTOR', user.trade].filter(Boolean).join(' · ');
  $('project-heading').textContent = project.name;
  $('workspace-intro').textContent = `${user.name}, ${isGc ? 'review your work and requests shared by subcontractors.' : 'track your requests and review their supporting records.'}`;
  $('invite-button').hidden = !capabilities?.invite;
  $('start-workflows').hidden = capabilities?.submit === false;
  const available = runner?.online === true;
  $('runner-status').className = 'badge ' + (available ? 'online' : 'waiting');
  $('runner-status').textContent = available ? 'Processing computer connected' : 'Processing computer offline';
  $('runner-note').textContent = available ? 'Queued reviews can start as the project computer becomes available.' : 'New reviews wait until the project computer is switched on.';
  $('workspace-metrics').replaceChildren(
    metric(arr(runs).filter(run => active(run.status)).length, 'Waiting or processing'),
    metric(arr(runs).filter(run => run.status === 'completed' && run.canReview).length, 'Drafts ready to check'),
    metric(arr(runs).filter(run => run.reviewed).length, 'Reviewed')
  );
  $('runs-scope').textContent = isGc ? 'Your reviews and work shared with you.' : 'Your own reviews and submitted records.';
  $('guide-label').textContent = isGc ? 'GC WORKFLOW' : 'SUBCONTRACTOR WORKFLOW';
  $('guide-heading').textContent = isGc ? 'Review shared work' : 'Keep control of sharing';
  $('guide-text').textContent = isGc ? 'Check the draft against the source before recording a decision.' : 'Choose whether the GC can see a review when you add its records.';
  const steps = isGc ? ['Invite a subcontractor using their email.', 'Open a draft and check the source excerpts.', 'Accept the draft or record what needs to change.'] :
    ['Add a question and supporting records.', 'Choose private or shared when you submit.', 'Open the result to check the draft and its evidence.'];
  if (!isGc && !capabilities?.share) steps[1] = 'Use a GC invitation to join a shared project.';
  $('guide-steps').replaceChildren(...steps.map(text => element('li', text)));
  for (const [records, section, list] of [[board, 'project-board', 'board-list'], [sharedBoard, 'shared-board', 'shared-board-list']]) {
    const tasks = arr(records?.tasks);
    $(section).hidden = !tasks.length;
    $(list).replaceChildren(...tasks.map(task => {
      const item = element('li');
      item.append(element('strong', task.title), element('span', [task.type === 'group' ? 'Task group' : (task.status === 'resolved' ? 'Reviewed answer' : 'Open task'), task.requirement].filter(Boolean).join(' · ')));
      return item;
    }));
  }
  paintSavedGuidance(guidance);
  if ($('intake-dialog').open) syncGuidanceOption();
  paintRuns();
}
function paintSavedGuidance(guidance) {
  const scopes = [['private', 'For private reviews'], ['shared', 'For reviews shared with your GC']];
  const groups = [];
  for (const [scope, heading] of scopes) {
    const instructions = arr(guidance?.[scope]);
    if (!instructions.length) continue;
    const group = element('div', null, 'guidance-list');
    const list = element('ul', null, 'board-list');
    for (const instruction of instructions) {
      const row = element('li');
      const archive = button('Archive', async () => {
        archive.disabled = true;
        try {
          await api(`/guidance/${encodeURIComponent(instruction.id)}/archive`, {});
          await refreshDashboard({quiet:true});
          notice('Guidance archived for future reviews.');
        } catch (error) {
          notice(error.message);
        } finally {
          archive.disabled = false;
        }
      }, 'button-quiet');
      row.append(element('span', instruction.text), archive);
      list.append(row);
    }
    group.append(element('h3', heading), list);
    groups.push(group);
  }
  $('saved-guidance').hidden = !groups.length;
  $('guidance-lists').replaceChildren(...groups);
}
function paintRuns() {
  const allRuns = arr(state.dashboard?.runs);
  const filter = $('run-filter').value;
  const runs = allRuns.filter(run => filter === 'all' || (filter === 'pending' ? active(run.status) : run.status === 'completed'));
  $('run-filter-field').hidden = allRuns.length < 2;
  if (!runs.length) {
    const empty = element('div', null, 'empty');
    empty.append(element('h3', allRuns.length ? 'No matching reviews' : 'Your queue is empty'), element('p', allRuns.length ? 'Choose another filter to see your reviews.' : 'Choose a workflow to start a review.'));
    $('runs').replaceChildren(empty);
    return;
  }
  $('runs').replaceChildren(...runs.map(run => {
    const row = element('article', null, 'run-row');
    const heading = element('div');
    const scope = run.shared ? 'Shared with GC' : 'Private';
    const submitter = typeof run.submittedBy === 'string' ? run.submittedBy : run.submittedBy?.name;
    heading.append(element('h3', run.title), element('p', [kinds[run.kind]?.label, submitter, scope, shortDate(run.createdAt)].filter(Boolean).join(' · ')));
    const controls = element('div', null, 'actions');
    controls.append(badge(run.reviewed && !run.canReview ? 'Reviewed' : statuses[run.status] || 'Pending', run.status), button('Open', () => openRun(run.id), 'button-quiet'));
    row.append(heading, controls);
    return row;
  }));
}
$('run-filter').addEventListener('change', paintRuns);
$('refresh').addEventListener('click', () => refreshDashboard());

const runForm = $('run-form');
let workflowImport = null;

function cancelWorkflowImport() {
  workflowImport?.abort();
  workflowImport = null;
  $('workflow-file').value = '';
  $('workflow-file').disabled = false;
  $('workflow-file-status').hidden = true;
}
function syncKind() {
  cancelWorkflowImport();
  const controls = runForm.elements;
  const kind = controls.kind.value;
  $('intake-heading').textContent = kinds[kind].label;
  $('intake-description').textContent = kinds[kind].description;
  controls.title.placeholder = 'e.g. ' + kinds[kind].placeholder;
  $('documents').hidden = kind !== 'rfi';
  $('add-document').hidden = kind !== 'rfi';
  if (kind === 'rfi' && !$('documents').children.length) addRecord();
  for (const fieldset of $('documents').children) fieldset.disabled = kind !== 'rfi';
  $('transcript-field').hidden = kind !== 'meeting';
  controls.transcript.required = kind === 'meeting';
  controls.transcript.disabled = kind !== 'meeting';
  $('daily-field').hidden = kind !== 'daily';
  controls.reportText.required = kind === 'daily';
  controls.reportText.disabled = kind !== 'daily';
  $('text-file-field').hidden = kind === 'rfi';
  $('workflow-file-label').textContent = kind === 'daily' ? 'Import JSON' : 'Import transcript';
  $('workflow-file').accept = kind === 'daily' ? '.json' : '.txt,.pdf,.docx';
  syncGuidanceOption();
}
function syncGuidanceOption() {
  const controls = runForm.elements;
  const shared = !controls.shared.disabled && controls.shared.checked;
  const scope = shared ? 'shared' : 'private';
  const count = arr(state.dashboard?.guidance?.[scope]).length;
  const available = controls.kind.value === 'rfi' && count > 0;
  const choice = controls.useGuidance;
  if (!available || choice.dataset.scope !== scope) choice.checked = false;
  choice.dataset.scope = scope;
  choice.disabled = !available;
  $('use-guidance-field').hidden = !available;
  $('use-guidance-note').textContent = available ? `${count} saved ${count === 1 ? 'instruction' : 'instructions'} for ${shared ? 'reviews shared with your GC' : 'private reviews'}.` : '';
}
function syncClassification() {
  const authorized = runForm.elements.dataClassification.value === 'authorized';
  $('authorization-field').hidden = !authorized;
  runForm.elements.authorized.required = authorized;
  runForm.elements.authorized.disabled = !authorized;
}
function renumber() {
  for (const [index, record] of Array.from($('documents').children).entries()) {
    record.querySelector('legend').textContent = 'Record ' + (index + 1);
    record.querySelector('.remove-record').hidden = $('documents').children.length < 2;
  }
  $('add-document').disabled = $('documents').children.length >= 12;
}
function addRecord(values = {}) {
  if ($('documents').children.length >= 12) return;
  const record = $('document-template').content.firstElementChild.cloneNode(true);
  record.dataset.recordId = values.id || crypto.randomUUID();
  const field = name => record.querySelector(`[data-field="${name}"]`);
  const fieldValues = {title:'',kind:'request',revision:'Unverified',issuedAt:localDate(),approval:'informal',text:'',...values};
  for (const name of ['title','kind','revision','issuedAt','approval','text']) field(name).value = fieldValues[name];
  field('current').checked = Boolean(values.current);
  const syncRecord = () => {
    const reference = field('kind').value === 'reference';
    record.querySelector('.reference-options').hidden = !reference;
    field('approval').disabled = !reference;
    field('current').disabled = !reference;
  };
  field('kind').addEventListener('change', syncRecord);
  syncRecord();
  const file = record.querySelector('[type=file]');
  const status = record.querySelector('.import-status');
  file.addEventListener('change', async () => {
    const selected = file.files[0];
    if (!selected) return;
    file.disabled = true;
    try {
      const parsed = await extractFile(selected, {onStatus:message => { status.textContent = message; }});
      if (!record.isConnected) return;
      const input = extractedDocument(selected, parsed, record.dataset.recordId);
      field('title').value = input.title.slice(0,160);
      field('text').value = input.text;
      field('approval').value = 'informal';
      field('current').checked = false;
      field('revision').value = 'Unverified';
      status.textContent = ['Text imported. Check the excerpt, revision, and date.', ...arr(parsed.warnings)].join(' ');
    } catch (error) {
      status.textContent = error.message;
    } finally {
      file.value = '';
      file.disabled = false;
    }
  });
  record.querySelector('.remove-record').addEventListener('click', () => { record.remove(); renumber(); });
  $('documents').append(record);
  renumber();
}
const exampleRequests = [
  {title:'RFI 018 · Moisture test timing', text:'Can the testing team confirm the moisture test date for the east wing flooring? Keep installation on hold until an accepted result is on record.',revision:'A',issuedAt:'2026-11-04'},
  {title:'Flooring follow-up', text:'Please confirm the east wing flooring moisture test date. Installation should remain on hold until an accepted result is on record. The flooring lead needs the planned date by 3 p.m. Friday.',revision:'A',issuedAt:'2026-11-05'},
  {title:'Coordination note · East wing', kind:'reference', text:'The flooring crew must wait for an accepted moisture test result before installation. The test date is still pending confirmation from the testing team.',revision:'B',issuedAt:'2026-11-05',approval:'approved',current:true}
];
const exampleTranscript = 'Maya, general contractor: The east wing flooring stays on hold until the accepted moisture test result is filed.\nSam, flooring lead: I will email the testing team today and share the proposed test date by Friday at 3 p.m.\nMaya: Agreed. No date is confirmed today. I will update the project schedule after the test date is confirmed.\nSam: Can we store the flooring material in the dry west room? The owner has not approved that space yet.';
const exampleReports = [
  {report_id:'REPORT-01',report_date:'2026-11-04',report_author:'Flooring lead',work_area:'East wing',work_completed:'Prepared flooring substrate.',issue_or_update:'Moisture test date is pending confirmation.',schedule_status:'Flooring installation on hold.',action_required:'Confirm the test date and accepted result.',responsible_party:'Testing team',due_date:'2026-11-06'},
  {report_id:'REPORT-02',report_date:'2026-11-05',report_author:'Site superintendent',work_area:'East wing',work_completed:'Checked temporary protection.',issue_or_update:'Testing team has acknowledged the request. No date or result was received.',schedule_status:'Installation remains on hold.',action_required:'Record the confirmed date when received.',responsible_party:'General contractor',due_date:'2026-11-06'}
];
function setExample() {
  const controls = runForm.elements;
  controls.dataClassification.value = 'synthetic';
  controls.authorized.checked = false;
  syncClassification();
  formError(runForm);
  if (controls.kind.value === 'rfi') {
    controls.title.value = 'East wing flooring requests';
    $('documents').replaceChildren();
    for (const record of exampleRequests) addRecord(record);
  } else if (controls.kind.value === 'meeting') {
    controls.title.value = 'East wing coordination meeting';
    controls.transcript.value = exampleTranscript;
  } else {
    controls.title.value = 'East wing daily report review';
    controls.reportText.value = JSON.stringify(exampleReports, null, 2);
  }
}
function openIntake(kind) {
  if (!state.dashboard || state.dashboard.capabilities?.submit === false) return;
  runForm.reset();
  runForm.elements.kind.value = kind;
  state.submissionKey = null;
  formError(runForm);
  $('documents').replaceChildren();
  $('share-field').hidden = !state.dashboard?.capabilities?.share;
  runForm.elements.shared.disabled = $('share-field').hidden;
  $('intake-note').textContent = state.dashboard?.runner?.online ? 'The project computer processes reviews in queue order.' : 'Your review will wait until the project computer is switched on.';
  syncKind();
  syncClassification();
  $('intake-dialog').showModal();
}
for (const control of document.querySelectorAll('[data-workflow]')) {
  control.addEventListener('click', () => openIntake(control.dataset.workflow));
}
$('use-example').addEventListener('click', setExample);
$('add-document').addEventListener('click', () => addRecord());
runForm.elements.kind.addEventListener('change', syncKind);
runForm.elements.dataClassification.addEventListener('change', syncClassification);
runForm.elements.shared.addEventListener('change', syncGuidanceOption);
$('intake-dialog').addEventListener('close', cancelWorkflowImport);
$('workflow-file').addEventListener('change', async event => {
  const input = event.currentTarget;
  const file = input.files[0];
  if (!file) return;
  const kind = runForm.elements.kind.value;
  const target = kind === 'daily' ? runForm.elements.reportText : runForm.elements.transcript;
  const status = $('workflow-file-status');
  const request = new AbortController();
  workflowImport = request;
  const showStatus = message => {
    if (workflowImport !== request) return;
    status.textContent = message;
    status.hidden = !message;
  };
  input.disabled = true;
  try {
    let content, warnings = [];
    if (kind === 'daily') {
      if (!/\.json$/i.test(file.name) || file.size > 180000) throw Error('Choose a JSON file under 180 KB.');
      content = await file.text();
    } else {
      const extracted = await extractFile(file, {signal:request.signal,onStatus:showStatus});
      content = extracted.text;
      warnings = arr(extracted.warnings);
    }
    if (!content.trim() || content.includes('\0') || content.length > target.maxLength) throw Error('Choose a readable text file within the form’s character limit.');
    if (request.signal.aborted || !$('intake-dialog').open) return;
    target.value = content;
    if (!runForm.elements.title.value.trim()) runForm.elements.title.value = file.name.replace(/\.[^.]+$/, '').slice(0, 120);
    formError(runForm);
    showStatus(['Imported. Check the text before adding this review.', ...warnings].join(' '));
  } catch (error) {
    if (!request.signal.aborted && $('intake-dialog').open) {
      showStatus('');
      formError(runForm, error.message);
    }
  } finally {
    if (workflowImport === request) {
      workflowImport = null;
      input.value = '';
      input.disabled = false;
    }
  }
});
function runPayload() {
  const values = new FormData(runForm);
  const title = String(values.get('title')).trim();
  if (!title) throw Error('Enter a review name.');
  const kind = values.get('kind');
  let payload;
  if (kind === 'meeting') {
    const transcript = String(values.get('transcript')).trim();
    if (!transcript) throw Error('Add the meeting transcript.');
    payload = {transcript};
  } else if (kind === 'daily') {
    let parsed;
    try { parsed = JSON.parse(String(values.get('reportText'))); } catch { throw Error('Use a JSON array of daily reports, or a JSON object with a reports array.'); }
    const reports = Array.isArray(parsed) ? parsed : parsed?.reports;
    if (!Array.isArray(reports) || !reports.length || reports.length > 30) throw Error('Include 1 to 30 daily reports.');
    payload = {reports};
  } else {
    const documents = Array.from($('documents').children, record => {
      const field = name => record.querySelector(`[data-field="${name}"]`);
      const value = name => field(name).value.trim();
      const reference = value('kind') === 'reference';
      const document = {id:record.dataset.recordId,title:value('title'),kind:value('kind'),revision:value('revision'),issuedAt:value('issuedAt'),approval:reference ? value('approval') : 'informal',current:reference && field('current').checked,text:value('text')};
      if (!document.title || !document.text || !document.revision) throw Error('Give each record a name, revision, and text.');
      return document;
    });
    if (!documents.some(document => document.kind === 'request')) throw Error('Add at least one RFI or question.');
    if (documents.reduce((sum, document) => sum + document.text.length, 0) > 30000) throw Error('Keep all record text under 30,000 characters.');
    payload = {mode:'consolidation',documents};
  }
  const dataClassification = values.get('dataClassification');
  if (dataClassification === 'authorized' && values.get('authorized') !== 'on') throw Error('Confirm you have permission to process these records.');
  return {
    title, kind, payload, dataClassification, shared:values.get('shared') === 'on',
    ...(kind === 'rfi' && values.get('useGuidance') === 'on' ? {useGuidance:true} : {})
  };
}
runForm.addEventListener('submit', async event => {
  event.preventDefault();
  formError(runForm);
  busy(runForm, true);
  try {
    const input = runPayload();
    const content = JSON.stringify(input);
    if (state.submissionKey?.content !== content) state.submissionKey = {content,id:crypto.randomUUID()};
    await api('/runs', {...input,clientRequestId:state.submissionKey.id});
    $('intake-dialog').close();
    runForm.reset();
    $('documents').replaceChildren();
    state.submissionKey = null;
    await refreshDashboard();
    notice('Review added to the queue.');
  } catch (error) {
    formError(runForm, error.message);
  } finally {
    busy(runForm, false);
  }
});

function addEvidence(item, label, quotes) {
  if (!quotes.length) return;
  const details = element('details', null, 'sources');
  details.append(element('summary', label));
  for (const quote of quotes) details.append(element('blockquote', quote));
  item.append(details);
}
function outputItem({title, action, description, supporting, evidence}) {
  const item = element('article', null, 'result-item');
  if (action) item.append(badge(action.label, action.tone));
  item.append(element('h3', title));
  if (description) item.append(element('p', description));
  for (const line of supporting.filter(Boolean)) item.append(element('p', line));
  addEvidence(item, 'Read source evidence', evidence.filter(Boolean));
  return item;
}
function renderOutput(run) {
  const result = run.result;
  const container = element('div');
  if (result.summary) container.append(element('p', result.summary, 'result-summary'));
  if (run.kind === 'rfi') {
    const board = run.owner ? (run.canShare ? state.dashboard?.sharedBoard : state.dashboard?.board) : null;
    const documents = new Map([...arr(board?.documents), ...arr(run.payload?.documents)].map(document => [document.id, document.title]));
    const groups = new Map(arr(result.groups).map(group => [group.id, group.title]));
    const earlier = new Map(arr(result.items).map(item => [item.id, item.title]));
    const tasks = new Map(arr(board?.tasks).map(task => [task.id, task.title]));
    for (const item of arr(result.items)) {
      const related = groups.get(item.groupId) || tasks.get(item.targetTaskId) || earlier.get(item.duplicateOfItemId);
      container.append(outputItem({
        title:item.title || 'Project request', action:{label:actions[item.action] || 'Review request',tone:actions[item.action] ? item.action : ''},
        description:item.requirement, supporting:[related ? 'Related work · ' + related : '', item.reason, item.answer, ...arr(item.warnings).map(warning => typeof warning === 'string' ? warning : warning.message || warning.quote)],
        evidence:[item.sourceQuote && [documents.get(item.sourceDocumentId), item.sourceQuote].filter(Boolean).join('\n'), ...arr(item.citations).map(citation => [documents.get(citation.documentId), citation.quote].filter(Boolean).join('\n'))]
      }));
    }
    for (const source of arr(run.payload?.documents)) addEvidence(container, source.title + ' · Revision ' + source.revision, [source.text]);
  } else if (run.kind === 'meeting') {
    for (const note of arr(result.items)) {
      const evidence = typeof note.evidence === 'string' ? [note.evidence] : arr(note.evidence || note.citations || note.source_quotes).map(source => typeof source === 'string' ? source : source.quote || source.text);
      const heading = {decision:'Decision',action:'Action item',schedule:'Schedule',question:'Open question'}[note.kind];
      container.append(outputItem({
        title:note.title || note.label || heading || 'Meeting note',
        description:note.text || note.detail || note.description || note.requirement,
        supporting:[note.owner ? 'Owner · ' + note.owner : '', (note.due || note.deadline) ? 'Due · ' + (note.due || note.deadline) : '', ...arr(note.flags)],
        evidence
      }));
    }
    if (run.payload?.transcript) addEvidence(container, 'Read original transcript', [run.payload.transcript]);
  } else {
    for (const finding of arr(result.findings)) container.append(outputItem({
      title:finding.title || 'Report finding', description:finding.observation,
      supporting:[finding.consequence, finding.action, finding.owner ? 'Owner · ' + finding.owner : '', finding.due ? 'Due · ' + finding.due : '', finding.uncertainty],
      evidence:arr(finding.evidence).map(source => [source.report_id, source.quote].filter(Boolean).join('\n'))
    }));
  }
  if (!arr(result.items).length && !arr(result.findings).length && !result.summary) {
    container.prepend(element('p', 'This run returned no findings.', 'result-summary'));
  }
  return container;
}
const evaluationFields = {
  reviewSeconds:'Time checking this draft (seconds)', manualSeconds:'Matched manual-only time (seconds)',
  correctFacts:'Correct required facts', incorrectFacts:'Incorrect required facts', missingFacts:'Missing required facts', extraErrors:'Additional unsupported claims'
};
function reviewForm(run) {
  const form = element('form', null, 'review-form');
  form.append(element('h3', 'Record your decision'), element('p', 'Check the evidence first. Add a short note explaining your decision.', 'field-help'));
  const decision = element('label', 'Decision');
  const select = element('select');
  select.name = 'decision';
  for (const [value, title] of [['accept','Accept draft'],['revise','Needs changes']]) {
    const option = element('option', title);
    option.value = value;
    select.append(option);
  }
  decision.append(select);
  const notes = element('label', 'Review note');
  const textarea = element('textarea');
  textarea.name = 'notes';
  textarea.rows = 3;
  textarea.maxLength = 2000;
  textarea.required = true;
  textarea.placeholder = 'What did you check? What should change?';
  notes.append(textarea);
  const measurements = element('details', null, 'optional-metrics');
  const grid = element('div', null, 'review-grid');
  measurements.append(element('summary', 'Add measured evaluation data (optional)'), element('p', 'Enter observed values for this review. Leave unmeasured fields blank.', 'field-help'), grid);
  for (const [name, label] of Object.entries(evaluationFields)) {
    const field = element('label', label);
    const input = element('input');
    input.type = 'number';
    input.name = name;
    input.min = '0';
    input.max = name.endsWith('Seconds') ? '86400' : '1000';
    input.step = '1';
    field.append(input);
    grid.append(field);
  }
  const submit = element('button', 'Save review', 'button button-primary wide');
  submit.type = 'submit';
  const error = element('p', null, 'form-error');
  error.role = 'alert';
  error.hidden = true;
  form.append(decision, notes, measurements, error, submit);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    formError(form);
    busy(form, true);
    const values = new FormData(form);
    const metrics = Object.fromEntries(Object.keys(evaluationFields).flatMap(key => values.get(key) === '' ? [] : [[key,Number(values.get(key))]]));
    try {
      await api(`/runs/${encodeURIComponent(run.id)}/review`, {decision:values.get('decision'),notes:String(values.get('notes')).trim(),metrics});
      await refreshDashboard({quiet:true});
      if ($('result-dialog').open) await openRun(run.id);
      notice('Review saved.');
    } catch (failure) {
      formError(form, failure.message);
    } finally {
      busy(form, false);
    }
  });
  return form;
}
function guidanceForm(run) {
  const section = element('details', null, 'review-receipt saved-guidance-form');
  const form = element('form');
  const heading = element('label', 'Instruction');
  const input = element('textarea');
  input.name = 'instruction';
  input.required = true;
  input.maxLength = 500;
  input.rows = 3;
  input.placeholder = 'For example, track the requested inspection date separately from written acceptance.';
  heading.append(input);
  const submit = element('button', 'Save guidance', 'button button-secondary');
  submit.type = 'submit';
  const status = element('p', null, 'field-help');
  status.setAttribute('role', 'status');
  const error = element('p', null, 'form-error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  form.append(heading, submit, error, status);
  section.append(
    element('summary', 'Save guidance for future RFI reviews'),
    element('p', run.guidanceScope === 'shared' ? 'Write an instruction suitable for reviews you share with your GC.' : 'Write an instruction for future private reviews.', 'field-help'),
    form
  );
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const text = input.value.trim();
    formError(form);
    if (!text) {
      formError(form, 'Enter an instruction.');
      return;
    }
    busy(form, true);
    try {
      await api(`/runs/${encodeURIComponent(run.id)}/guidance`, {text});
      input.disabled = true;
      input.value = '';
      status.textContent = 'Guidance saved for future RFI reviews.';
      await refreshDashboard({quiet:true});
    } catch (failure) {
      formError(form, failure.message);
    } finally {
      busy(form, false);
      submit.disabled = input.disabled;
    }
  });
  return section;
}
function renderRun({run, review}) {
  $('result-heading').textContent = run.title;
  $('result-kicker').textContent = kinds[run.kind]?.label.toUpperCase() || 'RUN RESULTS';
  const root = $('result-body');
  const detail = element('p', [shortDate(run.createdAt), Number.isFinite(run.timings?.totalMs) ? 'Processing · ' + duration(run.timings.totalMs / 1000) : null, run.shared ? 'Shared with GC' : 'Private'].filter(Boolean).join(' · '), 'result-summary');
  root.replaceChildren(badge(run.reviewed && !run.canReview ? 'Reviewed' : statuses[run.status] || 'Pending', run.status), detail);
  if (run.useGuidance) {
    const version = Number.isInteger(run.guidanceVersion) ? ` · Version ${run.guidanceVersion}` : '';
    root.append(element('p', 'Saved guidance selected' + version, 'field-help'));
    addEvidence(root, 'Read guidance selected for this run', arr(run.guidance).map(instruction => instruction.text).filter(Boolean));
  }
  if (run.result) root.append(renderOutput(run));
  else if (run.error) root.append(element('p', run.error, 'result-summary'));
  else root.append(element('p', run.stage || (run.status === 'queued' ? 'Waiting for the project computer.' : 'Processing the submitted records.'), 'result-summary'));
  const controls = element('div', null, 'result-actions');
  if (active(run.status)) controls.append(button('Check status', () => openRun(run.id)));
  if (run.canShare) {
    const share = button(run.shared ? 'Stop sharing with GC' : 'Share with GC', async () => {
      share.disabled = true;
      try {
        await api(`/runs/${encodeURIComponent(run.id)}/share`, {shared:!run.shared});
        await refreshDashboard({quiet:true});
        if ($('result-dialog').open) await openRun(run.id);
      } catch (error) {
        controls.append(element('p', error.message, 'form-error'));
      } finally {
        share.disabled = false;
      }
    });
    controls.append(share);
  }
  if (controls.childElementCount) root.append(controls);
  if (review) {
    const receipt = element('section', null, 'review-receipt');
    receipt.append(element('h3', review.decision === 'accept' ? 'Latest review · Accepted' : 'Latest review · Changes requested'), element('p', review.notes, 'result-summary'));
    if (review.applied) receipt.append(element('p', 'Saved to reviewed work.', 'field-help'));
    const observations = Object.entries(evaluationFields).filter(([key]) => Number.isFinite(review.metrics?.[key])).map(([key, label]) => `${label} · ${review.metrics[key]}`);
    if (observations.length) receipt.append(element('p', observations.join(' · '), 'field-help'));
    root.append(receipt);
  }
  if (run.canReview && run.status === 'completed') root.append(reviewForm(run));
  if (run.canPublishGuidance) root.append(guidanceForm(run));
}
async function openRun(id) {
  const requestId = ++state.detailRequest;
  const dialog = $('result-dialog');
  $('result-heading').textContent = 'Review details';
  $('result-kicker').textContent = 'RUN RESULTS';
  $('result-body').replaceChildren(element('p', 'Loading review…', 'result-summary'));
  if (!dialog.open) dialog.showModal();
  try {
    const data = await api(`/runs/${encodeURIComponent(id)}`);
    if (requestId === state.detailRequest && dialog.open) renderRun(data);
  } catch (error) {
    if (requestId === state.detailRequest && dialog.open) $('result-body').replaceChildren(element('p', error.message, 'form-error'));
  }
}
$('result-dialog').addEventListener('close', () => {
  ++state.detailRequest;
  $('result-body').replaceChildren();
});

const inviteForm = $('invite-form');
$('invite-button').addEventListener('click', () => {
  inviteForm.reset();
  inviteForm.hidden = false;
  formError(inviteForm);
  $('invite-result').hidden = true;
  $('invite-value').value = '';
  $('copy-status').textContent = '';
  $('invite-dialog').showModal();
});
inviteForm.addEventListener('submit', async event => {
  event.preventDefault();
  formError(inviteForm);
  busy(inviteForm, true);
  const values = new FormData(inviteForm);
  try {
    const invite = await api('/invites', {email:String(values.get('email')).trim(),trade:String(values.get('trade')).trim()});
    if (!$('invite-dialog').open) return;
    $('invite-value').value = invite.code;
    $('invite-expiry').textContent = invite.expiresAt ? 'Expires ' + shortDate(invite.expiresAt) + '.' : '';
    $('invite-result').hidden = false;
    inviteForm.hidden = true;
  } catch (error) {
    formError(inviteForm, error.message);
  } finally {
    busy(inviteForm, false);
  }
});
$('invite-dialog').addEventListener('close', () => { $('invite-value').value = ''; });
$('copy-invite').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('invite-value').value);
    $('copy-status').textContent = 'Invitation copied.';
  } catch {
    $('invite-value').select();
    $('copy-status').textContent = 'Select and copy the invitation code.';
  }
});

function benchmarkPanel(data) {
  const runs = arr(data.runs);
  const recent = runs.findLast(run => run.label?.includes('transfer') && run.pipelineVersion === 'rfi-consolidation-12');
  const regression = runs.find(run => run.label?.includes('Final development regression'));
  const panel = element('section', null, 'panel');
  panel.append(element('h2', 'RFI coordination performance'));
  panel.append(element('p', `Generated test cases · ${data.model || 'Qwen 3.5'} · ${data.hardware || 'Project GPU'}`, 'evaluation-note'));
  const metrics = element('div', null, 'metrics-grid');
  metrics.append(
    metric(regression ? regression.checksPassed + '/' + regression.checksTotal : '—', 'Development checks passed'),
    metric(recent ? recent.checksPassed + '/' + recent.checksTotal : '—', 'Separate transfer checks passed'),
    metric(recent ? recent.incorrectMerges : '—', 'Incorrect merges in transfer cases')
  );
  const wrap = element('div', null, 'table-wrap');
  const table = element('table');
  const caption = element('caption', 'Measured RFI coordination benchmark results', 'sr-only');
  const head = element('thead');
  const row = element('tr');
  for (const label of ['Test run','Checks passed','Passing cases','Median processing']) {
    const cell = element('th', label);
    cell.scope = 'col';
    row.append(cell);
  }
  head.append(row);
  const body = element('tbody');
  for (const run of runs) {
    const line = element('tr');
    const cells = [run.label, run.checksPassed + '/' + run.checksTotal, run.fullyPassingCases + '/' + run.cases, duration(run.medianSeconds)];
    line.append(...cells.map(value => element('td', value)));
    body.append(line);
  }
  table.append(caption,head,body);
  wrap.append(table);
  panel.append(metrics, wrap);
  const notes = element('details', null, 'optional-metrics');
  const list = element('ul', null, 'evaluation-note');
  list.append(...arr(data.limitations).map(text => element('li',text)));
  notes.append(element('summary','Test methods and limitations'),list);
  panel.append(notes);
  return panel;
}
async function renderEvaluation() {
  const content = $('evaluation-content');
  $('evaluation-back').href = state.dashboard ? '#workspace' : '#home';
  $('evaluation-back').textContent = state.dashboard ? '← Back to workspace' : '← Back to home';
  const evaluation = state.dashboard?.evaluation;
  $('project-evaluation').hidden = !evaluation;
  if (evaluation) {
    const metrics = element('div', null, 'metrics-grid');
    metrics.append(metric(evaluation.reviewedRuns || 0,'Reviewed drafts'), metric(evaluation.assessedRuns || 0,'Reviews with fact counts'), metric(evaluation.matchedRuns || 0,'Matched manual comparisons'));
    const extra = element('p', evaluation.matchedRuns > 0 ? `Matched time · ${duration(evaluation.assistedSeconds)} assisted and ${duration(evaluation.matchedManualSeconds)} manual.` : 'Add observed review times and facts when recording a decision to measure your project’s results.', 'evaluation-note');
    const accuracy = evaluation.accuracy;
    const completeness = evaluation.completeness;
    $('project-evaluation-content').replaceChildren(metrics, extra);
    if (Number.isFinite(accuracy) && Number.isFinite(completeness)) $('project-evaluation-content').append(element('p', `Measured quality · ${accuracy.toFixed(1)}% accuracy and ${completeness.toFixed(1)}% completeness.`,'evaluation-note'));
  }
  if (!state.benchmark) {
    content.replaceChildren(element('p', 'Loading measured benchmark results…', 'notice'));
    try {
      const response = await fetch('../benchmark-results.json');
      if (!response.ok) throw Error('Benchmark results could not be loaded.');
      state.benchmark = await response.json();
    } catch (error) {
      content.replaceChildren(element('p', error.message, 'notice'));
      return;
    }
  }
  content.replaceChildren(benchmarkPanel(state.benchmark));
}

for (const close of document.querySelectorAll('[data-close]')) close.addEventListener('click', () => $(close.dataset.close).close());
window.addEventListener('hashchange', paintRoute);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.dashboard && currentView() === 'workspace') refreshDashboard({quiet:true});
  else scheduleRefresh();
});
syncSignup();
paintRoute();
if (!staticLanding) refreshDashboard();
