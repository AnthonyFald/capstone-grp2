'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {materializeSourceWarnings} = require('./warning-evidence.cjs');

const records = new Map([
  ['clarification', {title:'Approved clarification', text:'Both records remain current. No supersession relationship has been established.'}],
  ['field-note', {title:'Field note', text:'Check René’s north entrance.\n  Confirm access before noon.  '}]
]);

test('only exact source quotations become warnings, with the actual source title', () => {
  const out = materializeSourceWarnings([
    {documentId:'clarification', quote:'No supersession relationship has been established.'},
    {documentId:'field-note', quote:'Check René’s north entrance.'}
  ], records);
  assert.deepEqual(out, {warnings:[
    'Approved clarification: “No supersession relationship has been established.”',
    'Field note: “Check René’s north entrance.”'
  ], invalidCount:0, evidence:[
    {documentId:'clarification', quote:'No supersession relationship has been established.'},
    {documentId:'field-note', quote:'Check René’s north entrance.'}
  ]});
});

test('unsupported supersession prose and legacy warning sentences cannot escape as facts', () => {
  const out = materializeSourceWarnings([
    {documentId:'clarification', quote:'The newer approved record supersedes the prior record.'},
    'The newer approved record supersedes the prior record.',
    {documentId:'clarification', quote:'Both records remain current.', explanation:'Therefore the older one is superseded.'}
  ], records);
  assert.deepEqual(out, {warnings:[], invalidCount:3, evidence:[]});
});

test('IDs and source text are never guessed, joined, normalized, or trimmed', () => {
  const out = materializeSourceWarnings([
    {documentId:'Clarification', quote:'Both records remain current.'},
    {documentId:' clarification ', quote:'Both records remain current.'},
    {documentId:'unknown', quote:'Both records remain current.'},
    {documentId:'clarification', quote:'Both records remain current. … No supersession relationship has been established.'},
    {documentId:'field-note', quote:"Check René's north entrance."}
  ], records);
  assert.deepEqual(out, {warnings:[], invalidCount:5, evidence:[]});
});

test('exact spacing and Unicode survive, and neither input nor documents are mutated', () => {
  const quote = 'north entrance.\n  Confirm access before noon.  ';
  const entries = [{documentId:'field-note', quote}];
  const beforeEntries = structuredClone(entries), beforeRecords = structuredClone(records);
  const out = materializeSourceWarnings(entries, records);
  assert.deepEqual(out, {warnings:['Field note: “' + quote + '”'], invalidCount:0, evidence:[{documentId:'field-note', quote}]});
  assert.notEqual(out.evidence[0], entries[0]);
  assert.deepEqual(entries, beforeEntries);
  assert.deepEqual(records, beforeRecords);
});

test('each malformed entry is counted once and contributes no output', () => {
  for (const entries of [
    [null, [], 42, false, {}],
    [{documentId:'clarification'}, {quote:'Both records remain current.'}, {documentId:null, quote:null}, {documentId:'', quote:''}, {documentId:'clarification', quote:'   '}],
    [{documentId:'clarification', quote:'Both records remain current.', extra:true}, {documentId:'clarification', quote:'Both records remain current.', extra:true, sentence:'Unsupported'}]
  ]) assert.deepEqual(materializeSourceWarnings(entries, records), {warnings:[], invalidCount:entries.length, evidence:[]});
});

test('mixed valid and invalid pointers retain valid source order without publishing bad entries', () => {
  const out = materializeSourceWarnings([
    {documentId:'field-note', quote:'Confirm access before noon.'},
    {documentId:'unknown', quote:'Invented warning.'},
    {documentId:'clarification', quote:'Both records remain current.'}
  ], records);
  assert.deepEqual(out, {warnings:['Field note: “Confirm access before noon.”', 'Approved clarification: “Both records remain current.”'], invalidCount:1, evidence:[
    {documentId:'field-note', quote:'Confirm access before noon.'},
    {documentId:'clarification', quote:'Both records remain current.'}
  ]});
});

test('quote size and batch size are bounded, while an empty warning list is valid', () => {
  const documents = new Map([['long', {title:'Long source', text:'x'.repeat(2001)}]]);
  assert.equal(materializeSourceWarnings([{documentId:'long', quote:'x'.repeat(2000)}], documents).warnings.length, 1);
  assert.deepEqual(materializeSourceWarnings([{documentId:'long', quote:'x'.repeat(2001)}], documents), {warnings:[], invalidCount:1, evidence:[]});
  assert.deepEqual(materializeSourceWarnings([], documents), {warnings:[], invalidCount:0, evidence:[]});
  for (const value of [null, undefined, {}, 'warning', Array(6).fill({documentId:'long', quote:'x'})]) {
    assert.throws(() => materializeSourceWarnings(value, documents), /at most five/);
  }
});

test('missing actual source title or text cannot fall back to model-provided identity', () => {
  const documents = new Map([['missing-title', {text:'Source text.'}], ['missing-text', {title:'Known title'}], ['empty-title', {title:' ', text:'Source text.'}]]);
  assert.deepEqual(materializeSourceWarnings([...documents.keys()].map(documentId => ({documentId, quote:'Source text.'})), documents), {warnings:[], invalidCount:3, evidence:[]});
  assert.throws(() => materializeSourceWarnings([], {}), /document map/);
});
