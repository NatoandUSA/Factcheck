'use strict';

const assert = require('assert');
const {
  getVerifiedPersonalization,
  invalidateProductTruthCard,
  isEvidenceBoundToListing,
  isIpCleared,
  isVerifiedFact,
  projectVerifiedFacts,
  validateProductTruthCard
} = require('../shared/productTruth.cjs');
const { evaluatePublishGate } = require('../server/publishGate');

const context = { productId: 42, listingVersion: 7 };
const evidence = {
  state: 'VERIFIED', subjectId: '42', listingVersion: 7,
  source: { kind: 'SUPPLIER_SPEC', id: 'spec-1' }
};
const card = {
  ...context,
  state: 'VERIFIED',
  facts: {
    productType: { value: 'APPAREL', evidence },
    materials: { value: ['cotton'], evidence },
    personalization: {
      value: { supported: true, instructions: 'Enter one name, maximum 12 characters.' },
      evidence: { ...evidence, source: { kind: 'PRODUCTION_TEST', id: 'test-1' } }
    },
    origin: { value: 'USA', evidence: { ...evidence, state: 'UNKNOWN' } }
  },
  ipEvidence: {
    state: 'CLEARED', subjectId: 42, listingVersion: 7,
    checkerVersion: 'ip-guard-1', checkedAt: '2026-08-23T00:00:00.000Z'
  }
};

assert.strictEqual(isEvidenceBoundToListing(evidence, context), true);
assert.strictEqual(isVerifiedFact(card.facts.materials, context), true);
assert.deepStrictEqual(projectVerifiedFacts(card, context), {
  productType: 'APPAREL',
  materials: ['cotton'],
  personalization: { supported: true, instructions: 'Enter one name, maximum 12 characters.' }
});
assert.strictEqual(isIpCleared(card, context), true);
assert.strictEqual(validateProductTruthCard(card, context).valid, true);
assert.deepStrictEqual(getVerifiedPersonalization(card, context), {
  supported: true, instructions: 'Enter one name, maximum 12 characters.'
});

for (const poisoned of [
  { ...evidence, subjectId: 43 },
  { ...evidence, listingVersion: 6 },
  { ...evidence, state: 'UNKNOWN' },
  { ...evidence, source: null }
]) {
  assert.strictEqual(isEvidenceBoundToListing(poisoned, context), false);
}

assert.strictEqual(validateProductTruthCard({ ...card, listingVersion: 6 }, context).valid, false);
assert.strictEqual(validateProductTruthCard({ ...card, ipEvidence: { ...card.ipEvidence, state: 'REVIEW_REQUIRED' } }, context).valid, false);
assert.strictEqual(invalidateProductTruthCard(card).invalidationReason, 'LISTING_VERSION_CHANGED');

const publishable = {
  marketplace: 'ETSY', productType: 'APPAREL', status: 'MANAGER_APPROVED',
  productId: 42, listingVersion: 7, productTruthCard: card,
  etsyTitle: 'Verified apparel listing',
  etsyTags: Array.from({ length: 13 }, (_, i) => `tag${i}`),
  etsyDescription: 'Description based on the verified Product Truth Card.',
  netProfit: 8, netMargin: 35, ipVerdict: 'OK'
};
assert.strictEqual(evaluatePublishGate(publishable).canExport, true);
assert.strictEqual(evaluatePublishGate({ ...publishable, productTruthNotes: 'I verified everything' }).canExport, true);
assert.strictEqual(evaluatePublishGate({ ...publishable, productTruthCard: null, productTruthNotes: 'I verified everything' }).canExport, false);
assert.strictEqual(evaluatePublishGate({ ...publishable, listingVersion: 8 }).canExport, false);
assert.strictEqual(evaluatePublishGate({ ...publishable, personalizationSupported: true, productTruthCard: { ...card, facts: { ...card.facts, personalization: { ...card.facts.personalization, evidence: { ...evidence, listingVersion: 6 } } } } }).canExport, false);

console.log('Product Truth core contract passed.');
