const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();

process.env.NODE_ENV = 'test';

const {
  db,
  databaseReady,
  ensureTestDatabaseFixtures
} = require('../server/server');
const { ensureTestDatabaseFixtures: initializeFixturesForDb } = require('../server/database/testFixtures');
const { ensureLegacyDefaultAgents } = require('../server/database/defaultAgents');

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
  });
}

function isolatedDb() {
  return new sqlite3.Database(':memory:');
}

function execOn(target, sql) {
  return new Promise((resolve, reject) => target.exec(sql, (error) => error ? reject(error) : resolve()));
}

function runOn(target, sql, params = []) {
  return new Promise((resolve, reject) => {
    target.run(sql, params, function onRun(error) {
      error ? reject(error) : resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function allOn(target, sql, params = []) {
  return new Promise((resolve, reject) => target.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));
}

function closeDb(target) {
  return new Promise((resolve, reject) => target.close((error) => error ? reject(error) : resolve()));
}

async function createFixtureSchema(target) {
  await execOn(target, `
    PRAGMA foreign_keys = ON;
    CREATE TABLE workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL,
      marketplace TEXT NOT NULL,
      name TEXT NOT NULL
    );
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL
    );
    CREATE TABLE workspace_memberships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      workspace_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      UNIQUE(user_id, workspace_id),
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
    );
    CREATE TABLE agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL,
      workspace_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
    );
  `);
}

async function expectMismatch(target, errorCode) {
  await assert.rejects(
    () => initializeFixturesForDb(target),
    (error) => error && error.message === errorCode
  );
  assert.deepStrictEqual(await allOn(target, 'PRAGMA foreign_key_check'), []);
}

async function mismatchAndRollbackMatrix() {
  // Existing canonical keys with conflicting content must fail closed instead
  // of laundering stale/corrupt test state into a green databaseReady.
  const wrongWorkspace = isolatedDb();
  await createFixtureSchema(wrongWorkspace);
  await runOn(wrongWorkspace,
    'INSERT INTO workspaces (tenant_id, marketplace, name) VALUES (?, ?, ?)',
    ['tenant-alpha-uuid', 'AMAZON', 'Wrong Store']);
  await expectMismatch(wrongWorkspace, 'TEST_FIXTURE_MISMATCH:workspace:tenant-alpha-uuid:AMAZON');
  assert.strictEqual((await allOn(wrongWorkspace, 'SELECT COUNT(*) AS count FROM users'))[0].count, 0);
  await closeDb(wrongWorkspace);

  const wrongUser = isolatedDb();
  await createFixtureSchema(wrongUser);
  await runOn(wrongUser,
    'INSERT INTO workspaces (tenant_id, marketplace, name) VALUES (?, ?, ?)',
    ['tenant-alpha-uuid', 'AMAZON', 'Amazon Main Store']);
  await runOn(wrongUser,
    'INSERT INTO workspaces (tenant_id, marketplace, name) VALUES (?, ?, ?)',
    ['tenant-beta-uuid', 'AMAZON', 'Tenant Beta Store']);
  await runOn(wrongUser,
    'INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)',
    ['owner@omniseller.local', 'invalid-hash', 'Store Owner']);
  await expectMismatch(wrongUser, 'TEST_FIXTURE_MISMATCH:user:owner@omniseller.local');
  // alpha/ETSY is created before user validation; rollback must remove it.
  assert.strictEqual((await allOn(wrongUser,
    "SELECT COUNT(*) AS count FROM workspaces WHERE tenant_id='tenant-alpha-uuid' AND marketplace='ETSY'"))[0].count, 0);
  assert.strictEqual((await allOn(wrongUser, 'SELECT COUNT(*) AS count FROM users'))[0].count, 1);
  await closeDb(wrongUser);

  const wrongMembership = isolatedDb();
  await createFixtureSchema(wrongMembership);
  await initializeFixturesForDb(wrongMembership);
  await runOn(wrongMembership,
    `UPDATE workspace_memberships SET role='SELLER'
     WHERE user_id=(SELECT id FROM users WHERE email='owner@omniseller.local')
       AND workspace_id=(SELECT id FROM workspaces WHERE tenant_id='tenant-alpha-uuid' AND marketplace='AMAZON')`);
  await expectMismatch(wrongMembership, 'TEST_FIXTURE_ROLE_MISMATCH:1:1');
  await closeDb(wrongMembership);

  const wrongAgent = isolatedDb();
  await createFixtureSchema(wrongAgent);
  await initializeFixturesForDb(wrongAgent);
  await runOn(wrongAgent, "UPDATE agents SET status='ONLINE' WHERE name='Trend Scout'");
  await expectMismatch(wrongAgent, 'TEST_FIXTURE_AGENT_MISMATCH:Trend Scout');
  await closeDb(wrongAgent);
}

async function legacyAgentCompatibilityMatrix() {
  const empty = isolatedDb();
  await execOn(empty, `CREATE TABLE agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT, workspace_id INTEGER, name TEXT, role TEXT, status TEXT
  );`);
  await ensureLegacyDefaultAgents(empty);
  await ensureLegacyDefaultAgents(empty);
  assert.deepStrictEqual(await allOn(empty,
    'SELECT tenant_id, workspace_id, name, role, status FROM agents ORDER BY name'), [
    { tenant_id: 'default', workspace_id: 1, name: 'AI Drafter', role: 'DRAFTER', status: 'OFFLINE' },
    { tenant_id: 'default', workspace_id: 1, name: 'Trend Scout', role: 'RESEARCHER', status: 'OFFLINE' }
  ]);
  await closeDb(empty);

  const nonEmpty = isolatedDb();
  await execOn(nonEmpty, `CREATE TABLE agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT, workspace_id INTEGER, name TEXT, role TEXT, status TEXT
  );`);
  await runOn(nonEmpty,
    'INSERT INTO agents (tenant_id, workspace_id, name, role, status) VALUES (?, ?, ?, ?, ?)',
    ['custom', 9, 'Existing Agent', 'RESEARCHER', 'ONLINE']);
  await ensureLegacyDefaultAgents(nonEmpty);
  assert.deepStrictEqual(await allOn(nonEmpty, 'SELECT name FROM agents'), [{ name: 'Existing Agent' }]);
  await closeDb(nonEmpty);
}

async function fixtureCounts() {
  const [users, workspaces, memberships, agents] = await Promise.all([
    all(`SELECT email, COUNT(*) AS count
         FROM users
         WHERE email IN ('owner@omniseller.local', 'manager@omniseller.local',
                         'seller@omniseller.local', 'owner-beta@omniseller.local')
         GROUP BY email ORDER BY email`),
    all(`SELECT tenant_id, marketplace, COUNT(*) AS count
         FROM workspaces
         WHERE (tenant_id = 'tenant-alpha-uuid' AND marketplace IN ('AMAZON', 'ETSY'))
            OR (tenant_id = 'tenant-beta-uuid' AND marketplace = 'AMAZON')
         GROUP BY tenant_id, marketplace ORDER BY tenant_id, marketplace`),
    all(`SELECT u.email, w.tenant_id, w.marketplace, COUNT(*) AS count
         FROM workspace_memberships wm
         JOIN users u ON u.id = wm.user_id
         JOIN workspaces w ON w.id = wm.workspace_id
         WHERE u.email IN ('owner@omniseller.local', 'manager@omniseller.local',
                           'seller@omniseller.local', 'owner-beta@omniseller.local')
         GROUP BY u.email, w.tenant_id, w.marketplace
         ORDER BY u.email, w.tenant_id, w.marketplace`),
    all(`SELECT a.name, a.role, a.status, a.tenant_id, w.marketplace, COUNT(*) AS count
         FROM agents a JOIN workspaces w
           ON w.id = a.workspace_id AND w.tenant_id = a.tenant_id
         WHERE a.name IN ('Trend Scout', 'AI Drafter')
         GROUP BY a.name, a.role, a.status, a.tenant_id, w.marketplace
         ORDER BY a.name`)
  ]);
  return { users, workspaces, memberships, agents };
}

async function main() {
  console.log('================================================================');
  console.log('  TESTING AWAITABLE / IDEMPOTENT TEST DATABASE FIXTURES');
  console.log('================================================================\\n');

  assert.strictEqual(
    typeof ensureTestDatabaseFixtures,
    'function',
    'server must expose the deterministic test-fixture initializer used by databaseReady'
  );

  await databaseReady;
  const readyCounts = await fixtureCounts();
  assert.deepStrictEqual(readyCounts.users, [
    { email: 'manager@omniseller.local', count: 1 },
    { email: 'owner-beta@omniseller.local', count: 1 },
    { email: 'owner@omniseller.local', count: 1 },
    { email: 'seller@omniseller.local', count: 1 }
  ], 'databaseReady must include completion of all default test users');
  assert.deepStrictEqual(readyCounts.workspaces, [
    { tenant_id: 'tenant-alpha-uuid', marketplace: 'AMAZON', count: 1 },
    { tenant_id: 'tenant-alpha-uuid', marketplace: 'ETSY', count: 1 },
    { tenant_id: 'tenant-beta-uuid', marketplace: 'AMAZON', count: 1 }
  ], 'databaseReady must include complete workspaces without duplicates');
  assert.strictEqual(readyCounts.memberships.length, 5);
  assert.ok(readyCounts.memberships.every((row) => row.count === 1));

  assert.deepStrictEqual(readyCounts.agents, [
    { name: 'AI Drafter', role: 'DRAFTER', status: 'OFFLINE', tenant_id: 'tenant-alpha-uuid', marketplace: 'AMAZON', count: 1 },
    { name: 'Trend Scout', role: 'RESEARCHER', status: 'OFFLINE', tenant_id: 'tenant-alpha-uuid', marketplace: 'AMAZON', count: 1 }
  ], 'databaseReady must include exact, uniquely scoped default agents');

  // Regression for CHECK / await hashPassword / INSERT races: all concurrent
  // callers share one initializer, while later calls remain idempotent.
  await Promise.all(Array.from({ length: 24 }, () => ensureTestDatabaseFixtures()));
  await ensureTestDatabaseFixtures();
  assert.deepStrictEqual(await fixtureCounts(), readyCounts);

  assert.deepStrictEqual(await all('PRAGMA foreign_key_check'), []);
  await mismatchAndRollbackMatrix();
  await legacyAgentCompatibilityMatrix();

  console.log('  🟢 databaseReady includes complete fixture seeding.');
  console.log('  🟢 concurrent and repeated initialization is collision-free and idempotent.');
  console.log('  🟢 fixture foreign-key integrity is clean.');
  console.log('  🟢 default agents are transaction-bound, exact, and workspace-scoped.');
  console.log('  🟢 corrupt fixtures reject explicitly; partial writes roll back.');
  console.log('  🟢 non-test legacy Agent Hub initialization behavior is preserved atomically.');
}

main().then(() => {
  db.close((error) => {
    if (error) throw error;
    console.log('\\nGPT2_TEST_DATABASE_FIXTURE_ISOLATION=PASS');
  });
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
  db.close(() => {});
});
