const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { states, schemaStates } = require('../server/projectStateRegistry');
const { migrateProjectStates, MIGRATION_ID } = require('../server/database/projectStateMigration');

const handles = [];
const open = () => { const db = new sqlite3.Database(':memory:'); handles.push(db); return db; };
const run = (db, sql, args = []) => new Promise((resolve, reject) =>
  db.run(sql, args, function(err) { err ? reject(err) : resolve({ changes: this.changes, lastID: this.lastID }); }));
const all = (db, sql, args = []) => new Promise((resolve, reject) =>
  db.all(sql, args, (err, rows) => err ? reject(err) : resolve(rows)));
let measured = 0;

const productionStates = [
  'EVIDENCE_INTAKE', 'RESEARCH_ACCEPTED', 'DNA_ACCEPTED', 'MKL_FROZEN',
  'DRAFT_GENERATED', 'PRODUCT_TRUTH_VERIFIED', 'MANAGER_APPROVED', 'PUBLISH_READY'
];

async function snapshot(db) {
  const schema = await all(db, `SELECT type,name,tbl_name,sql
    FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name`);
  const data = {};
  for (const item of schema.filter(item => item.type === 'table')) {
    data[item.name] = await all(db, `SELECT * FROM "${item.name}" ORDER BY rowid`);
  }
  return { schema, data };
}

async function productionFixture() {
  const db = open();
  await run(db, 'PRAGMA foreign_keys=ON');
  await run(db, 'CREATE TABLE schema_migrations(id TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)');
  await run(db, `CREATE TABLE research_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    workspace_id INTEGER NOT NULL,
    marketplace TEXT NOT NULL CHECK(marketplace IN ('AMAZON','ETSY')),
    name TEXT NOT NULL,
    seed_phrase TEXT NOT NULL,
    state TEXT DEFAULT 'EVIDENCE_INTAKE' CHECK(state IN (${productionStates.map(s => `'${s}'`).join(',')})),
    reference_asin TEXT,
    batch_count INTEGER DEFAULT 0,
    product_truth_notes TEXT,
    validated_at DATETIME,
    validated_by INTEGER,
    actor_id INTEGER NOT NULL,
    appended_release_column TEXT DEFAULT 'preserve',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(db, 'CREATE UNIQUE INDEX rr01_project_name ON research_projects(tenant_id,name)');
  await run(db, 'CREATE TABLE child(id INTEGER PRIMARY KEY, project_id INTEGER REFERENCES research_projects(id), payload TEXT)');
  await run(db, 'CREATE TABLE audit(project_id INTEGER, state TEXT)');
  await run(db, `CREATE TRIGGER rr01_project_trigger AFTER UPDATE ON research_projects
    BEGIN INSERT INTO audit VALUES(new.id,new.state); END`);
  for (let index = 0; index < productionStates.length; index += 1) {
    const result = await run(db, `INSERT INTO research_projects
      (tenant_id,workspace_id,marketplace,name,seed_phrase,state,actor_id,appended_release_column)
      VALUES ('tenant-prod',7,'AMAZON',?, 'para mi hija', ?,99,?)`,
      [`project-${index}`, productionStates[index], `extra-${index}`]);
    await run(db, 'INSERT INTO child VALUES(?,?,?)', [index + 1, result.lastID, `child-${index}`]);
  }
  await run(db, `UPDATE sqlite_sequence SET seq=84 WHERE name='research_projects'`);
  return db;
}

async function verifyProductionLineage() {
  const db = await productionFixture();
  const before = await snapshot(db);
  const result = await migrateProjectStates(db);
  assert.equal(result.migrated, true); measured++;
  assert.equal(result.sourceLineage, 'PRODUCTION_5C4153B_EIGHT_STATE'); measured++;
  const afterRows = await all(db, 'SELECT * FROM research_projects ORDER BY id');
  assert.deepEqual(afterRows, before.data.research_projects); measured++;
  assert.deepEqual(await all(db, 'SELECT * FROM child ORDER BY id'), before.data.child); measured++;
  assert.deepEqual(await all(db, 'SELECT * FROM audit'), []); measured++;
  assert.deepEqual(await all(db, 'PRAGMA foreign_key_check'), []); measured++;
  assert.deepEqual(await all(db, `SELECT seq FROM sqlite_sequence WHERE name='research_projects'`), [{ seq: 84 }]); measured++;
  const columns = await all(db, 'PRAGMA table_info(research_projects)');
  assert.ok(columns.some(column => column.name === 'appended_release_column')); measured++;
  const objects = await all(db, `SELECT type,name FROM sqlite_master
    WHERE name IN ('rr01_project_name','rr01_project_trigger') ORDER BY name`);
  assert.deepEqual(objects, [
    { type: 'index', name: 'rr01_project_name' },
    { type: 'trigger', name: 'rr01_project_trigger' }
  ]); measured++;
  const [table] = await all(db, `SELECT sql FROM sqlite_master WHERE name='research_projects'`);
  assert.deepEqual(schemaStates(table.sql).sort(), [...states].sort()); measured++;
  assert.equal((await migrateProjectStates(db)).migrated, false); measured++;
  const receipt = await all(db, 'SELECT id FROM schema_migrations WHERE id=?', [MIGRATION_ID]);
  assert.equal(receipt.length, 1); measured++;
}

async function verifyUnknownZeroWrite() {
  const db = open();
  await run(db, 'CREATE TABLE schema_migrations(id TEXT PRIMARY KEY)');
  const unknown = productionStates.slice(0, -1);
  await run(db, `CREATE TABLE research_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    state TEXT DEFAULT 'EVIDENCE_INTAKE' CHECK(state IN (${unknown.map(s => `'${s}'`).join(',')})),
    appended TEXT
  )`);
  await run(db, `INSERT INTO research_projects(state,appended) VALUES('EVIDENCE_INTAKE','unchanged')`);
  await run(db, 'CREATE INDEX rr01_unknown_index ON research_projects(appended)');
  const before = await snapshot(db);
  await assert.rejects(migrateProjectStates(db), /UNRECOGNIZED_PROJECT_STATE_SCHEMA/); measured++;
  assert.deepEqual(await snapshot(db), before); measured++;
}

async function verifyRollback() {
  const db = await productionFixture();
  await run(db, `CREATE TRIGGER rr01_fail_receipt BEFORE INSERT ON schema_migrations
    WHEN new.id='${MIGRATION_ID}' BEGIN SELECT RAISE(ABORT,'RR01_INJECTED_FAILURE'); END`);
  const before = await snapshot(db);
  await assert.rejects(migrateProjectStates(db), /RR01_INJECTED_FAILURE/); measured++;
  assert.deepEqual(await snapshot(db), before); measured++;
}

(async () => {
  await verifyProductionLineage();
  await verifyUnknownZeroWrite();
  await verifyRollback();
  assert.ok(measured > 0);
  console.log(`RR-01 measured=${measured} passed=${measured} failed=0 unexecuted=0`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  for (const db of handles) await new Promise(resolve => db.close(resolve));
});
