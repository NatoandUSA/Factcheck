'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { schemaFingerprint } = require('../scripts/schema_fingerprint.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-schema-fingerprint-'));
try {
  fs.mkdirSync(path.join(root, 'server', 'database'), { recursive: true });
  fs.writeFileSync(path.join(root, 'server', 'server.js'), 'db.exec(`CREATE TABLE listings (id INTEGER)`);');
  fs.writeFileSync(path.join(root, 'server', 'database', 'helper.js'), 'const sql = "ALTER TABLE listings ADD COLUMN name TEXT";');
  fs.writeFileSync(path.join(root, 'server', 'unrelated.js'), 'module.exports = 1;');
  const before = schemaFingerprint(root);
  assert.equal(before.schemaVersion, 2);
  assert.equal(before.files.some(item => item.path === 'server/database/helper.js'), true);
  assert.equal(before.files.some(item => item.path === 'server/server.js'), true);
  fs.writeFileSync(path.join(root, 'server', 'server.js'), 'db.exec(`CREATE TABLE listings (id INTEGER, status TEXT)`);');
  const after = schemaFingerprint(root);
  assert.notEqual(after.fingerprint, before.fingerprint, 'inline DDL change in server.js must change schema authority');
  fs.writeFileSync(path.join(root, 'server', 'newAuthority.cjs'), 'const state = stateColumnSql;');
  const expanded = schemaFingerprint(root);
  assert.equal(expanded.files.some(item => item.path === 'server/newAuthority.cjs'), true,
    'new schema-authority helper must be discovered without editing a path allowlist');
  fs.mkdirSync(path.join(root, 'shared'), { recursive: true });
  fs.writeFileSync(path.join(root, 'shared', 'schema.js'), 'const a = "CREATE "; const b = "TABLE dynamic_schema";');
  const shared = schemaFingerprint(root);
  assert.notEqual(shared.fingerprint, expanded.fingerprint, 'schema fragments outside server must change authority');
  fs.writeFileSync(path.join(root, 'shared', 'schema.sql'), 'CREATE TABLE sql_schema (id INTEGER);');
  const sql = schemaFingerprint(root);
  assert.notEqual(sql.fingerprint, shared.fingerprint, '.sql schema input must change authority');
  fs.writeFileSync(path.join(root, 'shared', 'schema.mjs'), 'export const schema = { table: "json_like" };');
  const mjs = schemaFingerprint(root);
  assert.notEqual(mjs.fingerprint, sql.fingerprint, '.mjs schema input must change authority');
  fs.writeFileSync(path.join(root, 'shared', 'schema.json'), '{"table":"configured_schema"}');
  const json = schemaFingerprint(root);
  assert.notEqual(json.fingerprint, mjs.fingerprint, '.json schema input must change authority');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
const repository = schemaFingerprint(path.resolve(__dirname, '..'));
assert.equal(repository.files.some(item => item.path === 'server/server.js'), true,
  'repository fingerprint must include inline CREATE TABLE/CHECK authority in server.js');
assert.equal(repository.files.some(item => item.path === 'server/database/migrations.js'), true,
  'repository fingerprint must include migration DDL authority');
assert.equal(repository.files.some(item => item.path === 'scripts/schema_fingerprint.cjs'), true,
  'fingerprint implementation must cover itself');
assert.equal(repository.files.some(item => item.path === 'scripts/verify_migration_compatibility_receipt.cjs'), true,
  'migration receipt verifier must be part of schema authority');
console.log('SCHEMA_FINGERPRINT_TESTS_PASSED');
