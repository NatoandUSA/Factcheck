const assert = require('assert');
const crypto = require('crypto');

function canonicalSerialize(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalSerialize).join(',') + ']';
  }
  const sortedKeys = Object.keys(obj).sort();
  const sortedObj = {};
  for (const key of sortedKeys) {
    sortedObj[key] = obj[key];
  }
  return JSON.stringify(sortedObj);
}

function testCanonicalHashVector() {
  console.log('================================================================');
  console.log('  TESTING CANONICAL PAYLOAD SERIALIZATION & SHA-256 TEST VECTOR');
  console.log('================================================================\n');

  // Input Object with unordered keys
  const rawPayload = {
    etsyTitle: "Custom Necklace",
    amazonTitle: "Custom Gold Necklace"
  };

  const canonicalString = canonicalSerialize(rawPayload);
  const computedHash = crypto.createHash('sha256').update(canonicalString).digest('hex');

  const EXPECTED_CANONICAL = '{"amazonTitle":"Custom Gold Necklace","etsyTitle":"Custom Necklace"}';
  const EXPECTED_SHA256 = 'a23b2bb28abada601767405c429c1a1cd821a407683e3c6f8c26993d9cd71d4c';

  assert.strictEqual(canonicalString, EXPECTED_CANONICAL, 'Canonical string key sorting failed');
  assert.strictEqual(computedHash, EXPECTED_SHA256, 'SHA-256 hash vector calculation mismatch');

  console.log(`  Canonical String: "${canonicalString}"`);
  console.log(`  SHA-256 Digest:   "${computedHash}"`);
  console.log('  🟢 CANONICAL HASH VECTOR ASSERTION PASSED CLEANLY!');
  console.log('\n================================================================\n');
}

testCanonicalHashVector();
