function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) return reject(error);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
  });
}

// Preserve the pre-existing non-test behavior: only an entirely empty Agent
// Hub receives the two legacy defaults. The operation is now awaited and
// atomic, so application readiness cannot race with partially seeded agents.
async function ensureLegacyDefaultAgents(db) {
  await run(db, 'BEGIN IMMEDIATE');
  try {
    const row = await get(db, 'SELECT COUNT(*) AS count FROM agents');
    if (row.count === 0) {
      await run(db,
        'INSERT INTO agents (tenant_id, workspace_id, name, role, status) VALUES (?, ?, ?, ?, ?)',
        ['default', 1, 'Trend Scout', 'RESEARCHER', 'OFFLINE']);
      await run(db,
        'INSERT INTO agents (tenant_id, workspace_id, name, role, status) VALUES (?, ?, ?, ?, ?)',
        ['default', 1, 'AI Drafter', 'DRAFTER', 'OFFLINE']);
    }
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

module.exports = { ensureLegacyDefaultAgents };
