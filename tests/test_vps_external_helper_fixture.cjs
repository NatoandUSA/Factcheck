// Disposable operational fixture for the external backup helper. It creates
// only a temporary SQLite database, proves source no-write, then verifies the
// canonical snapshot archive and a fresh extraction.
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const sqlite3 = require('sqlite3').verbose();
const { runMigrations } = require('../server/database/migrations');

const helper = process.env.EXTERNAL_HELPER_PATH;
const migrationModule = process.env.MIGRATIONS_MODULE_PATH || require.resolve('../server/database/migrations');
assert(helper && path.isAbsolute(helper), 'EXTERNAL_HELPER_PATH must be absolute');

const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const open = (file, flags) => new Promise((resolve, reject) => {
  const db = new sqlite3.Database(file, flags, (error) => error ? reject(error) : resolve(db));
});
const exec = (db, sql) => new Promise((resolve, reject) => db.exec(sql, (error) => error ? reject(error) : resolve()));
const get = (db, sql) => new Promise((resolve, reject) => db.get(sql, (error, row) => error ? reject(error) : resolve(row)));
const close = (db) => new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vps-external-helper-'));
  try {
    const source = path.join(root, 'source.db');
    const snapshot = path.join(root, 'backup', 'app.db');
    const rehearsal = path.join(root, 'backup', 'rehearsal.db');
    const report = path.join(root, 'backup', 'rehearsal-report.json');
    const db = await open(source, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);
    try {
      await exec(db, `CREATE TABLE workspaces (id INTEGER PRIMARY KEY, tenant_id TEXT NOT NULL, marketplace TEXT NOT NULL, name TEXT NOT NULL);
        CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT);
        CREATE TABLE listings (id INTEGER PRIMARY KEY, amazonTitle TEXT, tenant_id TEXT, workspace_id INTEGER,
          marketplace TEXT, status TEXT, listing_version INTEGER, approved_version INTEGER, approved_hash TEXT,
          approved_by INTEGER, approved_at TEXT, authorId INTEGER, product_truth_card TEXT,
          product_truth_notes TEXT, payload TEXT);
        CREATE TABLE research_projects (id INTEGER PRIMARY KEY, tenant_id TEXT NOT NULL, workspace_id INTEGER NOT NULL,
          marketplace TEXT NOT NULL, name TEXT NOT NULL, seed_phrase TEXT NOT NULL, state TEXT,
          reference_asin TEXT, batch_count INTEGER, product_truth_notes TEXT, validated_at TEXT,
          validated_by INTEGER, actor_id INTEGER NOT NULL, updated_at TEXT, created_at TEXT);`);
      await runMigrations(db);
      await exec(db, "INSERT INTO listings (id, tenant_id, workspace_id, marketplace, status, listing_version) VALUES (1, 'fixture-tenant', 1, 'AMAZON', 'NEEDS_QA', 1)");
    } finally { await close(db); }
    const sourceBefore = hash(source);
    execFileSync(process.execPath, [helper, source, snapshot, rehearsal, report], {
      env: { ...process.env, MIGRATIONS_MODULE: migrationModule }, stdio: 'inherit'
    });
    assert.strictEqual(hash(source), sourceBefore, 'read-only source DB changed during rehearsal');
    assert.strictEqual(JSON.parse(fs.readFileSync(report, 'utf8')).result, 'PASS');
    const backup = path.join(root, 'backup');
    execFileSync('sha256sum', ['app.db', 'rehearsal.db', 'rehearsal-report.json'], { cwd: backup, stdio: ['ignore', fs.openSync(path.join(backup, 'checksums.sha256'), 'w'), 'inherit'] });
    execFileSync('sha256sum', ['-c', 'checksums.sha256'], { cwd: backup, stdio: 'inherit' });
    const archive = path.join(root, 'backup.tar.gz');
    execFileSync('tar', ['-C', backup, '-czf', archive, 'app.db', 'rehearsal.db', 'rehearsal-report.json', 'checksums.sha256']);
    const extract = path.join(root, 'extract'); fs.mkdirSync(extract);
    execFileSync('tar', ['-xzf', archive, '-C', extract]);
    execFileSync('sha256sum', ['-c', 'checksums.sha256'], { cwd: extract, stdio: 'inherit' });
    const restored = await open(path.join(extract, 'app.db'), sqlite3.OPEN_READONLY);
    try { assert.strictEqual((await get(restored, 'PRAGMA integrity_check')).integrity_check, 'ok'); }
    finally { await close(restored); }
    console.log('VPS_EXTERNAL_HELPER_SNAPSHOT_ARCHIVE_NOWRITE=PASS');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
