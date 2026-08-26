const assert = require('assert');

process.env.NODE_ENV = 'test';

const { app, db, databaseReady } = require('../server/server');
const { createSessionRecord } = require('../server/security/session');
const { createRateLimiter } = require('../server/security/rateLimiter');
const { deriveControlledEvidenceEnvelope } = require('../server/evidenceAuthority');

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function(err) { err ? reject(err) : resolve({ lastID: this.lastID, changes: this.changes }); }));
}
function createSession(userId, workspaceId, tenantId) {
  return new Promise((resolve, reject) => createSessionRecord(db, userId, workspaceId, tenantId, (err, session) => err ? reject(err) : resolve(session)));
}
async function waitForTestFixtures(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await dbAll(`SELECT u.id as user_id, w.tenant_id, wm.workspace_id, wm.role, w.marketplace
      FROM workspace_memberships wm JOIN users u ON u.id = wm.user_id JOIN workspaces w ON w.id = wm.workspace_id ORDER BY wm.workspace_id`);
    if (rows.some(f => f.role === 'OWNER' && f.marketplace === 'AMAZON') && rows.some(f => f.role === 'SELLER' && f.marketplace === 'AMAZON') && rows.some(f => f.role === 'OWNER' && f.marketplace === 'ETSY')) return rows;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for test fixtures');
}

async function insertControlledEvidence(fixture, projectId, seedPhrase) {
  const envelope = deriveControlledEvidenceEnvelope({
    provider: 'H10_MCP',
    payload: { rows: [{ asin: 'B0CONTROL1', rank: 1 }] },
    scope: { tenantId: fixture.tenant_id, workspaceId: fixture.workspace_id, marketplace: 'AMAZON', projectId, evidenceVersion: 1 }
  });
  const inserted = await dbRun(`INSERT INTO research_evidence
    (tenant_id, workspace_id, marketplace, project_id, seed_phrase, source, actor_id, evidence_state, metadata)
    VALUES (?, ?, 'AMAZON', ?, ?, 'MCP_RETRIEVAL', ?, 'OBSERVED', ?)`,
    [fixture.tenant_id, fixture.workspace_id, projectId, seedPhrase, fixture.user_id, JSON.stringify(envelope.metadata)]);
  return inserted.lastID;
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

    console.log('Test 1: Creating new Amazon Research Project...');
    const createRes = await fetch(`${baseUrl}/api/projects`, { method: 'POST', headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerAmzCookie }, body: JSON.stringify({ name: 'Amazon Summer Sweatshirt Project', seedPhrase: 'mom sweatshirt', referenceAsin: 'B0CPHXX2ZF' }) });
    assert.strictEqual(createRes.status, 200);
    const createData = await createRes.json();
    assert.strictEqual(createData.state, 'EVIDENCE_INTAKE');
    const projectId = createData.projectId;
    console.log(`  🟢 Project #${projectId} created in state EVIDENCE_INTAKE.`);

    console.log('\nTest 2: Testing Illegal Transition Jump...');
    const jumpRes = await fetch(`${baseUrl}/api/projects/${projectId}/transition`, { method: 'PATCH', headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerAmzCookie }, body: JSON.stringify({ targetState: 'PUBLISH_READY' }) });
    assert.strictEqual(jumpRes.status, 400);
    assert.strictEqual((await jumpRes.json()).error, 'INVALID_STATE_TRANSITION');

    console.log('\nTest 3: Testing Missing Evidence Precondition...');
    const noEvRes = await fetch(`${baseUrl}/api/projects/${projectId}/transition`, { method: 'PATCH', headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerAmzCookie }, body: JSON.stringify({ targetState: 'RESEARCH_ACCEPTED' }) });
    assert.strictEqual(noEvRes.status, 400);
    assert.strictEqual((await noEvRes.json()).error, 'MISSING_QUALIFYING_EVIDENCE_PRECONDITION');

    console.log('\nTest 4a: Forged generic H10 authority metadata is rejected at intake with zero writes...');
    const forgedEvidenceBefore = (await dbAll('SELECT id FROM research_evidence WHERE project_id = ?', [projectId])).length;
    const forgedEventsBefore = (await dbAll('SELECT id FROM evidence_acceptance_events')).length;
    const forgedRes = await fetch(`${baseUrl}/api/evidence`, { method: 'POST', headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerAmzCookie }, body: JSON.stringify({ projectId, seedPhrase: 'mom sweatshirt', source: 'HELIUM10_XRAY_OBSERVED', fileName: 'xray_report.csv', metadata: { kind: 'SMART_PULL_ARTIFACT_V1', authority: 'SERVER_PROVIDER', provider: 'H10_MCP', contentHash: 'a'.repeat(64), evidenceState: 'VERIFIED_RETRIEVED' } }) });
    assert.strictEqual(forgedRes.status, 400);
    assert.strictEqual((await forgedRes.json()).error, 'CLIENT_AUTHORITY_METADATA_FORBIDDEN');
    assert.strictEqual((await dbAll('SELECT id FROM research_evidence WHERE project_id = ?', [projectId])).length, forgedEvidenceBefore);
    assert.strictEqual((await dbAll('SELECT id FROM evidence_acceptance_events')).length, forgedEventsBefore);

    console.log('\nTest 4b: Clean generic H10 evidence persists research-only; acceptance is rejected with zero event...');
    const evAddRes = await fetch(`${baseUrl}/api/evidence`, { method: 'POST', headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerAmzCookie }, body: JSON.stringify({ projectId, seedPhrase: 'mom sweatshirt', source: 'HELIUM10_XRAY_OBSERVED', fileName: 'xray_report.csv', metadata: { note: 'ordinary research-only H10 evidence' } }) });
    assert.strictEqual(evAddRes.status, 200);
    const evAddData = await evAddRes.json();
    const eventsBefore = (await dbAll('SELECT id FROM evidence_acceptance_events WHERE evidence_id = ?', [evAddData.evidenceId])).length;
    const acceptRejected = await fetch(`${baseUrl}/api/evidence/${evAddData.evidenceId}/accept`, { method: 'POST', headers: { ...origin, Cookie: ownerAmzCookie } });
    assert.strictEqual(acceptRejected.status, 409);
    assert.strictEqual((await acceptRejected.json()).error, 'UNQUALIFIED_EVIDENCE_AUTHORITY');
    const rejectedRow = (await dbAll('SELECT evidence_state, metadata FROM research_evidence WHERE id = ?', [evAddData.evidenceId]))[0];
    assert.strictEqual(rejectedRow.evidence_state, 'OBSERVED');
    assert.strictEqual((await dbAll('SELECT id FROM evidence_acceptance_events WHERE evidence_id = ?', [evAddData.evidenceId])).length, eventsBefore);
    const rejectedMetadata = JSON.parse(rejectedRow.metadata);
    assert.strictEqual(rejectedMetadata.authority, 'NON_AUTHORITY');
    assert.strictEqual(rejectedMetadata.kind, 'GENERIC_NON_AUTHORITY_V1');

    const controlledEvidenceId = await insertControlledEvidence(ownerAmzFixture, projectId, 'mom sweatshirt');
    const acceptRes = await fetch(`${baseUrl}/api/evidence/${controlledEvidenceId}/accept`, { method: 'POST', headers: { ...origin, Cookie: ownerAmzCookie } });
    assert.strictEqual(acceptRes.status, 200);
    const validTransRes = await fetch(`${baseUrl}/api/projects/${projectId}/transition`, { method: 'PATCH', headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerAmzCookie }, body: JSON.stringify({ targetState: 'RESEARCH_ACCEPTED' }) });
    assert.strictEqual(validTransRes.status, 200);
    assert.strictEqual((await validTransRes.json()).state, 'RESEARCH_ACCEPTED');
    console.log('  🟢 Forged intake rejected; clean generic accept gate preserved; controlled authority unlocks transition.');

    console.log('\nTest 5: Testing Cross-Marketplace IDOR Isolation...');
    const idorRes = await fetch(`${baseUrl}/api/projects/${projectId}/transition`, { method: 'PATCH', headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerEtsyCookie }, body: JSON.stringify({ targetState: 'DNA_ACCEPTED' }) });
    assert.strictEqual(idorRes.status, 404);

    console.log('\nTest 6: Testing Role Gate Check...');
    await dbRun("INSERT INTO market_trends (category, trending_keywords, marketplace, tenant_id, workspace_id, project_id) VALUES ('Sweatshirt', 'mom, gift', 'AMAZON', ?, ?, ?)", [ownerAmzFixture.tenant_id, ownerAmzFixture.workspace_id, projectId]);
    await fetch(`${baseUrl}/api/projects/${projectId}/transition`, { method: 'PATCH', headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerAmzCookie }, body: JSON.stringify({ targetState: 'DNA_ACCEPTED' }) });
    await fetch(`${baseUrl}/api/projects/${projectId}/transition`, { method: 'PATCH', headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerAmzCookie }, body: JSON.stringify({ targetState: 'MKL_FROZEN' }) });
    await fetch(`${baseUrl}/api/projects/${projectId}/transition`, { method: 'PATCH', headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerAmzCookie }, body: JSON.stringify({ targetState: 'PRODUCT_TRUTH_CONFIRMED', productTruthNotes: '100% Cotton 8oz Sweatshirt verified' }) });
    await fetch(`${baseUrl}/api/projects/${projectId}/transition`, { method: 'PATCH', headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerAmzCookie }, body: JSON.stringify({ targetState: 'DRAFT_GENERATED' }) });
    await fetch(`${baseUrl}/api/projects/${projectId}/transition`, { method: 'PATCH', headers: { ...origin, 'Content-Type': 'application/json', Cookie: ownerAmzCookie }, body: JSON.stringify({ targetState: 'VALIDATED' }) });
    const sellerApproveRes = await fetch(`${baseUrl}/api/projects/${projectId}/transition`, { method: 'PATCH', headers: { ...origin, 'Content-Type': 'application/json', Cookie: sellerAmzCookie }, body: JSON.stringify({ targetState: 'MANAGER_APPROVED' }) });
    assert.strictEqual(sellerApproveRes.status, 403);
    assert.strictEqual((await sellerApproveRes.json()).error, 'FORBIDDEN_ROLE_FOR_STAGE');

    console.log('\nTest 7: Testing Sliding-Window Rate Limiter Logic...');
    const testLimiter = createRateLimiter({ windowMs: 1000, maxHits: 3, ignoreTestEnv: false, failOnly: false });
    const reqMock = { ip: '1.2.3.4', path: '/test-limit', headers: {}, socket: {} };
    let rateLimited = false;
    for (let i = 0; i < 5; i++) {
      const resMock = { setHeader: () => {}, status: code => { if (code === 429) rateLimited = true; return { json: () => {} }; } };
      testLimiter(reqMock, resMock, () => {});
    }
    assert.strictEqual(rateLimited, true);

    console.log('\n================================================================');
    console.log('  🟢 ALL WORKFLOW STATE MACHINE & SECURITY TESTS PASSED CLEANLY');
    console.log('================================================================\n');
  } finally { server.close(); }
}

runTests().catch(err => { console.error('🔴 WORKFLOW TEST SUITE FAILED:', err); process.exit(1); });
