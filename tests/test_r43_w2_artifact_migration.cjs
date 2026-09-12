'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { migrateCommerceWorkflowArtifacts } = require('../server/database/migrations');

const run = (db, sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function done(error) {
  if (error) reject(error); else resolve(this);
}));
const all = (db, sql, params = []) => new Promise((resolve, reject) => db.all(sql, params,
  (error, rows) => error ? reject(error) : resolve(rows)));
const close = db => new Promise(resolve => db.close(resolve));
let passed = 0;
function check(value, message) { assert.ok(value, message); passed++; }

async function exactV2() {
  const db = new sqlite3.Database(':memory:');
  await migrateCommerceWorkflowArtifacts(db);
  await migrateCommerceWorkflowArtifacts(db);
  const columns = new Set((await all(db, 'PRAGMA table_info(commerce_workflow_artifacts)')).map(item => item.name));
  for (const column of ['request_hash', 'integrity_version', 'engine_binding_hash', 'parser_binding_hash',
    'normalization_binding_hash', 'scoring_binding_hash', 'policy_binding_hash']) check(columns.has(column), `${column} exists`);
  const triggers = (await all(db, "SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='commerce_workflow_artifacts'")).map(item => item.name);
  check(triggers.includes('commerce_workflow_artifacts_parent_guard'), 'parent-chain guard exists');
  check(triggers.includes('commerce_workflow_artifacts_immutable_update')
    && triggers.includes('commerce_workflow_artifacts_immutable_delete'), 'immutability guards exist');
  await close(db);
}

async function donorEmpty() {
  const db = new sqlite3.Database(':memory:');
  await run(db, 'CREATE TABLE commerce_workflow_artifacts (id INTEGER PRIMARY KEY, payload_json TEXT)');
  await migrateCommerceWorkflowArtifacts(db);
  const columns = new Set((await all(db, 'PRAGMA table_info(commerce_workflow_artifacts)')).map(item => item.name));
  check(columns.has('integrity_version') && columns.has('request_hash'), 'empty donor-v1 is rebuilt as exact v2');
  await close(db);
}

async function donorPopulated() {
  const db = new sqlite3.Database(':memory:');
  await run(db, 'CREATE TABLE commerce_workflow_artifacts (id INTEGER PRIMARY KEY, payload_json TEXT)');
  await run(db, "INSERT INTO commerce_workflow_artifacts(id,payload_json) VALUES (1,'{}')");
  let caught;
  try { await migrateCommerceWorkflowArtifacts(db); } catch (error) { caught = error; }
  check(caught?.code === 'COMMERCE_WORKFLOW_ARTIFACT_SCHEMA_INCOMPATIBLE', 'populated donor-v1 fails closed');
  check(caught?.details?.classification === 'DONOR_V1_POPULATED' && caught.details.rowCount === 1,
    'populated donor-v1 reports explicit compatibility classification');
  check((await all(db, 'SELECT * FROM commerce_workflow_artifacts')).length === 1, 'failed migration preserves donor row');
  await close(db);
}

async function incompleteV2() {
  const db = new sqlite3.Database(':memory:');
  await migrateCommerceWorkflowArtifacts(db);
  await run(db, 'DROP TRIGGER commerce_workflow_artifacts_parent_guard');
  let caught;
  try { await migrateCommerceWorkflowArtifacts(db); } catch (error) { caught = error; }
  check(caught?.code === 'COMMERCE_WORKFLOW_ARTIFACT_SCHEMA_INCOMPATIBLE', 'incomplete v2 fails closed');
  check(caught?.details?.classification === 'V2_INCOMPLETE'
    && caught.details.missingObjects.includes('commerce_workflow_artifacts_parent_guard'),
  'incomplete v2 identifies the missing schema object');
  await close(db);
}

(async () => {
  await exactV2(); await donorEmpty(); await donorPopulated(); await incompleteV2();
  console.log(`R4.3 W2 artifact migration: ${passed}/${passed} PASS`);
})().catch(error => { console.error(error); process.exit(1); });
