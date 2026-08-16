const LISTING_SCOPE_MIGRATION = '002_listing_workspace_scope';

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

async function addColumnIfMissing(db, existingColumns, name, definition) {
  if (existingColumns.has(name)) return;
  await run(db, `ALTER TABLE listings ADD COLUMN ${name} ${definition}`);
  existingColumns.add(name);
}

async function migrateListingWorkspaceScope(db) {
  const columns = new Set((await all(db, 'PRAGMA table_info(listings)')).map(column => column.name));

  await addColumnIfMissing(db, columns, 'tenant_id', 'TEXT NULL');
  await addColumnIfMissing(db, columns, 'workspace_id', 'INTEGER NULL REFERENCES workspaces(id)');
  await addColumnIfMissing(db, columns, 'marketplace', "TEXT NULL CHECK(marketplace IN ('AMAZON', 'ETSY'))");

  // Legacy rows intentionally remain unscoped (NULL) and therefore invisible
  // to tenant-scoped APIs. Guessing ownership during migration would create an
  // IDOR risk. A later administrative reconciliation may assign them explicitly.
  await run(db, `
    CREATE INDEX IF NOT EXISTS idx_listings_scope_generated
    ON listings (tenant_id, workspace_id, marketplace, generatedAt DESC)
  `);
}

async function runMigrations(db) {
  await run(db, `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const applied = await all(db, 'SELECT id FROM schema_migrations WHERE id = ?', [LISTING_SCOPE_MIGRATION]);
  if (applied.length === 0) {
    await run(db, 'BEGIN IMMEDIATE');
    try {
      await migrateListingWorkspaceScope(db);
      await run(db, 'INSERT INTO schema_migrations (id) VALUES (?)', [LISTING_SCOPE_MIGRATION]);
      await run(db, 'COMMIT');
    } catch (error) {
      try { await run(db, 'ROLLBACK'); } catch (_) {}
      throw error;
    }
  }
}

module.exports = {
  LISTING_SCOPE_MIGRATION,
  runMigrations
};
