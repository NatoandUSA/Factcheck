const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { buildDiscoveryProposal } = require('../server/globalOpportunityProposalPipeline');
const { buildReviewDashboardModel, VERSION } = require('../server/globalOpportunityReviewDashboardModel');

function fileId(label) {
  return crypto.createHash('sha256').update(label).digest('hex');
}

const parsed = {
  sourceFileId: fileId('dashboard-model'),
  diagnostics: [
    { status: 'CONSUMED', sheetName: 'Cerebro', source: 'CEREBRO', mapping: { estimatedSales: 'Keyword Sales' } },
    { status: 'CONSUMED', sheetName: 'YTrend', source: 'YTREND', mapping: { trendVelocity: 'Momentum Score' } }
  ],
  candidates: [
    { keyword: 'dog memorial wind chime', estimatedSales: 30, origin: { source: 'CEREBRO', sheetName: 'Cerebro' } },
    { keyword: 'dog memorial wind chime', trendVelocity: 9, origin: { source: 'YTREND', sheetName: 'YTrend' } },
    { keyword: 'pet memorial necklace', estimatedSales: 0, origin: { source: 'CEREBRO', sheetName: 'Cerebro' } },
    { keyword: 'viral memorial lamp', trendVelocity: 10, socialMomentum: 9, origin: { source: 'YTREND', sheetName: 'YTrend' } }
  ]
};

const proposal = buildDiscoveryProposal(parsed);
const model = buildReviewDashboardModel(proposal);
assert.equal(VERSION, 'GLOBAL_REVIEW_DASHBOARD_MODEL_V1_PROPOSAL');
assert.equal(model.authority, 'PROPOSAL_ONLY');
assert.equal(model.canonicalDecisions.proofGateEvaluated, false);
assert.equal(model.canonicalDecisions.candidateStatusAssigned, false);
assert.equal(model.canonicalDecisions.projectCreationAuthorized, false);
assert.equal(model.canonicalDecisions.productTruthAuthorized, false);
assert.equal(model.canonicalDecisions.publishAuthorized, false);
assert(Object.isFrozen(model));
assert(Object.isFrozen(model.clusters));
assert(Object.isFrozen(model.clusters[0].provenance));
const chime = model.clusters.find(item => item.productFamily === 'wind_chime');
const necklace = model.clusters.find(item => item.productFamily === 'necklace');
const lamp = model.clusters.find(item => item.headKeyword.includes('lamp'));
assert(chime && necklace && lamp);
assert.equal(chime.evidenceObservation.code, 'POSITIVE_COMMERCIAL_SIGNAL_PRESENT');
assert.equal(chime.evidenceObservation.canonicalGateAuthority, false);
assert.equal(necklace.evidenceObservation.code, 'COMMERCIAL_SCHEMA_WITHOUT_POSITIVE_PROOF');
assert.equal(lamp.evidenceObservation.code, 'NO_POSITIVE_COMMERCIAL_SIGNAL');
assert.equal(chime.provenance.length, 2);
assert.deepEqual(chime.sourceFamilies, ['CEREBRO', 'YTREND']);
assert(chime.provenance.every(row => /^[a-f0-9]{64}$/.test(row.lineageHash)));
assert(chime.whyGrouped.length >= 1);

const sourceNames = model.sources.map(item => item.sourceFamily);
assert.deepEqual(sourceNames, ['CEREBRO', 'YTREND']);
assert(model.summary.attentionCount >= 2);
assert(model.attention.some(item => item.code === 'CLUSTERS_WITHOUT_POSITIVE_COMMERCIAL_SIGNAL'));
const conflictProposal = buildDiscoveryProposal({
  sourceFileId: fileId('dashboard-conflict'),
  diagnostics: [
    { status: 'CONSUMED', sheetName: 'C', source: 'CEREBRO', mapping: { estimatedSales: 'Keyword Sales' } }
  ],
  candidates: [
    { keyword: 'memorial mug', estimatedSales: 10, origin: { source: 'CEREBRO', sheetName: 'C' } },
    { keyword: 'memorial mug', estimatedSales: 100, origin: { source: 'CEREBRO', sheetName: 'C' } }
  ]
});
const conflictModel = buildReviewDashboardModel(conflictProposal);
assert.equal(conflictModel.summary.clusterCount, 0);
assert.equal(conflictModel.summary.conflictCount, 1);
assert.equal(conflictModel.conflicts[0].importEligible, false);
assert.equal(conflictModel.conflicts[0].disposition, 'REVIEW_DUPLICATE_CONFLICT');
assert(conflictModel.attention.some(item => item.code === 'DUPLICATE_CONFLICTS_REQUIRE_REVIEW'));

const shuffled = buildReviewDashboardModel(buildDiscoveryProposal({ ...parsed, candidates: [...parsed.candidates].reverse() }));
assert.equal(model.modelHash, shuffled.modelHash, 'dashboard model must be deterministic across input ordering');
assert.deepEqual(model, shuffled);
const displayProposal = buildDiscoveryProposal({
  sourceFileId: fileId('display-sanitize'),
  diagnostics: [
    { status: 'CONSUMED', sheetName: 'Y', source: 'YTREND', mapping: { trendVelocity: 'Momentum Score' } }
  ],
  candidates: [
    { keyword: ('<script>alert(1)</script>\u0000 memorial lamp ').repeat(50), trendVelocity: 3,
      origin: { source: 'YTREND', sheetName: 'Y' } }
  ]
});
const displayModel = buildReviewDashboardModel(displayProposal);
assert(displayModel.clusters[0].headKeyword.length <= 320);
assert(!displayModel.clusters[0].headKeyword.includes('\u0000'));

const tamperedProposal = JSON.parse(JSON.stringify(proposal));
tamperedProposal.clusters[0].headKeyword = 'tampered';
assert.throws(() => buildReviewDashboardModel(tamperedProposal),
  error => error.code === 'GLOBAL_REVIEW_MODEL_PROPOSAL_HASH_MISMATCH');


const malformedConflict = JSON.parse(JSON.stringify(conflictProposal));
malformedConflict.conflicts[0].lineageHashes[0] = 'not-a-hash';
malformedConflict.proposalHash = crypto.createHash('sha256').update(
  JSON.stringify(malformedConflict)
).digest('hex');
// The malformed proposal cannot satisfy the canonical proposal hash contract and must fail closed.
assert.throws(() => buildReviewDashboardModel(malformedConflict),
  error => ['GLOBAL_REVIEW_MODEL_PROPOSAL_HASH_MISMATCH', 'GLOBAL_REVIEW_MODEL_INVALID_CONFLICT_LINEAGE'].includes(error.code));

const badAuthority = { ...proposal, authority: 'CANONICAL' };
assert.throws(() => buildReviewDashboardModel(badAuthority), error => error.code === 'GLOBAL_REVIEW_MODEL_NON_PROPOSAL_AUTHORITY');
const badHash = JSON.parse(JSON.stringify(proposal));
badHash.proposalHash = 'bad';
assert.throws(() => buildReviewDashboardModel(badHash), error => error.code === 'GLOBAL_REVIEW_MODEL_INVALID_PROPOSAL_HASH');
const duplicateClusterId = JSON.parse(JSON.stringify(proposal));
if (duplicateClusterId.clusters.length > 1) duplicateClusterId.clusters[1].proposalId = duplicateClusterId.clusters[0].proposalId;
assert.throws(() => buildReviewDashboardModel(duplicateClusterId), error => error.code === 'GLOBAL_REVIEW_MODEL_DUPLICATE_OR_MISSING_CLUSTER_ID');

console.log('GLOBAL_REVIEW_DASHBOARD_MODEL_V1 PASS');
