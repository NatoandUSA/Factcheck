#!/usr/bin/env node
/*
 * Creates and proves a canonical SQLite snapshot for the immutable VPS
 * release runbook.  It never opens the immutable snapshot for writing after
 * it has been made: all integrity/migration checks run on a rehearsal copy.
 */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { runMigrations } = require(process.env.MIGRATIONS_MODULE || '../server/database/migrations');

const [sourceDb, snapshotDb, rehearsalDb, reportPath] = process.argv.slice(2);

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const sqlString = (value) => `'${String(value).replace(/'/g, "''")}'`;
const open = (filename, flags) => new Promise((resolve, reject) => {
  const db = new sqlite3.Database(filename, flags, (error) => error ? reject(error) : resolve(db));
});
const close = (db) => new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));
const all = (db, sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));
const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
const exec = (db, sql) => new Promise((resolve, reject) => db.exec(sql, (error) => error ? reject(error) : resolve()));

async function integrity(db) {
  const row = await get(db, 'PRAGMA integrity_check');
  assert.strictEqual(row.integrity_check, 'ok', 'SQLite integrity_check must be ok');
}

async function tableExists(db, name) {
  return Boolean(await get(db, "SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name = ?", [name]));
}

async function authoritySnapshot(db) {
  const output = {
    listings: [], researchEvidence: [], researchProjects: [], marketTrends: [],
    evidenceAcceptanceEvents: [], evidenceAdoptionEvents: [], projectTransitionEvents: [],
    scopeCounts: []
  };
  if (await tableExists(db, 'listings')) {
    output.listings = await all(db, `SELECT id, tenant_id, workspace_id, marketplace, status, listing_version,
      approved_version, approved_hash, approved_by, approved_at, authorId,
      product_truth_card, product_truth_notes, payload
      FROM listings ORDER BY tenant_id, workspace_id, marketplace, id`);
  }
  if (await tableExists(db, 'research_evidence')) {
    output.researchEvidence = await all(db, `SELECT id, tenant_id, workspace_id, marketplace, project_id,
      seed_phrase, source, source_url, file_name, actor_id, evidence_state,
      accepted_at, accepted_by, metadata, created_at FROM research_evidence
      ORDER BY tenant_id, workspace_id, marketplace, project_id, id`);
  }
  if (await tableExists(db, 'research_projects')) {
    output.researchProjects = await all(db, `SELECT id, tenant_id, workspace_id, marketplace, name,
      seed_phrase, state, reference_asin, batch_count, product_truth_notes, validated_at,
      validated_by, actor_id, updated_at, created_at FROM research_projects
      ORDER BY tenant_id, workspace_id, marketplace, id`);
  }
  if (await tableExists(db, 'market_trends')) {
    output.marketTrends = await all(db, `SELECT id, tenant_id, workspace_id, marketplace, project_id,
      category, trending_keywords, processed FROM market_trends
      ORDER BY tenant_id, workspace_id, marketplace, project_id, id`);
  }
  if (await tableExists(db, 'evidence_acceptance_events')) {
    output.evidenceAcceptanceEvents = await all(db, `SELECT id, tenant_id, workspace_id, marketplace,
      project_id, evidence_id, actor_id, reason, created_at FROM evidence_acceptance_events
      ORDER BY tenant_id, workspace_id, marketplace, project_id, evidence_id, id`);
  }
  if (await tableExists(db, 'evidence_adoption_events')) {
    output.evidenceAdoptionEvents = await all(db, `SELECT id, tenant_id, workspace_id, marketplace,
      project_id, evidence_id, actor_id, created_at FROM evidence_adoption_events
      ORDER BY tenant_id, workspace_id, marketplace, project_id, evidence_id, id`);
  }
  if (await tableExists(db, 'project_transition_events')) {
    output.projectTransitionEvents = await all(db, `SELECT id, tenant_id, workspace_id, marketplace,
      project_id, previous_state, target_state, actor_id, reason, created_at
      FROM project_transition_events
      ORDER BY tenant_id, workspace_id, marketplace, project_id, id`);
  }
  output.scopeCounts = await all(db, `SELECT tenant_id, workspace_id, marketplace, COUNT(*) AS listing_count
    FROM listings GROUP BY tenant_id, workspace_id, marketplace
    ORDER BY tenant_id, workspace_id, marketplace`);
  const canonical = JSON.stringify(output);
  return { sha256: sha256(canonical), rowCounts: {
    listings: output.listings.length,
    researchEvidence: output.researchEvidence.length,
    researchProjects: output.researchProjects.length,
    marketTrends: output.marketTrends.length,
    evidenceAcceptanceEvents: output.evidenceAcceptanceEvents.length,
    evidenceAdoptionEvents: output.evidenceAdoptionEvents.length,
    projectTransitionEvents: output.projectTransitionEvents.length
  }, scopeCounts: output.scopeCounts };
}

async function schemaSnapshot(db) {
  const migrations = await all(db, 'SELECT id FROM schema_migrations ORDER BY id');
  const schema = await all(db, `SELECT type, name, tbl_name, sql FROM sqlite_master
    WHERE type IN ('table', 'index') AND name NOT LIKE 'sqlite_%' ORDER BY type, name`);
  return { migrations, sha256: sha256(JSON.stringify({ migrations, schema })) };
}

async function main() {
  if (![sourceDb, snapshotDb, rehearsalDb, reportPath].every(Boolean)) {
    throw new Error('Usage: vps_backup_rehearsal.cjs <source-db> <snapshot-db> <rehearsal-db> <report.json>');
  }
  for (const candidate of [sourceDb, snapshotDb, rehearsalDb, reportPath]) {
    if (!path.isAbsolute(candidate)) throw new Error(`Absolute path required: ${candidate}`);
  }
  if (fs.existsSync(snapshotDb) || fs.existsSync(rehearsalDb)) {
    throw new Error('Snapshot and rehearsal destinations must not already exist');
  }
  fs.mkdirSync(path.dirname(snapshotDb), { recursive: true });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });

  // The caller has already stopped the service and confirmed no writer.  Open
  // source read-only so snapshot creation cannot alter live production state.
  const source = await open(sourceDb, sqlite3.OPEN_READONLY);
  try {
    await integrity(source);
    await exec(source, `VACUUM INTO ${sqlString(snapshotDb)}`);
  } finally {
    await close(source);
  }

  const immutable = await open(snapshotDb, sqlite3.OPEN_READONLY);
  let beforeAuthority;
  let beforeSchema;
  try {
    await integrity(immutable);
    beforeAuthority = await authoritySnapshot(immutable);
    beforeSchema = await schemaSnapshot(immutable);
  } finally {
    await close(immutable);
  }

  fs.copyFileSync(snapshotDb, rehearsalDb, fs.constants.COPYFILE_EXCL);
  const rehearsal = await open(rehearsalDb, sqlite3.OPEN_READWRITE);
  let afterAuthority;
  let afterSchema;
  try {
    await integrity(rehearsal);
    await runMigrations(rehearsal);
    await integrity(rehearsal);
    afterAuthority = await authoritySnapshot(rehearsal);
    afterSchema = await schemaSnapshot(rehearsal);
  } finally {
    await close(rehearsal);
  }

  assert.strictEqual(afterAuthority.sha256, beforeAuthority.sha256,
    'Authority data changed during restore/migration rehearsal');
  assert.strictEqual(afterSchema.sha256, beforeSchema.sha256,
    'Migration/schema differs after rehearsal; explicit compatibility approval is required');

  const report = {
    result: 'PASS',
    snapshotMode: 'VACUUM_INTO_CANONICAL_SINGLE_FILE',
    sourceReadOnly: true,
    snapshotIntegrity: 'ok',
    rehearsalIntegrity: 'ok',
    migrationStatus: 'NO_SCHEMA_OR_MIGRATION_CHANGE',
    authorityBefore: beforeAuthority,
    authorityAfter: afterAuthority,
    schemaBefore: beforeSchema,
    schemaAfter: afterSchema
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  console.log('CANONICAL_SNAPSHOT_REHEARSAL=PASS');
}

module.exports = { authoritySnapshot, schemaSnapshot, integrity, open, close, sqlite3 };
if (require.main === module) {
  main().catch((error) => {
    console.error(`CANONICAL_SNAPSHOT_REHEARSAL=FAIL: ${error.stack || error.message}`);
    process.exit(1);
  });
}
