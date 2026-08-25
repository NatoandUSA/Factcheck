'use strict';

const { getEvidenceAcceptanceEligibility, parseEvidenceMetadata } = require('./evidenceEligibility');

const POST_EVIDENCE_STATES = new Set([
  'RESEARCH_ACCEPTED',
  'DNA_ACCEPTED',
  'MKL_FROZEN',
  'PRODUCT_TRUTH_CONFIRMED',
  'PRODUCT_TRUTH_VERIFIED',
  'DRAFT_GENERATED',
  'VALIDATED',
  'MANAGER_APPROVED',
  'PUBLISH_READY'
]);

function auditProjectEligibility(projects, evidenceRows) {
  const acceptedByProject = new Map();
  for (const row of evidenceRows || []) {
    if (row?.evidence_state !== 'ACCEPTED' || !Number.isSafeInteger(Number(row.project_id))) continue;
    const projectId = Number(row.project_id);
    if (!acceptedByProject.has(projectId)) acceptedByProject.set(projectId, []);
    acceptedByProject.get(projectId).push(row);
  }

  const audited = (projects || [])
    .filter(project => POST_EVIDENCE_STATES.has(project.state))
    .map(project => {
      const evidence = acceptedByProject.get(Number(project.id)) || [];
      const evaluated = evidence.map(row => ({ row, eligibility: getEvidenceAcceptanceEligibility(row) }));
      const qualifyingEvidenceIds = evaluated.filter(item => item.eligibility.eligible).map(item => item.row.id);
      const blockingEvidence = evaluated.filter(item => !item.eligibility.eligible).map(item => ({
        evidenceId: item.row.id,
        source: item.row.source,
        kind: parseEvidenceMetadata(item.row).kind || 'UNKNOWN',
        error: item.eligibility.error
      }));

      return {
        projectId: project.id,
        marketplace: project.marketplace,
        state: project.state,
        status: qualifyingEvidenceIds.length > 0 ? 'QUALIFYING_EVIDENCE_PRESENT' : 'REVALIDATION_REQUIRED',
        qualifyingEvidenceIds,
        blockingEvidence
      };
    });

  const affectedProjects = audited.filter(project => project.status === 'REVALIDATION_REQUIRED');
  return {
    scope: 'READ_ONLY_CURRENT_STATE_AUDIT',
    auditedProjectCount: audited.length,
    affectedProjectCount: affectedProjects.length,
    affectedProjects
  };
}

module.exports = { POST_EVIDENCE_STATES, auditProjectEligibility };
