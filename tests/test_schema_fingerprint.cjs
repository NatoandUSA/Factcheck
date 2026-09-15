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
  assert.deepEqual(before.files.map(item => item.path), ['server/database/helper.js', 'server/server.js']);
  fs.writeFileSync(path.join(root, 'server', 'server.js'), 'db.exec(`CREATE TABLE listings (id INTEGER, status TEXT)`);');
  const after = schemaFingerprint(root);
  assert.notEqual(after.fingerprint, before.fingerprint, 'inline DDL change in server.js must change schema authority');
  fs.writeFileSync(path.join(root, 'server', 'newAuthority.cjs'), 'const state = stateColumnSql;');
  const expanded = schemaFingerprint(root);
  assert.equal(expanded.files.some(item => item.path === 'server/newAuthority.cjs'), true,
    'new schema-authority helper must be discovered without editing a path allowlist');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
const repository = schemaFingerprint(path.resolve(__dirname, '..'));
assert.equal(repository.files.some(item => item.path === 'server/server.js'), true,
  'repository fingerprint must include inline CREATE TABLE/CHECK authority in server.js');
assert.equal(repository.files.some(item => item.path === 'server/database/migrations.js'), true,
  'repository fingerprint must include migration DDL authority');
console.log('SCHEMA_FINGERPRINT_TESTS_PASSED');
