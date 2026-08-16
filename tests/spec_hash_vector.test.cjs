const assert = require('assert');
const { canonicalSerialize, computePayloadHash } = require('../server/security/canonicalize');

function testCanonicalHashVector() {
  console.log('================================================================');
  console.log('  TESTING PRODUCTION CANONICAL SERIALIZER & SHA-256 TEST VECTORS');
  console.log('================================================================\n');

  // Test Vector 1: Standard Flat Object
  const flatPayload = {
    etsyTitle: "Custom Necklace",
    amazonTitle: "Custom Gold Necklace"
  };

  const canonicalFlat = canonicalSerialize(flatPayload);
  const hashFlat = computePayloadHash(flatPayload);

  const EXPECTED_CANONICAL = '{"amazonTitle":"Custom Gold Necklace","etsyTitle":"Custom Necklace"}';
  const EXPECTED_SHA256 = 'a23b2bb28abada601767405c429c1a1cd821a407683e3c6f8c26993d9cd71d4c';

  assert.strictEqual(canonicalFlat, EXPECTED_CANONICAL, 'Flat canonical string sorting failed');
  assert.strictEqual(hashFlat, EXPECTED_SHA256, 'SHA-256 flat hash vector calculation mismatch');
  console.log('  🟢 Test 1 (Flat SHA-256 Test Vector): PASSED');

  // Test Vector 2: Nested Object Recursive Sorting
  const nestedPayload1 = { b: { z: 1, a: 2 }, a: [3, 2, 1] };
  const nestedPayload2 = { a: [3, 2, 1], b: { a: 2, z: 1 } };

  assert.strictEqual(canonicalSerialize(nestedPayload1), canonicalSerialize(nestedPayload2), 'Recursive nested key sorting failed');
  assert.strictEqual(computePayloadHash(nestedPayload1), computePayloadHash(nestedPayload2), 'Nested object hash equality failed');
  console.log('  🟢 Test 2 (Recursive Nested Sorting & Arrays): PASSED');

  // Test Vector 3: Unicode NFC Normalization (NFD e + acute vs NFC é)
  const nfdStr = "cafe\u0301"; // NFD
  const nfcStr = "café";      // NFC
  const unicodePayloadNFD = { title: nfdStr };
  const unicodePayloadNFC = { title: nfcStr };

  assert.strictEqual(canonicalSerialize(unicodePayloadNFD), canonicalSerialize(unicodePayloadNFC), 'Unicode NFC normalization failed');
  assert.strictEqual(computePayloadHash(unicodePayloadNFD), computePayloadHash(unicodePayloadNFC), 'Unicode NFC hash equality failed');
  console.log('  🟢 Test 3 (Unicode NFC Normalization): PASSED');

  // Test Vector 4: Volatile Field Exclusion (id, status, updated_at, dbId)
  const payloadWithVolatiles = {
    amazonTitle: "Custom Gold Necklace",
    etsyTitle: "Custom Necklace",
    id: 99,
    dbId: 105,
    status: "PUBLISH_READY",
    updated_at: "2026-08-16T06:50:00Z"
  };

  assert.strictEqual(canonicalSerialize(payloadWithVolatiles), EXPECTED_CANONICAL, 'Volatile key exclusion failed');
  assert.strictEqual(computePayloadHash(payloadWithVolatiles), EXPECTED_SHA256, 'Volatile key hash immunity failed');
  console.log('  🟢 Test 4 (Volatile Metadata Exclusion): PASSED');

  console.log('\n================================================================');
  console.log('  🟢 ALL 4 PRODUCTION CANONICALIZER INVARIANTS PASSED CLEANLY!');
  console.log('================================================================\n');
}

testCanonicalHashVector();
