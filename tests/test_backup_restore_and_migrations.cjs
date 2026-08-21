const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const assert = require("assert");

const { runMigrations } = require("../server/database/migrations");

console.log("================================================================");
console.log("  TESTING DATABASE MIGRATIONS, EMPTY DB, AND BACKUP/RESTORE");
console.log("================================================================\n");

async function testMigrationsAndBackup() {
  const tmpDir = path.resolve("./data/test_tmp");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const freshDbPath = path.join(tmpDir, "fresh_test.db");
  const backupDbPath = path.join(tmpDir, "backup_test.db");
  if (fs.existsSync(freshDbPath)) fs.unlinkSync(freshDbPath);
  if (fs.existsSync(backupDbPath)) fs.unlinkSync(backupDbPath);

  // 1. Test Fresh DB creation and full migration run
  console.log("Step 1: Fresh DB creation & migration run...");
  const db = new sqlite3.Database(freshDbPath);
  
  await new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run("PRAGMA foreign_keys = ON;");
      db.run(`
        CREATE TABLE workspaces (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tenant_id TEXT NOT NULL,
          marketplace TEXT NOT NULL,
          name TEXT NOT NULL
        )
      `);
      db.run(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          name TEXT
        )
      `);
      db.run(`
        CREATE TABLE listings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          amazonTitle TEXT
        )
      `);
      db.run(`
        CREATE TABLE research_projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tenant_id TEXT NOT NULL,
          workspace_id INTEGER NOT NULL,
          marketplace TEXT NOT NULL,
          name TEXT NOT NULL,
          seed_phrase TEXT NOT NULL,
          actor_id INTEGER NOT NULL
        )
      `, (err) => err ? reject(err) : resolve());
    });
  });

  await runMigrations(db);

  // Assert all migrated tables and columns exist
  const tables = await new Promise((resolve, reject) => {
    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => err ? reject(err) : resolve(rows.map(r => r.name)));
  });

  assert(tables.includes("schema_migrations"), "schema_migrations table must exist");
  assert(tables.includes("llm_settings"), "llm_settings table must exist");
  assert(tables.includes("reauth_nonces"), "reauth_nonces table must exist");

  const projectCols = await new Promise((resolve, reject) => {
    db.all("PRAGMA table_info(research_projects)", (err, rows) => err ? reject(err) : resolve(rows.map(r => r.name)));
  });
  assert(projectCols.includes("product_truth_notes"), "research_projects must have product_truth_notes");
  assert(projectCols.includes("validated_at"), "research_projects must have validated_at");

  console.log("  🟢 Fresh DB schema migrations executed cleanly and verified.");

  // 2. Insert test data
  console.log("\nStep 2: Populating test data for Backup/Restore test...");
  await new Promise((resolve, reject) => {
    db.run("INSERT INTO users (email, name) VALUES ('owner@test.local', 'Store Owner')", (err) => err ? reject(err) : resolve());
  });
  await new Promise((resolve, reject) => {
    db.run("INSERT INTO research_projects (tenant_id, workspace_id, marketplace, name, seed_phrase, actor_id, product_truth_notes) VALUES ('t1', 1, 'AMAZON', 'Backup Test Project', 'seed1', 1, 'Verified 100% Linen')", (err) => err ? reject(err) : resolve());
  });

  // 3. Perform SQLite Backup using VACUUM INTO
  console.log("\nStep 3: Creating SQLite online backup via VACUUM INTO...");
  await new Promise((resolve, reject) => {
    db.run("VACUUM INTO '" + backupDbPath + "'", (err) => err ? reject(err) : resolve());
  });
  assert(fs.existsSync(backupDbPath), "Backup file must be created on disk");
  console.log("  🟢 Database online backup created successfully.");

  // 4. Mutate / Corrupt live database state
  console.log("\nStep 4: Mutating live DB state (deleting project and inserting corrupt data)...");
  await new Promise((resolve, reject) => {
    db.run("DELETE FROM research_projects", (err) => err ? reject(err) : resolve());
  });
  const mutatedProjects = await new Promise((resolve, reject) => {
    db.all("SELECT * FROM research_projects", (err, rows) => err ? reject(err) : resolve(rows));
  });
  assert.strictEqual(mutatedProjects.length, 0, "Live DB projects deleted");

  // 5. Close DB and Restore from Backup
  console.log("\nStep 5: Restoring database from backup file...");
  await new Promise((resolve) => db.close(resolve));
  fs.copyFileSync(backupDbPath, freshDbPath);

  // 6. Open Restored DB and assert state integrity
  const restoredDb = new sqlite3.Database(freshDbPath);
  const restoredProjects = await new Promise((resolve, reject) => {
    restoredDb.all("SELECT * FROM research_projects", (err, rows) => err ? reject(err) : resolve(rows));
  });
  assert.strictEqual(restoredProjects.length, 1, "Restored DB must contain exactly 1 project");
  assert.strictEqual(restoredProjects[0].name, "Backup Test Project");
  assert.strictEqual(restoredProjects[0].product_truth_notes, "Verified 100% Linen");

  await new Promise((resolve) => restoredDb.close(resolve));

  // Cleanup test files
  fs.unlinkSync(freshDbPath);
  fs.unlinkSync(backupDbPath);
  fs.rmdirSync(tmpDir);

  console.log("  🟢 Database restore verified with 100% data integrity.");
  console.log("\n================================================================");
  console.log("  🟢 ALL MIGRATION & BACKUP/RESTORE TESTS PASSED CLEANLY!");
  console.log("================================================================\n");
}

testMigrationsAndBackup().catch(err => {
  console.error("🔴 MIGRATION/BACKUP TEST FAILED:", err);
  process.exit(1);
});
