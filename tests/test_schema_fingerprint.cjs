'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { schemaFingerprint } = require('../scripts/schema_fingerprint.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-schema-fingerprint-'));
const write = (name, value) => {
  const absolute = path.join(root, name);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, value);
  return absolute;
};

try {
  write('server/database/migrations.js', 'module.exports = `ALTER TABLE listings ADD COLUMN name TEXT`;');
  write('server/projectStateRegistry.js', 'module.exports = { stateColumnSql: "state TEXT" };');
  write('server/server.js', `const route = 1;
// Initialize DB schema
db.run(\`CREATE TABLE listings (id INTEGER)\`);
const ensureTestDatabaseFixtures = () => {};
const unrelatedRoute = 2;`);
  write('src/Button.js', 'export default "blue";');
  write('tests/example.cjs', 'module.exports = "test one";');
  const manifestPath = write('scripts/schema_authority_manifest.json', JSON.stringify({
    schemaVersion: 1,
    includeTrees: [],
    includeFiles: ['server/database/migrations.js', 'server/projectStateRegistry.js'],
    bootstrapExtraction: {
      path: 'server/server.js', startMarker: '// Initialize DB schema',
      endMarker: 'const ensureTestDatabaseFixtures'
    }
  }));

  const before = schemaFingerprint(root, { manifestPath });
  assert.equal(before.schemaVersion, 3);
  assert.equal(before.schemaAuthorityFingerprint, before.fingerprint);
  write('REVISION', 'a'.repeat(40));
  write('MANIFEST.json', '{"built_at":"generated-at-deploy"}');
  const generatedMetadata = schemaFingerprint(root, { manifestPath });
  assert.equal(generatedMetadata.releaseControlFingerprint, before.releaseControlFingerprint,
    'deploy-generated release metadata must not make Owner authorization unreproducible');

  write('src/Button.js', 'export default "green";');
  const uiOnly = schemaFingerprint(root, { manifestPath });
  assert.equal(uiOnly.schemaAuthorityFingerprint, before.schemaAuthorityFingerprint,
    'UI-only change must not trigger migration rehearsal');
  assert.notEqual(uiOnly.releaseControlFingerprint, before.releaseControlFingerprint,
    'UI-only change must remain visible to release-control integrity');

  write('tests/example.cjs', 'module.exports = "test two";');
  const testOnly = schemaFingerprint(root, { manifestPath });
  assert.equal(testOnly.schemaAuthorityFingerprint, before.schemaAuthorityFingerprint,
    'test-only change must not trigger migration rehearsal');

  write('server/server.js', `const route = 1;
// Initialize DB schema
db.run(\`CREATE TABLE listings (id INTEGER, status TEXT)\`);
const ensureTestDatabaseFixtures = () => {};
const unrelatedRoute = 2;`);
  const bootstrapChange = schemaFingerprint(root, { manifestPath });
  assert.notEqual(bootstrapChange.schemaAuthorityFingerprint, before.schemaAuthorityFingerprint,
    'bootstrap DDL change must trigger migration rehearsal');

  write('server/server.js', `const route = 999;
// Initialize DB schema
db.run(\`CREATE TABLE listings (id INTEGER)\`);
const ensureTestDatabaseFixtures = () => {};
const unrelatedRoute = 999;`);
  const routeOnly = schemaFingerprint(root, { manifestPath });
  assert.equal(routeOnly.schemaAuthorityFingerprint, before.schemaAuthorityFingerprint,
    'server route changes outside bootstrap markers must not trigger migration rehearsal');

  write('server/database/migrations.js', 'module.exports = `CREATE INDEX idx_listing_status ON listings(status)`;');
  const migrationChange = schemaFingerprint(root, { manifestPath });
  assert.notEqual(migrationChange.schemaAuthorityFingerprint, before.schemaAuthorityFingerprint,
    'migration authority change must trigger rehearsal');

  write('shared/schema.ddl', 'CREATE TABLE shared_schema (id INTEGER);');
  write('server/database/migrations.js', "require('../../shared/schema.ddl');");
  const dependency = schemaFingerprint(root, { manifestPath });
  write('shared/schema.ddl', 'CREATE TABLE shared_schema (id INTEGER, value TEXT);');
  const dependencyChange = schemaFingerprint(root, { manifestPath });
  assert.notEqual(dependencyChange.schemaAuthorityFingerprint, dependency.schemaAuthorityFingerprint,
    'schema dependency must be fingerprinted regardless of extension or directory');

  write('notes/anything.extensionless', 'release-control change');
  const arbitraryExtension = schemaFingerprint(root, { manifestPath });
  assert.notEqual(arbitraryExtension.releaseControlFingerprint, dependencyChange.releaseControlFingerprint,
    'release-control digest must cover regular files without an extension allowlist');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

const repository = schemaFingerprint(path.resolve(__dirname, '..'));
assert.equal(repository.files.some(item => item.path === 'server/database/migrations.js'), true);
assert.equal(repository.files.some(item => item.path === 'server/database/projectStateMigration.js'), true);
assert.equal(repository.files.some(item => item.path === 'server/projectStateRegistry.js'), true);
assert.equal(repository.files.some(item => item.path === 'server/server.js#bootstrap-schema'), true);
assert.match(repository.schemaAuthorityFingerprint, /^[a-f0-9]{64}$/);
assert.match(repository.releaseControlFingerprint, /^[a-f0-9]{64}$/);
assert.match(repository.comparatorFingerprint, /^[a-f0-9]{64}$/);

console.log('SCHEMA_FINGERPRINT_TESTS_PASSED');
