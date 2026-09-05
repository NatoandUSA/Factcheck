const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
const { app, db, databaseReady } = require('../server/server');
const { createSessionRecord } = require('../server/security/session');
const authority = require('../server/evidenceAuthority');
const all = (sql, args = []) => new Promise((resolve, reject) => db.all(sql, args, (e, rows) => e ? reject(e) : resolve(rows)));
const run = (sql, args = []) => new Promise((resolve, reject) => db.run(sql, args, function(e) { e ? reject(e) : resolve(this.lastID); }));
const tables = ['research_evidence', 'research_projects', 'evidence_acceptance_events', 'evidence_adoption_events', 'project_transition_events', 'market_trends', 'listings', 'agent_logs'];
async function snapshot() {
  const result = {};
  for (const table of tables) result[table] = await all(`SELECT * FROM ${table} ORDER BY rowid`);
  return result;
}
let measured = 0, server;
async function main() {
  await databaseReady;
  const [owner] = await all(`SELECT u.id AS userId, w.id AS workspaceId, w.tenant_id AS tenantId, w.marketplace
    FROM users u JOIN workspace_memberships m ON m.user_id=u.id JOIN workspaces w ON w.id=m.workspace_id
    WHERE u.email='owner@omniseller.local' AND w.marketplace='ETSY'`);
  assert.ok(owner);
  const projectId = await run(`INSERT INTO research_projects (tenant_id,workspace_id,marketplace,name,seed_phrase,actor_id) VALUES (?,?,?,'H0','mug',?)`, [owner.tenantId, owner.workspaceId, owner.marketplace, owner.userId]);
  const scope = { ...owner, projectId, evidenceVersion: 1 };
  const session = await new Promise((resolve, reject) => createSessionRecord(db, owner.userId, owner.workspaceId, owner.tenantId, (e, s) => e ? reject(e) : resolve(s)));
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const headers = { 'Content-Type': 'application/json', Origin: 'http://localhost:3001', Cookie: `omni_session=${session.rawToken}` };
  async function post(route, body) {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${route}`, { method: 'POST', headers, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  }
  async function reject(route, body, status, error) {
    const before = await snapshot();
    const result = await post(route, body);
    assert.equal(result.status, status, JSON.stringify(result));
    if (error) assert.equal(result.body.error, error);
    assert.deepEqual(await snapshot(), before, `${route} must be zero-write`);
    measured++;
  }
  const base = { projectId, seedPhrase: 'mug', source: 'MANUAL' };
  for (const key of authority.RESERVED_AUTHORITY_FIELDS) {
    for (const metadata of [{ [key]: true }, { nested: [{ [' ' + key.toUpperCase() + ' ']: true }] }, { json: JSON.stringify({ [key]: true }) }]) {
      await reject('/api/evidence', { ...base, metadata }, 400, 'CLIENT_AUTHORITY_METADATA_FORBIDDEN');
    }
  }
  assert.deepEqual(authority.PROVIDER_CONTROLLED_SOURCES, ['MCP_RETRIEVAL', 'ETSY_MCP_LIVE']); measured++;
  for (const source of ['MCP_RETRIEVAL', ' mcp_retrieval ', 'ETSY_MCP_LIVE', ' etsy_mcp_live ']) {
    await reject('/api/evidence', { ...base, source }, 400, 'CLIENT_AUTHORITY_METADATA_FORBIDDEN');
  }
  for (const source of [
    ['MCP_RETRIEVAL'], [['MCP_RETRIEVAL']], [' mcp_retrieval '],
    ['ETSY_MCP_LIVE'], [['ETSY_MCP_LIVE']], [' etsy_mcp_live '],
    { value: 'MCP_RETRIEVAL' }, { value: 'ETSY_MCP_LIVE' }, 1, true
  ]) await reject('/api/evidence', { ...base, source }, 400, 'INVALID_EVIDENCE_SOURCE');
  for (const source of [null, undefined, '']) {
    await reject('/api/evidence', { ...base, source }, 400, 'MISSING_FIELDS');
  }
  for (const metadata of [JSON.parse('{"__proto__":{"x":1}}'), { constructor: {} }, { prototype: {} }]) await reject('/api/evidence', { ...base, metadata }, 400, 'CLIENT_AUTHORITY_METADATA_FORBIDDEN');
  for (const metadata of [[], 1, null, 'ordinary', { note: 'x'.repeat(33000) }]) await reject('/api/evidence', { ...base, metadata }, 400);
  const clean = await post('/api/evidence', { ...base, metadata: { note: 'ordinary' } });
  assert.equal(clean.status, 200); measured++;
  const [stored] = await all('SELECT * FROM research_evidence WHERE id=?', [clean.body.evidenceId]);
  assert.deepEqual(JSON.parse(stored.metadata).clientAnnotations, { note: 'ordinary' }); measured++;
  await reject(`/api/evidence/${stored.id}/accept`, {}, 409, 'UNQUALIFIED_EVIDENCE_AUTHORITY');

  async function insert(envelope, row = {}) {
    return run(`INSERT INTO research_evidence (tenant_id,workspace_id,marketplace,project_id,seed_phrase,source,evidence_state,metadata,actor_id)
      VALUES (?,?,?,?,?,?,?,?,?)`, [row.tenantId ?? owner.tenantId, row.workspaceId ?? owner.workspaceId, row.marketplace ?? owner.marketplace,
      Object.hasOwn(row, 'projectId') ? row.projectId : projectId, 'mug', envelope.source, row.state || 'OBSERVED', JSON.stringify(envelope.metadata), owner.userId]);
  }
  const make = () => authority.deriveControlledEvidenceEnvelope({ provider: 'YTRENDS_MCP', payload: { rows: [{ title: 'mug', price: 14 }] }, scope });
  for (const change of [m => { delete m.kind; }, m => { m.kind = null; }, m => { m.kind = {}; }, m => { m.kind = 'UNKNOWN'; },
    m => { m.provider = 'UNKNOWN'; }, m => { m.evidenceState = 'UNKNOWN'; }, m => { m.contentHash = 'a'.repeat(64); },
    m => { m.canonicalPayload.rows[0].price = 999; }, m => { m.evidenceVersion = 2; }, m => { m.revoked = true; }, m => { m.supersededBy = 2; },
    ...['tenantId', 'workspaceId', 'marketplace', 'projectId'].map(k => m => { m.scope[k] = typeof m.scope[k] === 'number' ? 999999 : 'wrong'; })]) {
    const envelope = make(); change(envelope.metadata);
    const id = await insert(envelope);
    await reject(`/api/evidence/${id}/accept`, {}, 409);
  }
  for (const row of [{ tenantId: 'wrong' }, { workspaceId: 999999 }, { marketplace: 'AMAZON' }]) {
    const id = await insert(make(), row);
    await reject(`/api/evidence/${id}/accept`, {}, 404);
    await reject(`/api/projects/${projectId}/adopt-evidence`, { evidenceId: id }, 404);
  }
  const scoped = await insert(make());
  await reject(`/api/projects/${projectId}/adopt-evidence`, { evidenceId: scoped }, 404);
  const legacy = await insert({ source: 'MANUAL', metadata: {} }, { projectId: null, state: 'ACCEPTED' });
  await reject(`/api/projects/${projectId}/adopt-evidence`, { evidenceId: legacy }, 409);
  const wronglyBound = make(); wronglyBound.metadata.scope.projectId = 99999;
  const wrongId = await insert(wronglyBound, { projectId: null });
  await reject(`/api/projects/${projectId}/adopt-evidence`, { evidenceId: wrongId }, 409);
  const positive = await post(`/api/evidence/${scoped}/accept`, {});
  assert.equal(positive.status, 200, JSON.stringify(positive)); measured++;
  assert.equal((await all('SELECT evidence_state FROM research_evidence WHERE id=?', [scoped]))[0].evidence_state, 'ACCEPTED'); measured++;
  const before = await snapshot();
  await reject(`/api/evidence/${legacy}/accept`, {}, 409);
  assert.deepEqual(await snapshot(), before); measured++;
  const provider = require('../server/ytuongMcpClient');
  const original = provider.callTool;
  try {
    provider.callTool = async name => name === 'ytrends_search'
      ? { data: { results: [{ id: '1', title: 'mug', snippet: '$14' }] } }
      : { data: { listings: [{ listing_id: '1', title: 'mug', price_usd: 14, tags: ['mug'] }] } };
    const pulled = await post('/api/research/smart-pull', { projectId, query: 'mug', unitCost: 2 });
    assert.equal(pulled.status, 200, JSON.stringify(pulled)); measured++;
    const [providerRow] = await all('SELECT * FROM research_evidence WHERE id=?', [pulled.body.evidenceId]);
    const providerMetadata = JSON.parse(providerRow.metadata);
    assert.equal(pulled.body.contentHash, providerMetadata.contentHash); measured++;
    assert.equal(providerMetadata.contentHash, authority.canonicalHash(providerMetadata.canonicalPayload)); measured++;
    assert.equal(authority.evaluateEvidenceAuthority(providerRow, scope).qualifying, true); measured++;
    assert.equal((await post(`/api/evidence/${providerRow.id}/accept`, {})).status, 200); measured++;
    const tampered = JSON.parse(providerRow.metadata); tampered.canonicalPayload.searchRows[0].title = 'changed';
    await run('UPDATE research_evidence SET metadata=? WHERE id=?', [JSON.stringify(tampered), providerRow.id]);
    await reject(`/api/evidence/${providerRow.id}/accept`, {}, 409);
    provider.callTool = async () => { throw new Error('synthetic outage'); };
    await reject('/api/research/smart-pull', { projectId, query: 'mug' }, 503);
  } finally { provider.callTool = original; }
  assert.ok(measured > 0);
  console.log(`H0-A measured=${measured} passed=${measured} failed=0 unexecuted=0`);
}
main().catch(error => { console.error(error); console.error(`H0-A measured=${measured}; failed=1; remaining cases not executed`); process.exitCode = 1; })
  .finally(async () => { if (server) await new Promise(resolve => server.close(resolve)); await new Promise(resolve => db.close(resolve)); });
