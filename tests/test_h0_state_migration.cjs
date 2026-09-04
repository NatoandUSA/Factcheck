const assert = require('node:assert/strict');
const sqlite = require('sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const registry = require('../server/projectStateRegistry');
const { migrateProjectStates, MIGRATION_ID } = require('../server/database/projectStateMigration');
const all = (db, sql, args = []) => new Promise((resolve, reject) => db.all(sql, args, (e, rows) => e ? reject(e) : resolve(rows)));
const run = (db, sql, args = []) => new Promise((resolve, reject) => db.run(sql, args, e => e ? reject(e) : resolve()));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'h0-migration-'));
const handles = [];
const PRE_REMEDIATION_BASE = 'f56702bd42c5b5361ff90d9cd40a6e92cb772ede';
let measured = 0;
async function snapshot(db) {
  const schema = await all(db, 'SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name');
  const data = {};
  for (const t of schema.filter(x => x.type === 'table')) data[t.name] = await all(db, `SELECT * FROM "${t.name}" ORDER BY rowid`);
  return { schema, data };
}
async function main() {
  assert.equal(registry.assertRegistry(), 12); measured++;
  // Use the exact pre-remediation production CREATE TABLE, not a surrogate.
  try {
    cp.execFileSync('git', ['cat-file', '-e', `${PRE_REMEDIATION_BASE}^{commit}`], { stdio: 'ignore' });
  } catch {
    throw new Error(`HARNESS_ERROR_MISSING_BASE_COMMIT:${PRE_REMEDIATION_BASE}`);
  }
  const baseSource = cp.execFileSync('git', ['show', `${PRE_REMEDIATION_BASE}:server/server.js`], { encoding: 'utf8' });
  const ddl = /CREATE TABLE IF NOT EXISTS research_projects \([\s\S]*?\n    \)/.exec(baseSource)[0];
  const filename = path.join(root, 'old.db');
  const db = new sqlite.Database(filename); handles.push(db);
  await run(db, 'PRAGMA foreign_keys=ON');
  await run(db, 'CREATE TABLE schema_migrations(id TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)');
  await run(db, ddl);
  await run(db, 'CREATE INDEX original_project_name ON research_projects(name)');
  await run(db, 'CREATE TABLE child (id INTEGER PRIMARY KEY, project_id INTEGER REFERENCES research_projects(id), value TEXT)');
  await run(db, 'CREATE TABLE audit (project_id INTEGER)');
  await run(db, 'CREATE TRIGGER original_project_trigger AFTER UPDATE ON research_projects BEGIN INSERT INTO audit VALUES (new.id); END');
  await run(db, "INSERT INTO research_projects(tenant_id,workspace_id,marketplace,name,seed_phrase,actor_id) VALUES ('t',1,'ETSY','preserve','raw',1)");
  await run(db, "INSERT INTO child VALUES (1,1,'preserve child')");
  await run(db, "UPDATE sqlite_sequence SET seq=91 WHERE name='research_projects'");
  const original = await snapshot(db);
  // Real SQLite late failure: fail the migration receipt after copy/rebuild.
  await run(db, `CREATE TRIGGER inject_migration_failure BEFORE INSERT ON schema_migrations WHEN new.id='${MIGRATION_ID}' BEGIN SELECT RAISE(ABORT,'INJECTED_RECEIPT_FAILURE'); END`);
  const failureBaseline = await snapshot(db);
  await assert.rejects(migrateProjectStates(db), /INJECTED_RECEIPT_FAILURE/); measured++;
  assert.deepEqual(await snapshot(db), failureBaseline); measured++;
  await run(db, 'DROP TRIGGER inject_migration_failure');
  const backup = path.join(root, 'pre-remediation.db');
  await run(db, `VACUUM INTO '${backup.replace(/'/g, "''")}'`);
  const migrated = await migrateProjectStates(db);
  assert.equal(migrated.migrated, true); measured++;
  assert.deepEqual(await all(db, 'SELECT * FROM research_projects'), original.data.research_projects); measured++;
  assert.deepEqual(await all(db, 'SELECT * FROM child'), original.data.child); measured++;
  assert.deepEqual(await all(db, "SELECT seq FROM sqlite_sequence WHERE name='research_projects'"), [{ seq: 91 }]); measured++;
  assert.deepEqual(await all(db, 'PRAGMA foreign_key_check'), []); measured++;
  const once = await snapshot(db);
  assert.equal((await migrateProjectStates(db)).migrated, false); measured++;
  assert.deepEqual(await snapshot(db), once); measured++;
  for (const state of registry.states) {
    await run(db, 'UPDATE research_projects SET state=? WHERE id=1', [state]);
    assert.equal((await all(db, 'SELECT state FROM research_projects WHERE id=1'))[0].state, state); measured++;
  }
  for (const state of ['UNKNOWN', '', 'validated', null, 0]) {
    const before = await snapshot(db);
    await assert.rejects(run(db, 'UPDATE research_projects SET state=? WHERE id=1', [state]));
    assert.deepEqual(await snapshot(db), before); measured++;
  }
  assert.equal((await all(db, 'SELECT * FROM audit')).length, registry.states.length); measured++;
  const [schema] = await all(db, "SELECT sql FROM sqlite_master WHERE name='research_projects'");
  assert.deepEqual(registry.schemaStates(schema.sql).sort(), [...registry.states].sort()); measured++;
  // Isolated file recovery drill, explicitly NOT application release rehearsal.
  const recovered = new sqlite.Database(backup); handles.push(recovered);
  assert.deepEqual(await snapshot(recovered), original); measured++;
  assert.equal((await migrateProjectStates(recovered)).migrated, true); measured++;
  const empty = new sqlite.Database(':memory:'); handles.push(empty);
  await run(empty, 'CREATE TABLE schema_migrations(id TEXT PRIMARY KEY)');
  await run(empty, `CREATE TABLE research_projects(id INTEGER PRIMARY KEY AUTOINCREMENT, ${registry.stateColumnSql})`);
  assert.equal((await migrateProjectStates(empty)).migrated, false); measured++;
  for (const state of registry.states) { await run(empty, 'INSERT INTO research_projects(state) VALUES (?)', [state]); measured++; }
  for (const value of ['UNKNOWN', null]) { await assert.rejects(run(empty, 'INSERT INTO research_projects(state) VALUES (?)', [value])); measured++; }
  assert.ok(measured > 0);
  console.log(`H0-B migration measured=${measured} passed=${measured} failed=0 unexecuted=0`);
}
main().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => { for (const db of handles) await new Promise(resolve => db.close(resolve)); fs.rmSync(root, { recursive: true, force: true }); });
