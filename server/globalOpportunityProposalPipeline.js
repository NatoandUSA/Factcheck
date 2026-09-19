'use strict';

const crypto = require('node:crypto');
const { normalizeParsedImport } = require('./globalOpportunityImportNormalizer');
const { proposeClusters, normalize } = require('./globalOpportunityClusterEngine');

const VERSION = 'GLOBAL_DISCOVERY_PROPOSAL_PIPELINE_V1';

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

function buildDiscoveryProposal(parsed, options = {}) {
  const normalizedImport = normalizeParsedImport(parsed);
  const candidates = normalizedImport.batches.flatMap(batch => batch.candidates);
  const keywordSet = [...new Set(candidates.map(item => item.keyword))];
  const clusterProposals = proposeClusters(keywordSet, options.clusterOptions || {});
  const byNormalizedKeyword = new Map();
  for (const candidate of candidates) {
    const key = normalize(candidate.keyword);
    if (!byNormalizedKeyword.has(key)) byNormalizedKeyword.set(key, []);
    byNormalizedKeyword.get(key).push(candidate);
  }

  const clusters = clusterProposals.map(cluster => {
    const candidateRefs = [];
    for (const member of cluster.members) {
      for (const candidate of byNormalizedKeyword.get(normalize(member)) || []) {
        candidateRefs.push({
          sourceFamily: candidate.sourceFamily,
          sourceFileId: candidate.sourceFileId,
          lineageHash: candidate.lineageHash,
          proofType: candidate.proofType,
          commercialMetricsVerified: candidate.authority.commercialMetrics === true
        });
      }
    }
    candidateRefs.sort((a, b) =>
      (a.sourceFamily + '|' + a.lineageHash).localeCompare(b.sourceFamily + '|' + b.lineageHash));
    return {
      ...cluster,
      candidateRefs,
      reviewSignals: {
        commercialAuthoritySourceCount: new Set(candidateRefs
          .filter(ref => ref.commercialMetricsVerified)
          .map(ref => ref.sourceFamily)).size,
        positiveCommercialProofSourceCount: new Set(candidateRefs
          .filter(ref => ref.commercialMetricsVerified && ref.proofType !== 'NONE')
          .map(ref => ref.sourceFamily)).size,
        observedSourceFamilyCount: new Set(candidateRefs.map(ref => ref.sourceFamily)).size
      }
    };
  });
  clusters.sort((a, b) => normalize(a.headKeyword).localeCompare(normalize(b.headKeyword)));
  const proposal = {
    version: VERSION,
    authority: 'PROPOSAL_ONLY',
    sourceFileId: normalizedImport.sourceFileId,
    normalizationHash: normalizedImport.normalizationHash,
    accounting: {
      inputCandidateCount: normalizedImport.inputCandidateCount,
      acceptedCandidateCount: normalizedImport.acceptedCandidateCount,
      exactDuplicateCount: normalizedImport.exactDuplicateCount,
      conflictCount: normalizedImport.conflictCount,
      clusterProposalCount: clusters.length
    },
    conflicts: normalizedImport.conflicts,
    sourceBatches: normalizedImport.batches.map(batch => ({
      sourceFamily: batch.sourceFamily,
      authority: batch.authority,
      acceptedCount: batch.accounting.accepted,
      conflictCount: batch.accounting.conflicts
    })),
    clusters
  };
  proposal.proposalHash = sha256(stable(proposal));
  return deepFreeze(proposal);
}

module.exports = Object.freeze({ VERSION, buildDiscoveryProposal });
