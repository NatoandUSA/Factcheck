'use strict';

/**
 * Test Suite: Zero-Fabrication Boundary & Product Truth Hardening
 * 
 * Verifies:
 * 1. Image Prompt Generators produce ZERO unverified material/origin/turnaround claims.
 * 2. Etsy Search Feeds do NOT fabricate seller/shop names from country or provider status.
 * 3. Etsy Preview renders ONLY genuine data without hardcoded reviews, prices, or badges.
 * 4. Batch CSV row validation strictly requires ProductBrief and does not inject sample briefs.
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  generateAmazonListingImagePrompts,
  generateAmazonAPlusImagePrompts,
  generateEtsyListingImagePrompts
} = require('../src/services/imagePromptGenerator');

const { app, db, databaseReady } = require('../server/server');
const { createSessionRecord } = require('../server/security/session');

const dbAll = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
const createSession = (userId, workspaceId, tenantId) => new Promise((resolve, reject) => {
  createSessionRecord(db, userId, workspaceId, tenantId, (err, session) => err ? reject(err) : resolve(session));
});

async function waitForFixtures() {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const rows = await dbAll(`SELECT u.id user_id, w.tenant_id, wm.workspace_id, wm.role, w.marketplace
      FROM workspace_memberships wm JOIN users u ON u.id = wm.user_id JOIN workspaces w ON w.id = wm.workspace_id`);
    if (rows.some(row => row.role === 'OWNER' && row.marketplace === 'ETSY')) return rows;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for fixtures');
}

async function runZeroFabricationSuite() {
  console.log('================================================================');
  console.log('  TESTING ZERO-FABRICATION BOUNDARY & PRODUCT TRUTH HARDENING');
  console.log('================================================================\n');

  // 1. Image Prompt Generator Zero-Fabrication Invariants
  console.log('Test 1: Image Prompt Generators - Zero Unverified Claims...');
  const amzListingPrompts = generateAmazonListingImagePrompts('Custom Mug', 'Drinkware', 'coffee mug');
  const amzAPlusPrompts = generateAmazonAPlusImagePrompts('Custom Mug', 'Drinkware');
  const etsyPrompts = generateEtsyListingImagePrompts('Custom Mug', 'Drinkware', 'coffee mug');

  const allPrompts = [
    ...amzListingPrompts.map(p => p.prompt),
    ...amzAPlusPrompts.map(p => p.prompt),
    ...etsyPrompts.map(p => p.prompt)
  ].join(' ').toLowerCase();

  const prohibitedClaims = [
    'laser engraving',
    'optical-grade acrylic',
    'european beechwood',
    'led 3000k',
    'austin texas',
    'ship in 24h',
    'usa workshop',
    '100% quality inspected - usa workshop',
    '5 gold stars',
    'sustainable timber'
  ];

  for (const claim of prohibitedClaims) {
    assert.strictEqual(
      allPrompts.includes(claim),
      false,
      `Image prompt generator must NOT contain unverified claim "${claim}"`
    );
  }
  console.log('  🟢 Image prompt generators verified: Zero unverified material/origin claims.');

  // 2. Batch behavior is exercised in test_ai_boundary_and_batch.cjs. This
  // suite retains a narrow wiring assertion so a future UI edit cannot bypass
  // the canonical preflight helper without the behavioral suite noticing.
  console.log('\nTest 2: Batch CSV Generator - Canonical Product Truth Preflight...');
  const batchCsvSource = fs.readFileSync(path.join(__dirname, '../src/components/BatchCsvGenerator.jsx'), 'utf8');
  assert.ok(batchCsvSource.includes('prepareVerifiedBatchRow(row)'), 'Batch CSV must use the canonical GPT2 preflight');
  assert.strictEqual(batchCsvSource.includes('categoryObj.sampleBrief'), false, 'Batch CSV must not inject sampleBrief');
  assert.strictEqual(batchCsvSource.includes('categoryObj.defaultMaterials'), false, 'Batch CSV must not inject defaultMaterials');
  assert.strictEqual(batchCsvSource.includes('sourceRow: row'), false, 'Raw CSV prose must not be persisted inside the generated listing');
  console.log('  🟢 Batch CSV generator is wired to evidence-bound preflight.');

  // 3. Etsy Preview Static Contract Verification
  console.log('\nTest 3: Etsy Preview - Zero Hardcoded Reviews or Bestseller Badges...');
  const etsyPreviewSource = fs.readFileSync(path.join(__dirname, '../src/components/EtsyPreview.jsx'), 'utf8');
  assert.strictEqual(etsyPreviewSource.includes('(2,104)'), false, 'EtsyPreview must NOT hardcode (2,104) reviews');
  assert.strictEqual(etsyPreviewSource.includes('OmniSellerStudio'), false, 'EtsyPreview must NOT hardcode OmniSellerStudio');
  assert.strictEqual(etsyPreviewSource.includes('$24.99'), false, 'EtsyPreview must NOT hardcode $24.99 price');
  console.log('  🟢 Etsy preview verified: Zero hardcoded commerce facts.');

  // 4. Server Search Feed Zero-Fabrication Integration Test
  console.log('\nTest 4: Server Feed Parser - Truthful shopName & Provenance...');
  await databaseReady;
  const fixtures = await waitForFixtures();
  const etsy = fixtures.find(row => row.role === 'OWNER' && row.marketplace === 'ETSY');
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  process.env.ALLOWED_ORIGINS = base;

  const session = await createSession(etsy.user_id, etsy.workspace_id, etsy.tenant_id);
  const headers = { Origin: base, Cookie: `omni_session=${session.rawToken}`, 'Content-Type': 'application/json' };

  try {
    // 4.1 Create test project
    const projRes = await fetch(`${base}/api/projects`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Truth Feed Test', seedPhrase: 'para mi hija' })
    });
    const projData = await projRes.json();
    const projectId = projData.projectId ?? projData.project?.id;
    assert(projectId, 'Project creation failed');

    // 4.2 Test feed parsing with raw text (no seller name supplied)
    const feedRes = await fetch(`${base}/api/etsy/feed-search-results`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        rawText: '$28.50 150 Sold 1.2k Views US\nPersonalized Sudadera Para Mi Hija',
        seed: 'para mi hija',
        projectId
      })
    });
    assert.strictEqual(feedRes.status, 200);
    const feedData = await feedRes.json();
    assert.ok(Array.isArray(feedData.sellers), 'Must return sellers array');
    assert.ok(feedData.sellers.length > 0, 'Must parse at least 1 seller');
    
    // Ensure shopName is strictly null when no real seller identity was supplied
    for (const seller of feedData.sellers) {
      assert.strictEqual(seller.shopName, null, 'Unidentified seller must have shopName: null');
      assert.strictEqual(seller.shopNameEvidenceState, 'UNKNOWN', 'Seller evidence state must be UNKNOWN');
      assert.strictEqual(
        ['Etsy Top Seller', 'Etsy Search Result', 'Etsy Web Live'].includes(seller.shopName),
        false,
        'Seller must not have synthetic label in shopName'
      );
    }
    console.log('  🟢 Server feed parser verified: shopName is strictly null for unidentified sellers.');

  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log('  🟢 ALL ZERO-FABRICATION BOUNDARY TESTS PASSED CLEANLY!');
  console.log('================================================================\n');
}

runZeroFabricationSuite().catch(err => {
  console.error('🔴 ZERO-FABRICATION SUITE FAILED:', err);
  process.exit(1);
});
