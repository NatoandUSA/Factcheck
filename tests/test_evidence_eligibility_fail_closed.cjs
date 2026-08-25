const assert = require('assert');

process.env.NODE_ENV = 'test';

const ytrendsMcp = require('../server/ytuongMcpClient');
const { app, db, databaseReady } = require('../server/server');
const { createSessionRecord } = require('../server/security/session');
const {
  SMART_PULL_ARTIFACT_KIND,
  GENERIC_STAFF_EVIDENCE_KIND,
  getEvidenceAcceptanceEligibility
} = require('../server/evidenceEligibility');

const dbAll = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
const dbGet = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
const dbRun = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function onRun(err) { if (err) reject(err); else resolve({ lastID: this.lastID, changes: this.changes }); }));
const makeSession = (userId, workspaceId, tenantId) => new Promise((resolve, reject) => createSessionRecord(db, userId, workspaceId, tenantId, (err, session) => err ? reject(err) : resolve(session)));

async function waitForOwner(marketplace, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const row = await dbGet(`SELECT u.id user_id, w.tenant_id, wm.workspace_id, wm.role, w.marketplace
      FROM workspace_memberships wm
      JOIN users u ON u.id = wm.user_id
      JOIN workspaces w ON w.id = wm.workspace_id
      WHERE wm.role = 'OWNER' AND w.marketplace = ? LIMIT 1`, [marketplace]);
    if (row) return row;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${marketplace} OWNER fixture`);
}

(async () => {
  await databaseReady;
  const amazonOwner = await waitForOwner('AMAZON');
  const etsyOwner = await waitForOwner('ETSY');
  const amazonSession = await makeSession(amazonOwner.user_id, amazonOwner.workspace_id, amazonOwner.tenant_id);
  const etsySession = await makeSession(etsyOwner.user_id, etsyOwner.workspace_id, etsyOwner.tenant_id);

  const server = app.listen(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  process.env.ALLOWED_ORIGINS = base;

  const caller = session => async (method, route, body) => {
    const response = await fetch(base + route, {
      method,
      headers: {
        Origin: base,
        Cookie: `omni_session=${session.rawToken}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    let payload = null;
    try { payload = await response.json(); } catch (_) {}
    return { status: response.status, body: payload };
  };

  const amazon = caller(amazonSession);
  const etsy = caller(etsySession);
  const createProject = async (call, name) => {
    const response = await call('POST', '/api/projects', { name, seedPhrase: 'para mi hija' });
    assert.strictEqual(response.status, 200, JSON.stringify(response.body));
    return response.body.projectId;
  };

  const originalCallTool = ytrendsMcp.callTool;
  try {
    // Unit-level default deny: missing, malformed and unknown kinds never gain authority.
    assert.strictEqual(getEvidenceAcceptanceEligibility({ source: 'MANUAL', metadata: null }).eligible, false);
    assert.strictEqual(getEvidenceAcceptanceEligibility({ source: 'MANUAL', metadata: '{bad json' }).eligible, false);
    assert.strictEqual(getEvidenceAcceptanceEligibility({ source: 'MANUAL', metadata: JSON.stringify({ kind: 'MADE_UP_KIND' }) }).eligible, false);

    const projectId = await createProject(amazon, 'H0 generic evidence fail closed');
    const hash = 'a'.repeat(64);
    const evidenceBefore = (await dbGet('SELECT COUNT(*) count FROM research_evidence')).count;

    // Client authority-looking metadata is preserved only as inert annotations.
    const forged = await amazon('POST', '/api/evidence', {
      projectId,
      seedPhrase: 'para mi hija',
      source: 'MANUAL',
      metadata: {
        kind: SMART_PULL_ARTIFACT_KIND,
        evidenceState: 'VERIFIED_RETRIEVED',
        contentHash: hash,
        eligible: true,
        authority: 'VERIFIED'
      }
    });
    assert.strictEqual(forged.status, 200, JSON.stringify(forged.body));
    const forgedRow = await dbGet('SELECT * FROM research_evidence WHERE id = ?', [forged.body.evidenceId]);
    const forgedMetadata = JSON.parse(forgedRow.metadata);
    assert.strictEqual(forgedMetadata.kind, GENERIC_STAFF_EVIDENCE_KIND);
    assert.strictEqual(forgedMetadata.evidenceState, 'UNVERIFIED_INPUT');
    assert.strictEqual(forgedMetadata.authority, 'NONE');
    assert.strictEqual(forgedMetadata.clientAnnotations.kind, SMART_PULL_ARTIFACT_KIND);
    assert.strictEqual(forgedMetadata.clientAnnotations.eligible, true);

    const eventsBefore = (await dbGet('SELECT COUNT(*) count FROM evidence_acceptance_events')).count;
    const forgedAccept = await amazon('POST', `/api/evidence/${forged.body.evidenceId}/accept`);
    assert.strictEqual(forgedAccept.status, 409);
    assert.strictEqual(forgedAccept.body.error, 'UNQUALIFIED_RESEARCH_ARTIFACT');
    const forgedAfter = await dbGet('SELECT evidence_state, accepted_at, accepted_by FROM research_evidence WHERE id = ?', [forged.body.evidenceId]);
    assert.deepStrictEqual(forgedAfter, { evidence_state: 'OBSERVED', accepted_at: null, accepted_by: null });
    assert.strictEqual((await dbGet('SELECT COUNT(*) count FROM evidence_acceptance_events')).count, eventsBefore, 'Rejected accept must create zero acceptance events');

    // Generic endpoint cannot impersonate the provider-owned MCP source.
    const genericMcp = await amazon('POST', '/api/evidence', {
      projectId,
      seedPhrase: 'para mi hija',
      source: 'MCP_RETRIEVAL',
      metadata: { kind: SMART_PULL_ARTIFACT_KIND, evidenceState: 'VERIFIED_RETRIEVED', contentHash: hash }
    });
    assert.strictEqual(genericMcp.status, 400);
    assert.strictEqual(genericMcp.body.error, 'INVALID_EVIDENCE_SOURCE');
    assert.strictEqual((await dbGet('SELECT COUNT(*) count FROM research_evidence')).count, evidenceBefore + 1, 'Rejected generic MCP forge must make zero evidence writes');

    const malformedBefore = (await dbGet('SELECT COUNT(*) count FROM research_evidence')).count;
    const malformed = await amazon('POST', '/api/evidence', {
      projectId,
      seedPhrase: 'para mi hija',
      source: 'MANUAL',
      metadata: 'not-an-object'
    });
    assert.strictEqual(malformed.status, 400);
    assert.strictEqual(malformed.body.error, 'INVALID_CLIENT_ANNOTATIONS');
    assert.strictEqual((await dbGet('SELECT COUNT(*) count FROM research_evidence')).count, malformedBefore);

    // A legacy/directly elevated generic row cannot unlock either research stage.
    await dbRun("UPDATE research_evidence SET evidence_state = 'ACCEPTED', accepted_at = ?, accepted_by = ? WHERE id = ?", [new Date().toISOString(), amazonOwner.user_id, forged.body.evidenceId]);
    const researchTransition = await amazon('PATCH', `/api/projects/${projectId}/transition`, { targetState: 'RESEARCH_ACCEPTED' });
    assert.strictEqual(researchTransition.status, 400);
    assert.strictEqual(researchTransition.body.error, 'MISSING_QUALIFYING_EVIDENCE_PRECONDITION');
    assert.strictEqual(researchTransition.body.blockingEvidence[0].evidenceId, forged.body.evidenceId);

    await dbRun("UPDATE research_projects SET state = 'RESEARCH_ACCEPTED' WHERE id = ?", [projectId]);
    const dnaTransition = await amazon('PATCH', `/api/projects/${projectId}/transition`, { targetState: 'DNA_ACCEPTED' });
    assert.strictEqual(dnaTransition.status, 400);
    assert.strictEqual(dnaTransition.body.error, 'MISSING_DNA_PRECONDITION');
    assert.strictEqual(dnaTransition.body.blockingEvidence[0].evidenceId, forged.body.evidenceId);

    // Positive control: only a provider-controlled, complete, hashed retrieval qualifies.
    const verifiedProjectId = await createProject(etsy, 'H0 verified provider retrieval');
    ytrendsMcp.callTool = async name => {
      if (name === 'ytrends_search') return { data: { results: [{ id: 'search-1', title: 'Para mi hija necklace', snippet: '$25.00' }] } };
      if (name === 'ytrends_find_hot_listings') return { data: { listings: [{ listing_id: 'listing-1', title: 'Para mi hija necklace', price_usd: 25, sold_24h: 2, tags: ['para mi hija'] }] } };
      throw new Error(`Unexpected MCP tool ${name}`);
    };
    const retrieved = await etsy('POST', '/api/research/smart-pull', { projectId: verifiedProjectId, query: 'para mi hija' });
    assert.strictEqual(retrieved.status, 200, JSON.stringify(retrieved.body));
    assert.strictEqual(retrieved.body.evidenceState, 'RETRIEVED_NO_OBSERVED_AT');
    const retrievedAccept = await etsy('POST', `/api/evidence/${retrieved.body.evidenceId}/accept`);
    assert.strictEqual(retrievedAccept.status, 200, JSON.stringify(retrievedAccept.body));
    const validResearch = await etsy('PATCH', `/api/projects/${verifiedProjectId}/transition`, { targetState: 'RESEARCH_ACCEPTED' });
    assert.strictEqual(validResearch.status, 200, JSON.stringify(validResearch.body));
    const validDna = await etsy('PATCH', `/api/projects/${verifiedProjectId}/transition`, { targetState: 'DNA_ACCEPTED' });
    assert.strictEqual(validDna.status, 200, JSON.stringify(validDna.body));

    console.log('EVIDENCE_ELIGIBILITY_FAIL_CLOSED=PASS');
  } finally {
    ytrendsMcp.callTool = originalCallTool;
    server.close();
  }
})().catch(error => {
  console.error('EVIDENCE_ELIGIBILITY_FAIL_CLOSED=FAIL', error);
  process.exit(1);
});
