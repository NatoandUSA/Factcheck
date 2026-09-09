'use strict';

const assert = require('node:assert/strict');
const {
  buildStaffAttestedCard,
  normalizeSnapshot,
  productTruthAuthorityHash
} = require('../server/productTruthAttestation');
const { validateProductTruthCard, projectVerifiedFacts } = require('../shared/productTruth.cjs');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    failed += 1;
    process.stderr.write(`FAIL ${name}\n${error.stack || error.message}\n`);
  }
}

function card(snapshot, ipEvidence = {}) {
  return buildStaffAttestedCard({
    productId: 42,
    listingVersion: 3,
    snapshot,
    actorId: 7,
    auditEventId: 99,
    ipEvidence: {
      state: 'CLEARED', subjectId: '42', listingVersion: 3,
      checkerVersion: 'server-ip-guard-v1', checkedAt: '2026-09-09T00:00:00.000Z',
      ...ipEvidence
    }
  });
}

test('ASSERTED and UNKNOWN are normalized without promoting missing facts', () => {
  const snapshot = normalizeSnapshot({
    productType: { disposition: 'ASSERTED', value: 'Custom necklace', basis: 'SUPPLIER_SPEC' },
    materials: { disposition: 'UNKNOWN', reason: 'Supplier confirmation pending' }
  });
  assert.equal(snapshot.asserted.productType.value, 'Custom necklace');
  assert.equal(snapshot.unknown.materials.reason, 'Supplier confirmation pending');
  const built = card(snapshot);
  assert.deepEqual(projectVerifiedFacts(built, { productId: 42, listingVersion: 3 }), { productType: 'Custom necklace' });
  assert.equal(Object.hasOwn(built.facts, 'materials'), false);
});

test('client evidence, state, source and authority keys are rejected', () => {
  for (const injected of [
    { disposition: 'ASSERTED', value: 'silver', basis: 'SUPPLIER_SPEC', evidence: { state: 'VERIFIED' } },
    { disposition: 'ASSERTED', value: 'silver', basis: 'SUPPLIER_SPEC', state: 'VERIFIED' },
    { disposition: 'ASSERTED', value: 'silver', basis: 'SUPPLIER_SPEC', source: { id: 1 } },
    { disposition: 'ASSERTED', value: 'silver', basis: 'SUPPLIER_SPEC', authority: true }
  ]) {
    assert.throws(() => normalizeSnapshot({ materials: injected }), error => error.code === 'PRODUCT_TRUTH_CLIENT_AUTHORITY_FORBIDDEN');
  }
});

test('staff attestation is exact listing-version evidence and validates structurally', () => {
  const built = card(normalizeSnapshot({
    materials: { disposition: 'ASSERTED', value: ['stainless steel', '14k gold plated'], basis: 'PHYSICAL_INSPECTION' }
  }));
  assert.equal(validateProductTruthCard(built, { productId: 42, listingVersion: 3 }).valid, true);
  assert.equal(validateProductTruthCard(built, { productId: 42, listingVersion: 4 }).valid, false);
  assert.equal(built.facts.materials.evidence.source.kind, 'STAFF_ATTESTATION_V1');
  assert.equal(built.facts.materials.evidence.source.id, '99');
});

test('authority hash binds facts, unknowns, actor, listing and version but not refreshable IP evidence', () => {
  const snapshot = normalizeSnapshot({
    productType: { disposition: 'ASSERTED', value: 'Printable mystery game', basis: 'RIGHTS_RECORD' },
    materials: { disposition: 'UNKNOWN', reason: 'Digital product' }
  });
  const first = card(snapshot);
  const refreshedIp = card(snapshot, { checkedAt: '2026-09-09T01:00:00.000Z' });
  assert.equal(productTruthAuthorityHash(first), productTruthAuthorityHash(refreshedIp));
  const changed = card(normalizeSnapshot({
    productType: { disposition: 'ASSERTED', value: 'Different product', basis: 'RIGHTS_RECORD' },
    materials: { disposition: 'UNKNOWN', reason: 'Digital product' }
  }));
  assert.notEqual(productTruthAuthorityHash(first), productTruthAuthorityHash(changed));
});

process.stdout.write(`C3_TRUTH_ACCOUNTING passed=${passed} failed=${failed} unexecuted=0 total=${passed + failed}\n`);
if (failed) process.exitCode = 1;
