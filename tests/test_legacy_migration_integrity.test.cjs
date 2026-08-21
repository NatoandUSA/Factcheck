const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const { runMigrations, PROJECT_SCOPED_EVIDENCE_MIGRATION } = require('../server/database/migrations');

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function(err) { err ? reject(err) : resolve(this); }));
}

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}

async function runMigrationIntegrityTests() {
  console.log('================================================================');
  console.log('  TESTING LEGACY MIGRATION IDEMPOTENCY & ISOLATION SUITE');
  console.log('================================================================\n');

  const tmpDbPath = path.join(__dirname, `../tmp_migration_test_${Date.now()}.db`);
  const db = new sqlite3.Database(tmpDbPath);

  try {
    // 1. Setup Legacy Schema (before project_id was added)
    console.log('Test 1: Setting up legacy database schema...');
    await dbRun(db, `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await dbRun(db, `
      CREATE TABLE IF NOT EXISTS research_evidence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        workspace_id INTEGER NOT NULL,
        marketplace TEXT NOT NULL,
        seed_phrase TEXT NOT NULL,
        source TEXT NOT NULL,
        actor_id INTEGER NOT NULL,
        evidence_state TEXT DEFAULT 'ACCEPTED'
      )
    `);

    await dbRun(db, `
      CREATE TABLE IF NOT EXISTS market_trends (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT,
        trending_keywords TEXT,
        marketplace TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        workspace_id INTEGER NOT NULL
      )
    `);

    await dbRun(db, `
      CREATE TABLE IF NOT EXISTS listings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        amazonTitle TEXT,
        etsyTitle TEXT,
        tenant_id TEXT,
        workspace_id INTEGER,
        marketplace TEXT,
        generatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await dbRun(db, `
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);

    // Insert legacy unscoped rows (project_id column doesn't exist yet)
    await dbRun(db, "INSERT INTO research_evidence (tenant_id, workspace_id, marketplace, seed_phrase, source, actor_id, evidence_state) VALUES ('tenant-1', 1, 'AMAZON', 'legacy seed', 'H10', 1, 'ACCEPTED')");
    await dbRun(db, "INSERT INTO market_trends (tenant_id, workspace_id, marketplace, category) VALUES ('tenant-1', 1, 'AMAZON', 'Apparel')");
    console.log('  🟢 Legacy database populated with unscoped rows.');

    // 2. Run Migration First Time
    console.log('\nTest 2: Running migrations (First Execution)...');
    await runMigrations(db);
    
    const cols = await dbAll(db, 'PRAGMA table_info(research_evidence)');
    assert.ok(cols.some(c => c.name === 'project_id'), 'project_id column must exist after migration');

    const legacyRow = await dbAll(db, 'SELECT * FROM research_evidence WHERE seed_phrase = "legacy seed"');
    assert.strictEqual(legacyRow[0].project_id, null, 'Unscoped legacy evidence must remain project_id NULL (never auto-backfilled)');
    console.log('  🟢 First migration run succeeded: project_id column added, legacy rows remain NULL.');

    // 3. Run Migration Second Time (Idempotency Check)
    console.log('\nTest 3: Running migrations (Second Execution - Idempotency Check)...');
    await runMigrations(db);
    console.log('  🟢 Second migration run succeeded cleanly without errors (Idempotent).');

    // 4. Verify Composite Indexes Creation
    console.log('\nTest 4: Verifying composite indexes...');
    const indexes = await dbAll(db, "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'");
    const indexNames = indexes.map(i => i.name);
    assert.ok(indexNames.includes('idx_research_evidence_proj'), 'idx_research_evidence_proj index missing');
    assert.ok(indexNames.includes('idx_market_trends_proj'), 'idx_market_trends_proj index missing');
    assert.ok(indexNames.includes('idx_listings_proj'), 'idx_listings_proj index missing');
    console.log('  🟢 Composite indexes verified: idx_research_evidence_proj, idx_market_trends_proj, idx_listings_proj.');

    console.log('\n================================================================');
    console.log('  🟢 ALL LEGACY MIGRATION IDEMPOTENCY & ISOLATION TESTS PASSED');
    console.log('================================================================\n');
  } finally {
    db.close();
    if (fs.existsSync(tmpDbPath)) {
      try { fs.unlinkSync(tmpDbPath); } catch (_) {}
    }
  }
}

runMigrationIntegrityTests().catch(err => {
  console.error('🔴 MIGRATION INTEGRITY TEST FAILED:', err);
  process.exit(1);
});
