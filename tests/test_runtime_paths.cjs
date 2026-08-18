const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { resolveRuntimePaths } = require('../server/config/paths');

function testRuntimePathBoundary() {
  console.log('================================================================');
  console.log('  TESTING RUNTIME STATE PATH BOUNDARY (DB / IMPORTS / ENV OVERRIDE)');
  console.log('================================================================\n');

  // 1. No env override: defaults are unchanged from before this patch.
  const devDefaults = resolveRuntimePaths({});
  assert.strictEqual(devDefaults.dbPath, path.resolve(__dirname, '../server/app.db'), 'Default DB path must remain server/app.db when no override is set');
  assert.strictEqual(devDefaults.importsDir, path.resolve(__dirname, '../data/imports'), 'Default imports dir must remain data/imports when no override is set');
  console.log('  🟢 No env override -> defaults unchanged (server/app.db, data/imports).');

  // 2. NODE_ENV=test still uses an in-memory DB and the isolated test_imports dir.
  const testDefaults = resolveRuntimePaths({ NODE_ENV: 'test' });
  assert.strictEqual(testDefaults.dbPath, ':memory:', 'Test DB must stay in-memory');
  assert.strictEqual(testDefaults.importsDir, path.resolve(__dirname, '../data/test_imports'), 'Test imports dir must stay isolated');
  console.log('  🟢 NODE_ENV=test -> in-memory DB, isolated test_imports dir (unchanged).');

  // 3. TEST_IMPORTS_DIR still takes priority in test mode — existing test harnesses rely on this.
  const testOverride = resolveRuntimePaths({ NODE_ENV: 'test', TEST_IMPORTS_DIR: '/tmp/custom-test-imports' });
  assert.strictEqual(testOverride.importsDir, '/tmp/custom-test-imports');
  console.log('  🟢 TEST_IMPORTS_DIR override still takes priority in test mode (existing harness behavior preserved).');

  // 4. Production can now move both paths OUTSIDE the Git worktree via env vars.
  const prodOverride = resolveRuntimePaths({ OMNI_DB_PATH: '/var/lib/omniseller/app.db', OMNI_IMPORTS_DIR: '/var/lib/omniseller/imports' });
  assert.strictEqual(prodOverride.dbPath, '/var/lib/omniseller/app.db', 'OMNI_DB_PATH must let production relocate the DB outside the repo tree');
  assert.strictEqual(prodOverride.importsDir, '/var/lib/omniseller/imports', 'OMNI_IMPORTS_DIR must let production relocate imports outside the repo tree');
  console.log('  🟢 OMNI_DB_PATH / OMNI_IMPORTS_DIR override the in-repo defaults for production use.');

  // 5. server.js must use the shared resolver as its single source of truth —
  // no duplicated/inconsistent inline path resolution (the prior background-
  // agent tick handler re-resolved its own importsDir, ignoring overrides).
  const serverSrc = fs.readFileSync(require.resolve('../server/server.js'), 'utf8');
  const resolverCalls = (serverSrc.match(/=\s*resolveRuntimePaths\(/g) || []).length;
  assert.strictEqual(resolverCalls, 1, 'server.js must call resolveRuntimePaths() exactly once — a single source of truth');
  assert.ok(serverSrc.includes("require('./config/paths')"), 'server.js must use the shared runtime path resolver');
  assert.ok(!/path\.resolve\(__dirname,\s*'app\.db'\)/.test(serverSrc), 'server.js must not hard-code the DB path inline anymore');
  assert.ok(!/path\.resolve\(__dirname,\s*'\.\.\/data\/imports'\)/.test(serverSrc), 'server.js must not re-resolve importsDir inline anywhere (the prior background-tick duplicate)');
  console.log('  🟢 server.js has a single importsDir declaration sourced from the shared resolver (no duplicated inconsistent path).');

  // 6. .env location is also overridable so production secrets can live outside the repo.
  assert.ok(/DOTENV_PATH/.test(serverSrc), 'server.js must support DOTENV_PATH to relocate the .env file outside the repo tree');
  console.log('  🟢 DOTENV_PATH override present for relocating .env outside the repo tree.');

  console.log('\n================================================================');
  console.log('  🟢 ALL RUNTIME PATH BOUNDARY CASES PASSED!');
  console.log('================================================================');
}

testRuntimePathBoundary();
