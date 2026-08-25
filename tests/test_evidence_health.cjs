const assert = require('assert');
const { buildEvidenceHealth, isKnown, normalizeTimestamp } = require('../server/evidenceHealth');

const row = {
  id: 7,
  source: 'STAFF_MANUAL_ASSERTION',
  evidence_state: 'OBSERVED',
  metadata: JSON.stringify({
    kind: 'ETSY_SEARCH_PASTE_V1',
    evidenceState: 'UNVERIFIED_INPUT',
    provider: 'ETSY_SEARCH_CSV',
    inputFormat: 'CSV',
    rowAccounting: { inputRows: 2, validRows: 2, uniqueRows: 2, duplicateRowsRemoved: 0 },
    observedAt: null,
    importedAt: '2026-08-25T01:00:00.000Z',
    sellers: [
      { listingId: '123', title: 'Para mi hija gift', shopName: 'Shop', priceAmount: 0, tags: ['para mi hija'], country: 'VN', ageDays: 20, views24h: 0, sold24h: 0, totalViews: 100, totalSold: 5, conversionRate: 0 },
      { listingId: null, title: 'Unknown data', shopName: '—', priceAmount: null, tags: [], country: null, ageDays: null, views24h: null, sold24h: null, totalViews: null, totalSold: null, conversionRate: null }
    ]
  })
};

const health = buildEvidenceHealth([row]);
assert.strictEqual(health.contractVersion, 'EVIDENCE_HEALTH_V1');
assert.strictEqual(health.scope, 'READ_ONLY_RESEARCH_STATUS');
assert.strictEqual(health.summary.searchListings, 2);
assert.deepStrictEqual(health.summary.rowAccounting, [{ evidenceId: 7, inputRows: 2, validRows: 2, uniqueRows: 2, duplicateRowsRemoved: 0 }]);
const searchLayer = health.layers.find(layer => layer.key === 'search_capture');
assert.strictEqual(searchLayer.state, 'MAPPED');
assert.deepStrictEqual(searchLayer.dbStates, ['OBSERVED']);
assert.deepStrictEqual(searchLayer.semanticStates, ['UNVERIFIED_INPUT'], 'DB and semantic state must remain distinct');
assert.strictEqual(health.fieldCoverage.sold24h.known, 1, 'numeric zero is a known measurement');
assert.strictEqual(health.fieldCoverage.sold24h.total, 2);
assert.strictEqual(health.fieldCoverage.sold24h.status, 'PARTIAL');
assert.strictEqual(health.freshness.observedAt, 'UNKNOWN');
assert.strictEqual(health.freshness.importedAt, '2026-08-25T01:00:00.000Z');
assert.strictEqual(health.layers.find(layer => layer.key === 'review_voice').allowedUse.includes('never demand proof'), true);
assert.strictEqual(isKnown(0), true);
assert.strictEqual(isKnown('—'), false);

const unmapped = buildEvidenceHealth([{ source: 'STAFF_MANUAL_ASSERTION', evidence_state: 'OBSERVED', metadata: '{not json' }]);
assert.strictEqual(unmapped.summary.malformedMetadata, 1);
assert.strictEqual(unmapped.layers.find(layer => layer.key === 'unmapped').state, 'UNMAPPED');
assert.deepStrictEqual(unmapped.layers.find(layer => layer.key === 'unmapped').semanticStates, ['UNKNOWN'], 'DB state must never become semantic provenance when metadata is malformed');

const timestamps = buildEvidenceHealth([{ source: 'STAFF_MANUAL_ASSERTION', evidence_state: 'OBSERVED', metadata: JSON.stringify({ kind: 'ETSY_SEARCH_PASTE_V1', evidenceState: 'UNVERIFIED_INPUT', observedAt: 'not-a-date', importedAt: 'tomorrow' }) }, { source: 'STAFF_MANUAL_ASSERTION', evidence_state: 'OBSERVED', metadata: JSON.stringify({ kind: 'ETSY_SEARCH_PASTE_V1', evidenceState: 'UNVERIFIED_INPUT', observedAt: '2026-08-25T01:30:00+07:00', importedAt: '2026-08-25T02:00:00.000Z' }) }]);
assert.strictEqual(timestamps.freshness.observedAt, '2026-08-24T18:30:00.000Z', 'valid timestamps normalize before ordering');
assert.strictEqual(timestamps.freshness.importedAt, '2026-08-25T02:00:00.000Z');
assert.strictEqual(normalizeTimestamp('2026-02-30T10:00:00Z'), null, 'impossible ISO dates are unknown');
assert.strictEqual(normalizeTimestamp('2026-08-25T01:30:00Z'), '2026-08-25T01:30:00.000Z');

const empty = buildEvidenceHealth([]);
assert.strictEqual(empty.layers.find(layer => layer.key === 'search_capture').state, 'MISSING');
assert(empty.actions[0].includes('Nạp CSV'));
console.log('Evidence health contract passed.');
