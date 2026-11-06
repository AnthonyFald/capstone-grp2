import test from 'node:test';
import assert from 'node:assert/strict';
import {STARTER_BATCH,importBatch,validateBatchDocuments,textDocument,boardTotals,batchResult,reviewedProposalItems,isBatch,appendChildren} from './board-model.mjs';
import {validateConsolidationPayload} from '../cloud/consolidation.mjs';

test('the fictional multi-document intake is accepted by the actual service contract',()=>{
  const batch=importBatch(structuredClone(STARTER_BATCH));
  assert.equal(batch.payload.mode,'consolidation');
  assert.equal(batch.payload.documents.length,3);
  assert.deepEqual(validateConsolidationPayload(batch.payload),batch.payload);
  assert.equal(batch.dataClassification,'synthetic');
});

test('import preserves original text and explicit source identity byte for byte',()=>{
  const batch=structuredClone(STARTER_BATCH);
  batch.payload.documents[0].text='  A question?\r\nA distinct requirement.\n ';
  const result=importBatch(batch);
  assert.equal(result.payload.documents[0].text,batch.payload.documents[0].text);
  assert.equal(result.payload.documents[0].id,batch.payload.documents[0].id);
});

test('new plain-text files never acquire approval or currency from their filename',()=>{
  const document=textDocument('APPROVED FINAL.txt','A proposed field change.','new-record');
  assert.equal(document.approval,'informal');
  assert.equal(document.current,false);
  assert.equal(document.kind,'request');
  assert.equal(document.revision,'Unverified');
  assert.throws(()=>textDocument('request.pdf','%PDF binary','new-record'),/plain|\.txt/);
  assert.throws(()=>textDocument('request.txt','some\0binary','new-record'),/binary/);
});

test('imports cannot inject evaluation labels, an existing board, or duplicate source identities',()=>{
  const batch=structuredClone(STARTER_BATCH);
  assert.throws(()=>importBatch({...batch,answer_key:['duplicate']}),/evaluation or answer-key/);
  assert.throws(()=>importBatch({...batch,payload:{...batch.payload,board:{version:4,tasks:[]}}}),/task board is supplied/);
  batch.payload.documents[1].id=batch.payload.documents[0].id;
  assert.throws(()=>importBatch(batch),/unique/);
});

test('authority, dates, capacity, and request/reference roles remain explicit',()=>{
  const original=structuredClone(STARTER_BATCH.payload.documents);
  for(const edit of [docs=>docs[0].issuedAt='2026-02-30',docs=>docs[0].current='yes',docs=>docs[0].approval='superseded',docs=>docs[0].kind='instruction',docs=>docs.forEach(d=>d.kind='reference'),docs=>docs[0].text='a'.repeat(30001)]){
    const documents=structuredClone(original);edit(documents);assert.throws(()=>validateBatchDocuments(documents));
  }
  const valid=structuredClone(original);valid[1].kind='reference';valid[1].approval='approved';valid[1].current=false;
  assert.equal(validateBatchDocuments(valid)[1].current,false);
});

test('task counts exclude shared parent groups and never imply an RFI reduction',()=>{
  const totals=boardTotals({tasks:[{type:'group',status:'open'},{type:'task',status:'open'},{type:'task',status:'resolved'}],documents:[{},{}]});
  assert.deepEqual(totals,{tasks:2,open:1,resolved:1,groups:1,documents:2});
  assert.equal(Object.hasOwn(totals,'rfiReduction'),false);
});

test('old triage results remain distinguishable from incremental consolidation proposals',()=>{
  assert.equal(isBatch({payload:{question:'A question'}}),false);
  assert.equal(isBatch({payload:{mode:'consolidation'}}),true);
  const result={mode:'consolidation',items:[]};
  assert.equal(batchResult({result}),result);
  assert.equal(batchResult({result:{result}}),result);
});

test('conditional proposal sections never render literal null or stringify source-card arrays',()=>{
  const children=[],root={append(...nodes){children.push(...nodes);}},first={title:'Preserved original'},second={title:'Current evidence'};
  appendChildren(root,first,null,[false,[second,undefined]],0);
  assert.deepEqual(children,[first,second,0]);
});

test('review receipts never show an original model answer as the accepted outcome after rejection or reopening',()=>{
  const original={id:'item1',action:'already_answered',answer:'Use the proposed route.',citations:[{documentId:'ref1',quote:'Proposed route'}],reason:'Model suggestion'};
  for(const action of ['reject','create_task','needs_review','flag_conflict']){
    const [display]=reviewedProposalItems([original],[{itemId:'item1',action,notes:'Source is a draft.',reviewedAnswer:original.answer,reviewedCitations:original.citations}]);
    assert.equal(display.action,action);assert.equal(display.answer,'');assert.deepEqual(display.citations,[]);
    assert.equal(display.originalAnswer,original.answer);assert.deepEqual(display.originalCitations,original.citations);
    assert.equal(display.reason,'Source is a draft.');
  }
  assert.equal(original.action,'already_answered');assert.equal(original.answer,'Use the proposed route.');
});

test('a human-corrected answer is displayed with its own evidence while retaining the original proposal',()=>{
  const original={id:'item1',action:'needs_review',answer:'',citations:[],reason:'Needs checking'};
  const decision={itemId:'item1',action:'already_answered',reviewedAnswer:'Use Rev C.',reviewedCitations:[{documentId:'approved-C',quote:'Use Rev C.'}],notes:'Checked current approved drawing.'};
  const [display]=reviewedProposalItems([original],[decision]);
  assert.equal(display.answer,'Use Rev C.');assert.deepEqual(display.citations,decision.reviewedCitations);
  assert.equal(display.originalAction,'needs_review');assert.equal(display.originalAnswer,'');
});
