const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  VERSION, normalizeParsedImport, sanitizeCandidate
} = require('../server/globalOpportunityImportNormalizer');

function fileId(label) {
  return crypto.createHash('sha256').update(label).digest('hex');
}

assert.equal(VERSION, 'GLOBAL_IMPORT_NORMALIZER_V1_PROPOSAL');

const parsed = {
  sourceFileId: fileId('mixed-source-file'),
  diagnostics: [
    { status: 'CONSUMED', sheetName: 'Cerebro Export', source: 'CEREBRO',
      mapping: { keyword: 'Keyword Phrase', estimatedSales: 'Keyword Sales', estimatedRevenue: 'Estimated Revenue' } },
    { status: 'CONSUMED', sheetName: 'YTrend Export', source: 'YTREND',
      mapping: { keyword: 'Keyword', estimatedRevenue: 'Estimated Revenue', trendVelocity: 'Momentum Score' } }
  ],
  candidates: [
    {
      keyword: 'dog memorial wind chime',
      searchVolume: 4800,
      estimatedSales: 120,
      estimatedRevenue: 4200,
      proofType: 'MARKETPLACE_SALES',
      proofTimestamp: '2026-09-19T00:00:00.000Z',
      clusterKey: 'PET_MEMORIAL_WIND_CHIME',
      clusterLabel: 'Pet Memorial Wind Chime',
      clusterMethod: 'PRODUCT_ANCHOR_V1',
      origin: { source: 'CEREBRO', sheetName: 'Cerebro Export' }
    },
    {
      keyword: 'viral pet memorial lamp',
      estimatedRevenue: 9999,
      trendVelocity: 9,
      proofTimestamp: '2026-09-19T00:00:00.000Z',
      origin: { source: 'YTREND', sheetName: 'YTrend Export' }
    }
  ]
};

const normalized = normalizeParsedImport(parsed);
assert.equal(normalized.authority, 'PROPOSAL_ONLY');
assert.equal(normalized.batches.length, 2);
assert(Object.isFrozen(normalized));
assert(Object.isFrozen(normalized.batches));
assert(Object.isFrozen(normalized.batches[0]));
assert(Object.isFrozen(normalized.batches[0].candidates));
assert(Object.isFrozen(normalized.diagnostics));
const cerebro = normalized.batches.find(batch => batch.sourceFamily === 'CEREBRO').candidates[0];
const ytrend = normalized.batches.find(batch => batch.sourceFamily === 'YTREND').candidates[0];
assert.equal(cerebro.estimatedSales, 120);
assert.equal(cerebro.estimatedRevenue, 4200);
assert.equal(cerebro.proofType, 'MARKETPLACE_SALES');
assert.equal(cerebro.proofTimestamp, null, 'file observation time must not become marketplace proof freshness');
assert.equal(cerebro.authority.createsProject, false);
assert.equal(cerebro.authority.productTruth, false);
assert.equal(cerebro.authority.publish, false);
assert.equal(ytrend.estimatedRevenue, null, 'YTREND revenue-like fields must remain WATCH signal only');
assert.equal(ytrend.proofType, 'NONE');
assert.equal(ytrend.authority.commercialMetrics, false);

const exactDup = normalizeParsedImport({
  sourceFileId: fileId('exact-dup'),
  diagnostics: [
    { status: 'CONSUMED', sheetName: 'A', source: 'CEREBRO', mapping: { estimatedSales: 'Keyword Sales' } },
    { status: 'CONSUMED', sheetName: 'B', source: 'CEREBRO', mapping: { estimatedSales: 'Keyword Sales' } }
  ],
  candidates: [
    { keyword: 'memorial mug', estimatedSales: 20, origin: { source: 'CEREBRO', sheetName: 'A' } },
    { keyword: 'memorial mug', estimatedSales: 20, origin: { source: 'CEREBRO', sheetName: 'B' } }
  ]
});
assert.equal(exactDup.acceptedCandidateCount, 1);
assert.equal(exactDup.exactDuplicateCount, 1);
assert.equal(exactDup.conflictCount, 0);
const conflict = normalizeParsedImport({
  sourceFileId: fileId('conflict'),
  diagnostics: [
    { status: 'CONSUMED', sheetName: 'A', source: 'CEREBRO', mapping: { estimatedSales: 'Keyword Sales' } },
    { status: 'CONSUMED', sheetName: 'B', source: 'CEREBRO', mapping: { estimatedSales: 'Keyword Sales' } }
  ],
  candidates: [
    { keyword: 'memorial necklace', estimatedSales: 20, origin: { source: 'CEREBRO', sheetName: 'A' } },
    { keyword: 'memorial necklace', estimatedSales: 200, origin: { source: 'CEREBRO', sheetName: 'B' } }
  ]
});
assert.equal(conflict.acceptedCandidateCount, 0, 'conflicting duplicates must not select a convenient commercial value');
assert.equal(conflict.conflictCount, 1);
assert.equal(conflict.conflicts[0].disposition, 'REVIEW_DUPLICATE_CONFLICT');
assert.equal(conflict.conflicts[0].importEligible, false);

const shuffledA = normalizeParsedImport({
  sourceFileId: fileId('stable'),
  diagnostics: [
    { status: 'CONSUMED', sheetName: 'C', source: 'CEREBRO', mapping: { estimatedSales: 'Keyword Sales' } }
  ],
  candidates: [
    { keyword: 'b memorial mug', estimatedSales: 1, origin: { source: 'CEREBRO', sheetName: 'C' } },
    { keyword: 'a memorial mug', estimatedSales: 2, origin: { source: 'CEREBRO', sheetName: 'C' } }
  ]
});
const shuffledB = normalizeParsedImport({
  sourceFileId: fileId('stable'),
  diagnostics: [
    { status: 'CONSUMED', sheetName: 'C', source: 'CEREBRO', mapping: { estimatedSales: 'Keyword Sales' } }
  ],
  candidates: [
    { keyword: 'a memorial mug', estimatedSales: 2, origin: { source: 'CEREBRO', sheetName: 'C' } },
    { keyword: 'b memorial mug', estimatedSales: 1, origin: { source: 'CEREBRO', sheetName: 'C' } }
  ]
});
assert.equal(shuffledA.normalizationHash, shuffledB.normalizationHash, 'normalization must be input-order invariant');
assert.deepEqual(shuffledA.batches, shuffledB.batches);
const suppliedCluster = sanitizeCandidate({
  keyword: 'pet memorial necklace',
  clusterKey: 'USER_CLUSTER',
  clusterLabel: 'User Cluster',
  clusterMethod: 'SUPPLIED',
  origin: { source: 'HEYETSY', sheetName: 'Sheet1' }
}, fileId('cluster'), { sourceFamily: 'HEYETSY', commercialMetrics: true, proofClass: 'MARKETPLACE_EXPORT_VERIFIED_HEADER' });
assert.equal(suppliedCluster.cluster.authority, 'SOURCE_SUPPLIED_PROPOSAL');
assert.equal(suppliedCluster.authority.productTruth, false);


const spoofedCerebro = normalizeParsedImport({
  sourceFileId: fileId('spoofed-cerebro'),
  diagnostics: [
    { status: 'CONSUMED', sheetName: 'Generic', source: 'CEREBRO',
      mapping: { keyword: 'Keyword', estimatedSales: 'Sales' } }
  ],
  candidates: [
    { keyword: 'fake proof keyword', estimatedSales: 99999, origin: { source: 'CEREBRO', sheetName: 'Generic' } }
  ]
});
const spoofedCandidate = spoofedCerebro.batches[0].candidates[0];
assert.equal(spoofedCandidate.estimatedSales, null,
  'user source hint without canonical marketplace header fingerprint must fail closed');
assert.equal(spoofedCandidate.proofType, 'NONE');
assert.equal(spoofedCandidate.authority.commercialMetrics, false);

const negativeMetrics = normalizeParsedImport({
  sourceFileId: fileId('negative'),
  diagnostics: [
    { status: 'CONSUMED', sheetName: 'C', source: 'CEREBRO', mapping: { estimatedSales: 'Keyword Sales' } }
  ],
  candidates: [
    { keyword: 'negative metrics', estimatedSales: -5, searchVolume: -100, origin: { source: 'CEREBRO', sheetName: 'C' } }
  ]
}).batches[0].candidates[0];
assert.equal(negativeMetrics.estimatedSales, null);
assert.equal(negativeMetrics.searchVolume, null);
assert.equal(negativeMetrics.proofType, 'NONE');

assert.throws(() => normalizeParsedImport({ sourceFileId: 'not-a-hash', candidates: [{ keyword: 'x' }] }),
  error => error.code === 'GLOBAL_IMPORT_NORMALIZER_INVALID_FILE_ID');
assert.throws(() => normalizeParsedImport({ sourceFileId: fileId('empty'), candidates: [] }),
  error => error.code === 'GLOBAL_IMPORT_NORMALIZER_INVALID_COUNT');

console.log('GLOBAL_OPPORTUNITY_IMPORT_NORMALIZER_V1 PASS');
