const assert = require('assert');

function transformXrayDataSafely(resData) {
  if (!resData || typeof resData !== 'object') {
    return {
      batchCount: 1,
      batches: [{
        batchNumber: 1,
        batchName: 'Default Batch 1',
        items: []
      }]
    };
  }

  const rawBatches = Array.isArray(resData.batches) ? resData.batches : [];
  if (rawBatches.length === 0) {
    return {
      batchCount: 1,
      batches: [{
        batchNumber: 1,
        batchName: 'Fallback Batch 1',
        items: Array.isArray(resData.items) ? resData.items : []
      }]
    };
  }

  return {
    batchCount: rawBatches.length,
    batches: rawBatches
  };
}

function testWhiteScreenFailsafe() {
  console.log('================================================================');
  console.log('  TESTING ZERO-CRASH FAILSAFE FOR AMAZON PIPELINE WORKFLOW');
  console.log('================================================================\n');

  const testCases = [
    { name: 'Case 1: Full Valid Xray Data', input: { batches: [{ batchNumber: 1, items: [{ asin: 'B0DV4DSJ63' }] }] } },
    { name: 'Case 2: Empty Batches Array', input: { batches: [] } },
    { name: 'Case 3: Non-Xray Response', input: { items: [{ asin: 'B0CPHXX2ZF' }] } },
    { name: 'Case 4: Malformed Data (null/undefined)', input: null },
    { name: 'Case 5: Server HTML Error String', input: '<html>500 Internal Error</html>' }
  ];

  testCases.forEach((tc) => {
    const output = transformXrayDataSafely(tc.input);
    assert.ok(output && typeof output === 'object', `${tc.name} failed: Output must be object`);
    assert.ok(Array.isArray(output.batches), `${tc.name} failed: Batches must be array`);
    console.log(`  🟢 ${tc.name}: PASSED (0 Crashes, Batches Output: ${output.batches.length})`);
  });

  console.log('\n================================================================');
  console.log('  🟢 ZERO-CRASH FAILSAFE VERIFIED 100% OPERATIONAL!');
  console.log('================================================================\n');
}

testWhiteScreenFailsafe();
