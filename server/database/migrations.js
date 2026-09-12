const LISTING_SCOPE_MIGRATION = '002_listing_workspace_scope';
const SECURITY_CONTROLS_MIGRATION = '003_security_controls';
const KEYWORD_DETAIL_MIGRATION = '004_keyword_detail_and_authorship';
const MARKET_TRENDS_MARKETPLACE_MIGRATION = '005_market_trends_marketplace';
const WORKSPACE_OWNERSHIP_MIGRATION = '006_market_trends_and_templates_ownership';
const PRODUCT_TRUTH_ATTESTATION_MIGRATION = '007_listing_product_truth_attestation';
const PRODUCT_TRUTH_CARD_MIGRATION = '008_listing_product_truth_card';
const IMMUTABLE_REVISIONS_MIGRATION = '009_immutable_listing_creative_revisions';
const PRODUCT_TRUTH_AUTHORITY_MIGRATION = '010_product_truth_authority_scope';
const PROJECT_PRODUCT_TRUTH_REVISIONS_MIGRATION = '011_project_product_truth_revisions';
const LISTING_REVISION_VALIDATION_ACCOUNTING_MIGRATION = '012_listing_revision_validation_accounting';
const COMMERCE_SNAPSHOT_MIGRATION = '013_commerce_research_intelligence_snapshots';
const CANONICAL_REVIEW_HANDOFF_MIGRATION = '014_canonical_review_submission_handoff';
const OWNER_SUBMISSION_AUTHORIZATION_MIGRATION = '015_owner_submission_authorization';
const COMMERCE_WORKFLOW_ARTIFACT_MIGRATION = '2026-09-12_commerce_workflow_artifacts_v2_upgrade';
const OPERATOR_REPORTED_SUBMISSION_MIGRATION = '017_operator_reported_submission_lifecycle';
const crypto = require('node:crypto');
const { canonicalJson, hashBytes } = require('../revisionStore');

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
  await addColumnIfMissing(db, columns, 'generatedAt', 'DATETIME DEFAULT CURRENT_TIMESTAMP');

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
  const settingsTableExists = (await all(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='settings'")).length > 0;
  if (settingsTableExists) {
    await run(db, `
      DELETE FROM settings
      WHERE key IN ('gemini_api_key', 'openai_api_key', 'claude_api_key')
    `);
  }
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

async function migrateProductTruthAttestation(db) {
  const columns = new Set((await all(db, 'PRAGMA table_info(listings)')).map(column => column.name));
  // Bound to the same optimistic-concurrency version as approved_version, so
  // editing a listing after attestation invalidates it exactly like the
  // existing approval hash already does.
  await addColumnIfMissing(db, columns, 'product_truth_notes', 'TEXT NULL');
}

async function migrateProductTruthCard(db) {
  const columns = new Set((await all(db, 'PRAGMA table_info(listings)')).map(column => column.name));
  await addColumnIfMissing(db, columns, 'product_truth_card', 'TEXT NULL');
}

function sha256Bytes(value) {
  return crypto.createHash('sha256').update(Buffer.from(String(value), 'utf8')).digest('hex');
}

async function migrateImmutableRevisions(db) {
  const listingTable = await all(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='listings'");
  if (!listingTable.length) return;
  const columns = new Set((await all(db, 'PRAGMA table_info(listings)')).map(column => column.name));
  await addColumnIfMissing(db, columns, 'head_revision_id', 'INTEGER NULL REFERENCES listing_revisions(id)');
  await addColumnIfMissing(db, columns, 'head_creative_revision_id', 'INTEGER NULL REFERENCES creative_revisions(id)');

  await run(db, `CREATE TABLE IF NOT EXISTS listing_revisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL REFERENCES listings(id),
    tenant_id TEXT NOT NULL,
    workspace_id INTEGER NOT NULL,
    marketplace TEXT NOT NULL CHECK(marketplace IN ('AMAZON','ETSY')),
    project_id INTEGER NULL,
    revision_number INTEGER NOT NULL CHECK(revision_number >= 1),
    parent_revision_id INTEGER NULL REFERENCES listing_revisions(id),
    content_json TEXT NOT NULL,
    content_hash TEXT NOT NULL CHECK(length(content_hash) = 64),
    dependency_manifest_json TEXT NOT NULL,
    dependency_manifest_hash TEXT NOT NULL CHECK(length(dependency_manifest_hash) = 64),
    change_reason TEXT NOT NULL,
    created_by INTEGER NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    migrated_from_legacy INTEGER NOT NULL DEFAULT 0 CHECK(migrated_from_legacy IN (0,1)),
    UNIQUE(listing_id, revision_number)
  )`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_listing_revisions_scope
    ON listing_revisions(tenant_id, workspace_id, marketplace, project_id, listing_id, revision_number)`);

  await run(db, `CREATE TABLE IF NOT EXISTS creative_revisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL REFERENCES listings(id),
    listing_revision_id INTEGER NOT NULL REFERENCES listing_revisions(id),
    tenant_id TEXT NOT NULL,
    workspace_id INTEGER NOT NULL,
    marketplace TEXT NOT NULL CHECK(marketplace IN ('AMAZON','ETSY')),
    project_id INTEGER NULL,
    revision_number INTEGER NOT NULL CHECK(revision_number >= 1),
    parent_revision_id INTEGER NULL REFERENCES creative_revisions(id),
    content_json TEXT NOT NULL,
    content_hash TEXT NOT NULL CHECK(length(content_hash) = 64),
    dependency_manifest_json TEXT NOT NULL,
    dependency_manifest_hash TEXT NOT NULL CHECK(length(dependency_manifest_hash) = 64),
    change_reason TEXT NOT NULL,
    created_by INTEGER NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(listing_id, revision_number)
  )`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_creative_revisions_scope
    ON creative_revisions(tenant_id, workspace_id, marketplace, project_id, listing_id, revision_number)`);

  await run(db, `CREATE TABLE IF NOT EXISTS listing_write_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    workspace_id INTEGER NOT NULL,
    marketplace TEXT NOT NULL CHECK(marketplace IN ('AMAZON','ETSY')),
    project_id INTEGER NULL,
    listing_id INTEGER NULL REFERENCES listings(id),
    operation TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    request_hash TEXT NOT NULL CHECK(length(request_hash) = 64),
    response_json TEXT NOT NULL,
    created_by INTEGER NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, workspace_id, marketplace, operation, idempotency_key)
  )`);

  for (const table of ['listing_revisions', 'creative_revisions', 'listing_write_receipts']) {
    await run(db, `CREATE TRIGGER IF NOT EXISTS ${table}_immutable_update
      BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_REVISION'); END`);
    await run(db, `CREATE TRIGGER IF NOT EXISTS ${table}_immutable_delete
      BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_REVISION'); END`);
  }

  const legacyDependency = JSON.stringify({
    state: 'LEGACY_UNKNOWN',
    productTruthHash: null,
    researchSnapshotHash: null,
    intelligenceSnapshotHash: null,
    policyBindingHash: null,
    claimIpBindingHash: null,
    validatorHash: null
  });
  const legacyDependencyHash = sha256Bytes(legacyDependency);
  const projection = name => columns.has(name) ? name : `NULL AS ${name}`;
  const rows = await all(db, `SELECT id, tenant_id, workspace_id, marketplace,
    ${projection('project_id')}, ${projection('listing_version')}, ${projection('payload')},
    ${projection('authorId')}, head_revision_id FROM listings
    WHERE tenant_id IS NOT NULL AND workspace_id IS NOT NULL AND marketplace IN ('AMAZON','ETSY')`);
  for (const row of rows) {
    if (row.head_revision_id != null) continue;
    const content = typeof row.payload === 'string' ? row.payload : 'null';
    const revisionNumber = Number.isInteger(row.listing_version) && row.listing_version >= 1 ? row.listing_version : 1;
    await run(db, `INSERT OR IGNORE INTO listing_revisions
      (listing_id,tenant_id,workspace_id,marketplace,project_id,revision_number,parent_revision_id,
       content_json,content_hash,dependency_manifest_json,dependency_manifest_hash,change_reason,created_by,migrated_from_legacy)
      VALUES (?,?,?,?,?,?,NULL,?,?,?,?,?,?,1)`, [
      row.id, row.tenant_id, row.workspace_id, row.marketplace, row.project_id ?? null,
      revisionNumber, content, sha256Bytes(content), legacyDependency, legacyDependencyHash,
      'LEGACY_SNAPSHOT_NO_HISTORY_INVENTED', row.authorId ?? null
    ]);
    const revision = await all(db, 'SELECT id FROM listing_revisions WHERE listing_id=? AND revision_number=?', [row.id, revisionNumber]);
    if (revision.length === 1) await run(db, 'UPDATE listings SET head_revision_id=? WHERE id=? AND head_revision_id IS NULL', [revision[0].id, row.id]);
  }
}

async function migrateProductTruthAuthorityScope(db) {
  const tables = await all(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='audit_events'");
  // Some migration-contract tests intentionally model a legacy subset with no
  // audit table. Do not manufacture a parallel/partial authority table there;
  // fresh canonical databases create the complete table in server.js.
  if (tables.length === 0) return;
  const columns = new Set((await all(db, 'PRAGMA table_info(audit_events)')).map(column => column.name));
  await addColumnIfMissing(db, columns, 'workspace_id', 'INTEGER NULL REFERENCES workspaces(id)', 'audit_events');
  await addColumnIfMissing(db, columns, 'marketplace', 'TEXT NULL', 'audit_events');
  await addColumnIfMissing(db, columns, 'content_hash', 'TEXT NULL', 'audit_events');
}

async function migrateProjectProductTruthRevisions(db) {
  const projects = await all(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='research_projects'");
  if (!projects.length) return;
  const columns = new Set((await all(db, 'PRAGMA table_info(research_projects)')).map(column => column.name));
  const workspaceColumns = new Set((await all(db, 'PRAGMA table_info(workspaces)')).map(column => column.name));
  await addColumnIfMissing(db, workspaceColumns, 'seller_account_label', 'TEXT NULL', 'workspaces');
  await addColumnIfMissing(db, workspaceColumns, 'site', 'TEXT NULL', 'workspaces');
  await run(db, `UPDATE workspaces SET seller_account_label='workspace:' || id WHERE seller_account_label IS NULL`);
  await run(db, `UPDATE workspaces SET site='US' WHERE site IS NULL AND marketplace IN ('AMAZON','ETSY')`);
  await addColumnIfMissing(db, columns, 'locale', 'TEXT NULL', 'research_projects');
  await addColumnIfMissing(db, columns, 'media_class', 'TEXT NULL', 'research_projects');
  await addColumnIfMissing(db, columns, 'product_type_id', 'TEXT NULL', 'research_projects');
  await addColumnIfMissing(db, columns, 'category_id', 'TEXT NULL', 'research_projects');
  await addColumnIfMissing(db, columns, 'product_family_version', 'TEXT NULL', 'research_projects');
  await addColumnIfMissing(db, columns, 'head_product_truth_revision_id',
    'INTEGER NULL REFERENCES product_truth_revisions(id)', 'research_projects');
  await run(db, `CREATE TABLE IF NOT EXISTS product_truth_revisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    workspace_id INTEGER NOT NULL,
    marketplace TEXT NOT NULL CHECK(marketplace IN ('AMAZON','ETSY')),
    project_id INTEGER NOT NULL REFERENCES research_projects(id),
    revision_number INTEGER NOT NULL CHECK(revision_number >= 1),
    parent_revision_id INTEGER NULL REFERENCES product_truth_revisions(id),
    snapshot_json TEXT NOT NULL,
    content_hash TEXT NOT NULL CHECK(length(content_hash) = 64),
    change_reason TEXT NOT NULL,
    created_by INTEGER NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, revision_number)
  )`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_product_truth_revisions_scope
    ON product_truth_revisions(tenant_id,workspace_id,marketplace,project_id,revision_number)`);
  await run(db, `CREATE TABLE IF NOT EXISTS product_truth_confirmations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    workspace_id INTEGER NOT NULL,
    marketplace TEXT NOT NULL CHECK(marketplace IN ('AMAZON','ETSY')),
    project_id INTEGER NOT NULL REFERENCES research_projects(id),
    product_truth_revision_id INTEGER NOT NULL REFERENCES product_truth_revisions(id),
    product_truth_hash TEXT NOT NULL CHECK(length(product_truth_hash) = 64),
    confirmed_by INTEGER NOT NULL,
    reason TEXT NOT NULL,
    confirmed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_truth_revision_id)
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS product_truth_write_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    workspace_id INTEGER NOT NULL,
    marketplace TEXT NOT NULL CHECK(marketplace IN ('AMAZON','ETSY')),
    project_id INTEGER NOT NULL REFERENCES research_projects(id),
    operation TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    request_hash TEXT NOT NULL CHECK(length(request_hash) = 64),
    response_json TEXT NOT NULL,
    created_by INTEGER NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id,workspace_id,marketplace,operation,idempotency_key)
  )`);
  for (const table of ['product_truth_revisions', 'product_truth_confirmations', 'product_truth_write_receipts']) {
    await run(db, `CREATE TRIGGER IF NOT EXISTS ${table}_immutable_update
      BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_PRODUCT_TRUTH'); END`);
    await run(db, `CREATE TRIGGER IF NOT EXISTS ${table}_immutable_delete
      BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_PRODUCT_TRUTH'); END`);
  }
}

async function migrateListingRevisionValidationAccounting(db) {
  const tables = await all(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='listing_revisions'");
  if (!tables.length) return;
  const columns = new Set((await all(db, 'PRAGMA table_info(listing_revisions)')).map(column => column.name));
  await addColumnIfMissing(db, columns, 'validation_accounting_json', 'TEXT NULL', 'listing_revisions');
  columns.add('validation_accounting_json');
  await addColumnIfMissing(db, columns, 'validation_accounting_hash', 'TEXT NULL', 'listing_revisions');
}

async function migrateCommerceSnapshots(db) {
  const projects = await all(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='research_projects'");
  if (!projects.length) return;
  const projectColumns = new Set((await all(db, 'PRAGMA table_info(research_projects)')).map(column => column.name));
  await addColumnIfMissing(db, projectColumns, 'head_research_snapshot_id',
    'INTEGER NULL REFERENCES research_snapshots(id)', 'research_projects');
  await addColumnIfMissing(db, projectColumns, 'head_intelligence_snapshot_id',
    'INTEGER NULL REFERENCES intelligence_snapshots(id)', 'research_projects');
  await run(db, `CREATE TABLE IF NOT EXISTS research_imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL, workspace_id INTEGER NOT NULL,
    marketplace TEXT NOT NULL CHECK(marketplace IN ('AMAZON','ETSY')),
    project_id INTEGER NOT NULL REFERENCES research_projects(id),
    kind TEXT NOT NULL CHECK(kind IN ('AMAZON_XRAY','AMAZON_CEREBRO','AMAZON_REFERENCE','ETSY_SEARCH')),
    file_name TEXT NOT NULL, media_type TEXT NOT NULL, raw_bytes BLOB NOT NULL,
    raw_hash TEXT NOT NULL CHECK(length(raw_hash)=64), selected_sheet TEXT,
    header_signature_json TEXT NOT NULL, parser_id TEXT NOT NULL, parser_hash TEXT NOT NULL CHECK(length(parser_hash)=64),
    imported_by INTEGER NOT NULL, imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id,workspace_id,marketplace,project_id,kind,raw_hash)
  )`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_research_imports_scope
    ON research_imports(tenant_id,workspace_id,marketplace,project_id,id)`);
  await run(db, `CREATE TABLE IF NOT EXISTS research_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL, workspace_id INTEGER NOT NULL,
    marketplace TEXT NOT NULL CHECK(marketplace IN ('AMAZON','ETSY')),
    project_id INTEGER NOT NULL REFERENCES research_projects(id), revision_number INTEGER NOT NULL,
    parent_revision_id INTEGER REFERENCES research_snapshots(id),
    import_manifest_json TEXT NOT NULL, import_manifest_hash TEXT NOT NULL CHECK(length(import_manifest_hash)=64),
    observations_json TEXT NOT NULL, observations_hash TEXT NOT NULL CHECK(length(observations_hash)=64),
    accounting_json TEXT NOT NULL, accounting_hash TEXT NOT NULL CHECK(length(accounting_hash)=64),
    adapter_binding_hash TEXT NOT NULL CHECK(length(adapter_binding_hash)=64),
    snapshot_hash TEXT NOT NULL CHECK(length(snapshot_hash)=64),
    change_reason TEXT NOT NULL, created_by INTEGER NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id,revision_number)
  )`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_research_snapshots_scope
    ON research_snapshots(tenant_id,workspace_id,marketplace,project_id,revision_number)`);
  await run(db, `CREATE TABLE IF NOT EXISTS intelligence_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL, workspace_id INTEGER NOT NULL,
    marketplace TEXT NOT NULL CHECK(marketplace IN ('AMAZON','ETSY')),
    project_id INTEGER NOT NULL REFERENCES research_projects(id), revision_number INTEGER NOT NULL,
    parent_revision_id INTEGER REFERENCES intelligence_snapshots(id),
    research_snapshot_id INTEGER NOT NULL REFERENCES research_snapshots(id), research_snapshot_hash TEXT NOT NULL CHECK(length(research_snapshot_hash)=64),
    product_truth_revision_id INTEGER NOT NULL REFERENCES product_truth_revisions(id), product_truth_hash TEXT NOT NULL CHECK(length(product_truth_hash)=64),
    configuration_json TEXT NOT NULL, configuration_hash TEXT NOT NULL CHECK(length(configuration_hash)=64),
    output_json TEXT NOT NULL, output_hash TEXT NOT NULL CHECK(length(output_hash)=64),
    accounting_json TEXT NOT NULL, accounting_hash TEXT NOT NULL CHECK(length(accounting_hash)=64),
    engine_binding_hash TEXT NOT NULL CHECK(length(engine_binding_hash)=64),
    snapshot_hash TEXT NOT NULL CHECK(length(snapshot_hash)=64),
    change_reason TEXT NOT NULL, created_by INTEGER NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id,revision_number)
  )`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_intelligence_snapshots_scope
    ON intelligence_snapshots(tenant_id,workspace_id,marketplace,project_id,revision_number)`);
  await run(db, `CREATE TABLE IF NOT EXISTS commerce_write_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL, workspace_id INTEGER NOT NULL,
    marketplace TEXT NOT NULL CHECK(marketplace IN ('AMAZON','ETSY')),
    project_id INTEGER NOT NULL REFERENCES research_projects(id), operation TEXT NOT NULL,
    idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
    response_json TEXT NOT NULL, created_by INTEGER NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id,workspace_id,marketplace,operation,idempotency_key)
  )`);
  for (const table of ['research_imports','research_snapshots','intelligence_snapshots','commerce_write_receipts']) {
    await run(db, `CREATE TRIGGER IF NOT EXISTS ${table}_immutable_update
      BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT,'IMMUTABLE_COMMERCE_SNAPSHOT'); END`);
    await run(db, `CREATE TRIGGER IF NOT EXISTS ${table}_immutable_delete
      BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'IMMUTABLE_COMMERCE_SNAPSHOT'); END`);
  }
}

async function migrateCanonicalReviewHandoff(db) {
  await run(db, `CREATE TABLE IF NOT EXISTS canonical_listing_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL, workspace_id INTEGER NOT NULL,
    marketplace TEXT NOT NULL CHECK(marketplace IN ('AMAZON','ETSY')),
    project_id INTEGER NOT NULL REFERENCES research_projects(id),
    listing_id INTEGER NOT NULL REFERENCES listings(id),
    listing_revision_id INTEGER NOT NULL REFERENCES listing_revisions(id),
    decision TEXT NOT NULL CHECK(decision IN ('APPROVED','CHANGES_REQUESTED')),
    reason TEXT NOT NULL, content_hash TEXT NOT NULL CHECK(length(content_hash)=64),
    dependency_manifest_hash TEXT NOT NULL CHECK(length(dependency_manifest_hash)=64),
    product_truth_revision_id INTEGER NOT NULL REFERENCES product_truth_revisions(id),
    product_truth_confirmation_id INTEGER REFERENCES product_truth_confirmations(id),
    reviewed_by INTEGER NOT NULL, reviewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_canonical_listing_reviews_scope
    ON canonical_listing_reviews(tenant_id,workspace_id,marketplace,project_id,listing_id,id)`);
  await run(db, `CREATE TABLE IF NOT EXISTS canonical_submission_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL, workspace_id INTEGER NOT NULL,
    marketplace TEXT NOT NULL CHECK(marketplace IN ('AMAZON','ETSY')),
    project_id INTEGER NOT NULL REFERENCES research_projects(id),
    listing_id INTEGER NOT NULL REFERENCES listings(id),
    listing_revision_id INTEGER NOT NULL REFERENCES listing_revisions(id),
    review_id INTEGER NOT NULL REFERENCES canonical_listing_reviews(id),
    package_hash TEXT NOT NULL CHECK(length(package_hash)=64),
    notes TEXT NOT NULL, requested_by INTEGER NOT NULL,
    requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(listing_revision_id)
  )`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_canonical_submission_requests_scope
    ON canonical_submission_requests(tenant_id,workspace_id,marketplace,project_id,listing_id,id)`);
  await run(db, `CREATE TABLE IF NOT EXISTS canonical_submission_handoffs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL, workspace_id INTEGER NOT NULL,
    marketplace TEXT NOT NULL CHECK(marketplace IN ('AMAZON','ETSY')),
    project_id INTEGER NOT NULL REFERENCES research_projects(id),
    listing_id INTEGER NOT NULL REFERENCES listings(id),
    listing_revision_id INTEGER NOT NULL REFERENCES listing_revisions(id),
    review_id INTEGER NOT NULL REFERENCES canonical_listing_reviews(id),
    submission_request_id INTEGER NOT NULL REFERENCES canonical_submission_requests(id),
    external_reference TEXT, notes TEXT NOT NULL,
    submitted_by INTEGER NOT NULL, submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(listing_revision_id)
  )`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_canonical_submission_handoffs_scope
    ON canonical_submission_handoffs(tenant_id,workspace_id,marketplace,project_id,listing_id,id)`);
  await run(db, `CREATE TRIGGER IF NOT EXISTS canonical_submission_handoffs_request_required_insert
    BEFORE INSERT ON canonical_submission_handoffs WHEN NEW.submission_request_id IS NULL
    BEGIN SELECT RAISE(ABORT,'SUBMISSION_REQUEST_REQUIRED'); END`);
  await run(db, `CREATE TABLE IF NOT EXISTS canonical_handoff_write_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL, workspace_id INTEGER NOT NULL,
    marketplace TEXT NOT NULL CHECK(marketplace IN ('AMAZON','ETSY')),
    project_id INTEGER NOT NULL REFERENCES research_projects(id),
    listing_id INTEGER NOT NULL REFERENCES listings(id),
    operation TEXT NOT NULL, idempotency_key TEXT NOT NULL,
    request_hash TEXT NOT NULL CHECK(length(request_hash)=64), response_json TEXT NOT NULL,
    created_by INTEGER NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id,workspace_id,marketplace,operation,idempotency_key)
  )`);
  for (const table of ['canonical_listing_reviews','canonical_submission_requests','canonical_submission_handoffs','canonical_handoff_write_receipts']) {
    await run(db, `CREATE TRIGGER IF NOT EXISTS ${table}_immutable_update
      BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT,'IMMUTABLE_CANONICAL_HANDOFF'); END`);
    await run(db, `CREATE TRIGGER IF NOT EXISTS ${table}_immutable_delete
      BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'IMMUTABLE_CANONICAL_HANDOFF'); END`);
  }
}

async function migrateOwnerSubmissionAuthorization(db) {
  await run(db, `CREATE TABLE IF NOT EXISTS canonical_submission_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL, workspace_id INTEGER NOT NULL,
    marketplace TEXT NOT NULL CHECK(marketplace IN ('AMAZON','ETSY')),
    project_id INTEGER NOT NULL REFERENCES research_projects(id),
    listing_id INTEGER NOT NULL REFERENCES listings(id),
    listing_revision_id INTEGER NOT NULL REFERENCES listing_revisions(id),
    review_id INTEGER NOT NULL REFERENCES canonical_listing_reviews(id),
    package_hash TEXT NOT NULL CHECK(length(package_hash)=64), notes TEXT NOT NULL,
    requested_by INTEGER NOT NULL, requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(listing_revision_id)
  )`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_canonical_submission_requests_scope
    ON canonical_submission_requests(tenant_id,workspace_id,marketplace,project_id,listing_id,id)`);
  const columns = await all(db, 'PRAGMA table_info(canonical_submission_handoffs)');
  if (!columns.some(column => column.name === 'submission_request_id')) {
    await run(db, 'ALTER TABLE canonical_submission_handoffs ADD COLUMN submission_request_id INTEGER REFERENCES canonical_submission_requests(id)');
  }
  await run(db, `CREATE TRIGGER IF NOT EXISTS canonical_submission_handoffs_request_required_insert
    BEFORE INSERT ON canonical_submission_handoffs WHEN NEW.submission_request_id IS NULL
    BEGIN SELECT RAISE(ABORT,'SUBMISSION_REQUEST_REQUIRED'); END`);
  await run(db, `CREATE TRIGGER IF NOT EXISTS canonical_submission_requests_immutable_update
    BEFORE UPDATE ON canonical_submission_requests BEGIN SELECT RAISE(ABORT,'IMMUTABLE_CANONICAL_HANDOFF'); END`);
  await run(db, `CREATE TRIGGER IF NOT EXISTS canonical_submission_requests_immutable_delete
    BEFORE DELETE ON canonical_submission_requests BEGIN SELECT RAISE(ABORT,'IMMUTABLE_CANONICAL_HANDOFF'); END`);
}

async function migrateOperatorReportedSubmissionLifecycle(db) {
  // Migration 014 keyed receipts only by workspace + operation + key. Rebuild
  // without rewriting response bytes so the same UUID can safely be used in
  // different projects/listings and replay lookup is fully object-scoped.
  await run(db, 'DROP TABLE IF EXISTS canonical_handoff_write_receipts_v017');
  await run(db, `CREATE TABLE canonical_handoff_write_receipts_v017 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL, workspace_id INTEGER NOT NULL,
    marketplace TEXT NOT NULL CHECK(marketplace IN ('AMAZON','ETSY')),
    project_id INTEGER NOT NULL REFERENCES research_projects(id),
    listing_id INTEGER NOT NULL REFERENCES listings(id),
    operation TEXT NOT NULL, idempotency_key TEXT NOT NULL,
    request_hash TEXT NOT NULL CHECK(length(request_hash)=64), response_json TEXT NOT NULL,
    created_by INTEGER NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id,workspace_id,marketplace,project_id,listing_id,operation,idempotency_key)
  )`);
  await run(db, `INSERT INTO canonical_handoff_write_receipts_v017
    (id,tenant_id,workspace_id,marketplace,project_id,listing_id,operation,idempotency_key,
     request_hash,response_json,created_by,created_at)
    SELECT id,tenant_id,workspace_id,marketplace,project_id,listing_id,operation,idempotency_key,
     request_hash,response_json,created_by,created_at FROM canonical_handoff_write_receipts`);
  await run(db, 'DROP TABLE canonical_handoff_write_receipts');
  await run(db, 'ALTER TABLE canonical_handoff_write_receipts_v017 RENAME TO canonical_handoff_write_receipts');
  await run(db, `CREATE INDEX idx_canonical_handoff_receipts_scope
    ON canonical_handoff_write_receipts(tenant_id,workspace_id,marketplace,project_id,listing_id,operation,id)`);
  await run(db, `CREATE TRIGGER canonical_handoff_write_receipts_immutable_update
    BEFORE UPDATE ON canonical_handoff_write_receipts BEGIN SELECT RAISE(ABORT,'IMMUTABLE_CANONICAL_HANDOFF'); END`);
  await run(db, `CREATE TRIGGER canonical_handoff_write_receipts_immutable_delete
    BEFORE DELETE ON canonical_handoff_write_receipts BEGIN SELECT RAISE(ABORT,'IMMUTABLE_CANONICAL_HANDOFF'); END`);
  await run(db, `CREATE TABLE IF NOT EXISTS canonical_submission_authorizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL, workspace_id INTEGER NOT NULL,
    marketplace TEXT NOT NULL CHECK(marketplace IN ('AMAZON','ETSY')),
    project_id INTEGER NOT NULL REFERENCES research_projects(id),
    listing_id INTEGER NOT NULL REFERENCES listings(id),
    listing_revision_id INTEGER NOT NULL REFERENCES listing_revisions(id),
    review_id INTEGER NOT NULL REFERENCES canonical_listing_reviews(id),
    submission_request_id INTEGER NOT NULL REFERENCES canonical_submission_requests(id),
    package_hash TEXT NOT NULL CHECK(length(package_hash)=64),
    notes TEXT NOT NULL, authorized_by INTEGER NOT NULL,
    authorized_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(listing_revision_id), UNIQUE(submission_request_id)
  )`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_canonical_submission_authorizations_scope
    ON canonical_submission_authorizations(tenant_id,workspace_id,marketplace,project_id,listing_id,id)`);
  await run(db, `CREATE TABLE IF NOT EXISTS canonical_submission_exports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL, workspace_id INTEGER NOT NULL,
    marketplace TEXT NOT NULL CHECK(marketplace IN ('AMAZON','ETSY')),
    project_id INTEGER NOT NULL REFERENCES research_projects(id),
    listing_id INTEGER NOT NULL REFERENCES listings(id),
    listing_revision_id INTEGER NOT NULL REFERENCES listing_revisions(id),
    authorization_id INTEGER NOT NULL REFERENCES canonical_submission_authorizations(id),
    package_hash TEXT NOT NULL CHECK(length(package_hash)=64),
    export_json TEXT NOT NULL CHECK(json_valid(export_json) AND length(CAST(export_json AS BLOB))<=4194304),
    export_hash TEXT NOT NULL CHECK(length(export_hash)=64),
    exported_by INTEGER NOT NULL, exported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(authorization_id)
  )`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_canonical_submission_exports_scope
    ON canonical_submission_exports(tenant_id,workspace_id,marketplace,project_id,listing_id,id)`);
  await run(db, `CREATE TABLE IF NOT EXISTS canonical_operator_submission_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL, workspace_id INTEGER NOT NULL,
    marketplace TEXT NOT NULL CHECK(marketplace IN ('AMAZON','ETSY')),
    project_id INTEGER NOT NULL REFERENCES research_projects(id),
    listing_id INTEGER NOT NULL REFERENCES listings(id),
    listing_revision_id INTEGER NOT NULL REFERENCES listing_revisions(id),
    authorization_id INTEGER NOT NULL REFERENCES canonical_submission_authorizations(id),
    export_id INTEGER NOT NULL REFERENCES canonical_submission_exports(id),
    package_hash TEXT NOT NULL CHECK(length(package_hash)=64),
    external_reference TEXT NOT NULL, notes TEXT NOT NULL,
    reported_by INTEGER NOT NULL, reported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(listing_revision_id), UNIQUE(export_id)
  )`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_canonical_operator_submission_reports_scope
    ON canonical_operator_submission_reports(tenant_id,workspace_id,marketplace,project_id,listing_id,id)`);
  for (const table of ['canonical_submission_authorizations','canonical_submission_exports','canonical_operator_submission_reports']) {
    await run(db, `CREATE TRIGGER IF NOT EXISTS ${table}_immutable_update
      BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT,'IMMUTABLE_CANONICAL_SUBMISSION_EVENT'); END`);
    await run(db, `CREATE TRIGGER IF NOT EXISTS ${table}_immutable_delete
      BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'IMMUTABLE_CANONICAL_SUBMISSION_EVENT'); END`);
  }
  // This database invariant survives a rollback to pre-W5 application code,
  // whose JavaScript knew only the historical bare SUBMITTED terminal state.
  await run(db, `CREATE TRIGGER IF NOT EXISTS listings_operator_reported_terminal_update
    BEFORE UPDATE ON listings WHEN OLD.status='OPERATOR_REPORTED_SUBMITTED'
      AND (NEW.status<>OLD.status OR NEW.head_revision_id<>OLD.head_revision_id)
    BEGIN SELECT RAISE(ABORT,'OPERATOR_REPORTED_SUBMITTED_TERMINAL'); END`);

  const requiredColumns = {
    canonical_submission_authorizations: ['id','tenant_id','workspace_id','marketplace','project_id','listing_id',
      'listing_revision_id','review_id','submission_request_id','package_hash','notes','authorized_by','authorized_at'],
    canonical_submission_exports: ['id','tenant_id','workspace_id','marketplace','project_id','listing_id',
      'listing_revision_id','authorization_id','package_hash','export_json','export_hash','exported_by','exported_at'],
    canonical_operator_submission_reports: ['id','tenant_id','workspace_id','marketplace','project_id','listing_id',
      'listing_revision_id','authorization_id','export_id','package_hash','external_reference','notes','reported_by','reported_at'],
    canonical_handoff_write_receipts: ['id','tenant_id','workspace_id','marketplace','project_id','listing_id',
      'operation','idempotency_key','request_hash','response_json','created_by','created_at']
  };
  for (const [table, required] of Object.entries(requiredColumns)) {
    const present = new Set((await all(db, `PRAGMA table_info(${table})`)).map(column => column.name));
    const missing = required.filter(column => !present.has(column));
    if (missing.length) {
      const error = new Error(`OPERATOR_SUBMISSION_SCHEMA_INCOMPATIBLE:${table}:${missing.join(',')}`);
      error.code = 'OPERATOR_SUBMISSION_SCHEMA_INCOMPATIBLE'; throw error;
    }
  }
  const requiredObjects = ['idx_canonical_handoff_receipts_scope','idx_canonical_submission_authorizations_scope',
    'idx_canonical_submission_exports_scope','idx_canonical_operator_submission_reports_scope',
    'canonical_submission_authorizations_immutable_update','canonical_submission_authorizations_immutable_delete',
    'canonical_submission_exports_immutable_update','canonical_submission_exports_immutable_delete',
    'canonical_operator_submission_reports_immutable_update','canonical_operator_submission_reports_immutable_delete',
    'listings_operator_reported_terminal_update'];
  const objects = new Set((await all(db, `SELECT name FROM sqlite_master WHERE type IN ('index','trigger')`))
    .map(object => object.name));
  const missingObjects = requiredObjects.filter(name => !objects.has(name));
  if (missingObjects.length) {
    const error = new Error(`OPERATOR_SUBMISSION_SCHEMA_INCOMPATIBLE:${missingObjects.join(',')}`);
    error.code = 'OPERATOR_SUBMISSION_SCHEMA_INCOMPATIBLE'; throw error;
  }
  const receiptUniqueColumns = ['tenant_id','workspace_id','marketplace','project_id','listing_id','operation','idempotency_key'];
  const receiptIndexes = await all(db, 'PRAGMA index_list(canonical_handoff_write_receipts)');
  let scopedUnique = false;
  for (const index of receiptIndexes.filter(item => item.unique === 1)) {
    const columns = (await all(db, `PRAGMA index_info(${index.name})`)).sort((a, b) => a.seqno - b.seqno).map(item => item.name);
    if (columns.length === receiptUniqueColumns.length && columns.every((column, position) => column === receiptUniqueColumns[position])) {
      scopedUnique = true; break;
    }
  }
  if (!scopedUnique) {
    const error = new Error('OPERATOR_SUBMISSION_SCHEMA_INCOMPATIBLE:receipt_unique_scope');
    error.code = 'OPERATOR_SUBMISSION_SCHEMA_INCOMPATIBLE'; throw error;
  }
}

const WORKFLOW_V1_COLUMNS = Object.freeze([
  'id','tenant_id','workspace_id','marketplace','project_id','kind','revision_number','parent_revision_id',
  'dependency_manifest_json','dependency_manifest_hash','payload_json','payload_hash','accounting_json','accounting_hash',
  'engine_binding_hash','artifact_hash','change_reason','idempotency_key','created_by','created_at'
]);
const WORKFLOW_V2_COLUMNS = Object.freeze([
  ...WORKFLOW_V1_COLUMNS, 'request_hash','integrity_version','parser_binding_hash','normalization_binding_hash',
  'scoring_binding_hash','policy_binding_hash'
]);

function workflowSchemaError(classification, details = {}) {
  const error = new Error(`COMMERCE_WORKFLOW_ARTIFACT_SCHEMA_INCOMPATIBLE:${classification}`);
  error.code = 'COMMERCE_WORKFLOW_ARTIFACT_SCHEMA_INCOMPATIBLE';
  error.details = { classification, ...details };
  return error;
}

async function createCommerceWorkflowArtifactsV2Table(db, tableName = 'commerce_workflow_artifacts') {
  await run(db, `CREATE TABLE ${tableName} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
    marketplace TEXT NOT NULL CHECK(marketplace IN ('AMAZON','ETSY')),
    project_id INTEGER NOT NULL REFERENCES research_projects(id),
    kind TEXT NOT NULL CHECK(kind IN (
      'AMAZON_ASIN_BATCH_PLAN','AMAZON_CEREBRO_BINDING','AMAZON_MASTER_KEYWORDS',
      'ETSY_WINNER_SET','ETSY_PATTERN_SNAPSHOT','ETSY_MASTER_KEYWORDS'
    )),
    revision_number INTEGER NOT NULL CHECK(revision_number >= 1),
    parent_revision_id INTEGER NULL REFERENCES ${tableName}(id),
    integrity_version INTEGER NOT NULL DEFAULT 2 CHECK(integrity_version IN (1,2)),
    request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
    idempotency_key TEXT NOT NULL,
    dependency_manifest_json TEXT NOT NULL CHECK(json_valid(dependency_manifest_json)),
    dependency_manifest_hash TEXT NOT NULL CHECK(length(dependency_manifest_hash)=64),
    payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
    payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64),
    accounting_json TEXT NOT NULL CHECK(json_valid(accounting_json)),
    accounting_hash TEXT NOT NULL CHECK(length(accounting_hash)=64),
    engine_binding_hash TEXT NOT NULL CHECK(length(engine_binding_hash)=64),
    parser_binding_hash TEXT NULL CHECK(parser_binding_hash IS NULL OR length(parser_binding_hash)=64),
    normalization_binding_hash TEXT NULL CHECK(normalization_binding_hash IS NULL OR length(normalization_binding_hash)=64),
    scoring_binding_hash TEXT NULL CHECK(scoring_binding_hash IS NULL OR length(scoring_binding_hash)=64),
    policy_binding_hash TEXT NULL CHECK(policy_binding_hash IS NULL OR length(policy_binding_hash)=64),
    artifact_hash TEXT NOT NULL CHECK(length(artifact_hash)=64),
    change_reason TEXT NOT NULL,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK((integrity_version=1 AND parser_binding_hash IS NULL AND normalization_binding_hash IS NULL
      AND scoring_binding_hash IS NULL AND policy_binding_hash IS NULL)
      OR (integrity_version=2 AND length(parser_binding_hash)=64 AND length(normalization_binding_hash)=64
        AND length(scoring_binding_hash)=64)),
    CHECK(integrity_version=1 OR (length(CAST(dependency_manifest_json AS BLOB))<=262144
      AND length(CAST(payload_json AS BLOB))<=2097152 AND length(CAST(accounting_json AS BLOB))<=262144)),
    UNIQUE(tenant_id,workspace_id,marketplace,project_id,kind,revision_number),
    UNIQUE(tenant_id,workspace_id,marketplace,project_id,kind,idempotency_key)
  )`);
}

async function createCommerceWorkflowArtifactsV2Objects(db) {
  await run(db, `CREATE INDEX idx_commerce_workflow_artifacts_scope
    ON commerce_workflow_artifacts(tenant_id,workspace_id,marketplace,project_id,kind,revision_number DESC)`);
  await run(db, `CREATE TRIGGER commerce_workflow_artifacts_immutable_update
    BEFORE UPDATE ON commerce_workflow_artifacts BEGIN SELECT RAISE(ABORT,'IMMUTABLE_WORKFLOW_ARTIFACT'); END`);
  await run(db, `CREATE TRIGGER commerce_workflow_artifacts_immutable_delete
    BEFORE DELETE ON commerce_workflow_artifacts BEGIN SELECT RAISE(ABORT,'IMMUTABLE_WORKFLOW_ARTIFACT'); END`);
  await run(db, `CREATE TRIGGER commerce_workflow_artifacts_parent_guard
    BEFORE INSERT ON commerce_workflow_artifacts
    WHEN (NEW.parent_revision_id IS NULL AND NEW.revision_number<>1)
      OR (NEW.parent_revision_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM commerce_workflow_artifacts parent
        WHERE parent.id=NEW.parent_revision_id
          AND parent.tenant_id=NEW.tenant_id AND parent.workspace_id=NEW.workspace_id
          AND parent.marketplace=NEW.marketplace AND parent.project_id=NEW.project_id
          AND parent.kind=NEW.kind AND NEW.revision_number=parent.revision_number+1
      ))
    BEGIN SELECT RAISE(ABORT,'WORKFLOW_ARTIFACT_PARENT_INVALID'); END`);
}

function donorArtifactHash(row) {
  return hashBytes(canonicalJson({ accountingHash: row.accounting_hash,
    dependencyManifestHash: row.dependency_manifest_hash, engineBindingHash: row.engine_binding_hash,
    payloadHash: row.payload_hash }));
}

function migratedRequestHash(row) {
  return hashBytes(canonicalJson({ migration: 'DONOR_V1_TO_DUAL_INTEGRITY_V2', legacy: {
    id: row.id, tenantId: row.tenant_id, workspaceId: row.workspace_id, marketplace: row.marketplace,
    projectId: row.project_id, kind: row.kind, revisionNumber: row.revision_number,
    parentRevisionId: row.parent_revision_id, dependencyManifestHash: row.dependency_manifest_hash,
    payloadHash: row.payload_hash, accountingHash: row.accounting_hash, engineBindingHash: row.engine_binding_hash,
    artifactHash: row.artifact_hash, changeReason: row.change_reason, idempotencyKey: row.idempotency_key,
    createdBy: row.created_by, createdAt: row.created_at
  } }));
}

async function validateDonorWorkflowRows(db, rows) {
  const projects = new Map((await all(db, 'SELECT id,tenant_id,workspace_id,marketplace FROM research_projects'))
    .map(row => [Number(row.id), row]));
  const workspaces = new Set((await all(db, 'SELECT id FROM workspaces')).map(row => Number(row.id)));
  const users = new Set((await all(db, 'SELECT id FROM users')).map(row => Number(row.id)));
  const byId = new Map(rows.map(row => [Number(row.id), row]));
  for (const row of rows) {
    try { JSON.parse(row.dependency_manifest_json); JSON.parse(row.payload_json); JSON.parse(row.accounting_json); }
    catch (_) { throw workflowSchemaError('DONOR_V1_INVALID_JSON', { artifactId: row.id }); }
    if (sha256Bytes(row.dependency_manifest_json) !== row.dependency_manifest_hash
      || sha256Bytes(row.payload_json) !== row.payload_hash || sha256Bytes(row.accounting_json) !== row.accounting_hash
      || donorArtifactHash(row) !== row.artifact_hash) {
      throw workflowSchemaError('DONOR_V1_INTEGRITY_FAILURE', { artifactId: row.id });
    }
    const project = projects.get(Number(row.project_id));
    if (!project || project.tenant_id !== row.tenant_id || Number(project.workspace_id) !== Number(row.workspace_id)
      || project.marketplace !== row.marketplace || !workspaces.has(Number(row.workspace_id))
      || !users.has(Number(row.created_by))) throw workflowSchemaError('DONOR_V1_SCOPE_ORPHAN', { artifactId: row.id });
    const parent = row.parent_revision_id == null ? null : byId.get(Number(row.parent_revision_id));
    if ((Number(row.revision_number) === 1 && parent) || (Number(row.revision_number) > 1
      && (!parent || parent.tenant_id !== row.tenant_id || Number(parent.workspace_id) !== Number(row.workspace_id)
        || parent.marketplace !== row.marketplace || Number(parent.project_id) !== Number(row.project_id)
        || parent.kind !== row.kind || Number(parent.revision_number) + 1 !== Number(row.revision_number)))) {
      throw workflowSchemaError('DONOR_V1_PARENT_INVALID', { artifactId: row.id });
    }
  }
  const externalReferences = await all(db, `SELECT name FROM sqlite_master WHERE type='table'
    AND name<>'commerce_workflow_artifacts' AND lower(COALESCE(sql,'')) LIKE '%references commerce_workflow_artifacts%'`);
  if (externalReferences.length) throw workflowSchemaError('DONOR_V1_EXTERNAL_REFERENCE', { tables: externalReferences.map(row => row.name) });
}

async function upgradeDonorWorkflowArtifacts(db) {
  const rows = await all(db, 'SELECT * FROM commerce_workflow_artifacts ORDER BY revision_number,id');
  await validateDonorWorkflowRows(db, rows);
  await run(db, 'DROP TRIGGER IF EXISTS commerce_workflow_artifacts_immutable_update');
  await run(db, 'DROP TRIGGER IF EXISTS commerce_workflow_artifacts_immutable_delete');
  await run(db, 'DROP INDEX IF EXISTS idx_commerce_workflow_artifacts_scope');
  await createCommerceWorkflowArtifactsV2Table(db, 'commerce_workflow_artifacts_v2_upgrade');
  for (const row of rows) await run(db, `INSERT INTO commerce_workflow_artifacts_v2_upgrade
    (id,tenant_id,workspace_id,marketplace,project_id,kind,revision_number,parent_revision_id,integrity_version,
     request_hash,idempotency_key,dependency_manifest_json,dependency_manifest_hash,payload_json,payload_hash,
     accounting_json,accounting_hash,engine_binding_hash,parser_binding_hash,normalization_binding_hash,
     scoring_binding_hash,policy_binding_hash,artifact_hash,change_reason,created_by,created_at)
    VALUES (?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,NULL,NULL,NULL,NULL,?,?,?,?)`, [row.id,row.tenant_id,row.workspace_id,
      row.marketplace,row.project_id,row.kind,row.revision_number,row.parent_revision_id,migratedRequestHash(row),
      row.idempotency_key,row.dependency_manifest_json,row.dependency_manifest_hash,row.payload_json,row.payload_hash,
      row.accounting_json,row.accounting_hash,row.engine_binding_hash,row.artifact_hash,row.change_reason,row.created_by,row.created_at]);
  const copied = (await all(db, 'SELECT COUNT(*) AS count FROM commerce_workflow_artifacts_v2_upgrade'))[0]?.count || 0;
  if (copied !== rows.length) throw workflowSchemaError('DONOR_V1_COPY_COUNT_MISMATCH', { expected: rows.length, copied });
  await run(db, 'DROP TABLE commerce_workflow_artifacts');
  await run(db, 'ALTER TABLE commerce_workflow_artifacts_v2_upgrade RENAME TO commerce_workflow_artifacts');
  await createCommerceWorkflowArtifactsV2Objects(db);
  const sequence = await all(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'");
  if (sequence.length && rows.length) {
    await run(db, "DELETE FROM sqlite_sequence WHERE name='commerce_workflow_artifacts'");
    await run(db, "INSERT INTO sqlite_sequence(name,seq) VALUES ('commerce_workflow_artifacts',?)",
      [Math.max(...rows.map(row => Number(row.id)))]);
  }
  const fkErrors = await all(db, 'PRAGMA foreign_key_check(commerce_workflow_artifacts)');
  const integrity = await all(db, 'PRAGMA integrity_check');
  if (fkErrors.length || integrity.some(row => row.integrity_check !== 'ok')) {
    throw workflowSchemaError('DONOR_V1_POST_UPGRADE_CHECK_FAILED', { foreignKeyErrors: fkErrors.length });
  }
}

async function migrateCommerceWorkflowArtifacts(db) {
  const existing = await all(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='commerce_workflow_artifacts'");
  if (!existing.length) {
    await createCommerceWorkflowArtifactsV2Table(db);
    await createCommerceWorkflowArtifactsV2Objects(db);
    return;
  }
  const columns = (await all(db, 'PRAGMA table_info(commerce_workflow_artifacts)')).map(column => column.name);
  const columnSet = new Set(columns);
  if (WORKFLOW_V2_COLUMNS.every(column => columnSet.has(column))) {
    const expectedObjects = ['idx_commerce_workflow_artifacts_scope','commerce_workflow_artifacts_immutable_update',
      'commerce_workflow_artifacts_immutable_delete','commerce_workflow_artifacts_parent_guard'];
    const objectNames = new Set((await all(db, `SELECT name FROM sqlite_master WHERE tbl_name='commerce_workflow_artifacts'
      AND type IN ('index','trigger')`)).map(row => row.name));
    const missingObjects = expectedObjects.filter(name => !objectNames.has(name));
    if (missingObjects.length) throw workflowSchemaError('V2_INCOMPLETE', { missingObjects });
    return;
  }
  const exactDonorV1 = columns.length === WORKFLOW_V1_COLUMNS.length && WORKFLOW_V1_COLUMNS.every(column => columnSet.has(column));
  if (!exactDonorV1) throw workflowSchemaError('UNKNOWN_SCHEMA', { columns });
  const donorObjects = new Set((await all(db, `SELECT name FROM sqlite_master WHERE tbl_name='commerce_workflow_artifacts'
    AND type IN ('index','trigger')`)).map(row => row.name));
  const missingDonorObjects = ['idx_commerce_workflow_artifacts_scope','commerce_workflow_artifacts_immutable_update',
    'commerce_workflow_artifacts_immutable_delete'].filter(name => !donorObjects.has(name));
  if (missingDonorObjects.length) throw workflowSchemaError('DONOR_V1_OBJECTS_UNKNOWN', { missingObjects: missingDonorObjects });
  const rowCount = (await all(db, 'SELECT COUNT(*) AS count FROM commerce_workflow_artifacts'))[0]?.count || 0;
  if (!rowCount) {
    await run(db, 'DROP TRIGGER IF EXISTS commerce_workflow_artifacts_immutable_update');
    await run(db, 'DROP TRIGGER IF EXISTS commerce_workflow_artifacts_immutable_delete');
    await run(db, 'DROP INDEX IF EXISTS idx_commerce_workflow_artifacts_scope');
    await run(db, 'DROP TABLE commerce_workflow_artifacts');
    await createCommerceWorkflowArtifactsV2Table(db); await createCommerceWorkflowArtifactsV2Objects(db); return;
  }
  await upgradeDonorWorkflowArtifacts(db);
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

  const truthAttestationApplied = await all(db, 'SELECT id FROM schema_migrations WHERE id = ?', [PRODUCT_TRUTH_ATTESTATION_MIGRATION]);
  if (truthAttestationApplied.length === 0) {
    await migrateProductTruthAttestation(db);
    await run(db, 'INSERT INTO schema_migrations (id) VALUES (?)', [PRODUCT_TRUTH_ATTESTATION_MIGRATION]);
  }

  const truthCardApplied = await all(db, 'SELECT id FROM schema_migrations WHERE id = ?', [PRODUCT_TRUTH_CARD_MIGRATION]);
  if (truthCardApplied.length === 0) {
    await migrateProductTruthCard(db);
    await run(db, 'INSERT INTO schema_migrations (id) VALUES (?)', [PRODUCT_TRUTH_CARD_MIGRATION]);
  }

  const truthAuthorityApplied = await all(db, 'SELECT id FROM schema_migrations WHERE id = ?', [PRODUCT_TRUTH_AUTHORITY_MIGRATION]);
  if (truthAuthorityApplied.length === 0) {
    await run(db, 'BEGIN IMMEDIATE');
    try {
      await migrateProductTruthAuthorityScope(db);
      await run(db, 'INSERT INTO schema_migrations (id) VALUES (?)', [PRODUCT_TRUTH_AUTHORITY_MIGRATION]);
      await run(db, 'COMMIT');
    } catch (error) {
      try { await run(db, 'ROLLBACK'); } catch (_) {}
      throw error;
    }
  }

  const agentScopeApplied = await all(db, 'SELECT id FROM schema_migrations WHERE id = ?', [AGENT_WORKSPACE_SCOPE_MIGRATION]);
  if (agentScopeApplied.length === 0) {
    await run(db, 'BEGIN IMMEDIATE');
    try {
      await migrateAgentWorkspaceScope(db);
      await run(db, 'INSERT INTO schema_migrations (id) VALUES (?)', [AGENT_WORKSPACE_SCOPE_MIGRATION]);
      await run(db, 'COMMIT');
    } catch (error) {
      try { await run(db, 'ROLLBACK'); } catch (_) {}
      throw error;
    }
  }

  const projScopedApplied = await all(db, 'SELECT id FROM schema_migrations WHERE id = ?', [PROJECT_SCOPED_EVIDENCE_MIGRATION]);
  if (projScopedApplied.length === 0) {
    await run(db, 'BEGIN IMMEDIATE');
    try {
      await migrateProjectScopedEvidence(db);
      await run(db, 'INSERT INTO schema_migrations (id) VALUES (?)', [PROJECT_SCOPED_EVIDENCE_MIGRATION]);
      await run(db, 'COMMIT');
    } catch (error) {
      try { await run(db, 'ROLLBACK'); } catch (_) {}
      throw error;
    }
  }

  const canonicalDagApplied = await all(db, 'SELECT id FROM schema_migrations WHERE id = ?', [CANONICAL_DAG_MIGRATION]);
  if (canonicalDagApplied.length === 0) {
    await run(db, 'BEGIN IMMEDIATE');
    try {
      await migrateCanonicalDag(db);
      await run(db, 'INSERT INTO schema_migrations (id) VALUES (?)', [CANONICAL_DAG_MIGRATION]);
      await run(db, 'COMMIT');
    } catch (error) {
      try { await run(db, 'ROLLBACK'); } catch (_) {}
      throw error;
    }
  }
  await require('./projectStateMigration').migrateProjectStates(db);
  const contextMigration = '2026-09-02_publish_approval_context';
  if (!(await all(db, 'SELECT id FROM schema_migrations WHERE id=?', [contextMigration])).length) {
    await run(db, 'BEGIN IMMEDIATE');
    try {
      const columns = new Set((await all(db, 'PRAGMA table_info(listings)')).map(c => c.name));
      await addColumnIfMissing(db, columns, 'approved_context_hash', 'TEXT NULL');
      // Legacy approvals deliberately remain unbound and require reapproval.
      await run(db, 'INSERT INTO schema_migrations(id) VALUES (?)', [contextMigration]);
      await run(db, 'COMMIT');
    } catch (error) {
      await run(db, 'ROLLBACK');
      throw error;
    }
  }
  const immutableRevisionsApplied = await all(db, 'SELECT id FROM schema_migrations WHERE id = ?', [IMMUTABLE_REVISIONS_MIGRATION]);
  if (immutableRevisionsApplied.length === 0) {
    await run(db, 'BEGIN IMMEDIATE');
    try {
      await migrateImmutableRevisions(db);
      await run(db, 'INSERT INTO schema_migrations (id) VALUES (?)', [IMMUTABLE_REVISIONS_MIGRATION]);
      await run(db, 'COMMIT');
    } catch (error) {
      try { await run(db, 'ROLLBACK'); } catch (_) {}
      throw error;
    }
  }
  const projectTruthApplied = await all(db, 'SELECT id FROM schema_migrations WHERE id = ?', [PROJECT_PRODUCT_TRUTH_REVISIONS_MIGRATION]);
  if (projectTruthApplied.length === 0) {
    await run(db, 'BEGIN IMMEDIATE');
    try {
      await migrateProjectProductTruthRevisions(db);
      await run(db, 'INSERT INTO schema_migrations (id) VALUES (?)', [PROJECT_PRODUCT_TRUTH_REVISIONS_MIGRATION]);
      await run(db, 'COMMIT');
    } catch (error) {
      try { await run(db, 'ROLLBACK'); } catch (_) {}
      throw error;
    }
  }
  const validationAccountingApplied = await all(db, 'SELECT id FROM schema_migrations WHERE id = ?',
    [LISTING_REVISION_VALIDATION_ACCOUNTING_MIGRATION]);
  if (validationAccountingApplied.length === 0) {
    await run(db, 'BEGIN IMMEDIATE');
    try {
      await migrateListingRevisionValidationAccounting(db);
      await run(db, 'INSERT INTO schema_migrations (id) VALUES (?)', [LISTING_REVISION_VALIDATION_ACCOUNTING_MIGRATION]);
      await run(db, 'COMMIT');
    } catch (error) {
      try { await run(db, 'ROLLBACK'); } catch (_) {}
      throw error;
    }
  }
  const commerceSnapshotApplied = await all(db, 'SELECT id FROM schema_migrations WHERE id=?', [COMMERCE_SNAPSHOT_MIGRATION]);
  if (commerceSnapshotApplied.length === 0) {
    await run(db, 'BEGIN IMMEDIATE');
    try {
      await migrateCommerceSnapshots(db);
      await run(db, 'INSERT INTO schema_migrations(id) VALUES (?)', [COMMERCE_SNAPSHOT_MIGRATION]);
      await run(db, 'COMMIT');
    } catch (error) {
      try { await run(db, 'ROLLBACK'); } catch (_) {}
      throw error;
    }
  }
  const canonicalHandoffApplied = await all(db, 'SELECT id FROM schema_migrations WHERE id=?', [CANONICAL_REVIEW_HANDOFF_MIGRATION]);
  if (canonicalHandoffApplied.length === 0) {
    await run(db, 'BEGIN IMMEDIATE');
    try {
      await migrateCanonicalReviewHandoff(db);
      await run(db, 'INSERT INTO schema_migrations(id) VALUES (?)', [CANONICAL_REVIEW_HANDOFF_MIGRATION]);
      await run(db, 'COMMIT');
    } catch (error) {
      try { await run(db, 'ROLLBACK'); } catch (_) {}
      throw error;
    }
  }
  const ownerSubmissionApplied = await all(db, 'SELECT id FROM schema_migrations WHERE id=?', [OWNER_SUBMISSION_AUTHORIZATION_MIGRATION]);
  if (ownerSubmissionApplied.length === 0) {
    await run(db, 'BEGIN IMMEDIATE');
    try {
      await migrateOwnerSubmissionAuthorization(db);
      await run(db, 'INSERT INTO schema_migrations(id) VALUES (?)', [OWNER_SUBMISSION_AUTHORIZATION_MIGRATION]);
      await run(db, 'COMMIT');
    } catch (error) {
      try { await run(db, 'ROLLBACK'); } catch (_) {}
      throw error;
    }
  }
  const workflowArtifactApplied = await all(db, 'SELECT id FROM schema_migrations WHERE id=?', [COMMERCE_WORKFLOW_ARTIFACT_MIGRATION]);
  if (workflowArtifactApplied.length === 0) {
    await run(db, 'BEGIN IMMEDIATE');
    try {
      await migrateCommerceWorkflowArtifacts(db);
      await run(db, 'INSERT INTO schema_migrations(id) VALUES (?)', [COMMERCE_WORKFLOW_ARTIFACT_MIGRATION]);
      await run(db, 'COMMIT');
    } catch (error) {
      try { await run(db, 'ROLLBACK'); } catch (_) {}
      throw error;
    }
  }
  const operatorSubmissionApplied = await all(db, 'SELECT id FROM schema_migrations WHERE id=?', [OPERATOR_REPORTED_SUBMISSION_MIGRATION]);
  if (operatorSubmissionApplied.length === 0) {
    await run(db, 'BEGIN IMMEDIATE');
    try {
      await migrateOperatorReportedSubmissionLifecycle(db);
      await run(db, 'INSERT INTO schema_migrations(id) VALUES (?)', [OPERATOR_REPORTED_SUBMISSION_MIGRATION]);
      await run(db, 'COMMIT');
    } catch (error) {
      try { await run(db, 'ROLLBACK'); } catch (_) {}
      throw error;
    }
  }
}

async function migrateAgentWorkspaceScope(db) {
  const tableExists = async (name) => (await all(db, "SELECT name FROM sqlite_master WHERE type='table' AND name=?", [name])).length > 0;

  if (await tableExists('agents')) {
    const agentsCols = await all(db, 'PRAGMA table_info(agents)');
    if (!agentsCols.some(c => c.name === 'tenant_id')) {
      await run(db, 'ALTER TABLE agents ADD COLUMN tenant_id TEXT');
    }
    if (!agentsCols.some(c => c.name === 'workspace_id')) {
      await run(db, 'ALTER TABLE agents ADD COLUMN workspace_id INTEGER');
    }
    // Legacy unassigned rows remain NULL (unscoped) so they do not leak into workspace 1.
  }

  if (await tableExists('agent_logs')) {
    const agentLogsCols = await all(db, 'PRAGMA table_info(agent_logs)');
    if (!agentLogsCols.some(c => c.name === 'tenant_id')) {
      await run(db, 'ALTER TABLE agent_logs ADD COLUMN tenant_id TEXT');
    }
    if (!agentLogsCols.some(c => c.name === 'workspace_id')) {
      await run(db, 'ALTER TABLE agent_logs ADD COLUMN workspace_id INTEGER');
    }
    // Legacy unassigned rows remain NULL (unscoped) so they do not leak into workspace 1.
  }
}

const AGENT_WORKSPACE_SCOPE_MIGRATION = '2026-08-20_agent_workspace_scope';

const PROJECT_SCOPED_EVIDENCE_MIGRATION = '2026-08-21_project_scoped_evidence';

async function migrateProjectScopedEvidence(db) {
  const tableExists = async (name) => (await all(db, "SELECT name FROM sqlite_master WHERE type='table' AND name=?", [name])).length > 0;

  if (await tableExists('research_evidence')) {
    const cols = await all(db, 'PRAGMA table_info(research_evidence)');
    if (!cols.some(c => c.name === 'project_id')) {
      await run(db, 'ALTER TABLE research_evidence ADD COLUMN project_id INTEGER NULL REFERENCES research_projects(id)');
    }
    await run(db, `CREATE INDEX IF NOT EXISTS idx_research_evidence_proj ON research_evidence (tenant_id, workspace_id, marketplace, project_id)`);
  }

  if (await tableExists('market_trends')) {
    const cols = await all(db, 'PRAGMA table_info(market_trends)');
    if (!cols.some(c => c.name === 'project_id')) {
      await run(db, 'ALTER TABLE market_trends ADD COLUMN project_id INTEGER NULL REFERENCES research_projects(id)');
    }
    await run(db, `CREATE INDEX IF NOT EXISTS idx_market_trends_proj ON market_trends (tenant_id, workspace_id, marketplace, project_id)`);
  }

  if (await tableExists('listings')) {
    const cols = await all(db, 'PRAGMA table_info(listings)');
    if (!cols.some(c => c.name === 'project_id')) {
      await run(db, 'ALTER TABLE listings ADD COLUMN project_id INTEGER NULL REFERENCES research_projects(id)');
    }
    await run(db, `CREATE INDEX IF NOT EXISTS idx_listings_proj ON listings (tenant_id, workspace_id, marketplace, project_id)`);
  }
}

const CANONICAL_DAG_MIGRATION = '2026-08-21_canonical_workflow_dag';

async function migrateCanonicalDag(db) {
  const tableExists = async (name) => (await all(db, "SELECT name FROM sqlite_master WHERE type='table' AND name=?", [name])).length > 0;

  if (await tableExists('research_projects')) {
    const cols = await all(db, 'PRAGMA table_info(research_projects)');
    if (!cols.some(c => c.name === 'product_truth_notes')) {
      await run(db, 'ALTER TABLE research_projects ADD COLUMN product_truth_notes TEXT NULL');
    }
    if (!cols.some(c => c.name === 'validated_at')) {
      await run(db, 'ALTER TABLE research_projects ADD COLUMN validated_at DATETIME NULL');
    }
    if (!cols.some(c => c.name === 'validated_by')) {
      await run(db, 'ALTER TABLE research_projects ADD COLUMN validated_by INTEGER NULL');
    }
  }
}

module.exports = {
  LISTING_SCOPE_MIGRATION,
  SECURITY_CONTROLS_MIGRATION,
  KEYWORD_DETAIL_MIGRATION,
  MARKET_TRENDS_MARKETPLACE_MIGRATION,
  WORKSPACE_OWNERSHIP_MIGRATION,
  PRODUCT_TRUTH_ATTESTATION_MIGRATION,
  PRODUCT_TRUTH_CARD_MIGRATION,
  IMMUTABLE_REVISIONS_MIGRATION,
  PRODUCT_TRUTH_AUTHORITY_MIGRATION,
  PROJECT_PRODUCT_TRUTH_REVISIONS_MIGRATION,
  LISTING_REVISION_VALIDATION_ACCOUNTING_MIGRATION,
  COMMERCE_SNAPSHOT_MIGRATION,
  CANONICAL_REVIEW_HANDOFF_MIGRATION,
  OWNER_SUBMISSION_AUTHORIZATION_MIGRATION,
  COMMERCE_WORKFLOW_ARTIFACT_MIGRATION,
  OPERATOR_REPORTED_SUBMISSION_MIGRATION,
  migrateOwnerSubmissionAuthorization,
  migrateCommerceWorkflowArtifacts,
  migrateOperatorReportedSubmissionLifecycle,
  AGENT_WORKSPACE_SCOPE_MIGRATION,
  PROJECT_SCOPED_EVIDENCE_MIGRATION,
  CANONICAL_DAG_MIGRATION,
  runMigrations
};
