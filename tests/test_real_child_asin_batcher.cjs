const assert = require('assert');
const { filterAndBatchXrayAsins } = require('../server/asinBatcher');

function testAsinBatcherTruthSemantics() {
  console.log('================================================================');
  console.log('  TESTING ASIN/XRAY BATCHER FAIL-CLOSED TRUTH SEMANTICS');
  console.log('================================================================\n');

  // 1. Empty input must fail closed — no fabricated batches.
  const empty = filterAndBatchXrayAsins([], 'regalo para el amor de mi vida');
  assert.strictEqual(empty.success, false, 'Empty array input must return success:false');
  assert.strictEqual(empty.code, 'INSUFFICIENT_EVIDENCE', 'Empty input must be coded INSUFFICIENT_EVIDENCE');
  assert.strictEqual(empty.batches, undefined, 'Empty input must not return any batches');
  console.log('  🟢 Empty input -> INSUFFICIENT_EVIDENCE, zero batches.');

  const emptyString = filterAndBatchXrayAsins('', 'seed');
  assert.strictEqual(emptyString.success, false, 'Empty string input must return success:false');
  assert.strictEqual(emptyString.code, 'INSUFFICIENT_EVIDENCE');
  console.log('  🟢 Empty string input -> INSUFFICIENT_EVIDENCE, zero batches.');

  // 2. 10 manually pasted ASINs: exact identifiers preserved, no padding, no invented metadata.
  const ten = ['B0AAAAAAA1', 'B0AAAAAAA2', 'B0AAAAAAA3', 'B0AAAAAAA4', 'B0AAAAAAA5',
    'B0AAAAAAA6', 'B0AAAAAAA7', 'B0AAAAAAA8', 'B0AAAAAAA9', 'B0AAAAAA10'];
  const res10 = filterAndBatchXrayAsins(ten.join(' '), 'custom gift');
  assert.strictEqual(res10.success, true);
  assert.strictEqual(res10.totalCleanAsins, 10, 'All 10 pasted identifiers must survive — no padding, no drops');
  assert.strictEqual(res10.batchCount, 1, '10 ASINs must form exactly 1 batch');
  const res10Asins = res10.batches[0].asins.slice().sort();
  assert.deepStrictEqual(res10Asins, ten.slice().sort(), 'Batch must contain exactly the supplied identifiers, nothing invented');
  res10.batches[0].items.forEach(item => {
    assert.strictEqual(item.price, null, `price for bare-pasted ${item.asin} must stay null/UNKNOWN, not a fabricated default`);
    assert.strictEqual(item.sales, null, `sales for bare-pasted ${item.asin} must stay null/UNKNOWN, not a fabricated default`);
    assert.strictEqual(item.title, null, `title for bare-pasted ${item.asin} must stay null/UNKNOWN, not a fabricated default`);
  });
  console.log('  🟢 10 pasted ASINs -> exact identifiers, 1 batch, null/UNKNOWN metadata (no fabrication).');

  // 3. 25 manually pasted ASINs: partial batching 10+10+5, no padding to 30.
  const twentyFive = Array.from({ length: 25 }, (_, i) => `B0BBBB${String(i).padStart(4, '0')}`);
  const res25 = filterAndBatchXrayAsins(twentyFive.join(' '), 'custom gift');
  assert.strictEqual(res25.success, true);
  assert.strictEqual(res25.totalCleanAsins, 25, 'All 25 pasted identifiers must survive — no padding to 30');
  assert.deepStrictEqual(res25.batches.map(b => b.asinCount), [10, 10, 5], '25 ASINs must batch as 10+10+5, partial final batch allowed');
  const allRes25Asins = res25.batches.flatMap(b => b.asins).slice().sort();
  assert.deepStrictEqual(allRes25Asins, twentyFive.slice().sort(), 'No ASIN invented or dropped across the 25-input batches');
  console.log('  🟢 25 pasted ASINs -> 10+10+5 batches, no padding to a false 30.');

  // 4. 30 manually pasted ASINs: may form 3x10, still exact identifiers only.
  const thirty = Array.from({ length: 30 }, (_, i) => `B0CCCC${String(i).padStart(4, '0')}`);
  const res30 = filterAndBatchXrayAsins(thirty.join(' '), 'custom gift');
  assert.strictEqual(res30.success, true);
  assert.strictEqual(res30.totalCleanAsins, 30);
  assert.deepStrictEqual(res30.batches.map(b => b.asinCount), [10, 10, 10]);
  const allRes30Asins = res30.batches.flatMap(b => b.asins).slice().sort();
  assert.deepStrictEqual(allRes30Asins, thirty.slice().sort(), 'No ASIN invented when exactly 30 are supplied');
  console.log('  🟢 30 pasted ASINs -> 3x10 batches, still exact supplied identifiers only.');

  // 5. Real Xray rows with source-provided fields: values preserved exactly; junk filters
  //    only apply when a real price is present (never on a fabricated default).
  const xrayRows = [
    { ASIN: 'B0REAL0001', Title: 'Real Xray Regalo Necklace', Price: '$24.99', Sales: '512' },
    { ASIN: 'B0REAL0002', Title: 'Real Xray Cheap Junk Toy', Price: '$3.99', Sales: '10' }, // rejected: too cheap
    { ASIN: 'B0REAL0003', Title: 'Real Xray Luxury Necklace', Price: '$249.99', Sales: '5' }, // rejected: too expensive
    { ASIN: 'B0REAL0004' } // no fields at all — must stay unknown, not defaulted
  ];
  const resXray = filterAndBatchXrayAsins(xrayRows, 'regalo');
  assert.strictEqual(resXray.success, true);
  assert.strictEqual(resXray.totalCleanAsins, 2, 'Only the non-junk-filtered rows survive');
  assert.strictEqual(resXray.rejectedCount, 2);
  const byAsin = Object.fromEntries(resXray.batches.flatMap(b => b.items).map(i => [i.asin, i]));
  assert.strictEqual(byAsin['B0REAL0001'].price, 24.99, 'Real source price must be preserved exactly');
  assert.strictEqual(byAsin['B0REAL0001'].sales, 512, 'Real source sales must be preserved exactly');
  assert.strictEqual(byAsin['B0REAL0001'].title, 'Real Xray Regalo Necklace');
  assert.strictEqual(byAsin['B0REAL0004'].price, null, 'Missing price on a real Xray row must stay null, never defaulted');
  assert.strictEqual(byAsin['B0REAL0004'].sales, null, 'Missing sales on a real Xray row must stay null, never defaulted');
  console.log('  🟢 Real Xray rows preserve source price/sales exactly; missing fields stay null; junk filters use real prices only.');

  // 6b. Manual-paste contract: 9 ASINs (below the 10-30 range) must fail closed.
  const nine = Array.from({ length: 9 }, (_, i) => `B0DDDD${String(i).padStart(4, '0')}`);
  const res9 = filterAndBatchXrayAsins(nine.join(' '), 'custom gift');
  assert.strictEqual(res9.success, false, '9 pasted ASINs (below the 10-30 contract) must be rejected, not silently accepted');
  assert.strictEqual(res9.code, 'ASIN_COUNT_OUT_OF_RANGE');
  console.log('  🟢 9 pasted ASINs -> ASIN_COUNT_OUT_OF_RANGE (below manual-paste minimum).');

  // 6c. 31 ASINs (above the 10-30 range) must fail closed.
  const thirtyOne = Array.from({ length: 31 }, (_, i) => `B0EEEE${String(i).padStart(4, '0')}`);
  const res31 = filterAndBatchXrayAsins(thirtyOne.join(' '), 'custom gift');
  assert.strictEqual(res31.success, false, '31 pasted ASINs (above the 10-30 contract) must be rejected');
  assert.strictEqual(res31.code, 'ASIN_COUNT_OUT_OF_RANGE');
  console.log('  🟢 31 pasted ASINs -> ASIN_COUNT_OUT_OF_RANGE (above manual-paste maximum).');

  // 6d. Malformed identifiers (wrong length/characters) must be rejected explicitly,
  // not silently coerced into "valid" ASINs.
  const malformedList = ten.slice(0, 9).concat(['NOT-AN-ASIN']);
  const resMalformed = filterAndBatchXrayAsins(malformedList.join(' '), 'custom gift');
  assert.strictEqual(resMalformed.success, false, 'A malformed token must reject the whole paste, not be dropped silently');
  assert.strictEqual(resMalformed.code, 'INVALID_ASIN_FORMAT');
  console.log('  🟢 Malformed ASIN token -> INVALID_ASIN_FORMAT, explicit rejection.');

  // 6e. Duplicate identifiers must be rejected explicitly, not silently deduped
  // down to a smaller "valid-looking" set.
  const withDuplicate = ten.concat([ten[0]]); // 11 tokens, 10 unique
  const resDup = filterAndBatchXrayAsins(withDuplicate.join(' '), 'custom gift');
  assert.strictEqual(resDup.success, false, 'Duplicate ASINs must be rejected explicitly, not silently deduped');
  assert.strictEqual(resDup.code, 'DUPLICATE_ASINS');
  console.log('  🟢 Duplicate ASIN in paste -> DUPLICATE_ASINS, explicit rejection (no silent dedup-and-pass).');

  // 7. Unknown sales must never be treated as numeric zero in sort ranking.
  // A row with unknown sales must not be pushed below a row with verified
  // zero sales just because (sales || 0) collapses both to the same number.
  const mixedSalesRows = [
    { ASIN: 'B0KNOWN001', Title: 'Custom Gift Necklace Known Zero Sales', Price: '19.99', Sales: '0' },
    { ASIN: 'B0UNKNOWN1', Title: 'Custom Gift Necklace Unknown Sales', Price: '19.99' } // Sales field absent
  ];
  const resMixed = filterAndBatchXrayAsins(mixedSalesRows, 'custom gift');
  assert.strictEqual(resMixed.success, true);
  const mixedItems = resMixed.batches[0].items;
  const knownItem = mixedItems.find(i => i.asin === 'B0KNOWN001');
  const unknownItem = mixedItems.find(i => i.asin === 'B0UNKNOWN1');
  assert.strictEqual(knownItem.sales, 0, 'Verified zero sales must be preserved as the number 0');
  assert.strictEqual(unknownItem.sales, null, 'Unknown sales must stay null, never coerced to 0');
  // With equal relevanceScore and no comparable sales evidence between them, the
  // stable sort must preserve input order — B0KNOWN001 before B0UNKNOWN1 — rather
  // than asserting a rank via (sales || 0).
  const mixedOrder = mixedItems.map(i => i.asin);
  assert.deepStrictEqual(mixedOrder, ['B0KNOWN001', 'B0UNKNOWN1'], 'Unknown sales must not out/under-rank a known value via zero-coercion; input order preserved');
  console.log('  🟢 Unknown sales never treated as numeric zero in sort; input order preserved absent comparable evidence.');

  // 8. Rejection reasons must be truth-safe: an observed price can justify a
  // price-floor/ceiling rejection, but never an unsupported origin/quality claim.
  const priceOnlyRows = [{ ASIN: 'B0CHEAP001', Title: 'Custom Gift Item', Price: '2.99' }];
  const resCheap = filterAndBatchXrayAsins(priceOnlyRows, 'custom gift');
  assert.strictEqual(resCheap.success, false); // only row, and it's rejected -> INSUFFICIENT_EVIDENCE
  const cheapReason = resCheap.rejectedSample[0].reason;
  assert.ok(!/chinese/i.test(cheapReason), `Rejection reason must not assert an unsupported origin claim: "${cheapReason}"`);
  assert.ok(/price floor/i.test(cheapReason), `Rejection reason must cite the configured price floor: "${cheapReason}"`);
  console.log('  🟢 Price-floor rejection reason is truth-safe (no unsupported origin/quality claim).');

  // 6. Production code must not contain the removed fabrication catalog.
  const fs = require('fs');
  const src = fs.readFileSync(require.resolve('../server/asinBatcher.js'), 'utf8');
  assert.ok(!/REAL_CHILD_ASIN_CATALOG/.test(src), 'server/asinBatcher.js must not contain the removed fabricated catalog');
  console.log('  🟢 server/asinBatcher.js contains no REAL_CHILD_ASIN_CATALOG fabrication.');

  console.log('\n================================================================');
  console.log('  🟢 ALL FAIL-CLOSED TRUTH SEMANTICS PASSED!');
  console.log('================================================================');
}

testAsinBatcherTruthSemantics();
