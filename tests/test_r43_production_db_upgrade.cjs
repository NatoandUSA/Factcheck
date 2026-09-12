'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const sqlite3 = require('sqlite3').verbose();
const { runMigrations, COMMERCE_WORKFLOW_ARTIFACT_MIGRATION } = require('../server/database/migrations');
const { canonicalJson, hashBytes } = require('../server/revisionStore');

const source = process.argv[2];
const synthetic = !source || source === '--synthetic';
if (!synthetic && (!source || !fs.existsSync(source))) throw new Error(
  'Usage: node tests/test_r43_production_db_upgrade.cjs <database-copy-source|--synthetic>');
const probe = path.join(os.tmpdir(), `omniseller-r43-upgrade-${crypto.randomUUID()}.db`);
if (!synthetic) fs.copyFileSync(source, probe);
const open = () => new sqlite3.Database(probe);
const run = (db, sql, params = []) => new Promise((resolve, reject) => db.run(sql, params,
  error => error ? reject(error) : resolve()));
const all = (db, sql, params = []) => new Promise((resolve, reject) => db.all(sql, params,
  (error, rows) => error ? reject(error) : resolve(rows)));
const close = db => new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()));

(async () => {
  let db;
  if (synthetic) {
    // Build the synthetic production-like base through the same schema and
    // migration bootstrap as the application. This keeps CI self-contained
    // and prevents a developer's untracked server/app.db from becoming a
    // hidden test prerequisite.
    process.env.NODE_ENV = 'development';
    process.env.OMNI_DB_PATH = probe;
    const runtime = require('../server/server');
    db = runtime.db;
    await runtime.databaseReady;
    await run(db, "INSERT INTO users(id,email,role,name) VALUES (7,'migration@test.local','OWNER','Migration Owner')");
    await run(db, "INSERT INTO workspaces(id,tenant_id,marketplace,name) VALUES (2,'tenant-a','AMAZON','Migration Workspace')");
    await run(db, `INSERT INTO research_projects(id,tenant_id,workspace_id,marketplace,name,seed_phrase,state,actor_id)
      VALUES (3,'tenant-a',2,'AMAZON','Migration Fixture','hija','EVIDENCE_INTAKE',7)`);
    await runMigrations(db);
    await run(db, 'DROP TRIGGER commerce_workflow_artifacts_parent_guard');
    await run(db, 'DROP TRIGGER commerce_workflow_artifacts_immutable_update');
    await run(db, 'DROP TRIGGER commerce_workflow_artifacts_immutable_delete');
    await run(db, 'DROP INDEX idx_commerce_workflow_artifacts_scope');
    await run(db, 'DROP TABLE commerce_workflow_artifacts');
    await run(db, 'DELETE FROM schema_migrations WHERE id=?', [COMMERCE_WORKFLOW_ARTIFACT_MIGRATION]);
    await run(db, `CREATE TABLE commerce_workflow_artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,tenant_id TEXT NOT NULL,workspace_id INTEGER NOT NULL,
      marketplace TEXT NOT NULL,project_id INTEGER NOT NULL,kind TEXT NOT NULL,revision_number INTEGER NOT NULL,
      parent_revision_id INTEGER,dependency_manifest_json TEXT NOT NULL,dependency_manifest_hash TEXT NOT NULL,
      payload_json TEXT NOT NULL,payload_hash TEXT NOT NULL,accounting_json TEXT NOT NULL,accounting_hash TEXT NOT NULL,
      engine_binding_hash TEXT NOT NULL,artifact_hash TEXT NOT NULL,change_reason TEXT NOT NULL,idempotency_key TEXT NOT NULL,
      created_by INTEGER NOT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(project_id,kind,revision_number),UNIQUE(tenant_id,workspace_id,marketplace,kind,idempotency_key))`);
    await run(db, `CREATE INDEX idx_commerce_workflow_artifacts_scope
      ON commerce_workflow_artifacts(tenant_id,workspace_id,marketplace,project_id,kind,revision_number)`);
    await run(db, `CREATE TRIGGER commerce_workflow_artifacts_immutable_update BEFORE UPDATE ON commerce_workflow_artifacts
      BEGIN SELECT RAISE(ABORT,'IMMUTABLE_COMMERCE_WORKFLOW_ARTIFACT'); END`);
    await run(db, `CREATE TRIGGER commerce_workflow_artifacts_immutable_delete BEFORE DELETE ON commerce_workflow_artifacts
      BEGIN SELECT RAISE(ABORT,'IMMUTABLE_COMMERCE_WORKFLOW_ARTIFACT'); END`);
    const workspace = { id: 2, tenant_id: 'tenant-a' }; const user = { id: 7 }; const project = { id: 3 };
    const dependencyJson = canonicalJson({ xrayImports: [] }); const payloadJson = canonicalJson({ batches: [] });
    const accountingJson = canonicalJson({ selectedAsinCount: 0 });
    const component = { dependencyManifestHash: hashBytes(dependencyJson), payloadHash: hashBytes(payloadJson),
      accountingHash: hashBytes(accountingJson), engineBindingHash: 'e'.repeat(64) };
    await run(db, `INSERT INTO commerce_workflow_artifacts
      (tenant_id,workspace_id,marketplace,project_id,kind,revision_number,parent_revision_id,dependency_manifest_json,
       dependency_manifest_hash,payload_json,payload_hash,accounting_json,accounting_hash,engine_binding_hash,artifact_hash,
       change_reason,idempotency_key,created_by,created_at) VALUES (?,?,'AMAZON',?,'AMAZON_ASIN_BATCH_PLAN',1,NULL,
       ?,?,?,?,?,?,?,?,'SYNTHETIC_DONOR','11111111-1111-4111-8111-111111111111',?,'2026-09-11T12:34:56.000Z')`,
    [workspace.tenant_id,workspace.id,project.id,dependencyJson,component.dependencyManifestHash,payloadJson,
      component.payloadHash,accountingJson,component.accountingHash,component.engineBindingHash,
      hashBytes(canonicalJson(component)),user.id]);
    await run(db, "INSERT OR IGNORE INTO schema_migrations(id) VALUES ('016_marketplace_research_workflow_artifacts')");
  } else db = open();
  const exists = await all(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='commerce_workflow_artifacts'");
  assert.equal(exists.length, 1, 'fixture must contain the deployed donor artifact table');
  const before = await all(db, `SELECT id,artifact_hash,created_at,payload_json FROM commerce_workflow_artifacts ORDER BY id`);
  assert.ok(before.length > 0, 'fixture must contain populated donor rows');
  await runMigrations(db); await runMigrations(db);
  const after = await all(db, `SELECT id,artifact_hash,created_at,payload_json,integrity_version,
    canonicalDependencyEligible FROM (SELECT *, integrity_version=2 AS canonicalDependencyEligible
      FROM commerce_workflow_artifacts) ORDER BY id`);
  assert.deepEqual(after.slice(0, before.length).map(row => ({ id: row.id, artifact_hash: row.artifact_hash,
    created_at: row.created_at, payload_json: row.payload_json })), before, 'legacy identity/hash/timestamp/payload must be preserved');
  assert.ok(after.slice(0, before.length).every(row => row.integrity_version === 1 && !row.canonicalDependencyEligible));
  assert.equal((await all(db, 'PRAGMA foreign_key_check(commerce_workflow_artifacts)')).length, 0);
  assert.equal((await all(db, 'PRAGMA integrity_check'))[0].integrity_check, 'ok');
  assert.equal((await all(db, 'SELECT COUNT(*) n FROM schema_migrations WHERE id=?',
    [COMMERCE_WORKFLOW_ARTIFACT_MIGRATION]))[0].n, 1, 'upgrade receipt must be written exactly once');
  await close(db);
  db = open();
  assert.equal((await all(db, 'SELECT COUNT(*) n FROM commerce_workflow_artifacts'))[0].n, after.length,
    'restart must preserve the upgraded artifact ledger');
  await close(db);
  console.log(`R4.3 production-like DB upgrade: ${before.length} legacy rows preserved; restart PASS`);
})().finally(() => { try { fs.unlinkSync(probe); } catch (_) {} }).catch(error => { console.error(error); process.exit(1); });
