const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const C=require('../core.js'),E=require('../engine.js');
const reports=JSON.parse(fs.readFileSync(require.resolve('../data/reports-a.json'),'utf8'));
const config=overrides=>({service:'evergreen-local-ai',version:2,pipeline:C.VERSION,promptVersion:E.PROMPT_VERSION,models:[{name:'qwen3.5:27b',digest:'test-digest'}],token:'test-token',...overrides});
function browser(configs,{sourceReports=reports,nativeResult=null}={}){
  const elements=new Map(),requests=[];let configIndex=0;
  const element=id=>{if(!elements.has(id))elements.set(id,{value:id==='dataset'?'reports-a':id==='profile'?'balanced':id==='filter'?'all':'',textContent:'',innerHTML:'',hidden:false,disabled:false,open:false,classList:{toggle(){},add(){}},setAttribute(){},removeAttribute(){},replaceChildren(){},scrollIntoView(){},closest(){return {open:false};}});return elements.get(id);};
  const context={DailyCore:C,TextEncoder,TextDecoder,AbortController,AbortSignal,structuredClone,crypto:crypto.webcrypto,performance:{now:()=>1},navigator:{},location:{hostname:'127.0.0.1'},window:{addEventListener(){}},document:{getElementById:element,querySelectorAll:()=>[]},setInterval:()=>1,clearInterval(){},setTimeout,clearTimeout,
    async fetch(url,options={}){requests.push({url,options});if(url.startsWith('data/'))return {ok:true,json:async()=>sourceReports};if(url.endsWith('/api/local/config')){const value=configs[Math.min(configIndex++,configs.length-1)];return {ok:true,json:async()=>structuredClone(value)};}if(url.endsWith('/api/local/analyze'))return {ok:true,headers:{get:()=> 'application/json'},json:async()=>({result:structuredClone(nativeResult||{findings:[],items:[],timings:[],sourceInventory:[],promptVersion:E.PROMPT_VERSION}),elapsedMs:1,loadMs:0})};throw Error('Unexpected request: '+url);},Worker:class{constructor(){throw Error('Native compatibility checks must not start a browser worker.');}}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../app.js'),'utf8'),context);
  return {element,requests,async ready(){const deadline=Date.now()+3000;while(!element('native-status').textContent&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(element('native-status').textContent,'App initialization did not reach the companion check');},async analyze(){element('profile').value='native27';element('profile').onchange();await element('generate').onclick();}};
}

test('same pipeline with an older or missing prompt cannot start native inference',async()=>{
  for(const promptVersion of ['daily-review-18c-consolidated','daily-review-18e-consolidated',undefined]){
    const app=browser([config({promptVersion})]);await app.ready();assert.match(app.element('native-status').textContent,/Restart the local companion/);await app.analyze();assert.match(app.element('status').textContent,/Restart the local companion/);assert.equal(app.requests.filter(request=>request.url.endsWith('/api/local/analyze')).length,0);
  }
});

test('a current prompt does not make an older source pipeline compatible',async()=>{
  const app=browser([config({pipeline:'daily-reports-v17'})]);await app.ready();await app.analyze();assert.match(app.element('status').textContent,/Restart the local companion/);assert.equal(app.requests.filter(request=>request.url.endsWith('/api/local/analyze')).length,0);
});

test('matching pipeline and prompt permit the selected local model to analyze reports',async()=>{
  const app=browser([config()]);await app.ready();assert.match(app.element('native-status').textContent,/Local companion ready/);await app.analyze();const analyses=app.requests.filter(request=>request.url.endsWith('/api/local/analyze'));assert.equal(analyses.length,1);const payload=JSON.parse(analyses[0].options.body);assert.equal(payload.model,'qwen3.5:27b');assert.equal(payload.reports.length,10);assert.equal(app.element('status').textContent,'Analysis complete. Check the findings below.');
});

test('the actual review screen discloses withheld proposals while keeping accepted finding counts separate',async()=>{
  const nativeResult={findings:[],items:[],timings:[],sourceInventory:[],promptVersion:E.PROMPT_VERSION,sourceObligationAudit:{finalProductReview:{abstentions:[{caseId:'one',type:'new_concern',reasonCode:'unsupported_remaining_state'}]}}},app=browser([config()],{nativeResult});
  await app.ready();await app.analyze();assert.equal(app.element('finding-count').textContent,'0 findings');assert.ok(app.element('run-summary').textContent.includes(C.reviewCaution(nativeResult)));assert.equal(app.element('status').textContent,'Analysis complete. Check the findings below.');
});

test('native compatibility is checked again immediately before analysis',async()=>{
  const app=browser([config(),config({promptVersion:'daily-review-18e-consolidated'})]);await app.ready();assert.match(app.element('native-status').textContent,/Local companion ready/);await app.analyze();assert.match(app.element('status').textContent,/Restart the local companion/);assert.equal(app.requests.filter(request=>request.url.endsWith('/api/local/config')).length,2);assert.equal(app.requests.filter(request=>request.url.endsWith('/api/local/analyze')).length,0);
});

test('the actual app preview shows a long reported requirement completely once while retaining earlier context and the latest update',async()=>{
  const quote='Maintain the equipment enclosure protection throughout the scheduled observation period while the independent acceptance result is being prepared, including the temporary edge covers and the marked pedestrian separation, until the signed witness result confirms that the protection may be released.';
  assert.ok(quote.length>195);
  const earlier='The equipment witness result is still pending.',latest='The witness result remains outstanding.';
  const input=C.reports([{report_id:'P1',report_date:'2026-08-01',work_area:'Motor M9',issue_or_update:earlier},{report_id:'P2',report_date:'2026-08-02',work_area:'Motor M9',issue_or_update:quote},{report_id:'P3',report_date:'2026-08-03',work_area:'Motor M9',issue_or_update:latest}]),inventory=E.inventory(input),required=inventory.facts[1],question='Is equipment protection and witness-result follow-up complete?';
  const requirements=[{requirementId:'O-'+required.id+'-0',sourceFactId:required.id,componentLabel:'Equipment protection until the signed result',aspect:'quality_followup',quote:required.quote,report_id:required.report_id,report_date:required.report_date,report_author:required.report_author,field:required.field,disposition:'represented'}];
  const item={topic:question,kind:'closeout',status:'open',facts:inventory.facts.slice(0,2).map(f=>f.id),latest:[inventory.facts[2].id],scopeQuestion:question,scopeTitle:'Review question: '+question,coverageRequirements:[...requirements,{...requirements[0],requirementId:'O-'+required.id+'-1',componentLabel:'Temporary separation until the signed result'}]};
  const nativeResult={...E.render([item],inventory.facts,input,C),items:[item],sourceInventory:inventory.facts,timings:[],promptVersion:E.PROMPT_VERSION},app=browser([config()],{sourceReports:input,nativeResult});
  await app.ready();await app.analyze();assert.equal(app.element('status').textContent,'Analysis complete. Check the findings below.');
  const html=app.element('findings').innerHTML,preview=html.slice(0,html.indexOf('Source excerpts'));
  assert.ok(preview.includes(quote),'The full conditional requirement must be visible before opening the timeline');assert.equal(preview.split(quote).length-1,1);assert.equal(preview.split('Reported requirement').length-1,1);assert.ok(!preview.includes('…'));
  assert.ok(preview.includes(earlier));assert.ok(preview.includes(latest));assert.ok(preview.includes('Earlier cited context'));assert.ok(preview.includes('Latest cited update'));
});
