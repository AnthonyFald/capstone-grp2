'use strict';

// Model-supplied warnings are evidence pointers, never publishable prose.
// One invalid entry counts once, regardless of how many fields are invalid.
function materializeSourceWarnings(rawWarnings, documentsMap) {
  if (!Array.isArray(rawWarnings) || rawWarnings.length > 5) {
    throw new TypeError('Warning evidence must be a list of at most five source quotations.');
  }
  if (!(documentsMap instanceof Map)) {
    throw new TypeError('Warning evidence needs a document map.');
  }
  const warnings = [], evidence = [];
  let invalidCount = 0;
  for (const entry of rawWarnings) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
        || Object.keys(entry).length !== 2
        || !Object.hasOwn(entry, 'documentId') || !Object.hasOwn(entry, 'quote')
        || typeof entry.documentId !== 'string' || !entry.documentId.trim()
        || typeof entry.quote !== 'string' || !entry.quote.trim() || entry.quote.length > 2000) {
      invalidCount++;
      continue;
    }
    const document = documentsMap.get(entry.documentId);
    if (!document || typeof document.title !== 'string' || !document.title.trim()
        || typeof document.text !== 'string' || !document.text.includes(entry.quote)) {
      invalidCount++;
      continue;
    }
    warnings.push(document.title + ': “' + entry.quote + '”');
    evidence.push({documentId:entry.documentId, quote:entry.quote});
  }
  return {warnings, invalidCount, evidence};
}

module.exports = {materializeSourceWarnings};
