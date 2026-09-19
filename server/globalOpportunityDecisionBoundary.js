'use strict';

const crypto = require('node:crypto');

const VERSION = 'GLOBAL_DECISION_BOUNDARY_V1_PROPOSAL';
const HASH_RE = /^[a-f0-9]{64}$/i;
const REVIEW_INTENTS = new Set([
  'ADD_REVIEW_NOTE',
  'FLAG_FOR_REVIEW',
  'PROPOSE_CLUSTER_MERGE',
  'PROPOSE_CLUSTER_SPLIT',
  'REQUEST_CANONICAL_EVALUATION'
]);
const CANONICAL_ONLY_INTENTS = new Set([
  'SET_WATCH',
  'SET_QUALIFIED',
  'SET_REJECTED',
  'SET_STALE',
  'SET_PROMOTE_TO_PROJECT',
  'MUTATE_CANDIDATE_STATUS',
  'DELETE_CANDIDATE',
  'CREATE_PROJECT',
  'MUTATE_PROJECT_STATE',
  'WRITE_PRODUCT_TRUTH',
  'ACCEPT_PRODUCT_TRUTH',
  'FREEZE_MKL',
  'MUTATE_MKL',
  'SET_PROOF_GATE',
  'UPDATE_CLUSTER',
  'WRITE_CLUSTER_OVERRIDE',
  'APPROVE_LISTING',
  'PUBLISH',
  'EXPORT_PUBLISH_READY'
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
function text(value, max = 240) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, max);
}
function cloneWithoutHash(value, hashKey) {
  const out = {};
  for (const [key, child] of Object.entries(value || {})) if (key !== hashKey) out[key] = child;
  return out;
}

function validateViewModel(viewModel) {
  if (!viewModel || typeof viewModel !== 'object') fail('GLOBAL_DECISION_BOUNDARY_INVALID_VIEW_MODEL');
  if (viewModel.authority !== 'PROPOSAL_ONLY') fail('GLOBAL_DECISION_BOUNDARY_NON_PROPOSAL_AUTHORITY');
  if (!HASH_RE.test(String(viewModel.viewHash || ''))) fail('GLOBAL_DECISION_BOUNDARY_INVALID_VIEW_HASH');
  const expected = sha256(stable(cloneWithoutHash(viewModel, 'viewHash')));
  if (expected !== String(viewModel.viewHash).toLowerCase()) fail('GLOBAL_DECISION_BOUNDARY_VIEW_HASH_MISMATCH');
  if (!viewModel.contract || viewModel.contract.readOnly !== true || !Array.isArray(viewModel.contract.mutationsExposed)
      || viewModel.contract.mutationsExposed.length !== 0) {
    fail('GLOBAL_DECISION_BOUNDARY_VIEW_NOT_READ_ONLY');
  }
  const forbiddenFlags = ['canonicalGateAuthority','createProjectEnabled','productTruthEnabled','publishEnabled'];
  if (forbiddenFlags.some(key => viewModel.contract[key] !== false)) fail('GLOBAL_DECISION_BOUNDARY_CANONICAL_AUTHORITY_LEAK');
}

function targetExists(viewModel, target) {
  if (!target || typeof target !== 'object') return false;
  const type = text(target.type, 80).toUpperCase();
  const id = text(target.id, 160);
  if (!id) return false;
  if (type === 'CLUSTER') return Boolean(viewModel.detailsById && viewModel.detailsById[id]);
  if (type === 'CONFLICT') {
    const rows = viewModel?.conflictTable?.rows || [];
    return rows.some(row => row.id === id);
  }
  return false;
}
function normalizeIntent(request = {}) {
  const intent = text(request.intent, 120).toUpperCase();
  const note = text(request.note, 1000);
  const target = request.target && typeof request.target === 'object'
    ? { type: text(request.target.type, 80).toUpperCase(), id: text(request.target.id, 160) }
    : null;
  const relatedTargetIds = Array.isArray(request.relatedTargetIds)
    ? [...new Set(request.relatedTargetIds.map(id => text(id, 160)).filter(Boolean))].sort()
    : [];
  return { intent, note, target, relatedTargetIds };
}

function classifyIntent(intent) {
  if (REVIEW_INTENTS.has(intent)) return 'REVIEW_ONLY';
  if (CANONICAL_ONLY_INTENTS.has(intent)) return 'CANONICAL_ONLY';
  return 'UNKNOWN';
}

function buildReviewDecisionEnvelope(viewModel, request = {}) {
  validateViewModel(viewModel);
  const normalized = normalizeIntent(request);
  const classification = classifyIntent(normalized.intent);
  if (classification === 'UNKNOWN') fail('GLOBAL_DECISION_BOUNDARY_UNKNOWN_INTENT');
  if (classification === 'CANONICAL_ONLY') fail('GLOBAL_DECISION_BOUNDARY_CANONICAL_ONLY_INTENT');
  if (!normalized.target || !targetExists(viewModel, normalized.target)) fail('GLOBAL_DECISION_BOUNDARY_INVALID_TARGET');
  if (normalized.intent === 'PROPOSE_CLUSTER_MERGE') {
    if (normalized.target.type !== 'CLUSTER') fail('GLOBAL_DECISION_BOUNDARY_CLUSTER_TARGET_REQUIRED');
    if (normalized.relatedTargetIds.length === 0) fail('GLOBAL_DECISION_BOUNDARY_RELATED_TARGET_REQUIRED');
    if (normalized.relatedTargetIds.includes(normalized.target.id)) fail('GLOBAL_DECISION_BOUNDARY_SELF_RELATED_TARGET');
    if (normalized.relatedTargetIds.some(id => !targetExists(viewModel, { type: 'CLUSTER', id }))) {
      fail('GLOBAL_DECISION_BOUNDARY_INVALID_RELATED_TARGET');
    }
  }
  if (normalized.intent === 'PROPOSE_CLUSTER_SPLIT') {
    if (normalized.target.type !== 'CLUSTER') fail('GLOBAL_DECISION_BOUNDARY_CLUSTER_TARGET_REQUIRED');
    if (!normalized.note) fail('GLOBAL_DECISION_BOUNDARY_SPLIT_RATIONALE_REQUIRED');
  }
  if (normalized.intent === 'ADD_REVIEW_NOTE' && !normalized.note) fail('GLOBAL_DECISION_BOUNDARY_NOTE_REQUIRED');

  const envelope = {
    version: VERSION,
    authority: 'REVIEW_ONLY',
    sourceViewHash: String(viewModel.viewHash).toLowerCase(),
    intent: normalized.intent,
    target: normalized.target,
    relatedTargetIds: normalized.relatedTargetIds,
    note: normalized.note || null,
    requestedEffects: {
      writeCanonicalStatus: false,
      evaluateProofGate: false,
      createProject: false,
      mutateProjectState: false,
      mutateProductTruth: false,
      mutateMkl: false,
      approveListing: false,
      publish: false
    },
    handoff: {
      recordableAsReviewArtifact: true,
      requiresCanonicalAuthority: normalized.intent === 'REQUEST_CANONICAL_EVALUATION',
      executableByReviewLayer: false
    }
  };
  envelope.envelopeHash = sha256(stable(envelope));
  return deepFreeze(envelope);
}
function buildDecisionBoundaryContract(viewModel) {
  validateViewModel(viewModel);
  const contract = {
    version: VERSION,
    authority: 'REVIEW_ONLY',
    sourceViewHash: String(viewModel.viewHash).toLowerCase(),
    allowedReviewIntents: [...REVIEW_INTENTS].sort(),
    canonicalOnlyIntents: [...CANONICAL_ONLY_INTENTS].sort(),
    invariant: {
      reviewLayerMayAnnotate: true,
      reviewLayerMayPropose: true,
      reviewLayerMayRequestCanonicalEvaluation: true,
      reviewLayerMaySetProofGate: false,
      reviewLayerMaySetQualified: false,
      reviewLayerMayPromoteToProject: false,
      reviewLayerMayCreateProject: false,
      reviewLayerMayMutateProject: false,
      reviewLayerMayWriteProductTruth: false,
      reviewLayerMayMutateMkl: false,
      reviewLayerMayApproveListing: false,
      reviewLayerMayPublish: false
    }
  };
  contract.contractHash = sha256(stable(contract));
  return deepFreeze(contract);
}

module.exports = Object.freeze({
  VERSION, REVIEW_INTENTS, CANONICAL_ONLY_INTENTS,
  classifyIntent, buildReviewDecisionEnvelope, buildDecisionBoundaryContract
});
