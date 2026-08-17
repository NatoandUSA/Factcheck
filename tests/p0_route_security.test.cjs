/**
 * Regression coverage for Issue #3's required-before-merge checklist items
 * not already covered elsewhere:
 *  1. unauthenticated operational mutations return 401
 *  2. insufficient roles return 403 where applicable
 *  3. cross-workspace trend read/draft returns IDOR-safe 404
 *  5. upload routes cannot mutate DB without auth
 *  6. agent toggle cannot mutate state without auth
 *  9. legacy unscoped trend rows are API-invisible
 * (4, 7, 8, 10 are covered by existing PR-2B/2C tests and ssrf_url_guard.test.cjs)
 */
process.env.NODE_ENV = 'test';

const assert = require('assert');
const { app, db, databaseReady } = require('../server/server');

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (err) { err ? reject(err) : resolve(this); }));
}

async function waitForOwnerWorkspaces(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await dbAll(`
      SELECT wm.workspace_id, w.marketplace, u.id as user_id, w.tenant_id
      FROM workspace_memberships wm
      JOIN users u ON u.id = wm.user_id
      JOIN workspaces w ON w.id = wm.workspace_id
      WHERE u.email = 'owner@omniseller.local'
    `);
    if (rows.length === 2) return rows;
    await new Promise(r => setTimeout(r, 25));
  }
  throw new Error('Timed out waiting for deterministic test fixtures');
}

async function login(port, email, password, workspaceId) {
  const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': `http://127.0.0.1:${port}` },
    body: JSON.stringify({ email, password, workspaceId })
  });
  if (res.status !== 200) return null;
  return res.headers.get('set-cookie').split(';')[0];
}

async function main() {
  console.log('================================================================');
  console.log('  TESTING P0 ROUTE SECURITY: AUTH GATES, IDOR, LEGACY-ROW SCOPING');
  console.log('================================================================\n');

  await databaseReady;
  const server = app.listen(0);
  const port = server.address().port;
  process.env.ALLOWED_ORIGINS = `http://127.0.0.1:${port}`;

  try {
    const memberships = await waitForOwnerWorkspaces();
    const amzWs = memberships.find(m => m.marketplace === 'AMAZON');
    const etsyWs = memberships.find(m => m.marketplace === 'ETSY');

    const ownerAmzCookie = await login(port, 'owner@omniseller.local', 'password123', amzWs.workspace_id);
    const ownerEtsyCookie = await login(port, 'owner@omniseller.local', 'password123', etsyWs.workspace_id);
    const sellerCookie = await login(port, 'seller@omniseller.local', 'password123', amzWs.workspace_id);
    assert(ownerAmzCookie && ownerEtsyCookie && sellerCookie, 'Fixture logins must succeed');

    const origin = { 'Origin': `http://127.0.0.1:${port}` };

    // --- 1. Unauthenticated operational mutations return 401 ---
    const unauthChecks = [
      ['POST', '/api/agents/1/toggle', { status: 'ONLINE' }],
      ['POST', '/api/mcp/call', { toolName: 'x' }],
      ['POST', '/api/learning/analyze', { url: 'https://www.amazon.com/' }],
      ['DELETE', '/api/learning/templates/1', null]
    ];
    for (const [method, path, body] of unauthChecks) {
      const res = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: { ...origin, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
      assert.strictEqual(res.status, 401, `${method} ${path} without auth must return 401, got ${res.status}`);
    }
    console.log('🟢 Item 1: unauthenticated operational mutations return 401 (4/4 routes checked).');

    // --- 5. Unauthenticated upload cannot mutate DB ---
    const beforeCount = (await dbAll('SELECT COUNT(*) c FROM market_trends')).length ? (await dbAll('SELECT COUNT(*) c FROM market_trends'))[0].c : 0;
    const uploadRes = await fetch(`http://127.0.0.1:${port}/api/upload-h10`, { method: 'POST', headers: origin });
    assert.strictEqual(uploadRes.status, 401, 'Unauthenticated upload must return 401');
    const afterCount = (await dbAll('SELECT COUNT(*) c FROM market_trends'))[0].c;
    assert.strictEqual(afterCount, beforeCount, 'Unauthenticated upload attempt must not touch market_trends');
    console.log('🟢 Item 5: unauthenticated upload rejected before any DB mutation.');

    // --- 6. Unauthenticated agent toggle cannot mutate state ---
    const agentBefore = (await dbAll('SELECT status FROM agents WHERE id = 1'))[0];
    await fetch(`http://127.0.0.1:${port}/api/agents/1/toggle`, {
      method: 'POST', headers: { ...origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'ONLINE' })
    });
    const agentAfter = (await dbAll('SELECT status FROM agents WHERE id = 1'))[0];
    assert.strictEqual(agentAfter?.status, agentBefore?.status, 'Unauthenticated toggle must not change agent status');
    console.log('🟢 Item 6: unauthenticated agent toggle did not mutate state.');

    // --- 2. Insufficient role returns 403 (SELLER cannot toggle agents) ---
    const sellerToggleRes = await fetch(`http://127.0.0.1:${port}/api/agents/1/toggle`, {
      method: 'POST',
      headers: { ...origin, 'Content-Type': 'application/json', Cookie: sellerCookie },
      body: JSON.stringify({ status: 'ONLINE' })
    });
    assert.strictEqual(sellerToggleRes.status, 403, `SELLER toggling agent must return 403, got ${sellerToggleRes.status}`);
    console.log('🟢 Item 2: SELLER role correctly denied 403 on OWNER/MANAGER-only route.');

    // --- 3. Cross-workspace trend draft returns IDOR-safe 404 ---
    const trendInsert = await dbRun(
      "INSERT INTO market_trends (category, trending_keywords, marketplace, tenant_id, workspace_id) VALUES (?, ?, ?, ?, ?)",
      ['Jewelry', 'test keyword', 'AMAZON', amzWs.tenant_id, amzWs.workspace_id]
    );
    const trendId = trendInsert.lastID;

    const crossWorkspaceRes = await fetch(`http://127.0.0.1:${port}/api/trends/${trendId}/draft`, {
      method: 'POST',
      headers: { ...origin, Cookie: ownerEtsyCookie }
    });
    assert.strictEqual(crossWorkspaceRes.status, 404, `Cross-workspace trend draft must return 404, got ${crossWorkspaceRes.status}`);

    const sameWorkspaceRes = await fetch(`http://127.0.0.1:${port}/api/trends`, {
      headers: { ...origin, Cookie: ownerAmzCookie }
    });
    const sameWorkspaceTrends = await sameWorkspaceRes.json();
    assert(sameWorkspaceTrends.some(t => t.id === trendId), 'Owning workspace must see its own trend via GET /api/trends');
    console.log('🟢 Item 3: cross-workspace trend draft returns IDOR-safe 404; owning workspace can still see it.');

    // --- 9. Legacy unscoped rows are API-invisible ---
    const legacyInsert = await dbRun(
      "INSERT INTO market_trends (category, trending_keywords, marketplace, keywords_detailed) VALUES (?, ?, ?, ?)",
      ['Jewelry', 'legacy unscoped keyword', 'AMAZON', JSON.stringify([{ keyword: 'legacy unscoped keyword', tierBadge: 'x' }])]
    );
    const legacyTrendRes = await fetch(`http://127.0.0.1:${port}/api/trends`, { headers: { ...origin, Cookie: ownerAmzCookie } });
    const legacyTrends = await legacyTrendRes.json();
    assert(!legacyTrends.some(t => t.id === legacyInsert.lastID), 'Legacy unscoped trend row must not appear in GET /api/trends');

    const mklRes = await fetch(`http://127.0.0.1:${port}/api/master-keywords?marketplace=AMAZON`, { headers: { ...origin, Cookie: ownerAmzCookie } });
    const mklData = await mklRes.json();
    assert(!mklData.keywords.some(k => k.keyword === 'legacy unscoped keyword'), 'Legacy unscoped keyword must not appear in master-keywords');
    console.log('🟢 Item 9: legacy unscoped market_trends row is invisible to both /api/trends and /api/master-keywords.');

    console.log('\n================================================================');
    console.log('  🟢 100% P0 ROUTE SECURITY REGRESSION SUITE PASSED!');
    console.log('================================================================\n');
    console.log('✅ tests/p0_route_security.test.cjs PASSED CLEANLY!');
  } finally {
    await new Promise(res => server.close(res));
    if (db && typeof db.close === 'function') await new Promise(res => db.close(res));
  }
}

main().catch(err => {
  console.error('🔴 P0 ROUTE SECURITY TEST FAILED:', err);
  process.exitCode = 1;
});
