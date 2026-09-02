const assert = require('node:assert/strict');
const { states, stateColumnSql, schemaStates } = require('../projectStateRegistry');
const MIGRATION_ID = '2026-09-02_project_state_registry';
const all = (db, sql, args = []) => new Promise((resolve, reject) => db.all(sql, args, (e, rows) => e ? reject(e) : resolve(rows)));
const run = (db, sql, args = []) => new Promise((resolve, reject) => db.run(sql, args, e => e ? reject(e) : resolve()));
const quote = value => '"' + value.replace(/"/g, '""') + '"';

async function migrateProjectStates(db) {
  const [table] = await all(db, "SELECT sql FROM sqlite_master WHERE type='table' AND name='research_projects'");
  if (!table) return { skipped: true };
  const actual = schemaStates(table.sql);
  const current = actual.length === states.length && [...actual].sort().join(',') === [...states].sort().join(',');
  if (current && /"?state"?\s+TEXT\s+NOT\s+NULL/i.test(table.sql)) {
    await run(db, 'INSERT OR IGNORE INTO schema_migrations(id) VALUES (?)', [MIGRATION_ID]);
    return { migrated: false };
  }
  // The previous nine-state shape is the only supported source schema.
  const legacy = states.filter(s => s !== 'PRODUCT_TRUTH_VERIFIED');
  if (!current && [...actual].sort().join(',') !== [...legacy].sort().join(',')) throw new Error('UNRECOGNIZED_PROJECT_STATE_SCHEMA');
  await run(db, 'BEGIN IMMEDIATE');
  try {
    const before = await all(db, 'SELECT * FROM research_projects ORDER BY id');
    if (before.some(row => !states.includes(row.state))) throw new Error('INVALID_LEGACY_PROJECT_STATE');
    // Replace ONLY the constrained state column. Never drop/rename the parent
    // table: doing that changes FK bindings and can cascade child deletions.
    // Both old and new state constraints remain enforced while copying.
    if ((await all(db, 'PRAGMA foreign_key_check')).length) throw new Error('PREEXISTING_FOREIGN_KEY_VIOLATION');
    const objects = await all(db, "SELECT type,name,sql FROM sqlite_master WHERE tbl_name='research_projects' AND type IN ('index','trigger') AND sql IS NOT NULL");
    const statePattern = /state\s+TEXT\s+(?:NOT\s+NULL\s+)?DEFAULT\s+'EVIDENCE_INTAKE'\s+CHECK\s*\(\s*state\s+IN\s*\([^)]+\)\s*\)/i;
    if (!statePattern.test(table.sql)) throw new Error('UNRECOGNIZED_PROJECT_STATE_COLUMN');
    for (const object of objects) await run(db, `DROP ${object.type.toUpperCase()} ${quote(object.name)}`);
    const temporaryDefinition = stateColumnSql.replace(/\bstate\b/g, 'h0_registry_state');
    await run(db, `ALTER TABLE research_projects ADD COLUMN ${temporaryDefinition}`);
    await run(db, 'UPDATE research_projects SET h0_registry_state=state');
    const copied = await all(db, 'SELECT state,h0_registry_state FROM research_projects');
    assert.ok(copied.every(row => row.state === row.h0_registry_state));
    await run(db, 'ALTER TABLE research_projects DROP COLUMN state');
    await run(db, 'ALTER TABLE research_projects RENAME COLUMN h0_registry_state TO state');
    for (const object of objects) await run(db, object.sql);
    assert.deepEqual(await all(db, 'SELECT * FROM research_projects ORDER BY id'), before);
    const [after] = await all(db, "SELECT sql FROM sqlite_master WHERE name='research_projects'");
    assert.deepEqual(schemaStates(after.sql).sort(), [...states].sort());
    if ((await all(db, 'PRAGMA foreign_key_check')).length) throw new Error('MIGRATED_FOREIGN_KEY_VIOLATION');
    await run(db, 'INSERT OR IGNORE INTO schema_migrations(id) VALUES (?)', [MIGRATION_ID]);
    await run(db, 'COMMIT');
    return { migrated: true, preservedRows: before.length };
  } catch (error) {
    await run(db, 'ROLLBACK');
    throw error;
  }
}
module.exports = { MIGRATION_ID, migrateProjectStates };
