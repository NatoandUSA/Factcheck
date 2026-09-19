const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { buildDiscoveryProposal, VERSION } = require('../server/globalOpportunityProposalPipeline');

function fileId(label) {
  return crypto.createHash('sha256').update(label).digest('hex');
}

const parsed = {
  sourceFileId: fileId('proposal-pipeline'),
  diagnostics: [
    { status: 'CONSUMED', sheetName: 'Cerebro', source: 'CEREBRO', mapping: { estimatedSales: 'Keyword Sales' } },
    { status: 'CONSUMED', sheetName: 'YTrend', source: 'YTREND', mapping: { trendVelocity: 'Momentum Score' } }
  ],
  candidates: [
    {
      keyword: 'dog memorial wind chime', estimatedSales: 50,
      clusterKey: 'PET_MEMORIAL_WIND_CHIME', clusterLabel: 'Pet Memorial Wind Chime', clusterMethod: 'PRODUCT_ANCHOR_V1',
      origin: { source: 'CEREBRO', sheetName: 'Cerebro' }
    },
    {
      keyword: 'dog memorial wind chime', trendVelocity: 9,
      clusterKey: 'PET_MEMORIAL_WIND_CHIME', clusterLabel: 'Pet Memorial Wind Chime', clusterMethod: 'PRODUCT_ANCHOR_V1',
      origin: { source: 'YTREND', sheetName: 'YTrend' }
    },
    {
      keyword: 'pet memorial necklace', estimatedSales: 25,
      origin: { source: 'CEREBRO', sheetName: 'Cerebro' }
    }
  ]
};

const proposal = buildDiscoveryProposal(parsed);
assert.equal(VERSION, 'GLOBAL_DISCOVERY_PROPOSAL_PIPELINE_V1');
assert.equal(proposal.authority, 'PROPOSAL_ONLY');
assert.equal(proposal.accounting.acceptedCandidateCount, 3);
assert.equal(proposal.accounting.clusterProposalCount, 2);
const chime = proposal.clusters.find(cluster => cluster.productFamily === 'wind_chime');
const necklace = proposal.clusters.find(cluster => cluster.productFamily === 'necklace');
assert(chime && necklace);
assert.equal(chime.candidateRefs.length, 2, 'same keyword from two source families should preserve both provenance refs');
assert.equal(chime.reviewSignals.observedSourceFamilyCount, 2);
assert.equal(chime.reviewSignals.commercialAuthoritySourceCount, 1);
assert.equal(chime.reviewSignals.positiveCommercialProofSourceCount, 1);
assert.equal(necklace.reviewSignals.commercialAuthoritySourceCount, 1);
assert.equal(necklace.reviewSignals.positiveCommercialProofSourceCount, 1);
assert.equal(chime.authority, 'PROPOSAL_ONLY');
assert.equal(Object.prototype.hasOwnProperty.call(proposal, 'proofGate'), false);
assert.equal(Object.prototype.hasOwnProperty.call(proposal, 'createProject'), false);
assert.equal(Object.prototype.hasOwnProperty.call(proposal, 'status'), false);
assert(Object.isFrozen(proposal));
assert(Object.isFrozen(proposal.clusters));
assert(Object.isFrozen(proposal.clusters[0].candidateRefs));

const conflictProposal = buildDiscoveryProposal({
  sourceFileId: fileId('proposal-conflict'),
  diagnostics: [
    { status: 'CONSUMED', sheetName: 'C', source: 'CEREBRO', mapping: { estimatedSales: 'Keyword Sales' } }
  ],
  candidates: [
    { keyword: 'memorial mug', estimatedSales: 10, origin: { source: 'CEREBRO', sheetName: 'C' } },
    { keyword: 'memorial mug', estimatedSales: 100, origin: { source: 'CEREBRO', sheetName: 'C' } }
  ]
});
assert.equal(conflictProposal.accounting.conflictCount, 1);
assert.equal(conflictProposal.accounting.acceptedCandidateCount, 0);
assert.equal(conflictProposal.accounting.clusterProposalCount, 0,
  'quarantined duplicate conflicts must never enter cluster proposals');

const noProof = buildDiscoveryProposal({
  sourceFileId: fileId('authority-no-proof'),
  diagnostics: [
    { status: 'CONSUMED', sheetName: 'C', source: 'CEREBRO', mapping: { estimatedSales: 'Keyword Sales' } }
  ],
  candidates: [
    { keyword: 'memorial bracelet', estimatedSales: 0, origin: { source: 'CEREBRO', sheetName: 'C' } }
  ]
});
assert.equal(noProof.clusters[0].reviewSignals.commercialAuthoritySourceCount, 1);
assert.equal(noProof.clusters[0].reviewSignals.positiveCommercialProofSourceCount, 0,
  'a trusted source schema without a positive commercial metric is not proof');

const shuffled = {
  ...parsed,
  candidates: [...parsed.candidates].reverse()
};
const proposalShuffled = buildDiscoveryProposal(shuffled);
assert.equal(proposal.proposalHash, proposalShuffled.proposalHash, 'proposal pipeline must be input-order invariant');
assert.deepEqual(proposal, proposalShuffled);

console.log('GLOBAL_DISCOVERY_PROPOSAL_PIPELINE_V1 PASS');
