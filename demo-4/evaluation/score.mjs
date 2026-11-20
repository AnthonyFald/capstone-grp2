import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

const [runDir, referenceFile] = process.argv.slice(2);
if (!runDir || !referenceFile) throw Error('Usage: node score.mjs RUN_DIRECTORY RESTRICTED_GROUND_TRUTH_JSON');

const json = async file => JSON.parse(await readFile(file, 'utf8'));
const [manifest, references, decisionsText] = await Promise.all([
  json(path.join(runDir,'manifest.json')),
  json(referenceFile),
  readFile(path.join(runDir,'decisions.jsonl'),'utf8')
]);
const decisions = decisionsText.trim().split('\n').map(line => JSON.parse(line));
const byId = new Map(references.map(reference => [reference.rfi_id,reference]));
if (!manifest.completed || decisions.length !== manifest.expectedCases || byId.size !== references.length ||
    decisions.length !== references.length || new Set(decisions.map(row => row.id)).size !== decisions.length) {
  throw Error('The run and the reference set must each contain the same completed set of unique cases.');
}

const rows = decisions.map(row => {
  const reference = byId.get(row.id);
  if (!reference) throw Error(`Missing reference for ${row.id}.`);
  const label = reference.ground_truth_classification;
  if (!['Necessary','Unnecessary'].includes(label)) throw Error(`Unknown reference classification for ${row.id}.`);
  const expected = label === 'Unnecessary' ? 'answer_from_records' : 'formal_clarification';
  const expectedSources = label === 'Unnecessary'
    ? [...new Set(String(reference.document_that_answers_rfi ?? '').split(';').map(source => source.trim()).filter(Boolean))]
    : [];
  if (label === 'Unnecessary' && !expectedSources.length) throw Error(`Missing expected answer source for ${row.id}.`);
  const citedIds = [...new Set(row.evidence.map(citation => citation.id))];
  const correctRouting = row.decision === expected || (label === 'Necessary' && row.decision === 'needs_review');
  const answered = row.decision === 'answer_from_records';
  return {...row, expected, correctRouting, expectedSources,
    citesAnyExpectedSource:expectedSources.length ? answered && expectedSources.some(source => citedIds.includes(source)) : null,
    citesAllExpectedSources:expectedSources.length ? answered && expectedSources.every(source => citedIds.includes(source)) : null};
});

const count = filter => rows.filter(filter).length;
const outcomeCounts = expected => Object.fromEntries(
  ['answer_from_records','formal_clarification','needs_review','error'].map(decision =>
    [decision,count(row => row.expected === expected && row.decision === decision)])
);
const summary = {
  model:manifest.model, modelDigest:manifest.modelDigest, inputSha256:manifest.inputSha256,
  wallMs:manifest.wallMs, reviewMs:manifest.reviewMs, linkedDocuments:manifest.linkedDocuments, total:rows.length,
  expectedAnswerable:count(row => row.expected === 'answer_from_records'),
  expectedNecessary:count(row => row.expected === 'formal_clarification'),
  recommendedAnswerFromRecords:count(row => row.decision === 'answer_from_records'),
  recommendedFormalClarification:count(row => row.decision === 'formal_clarification'),
  deferredForReview:count(row => row.decision === 'needs_review'),
  errors:count(row => row.decision === 'error'),
  exactDecisions:count(row => row.decision === row.expected),
  rubricCompatibleRoutes:count(row => row.correctRouting),
  correctlyAnsweredFromRecords:count(row => row.expected === 'answer_from_records' && row.decision === 'answer_from_records'),
  answerRoutesCitingAnyExpectedSource:count(row => row.citesAnyExpectedSource),
  answerRoutesCitingAllExpectedSources:count(row => row.citesAllExpectedSources),
  unnecessaryFormalRecommendations:count(row => row.expected === 'answer_from_records' && row.decision === 'formal_clarification'),
  necessaryCasesIncorrectlyRoutedToExistingAnswer:count(row => row.expected === 'formal_clarification' && row.decision === 'answer_from_records'),
  casesWithRejectedCitations:count(row => row.rejectedEvidence?.length),
  outcomesByExpectedDecision:{answerFromRecords:outcomeCounts('answer_from_records'),formalClarification:outcomeCounts('formal_clarification')}
};

function csvCell(value) {
  const text = String(value ?? '');
  return '"'+(/^[\s]*[=+@-]/.test(text) ? "'" : '')+text.replaceAll('"','""')+'"';
}

const outputHeaders = ['RFI ID','Decision','Explanation','Cited document IDs','Exact quotations','Run error'];
const outputRow = row => [row.id,row.decision,row.explanation,row.evidence.map(cite => cite.id).join('; '),
  row.evidence.map(cite => cite.quote).join('\n'),row.error];
const standalone = [outputHeaders,...rows.map(outputRow)];
const scored = [[...outputHeaders,'Expected decision','Expected answer sources','Cites any expected source','Cites all expected sources','Rubric-compatible routing'],
  ...rows.map(row => [...outputRow(row),row.expected,row.expectedSources.join('; '),row.citesAnyExpectedSource,row.citesAllExpectedSources,row.correctRouting])];
const csv = table => '\uFEFF'+table.map(row => row.map(csvCell).join(',')).join('\r\n')+'\r\n';

await Promise.all([
  writeFile(path.join(runDir,'rfi-decisions.csv'),csv(standalone)),
  writeFile(path.join(runDir,'scored-decisions.restricted.csv'),csv(scored)),
  writeFile(path.join(runDir,'score-summary.json'),JSON.stringify(summary,null,2)+'\n')
]);
console.log(JSON.stringify(summary,null,2));
