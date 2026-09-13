'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { migrateCommerceWorkflowArtifacts } = require('../server/database/migrations');
const { appendArtifact, getArtifact, getArtifactState } = require('../server/commerceWorkflowArtifactStore');
const { canonicalJson, hashBytes } = require('../server/revisionStore');

const run = (db, sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function done(error) {
  if (error) reject(error); else resolve(this);
}));
const all = (db, sql, params = []) => new Promise((resolve, reject) => db.all(sql, params,
  (error, rows) => error ? reject(error) : resolve(rows)));
const close = db => new Promise(resolve => db.close(resolve));
let passed = 0;
function check(value, message) { assert.ok(value, message); passed++; }

async function donorFixture(db, { populated = false, tampered = false } = {}) {
  await run(db, 'CREATE TABLE users(id INTEGER PRIMARY KEY)');
  await run(db, 'CREATE TABLE workspaces(id INTEGER PRIMARY KEY)');
  await run(db, 'CREATE TABLE research_projects(id INTEGER PRIMARY KEY,tenant_id TEXT,workspace_id INTEGER,marketplace TEXT)');
  await run(db, 'INSERT INTO users(id) VALUES (7)'); await run(db, 'INSERT INTO workspaces(id) VALUES (2)');
  await run(db, "INSERT INTO research_projects(id,tenant_id,workspace_id,marketplace) VALUES (3,'tenant-a',2,'AMAZON')");
  await run(db, `CREATE TABLE commerce_workflow_artifacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, workspace_id INTEGER NOT NULL,
    marketplace TEXT NOT NULL, project_id INTEGER NOT NULL, kind TEXT NOT NULL, revision_number INTEGER NOT NULL,
    parent_revision_id INTEGER, dependency_manifest_json TEXT NOT NULL, dependency_manifest_hash TEXT NOT NULL,
    payload_json TEXT NOT NULL, payload_hash TEXT NOT NULL, accounting_json TEXT NOT NULL, accounting_hash TEXT NOT NULL,
    engine_binding_hash TEXT NOT NULL, artifact_hash TEXT NOT NULL, change_reason TEXT NOT NULL,
    idempotency_key TEXT NOT NULL, created_by INTEGER NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id,kind,revision_number), UNIQUE(tenant_id,workspace_id,marketplace,kind,idempotency_key))`);
  await run(db, `CREATE INDEX idx_commerce_workflow_artifacts_scope
    ON commerce_workflow_artifacts(tenant_id,workspace_id,marketplace,project_id,kind,revision_number)`);
  await run(db, `CREATE TRIGGER commerce_workflow_artifacts_immutable_update BEFORE UPDATE ON commerce_workflow_artifacts
    BEGIN SELECT RAISE(ABORT,'IMMUTABLE_COMMERCE_WORKFLOW_ARTIFACT'); END`);
  await run(db, `CREATE TRIGGER commerce_workflow_artifacts_immutable_delete BEFORE DELETE ON commerce_workflow_artifacts
    BEGIN SELECT RAISE(ABORT,'IMMUTABLE_COMMERCE_WORKFLOW_ARTIFACT'); END`);
  if (!populated) return null;
  const dependencies = canonicalJson({ xrayImports: [{ id: 4, rawHash: 'a'.repeat(64) }] });
  const payload = canonicalJson({ batches: [{ batchNumber: 1, asins: ['B000000001'] }] });
  const accounting = canonicalJson({ selectedAsinCount: 1 });
  const component = { dependencyManifestHash: hashBytes(dependencies), payloadHash: hashBytes(payload),
    accountingHash: hashBytes(accounting), engineBindingHash: 'e'.repeat(64) };
  const artifactHash = tampered ? 'f'.repeat(64) : hashBytes(canonicalJson(component));
  const createdAt = '2026-09-11T12:34:56.000Z';
  await run(db, `INSERT INTO commerce_workflow_artifacts
    (id,tenant_id,workspace_id,marketplace,project_id,kind,revision_number,parent_revision_id,
     dependency_manifest_json,dependency_manifest_hash,payload_json,payload_hash,accounting_json,accounting_hash,
     engine_binding_hash,artifact_hash,change_reason,idempotency_key,created_by,created_at)
    VALUES (1,'tenant-a',2,'AMAZON',3,'AMAZON_ASIN_BATCH_PLAN',1,NULL,?,?,?,?,?,?,?,?,?,?,7,?)`,
  [dependencies,component.dependencyManifestHash,payload,component.payloadHash,accounting,component.accountingHash,
    component.engineBindingHash,artifactHash,'LEGACY_BATCH','11111111-1111-4111-8111-111111111111',createdAt]);
  return { artifactHash, createdAt, payload };
}

async function exactV2() {
  const db = new sqlite3.Database(':memory:');
  await migrateCommerceWorkflowArtifacts(db); await migrateCommerceWorkflowArtifacts(db);
  const columns = new Set((await all(db, 'PRAGMA table_info(commerce_workflow_artifacts)')).map(item => item.name));
  for (const column of ['request_hash','integrity_version','engine_binding_hash','parser_binding_hash',
    'normalization_binding_hash','scoring_binding_hash','policy_binding_hash']) check(columns.has(column), `${column} exists`);
  const triggers = (await all(db, "SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='commerce_workflow_artifacts'")).map(item => item.name);
  check(triggers.includes('commerce_workflow_artifacts_parent_guard'), 'parent-chain guard exists');
  check(triggers.includes('commerce_workflow_artifacts_immutable_update')
    && triggers.includes('commerce_workflow_artifacts_immutable_delete'), 'immutability guards exist');
  await close(db);
}

async function donorEmpty() {
  const db = new sqlite3.Database(':memory:'); await donorFixture(db);
  await migrateCommerceWorkflowArtifacts(db);
  const columns = new Set((await all(db, 'PRAGMA table_info(commerce_workflow_artifacts)')).map(item => item.name));
  check(columns.has('integrity_version') && columns.has('request_hash'), 'empty exact donor-v1 is rebuilt as v2');
  await close(db);
}

async function donorPopulatedUpgrade() {
  const db = new sqlite3.Database(':memory:'); const original = await donorFixture(db, { populated: true });
  await migrateCommerceWorkflowArtifacts(db); await migrateCommerceWorkflowArtifacts(db);
  const [row] = await all(db, 'SELECT * FROM commerce_workflow_artifacts WHERE id=1');
  check(row.integrity_version === 1 && row.artifact_hash === original.artifactHash
    && row.created_at === original.createdAt && row.payload_json === original.payload,
  'populated donor row preserves exact identity, artifact hash, timestamp and payload as integrity v1');
  check(/^[a-f0-9]{64}$/.test(row.request_hash) && row.parser_binding_hash === null
    && row.normalization_binding_hash === null && row.scoring_binding_hash === null,
  'legacy row receives only a labeled surrogate request hash and no fabricated provenance bindings');
  const scope = { tenantId: 'tenant-a', workspaceId: 2, marketplace: 'AMAZON', actorId: 7 };
  const state = await getArtifactState(db, scope, 3);
  check(state.artifacts[0].integrityVersion === 1 && state.artifacts[0].canonicalDependencyEligible === false,
    'legacy artifact remains historically readable but explicitly ineligible as a canonical dependency');
  await assert.rejects(() => getArtifact(db, scope, 3, 1, 'AMAZON_ASIN_BATCH_PLAN'),
    error => error.code === 'LEGACY_WORKFLOW_ARTIFACT_REFREEZE_REQUIRED'); passed++;
  const saved = await appendArtifact(db, scope, 3, { kind: 'AMAZON_ASIN_BATCH_PLAN', expectedHeadArtifactId: 1,
    idempotencyKey: '22222222-2222-4222-8222-222222222222', changeReason: 'REFREEZE_AFTER_UPGRADE',
    dependencies: { xrayImports: [] }, payload: { batches: [] }, accounting: { selectedAsinCount: 0 },
    bindings: { engine: '1'.repeat(64), parser: '2'.repeat(64), normalization: '3'.repeat(64),
      scoring: '4'.repeat(64), policy: null } });
  check(saved.revisionNumber === 2 && saved.parentRevisionId === 1 && saved.integrityVersion === 2,
    'new v2 revision can descend from a validated v1 head without rewriting history');
  check((await all(db, 'PRAGMA foreign_key_check')).length === 0
    && (await all(db, 'PRAGMA integrity_check'))[0].integrity_check === 'ok', 'upgraded database passes SQLite checks');
  await close(db);
}

async function unknownAndTamperedFailClosed() {
  const unknown = new sqlite3.Database(':memory:');
  await run(unknown, 'CREATE TABLE commerce_workflow_artifacts (id INTEGER PRIMARY KEY, payload_json TEXT)');
  await run(unknown, "INSERT INTO commerce_workflow_artifacts(id,payload_json) VALUES (1,'{}')");
  await assert.rejects(() => migrateCommerceWorkflowArtifacts(unknown),
    error => error.code === 'COMMERCE_WORKFLOW_ARTIFACT_SCHEMA_INCOMPATIBLE' && error.details.classification === 'UNKNOWN_SCHEMA'); passed++;
  check((await all(unknown, 'SELECT * FROM commerce_workflow_artifacts')).length === 1, 'unknown schema remains untouched');
  await close(unknown);

  const tampered = new sqlite3.Database(':memory:'); await donorFixture(tampered, { populated: true, tampered: true });
  await assert.rejects(() => migrateCommerceWorkflowArtifacts(tampered),
    error => error.details?.classification === 'DONOR_V1_INTEGRITY_FAILURE'); passed++;
  const columns = new Set((await all(tampered, 'PRAGMA table_info(commerce_workflow_artifacts)')).map(item => item.name));
  check(!columns.has('integrity_version') && (await all(tampered, 'SELECT COUNT(*) AS n FROM commerce_workflow_artifacts'))[0].n === 1,
    'tampered donor database fails before DDL and remains structurally v1');
  await close(tampered);
}

(async () => {
  await exactV2(); await donorEmpty(); await donorPopulatedUpgrade(); await unknownAndTamperedFailClosed();
  console.log(`R4.3 W2 artifact migration: ${passed}/${passed} PASS`);
})().catch(error => { console.error(error); process.exit(1); });
