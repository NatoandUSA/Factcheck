const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { buildDiscoveryProposal } = require('../server/globalOpportunityProposalPipeline');
const { buildReviewDashboardModel } = require('../server/globalOpportunityReviewDashboardModel');
const { buildReviewViewModel } = require('../server/globalOpportunityReviewViewModel');
const {
  VERSION, classifyIntent, buildReviewDecisionEnvelope, buildDecisionBoundaryContract
} = require('../server/globalOpportunityDecisionBoundary');

function fileId(label) {
  return crypto.createHash('sha256').update(label).digest('hex');
}

const parsed = {
  sourceFileId: fileId('decision-boundary'),
  diagnostics: [
    { status: 'CONSUMED', sheetName: 'C', source: 'CEREBRO', mapping: { estimatedSales: 'Keyword Sales' } },
    { status: 'CONSUMED', sheetName: 'Y', source: 'YTREND', mapping: { trendVelocity: 'Momentum Score' } }
  ],
  candidates: [
    { keyword: 'dog memorial wind chime', estimatedSales: 30, origin: { source: 'CEREBRO', sheetName: 'C' } },
    { keyword: 'dog memorial wind chime', trendVelocity: 9, origin: { source: 'YTREND', sheetName: 'Y' } },
    { keyword: 'pet memorial necklace', estimatedSales: 0, origin: { source: 'CEREBRO', sheetName: 'C' } }
  ]
};

const vm = buildReviewViewModel(buildReviewDashboardModel(buildDiscoveryProposal(parsed)));
const clusterId = vm.table.rows[0].id;

assert.equal(VERSION, 'GLOBAL_DECISION_BOUNDARY_V1_PROPOSAL');
assert.equal(classifyIntent('ADD_REVIEW_NOTE'), 'REVIEW_ONLY');
assert.equal(classifyIntent('CREATE_PROJECT'), 'CANONICAL_ONLY');
assert.equal(classifyIntent('garbage'), 'UNKNOWN');

const contract = buildDecisionBoundaryContract(vm);
assert.equal(contract.authority, 'REVIEW_ONLY');
assert.equal(contract.invariant.reviewLayerMayAnnotate, true);
assert.equal(contract.invariant.reviewLayerMayPropose, true);
assert.equal(contract.invariant.reviewLayerMaySetProofGate, false);
assert.equal(contract.invariant.reviewLayerMaySetQualified, false);
assert.equal(contract.invariant.reviewLayerMayPromoteToProject, false);
assert.equal(contract.invariant.reviewLayerMayCreateProject, false);
assert.equal(contract.invariant.reviewLayerMayWriteProductTruth, false);
assert.equal(contract.invariant.reviewLayerMayPublish, false);
assert(Object.isFrozen(contract));

const note = buildReviewDecisionEnvelope(vm, {
  intent: 'ADD_REVIEW_NOTE',
  target: { type: 'CLUSTER', id: clusterId },
  note: 'Needs independent evidence review.'
});
assert.equal(note.authority, 'REVIEW_ONLY');
assert.equal(note.intent, 'ADD_REVIEW_NOTE');
assert.equal(note.requestedEffects.writeCanonicalStatus, false);
assert.equal(note.requestedEffects.evaluateProofGate, false);
assert.equal(note.requestedEffects.createProject, false);
assert.equal(note.requestedEffects.mutateProductTruth, false);
assert.equal(note.requestedEffects.publish, false);
assert.equal(note.handoff.executableByReviewLayer, false);
assert.equal(note.handoff.recordableAsReviewArtifact, true);
assert.equal(note.handoff.requiresCanonicalAuthority, false);

const handoff = buildReviewDecisionEnvelope(vm, {
  intent: 'REQUEST_CANONICAL_EVALUATION',
  target: { type: 'CLUSTER', id: clusterId },
  note: 'Please evaluate canonical eligibility.'
});
assert.equal(handoff.handoff.executableByReviewLayer, false);
assert.equal(handoff.handoff.requiresCanonicalAuthority, true);

const clusterIds = vm.table.rows.map(row => row.id);
if (clusterIds.length > 1) {
  const merge = buildReviewDecisionEnvelope(vm, {
    intent: 'PROPOSE_CLUSTER_MERGE',
    target: { type: 'CLUSTER', id: clusterIds[0] },
    relatedTargetIds: [clusterIds[1]]
  });
  assert.deepEqual(merge.relatedTargetIds, [clusterIds[1]]);
}

for (const forbidden of [
  'SET_WATCH','SET_QUALIFIED','SET_REJECTED','SET_STALE','SET_PROMOTE_TO_PROJECT',
  'MUTATE_CANDIDATE_STATUS','DELETE_CANDIDATE','CREATE_PROJECT','MUTATE_PROJECT_STATE',
  'WRITE_PRODUCT_TRUTH','FREEZE_MKL','SET_PROOF_GATE','UPDATE_CLUSTER','WRITE_CLUSTER_OVERRIDE',
  'APPROVE_LISTING','PUBLISH'
]) {
  assert.throws(
    () => buildReviewDecisionEnvelope(vm, { intent: forbidden, target: { type: 'CLUSTER', id: clusterId } }),
    error => error.code === 'GLOBAL_DECISION_BOUNDARY_CANONICAL_ONLY_INTENT'
  );
}

assert.throws(
  () => buildReviewDecisionEnvelope(vm, { intent: 'ADD_REVIEW_NOTE', target: { type: 'CLUSTER', id: clusterId } }),
  error => error.code === 'GLOBAL_DECISION_BOUNDARY_NOTE_REQUIRED'
);
assert.throws(
  () => buildReviewDecisionEnvelope(vm, { intent: 'ADD_REVIEW_NOTE', target: { type: 'CLUSTER', id: 'missing' }, note: 'x' }),
  error => error.code === 'GLOBAL_DECISION_BOUNDARY_INVALID_TARGET'
);
assert.throws(
  () => buildReviewDecisionEnvelope(vm, { intent: 'PROPOSE_CLUSTER_SPLIT', target: { type: 'CLUSTER', id: clusterId } }),
  error => error.code === 'GLOBAL_DECISION_BOUNDARY_SPLIT_RATIONALE_REQUIRED'
);
const split = buildReviewDecisionEnvelope(vm, {
  intent: 'PROPOSE_CLUSTER_SPLIT',
  target: { type: 'CLUSTER', id: clusterId },
  note: 'Separate product-intent variants for human review.'
});
assert.equal(split.handoff.executableByReviewLayer, false);

assert.throws(
  () => buildReviewDecisionEnvelope(vm, {
    intent: 'PROPOSE_CLUSTER_MERGE',
    target: { type: 'CLUSTER', id: clusterId },
    relatedTargetIds: ['missing-cluster']
  }),
  error => error.code === 'GLOBAL_DECISION_BOUNDARY_INVALID_RELATED_TARGET'
);
assert.throws(
  () => buildReviewDecisionEnvelope(vm, {
    intent: 'PROPOSE_CLUSTER_MERGE',
    target: { type: 'CLUSTER', id: clusterId },
    relatedTargetIds: [clusterId]
  }),
  error => error.code === 'GLOBAL_DECISION_BOUNDARY_SELF_RELATED_TARGET'
);

const tampered = JSON.parse(JSON.stringify(vm));
tampered.contract.publishEnabled = true;
assert.throws(
  () => buildDecisionBoundaryContract(tampered),
  error => ['GLOBAL_DECISION_BOUNDARY_VIEW_HASH_MISMATCH','GLOBAL_DECISION_BOUNDARY_CANONICAL_AUTHORITY_LEAK'].includes(error.code)
);

const deterministicA = buildReviewDecisionEnvelope(vm, {
  intent: 'FLAG_FOR_REVIEW',
  target: { type: 'CLUSTER', id: clusterId },
  relatedTargetIds: ['b','a','b']
});
const deterministicB = buildReviewDecisionEnvelope(vm, {
  intent: 'FLAG_FOR_REVIEW',
  target: { type: 'CLUSTER', id: clusterId },
  relatedTargetIds: ['a','b']
});
assert.equal(deterministicA.envelopeHash, deterministicB.envelopeHash);
assert.deepEqual(deterministicA, deterministicB);

console.log('GLOBAL_DECISION_BOUNDARY_V1 PASS');
