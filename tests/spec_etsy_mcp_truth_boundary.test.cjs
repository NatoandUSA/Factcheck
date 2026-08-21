const assert = require('assert');
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'test';

const { app, db, databaseReady } = require('../server/server');
const { createSessionRecord } = require('../server/security/session');

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}

function createSession(userId, workspaceId, tenantId) {
  return new Promise((resolve, reject) => {
    createSessionRecord(db, userId, workspaceId, tenantId, (err, session) => {
      if (err) reject(err);
      else resolve(session);
    });
  });
}

async function waitForTestFixtures(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await dbAll(`
      SELECT u.id as user_id, w.tenant_id, wm.workspace_id, wm.role, w.marketplace
      FROM workspace_memberships wm
      JOIN users u ON u.id = wm.user_id
      JOIN workspaces w ON w.id = wm.workspace_id
      ORDER BY wm.workspace_id
    `);
    if (rows.length >= 2) return rows;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for test fixtures');
}

async function runTests() {
  await databaseReady;
  const fixtures = await waitForTestFixtures();
  const etsyOwner = fixtures.find(f => f.role === 'OWNER' && f.marketplace === 'ETSY');
  assert(etsyOwner, 'Etsy owner user fixture required');

  console.log('================================================================');
  console.log('  TESTING ETSY MCP TRUTH BOUNDARY & ZERO FABRICATION CONTRACT');
  console.log('================================================================\n');

  // Test 1: Verify source code invariant in EtsyMultiSellerScanner.jsx (Zero synthetic benchmark generator)
  console.log('Test 1: Verifying Zero Synthetic Code in EtsyMultiSellerScanner.jsx...');
  const componentCode = fs.readFileSync(path.join(__dirname, '../src/components/EtsyMultiSellerScanner.jsx'), 'utf8');
  assert.strictEqual(componentCode.includes('addSeedBenchmarkSellers'), false, 'Synthetic benchmark generator addSeedBenchmarkSellers must not exist');
  assert.strictEqual(componentCode.includes('⚡ Quick Nạp 30 Top Sellers'), false, 'Synthetic 30 sellers quick button must not exist');
  console.log('  🟢 Zero synthetic seller generator verified in UI component code.');

  // Bind server to ephemeral OS port
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const origin = { Origin: `http://127.0.0.1:${port}` };
  process.env.ALLOWED_ORIGINS = `http://127.0.0.1:${port},http://localhost:${port}`;

  try {
    const session = await createSession(etsyOwner.user_id, etsyOwner.workspace_id, etsyOwner.tenant_id);
    const cookieHeader = `omni_session=${session.rawToken}`;

    // Test 2: Pass-Through MCP Parser with Sparse Payload (Missing title, shop, rating, price, URL)
    console.log('\nTest 2: Testing Sparse MCP Top Listings Pass-Through (Zero Fabrication)...');
    
    const serverModule = require('../server/server');
    const ytrendsMcp = serverModule.ytrendsMcp || {};
    const originalExplore = ytrendsMcp.exploreNiche;

    ytrendsMcp.exploreNiche = async () => ({
      data: {
        overview: { opportunity_score: 82, listings: 4500, sellers: 320 },
        adjacent_tags: ['mom gift', 'handcrafted mug'],
        related_keywords: ['custom disney sweatshirt', 'personalized gift for mom'],
        top_listings: [
          { listing_id: '987654', views_24h: 300 }, // Sparse object missing title, shop_name, shop_country, price, rating, url
          { listing_id: '123456', title: 'Real Handmade Mug', shop_name: 'CraftShopVN', shop_country: 'VN', price_usd: 19.99, rating: 4.8 }
        ]
      }
    });

    const pullRes = await fetch(`${baseUrl}/api/mcp/pull-etsy`, {
      method: 'POST',
      headers: { ...origin, 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ seed: 'mom gift', category: 'Mug' })
    });

    assert.strictEqual(pullRes.status, 200);
    const pullData = await pullRes.json();

    assert.strictEqual(pullData.success, true);
    assert.strictEqual(pullData.sellers.length, 2, 'MCP returned exactly 2 sellers, must not force 30 or fake batches');

    const sparseSeller = pullData.sellers.find(s => s.id.includes('987654'));
    assert.strictEqual(sparseSeller.title, null, 'Missing title must pass-through as null, never fabricated text');
    assert.strictEqual(sparseSeller.shopName, null, 'Missing shop name must pass-through as null, never fabricated shop');
    assert.strictEqual(sparseSeller.country, null, 'Missing country must pass-through as null, never default US');
    assert.strictEqual(sparseSeller.rating, null, 'Missing rating must pass-through as null, never default 4.9');
    assert.strictEqual(sparseSeller.price, null, 'Missing price must pass-through as null');
    assert.strictEqual(sparseSeller.url, 'https://www.etsy.com/listing/987654', 'URL must use real listing ID URL, never fallback search URL');
    assert.strictEqual(sparseSeller.isSynthetic, false);
    console.log('  🟢 Sparse MCP pass-through verified: missing fields stay null/UNKNOWN, zero fabrication.');

    // Test 3: IP Screening & Provenance for Related Keywords
    console.log('\nTest 3: Testing IP Screening & Provenance on Related Keywords...');
    assert.ok(pullData.blockedKeywords.includes('custom disney sweatshirt'), 'IP Guard must block IP term in related keywords');

    const relatedItem = pullData.keywordsDetailed.find(k => k.keyword === 'personalized gift for mom');
    assert.ok(relatedItem, 'Clean related keyword must be included');
    assert.strictEqual(relatedItem.volume, null, 'Keyword volume must be null (not copied from overview listings count)');
    assert.strictEqual(relatedItem.competingProducts, null, 'Keyword competingProducts must be null (not copied from overview sellers count)');
    console.log('  🟢 IP screening on related keywords and per-keyword metric provenance verified cleanly.');

    // Restore original explore
    if (originalExplore) ytrendsMcp.exploreNiche = originalExplore;

    console.log('\n================================================================');
    console.log('  🟢 ALL ETSY MCP TRUTH BOUNDARY & RECOVERY TESTS PASSED CLEANLY');
    console.log('================================================================\n');
  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error('🔴 ETSY MCP TRUTH BOUNDARY TEST FAILED:', err);
  process.exit(1);
});
