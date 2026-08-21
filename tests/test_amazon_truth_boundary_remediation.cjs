const assert = require('assert');
const fs = require('fs');

const { learnFromListing } = require('../server/learningService');
const { filterAndBatchXrayAsins } = require('../server/asinBatcher');
const { isAllowedHost } = require('../server/security/urlGuard');
const { deriveXrayUploadOutcome } = require('../src/utils/xrayUploadOutcome.cjs');

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
  assert.strictEqual(observed.evidenceState, 'MANUAL_ASSERTION');
  assert.strictEqual(observed.styleDna.evidence.state, 'MANUAL_ASSERTION');
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
  assert.strictEqual(items.B0TRUTH001.fulfillment, null);
  assert.strictEqual(items.B0TRUTH001.ratingValue, null);
  assert.strictEqual(items.B0TRUTH001.ratingCount, null);
  const typed = filterAndBatchXrayAsins([
    { ASIN: 'B0TRUTH003', Title: 'Typed source row', Price: '19.99', Rating: '4.6', Ratings: '1234', Rank: '12', 'ASIN Revenue': '1000' }
  ], 'observed').batches[0].items[0];
  assert.strictEqual(typed.ratingValue, 4.6);
  assert.strictEqual(typed.ratingCount, 1234);
  assert.strictEqual(typed.rankSourceHeader, 'Rank');
  assert.strictEqual(typed.revenueScope, 'ASIN');
  assert.strictEqual(typed.evidenceState, 'SOURCE_REPORTED');
  assert.strictEqual(typed.fieldProvenance.ratingValue.state, 'SOURCE_REPORTED');
  const parentOnly = filterAndBatchXrayAsins([
    { ASIN: 'B0TRUTH005', Title: 'Parent metrics only', Price: '19.99', 'Parent Level Sales': '88', 'Parent Level Revenue': '1200' }
  ], 'observed').batches[0].items[0];
  assert.strictEqual(parentOnly.sales, null, 'Parent sales must not be presented as ASIN sales.');
  assert.strictEqual(parentOnly.parentSales, 88);
  assert.strictEqual(parentOnly.revenue, null, 'Parent revenue must not be presented as ASIN revenue.');
  assert.strictEqual(parentOnly.parentRevenue, 1200);
  console.log('  🟢 Xray boolean flags are explicit true/false/UNKNOWN, never truthy source strings.');

  const outcome = deriveXrayUploadOutcome({
    ok: true,
    data: {
      success: true,
      isXray: true,
      reportProvenance: { state: 'SOURCE_REPORTED', sourceKind: 'STAFF_UPLOADED_XRAY_REPORT', captureTime: null },
      batches: [{
        asins: ['B0TRUTH004'],
        items: [{ asin: 'B0TRUTH004', title: null, fulfillment: null, ratingValue: 4.7, ratingCount: 900, isBestSeller: 'false' }]
      }]
    }
  });
  assert.strictEqual(outcome.reportProvenance.sourceKind, 'STAFF_UPLOADED_XRAY_REPORT');
  assert.strictEqual(outcome.xraySellers[0].fulfillment, null);
  assert.strictEqual(outcome.xraySellers[0].ratingValue, 4.7);
  assert.strictEqual(outcome.xraySellers[0].ratingCount, 900);
  assert.strictEqual(outcome.xraySellers[0].isBestSeller, null);
  console.log('  🟢 Xray report provenance is retained while absent fields remain UNKNOWN.');

  // Only the specifically approved short host may expand the Amazon trust boundary.
  assert.strictEqual(isAllowedHost('a.co'), true);
  for (const host of ['www.a.co', 'amzn.to', 'amzn.eu', 'amzn.asia', 'amzn.com']) {
    assert.strictEqual(isAllowedHost(host), false, `${host} must not be allowlisted without explicit approval`);
  }
  assert.strictEqual(isAllowedHost('amazon.co.uk'), true, 'Existing regional Amazon storefronts must remain supported.');
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
  assert.ok(workspace.includes('setXraySellers([]);'), 'Workspace must clear display-only Xray rows on project-context change.');
  assert.ok(!server.includes('Amazon Top Seller (${item.asin})'), 'Server must not manufacture a Top Seller title.');
  assert.ok(!server.includes('PREMIUM QUALITY'), 'Learning Box must not manufacture generic product bullet claims.');
  assert.ok(pipeline.includes('Imported Staff Xray report — snapshot, not live verified.'), 'Rich Xray UI must disclose report provenance.');
  assert.ok(learningBox.includes('Style reference for drafts only'), 'Learning UI must disclose the limited use of learned structure.');
  assert.ok(server.includes('NOT PRODUCT TRUTH OR A PERFORMANCE CLAIM'), 'Draft prompt must not represent a learned template as a verified winner.');
  assert.ok(!server.includes('FEW-SHOT GOLD STANDARD WINNING TEMPLATE'), 'Draft prompt must not claim unverified performance.');
  console.log('  🟢 UI renders UNKNOWN safely and removes unscoped browser evidence caching.');

  console.log('\n================================================================');
  console.log('  🟢 AMAZON TRUTH-BOUNDARY REMEDIATION CONTRACT PASSED');
  console.log('================================================================');
}

main().catch(error => {
  console.error('🔴 AMAZON TRUTH-BOUNDARY REMEDIATION FAILED:', error.stack || error.message);
  process.exit(1);
});
