const assert = require('assert');
const { deriveXrayUploadOutcome } = require('../src/utils/xrayUploadOutcome.cjs');
const fs = require('fs');
const path = require('path');

// Verify ESM file syntax & export directly
const esmContent = fs.readFileSync(path.join(__dirname, '../src/utils/xrayUploadOutcome.js'), 'utf8');
assert.ok(esmContent.includes('export function deriveXrayUploadOutcome'), 'ESM file must export deriveXrayUploadOutcome for Vite dev server');

function testXrayUploadOutcomeFailClosed() {
  console.log('================================================================');
  console.log('  TESTING XRAY UPLOAD OUTCOME: FAIL-CLOSED, NON-CRASHING, NO FABRICATION');
  console.log('================================================================\n');

  // Case 1: Real success with full source-provided item metadata — values pass through untouched.
  const c1 = deriveXrayUploadOutcome({
    ok: true,
    data: {
      success: true,
      isXray: true,
      batches: [{ batchName: 'Batch 1: 2 ASINs', asins: ['B0DV4DSJ63', 'B0CPHXX2ZF'], items: [
        { asin: 'B0DV4DSJ63', title: 'Real Title', price: 29.99, sales: 450 },
        { asin: 'B0CPHXX2ZF', title: null, price: null, sales: null }
      ] }]
    }
  });
  assert.strictEqual(c1.status, 'SUCCESS');
  assert.strictEqual(c1.toastType, 'success');
  assert.strictEqual(c1.batches[0].items[0].price, 29.99, 'source-provided price must pass through unchanged');
  assert.strictEqual(c1.batches[0].items[1].price, null, 'missing source price must stay null, never fabricated');
  console.log('  🟢 Case 1 (Real Xray success): source fields preserved, no invented values. PASSED');

  // Case 2: Success response with ASIN-only batches (no items) — must NOT invent title/price/revenue/BSR.
  const c2 = deriveXrayUploadOutcome({
    ok: true,
    data: { success: true, isXray: true, batches: [{ batchName: 'Batch 1', asins: ['B0X1', 'B0X2'] }] }
  });
  assert.strictEqual(c2.status, 'SUCCESS');
  c2.batches[0].items.forEach(item => {
    assert.strictEqual(item.title, null);
    assert.strictEqual(item.price, null);
    assert.strictEqual(item.sales, null);
  });
  console.log('  🟢 Case 2 (ASIN-only success): no Math.random/formula metadata invented. PASSED');

  // Case 3: Empty batches array — insufficient evidence, not a synthetic batch.
  const c3 = deriveXrayUploadOutcome({ ok: true, data: { success: true, isXray: true, batches: [] } });
  assert.strictEqual(c3.status, 'INSUFFICIENT_EVIDENCE');
  assert.deepStrictEqual(c3.batches, []);
  assert.strictEqual(c3.toastType, 'error');
  console.log('  🟢 Case 3 (empty batches): INSUFFICIENT_EVIDENCE, empty batches, error toast. PASSED');

  // Case 4: Non-Xray response shape — must not be treated as success.
  const c4 = deriveXrayUploadOutcome({ ok: true, data: { success: true, items: [{ asin: 'B0CPHXX2ZF' }] } });
  assert.strictEqual(c4.status, 'INSUFFICIENT_EVIDENCE');
  assert.deepStrictEqual(c4.batches, []);
  console.log('  🟢 Case 4 (non-Xray response): rejected, no invented batches. PASSED');

  // Case 5: Malformed/null data — must not crash and must not fabricate.
  const c5 = deriveXrayUploadOutcome({ ok: true, data: null });
  assert.strictEqual(c5.status, 'INSUFFICIENT_EVIDENCE');
  assert.deepStrictEqual(c5.batches, []);
  console.log('  🟢 Case 5 (null/malformed data): 0 crashes, no fabricated batches. PASSED');

  // Case 6: Server explicitly returned success:false (e.g. INSUFFICIENT_EVIDENCE from the batcher).
  const c6 = deriveXrayUploadOutcome({ ok: false, data: { success: false, error: 'No ASIN evidence supplied.', code: 'INSUFFICIENT_EVIDENCE' } });
  assert.strictEqual(c6.status, 'INSUFFICIENT_EVIDENCE');
  assert.deepStrictEqual(c6.batches, []);
  assert.ok(c6.toastMessage.includes('No ASIN evidence supplied.'), 'real server error reason must reach the user');
  console.log('  🟢 Case 6 (server success:false): surfaced as rejection with real reason, no fabrication. PASSED');

  // Case 7: Network/parse failure (fetch throws, or HTML error page breaks JSON.parse upstream) —
  // must render an explicit ERROR state, NOT a fabricated success toast.
  const c7 = deriveXrayUploadOutcome({ error: new Error('Server returned an unexpected response (status 500). <html>500 Internal Error</html>') });
  assert.strictEqual(c7.status, 'ERROR');
  assert.deepStrictEqual(c7.batches, []);
  assert.strictEqual(c7.toastType, 'error', 'a real failure must never produce a success toast');
  console.log('  🟢 Case 7 (network/HTML error): ERROR state, error toast — failure is visible, not hidden. PASSED');

  console.log('\n================================================================');
  console.log('  🟢 ALL FAIL-CLOSED XRAY UPLOAD OUTCOME CASES PASSED!');
  console.log('================================================================\n');
}

testXrayUploadOutcomeFailClosed();
