const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'h0-auth01-cp1-'));
process.env.NODE_ENV = 'test';
process.env.OMNI_DB_PATH = path.join(tmpRoot, 'checkpoint1.db');
process.env.OMNI_IMPORTS_DIR = path.join(tmpRoot, 'imports');

const { app, db, databaseReady } = require('../server/server');
const { createSessionRecord } = require('../server/security/session');

const dbGet = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
const dbRun = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function(err) {
  if (err) reject(err); else resolve({ lastID: this.lastID, changes: this.changes });
}));
const createSession = (userId, workspaceId, tenantId) => new Promise((resolve, reject) => {
  createSessionRecord(db, userId, workspaceId, tenantId, (err, session) => err ? reject(err) : resolve(session));
});

async function waitForOwner(timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const row = await dbGet(`
      SELECT u.id AS user_id, w.id AS workspace_id, w.tenant_id, w.marketplace
      FROM users u
      JOIN workspace_memberships wm ON wm.user_id = u.id
      JOIN workspaces w ON w.id = wm.workspace_id
      WHERE u.email = 'owner@omniseller.local' AND w.marketplace = 'AMAZON'
      LIMIT 1
    `);
    if (row) return row;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for checkpoint fixture');
}

async function digest(projectId) {
  const tables = [
    'research_evidence',
    'evidence_acceptance_events',
    'evidence_adoption_events',
    'research_projects',
    'project_transition_events',
    'market_trends',
    'listings',
    'agent_logs',
    'sales_feedback'
  ];
  const counts = {};
  for (const table of tables) counts[table] = Number((await dbGet(`SELECT COUNT(*) AS c FROM ${table}`)).c);
  const project = await dbGet('SELECT state, updated_at, validated_at, validated_by FROM research_projects WHERE id = ?', [projectId]);
  return { counts, project };
}

(async () => {
  await databaseReady;
  const owner = await waitForOwner();
  const inserted = await dbRun(`
    INSERT INTO research_projects
      (tenant_id, workspace_id, marketplace, name, seed_phrase, state, actor_id)
    VALUES (?, ?, ?, 'H0 CP1 Forge Boundary', 'checkpoint seed', 'EVIDENCE_INTAKE', ?)
  `, [owner.tenant_id, owner.workspace_id, owner.marketplace, owner.user_id]);
  const projectId = inserted.lastID;
  const session = await createSession(owner.user_id, owner.workspace_id, owner.tenant_id);
  const rawToken = session.rawToken || session.token || session;
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const port = server.address().port;
  const endpoint = `http://127.0.0.1:${port}/api/evidence`;
  const headers = {
    'Content-Type': 'application/json',
    Origin: 'http://localhost:3001',
    Cookie: `omni_session=${rawToken}`
  };

  const reserved = [
    'kind', 'source', 'evidenceState', 'contentHash', 'authority', 'eligible',
    'verified', 'provider', 'acceptanceEligibility', 'accepted_at', 'accepted_by', 'tier'
  ];
  const baseBody = { projectId, seedPhrase: 'checkpoint seed', source: 'MANUAL' };
  const cases = reserved.map(field => ({ name: `metadata.${field}`, metadata: { [field]: 'FORGED' } }));
  cases.push(
    { name: 'nested provider', metadata: { nested: { provider: 'H10_MCP' } } },
    { name: 'case/confusable contentHash', metadata: { Content_Hash: 'a'.repeat(64) } },
    { name: 'JSON-string authority', metadata: JSON.stringify({ authority: 'SERVER_PROVIDER' }) },
    { name: 'duplicate reserved occurrences', metadata: [{ kind: 'ONE' }, { kind: 'TWO' }] },
    { name: 'top-level case variant', topLevel: { Provider: 'H10_MCP' }, metadata: { note: 'ordinary' } }
  );

  try {
    const cleanResponse = await fetch(endpoint, {
      method: 'POST', headers,
      body: JSON.stringify({ ...baseBody, metadata: { note: 'ordinary research-only metadata' } })
    });
    assert.strictEqual(cleanResponse.status, 200, 'exact operational envelope with clean metadata must remain accepted');
    const cleanJson = await cleanResponse.json();
    assert.strictEqual(cleanJson?.success, true);

    const before = await digest(projectId);
    for (const testCase of cases) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...baseBody, ...(testCase.topLevel || {}), metadata: testCase.metadata })
      });
      let json = null;
      try { json = await response.json(); } catch (_) {}
      assert.strictEqual(response.status, 400, `${testCase.name} must return HTTP 400`);
      assert.strictEqual(json?.error, 'CLIENT_AUTHORITY_METADATA_FORBIDDEN', `${testCase.name} must return canonical error`);
      const afterCase = await digest(projectId);
      assert.deepStrictEqual(afterCase, before, `${testCase.name} must be zero-write across authority/business state`);
    }

    console.log('PASS clean-control: exact /api/evidence operational envelope persists research-only evidence.');
    console.log(`PASS H0-AUTH-01/C-01: ${cases.length} forged variants rejected with HTTP 400 before persistence.`);
    console.log('PASS zero-write digest: research_evidence / acceptance / project / trend / listing / workflow-business state unchanged.');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => db.close(resolve));
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})().catch(err => {
  console.error('FAIL H0-AUTH-01/C-01:', err);
  try { db.close(() => {}); } catch (_) {}
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
  process.exit(1);
});
