const LISTING_SCOPE_MIGRATION = '002_listing_workspace_scope';
const SECURITY_CONTROLS_MIGRATION = '003_security_controls';
const KEYWORD_DETAIL_MIGRATION = '004_keyword_detail_and_authorship';
const MARKET_TRENDS_MARKETPLACE_MIGRATION = '005_market_trends_marketplace';
const WORKSPACE_OWNERSHIP_MIGRATION = '006_market_trends_and_templates_ownership';

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

async function addColumnIfMissing(db, existingColumns, name, definition, table = 'listings') {
  if (existingColumns.has(name)) return;
  await run(db, `ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
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

async function migrateSecurityControls(db) {
  const columns = new Set((await all(db, 'PRAGMA table_info(listings)')).map(column => column.name));
  await addColumnIfMissing(db, columns, 'listing_version', 'INTEGER NOT NULL DEFAULT 1');
  await addColumnIfMissing(db, columns, 'approved_version', 'INTEGER NULL');
  await addColumnIfMissing(db, columns, 'approved_hash', 'TEXT NULL');
  await addColumnIfMissing(db, columns, 'approved_by', 'INTEGER NULL REFERENCES users(id)');
  await addColumnIfMissing(db, columns, 'approved_at', 'DATETIME NULL');

  await run(db, `
    CREATE TABLE IF NOT EXISTS llm_settings (
      tenant_id TEXT NOT NULL,
      workspace_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      encrypted_value TEXT NOT NULL,
      updated_by INTEGER NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (tenant_id, workspace_id, key),
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id),
      FOREIGN KEY(updated_by) REFERENCES users(id)
    )
  `);
  await run(db, `
    CREATE TABLE IF NOT EXISTS reauth_nonces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nonce_hash TEXT UNIQUE NOT NULL,
      session_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      workspace_id INTEGER NOT NULL,
      purpose TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      consumed_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  // Legacy secrets were global, plaintext, and could not be assigned to a
  // tenant safely. Purge only credential rows; owners must re-enter them into
  // the encrypted workspace-scoped store after this migration.
  await run(db, `
    DELETE FROM settings
    WHERE key IN ('gemini_api_key', 'openai_api_key', 'claude_api_key')
  `);
}

async function migrateKeywordDetailAndAuthorship(db) {
  const tableExists = await all(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='market_trends'");
  if (tableExists.length === 0) return; // table is created by server.js before migrations run in production
  const trendColumns = new Set((await all(db, 'PRAGMA table_info(market_trends)')).map(column => column.name));
  await addColumnIfMissing(db, trendColumns, 'keywords_detailed', 'TEXT NULL', 'market_trends');
}

async function migrateMarketTrendsMarketplace(db) {
  const tableExists = await all(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='market_trends'");
  if (tableExists.length === 0) return;
  const trendColumns = new Set((await all(db, 'PRAGMA table_info(market_trends)')).map(column => column.name));
  // Real marketplace tag instead of guessing AMAZON vs ETSY from category text.
  await addColumnIfMissing(db, trendColumns, 'marketplace', "TEXT NULL CHECK(marketplace IN ('AMAZON', 'ETSY'))", 'market_trends');
}

async function migrateWorkspaceOwnership(db) {
  const tableExists = async (name) => (await all(db, "SELECT name FROM sqlite_master WHERE type='table' AND name=?", [name])).length > 0;

  if (await tableExists('market_trends')) {
    const trendColumns = new Set((await all(db, 'PRAGMA table_info(market_trends)')).map(c => c.name));
    await addColumnIfMissing(db, trendColumns, 'tenant_id', 'TEXT NULL', 'market_trends');
    await addColumnIfMissing(db, trendColumns, 'workspace_id', 'INTEGER NULL REFERENCES workspaces(id)', 'market_trends');
    // Legacy unscoped rows stay invisible to workspace-scoped reads/drafts —
    // same IDOR-avoidance rationale as migrateListingWorkspaceScope.
  }

  if (await tableExists('learned_templates')) {
    const templateColumns = new Set((await all(db, 'PRAGMA table_info(learned_templates)')).map(c => c.name));
    await addColumnIfMissing(db, templateColumns, 'tenant_id', 'TEXT NULL', 'learned_templates');
    await addColumnIfMissing(db, templateColumns, 'workspace_id', 'INTEGER NULL REFERENCES workspaces(id)', 'learned_templates');
  }
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


  const securityApplied = await all(db, 'SELECT id FROM schema_migrations WHERE id = ?', [SECURITY_CONTROLS_MIGRATION]);
  if (securityApplied.length === 0) {
    await run(db, 'BEGIN IMMEDIATE');
    try {
      await migrateSecurityControls(db);
      await run(db, 'INSERT INTO schema_migrations (id) VALUES (?)', [SECURITY_CONTROLS_MIGRATION]);
      await run(db, 'COMMIT');
    } catch (error) {
      try { await run(db, 'ROLLBACK'); } catch (_) {}
      throw error;
    }
  }

  const keywordDetailApplied = await all(db, 'SELECT id FROM schema_migrations WHERE id = ?', [KEYWORD_DETAIL_MIGRATION]);
  if (keywordDetailApplied.length === 0) {
    await run(db, 'BEGIN IMMEDIATE');
    try {
      await migrateKeywordDetailAndAuthorship(db);
      await run(db, 'INSERT INTO schema_migrations (id) VALUES (?)', [KEYWORD_DETAIL_MIGRATION]);
      await run(db, 'COMMIT');
    } catch (error) {
      try { await run(db, 'ROLLBACK'); } catch (_) {}
      throw error;
    }
  }

  const marketTrendsMarketplaceApplied = await all(db, 'SELECT id FROM schema_migrations WHERE id = ?', [MARKET_TRENDS_MARKETPLACE_MIGRATION]);
  if (marketTrendsMarketplaceApplied.length === 0) {
    await run(db, 'BEGIN IMMEDIATE');
    try {
      await migrateMarketTrendsMarketplace(db);
      await run(db, 'INSERT INTO schema_migrations (id) VALUES (?)', [MARKET_TRENDS_MARKETPLACE_MIGRATION]);
      await run(db, 'COMMIT');
    } catch (error) {
      try { await run(db, 'ROLLBACK'); } catch (_) {}
      throw error;
    }
  }

  const workspaceOwnershipApplied = await all(db, 'SELECT id FROM schema_migrations WHERE id = ?', [WORKSPACE_OWNERSHIP_MIGRATION]);
  if (workspaceOwnershipApplied.length === 0) {
    await run(db, 'BEGIN IMMEDIATE');
    try {
      await migrateWorkspaceOwnership(db);
      await run(db, 'INSERT INTO schema_migrations (id) VALUES (?)', [WORKSPACE_OWNERSHIP_MIGRATION]);
      await run(db, 'COMMIT');
    } catch (error) {
      try { await run(db, 'ROLLBACK'); } catch (_) {}
      throw error;
    }
  }
}

module.exports = {
  LISTING_SCOPE_MIGRATION,
  SECURITY_CONTROLS_MIGRATION,
  KEYWORD_DETAIL_MIGRATION,
  MARKET_TRENDS_MARKETPLACE_MIGRATION,
  WORKSPACE_OWNERSHIP_MIGRATION,
  runMigrations
};
