const assert = require('assert');
const { buildEvidenceHealth } = require('../server/evidenceHealth');

const row = {
  id: 7,
  source: 'STAFF_MANUAL_ASSERTION',
  evidence_state: 'OBSERVED',
  metadata: JSON.stringify({
    kind: 'ETSY_SEARCH_PASTE_V1',
    evidenceState: 'UNVERIFIED_INPUT',
    provider: 'ETSY_SEARCH_CSV',
    inputFormat: 'CSV',
    sellers: [{ listingId: '123', title: 'Para mi hija gift', shopName: 'Shop', priceAmount: 12, tags: ['para mi hija'], country: 'VN', ageDays: 20, views24h: 10, sold24h: 1, totalViews: 100, totalSold: 5, conversionRate: 2 }]
  })
};

const health = buildEvidenceHealth([row]);
assert.strictEqual(health.contractVersion, 'EVIDENCE_HEALTH_V1');
assert.strictEqual(health.authority, 'RESEARCH_STATUS_ONLY');
assert.strictEqual(health.summary.searchListings, 1);
assert.deepStrictEqual(health.summary.inputFormats, ['CSV']);
assert.strictEqual(health.summary.states.UNVERIFIED_INPUT, 1, 'semantic metadata state must be reported instead of DB display state');
assert.strictEqual(health.layers.find(layer => layer.key === 'search_capture').state, 'CAPTURED');
assert.strictEqual(health.fieldCoverage.sold24h, 1);
assert.strictEqual(health.layers.find(layer => layer.key === 'review_voice').allowedUse.includes('never demand proof'), true);

const empty = buildEvidenceHealth([]);
assert.strictEqual(empty.layers.find(layer => layer.key === 'search_capture').state, 'MISSING');
assert(empty.actions[0].includes('Nạp CSV'));
console.log('Evidence health contract passed.');
