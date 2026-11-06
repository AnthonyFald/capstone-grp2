import test from 'node:test';
import assert from 'node:assert/strict';
import {SAMPLE,importQuestion,validatePayload,workspaceOrigin,sourceMatches,reviewMetrics,percentage,duration} from './model.mjs';

const sample=()=>structuredClone(SAMPLE);
const form=values=>({elements:{namedItem:name=>Object.hasOwn(values,name)?{value:String(values[name])}:null}});

test('model-only example imports with explicit synthetic classification',()=>{
  const input=importQuestion(sample());
  assert.equal(input.dataClassification,'synthetic');
  assert.equal(input.cohort,'learning');
  assert.equal(input.payload.documents[1].approval,'draft');
});
test('answer keys and unexpected input fields cannot enter a model job',()=>{
  for(const key of ['evaluation','answer_key','expected_answer','ground_truth','reference']){
    const input=sample(); input.payload.documents[0][key]='hidden answer';
    assert.throws(()=>importQuestion(input),/evaluation or answer-key/);
  }
  assert.throws(()=>importQuestion({...sample(),scores:[100]}),/evaluation or answer-key/);
  assert.throws(()=>importQuestion({...sample(),unsupported:'value'}),/Unsupported/);
});
test('record identity, date, status and project limits are validated',()=>{
  const edits=[
    p=>p.documents[1].id=p.documents[0].id,
    p=>p.documents[0].id='id with spaces',
    p=>p.documents[0].issuedAt='2026-02-30',
    p=>p.documents[0].approval='superseded',
    p=>p.question='x'.repeat(2001),
    p=>p.documents[0].text='x'.repeat(30000),
    p=>p.documents[0].title='x'.repeat(161),
  ];
  for(const edit of edits){const p=sample().payload;edit(p);assert.throws(()=>validatePayload(p));}
});
test('only exact quotes in current approved records can authorize an answer',()=>{
  const docs=sample().payload.documents;
  const citation={documentId:docs[0].id,quote:'The north entrance remains closed while the overhead protection is inspected.'};
  assert.equal(sourceMatches(citation,docs).eligible,true);
  assert.equal(sourceMatches(citation,docs).exact,true);
  assert.equal(sourceMatches({...citation,quote:'The north entrance is open.'},docs).exact,false);
  assert.equal(sourceMatches({documentId:docs[1].id,quote:docs[1].text},docs).eligible,false);
  docs[0].current=false;
  assert.equal(sourceMatches(citation,docs).eligible,false);
  assert.equal(sourceMatches({documentId:'missing',quote:'anything'},docs).exact,false);
});
test('remote credentials require HTTPS and a plain service origin',()=>{
  assert.equal(workspaceOrigin('https://capstone.example/'),'https://capstone.example');
  assert.equal(workspaceOrigin('http://127.0.0.1:4188'),'http://127.0.0.1:4188');
  for(const address of ['http://capstone.example','https://name:key@capstone.example','https://capstone.example/?token=secret','https://capstone.example/api','javascript:alert(1)'])assert.throws(()=>workspaceOrigin(address));
});
test('unassessed review values stay absent, while explicit zero and no remain assessed',()=>{
  assert.deepEqual(reviewMetrics(form({correctFacts:'',reviewSeconds:'',incorrectClosure:''})),{});
  assert.deepEqual(reviewMetrics(form({correctFacts:0,reviewSeconds:0,incorrectClosure:'no'})),{correctFacts:0,reviewSeconds:0,incorrectClosure:false});
  assert.equal(percentage(null),'Not assessed');
  assert.equal(percentage(0),'0.0%');
  assert.equal(duration(null),'Not recorded');
});
test('review fact totals and negative or fractional fact counts are rejected',()=>{
  assert.throws(()=>reviewMetrics(form({requiredFacts:4,correctFacts:3,incorrectFacts:0,missingFacts:0})),/must equal/);
  assert.throws(()=>reviewMetrics(form({correctFacts:-1})),/nonnegative/);
  assert.throws(()=>reviewMetrics(form({correctFacts:0.5})),/whole/);
  assert.deepEqual(reviewMetrics(form({requiredFacts:4,correctFacts:3,incorrectFacts:0,missingFacts:1,extraErrors:0,reviewSeconds:11.4})),{requiredFacts:4,correctFacts:3,incorrectFacts:0,missingFacts:1,extraErrors:0,reviewSeconds:11.4});
});
