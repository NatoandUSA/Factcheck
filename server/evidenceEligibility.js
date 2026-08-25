'use strict';

const SMART_PULL_ARTIFACT_KIND = 'SMART_PULL_ARTIFACT_V1';
const ETSY_SEARCH_PASTE_ARTIFACT_KIND = 'ETSY_SEARCH_PASTE_V1';
const GENERIC_STAFF_EVIDENCE_KIND = 'GENERIC_STAFF_EVIDENCE_V1';

const ACCEPTABLE_SMART_PULL_STATES = new Set([
  'RETRIEVED_NO_OBSERVED_AT',
  'VERIFIED_RETRIEVED'
]);

function parseEvidenceMetadata(evidence) {
  if (!evidence || !evidence.metadata) return {};
  try {
    const metadata = typeof evidence.metadata === 'string'
      ? JSON.parse(evidence.metadata)
      : evidence.metadata;
    return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? metadata
      : {};
  } catch (_) {
    return {};
  }
}

function unqualified(kind, error = 'UNQUALIFIED_RESEARCH_ARTIFACT', message) {
  return {
    eligible: false,
    error,
    message: message || `Artifact kind ${kind || 'UNKNOWN'} is research input, not independently verified evidence, and cannot satisfy Research Accepted.`
  };
}

function getEvidenceAcceptanceEligibility(evidence) {
  const metadata = parseEvidenceMetadata(evidence);

  if (metadata.kind === ETSY_SEARCH_PASTE_ARTIFACT_KIND) {
    return unqualified(
      metadata.kind,
      'UNQUALIFIED_STAFF_PASTED_EVIDENCE',
      'Staff-provided Etsy search data is retained for analysis and audit, but it is not independently verified evidence and cannot satisfy Research Accepted.'
    );
  }

  if (metadata.kind !== SMART_PULL_ARTIFACT_KIND) {
    return unqualified(metadata.kind);
  }

  const state = metadata.evidenceState;
  const hasContentHash = typeof metadata.contentHash === 'string'
    && /^[a-f0-9]{64}$/i.test(metadata.contentHash);
  const completeRetrieval = evidence?.source === 'MCP_RETRIEVAL'
    && ACCEPTABLE_SMART_PULL_STATES.has(state)
    && hasContentHash;

  if (completeRetrieval) return { eligible: true };

  return unqualified(
    metadata.kind,
    'UNQUALIFIED_SMART_PULL_ARTIFACT',
    `Smart Pull artifact state ${state || 'UNKNOWN'} is not eligible for acceptance. Only complete, hashed provider retrievals created by the controlled Smart Pull route may satisfy research acceptance.`
  );
}

module.exports = {
  SMART_PULL_ARTIFACT_KIND,
  ETSY_SEARCH_PASTE_ARTIFACT_KIND,
  GENERIC_STAFF_EVIDENCE_KIND,
  ACCEPTABLE_SMART_PULL_STATES,
  parseEvidenceMetadata,
  getEvidenceAcceptanceEligibility
};
