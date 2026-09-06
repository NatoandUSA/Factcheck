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
    const projectRes = await fetch(`http://127.0.0.1:${port}/api/projects`, {
      method: 'POST',
      headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerAmzCookie },
      body: JSON.stringify({ name: 'P0 scoped project', seedPhrase: 'test keyword' })
    });
    const projectData = await projectRes.json();
    assert.strictEqual(projectRes.status, 200);
    const projectId = projectData.projectId;
    const trendInsert = await dbRun(
      "INSERT INTO market_trends (category, trending_keywords, marketplace, tenant_id, workspace_id, project_id) VALUES (?, ?, ?, ?, ?, ?)",
      ['Jewelry', 'test keyword', 'AMAZON', amzWs.tenant_id, amzWs.workspace_id, projectId]
    );
    const trendId = trendInsert.lastID;

    const crossWorkspaceRes = await fetch(`http://127.0.0.1:${port}/api/trends/${trendId}/draft`, {
      method: 'POST',
      headers: { ...origin, Cookie: ownerEtsyCookie }
    });
    assert.strictEqual(crossWorkspaceRes.status, 404, `Cross-workspace trend draft must return 404, got ${crossWorkspaceRes.status}`);

    const sameWorkspaceRes = await fetch(`http://127.0.0.1:${port}/api/trends?projectId=${projectId}`, {
      headers: { ...origin, Cookie: ownerAmzCookie }
    });
    const sameWorkspacePayload = await sameWorkspaceRes.json();
    const sameWorkspaceTrends = sameWorkspacePayload.trends;
    assert(sameWorkspaceTrends.some(t => t.id === trendId), 'Owning workspace must see its own trend via GET /api/trends');
    console.log('🟢 Item 3: cross-workspace trend draft returns IDOR-safe 404; owning workspace can still see it.');

    // --- 9. Legacy unscoped rows are API-invisible ---
    const legacyInsert = await dbRun(
      "INSERT INTO market_trends (category, trending_keywords, marketplace, keywords_detailed) VALUES (?, ?, ?, ?)",
      ['Jewelry', 'legacy unscoped keyword', 'AMAZON', JSON.stringify([{ keyword: 'legacy unscoped keyword', tierBadge: 'x' }])]
    );
    const legacyTrendRes = await fetch(`http://127.0.0.1:${port}/api/trends?projectId=${projectId}`, { headers: { ...origin, Cookie: ownerAmzCookie } });
    const legacyTrends = await legacyTrendRes.json();
    assert(!legacyTrends.trends.some(t => t.id === legacyInsert.lastID), 'Legacy unscoped trend row must not appear in GET /api/trends');

    const mklRes = await fetch(`http://127.0.0.1:${port}/api/master-keywords?projectId=${projectId}`, { headers: { ...origin, Cookie: ownerAmzCookie } });
    const mklData = await mklRes.json();
    assert(!mklData.keywords.some(k => k.keyword === 'legacy unscoped keyword'), 'Legacy unscoped keyword must not appear in master-keywords');
    console.log('🟢 Item 9: legacy unscoped market_trends row is invisible to both /api/trends and /api/master-keywords.');

    // --- GPT PR-5 review T1: marketplace is server-derived, not client-controlled ---
    const pullEtsyFromAmazonRes = await fetch(`http://127.0.0.1:${port}/api/mcp/pull-etsy`, {
      method: 'POST',
      headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerAmzCookie },
      body: JSON.stringify({ seed: 'test seed', category: 'Test' })
    });
    assert.strictEqual(pullEtsyFromAmazonRes.status, 403, `Amazon session calling Etsy-only pull-etsy must return 403, got ${pullEtsyFromAmazonRes.status}`);
    const pullEtsyBody = await pullEtsyFromAmazonRes.json();
    assert.strictEqual(pullEtsyBody.error, 'MARKETPLACE_MISMATCH');

    const mklQueryOverrideRes = await fetch(`http://127.0.0.1:${port}/api/master-keywords?projectId=${projectId}&marketplace=ETSY`, {
      headers: { ...origin, Cookie: ownerAmzCookie }
    });
    const mklQueryOverrideData = await mklQueryOverrideRes.json();
    assert.strictEqual(mklQueryOverrideData.marketplace, 'AMAZON', 'master-keywords must ignore a ?marketplace= query override and use the session marketplace');
    console.log('🟢 T1: marketplace is server-derived — Etsy-only route rejects Amazon session (403), query-param override ignored.');

    // --- GPT PR-5 re-review T5: Etsy-only scan-search/batch-learn also reject non-Etsy sessions ---
    const scanSearchFromAmazonRes = await fetch(`http://127.0.0.1:${port}/api/etsy/scan-search`, {
      method: 'POST',
      headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerAmzCookie },
      body: JSON.stringify({ seedPhrase: 'test seed' })
    });
    assert.strictEqual(scanSearchFromAmazonRes.status, 403, `Amazon session calling Etsy-only scan-search must return 403, got ${scanSearchFromAmazonRes.status}`);
    assert.strictEqual((await scanSearchFromAmazonRes.json()).error, 'MARKETPLACE_MISMATCH');

    const batchLearnFromAmazonRes = await fetch(`http://127.0.0.1:${port}/api/etsy/batch-learn`, {
      method: 'POST',
      headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerAmzCookie },
      body: JSON.stringify({ seedPhrase: 'test seed', sellers: [] })
    });
    assert.strictEqual(batchLearnFromAmazonRes.status, 403, `Amazon session calling Etsy-only batch-learn must return 403, got ${batchLearnFromAmazonRes.status}`);
    assert.strictEqual((await batchLearnFromAmazonRes.json()).error, 'MARKETPLACE_MISMATCH');
    console.log('🟢 T5: Etsy-only scan-search and batch-learn both reject an Amazon session (403 MARKETPLACE_MISMATCH).');

    // --- GPT PR-5 final review P0-FINAL-1: Learning Box URL can no longer
    // override the server-derived session marketplace ---
    const templatesBefore = (await dbAll('SELECT COUNT(*) c FROM learned_templates'))[0].c;

    const amazonSessionEtsyUrlRes = await fetch(`http://127.0.0.1:${port}/api/learning/analyze`, {
      method: 'POST',
      headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerAmzCookie },
      body: JSON.stringify({ url: 'https://www.etsy.com/listing/12345/test-listing' })
    });
    assert.strictEqual(amazonSessionEtsyUrlRes.status, 400, `Amazon session analyzing an Etsy URL must return 400, got ${amazonSessionEtsyUrlRes.status}`);
    assert.strictEqual((await amazonSessionEtsyUrlRes.json()).error, 'URL_NOT_ALLOWED');

    const etsySessionAmazonUrlRes = await fetch(`http://127.0.0.1:${port}/api/learning/analyze`, {
      method: 'POST',
      headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerEtsyCookie },
      body: JSON.stringify({ url: 'https://www.amazon.com/dp/B000TEST' })
    });
    assert.strictEqual(etsySessionAmazonUrlRes.status, 400, `Etsy session analyzing an Amazon URL must return 400, got ${etsySessionAmazonUrlRes.status}`);
    assert.strictEqual((await etsySessionAmazonUrlRes.json()).error, 'URL_NOT_ALLOWED');

    const templatesAfter = (await dbAll('SELECT COUNT(*) c FROM learned_templates'))[0].c;
    assert.strictEqual(templatesAfter, templatesBefore, 'Neither cross-marketplace analyze attempt should have persisted a learned_templates row');
    console.log('🟢 P0-FINAL-1: cross-marketplace Learning Box URLs (Amazon session + Etsy URL, Etsy session + Amazon URL) are both rejected with zero DB mutation.');

    // --- GPT PR-5 review T4: legacy unscoped + cross-workspace learned_templates are invisible ---
    const legacyTemplateInsert = await dbRun(
      "INSERT INTO learned_templates (url, marketplace, category, title, bullets, tags, description, styleDna) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ['https://www.amazon.com/dp/LEGACY', 'AMAZON', 'Jewelry', 'Legacy Unscoped Template', '[]', '[]', '', '{}']
    );
    const foreignTemplateInsert = await dbRun(
      "INSERT INTO learned_templates (url, marketplace, category, title, bullets, tags, description, styleDna, tenant_id, workspace_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ['https://www.etsy.com/listing/FOREIGN', 'ETSY', 'Jewelry', 'Foreign Workspace Template', '[]', '[]', '', '{}', etsyWs.tenant_id, etsyWs.workspace_id]
    );

    const templatesListRes = await fetch(`http://127.0.0.1:${port}/api/learning/templates`, { headers: { ...origin, Cookie: ownerAmzCookie } });
    const templatesListData = await templatesListRes.json();
    assert(!templatesListData.templates.some(t => t.id === legacyTemplateInsert.lastID), 'Legacy unscoped template must not appear in the list');
    assert(!templatesListData.templates.some(t => t.id === foreignTemplateInsert.lastID), 'Foreign-workspace (Etsy) template must not appear in an Amazon-session list');

    const deleteLegacyRes = await fetch(`http://127.0.0.1:${port}/api/learning/templates/${legacyTemplateInsert.lastID}`, {
      method: 'DELETE', headers: { ...origin, Cookie: ownerAmzCookie }
    });
    assert.strictEqual(deleteLegacyRes.status, 404, 'Deleting a legacy unscoped template must return IDOR-safe 404');
    const deleteForeignRes = await fetch(`http://127.0.0.1:${port}/api/learning/templates/${foreignTemplateInsert.lastID}`, {
      method: 'DELETE', headers: { ...origin, Cookie: ownerAmzCookie }
    });
    assert.strictEqual(deleteForeignRes.status, 404, 'Deleting a foreign-workspace template must return IDOR-safe 404');

    const stillThereRows = await dbAll('SELECT id FROM learned_templates WHERE id IN (?, ?)', [legacyTemplateInsert.lastID, foreignTemplateInsert.lastID]);
    assert.strictEqual(stillThereRows.length, 2, 'Neither legacy nor foreign-workspace template row was actually deleted by the rejected requests');
    console.log('🟢 T4: legacy unscoped and cross-workspace learned_templates are invisible to list, and delete on either is an IDOR-safe 404 with zero mutation.');

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
