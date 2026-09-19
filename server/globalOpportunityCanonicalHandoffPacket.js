'use strict';

const crypto = require('node:crypto');
const { verifyReviewLedger } = require('./globalOpportunityReviewArtifactLedger');

const VERSION = 'GLOBAL_CANONICAL_HANDOFF_PACKET_V1_PROPOSAL';
const HASH_RE = /^[a-f0-9]{64}$/i;
const REQUEST_TYPE = 'CANONICAL_EVALUATION_REQUEST';

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
function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') {
    const out = {}; for (const [k, v] of Object.entries(value)) out[k] = clone(v); return out;
  }
  return value;
}
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function text(value, max = 500) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, max);
}
function withoutHash(value, key) {
  const out = {}; for (const [k, v] of Object.entries(value || {})) if (k !== key) out[k] = v; return out;
}
function validateViewModel(viewModel) {
  if (!viewModel || viewModel.authority !== 'PROPOSAL_ONLY') fail('GLOBAL_HANDOFF_INVALID_VIEW_MODEL_AUTHORITY');
  if (!HASH_RE.test(String(viewModel.viewHash || ''))) fail('GLOBAL_HANDOFF_INVALID_VIEW_HASH');
  const expected = sha256(stable(withoutHash(viewModel, 'viewHash')));
  if (expected !== String(viewModel.viewHash).toLowerCase()) fail('GLOBAL_HANDOFF_VIEW_HASH_MISMATCH');
  if (!viewModel.contract || viewModel.contract.readOnly !== true || viewModel.contract.mutationsExposed?.length !== 0) {
    fail('GLOBAL_HANDOFF_VIEW_NOT_READ_ONLY');
  }
  if (['canonicalGateAuthority','createProjectEnabled','productTruthEnabled','publishEnabled']
      .some(key => viewModel.contract[key] !== false)) fail('GLOBAL_HANDOFF_VIEW_AUTHORITY_LEAK');
}

function validateLedger(ledger) {
  if (!ledger || ledger.authority !== 'REVIEW_ONLY' || ledger.storageContract !== 'SEPARATE_IMMUTABLE_REVIEW_LEDGER') {
    fail('GLOBAL_HANDOFF_INVALID_LEDGER_AUTHORITY');
  }
  const verification = verifyReviewLedger(ledger);
  if (!verification.valid) {
    const error = new Error('GLOBAL_HANDOFF_LEDGER_INVALID_' + verification.code);
    error.code = 'GLOBAL_HANDOFF_LEDGER_INVALID_' + verification.code;
    throw error;
  }
}

function selectRequestArtifact(ledger, artifactId) {
  const id = text(artifactId, 120);
  if (!id) fail('GLOBAL_HANDOFF_REQUEST_ARTIFACT_REQUIRED');
  const matches = ledger.entries.filter(entry => entry.artifactId === id);
  if (matches.length !== 1) fail('GLOBAL_HANDOFF_REQUEST_ARTIFACT_NOT_UNIQUE');
  const entry = matches[0];
  if (entry.type !== REQUEST_TYPE || entry.intent !== 'REQUEST_CANONICAL_EVALUATION') {
    fail('GLOBAL_HANDOFF_ARTIFACT_NOT_CANONICAL_REQUEST');
  }
  if (entry.authority !== 'REVIEW_ONLY' || entry.canonicalEffects !== 'NONE') fail('GLOBAL_HANDOFF_REQUEST_AUTHORITY_LEAK');
  if (!HASH_RE.test(String(entry.entryHash || '')) || !HASH_RE.test(String(entry.sourceEnvelopeHash || ''))) {
    fail('GLOBAL_HANDOFF_INVALID_REQUEST_HASH');
  }
  return entry;
}
function resolveTarget(viewModel, requestEntry) {
  const target = requestEntry.target || {};
  if (target.type !== 'CLUSTER') fail('GLOBAL_HANDOFF_CLUSTER_TARGET_REQUIRED');
  const detail = viewModel?.detailsById?.[target.id];
  if (!detail) fail('GLOBAL_HANDOFF_TARGET_NOT_IN_VIEW');
  return detail;
}

function evidenceLineage(detail) {
  const rows = Array.isArray(detail.provenance) ? detail.provenance : [];
  return rows.map(row => {
    const sourceFileId = String(row.sourceFileId || '').toLowerCase();
    const lineageHash = String(row.lineageHash || '').toLowerCase();
    if (!HASH_RE.test(sourceFileId) || !HASH_RE.test(lineageHash)) fail('GLOBAL_HANDOFF_INVALID_EVIDENCE_LINEAGE');
    return {
      sourceFamily: text(row.sourceFamily, 80) || 'UNKNOWN',
      sourceFileId,
      lineageHash,
      proofType: text(row.proofType, 120) || 'NONE',
      commercialMetricsVerified: row.commercialMetricsVerified === true
    };
  }).sort((a, b) => (a.sourceFamily + '|' + a.lineageHash).localeCompare(b.sourceFamily + '|' + b.lineageHash));
}

function reviewArtifactRefs(ledger, targetId, requestArtifactId) {
  return ledger.entries.filter(entry => entry?.target?.type === 'CLUSTER' && entry?.target?.id === targetId)
    .map(entry => ({
      sequence: entry.sequence,
      artifactId: entry.artifactId,
      type: entry.type,
      intent: entry.intent,
      entryHash: entry.entryHash,
      sourceEnvelopeHash: entry.sourceEnvelopeHash,
      recordedAt: entry.recordedAt,
      reviewerRef: text(entry.reviewerRef, 160),
      isCanonicalRequest: entry.artifactId === requestArtifactId
    }))
    .sort((a, b) => a.sequence - b.sequence || a.artifactId.localeCompare(b.artifactId));
}
function buildCanonicalHandoffPacket(viewModel, ledger, options = {}) {
  validateViewModel(viewModel);
  validateLedger(ledger);
  if (String(ledger.sourceViewHash).toLowerCase() !== String(viewModel.viewHash).toLowerCase()) {
    fail('GLOBAL_HANDOFF_LEDGER_VIEW_MISMATCH');
  }
  const requestEntry = selectRequestArtifact(ledger, options.requestArtifactId);
  if (requestEntry.sourceViewHash !== viewModel.viewHash) fail('GLOBAL_HANDOFF_REQUEST_VIEW_MISMATCH');
  const detail = resolveTarget(viewModel, requestEntry);
  const lineage = evidenceLineage(detail);
  if (!lineage.length) fail('GLOBAL_HANDOFF_EVIDENCE_LINEAGE_REQUIRED');
  const refs = reviewArtifactRefs(ledger, requestEntry.target.id, requestEntry.artifactId);
  if (!refs.some(ref => ref.isCanonicalRequest)) fail('GLOBAL_HANDOFF_REQUEST_REF_MISSING');

  const packet = {
    version: VERSION,
    authority: 'READ_ONLY_HANDOFF',
    executionContract: {
      sidecarMayInvokeCanonicalWorkflow: false,
      sidecarMayMutateCanonicalState: false,
      canonicalSystemMustReevaluateIndependently: true,
      packetConfersNoApproval: true,
      packetConfersNoProofGate: true,
      packetConfersNoProjectCreationAuthority: true,
      packetConfersNoProductTruthAuthority: true,
      packetConfersNoPublishAuthority: true
    },
    sourceBindings: {
      viewHash: String(viewModel.viewHash).toLowerCase(),
      ledgerHash: String(ledger.ledgerHash).toLowerCase(),
      ledgerTailHash: ledger.tailHash,
      ledgerEntryCount: ledger.entryCount,
      requestArtifactId: requestEntry.artifactId,
      requestEntryHash: requestEntry.entryHash,
      requestEnvelopeHash: requestEntry.sourceEnvelopeHash
    },
    target: {
      type: 'CLUSTER',
      id: requestEntry.target.id,
      title: text(detail.title, 320),
      members: Array.isArray(detail.members) ? detail.members.map(v => text(v, 320)).sort() : [],
      explanation: clone(detail.explanation || {})
    },
    evidenceLineage: lineage,
    reviewArtifactRefs: refs,
    reviewRequest: {
      note: requestEntry.note || null,
      reviewerRef: text(requestEntry.reviewerRef, 160),
      recordedAt: requestEntry.recordedAt
    }
  };
  packet.packetHash = sha256(stable(packet));
  return deepFreeze(packet);
}
function verifyCanonicalHandoffPacket(packet) {
  try {
    if (!packet || packet.version !== VERSION || packet.authority !== 'READ_ONLY_HANDOFF') fail('GLOBAL_HANDOFF_PACKET_INVALID');
    if (!HASH_RE.test(String(packet.packetHash || ''))) fail('GLOBAL_HANDOFF_PACKET_HASH_INVALID');
    const expected = sha256(stable(withoutHash(packet, 'packetHash')));
    if (expected !== String(packet.packetHash).toLowerCase()) fail('GLOBAL_HANDOFF_PACKET_HASH_MISMATCH');
    const contract = packet.executionContract || {};
    if (contract.sidecarMayInvokeCanonicalWorkflow !== false || contract.sidecarMayMutateCanonicalState !== false
      || contract.canonicalSystemMustReevaluateIndependently !== true || contract.packetConfersNoApproval !== true
      || contract.packetConfersNoProofGate !== true || contract.packetConfersNoProjectCreationAuthority !== true
      || contract.packetConfersNoProductTruthAuthority !== true || contract.packetConfersNoPublishAuthority !== true) {
      fail('GLOBAL_HANDOFF_PACKET_AUTHORITY_LEAK');
    }
    if (!Array.isArray(packet.evidenceLineage) || !packet.evidenceLineage.length) fail('GLOBAL_HANDOFF_PACKET_EVIDENCE_REQUIRED');
    if (packet.evidenceLineage.some(row => !HASH_RE.test(String(row.sourceFileId || '')) || !HASH_RE.test(String(row.lineageHash || '')))) {
      fail('GLOBAL_HANDOFF_PACKET_EVIDENCE_HASH_INVALID');
    }
    if (!Array.isArray(packet.reviewArtifactRefs) || !packet.reviewArtifactRefs.some(ref => ref.isCanonicalRequest === true)) {
      fail('GLOBAL_HANDOFF_PACKET_REQUEST_REF_REQUIRED');
    }
    if (packet.reviewArtifactRefs.some(ref => !HASH_RE.test(String(ref.entryHash || '')) || !HASH_RE.test(String(ref.sourceEnvelopeHash || '')))) {
      fail('GLOBAL_HANDOFF_PACKET_ARTIFACT_HASH_INVALID');
    }
    if (!Number.isInteger(packet.sourceBindings?.ledgerEntryCount) || packet.sourceBindings.ledgerEntryCount < packet.reviewArtifactRefs.length) {
      fail('GLOBAL_HANDOFF_PACKET_LEDGER_BINDING_INVALID');
    }
    if (packet.sourceBindings.ledgerTailHash != null && !HASH_RE.test(String(packet.sourceBindings.ledgerTailHash))) {
      fail('GLOBAL_HANDOFF_PACKET_LEDGER_BINDING_INVALID');
    }
    return deepFreeze({ valid: true, code: 'VALID', packetHash: packet.packetHash });
  } catch (error) {
    return deepFreeze({ valid: false, code: error.code || 'INVALID', packetHash: packet?.packetHash || null });
  }
}

module.exports = Object.freeze({ VERSION, buildCanonicalHandoffPacket, verifyCanonicalHandoffPacket });
