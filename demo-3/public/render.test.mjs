import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {SAMPLE,OUTCOMES,COHORTS,STATUS,sourceMatches,asNumber,duration,percentage} from './model.mjs';

// Native append stringifies arrays. Preserve that behavior so this catches the
// actual browser regression instead of silently fixing it inside the test stub.
class TestNode{
  constructor(tag='#text',text=''){this.tag=tag;this.nodes=[];this.attributes={};this._text=text;const tokens=new Set();this.classList={contains:name=>tokens.has(name),toggle:(name,enabled)=>enabled?tokens.add(name):tokens.delete(name),remove:name=>tokens.delete(name)};}
  append(...values){for(const value of values)this.nodes.push(value instanceof TestNode?value:new TestNode('#text',String(value)));}
  replaceChildren(...values){this.nodes=[];this._text='';this.append(...values);}
  setAttribute(name,value){this.attributes[name]=value;}
  addEventListener(){}
  get textContent(){return this._text+this.nodes.map(n=>n.textContent).join('');}
  set textContent(value){this.nodes=[];this._text=String(value);}
  toString(){return'[object HTMLElement]';}
}
const source=await readFile(new URL('./app.js',import.meta.url),'utf8');
function section(start,end){return source.slice(source.indexOf(start),source.indexOf(end));}
function setup(){
  const roots=new Map(),state={currentJob:null,currentJobDetail:null,session:{capabilities:{}},lessons:{},metrics:null};
  const get=id=>{if(!roots.has(id))roots.set(id,new TestNode('div'));return roots.get(id);};
  const context=vm.createContext({state,Node:TestNode,document:{createElement:tag=>new TestNode(tag),createTextNode:text=>new TestNode('#text',text)},$:get,OUTCOMES,COHORTS,STATUS,sourceMatches,asNumber,duration,percentage,Date,JSON,console});
  vm.runInContext(section('function h(', '\nfunction text(')+
    section('function button(', '\nfunction date(')+
    section('function date(', '\nfunction isoLocal(')+
    section('function allowed(', '\nfunction showNotice(')+
    section('function renderRunner(', '\nfunction documentField(')+
    section('function resultOf(', '\nasync function cancelJob(')+
    section('function renderProvenance(', '\nfunction renderReviewForm(')+
    section('function renderReviewHistory(', '\nfunction proposeLessonForm(')+
    section('function renderLessons(', '\nfunction showSecret(')+
    '\nfunction renderReviewForm(){return h("div",{},"Review controls");}',context);
  return{state,roots,get,context,render:name=>vm.runInContext(name+'()',context)};
}
function find(root,predicate){return[root,...root.nodes.flatMap(n=>find(n,predicate))].filter(predicate);}
function noStringifiedNodes(root){assert.doesNotMatch(root.textContent,/\[object (?:HTMLElement|HTML\w+Element|Object)\]/);}

test('a recent heartbeat, including a formerly busy one, never claims the desktop app is currently On',()=>{
  const env=setup();
  for(const status of ['ready','busy','running']){
    env.state.runners=[{label:'Capstone project PC',lastSeenAt:new Date().toISOString(),status}];
    env.get('runner-dot').classList.toggle('busy',true);env.render('renderRunner');
    const text=env.get('runner-status').textContent;
    assert.match(text,/Recently checked in/);assert.match(text,/Check On\/Off in the Capstone desktop app/);
    assert.match(text,/after processing is turned off or the app closes/);
    assert.doesNotMatch(text,/ready for work|Connected ·|currently processing/);
    assert.equal(env.get('runner-dot').classList.contains('busy'),false);
  }
  env.state.runners=[{lastSeenAt:'2020-01-01T00:00:00Z',status:'running'}];env.render('renderRunner');
  assert.match(env.get('runner-status').textContent,/No recent check-in/);
  env.state.runners=[];env.render('renderRunner');assert.match(env.get('runner-status').textContent,/pair it, then select Turn ON/);
  env.state.session=null;env.render('renderRunner');assert.match(env.get('runner-status').textContent,/Check-in history not loaded/);
});

test('completed job renders exact citations as elements with approval metadata and reviewed evidence',()=>{
  const env=setup(),payload=structuredClone(SAMPLE.payload),quote=payload.documents[0].text;
  env.state.currentJob={id:'job_render',kind:'rfi',title:'Source evidence rendering',status:'completed',cohort:'baseline',dataClassification:'synthetic',payload,result:{outcome:'answer_from_records',draftAnswer:'Use the east entrance.',rationale:'The approved plan directs the route.',uncertainties:['Check the inspection status.'],citations:[{documentId:payload.documents[0].id,quote}],humanDecision:'pending'},provenance:{model:'qwen3.5:27b'},timings:{totalMs:1234}};
  env.state.currentJobDetail={reviews:[{decision:'answer_from_records',correctedAnswer:'Use the east service entrance.',notes:'Checked revision C.',reviewerId:'reviewer_1',createdAt:'2026-11-02T18:00:00Z',citations:[{documentId:payload.documents[0].id,quote}],metrics:{reviewSeconds:60}}],attempts:[]};
  env.render('renderJob');
  const root=env.get('review-content'),citations=find(root,n=>n.className==='citation');
  assert.equal(citations.length,2);
  for(const citation of citations){assert.match(citation.textContent,/Approved corridor access plan/);assert.match(citation.textContent,/Revision C/);assert.match(citation.textContent,/approved/);assert.match(citation.textContent,/Current revision/);assert.ok(find(citation,n=>n.tag==='blockquote').some(n=>n.textContent===quote));}
  assert.match(root.textContent,/Answer approved by the reviewer/);
  assert.match(root.textContent,/Review time: 1m 00s/);
  noStringifiedNodes(root);
});

test('completed result without citations renders the evidence empty state',()=>{
  const env=setup();
  env.state.currentJob={id:'job_empty',kind:'rfi',status:'completed',title:'Needs clarification',cohort:'baseline',payload:structuredClone(SAMPLE.payload),result:{outcome:'formal_clarification',draftAnswer:'',rationale:'No authorization.',uncertainties:[],citations:[],humanDecision:'pending'}};
  env.state.currentJobDetail={reviews:[],attempts:[]};
  env.render('renderJob');
  const root=env.get('review-content');
  assert.match(root.textContent,/No source quotation was supplied/);
  assert.equal(find(root,n=>n.className==='citation').length,0);
  noStringifiedNodes(root);
});

test('deeply nested child lists preserve their nodes and safe literal text',()=>{
  const env=setup();
  const node=vm.runInContext('h("div",{},[[h("span",{},"first"),[h("em",{},"<script>literal</script>")]],null,false,0])',env.context);
  assert.equal(node.nodes.length,3);
  assert.equal(node.nodes[0].tag,'span');
  assert.equal(node.nodes[1].tag,'em');
  assert.equal(node.textContent,'first<script>literal</script>0');
  vm.runInContext('replace("nested",[[[h("strong",{},"retained")]]],0,null,false)',env.context);
  assert.equal(env.get('nested').nodes[0].tag,'strong');
  assert.equal(env.get('nested').textContent,'retained0');
  noStringifiedNodes(node);
});

test('lesson and result tables render nested records as nodes',()=>{
  const env=setup(),release={id:'release_1',version:1,label:'Authority',createdAt:'2026-11-02T18:00:00Z',items:[{title:'Approval matters',text:'A request does not authorize a change.',approvedAt:'2026-11-02T18:00:00Z',reviewId:'review_1'}]};
  env.state.lessons={activeRelease:release,releases:[release],proposals:[{id:'lesson_1',title:'Keep current records',text:'Check the revision.',createdAt:'2026-11-02T18:00:00Z'}]};
  env.render('renderLessons');
  const lessons=env.get('lessons-content');
  assert.match(lessons.textContent,/A request does not authorize a change/);
  assert.match(lessons.textContent,/Keep current records/);
  assert.equal(find(lessons,n=>n.className==='release-item').length,1);
  noStringifiedNodes(lessons);
  env.state.metrics={quality:{accuracy:100,completeness:100},incorrectClosures:{assessed:1,count:0},unnecessaryRfisAvoided:{assessed:1,count:1},reviewedJobs:1,unreviewedCompletedJobs:0,timing:{reviewSamples:1,reviewSeconds:60},byCohort:[{cohort:'baseline',reviewedJobs:1,quality:{accuracy:100,completeness:100},incorrectClosures:{assessed:1,count:0}}]};
  env.render('renderMetrics');
  const metrics=env.get('metrics-content');
  assert.equal(find(metrics,n=>n.tag==='tbody')[0].nodes[0].tag,'tr');
  assert.match(metrics.textContent,/100\.0%/);
  noStringifiedNodes(metrics);
});
