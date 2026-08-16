const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { LISTING_SCOPE_MIGRATION, runMigrations } = require('../server/database/migrations');

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, err => err ? reject(err) : resolve()));
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-migration-'));
  const dbPath = path.join(tempDir, 'legacy-app.db');
  const db = new sqlite3.Database(dbPath);

  try {
    await run(db, `CREATE TABLE workspaces (id INTEGER PRIMARY KEY)`);
    await run(db, `CREATE TABLE users (id INTEGER PRIMARY KEY)`);
    await run(db, `CREATE TABLE sessions (id INTEGER PRIMARY KEY)`);
    await run(db, `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)`);
    await run(db, `
      CREATE TABLE listings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        amazonTitle TEXT,
        status TEXT,
        generatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        payload TEXT
      )
    `);
    await run(db, `INSERT INTO listings (amazonTitle, status, payload) VALUES (?, ?, ?)`, [
      'Legacy listing must be preserved',
      'NEEDS_QA',
      '{}'
    ]);

    await runMigrations(db);
    await runMigrations(db); // idempotency

    const columns = await all(db, 'PRAGMA table_info(listings)');
    const names = new Set(columns.map(column => column.name));
    for (const required of ['tenant_id', 'workspace_id', 'marketplace', 'listing_version', 'approved_version', 'approved_hash', 'approved_by', 'approved_at']) {
      assert(names.has(required), `Migration did not add ${required}`);
    }

    const legacyRows = await all(db, 'SELECT * FROM listings');
    assert.strictEqual(legacyRows.length, 1, 'Migration lost or duplicated legacy rows');
    assert.strictEqual(legacyRows[0].amazonTitle, 'Legacy listing must be preserved');
    assert.strictEqual(legacyRows[0].tenant_id, null, 'Legacy ownership must not be guessed');
    assert.strictEqual(legacyRows[0].workspace_id, null, 'Legacy workspace must not be guessed');
    assert.strictEqual(legacyRows[0].marketplace, null, 'Legacy marketplace must not be guessed');

    const migrations = await all(db, 'SELECT id FROM schema_migrations WHERE id = ?', [LISTING_SCOPE_MIGRATION]);
    assert.strictEqual(migrations.length, 1, 'Migration marker must be applied exactly once');

    console.log('🟢 LISTING SCOPE MIGRATION: legacy data preserved, scope added, idempotency passed');
  } finally {
    await new Promise(resolve => db.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error('🔴 LISTING SCOPE MIGRATION FAILED:', error);
  process.exitCode = 1;
});
