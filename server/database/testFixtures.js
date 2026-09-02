const { hashPassword, verifyPassword } = require('../security/scrypt');

const inFlightByDatabase = new WeakMap();

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) return reject(error);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
  });
}

async function requireSingleOrCreate(db, { selectSql, selectParams, insertSql, insertParams, label, validateExisting }) {
  const existing = await all(db, selectSql, selectParams);
  if (existing.length > 1) {
    throw new Error(`TEST_FIXTURE_DUPLICATE:${label}`);
  }
  if (existing.length === 1) {
    if (validateExisting && !(await validateExisting(existing[0]))) {
      throw new Error(`TEST_FIXTURE_MISMATCH:${label}`);
    }
    return existing[0].id;
  }
  return (await run(db, insertSql, insertParams)).lastID;
}

async function requireMembership(db, userId, workspaceId, role) {
  const rows = await all(
    db,
    'SELECT id, role FROM workspace_memberships WHERE user_id = ? AND workspace_id = ?',
    [userId, workspaceId]
  );
  if (rows.length > 1) throw new Error(`TEST_FIXTURE_DUPLICATE:membership:${userId}:${workspaceId}`);
  if (rows.length === 1) {
    if (rows[0].role !== role) {
      throw new Error(`TEST_FIXTURE_ROLE_MISMATCH:${userId}:${workspaceId}`);
    }
    return rows[0].id;
  }
  return (await run(
    db,
    'INSERT INTO workspace_memberships (user_id, workspace_id, role) VALUES (?, ?, ?)',
    [userId, workspaceId, role]
  )).lastID;
}

async function requireAgent(db, { tenantId, workspaceId, name, role, status }) {
  const rows = await all(db,
    'SELECT id, tenant_id, workspace_id, role, status FROM agents WHERE name = ?', [name]);
  if (rows.length > 1) throw new Error(`TEST_FIXTURE_DUPLICATE:agent:${name}`);
  if (rows.length === 1) {
    const existing = rows[0];
    if (existing.tenant_id !== tenantId || existing.workspace_id !== workspaceId
      || existing.role !== role || existing.status !== status) {
      throw new Error(`TEST_FIXTURE_AGENT_MISMATCH:${name}`);
    }
    return existing.id;
  }
  return (await run(db,
    `INSERT INTO agents (tenant_id, workspace_id, name, role, status)
     VALUES (?, ?, ?, ?, ?)`, [tenantId, workspaceId, name, role, status])).lastID;
}

async function seedFixtures(db) {
  // Hash before the transaction so an expensive asynchronous operation never
  // creates a CHECK/await/INSERT TOCTOU window inside fixture setup.
  const defaultPasswordHash = await hashPassword('password123');
  await run(db, 'BEGIN IMMEDIATE');
  try {
    const alphaAmazonId = await requireSingleOrCreate(db, {
      selectSql: "SELECT id, name FROM workspaces WHERE tenant_id = ? AND marketplace = 'AMAZON'",
      selectParams: ['tenant-alpha-uuid'],
      insertSql: 'INSERT INTO workspaces (tenant_id, marketplace, name) VALUES (?, ?, ?)',
      insertParams: ['tenant-alpha-uuid', 'AMAZON', 'Amazon Main Store'],
      label: 'workspace:tenant-alpha-uuid:AMAZON',
      validateExisting: (row) => row.name === 'Amazon Main Store'
    });
    const alphaEtsyId = await requireSingleOrCreate(db, {
      selectSql: "SELECT id, name FROM workspaces WHERE tenant_id = ? AND marketplace = 'ETSY'",
      selectParams: ['tenant-alpha-uuid'],
      insertSql: 'INSERT INTO workspaces (tenant_id, marketplace, name) VALUES (?, ?, ?)',
      insertParams: ['tenant-alpha-uuid', 'ETSY', 'Etsy Craft Studio'],
      label: 'workspace:tenant-alpha-uuid:ETSY',
      validateExisting: (row) => row.name === 'Etsy Craft Studio'
    });
    const betaAmazonId = await requireSingleOrCreate(db, {
      selectSql: "SELECT id, name FROM workspaces WHERE tenant_id = ? AND marketplace = 'AMAZON'",
      selectParams: ['tenant-beta-uuid'],
      insertSql: 'INSERT INTO workspaces (tenant_id, marketplace, name) VALUES (?, ?, ?)',
      insertParams: ['tenant-beta-uuid', 'AMAZON', 'Tenant Beta Store'],
      label: 'workspace:tenant-beta-uuid:AMAZON',
      validateExisting: (row) => row.name === 'Tenant Beta Store'
    });

    const ensureUser = (email, name) => requireSingleOrCreate(db, {
      selectSql: 'SELECT id, name, password_hash FROM users WHERE email = ?',
      selectParams: [email],
      insertSql: 'INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)',
      insertParams: [email, defaultPasswordHash, name],
      label: `user:${email}`,
      validateExisting: async (row) => row.name === name && await verifyPassword('password123', row.password_hash)
    });

    const ownerId = await ensureUser('owner@omniseller.local', 'Store Owner');
    const managerId = await ensureUser('manager@omniseller.local', 'Ops Manager');
    const sellerId = await ensureUser('seller@omniseller.local', 'Listing Specialist');
    const betaOwnerId = await ensureUser('owner-beta@omniseller.local', 'Tenant Beta Owner');

    await requireMembership(db, ownerId, alphaAmazonId, 'OWNER');
    await requireMembership(db, ownerId, alphaEtsyId, 'OWNER');
    await requireMembership(db, managerId, alphaAmazonId, 'MANAGER');
    await requireMembership(db, sellerId, alphaAmazonId, 'SELLER');
    await requireMembership(db, betaOwnerId, betaAmazonId, 'OWNER');

    // Agents share the same transaction/readiness barrier as every other
    // server fixture. This prevents a second CHECK/INSERT race after users
    // and workspaces have already become observable to a test.
    await requireAgent(db, {
      tenantId: 'tenant-alpha-uuid', workspaceId: alphaAmazonId,
      name: 'Trend Scout', role: 'RESEARCHER', status: 'OFFLINE'
    });
    await requireAgent(db, {
      tenantId: 'tenant-alpha-uuid', workspaceId: alphaAmazonId,
      name: 'AI Drafter', role: 'DRAFTER', status: 'OFFLINE'
    });
    await run(db, 'COMMIT');
  } catch (error) {
    try {
      await run(db, 'ROLLBACK');
    } catch (rollbackError) {
      error.rollbackError = rollbackError;
    }
    throw error;
  }
}

function ensureTestDatabaseFixtures(db) {
  const existing = inFlightByDatabase.get(db);
  if (existing) return existing;

  const current = seedFixtures(db).finally(() => {
    if (inFlightByDatabase.get(db) === current) inFlightByDatabase.delete(db);
  });
  inFlightByDatabase.set(db, current);
  return current;
}

module.exports = { ensureTestDatabaseFixtures };
