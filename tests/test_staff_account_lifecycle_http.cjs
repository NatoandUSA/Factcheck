/**
 * Canonical staff-account lifecycle contract.
 *
 * Proves that user identity and workspace authority remain separate, account
 * creation is atomic, workspace isolation is enforced, and deactivation
 * revokes live sessions immediately.
 */
process.env.NODE_ENV = 'test';

const assert = require('assert');
const { app, db, databaseReady } = require('../server/server');

const all = (sql, params = []) => new Promise((resolve, reject) =>
  db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));
const run = (sql, params = []) => new Promise((resolve, reject) =>
  db.run(sql, params, function complete(error) { error ? reject(error) : resolve(this); }));

async function fixtures() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const rows = await all(`SELECT u.id AS user_id, wm.workspace_id, wm.role, w.marketplace
      FROM users u JOIN workspace_memberships wm ON wm.user_id=u.id
      JOIN workspaces w ON w.id=wm.workspace_id
      WHERE u.email='owner@omniseller.local' AND wm.status='ACTIVE'`);
    if (rows.some(row => row.marketplace === 'AMAZON') && rows.some(row => row.marketplace === 'ETSY')) return rows;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('OWNER_FIXTURES_TIMEOUT');
}

async function request(base, method, route, cookie, body) {
  const response = await fetch(base + route, {
    method,
    headers: { Origin: base, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await response.json(); } catch (_) {}
  return { status: response.status, json, cookie: response.headers.get('set-cookie')?.split(';')[0] || null };
}

async function login(base, email, password, workspaceId) {
  return request(base, 'POST', '/api/auth/login', null, { email, password, workspaceId });
}

(async () => {
  await databaseReady;
  const ownerRows = await fixtures();
  // Reproduce the upgraded production schema that exposed the original bug:
  // role belongs to workspace_memberships and is absent from users.
  const userColumns = await all('PRAGMA table_info(users)');
  if (userColumns.some(column => column.name === 'role')) await run('ALTER TABLE users DROP COLUMN role');
  const productionLikeColumns = (await all('PRAGMA table_info(users)')).map(column => column.name);
  assert(!productionLikeColumns.includes('role') && !productionLikeColumns.includes('tenant_id'));
  const amazon = ownerRows.find(row => row.marketplace === 'AMAZON');
  const etsy = ownerRows.find(row => row.marketplace === 'ETSY');
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  process.env.ALLOWED_ORIGINS = base;
  const password = 'Uat!SellerLifecycle-2026';
  const email = 'staff-lifecycle-uat@example.test';

  try {
    const ownerEtsy = await login(base, 'owner@omniseller.local', 'password123', etsy.workspace_id);
    const ownerAmazon = await login(base, 'owner@omniseller.local', 'password123', amazon.workspace_id);
    assert.strictEqual(ownerEtsy.status, 200);
    assert.strictEqual(ownerAmazon.status, 200);

    const invalidRole = await request(base, 'POST', '/api/owner/users', ownerEtsy.cookie,
      { email: 'bad-role@example.test', password, name: 'Bad Role', role: 'OWNER' });
    assert.strictEqual(invalidRole.status, 400);
    assert.strictEqual(invalidRole.json.error, 'INVALID_STAFF_ROLE');

    const created = await request(base, 'POST', '/api/owner/users', ownerEtsy.cookie,
      { email, password, name: 'Temporary UAT Seller', role: 'SELLER' });
    assert.strictEqual(created.status, 201, JSON.stringify(created.json));
    assert.strictEqual(created.json.user.role, 'SELLER');
    assert.strictEqual(created.json.user.status, 'ACTIVE');
    const userId = created.json.user.id;

    const persisted = await all(`SELECT u.email, wm.workspace_id, wm.role, wm.status
      FROM users u JOIN workspace_memberships wm ON wm.user_id=u.id WHERE u.id=?`, [userId]);
    assert.deepStrictEqual(persisted.map(row => ({ email: row.email, workspace_id: row.workspace_id,
      role: row.role, status: row.status })), [{ email, workspace_id: etsy.workspace_id, role: 'SELLER', status: 'ACTIVE' }]);

    const seller = await login(base, email, password, etsy.workspace_id);
    assert.strictEqual(seller.status, 200, JSON.stringify(seller.json));
    assert.strictEqual(seller.json.user.role, 'SELLER');
    const sellerForbidden = await request(base, 'GET', '/api/owner/users', seller.cookie);
    assert.strictEqual(sellerForbidden.status, 403);

    const crossWorkspace = await request(base, 'POST', `/api/owner/users/${userId}/deactivate`, ownerAmazon.cookie,
      { reason: 'Cross-workspace adversarial check.' });
    assert.strictEqual(crossWorkspace.status, 404);
    assert.strictEqual(crossWorkspace.json.error, 'STAFF_MEMBERSHIP_NOT_FOUND');
    assert.strictEqual((await request(base, 'GET', '/api/auth/me', seller.cookie)).status, 200,
      'Cross-workspace attempt must not revoke the Seller session');

    const selfDeactivate = await request(base, 'POST', `/api/owner/users/${etsy.user_id}/deactivate`, ownerEtsy.cookie,
      { reason: 'Self-deactivation adversarial check.' });
    assert.strictEqual(selfDeactivate.status, 409);
    assert.strictEqual(selfDeactivate.json.error, 'OWNER_SELF_DEACTIVATION_FORBIDDEN');

    const deactivated = await request(base, 'POST', `/api/owner/users/${userId}/deactivate`, ownerEtsy.cookie,
      { reason: 'UAT completed; temporary Seller access must be revoked.' });
    assert.strictEqual(deactivated.status, 200, JSON.stringify(deactivated.json));
    assert.strictEqual(deactivated.json.status, 'INACTIVE');
    assert.strictEqual(deactivated.json.replay, false);
    assert(deactivated.json.revokedSessions >= 1);
    assert.strictEqual((await request(base, 'GET', '/api/auth/me', seller.cookie)).status, 401);
    assert.strictEqual((await login(base, email, password, etsy.workspace_id)).status, 403);

    const state = await all(`SELECT wm.status, COUNT(s.id) AS sessions,
      SUM(CASE WHEN s.revoked_at IS NOT NULL THEN 1 ELSE 0 END) AS revoked
      FROM workspace_memberships wm LEFT JOIN sessions s
        ON s.user_id=wm.user_id AND s.workspace_id=wm.workspace_id
      WHERE wm.user_id=? AND wm.workspace_id=? GROUP BY wm.status`, [userId, etsy.workspace_id]);
    assert.strictEqual(state[0].status, 'INACTIVE');
    assert.strictEqual(Number(state[0].sessions), Number(state[0].revoked));

    const replay = await request(base, 'POST', `/api/owner/users/${userId}/deactivate`, ownerEtsy.cookie,
      { reason: 'Idempotent replay check.' });
    assert.strictEqual(replay.status, 200);
    assert.strictEqual(replay.json.replay, true);

    await run(`CREATE TEMP TRIGGER force_staff_membership_failure BEFORE INSERT ON main.workspace_memberships
      WHEN (SELECT email FROM main.users WHERE id=NEW.user_id)='rollback-staff@example.test'
      BEGIN SELECT RAISE(ABORT, 'forced membership failure'); END`);
    const rolledBack = await request(base, 'POST', '/api/owner/users', ownerEtsy.cookie,
      { email: 'rollback-staff@example.test', password, name: 'Rollback Probe', role: 'SELLER' });
    assert.strictEqual(rolledBack.status, 500);
    assert.strictEqual(rolledBack.json.error, 'STAFF_ACCOUNT_CREATE_FAILED');
    assert.strictEqual(Number((await all(`SELECT COUNT(*) AS total FROM users WHERE email='rollback-staff@example.test'`))[0].total), 0,
      'Failed membership creation must roll back the user identity');
    await run('DROP TRIGGER force_staff_membership_failure');

    const audits = await all(`SELECT action FROM audit_events WHERE resource_type='workspace_membership' AND resource_id=?
      ORDER BY id`, [String(userId)]);
    assert.deepStrictEqual(audits.map(row => row.action), ['staff:create', 'staff:deactivate']);

    console.log('STAFF_ACCOUNT_LIFECYCLE_HTTP_PASSED');
  } finally {
    server.close();
  }
})().catch(error => {
  console.error('STAFF_ACCOUNT_LIFECYCLE_HTTP_FAILED', error);
  process.exitCode = 1;
});
