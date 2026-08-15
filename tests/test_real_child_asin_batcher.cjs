const assert = require('assert');
const { filterAndBatchXrayAsins } = require('../server/asinBatcher');

function testRealChildAsinBatcher() {
  console.log('================================================================');
  console.log('  TESTING REAL CHILD ASIN BATCHER & CEREBRO/MAGNET COMPLIANCE');
  console.log('================================================================\n');

  // Test 1: Fallback Real Active Child ASINs
  const res1 = filterAndBatchXrayAsins([], 'regalo para el amor de mi vida');
  console.log('Test 1 (Empty input fallback to Real Catalog):');
  console.log(`  Success: ${res1.success}`);
  console.log(`  Batches Count: ${res1.batchCount}`);
  res1.batches.forEach(b => {
    console.log(`  - ${b.batchName}: [${b.asins.slice(0, 3).join(' ')}...] (${b.asins.length} Child ASINs)`);
  });

  const allAsins = res1.batches.flatMap(b => b.asins);
  const isValidFormat = allAsins.every(a => /^B0[A-Z0-9]{8}$/.test(a));

  // Strict Assertions
  res1.batches.forEach((b, i) => {
    assert.strictEqual(b.asins.length, 10, `Batch ${i + 1} must contain exactly 10 ASINs but contained ${b.asins.length}`);
  });
  assert.strictEqual(allAsins.length, 30, `Total clean ASINs across 3 batches must equal 30 but was ${allAsins.length}`);
  assert.strictEqual(isValidFormat, true, 'All ASINs must be valid B0... Child ASIN format');

  console.log('  🟢 3x10 INVARIANT PASSED: Exactly 3 Batches x 10 Real Child ASINs = 30 Total ASINs!');
  console.log('\n================================================================');
}

testRealChildAsinBatcher();
