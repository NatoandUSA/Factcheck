const assert = require('assert');
const fs = require('fs');

const { learnFromListing } = require('../server/learningService');
const { filterAndBatchXrayAsins } = require('../server/asinBatcher');
const { isAllowedHost } = require('../server/security/urlGuard');

async function main() {
  console.log('================================================================');
  console.log('  TESTING AMAZON TRUTH-BOUNDARY REMEDIATION CONTRACT');
  console.log('================================================================\n');

  // A title alone is not a learned Amazon listing. It must neither succeed
  // nor acquire believable placeholder bullets.
  const titleOnly = await learnFromListing({
    rawText: 'Observed competitor title only',
    marketplace: 'AMAZON'
  });
  assert.strictEqual(titleOnly.success, false);
  assert.strictEqual(titleOnly.code, 'INSUFFICIENT_EVIDENCE');

  const observed = await learnFromListing({
    rawText: 'Observed competitor title\n- Observed feature copied from the supplied listing text',
    marketplace: 'AMAZON'
  });
  assert.strictEqual(observed.success, true);
  assert.deepStrictEqual(observed.bullets, ['- Observed feature copied from the supplied listing text']);
  console.log('  🟢 Learning Box requires observed Amazon bullet evidence; it never pads a title-only input.');

  // Xray boolean fields must never use JavaScript truthiness for badges.
  const result = filterAndBatchXrayAsins([
    { ASIN: 'B0TRUTH001', Title: 'Observed item', Price: '19.99', 'Best Seller': 'No', Sponsored: 'false' },
    { ASIN: 'B0TRUTH002', Title: 'Observed item two', Price: '19.99', 'Best Seller': 'Yes', Sponsored: 'true' }
  ], 'observed');
  const items = Object.fromEntries(result.batches[0].items.map(item => [item.asin, item]));
  assert.strictEqual(items.B0TRUTH001.isBestSeller, false);
  assert.strictEqual(items.B0TRUTH001.isSponsored, false);
  assert.strictEqual(items.B0TRUTH002.isBestSeller, true);
  assert.strictEqual(items.B0TRUTH002.isSponsored, true);
  console.log('  🟢 Xray boolean flags are explicit true/false/UNKNOWN, never truthy source strings.');

  // Only the specifically approved short host may expand the Amazon trust boundary.
  assert.strictEqual(isAllowedHost('a.co'), true);
  for (const host of ['www.a.co', 'amzn.to', 'amzn.eu', 'amzn.asia', 'amzn.com']) {
    assert.strictEqual(isAllowedHost(host), false, `${host} must not be allowlisted without explicit approval`);
  }
  console.log('  🟢 URL allowlist contains only the approved Amazon short-link host.');

  const pipeline = fs.readFileSync(require.resolve('../src/components/AmazonPipelineWorkflow.jsx'), 'utf8');
  const workspace = fs.readFileSync(require.resolve('../src/components/AmazonWorkspace.jsx'), 'utf8');
  const learningBox = fs.readFileSync(require.resolve('../src/components/LearningBoxWidget.jsx'), 'utf8');
  const server = fs.readFileSync(require.resolve('../server/server.js'), 'utf8');

  assert.ok(pipeline.includes("item?.fulfillment || 'UNKNOWN'"), 'Missing fulfillment must render UNKNOWN.');
  assert.ok(pipeline.includes('item?.isBestSeller === true'), 'Best Seller badge requires boolean true.');
  assert.ok(pipeline.includes('item?.isSponsored === true'), 'Sponsored badge requires boolean true.');
  assert.ok(!pipeline.includes('omni_amazon_xray_sellers'), 'Pipeline must not persist Xray evidence in browser storage.');
  assert.ok(!workspace.includes('omni_amazon_xray_sellers'), 'Workspace must not restore unscoped Xray browser storage.');
  assert.ok(!learningBox.includes('omni_amazon_xray_sellers'), 'Learning Box must not read unscoped Xray browser storage.');
  assert.ok(!server.includes('Amazon Top Seller (${item.asin})'), 'Server must not manufacture a Top Seller title.');
  console.log('  🟢 UI renders UNKNOWN safely and removes unscoped browser evidence caching.');

  console.log('\n================================================================');
  console.log('  🟢 AMAZON TRUTH-BOUNDARY REMEDIATION CONTRACT PASSED');
  console.log('================================================================');
}

main().catch(error => {
  console.error('🔴 AMAZON TRUTH-BOUNDARY REMEDIATION FAILED:', error.stack || error.message);
  process.exit(1);
});
