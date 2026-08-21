const assert = require('assert');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';

const { app, db, databaseReady } = require('../server/server');
const { createSessionRecord } = require('../server/security/session');
const { createRateLimiter } = require('../server/security/rateLimiter');

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
    const hasOwnerAmz = rows.some(f => f.role === 'OWNER' && f.marketplace === 'AMAZON');
    const hasSellerAmz = rows.some(f => f.role === 'SELLER' && f.marketplace === 'AMAZON');
    const hasOwnerEtsy = rows.some(f => f.role === 'OWNER' && f.marketplace === 'ETSY');
    if (hasOwnerAmz && hasSellerAmz && hasOwnerEtsy) return rows;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for test fixtures');
}

async function runTests() {
  await databaseReady;
  const fixtures = await waitForTestFixtures();
  
  const ownerAmzFixture = fixtures.find(f => f.role === 'OWNER' && f.marketplace === 'AMAZON');
  const sellerAmzFixture = fixtures.find(f => f.role === 'SELLER' && f.marketplace === 'AMAZON');
  const ownerEtsyFixture = fixtures.find(f => f.role === 'OWNER' && f.marketplace === 'ETSY');

  assert(ownerAmzFixture && sellerAmzFixture && ownerEtsyFixture, 'Required test fixtures missing');

  console.log('================================================================');
  console.log('  TESTING WORKFLOW STATE MACHINE & SECURITY ISOLATION SUITE');
  console.log('================================================================\n');

  // Bind server to ephemeral OS port
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const origin = { Origin: `http://127.0.0.1:${port}` };
  process.env.ALLOWED_ORIGINS = `http://127.0.0.1:${port},http://localhost:${port}`;

  try {
    const ownerAmzSession = await createSession(ownerAmzFixture.user_id, ownerAmzFixture.workspace_id, ownerAmzFixture.tenant_id);
    const sellerAmzSession = await createSession(sellerAmzFixture.user_id, sellerAmzFixture.workspace_id, sellerAmzFixture.tenant_id);
    const ownerEtsySession = await createSession(ownerEtsyFixture.user_id, ownerEtsyFixture.workspace_id, ownerEtsyFixture.tenant_id);

    const ownerAmzCookie = `omni_session=${ownerAmzSession.rawToken}`;
    const sellerAmzCookie = `omni_session=${sellerAmzSession.rawToken}`;
    const ownerEtsyCookie = `omni_session=${ownerEtsySession.rawToken}`;

    // 1. Create a new Amazon Research Project
    console.log('Test 1: Creating new Amazon Research Project...');
    const createRes = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerAmzCookie },
      body: JSON.stringify({ name: 'Amazon Summer Sweatshirt Project', seedPhrase: 'mom sweatshirt', referenceAsin: 'B0CPHXX2ZF' })
    });
    assert.strictEqual(createRes.status, 200, `Create project failed with status ${createRes.status}`);
    const createData = await createRes.json();
    assert.strictEqual(createData.success, true);
    assert.strictEqual(createData.state, 'EVIDENCE_INTAKE');
    const projectId = createData.projectId;
    console.log(`  🟢 Project #${projectId} created in state EVIDENCE_INTAKE.`);

    // 2. Test Invalid Jump Transition (EVIDENCE_INTAKE -> PUBLISH_READY)
    console.log('\nTest 2: Testing Illegal Transition Jump (EVIDENCE_INTAKE -> PUBLISH_READY)...');
    const jumpRes = await fetch(`${baseUrl}/api/projects/${projectId}/transition`, {
      method: 'PATCH',
      headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerAmzCookie },
      body: JSON.stringify({ targetState: 'PUBLISH_READY' })
    });
    assert.strictEqual(jumpRes.status, 400, `Illegal jump should be rejected with 400, got ${jumpRes.status}`);
    const jumpData = await jumpRes.json();
    assert.strictEqual(jumpData.error, 'INVALID_STATE_TRANSITION');
    console.log('  🟢 Illegal jump transition correctly rejected with HTTP 400 INVALID_STATE_TRANSITION.');

    // 3. Test Missing Evidence Precondition (Transition to RESEARCH_ACCEPTED without evidence)
    console.log('\nTest 3: Testing Missing Evidence Precondition...');
    const noEvRes = await fetch(`${baseUrl}/api/projects/${projectId}/transition`, {
      method: 'PATCH',
      headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerAmzCookie },
      body: JSON.stringify({ targetState: 'RESEARCH_ACCEPTED' })
    });
    assert.strictEqual(noEvRes.status, 400, `Missing evidence precondition should return 400, got ${noEvRes.status}`);
    const noEvData = await noEvRes.json();
    assert.strictEqual(noEvData.error, 'MISSING_EVIDENCE_PRECONDITION');
    console.log('  🟢 Transition to RESEARCH_ACCEPTED rejected due to missing evidence precondition.');

    // 4. Ingest Evidence Record, Accept Evidence, and Transition to RESEARCH_ACCEPTED
    console.log('\nTest 4: Ingesting Evidence Record and Transitioning to RESEARCH_ACCEPTED...');
    const evAddRes = await fetch(`${baseUrl}/api/evidence`, {
      method: 'POST',
      headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerAmzCookie },
      body: JSON.stringify({ projectId, seedPhrase: 'mom sweatshirt', source: 'HELIUM10_XRAY_OBSERVED', fileName: 'xray_report.csv' })
    });
    assert.strictEqual(evAddRes.status, 200);
    const evAddData = await evAddRes.json();

    const acceptRes = await fetch(`${baseUrl}/api/evidence/${evAddData.evidenceId}/accept`, {
      method: 'POST',
      headers: { ...origin, Cookie: ownerAmzCookie }
    });
    assert.strictEqual(acceptRes.status, 200);

    const validTransRes = await fetch(`${baseUrl}/api/projects/${projectId}/transition`, {
      method: 'PATCH',
      headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerAmzCookie },
      body: JSON.stringify({ targetState: 'RESEARCH_ACCEPTED' })
    });
    assert.strictEqual(validTransRes.status, 200);
    const validTransData = await validTransRes.json();
    assert.strictEqual(validTransData.state, 'RESEARCH_ACCEPTED');
    console.log('  🟢 Valid sequential transition to RESEARCH_ACCEPTED succeeded.');

    // 5. Test Cross-Marketplace IDOR Isolation (Etsy session -> Amazon project)
    console.log('\nTest 5: Testing Cross-Marketplace IDOR Isolation (Etsy session -> Amazon project)...');
    const idorRes = await fetch(`${baseUrl}/api/projects/${projectId}/transition`, {
      method: 'PATCH',
      headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerEtsyCookie },
      body: JSON.stringify({ targetState: 'DNA_ACCEPTED' })
    });
    assert.strictEqual(idorRes.status, 404, `Cross-marketplace project access must return 404 IDOR-safe, got ${idorRes.status}`);
    console.log('  🟢 Cross-marketplace project mutation rejected with HTTP 404 IDOR-safe.');

    // 6. Test Role Gate Check (SELLER role attempting MANAGER_APPROVED)
    console.log('\nTest 6: Testing Role Gate Check (SELLER role attempting MANAGER_APPROVED)...');
    await new Promise(r => db.run("INSERT INTO market_trends (category, trending_keywords, marketplace, tenant_id, workspace_id, project_id) VALUES ('Sweatshirt', 'mom, gift', 'AMAZON', ?, ?, ?)", [ownerAmzFixture.tenant_id, ownerAmzFixture.workspace_id, projectId], r));

    await fetch(`${baseUrl}/api/projects/${projectId}/transition`, { method: 'PATCH', headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerAmzCookie }, body: JSON.stringify({ targetState: 'DNA_ACCEPTED' }) });
    await fetch(`${baseUrl}/api/projects/${projectId}/transition`, { method: 'PATCH', headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerAmzCookie }, body: JSON.stringify({ targetState: 'MKL_FROZEN' }) });
    await fetch(`${baseUrl}/api/projects/${projectId}/transition`, { method: 'PATCH', headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerAmzCookie }, body: JSON.stringify({ targetState: 'PRODUCT_TRUTH_CONFIRMED', productTruthNotes: '100% Cotton 8oz Sweatshirt verified' }) });
    await fetch(`${baseUrl}/api/projects/${projectId}/transition`, { method: 'PATCH', headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerAmzCookie }, body: JSON.stringify({ targetState: 'DRAFT_GENERATED' }) });
    await fetch(`${baseUrl}/api/projects/${projectId}/transition`, { method: 'PATCH', headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerAmzCookie }, body: JSON.stringify({ targetState: 'VALIDATED' }) });

    const sellerApproveRes = await fetch(`${baseUrl}/api/projects/${projectId}/transition`, {
      method: 'PATCH',
      headers: { ...origin, 'Content-Type': 'application/json', Cookie: sellerAmzCookie },
      body: JSON.stringify({ targetState: 'MANAGER_APPROVED' })
    });
    assert.strictEqual(sellerApproveRes.status, 403, `Seller role attempting MANAGER_APPROVED must return 403, got ${sellerApproveRes.status}`);
    const sellerApproveData = await sellerApproveRes.json();
    assert.strictEqual(sellerApproveData.error, 'FORBIDDEN_ROLE_FOR_STAGE');
    console.log('  🟢 SELLER role correctly denied 403 when attempting MANAGER_APPROVED stage.');

    // 7. Test Sliding-Window Rate Limiter Unit Failsafe
    console.log('\nTest 7: Testing Sliding-Window Rate Limiter Logic...');
    const testLimiter = createRateLimiter({ windowMs: 1000, maxHits: 3, ignoreTestEnv: false, failOnly: false });
    const reqMock = { ip: '1.2.3.4', path: '/test-limit', headers: {}, socket: {} };
    let rateLimited = false;

    for (let i = 0; i < 5; i++) {
      const resMock = {
        setHeader: () => {},
        status: (code) => {
          if (code === 429) rateLimited = true;
          return { json: () => {} };
        }
      };
      testLimiter(reqMock, resMock, () => {});
    }
    assert.strictEqual(rateLimited, true, 'Rate limiter must trigger 429 when maxHits exceeded');
    console.log('  🟢 Sliding-window rate limiter triggered HTTP 429 cleanly.');

    console.log('\n================================================================');
    console.log('  🟢 ALL WORKFLOW STATE MACHINE & SECURITY TESTS PASSED CLEANLY');
    console.log('================================================================\n');
  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error('🔴 WORKFLOW TEST SUITE FAILED:', err);
  process.exit(1);
});
