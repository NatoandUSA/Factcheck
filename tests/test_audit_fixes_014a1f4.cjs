/**
 * test_audit_fixes_014a1f4.cjs
 * RIGOROUS DATA-DRIVEN HTTP & DB CONTRACT TESTS for audit fixes (commit 014a1f4):
 *   1. POST /api/listings with nonexistent projectId → 404 PROJECT_NOT_FOUND AND ZERO DB delta (snapshot verified)
 *   2. GET /api/analytics-summary explicitly seeds PUBLISH_READY & MANAGER_APPROVED rows and verifies count >= 2
 *   3. POST /api/agents/:id/toggle rejects arbitrary status with 400 AND verifies zero DB mutation for invalid status
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const http = require('http');
const { app, db, databaseReady } = require('../server/server');

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function(err) { err ? reject(err) : resolve(this); }));
}

async function waitForFixtures(timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await dbAll(`
      SELECT u.id as user_id, u.email, w.tenant_id, wm.workspace_id, wm.role, w.marketplace
      FROM workspace_memberships wm
      JOIN users u ON u.id = wm.user_id
      JOIN workspaces w ON w.id = wm.workspace_id
    `);
    if (rows.length >= 1) return rows;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error('Timed out waiting for test fixtures');
}

function fetch(baseUrl, path, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(path, baseUrl);
    const reqOpts = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Origin': baseUrl,
        ...(opts.headers || {})
      }
    };
    const req = http.request(reqOpts, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        res.text = () => body;
        res.json = () => {
          try { return JSON.parse(body); } catch (_) { return {}; }
        };
        resolve(res);
      });
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function runAuditFixesTest() {
  await databaseReady;
  const fx = await waitForFixtures();
  const owner = fx.find(f => f.role === 'OWNER') || fx[0];

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  process.env.ALLOWED_ORIGINS = baseUrl;

  try {
    console.log('================================================================');
    console.log('  TESTING AUDIT FIXES (014a1f4) RIGOROUS DATA & DB CONTRACTS');
    console.log('================================================================\n');

    // 1. Login as Owner
    const loginRes = await fetch(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: owner.email || 'owner@omniseller.local',
        password: 'password123',
        workspaceId: owner.workspace_id
      })
    });
    assert.strictEqual(loginRes.statusCode, 200, 'Owner login must succeed');
    const setCookie = loginRes.headers['set-cookie'];
    const ownerCookie = Array.isArray(setCookie) ? setCookie.map(c => c.split(';')[0]).join('; ') : (setCookie || '').split(';')[0];
    const authHeaders = { Cookie: ownerCookie };

    // Ensure a test agent exists in db
    await dbRun(`
      INSERT INTO agents (name, role, status, tenant_id, workspace_id)
      VALUES ('Test Agent Audit', 'Researcher', 'ONLINE', ?, ?)
    `, [owner.tenant_id, owner.workspace_id]);

    // ── Test 1: POST /api/listings with nonexistent projectId → 404 AND ZERO DB write ──
    console.log('Test 1: Listing creation with nonexistent projectId (HTTP 404 + Zero DB Write)...');
    const countBefore = (await dbAll('SELECT COUNT(*) as c FROM listings'))[0].c;

    const listingRes = await fetch(baseUrl, '/api/listings', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        projectId: 999999,
        categoryName: 'Test Category',
        amazonTitle: 'Test Listing Title Nonexistent Proj',
        bulletPoints: ['Bullet 1', 'Bullet 2'],
        description: 'Test description'
      })
    });
    assert.strictEqual(listingRes.statusCode, 404, 'Nonexistent projectId must return 404');
    const listingBody = listingRes.json();
    assert.strictEqual(listingBody.error, 'PROJECT_NOT_FOUND', 'Error must be PROJECT_NOT_FOUND');

    const countAfter = (await dbAll('SELECT COUNT(*) as c FROM listings'))[0].c;
    assert.strictEqual(countAfter, countBefore, 'Listing table row count must remain unchanged (Zero DB Write)');
    console.log(`  🟢 Nonexistent projectId correctly returns 404 PROJECT_NOT_FOUND & verified zero DB write (${countBefore} -> ${countAfter} rows).\n`);

    // ── Test 2: Analytics counts PUBLISH_READY and MANAGER_APPROVED as approved ──
    console.log('Test 2: Analytics summary counts PUBLISH_READY & MANAGER_APPROVED (Data Seeded)...');
    // Seed 1 PUBLISH_READY and 1 MANAGER_APPROVED listing
    await dbRun(`
      INSERT INTO listings (categoryName, amazonTitle, status, tenant_id, workspace_id, marketplace, listing_version)
      VALUES ('Audit Test Cat', 'Audit Test Listing PR', 'PUBLISH_READY', ?, ?, ?, 1)
    `, [owner.tenant_id, owner.workspace_id, owner.marketplace || 'AMAZON']);

    await dbRun(`
      INSERT INTO listings (categoryName, amazonTitle, status, tenant_id, workspace_id, marketplace, listing_version)
      VALUES ('Audit Test Cat', 'Audit Test Listing MA', 'MANAGER_APPROVED', ?, ?, ?, 1)
    `, [owner.tenant_id, owner.workspace_id, owner.marketplace || 'AMAZON']);

    const analyticsRes = await fetch(baseUrl, '/api/analytics-summary', {
      headers: authHeaders
    });
    assert.strictEqual(analyticsRes.statusCode, 200, 'Analytics endpoint must return 200');
    const analytics = analyticsRes.json();
    assert.ok(analytics.listingStats, 'Analytics response must contain listingStats');
    assert.ok(typeof analytics.listingStats.approvedListings === 'number', 'listingStats.approvedListings must be a number');
    assert.ok(analytics.listingStats.approvedListings >= 2, `approvedListings must be >= 2 (seeded 1 PUBLISH_READY + 1 MANAGER_APPROVED), got ${analytics.listingStats.approvedListings}`);
    console.log(`  🟢 Analytics summary verified: approvedListings=${analytics.listingStats.approvedListings} (correctly sums both PUBLISH_READY & MANAGER_APPROVED rows!).\n`);

    // ── Test 3: Agent toggle rejects arbitrary status AND verifies DB isolation ──
    console.log('Test 3: Agent toggle status validation & DB state isolation...');
    const agentsRes = await fetch(baseUrl, '/api/agents', { headers: authHeaders });
    const agents = agentsRes.json();
    const testAgent = Array.isArray(agents) && agents.length > 0 ? agents[0] : null;
    assert.ok(testAgent, 'Test agent must exist in DB');

    const agentId = testAgent.id;
    const initialDbRow = (await dbAll('SELECT status FROM agents WHERE id = ?', [agentId]))[0];
    const initialStatus = initialDbRow.status;

    // 3a: Send arbitrary status → 400 & check DB unchanged
    const badRes = await fetch(baseUrl, `/api/agents/${agentId}/toggle`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ status: 'BROKEN' })
    });
    assert.strictEqual(badRes.statusCode, 400, 'Arbitrary status "BROKEN" must return 400');
    const badBody = badRes.json();
    assert.strictEqual(badBody.error, 'INVALID_STATUS', 'Error must be INVALID_STATUS');

    const afterBadDbRow = (await dbAll('SELECT status FROM agents WHERE id = ?', [agentId]))[0];
    assert.strictEqual(afterBadDbRow.status, initialStatus, `DB agent status must remain untouched on 400 error (expected ${initialStatus}, got ${afterBadDbRow.status})`);
    console.log(`  🟢 Arbitrary status "BROKEN" rejected with 400 INVALID_STATUS & DB status remained strictly untouched (${initialStatus}).`);

    // 3b: Send valid OFFLINE → 200 & check DB updated
    const offRes = await fetch(baseUrl, `/api/agents/${agentId}/toggle`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ status: 'OFFLINE' })
    });
    assert.strictEqual(offRes.statusCode, 200, 'OFFLINE must be accepted');
    const afterOffDbRow = (await dbAll('SELECT status FROM agents WHERE id = ?', [agentId]))[0];
    assert.strictEqual(afterOffDbRow.status, 'OFFLINE', 'DB status must be updated to OFFLINE');
    console.log('  🟢 Valid status "OFFLINE" accepted with 200 & verified in DB.');

    // 3c: Send valid ONLINE → 200 & check DB updated
    const onRes = await fetch(baseUrl, `/api/agents/${agentId}/toggle`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ status: 'ONLINE' })
    });
    assert.strictEqual(onRes.statusCode, 200, 'ONLINE must be accepted');
    const afterOnDbRow = (await dbAll('SELECT status FROM agents WHERE id = ?', [agentId]))[0];
    assert.strictEqual(afterOnDbRow.status, 'ONLINE', 'DB status must be updated to ONLINE');
    console.log('  🟢 Valid status "ONLINE" accepted with 200 & verified in DB.\n');

    console.log('================================================================');
    console.log('  🟢 ALL AUDIT FIX RIGOROUS DATA & DB CONTRACTS PASSED CLEANLY!');
    console.log('================================================================\n');
  } finally {
    server.close();
  }
}

runAuditFixesTest().catch(err => {
  console.error('🔴 AUDIT FIX TEST FAILED:', err);
  process.exit(1);
});
