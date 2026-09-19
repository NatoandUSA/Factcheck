'use strict';

const crypto = require('node:crypto');

const VERSION = 'GLOBAL_REVIEW_DASHBOARD_MODEL_V1_PROPOSAL';
const MAX_DISPLAY = 240;
const HASH_RE = /^[a-f0-9]{64}$/i;

function text(value, max = MAX_DISPLAY) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, max);
}
function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}
function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}
function fail(code) {
  const error = new Error(code); error.code = code; throw error;
}
function cloneWithoutProposalHash(proposal) {
  const out = {};
  for (const [key, value] of Object.entries(proposal || {})) {
    if (key !== 'proposalHash') out[key] = value;
  }
  return out;
}
function validateProposal(proposal) {
  if (!proposal || typeof proposal !== 'object') fail('GLOBAL_REVIEW_MODEL_INVALID_PROPOSAL');
  if (proposal.authority !== 'PROPOSAL_ONLY') fail('GLOBAL_REVIEW_MODEL_NON_PROPOSAL_AUTHORITY');
  if (!HASH_RE.test(String(proposal.sourceFileId || ''))) fail('GLOBAL_REVIEW_MODEL_INVALID_SOURCE_FILE_ID');
  if (!HASH_RE.test(String(proposal.proposalHash || ''))) fail('GLOBAL_REVIEW_MODEL_INVALID_PROPOSAL_HASH');
  if (!Array.isArray(proposal.clusters) || !Array.isArray(proposal.conflicts) || !Array.isArray(proposal.sourceBatches)) {
    fail('GLOBAL_REVIEW_MODEL_INVALID_SHAPE');
  }
  for (const conflict of proposal.conflicts) {
    if (conflict?.importEligible !== false) fail('GLOBAL_REVIEW_MODEL_CONFLICT_MUST_BE_QUARANTINED');
    if (!Array.isArray(conflict?.lineageHashes) || conflict.lineageHashes.some(hash => !HASH_RE.test(String(hash)))) {
      fail('GLOBAL_REVIEW_MODEL_INVALID_CONFLICT_LINEAGE');
    }
  }
  const ids = new Set();
  for (const cluster of proposal.clusters) {
    const id = text(cluster?.proposalId, 120);
    if (!id || ids.has(id)) fail('GLOBAL_REVIEW_MODEL_DUPLICATE_OR_MISSING_CLUSTER_ID');
    ids.add(id);
    if (!Array.isArray(cluster.members) || !Array.isArray(cluster.candidateRefs)) fail('GLOBAL_REVIEW_MODEL_INVALID_CLUSTER');
    for (const ref of cluster.candidateRefs) {
      if (!HASH_RE.test(String(ref?.lineageHash || ''))) fail('GLOBAL_REVIEW_MODEL_INVALID_LINEAGE_HASH');
      if (!HASH_RE.test(String(ref?.sourceFileId || ''))) fail('GLOBAL_REVIEW_MODEL_INVALID_LINEAGE_FILE_ID');
    }
  }
  const expectedProposalHash = sha256(stable(cloneWithoutProposalHash(proposal)));
  if (expectedProposalHash !== String(proposal.proposalHash).toLowerCase()) {
    fail('GLOBAL_REVIEW_MODEL_PROPOSAL_HASH_MISMATCH');
  }
}

function sourceRollup(proposal) {
  const map = new Map();
  for (const batch of proposal.sourceBatches) {
    const family = text(batch?.sourceFamily, 80) || 'UNKNOWN';
    if (!map.has(family)) map.set(family, {
      sourceFamily: family,
      acceptedCount: 0,
      conflictCount: 0,
      commercialAuthority: false,
      proofClasses: new Set()
    });
    const row = map.get(family);
    row.acceptedCount += Number.isFinite(Number(batch?.acceptedCount)) ? Math.max(0, Number(batch.acceptedCount)) : 0;
    row.conflictCount += Number.isFinite(Number(batch?.conflictCount)) ? Math.max(0, Number(batch.conflictCount)) : 0;
    row.commercialAuthority = row.commercialAuthority || batch?.authority?.commercialMetrics === true;
    if (batch?.authority?.proofClass) row.proofClasses.add(text(batch.authority.proofClass, 120));
  }
  return [...map.values()].sort((a, b) => a.sourceFamily.localeCompare(b.sourceFamily)).map(row => ({
    sourceFamily: row.sourceFamily,
    acceptedCount: row.acceptedCount,
    conflictCount: row.conflictCount,
    commercialAuthority: row.commercialAuthority,
    proofClasses: [...row.proofClasses].sort()
  }));
}
function evidenceObservation(cluster) {
  const signals = cluster?.reviewSignals || {};
  const positive = Math.max(0, Number(signals.positiveCommercialProofSourceCount) || 0);
  const authority = Math.max(0, Number(signals.commercialAuthoritySourceCount) || 0);
  const observed = Math.max(0, Number(signals.observedSourceFamilyCount) || 0);
  if (positive > 0) {
    return {
      code: 'POSITIVE_COMMERCIAL_SIGNAL_PRESENT',
      canonicalGateAuthority: false,
      message: `${positive} source family/families contain accepted positive commercial metrics; canonical proof gate is not evaluated here.`
    };
  }
  if (authority > 0) {
    return {
      code: 'COMMERCIAL_SCHEMA_WITHOUT_POSITIVE_PROOF',
      canonicalGateAuthority: false,
      message: 'Commercial-source schema is present, but no accepted positive commercial metric exists in this proposal.'
    };
  }
  return {
    code: observed > 1 ? 'MULTI_SOURCE_NON_COMMERCIAL_SIGNALS_ONLY' : 'NO_POSITIVE_COMMERCIAL_SIGNAL',
    canonicalGateAuthority: false,
    message: 'No accepted positive commercial metric exists in this proposal; trend/social corroboration is descriptive only.'
  };
}

function whyGrouped(cluster) {
  const reasons = Array.isArray(cluster?.reasons) ? cluster.reasons : [];
  const out = reasons.map(reason => ({
    member: text(reason?.keyword),
    comparedAgainst: text(reason?.against),
    rule: text(reason?.reason, 120) || 'UNSPECIFIED',
    similarity: Number.isFinite(Number(reason?.score)) ? Math.max(0, Math.min(1, Number(reason.score))) : null
  }));
  if (!out.length && Array.isArray(cluster?.members) && cluster.members.length === 1) {
    out.push({ member: text(cluster.members[0]), comparedAgainst: null, rule: 'SINGLETON_CLUSTER', similarity: null });
  }
  return out;
}
function provenanceRows(cluster) {
  return cluster.candidateRefs.map(ref => ({
    sourceFamily: text(ref?.sourceFamily, 80) || 'UNKNOWN',
    sourceFileId: String(ref.sourceFileId).toLowerCase(),
    lineageHash: String(ref.lineageHash).toLowerCase(),
    proofType: text(ref?.proofType, 120) || 'NONE',
    commercialMetricsVerified: ref?.commercialMetricsVerified === true
  })).sort((a, b) =>
    (a.sourceFamily + '|' + a.lineageHash).localeCompare(b.sourceFamily + '|' + b.lineageHash));
}

function conflictRows(conflicts) {
  return conflicts.map(conflict => ({
    key: text(conflict?.key, 320),
    sourceFamily: text(conflict?.sourceFamily, 80) || 'UNKNOWN',
    normalizedKeyword: text(conflict?.normalizedKeyword, 320),
    disposition: text(conflict?.disposition, 120) || 'REVIEW_DUPLICATE_CONFLICT',
    importEligible: false,
    lineageHashes: Array.isArray(conflict?.lineageHashes)
      ? conflict.lineageHashes.filter(hash => HASH_RE.test(String(hash))).map(hash => String(hash).toLowerCase()).sort()
      : [],
    explanation: 'Conflicting duplicate observations were quarantined before clustering; no value was selected as authoritative.'
  })).sort((a, b) => a.key.localeCompare(b.key));
}
function clusterCard(cluster) {
  const members = [...new Set((cluster.members || []).map(member => text(member, 320)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  const provenance = provenanceRows(cluster);
  const sourceFamilies = [...new Set(provenance.map(row => row.sourceFamily))].sort();
  return {
    proposalId: text(cluster.proposalId, 120),
    headKeyword: text(cluster.headKeyword, 320),
    productFamily: text(cluster.productFamily, 120) || 'unknown',
    commercialIntent: text(cluster.commercialIntent, 120) || 'GENERAL',
    clusteringMethod: text(cluster.method, 120) || 'UNKNOWN',
    authority: 'PROPOSAL_ONLY',
    memberCount: members.length,
    members,
    sourceFamilies,
    evidenceObservation: evidenceObservation(cluster),
    whyGrouped: whyGrouped(cluster),
    provenance
  };
}

function buildReviewDashboardModel(proposal) {
  validateProposal(proposal);
  const clusters = proposal.clusters.map(clusterCard)
    .sort((a, b) => a.headKeyword.localeCompare(b.headKeyword) || a.proposalId.localeCompare(b.proposalId));
  const conflicts = conflictRows(proposal.conflicts);
  const sources = sourceRollup(proposal);
  const attention = [];
  if (conflicts.length) attention.push({ code: 'DUPLICATE_CONFLICTS_REQUIRE_REVIEW', count: conflicts.length });
  const noPositive = clusters.filter(cluster => cluster.evidenceObservation.code !== 'POSITIVE_COMMERCIAL_SIGNAL_PRESENT').length;
  if (noPositive) attention.push({ code: 'CLUSTERS_WITHOUT_POSITIVE_COMMERCIAL_SIGNAL', count: noPositive });

  const model = {
    version: VERSION,
    authority: 'PROPOSAL_ONLY',
    sourceFileId: String(proposal.sourceFileId).toLowerCase(),
    proposalHash: String(proposal.proposalHash).toLowerCase(),
    summary: {
      clusterCount: clusters.length,
      conflictCount: conflicts.length,
      sourceFamilyCount: sources.length,
      attentionCount: attention.reduce((sum, item) => sum + item.count, 0)
    },
    attention,
    sources,
    clusters,
    conflicts,
    canonicalDecisions: {
      proofGateEvaluated: false,
      candidateStatusAssigned: false,
      projectCreationAuthorized: false,
      productTruthAuthorized: false,
      publishAuthorized: false
    }
  };
  model.modelHash = sha256(stable(model));
  return deepFreeze(model);
}

module.exports = Object.freeze({ VERSION, buildReviewDashboardModel });
