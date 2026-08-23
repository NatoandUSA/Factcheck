'use strict';

function makeProductTruthCard(productId, listingVersion = 1, overrides = {}) {
  const evidence = {
    state: 'VERIFIED', subjectId: String(productId), listingVersion,
    source: { kind: 'TEST_FIXTURE', id: `fixture-${productId}-${listingVersion}` }
  };
  return {
    productId: String(productId), listingVersion, state: 'VERIFIED',
    facts: { productType: { value: 'APPAREL', evidence } },
    ipEvidence: {
      state: 'CLEARED', subjectId: String(productId), listingVersion,
      checkerVersion: 'test-ip-guard-1', checkedAt: '2026-08-23T00:00:00.000Z'
    },
    ...overrides
  };
}

module.exports = { makeProductTruthCard };
