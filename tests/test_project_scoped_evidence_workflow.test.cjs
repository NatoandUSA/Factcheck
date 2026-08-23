const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';

const { app, db, databaseReady } = require('../server/server');
const { createSessionRecord } = require('../server/security/session');
const { createRateLimiter } = require('../server/security/rateLimiter');
const { deriveXrayUploadOutcome } = require('../src/utils/xrayUploadOutcome.cjs');

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
    if (hasOwnerAmz && hasSellerAmz) return rows;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for test fixtures');
}

async function runTests() {
  await databaseReady;
  const fixtures = await waitForTestFixtures();
  
  const ownerAmzFixture = fixtures.find(f => f.role === 'OWNER' && f.marketplace === 'AMAZON');
  const sellerAmzFixture = fixtures.find(f => f.role === 'SELLER' && f.marketplace === 'AMAZON');

  assert(ownerAmzFixture && sellerAmzFixture, 'Required test fixtures missing');

  console.log('================================================================');
  console.log('  TESTING PROJECT-SCOPED EVIDENCE WORKFLOW (AGGREGATE ROOT) SUITE');
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

    const ownerCookie = `omni_session=${ownerAmzSession.rawToken}`;
    const sellerCookie = `omni_session=${sellerAmzSession.rawToken}`;

    // Test 1: Verify ESM single source of truth for Xray decision function
    console.log('Test 1: Testing ESM / CJS single source of truth for Xray outcome...');
    const esmContent = fs.readFileSync(path.join(__dirname, '../src/utils/xrayUploadOutcome.js'), 'utf8');
    assert.ok(esmContent.includes('export function deriveXrayUploadOutcome'));
    const testResult = deriveXrayUploadOutcome({ ok: true, data: { success: true, isXray: true, batches: [{ batchName: 'B1', asins: ['B01'] }] } });
    assert.strictEqual(testResult.status, 'SUCCESS');
    console.log('  🟢 ESM/CJS single source of truth verified cleanly.');

    // Test 2: Create Project A and Project B
    console.log('\nTest 2: Creating Project A and Project B...');
    const projARes = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({ name: 'Project A (Mom Sweatshirt)', seedPhrase: 'mom sweatshirt' })
    });
    const projAData = await projARes.json();
    const projAId = projAData.projectId;

    const projBRes = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({ name: 'Project B (Nurse Sweatshirt)', seedPhrase: 'nurse sweatshirt' })
    });
    const projBData = await projBRes.json();
    const projBId = projBData.projectId;

    console.log(`  🟢 Project A (#${projAId}) and Project B (#${projBId}) created.`);

    // Test 3: Ingest evidence for Project A only
    console.log('\nTest 3: Ingesting OBSERVED evidence for Project A...');
    const evARes = await fetch(`${baseUrl}/api/evidence`, {
      method: 'POST',
      headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({ projectId: projAId, seedPhrase: 'mom sweatshirt', source: 'H10_XRAY_OBSERVED' })
    });
    const evAData = await evARes.json();
    const evAId = evAData.evidenceId;
    console.log(`  🟢 Evidence #${evAId} created for Project A.`);

    // Test 4: Attempt to transition Project A to RESEARCH_ACCEPTED with only OBSERVED evidence -> Must Fail
    console.log('\nTest 4: Attempting transition to RESEARCH_ACCEPTED with OBSERVED evidence (not ACCEPTED)...');
    const transObsRes = await fetch(`${baseUrl}/api/projects/${projAId}/transition`, {
      method: 'PATCH',
      headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({ targetState: 'RESEARCH_ACCEPTED' })
    });
    assert.strictEqual(transObsRes.status, 400);
    const transObsData = await transObsRes.json();
    assert.strictEqual(transObsData.error, 'MISSING_QUALIFYING_EVIDENCE_PRECONDITION');
    console.log('  🟢 Transition rejected: OBSERVED evidence cannot unlock RESEARCH_ACCEPTED.');

    // Test 5: Role Gate Check for Evidence Acceptance: SELLER role attempting to accept evidence -> 403
    console.log('\nTest 5: Testing Role Gate: SELLER role accepting evidence...');
    const sellerAcceptRes = await fetch(`${baseUrl}/api/evidence/${evAId}/accept`, {
      method: 'POST',
      headers: { ...origin, Cookie: sellerCookie }
    });
    assert.strictEqual(sellerAcceptRes.status, 403, `SELLER role evidence accept should be 403, got ${sellerAcceptRes.status}`);
    console.log('  🟢 SELLER role correctly denied 403 when attempting to accept evidence.');

    // Test 6: OWNER role accepts evidence for Project A
    console.log('\nTest 6: OWNER role accepting evidence for Project A...');
    const ownerAcceptRes = await fetch(`${baseUrl}/api/evidence/${evAId}/accept`, {
      method: 'POST',
      headers: { ...origin, Cookie: ownerCookie }
    });
    assert.strictEqual(ownerAcceptRes.status, 200);
    console.log('  🟢 OWNER role successfully accepted evidence for Project A.');

    // Test 7: Project B transition attempt to RESEARCH_ACCEPTED -> Must fail because Project B has zero evidence!
    console.log('\nTest 7: Attempting Project B transition using Project A evidence (Isolation Check)...');
    const projBTransRes = await fetch(`${baseUrl}/api/projects/${projBId}/transition`, {
      method: 'PATCH',
      headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({ targetState: 'RESEARCH_ACCEPTED' })
    });
    assert.strictEqual(projBTransRes.status, 400);
    const projBTransData = await projBTransRes.json();
    assert.strictEqual(projBTransData.error, 'MISSING_QUALIFYING_EVIDENCE_PRECONDITION');
    console.log('  🟢 Project B transition correctly rejected: Evidence of Project A cannot unlock Project B.');

    // Test 8: Project A transition to RESEARCH_ACCEPTED -> Must Succeed!
    console.log('\nTest 8: Transitioning Project A to RESEARCH_ACCEPTED with ACCEPTED evidence...');
    const projATransRes = await fetch(`${baseUrl}/api/projects/${projAId}/transition`, {
      method: 'PATCH',
      headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({ targetState: 'RESEARCH_ACCEPTED' })
    });
    assert.strictEqual(projATransRes.status, 200);
    const projATransData = await projATransRes.json();
    assert.strictEqual(projATransData.state, 'RESEARCH_ACCEPTED');
    console.log('  🟢 Project A transitioned to RESEARCH_ACCEPTED successfully.');

    // Test 9: Test auth login rate limiter failOnly policy logic
    console.log('\nTest 9: Testing login rate limiter failOnly policy...');
    const failOnlyLimiter = createRateLimiter({ windowMs: 1000, maxHits: 2, failOnly: true, ignoreTestEnv: false });
    const reqMock = { ip: '1.1.1.1', path: '/api/auth/login', headers: {}, socket: {} };
    let limited = false;

    for (let i = 0; i < 5; i++) {
      const resMock = {
        statusCode: 200, // Successful login!
        setHeader: () => {},
        on: (event, fn) => { if (event === 'finish') fn(); },
        status: (c) => { if (c === 429) limited = true; return { json: () => {} }; }
      };
      failOnlyLimiter(reqMock, resMock, () => {});
    }
    assert.strictEqual(limited, false, 'Successful logins must not trigger rate limit when failOnly is true');
    console.log('  🟢 Rate limiter failOnly policy verified: successful logins do not consume quota.');

    console.log('\n================================================================');
    console.log('  🟢 ALL PROJECT-SCOPED WORKFLOW & AGGREGATE ROOT TESTS PASSED CLEANLY');
    console.log('================================================================\n');
  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error('🔴 PROJECT-SCOPED WORKFLOW TEST SUITE FAILED:', err);
  process.exit(1);
});
