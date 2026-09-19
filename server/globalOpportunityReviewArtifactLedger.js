'use strict';

const crypto = require('node:crypto');

const VERSION = 'GLOBAL_REVIEW_ARTIFACT_LEDGER_V1_PROPOSAL';
const HASH_RE = /^[a-f0-9]{64}$/i;
const ARTIFACT_TYPES = Object.freeze({
  ADD_REVIEW_NOTE: 'REVIEW_NOTE',
  FLAG_FOR_REVIEW: 'REVIEW_FLAG',
  PROPOSE_CLUSTER_MERGE: 'CLUSTER_MERGE_PROPOSAL',
  PROPOSE_CLUSTER_SPLIT: 'CLUSTER_SPLIT_PROPOSAL',
  REQUEST_CANONICAL_EVALUATION: 'CANONICAL_EVALUATION_REQUEST'
});
const FORBIDDEN_METADATA_KEYS = new Set([
  'status','candidateStatus','proofGate','qualified','promoteToProject','projectId','projectState',
  'productTruth','mkl','publish','publishReady','approved','approval','listingStatus'
]);

function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}
function sha256(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function text(value, max = 500) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, max);
}
function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') {
    const out = {}; for (const [k, v] of Object.entries(value)) out[k] = clone(v); return out;
  }
  return value;
}
function envelopeHashBody(envelope) {
  const out = {};
  for (const [key, value] of Object.entries(envelope || {})) if (key !== 'envelopeHash') out[key] = value;
  return out;
}
function validateEnvelope(envelope) {
  if (!envelope || envelope.authority !== 'REVIEW_ONLY') fail('GLOBAL_REVIEW_LEDGER_INVALID_ENVELOPE_AUTHORITY');
  if (!ARTIFACT_TYPES[envelope.intent]) fail('GLOBAL_REVIEW_LEDGER_UNSUPPORTED_INTENT');
  if (!HASH_RE.test(String(envelope.sourceViewHash || ''))) fail('GLOBAL_REVIEW_LEDGER_INVALID_VIEW_HASH');
  if (!HASH_RE.test(String(envelope.envelopeHash || ''))) fail('GLOBAL_REVIEW_LEDGER_INVALID_ENVELOPE_HASH');
  const expected = sha256(stable(envelopeHashBody(envelope)));
  if (expected !== String(envelope.envelopeHash).toLowerCase()) fail('GLOBAL_REVIEW_LEDGER_ENVELOPE_HASH_MISMATCH');
  if (envelope?.handoff?.executableByReviewLayer !== false) fail('GLOBAL_REVIEW_LEDGER_EXECUTION_AUTHORITY_LEAK');
  if (envelope?.handoff?.recordableAsReviewArtifact !== true) fail('GLOBAL_REVIEW_LEDGER_NOT_RECORDABLE');
  const expectsCanonicalHandoff = envelope.intent === 'REQUEST_CANONICAL_EVALUATION';
  if (envelope?.handoff?.requiresCanonicalAuthority !== expectsCanonicalHandoff) {
    fail('GLOBAL_REVIEW_LEDGER_HANDOFF_SEMANTICS_INVALID');
  }
  const effects = envelope.requestedEffects || {};
  if (Object.values(effects).some(Boolean)) fail('GLOBAL_REVIEW_LEDGER_CANONICAL_EFFECT_LEAK');
}
function validIsoTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}
function normalizeMetadataKey(value) {
  return text(value, 80).replace(/[_\s-]+/g, '').toLowerCase();
}
function sanitizeMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) fail('GLOBAL_REVIEW_LEDGER_INVALID_METADATA');
  const forbidden = new Set([...FORBIDDEN_METADATA_KEYS].map(normalizeMetadataKey));
  const out = {};
  const normalizedSeen = new Set();
  for (const [key, value] of Object.entries(metadata)) {
    const safeKey = text(key, 80);
    const normalizedKey = normalizeMetadataKey(safeKey);
    if (!safeKey) continue;
    if (forbidden.has(normalizedKey)) fail('GLOBAL_REVIEW_LEDGER_CANONICAL_METADATA_FORBIDDEN');
    if (normalizedSeen.has(normalizedKey)) fail('GLOBAL_REVIEW_LEDGER_METADATA_KEY_COLLISION');
    normalizedSeen.add(normalizedKey);
    if (value == null || typeof value === 'boolean') out[safeKey] = value;
    else if (typeof value === 'number') {
      if (!Number.isFinite(value)) fail('GLOBAL_REVIEW_LEDGER_METADATA_NUMBER_INVALID');
      out[safeKey] = value;
    } else if (typeof value === 'string') out[safeKey] = text(value, 500);
    else fail('GLOBAL_REVIEW_LEDGER_METADATA_MUST_BE_SCALAR');
  }
  return out;
}
function createReviewLedger(options = {}) {
  const scopeId = text(options.scopeId, 160);
  const sourceViewHash = String(options.sourceViewHash || '').toLowerCase();
  if (!scopeId) fail('GLOBAL_REVIEW_LEDGER_SCOPE_REQUIRED');
  if (!HASH_RE.test(sourceViewHash)) fail('GLOBAL_REVIEW_LEDGER_INVALID_VIEW_HASH');
  const body = {
    version: VERSION,
    authority: 'REVIEW_ONLY',
    storageContract: 'SEPARATE_IMMUTABLE_REVIEW_LEDGER',
    scopeId,
    sourceViewHash,
    entries: [],
    entryCount: 0,
    tailHash: null
  };
  body.ledgerHash = sha256(stable(body));
  return deepFreeze(body);
}
function ledgerHashBody(ledger) {
  const out = clone(ledger);
  delete out.ledgerHash;
  return out;
}
function validateLedger(ledger) {
  if (!ledger || ledger.version !== VERSION || ledger.authority !== 'REVIEW_ONLY') fail('GLOBAL_REVIEW_LEDGER_INVALID_LEDGER');
  if (!Array.isArray(ledger.entries) || Number(ledger.entryCount) !== ledger.entries.length) fail('GLOBAL_REVIEW_LEDGER_COUNT_MISMATCH');
  if (!HASH_RE.test(String(ledger.sourceViewHash || '')) || !HASH_RE.test(String(ledger.ledgerHash || ''))) fail('GLOBAL_REVIEW_LEDGER_INVALID_HASH');
  let previous = null;
  for (let index = 0; index < ledger.entries.length; index += 1) {
    const entry = ledger.entries[index];
    if (entry.sequence !== index + 1) fail('GLOBAL_REVIEW_LEDGER_SEQUENCE_MISMATCH');
    if (entry.previousEntryHash !== previous) fail('GLOBAL_REVIEW_LEDGER_CHAIN_MISMATCH');
    if (entry.authority !== 'REVIEW_ONLY') fail('GLOBAL_REVIEW_LEDGER_ENTRY_AUTHORITY_LEAK');
    if (ARTIFACT_TYPES[entry.intent] !== entry.type) fail('GLOBAL_REVIEW_LEDGER_ENTRY_TYPE_MISMATCH');
    if (entry.sourceViewHash !== ledger.sourceViewHash) fail('GLOBAL_REVIEW_LEDGER_ENTRY_VIEW_SCOPE_MISMATCH');
    if (entry.canonicalEffects !== 'NONE') fail('GLOBAL_REVIEW_LEDGER_ENTRY_CANONICAL_EFFECT_LEAK');
    if (!validIsoTimestamp(entry.recordedAt)) fail('GLOBAL_REVIEW_LEDGER_ENTRY_TIMESTAMP_INVALID');
    if (!text(entry.reviewerRef, 160)) fail('GLOBAL_REVIEW_LEDGER_ENTRY_REVIEWER_REQUIRED');
    sanitizeMetadata(entry.metadata || {});
    const body = clone(entry); delete body.entryHash; delete body.artifactId;
    const expected = sha256(stable(body));
    if (expected !== entry.entryHash) fail('GLOBAL_REVIEW_LEDGER_ENTRY_HASH_MISMATCH');
    if (entry.artifactId !== 'RA-' + expected.slice(0, 24)) fail('GLOBAL_REVIEW_LEDGER_ARTIFACT_ID_MISMATCH');
    previous = entry.entryHash;
  }
  if ((ledger.tailHash || null) !== previous) fail('GLOBAL_REVIEW_LEDGER_TAIL_MISMATCH');
  const expectedLedger = sha256(stable(ledgerHashBody(ledger)));
  if (expectedLedger !== ledger.ledgerHash) fail('GLOBAL_REVIEW_LEDGER_HASH_MISMATCH');
  return true;
}
function appendReviewArtifact(ledger, envelope, options = {}) {
  validateLedger(ledger);
  validateEnvelope(envelope);
  if (String(envelope.sourceViewHash).toLowerCase() !== String(ledger.sourceViewHash).toLowerCase()) {
    fail('GLOBAL_REVIEW_LEDGER_VIEW_SCOPE_MISMATCH');
  }
  const recordedAt = String(options.recordedAt || '');
  if (!validIsoTimestamp(recordedAt)) fail('GLOBAL_REVIEW_LEDGER_RECORDED_AT_REQUIRED');
  const reviewerRef = text(options.reviewerRef, 160);
  if (!reviewerRef) fail('GLOBAL_REVIEW_LEDGER_REVIEWER_REF_REQUIRED');
  const metadata = sanitizeMetadata(options.metadata || {});
  const sequence = ledger.entries.length + 1;
  const body = {
    sequence,
    type: ARTIFACT_TYPES[envelope.intent],
    authority: 'REVIEW_ONLY',
    sourceViewHash: String(envelope.sourceViewHash).toLowerCase(),
    sourceEnvelopeHash: String(envelope.envelopeHash).toLowerCase(),
    intent: envelope.intent,
    target: clone(envelope.target),
    relatedTargetIds: [...(envelope.relatedTargetIds || [])],
    note: envelope.note || null,
    reviewerRef,
    recordedAt,
    metadata,
    previousEntryHash: ledger.tailHash,
    canonicalEffects: 'NONE'
  };
  const entryHash = sha256(stable(body));
  const entry = deepFreeze({ ...body, artifactId: 'RA-' + entryHash.slice(0, 24), entryHash });
  const next = {
    version: VERSION,
    authority: 'REVIEW_ONLY',
    storageContract: 'SEPARATE_IMMUTABLE_REVIEW_LEDGER',
    scopeId: ledger.scopeId,
    sourceViewHash: ledger.sourceViewHash,
    entries: [...ledger.entries, entry],
    entryCount: sequence,
    tailHash: entryHash
  };
  next.ledgerHash = sha256(stable(next));
  validateLedger(next);
  return deepFreeze(next);
}
function verifyReviewLedger(ledger) {
  try { validateLedger(ledger); return deepFreeze({ valid: true, code: 'VALID', entryCount: ledger.entryCount, tailHash: ledger.tailHash }); }
  catch (error) { return deepFreeze({ valid: false, code: error.code || 'INVALID', entryCount: Array.isArray(ledger?.entries) ? ledger.entries.length : 0, tailHash: ledger?.tailHash || null }); }
}

module.exports = Object.freeze({
  VERSION, ARTIFACT_TYPES, createReviewLedger, appendReviewArtifact, verifyReviewLedger
});
