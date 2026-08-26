const assert = require('assert');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';

const { app, db, databaseReady } = require('../server/server');
const { createSessionRecord } = require('../server/security/session');
const { createRateLimiter } = require('../server/security/rateLimiter');
const { deriveXrayUploadOutcome } = require('../src/utils/xrayUploadOutcome.cjs');
const { deriveControlledEvidenceEnvelope } = require('../server/evidenceAuthority');

function dbAll(sql, params = []) { return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows))); }
function dbRun(sql, params = []) { return new Promise((resolve, reject) => db.run(sql, params, function(err) { err ? reject(err) : resolve({ lastID: this.lastID, changes: this.changes }); })); }
function createSession(userId, workspaceId, tenantId) { return new Promise((resolve, reject) => createSessionRecord(db, userId, workspaceId, tenantId, (err, session) => err ? reject(err) : resolve(session))); }

async function waitForTestFixtures(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await dbAll(`SELECT u.id as user_id, w.tenant_id, wm.workspace_id, wm.role, w.marketplace
      FROM workspace_memberships wm JOIN users u ON u.id = wm.user_id JOIN workspaces w ON w.id = wm.workspace_id ORDER BY wm.workspace_id`);
    if (rows.some(f => f.role === 'OWNER' && f.marketplace === 'AMAZON') && rows.some(f => f.role === 'SELLER' && f.marketplace === 'AMAZON')) return rows;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for test fixtures');
}

async function insertControlledEvidence(fixture, projectId, seedPhrase) {
  const envelope = deriveControlledEvidenceEnvelope({
    provider: 'H10_MCP', payload: { rows: [{ asin: 'B0AUTHOR01', rank: 1 }] },
    scope: { tenantId: fixture.tenant_id, workspaceId: fixture.workspace_id, marketplace: 'AMAZON', projectId, evidenceVersion: 1 }
  });
  const row = await dbRun(`INSERT INTO research_evidence
    (tenant_id, workspace_id, marketplace, project_id, seed_phrase, source, actor_id, evidence_state, metadata)
    VALUES (?, ?, 'AMAZON', ?, ?, 'MCP_RETRIEVAL', ?, 'OBSERVED', ?)`,
    [fixture.tenant_id, fixture.workspace_id, projectId, seedPhrase, fixture.user_id, JSON.stringify(envelope.metadata)]);
  return row.lastID;
}

async function runTests() {
  await databaseReady;
  const fixtures = await waitForTestFixtures();
  const owner = fixtures.find(f => f.role === 'OWNER' && f.marketplace === 'AMAZON');
  const seller = fixtures.find(f => f.role === 'SELLER' && f.marketplace === 'AMAZON');
  assert(owner && seller, 'Required test fixtures missing');

  console.log('================================================================');
  console.log('  TESTING PROJECT-SCOPED EVIDENCE WORKFLOW (AGGREGATE ROOT) SUITE');
  console.log('================================================================\n');

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const origin = { Origin: `http://127.0.0.1:${port}` };
  process.env.ALLOWED_ORIGINS = `http://127.0.0.1:${port},http://localhost:${port}`;

  try {
    const ownerSession = await createSession(owner.user_id, owner.workspace_id, owner.tenant_id);
    const sellerSession = await createSession(seller.user_id, seller.workspace_id, seller.tenant_id);
    const ownerCookie = `omni_session=${ownerSession.rawToken}`;
    const sellerCookie = `omni_session=${sellerSession.rawToken}`;

    console.log('Test 1: Testing ESM / CJS single source of truth for Xray outcome...');
    const esmContent = fs.readFileSync(path.join(__dirname, '../src/utils/xrayUploadOutcome.js'), 'utf8');
    assert.ok(esmContent.includes('export function deriveXrayUploadOutcome'));
    assert.strictEqual(deriveXrayUploadOutcome({ ok: true, data: { success: true, isXray: true, batches: [{ batchName: 'B1', asins: ['B01'] }] } }).status, 'SUCCESS');

    console.log('\nTest 2: Creating Project A and Project B...');
    const projAData = await (await fetch(`${baseUrl}/api/projects`, { method: 'POST', headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerCookie }, body: JSON.stringify({ name: 'Project A (Mom Sweatshirt)', seedPhrase: 'mom sweatshirt' }) })).json();
    const projBData = await (await fetch(`${baseUrl}/api/projects`, { method: 'POST', headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerCookie }, body: JSON.stringify({ name: 'Project B (Nurse Sweatshirt)', seedPhrase: 'nurse sweatshirt' }) })).json();
    const projAId = projAData.projectId;
    const projBId = projBData.projectId;
    assert.ok(projAId && projBId);

    console.log('\nTest 3: Generic H10 ingest remains OBSERVED/non-authority...');
    const evARes = await fetch(`${baseUrl}/api/evidence`, { method: 'POST', headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerCookie }, body: JSON.stringify({ projectId: projAId, seedPhrase: 'mom sweatshirt', source: 'H10_XRAY_OBSERVED', metadata: { kind: 'SMART_PULL_ARTIFACT_V1', provider: 'H10_MCP', evidenceState: 'VERIFIED_RETRIEVED', contentHash: 'b'.repeat(64), authority: 'SERVER_PROVIDER' } }) });
    assert.strictEqual(evARes.status, 200);
    const evAId = (await evARes.json()).evidenceId;

    console.log('\nTest 4: OBSERVED/non-authority cannot unlock RESEARCH_ACCEPTED...');
    const transObsRes = await fetch(`${baseUrl}/api/projects/${projAId}/transition`, { method: 'PATCH', headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerCookie }, body: JSON.stringify({ targetState: 'RESEARCH_ACCEPTED' }) });
    assert.strictEqual(transObsRes.status, 400);
    assert.strictEqual((await transObsRes.json()).error, 'MISSING_QUALIFYING_EVIDENCE_PRECONDITION');

    console.log('\nTest 5: SELLER cannot accept evidence...');
    const sellerAcceptRes = await fetch(`${baseUrl}/api/evidence/${evAId}/accept`, { method: 'POST', headers: { ...origin, Cookie: sellerCookie } });
    assert.strictEqual(sellerAcceptRes.status, 403);

    console.log('\nTest 6: OWNER cannot accept generic forged H10; rejection creates zero event...');
    const eventCountBefore = (await dbAll('SELECT id FROM evidence_acceptance_events WHERE evidence_id = ?', [evAId])).length;
    const ownerRejectRes = await fetch(`${baseUrl}/api/evidence/${evAId}/accept`, { method: 'POST', headers: { ...origin, Cookie: ownerCookie } });
    assert.strictEqual(ownerRejectRes.status, 409);
    assert.strictEqual((await ownerRejectRes.json()).error, 'UNQUALIFIED_EVIDENCE_AUTHORITY');
    assert.strictEqual((await dbAll('SELECT id FROM evidence_acceptance_events WHERE evidence_id = ?', [evAId])).length, eventCountBefore);
    assert.strictEqual((await dbAll('SELECT evidence_state FROM research_evidence WHERE id = ?', [evAId]))[0].evidence_state, 'OBSERVED');

    console.log('\nTest 7: Wrong project scope fails closed with zero evidence write...');
    const countBeforeWrongScope = (await dbAll('SELECT id FROM research_evidence')).length;
    const wrongScopeRes = await fetch(`${baseUrl}/api/evidence`, { method: 'POST', headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerCookie }, body: JSON.stringify({ projectId: 99999999, seedPhrase: 'wrong', source: 'MANUAL' }) });
    assert.strictEqual(wrongScopeRes.status, 404);
    assert.strictEqual((await dbAll('SELECT id FROM research_evidence')).length, countBeforeWrongScope);

    console.log('\nTest 8: Project B cannot use Project A evidence...');
    const projBTransRes = await fetch(`${baseUrl}/api/projects/${projBId}/transition`, { method: 'PATCH', headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerCookie }, body: JSON.stringify({ targetState: 'RESEARCH_ACCEPTED' }) });
    assert.strictEqual(projBTransRes.status, 400);
    assert.strictEqual((await projBTransRes.json()).error, 'MISSING_QUALIFYING_EVIDENCE_PRECONDITION');

    console.log('\nTest 9: Controlled provider evidence can be accepted and unlock Project A...');
    const controlledId = await insertControlledEvidence(owner, projAId, 'mom sweatshirt');
    const ownerAcceptRes = await fetch(`${baseUrl}/api/evidence/${controlledId}/accept`, { method: 'POST', headers: { ...origin, Cookie: ownerCookie } });
    assert.strictEqual(ownerAcceptRes.status, 200);
    const projATransRes = await fetch(`${baseUrl}/api/projects/${projAId}/transition`, { method: 'PATCH', headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerCookie }, body: JSON.stringify({ targetState: 'RESEARCH_ACCEPTED' }) });
    assert.strictEqual(projATransRes.status, 200);
    assert.strictEqual((await projATransRes.json()).state, 'RESEARCH_ACCEPTED');

    console.log('\nTest 10: Testing login rate limiter failOnly policy...');
    const failOnlyLimiter = createRateLimiter({ windowMs: 1000, maxHits: 2, failOnly: true, ignoreTestEnv: false });
    const reqMock = { ip: '1.1.1.1', path: '/api/auth/login', headers: {}, socket: {} };
    let limited = false;
    for (let i = 0; i < 5; i++) {
      const resMock = { statusCode: 200, setHeader: () => {}, on: (event, fn) => { if (event === 'finish') fn(); }, status: c => { if (c === 429) limited = true; return { json: () => {} }; } };
      failOnlyLimiter(reqMock, resMock, () => {});
    }
    assert.strictEqual(limited, false);

    console.log('\n================================================================');
    console.log('  🟢 ALL PROJECT-SCOPED WORKFLOW & H0 AUTHORITY TESTS PASSED CLEANLY');
    console.log('================================================================\n');
  } finally { server.close(); }
}

runTests().catch(err => { console.error('🔴 PROJECT-SCOPED WORKFLOW TEST SUITE FAILED:', err); process.exit(1); });
