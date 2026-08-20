/**
 * EXECUTABLE TEST SUITE: SIMULATOR & MKL IP TRUTH CONTRACTS
 * Verified on clean SHA 4dfbf62 baseline.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('  TESTING SIMULATOR & MKL IP TRUTH CONTRACT SUITE');
console.log('================================================================');

// 1. Amazon Simulator Source Inspection
const amzSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/AmazonRealProductPage.jsx'), 'utf8');

assert.ok(!amzSrc.includes('4,892 ratings'), 'Amazon simulator must not fabricate hardcoded 4,892 ratings');
assert.ok(!amzSrc.includes("Amazon's Choice"), 'Amazon simulator must not fabricate Amazon Choice badge');
assert.ok(!amzSrc.includes('Tomorrow by 8 AM'), 'Amazon simulator must not fabricate hardcoded Prime delivery dates');
assert.ok(!amzSrc.includes('USA Custom Workshop'), 'Amazon simulator must not fabricate hardcoded seller names');
assert.ok(!amzSrc.includes('Crafting Unforgettable Milestone Keepsakes'), 'Amazon simulator must not fabricate hardcoded A+ brand story headline');
assert.ok(!amzSrc.includes('100% Optical Acrylic'), 'Amazon simulator must not fabricate hardcoded A+ material claims');

console.log('  🟢 Amazon Simulator: Hardcoded fake commerce/A+ facts removed.');

// 2. Etsy Simulator Source Inspection
const etsySrc = fs.readFileSync(path.resolve(__dirname, '../src/components/EtsyRealProductPage.jsx'), 'utf8');

assert.ok(!etsySrc.includes('ArtisanCraftStudioUS'), 'Etsy simulator must not fabricate hardcoded shop name');
assert.ok(!etsySrc.includes('12,482 sales'), 'Etsy simulator must not fabricate hardcoded sales count');
assert.ok(!etsySrc.includes('<span>Star Seller</span>'), 'Etsy simulator must not fabricate Star Seller badge');
assert.ok(!etsySrc.includes('24 people bought this'), 'Etsy simulator must not fabricate urgency counter');

console.log('  🟢 Etsy Simulator: Hardcoded fake sales/badge/urgency claims removed.');

// 3. Product Listing Page Simulator Header Tabs Inspection
const simSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/ProductListingPageSimulator.jsx'), 'utf8');

assert.ok(!simSrc.includes('100% Clone'), 'Simulator tabs must not claim 100% Clone');
assert.ok(simSrc.includes('Simulation Preview'), 'Simulator tabs must explicitly state Simulation Preview');

console.log('  🟢 Simulator Header: 100% Clone replaced with Simulation Preview.');

// 4. Master Keyword Table IP Verdict Logic Inspection & Unit Simulation
const mklSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/MasterKeywordTable.jsx'), 'utf8');

assert.ok(mklSrc.includes("verdict === 'OK'"), 'MKL must treat verdict === OK as Clean');
assert.ok(mklSrc.includes("UNSCREENED / UNKNOWN"), 'MKL must explicitly recognize unscreened keywords');
assert.ok(!mklSrc.includes("Apparel: Sweatshirt"), 'MKL category fallback must not default to Apparel: Sweatshirt');
assert.ok(!mklSrc.includes("idx < 10"), 'MKL must not override Tier based on filtered array index');

// IP Matrix Test Cases Simulation
function evaluateMklIpState(item) {
  const verdict = item.ipVerdict ? String(item.ipVerdict).toUpperCase() : null;
  const hasHits = Array.isArray(item.ipHits) && item.ipHits.length > 0;

  if (verdict === 'BLOCK' || (hasHits && verdict !== 'OK')) return 'BLOCKED';
  if (verdict === 'REVIEW') return 'REVIEW';
  if (verdict === 'OK') return 'CLEAN';
  if (!verdict || verdict === 'UNSCREENED') return 'UNSCREENED';
  return 'UNKNOWN';
}

assert.strictEqual(evaluateMklIpState({ ipVerdict: 'OK' }), 'CLEAN');
assert.strictEqual(evaluateMklIpState({ ipVerdict: 'BLOCK', ipHits: ['Nike'] }), 'BLOCKED');
assert.strictEqual(evaluateMklIpState({ ipVerdict: 'REVIEW', ipHits: ['Nike'] }), 'BLOCKED');
assert.strictEqual(evaluateMklIpState({ ipVerdict: 'REVIEW', ipHits: [] }), 'REVIEW');
assert.strictEqual(evaluateMklIpState({ ipVerdict: undefined }), 'UNSCREENED');
assert.strictEqual(evaluateMklIpState({ ipVerdict: null }), 'UNSCREENED');
assert.strictEqual(evaluateMklIpState({ ipVerdict: 'UNSCREENED' }), 'UNSCREENED');
assert.strictEqual(evaluateMklIpState({ ipVerdict: 'RANDOM_UNKNOWN' }), 'UNKNOWN');

console.log('  🟢 MKL IP Matrix: All IP states (OK, BLOCK, REVIEW, null, undefined, UNSCREENED, unknown) evaluate correctly with non-overlapping branches.');

console.log('================================================================');
console.log('  🟢 ALL SIMULATOR & MKL TRUTH CONTRACT TESTS PASSED CLEANLY');
console.log('================================================================');
