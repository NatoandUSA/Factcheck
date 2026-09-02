const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const os = require('os');
const { childImportsDir } = require('./helpers/suiteIsolation.cjs');
const {
  resolveRuntimePaths,
  isPathInsideRepo,
  REPO_ROOT
} = require('../server/config/paths');

function expectThrow(fn, code) {
  assert.throws(fn, (err) => {
    assert.ok(String(err.message).includes(code), `Expected ${code}, got: ${err.message}`);
    return true;
  });
}

function testRuntimePathBoundary() {
  console.log('================================================================');
  console.log('  TESTING RUNTIME STATE PATH BOUNDARY (DB / IMPORTS / ENV)');
  console.log('================================================================\n');

  // 1. Local development remains backward compatible.
  const devDefaults = resolveRuntimePaths({});
  assert.strictEqual(devDefaults.dbPath, path.resolve(__dirname, '../server/app.db'));
  assert.strictEqual(devDefaults.importsDir, path.resolve(__dirname, '../data/imports'));
  console.log('  🟢 Dev defaults remain server/app.db + data/imports.');

  // 2. Tests stay isolated and in-memory.
  const testDefaults = resolveRuntimePaths({ NODE_ENV: 'test' });
  assert.strictEqual(testDefaults.dbPath, ':memory:');
  assert.ok(
    testDefaults.importsDir.startsWith(path.resolve(require('os').tmpdir(), 'omniseller-test-imports') + path.sep),
    `Default test imports must be outside the repo and process-scoped, got ${testDefaults.importsDir}`
  );
  const isolatedA = resolveRuntimePaths({ NODE_ENV: 'test', OMNI_TEST_RUN_ID: 'fixture-a' });
  const isolatedB = resolveRuntimePaths({ NODE_ENV: 'test', OMNI_TEST_RUN_ID: 'fixture-b' });
  assert.notStrictEqual(isolatedA.importsDir, isolatedB.importsDir);
  const testOverride = resolveRuntimePaths({ NODE_ENV: 'test', TEST_IMPORTS_DIR: '/tmp/custom-test-imports' });
  assert.strictEqual(testOverride.importsDir, '/tmp/custom-test-imports');

  const suiteRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omniseller-runtime-path-test-'));
  try {
    const childA = childImportsDir(suiteRoot, 0, 'tests/a.cjs');
    const childB = childImportsDir(suiteRoot, 1, 'tests/b.cjs');
    const probe = `const { resolveRuntimePaths } = require('./server/config/paths'); process.stdout.write(resolveRuntimePaths(process.env).importsDir);`;
    const resolveInChild = (importsDir) => execFileSync(process.execPath, ['-e', probe], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'test', TEST_IMPORTS_DIR: importsDir }
    });
    const resolvedA = path.resolve(resolveInChild(childA));
    const resolvedB = path.resolve(resolveInChild(childB));
    assert.notStrictEqual(resolvedA, resolvedB, 'Every child test must receive a distinct imports directory');
    assert.ok(resolvedA.startsWith(path.resolve(suiteRoot) + path.sep));
    assert.ok(resolvedB.startsWith(path.resolve(suiteRoot) + path.sep));
  } finally {
    fs.rmSync(suiteRoot, { recursive: true, force: true });
  }
  console.log('  🟢 Test defaults remain isolated; TEST_IMPORTS_DIR still works.');

  // 3. Production must explicitly externalize DB, imports, and dotenv path.
  const prodEnv = {
    NODE_ENV: 'production',
    OMNI_DB_PATH: '/var/lib/omniseller/app.db',
    OMNI_IMPORTS_DIR: '/var/lib/omniseller/imports',
    DOTENV_PATH: '/etc/omniseller/omniseller.env'
  };
  const prodPaths = resolveRuntimePaths(prodEnv);
  assert.strictEqual(prodPaths.dbPath, path.resolve('/var/lib/omniseller/app.db'));
  assert.strictEqual(prodPaths.importsDir, path.resolve('/var/lib/omniseller/imports'));
  assert.strictEqual(isPathInsideRepo(prodPaths.dbPath), false);
  assert.strictEqual(isPathInsideRepo(prodPaths.importsDir), false);
  console.log('  🟢 Production accepts explicit absolute state paths outside the worktree.');

  // 4. Production fails closed if any external-state contract is missing.
  expectThrow(() => resolveRuntimePaths({
    NODE_ENV: 'production',
    OMNI_IMPORTS_DIR: '/var/lib/omniseller/imports',
    DOTENV_PATH: '/etc/omniseller/omniseller.env'
  }), 'P0_OPS_EXTERNAL_PATH_REQUIRED:OMNI_DB_PATH');
  expectThrow(() => resolveRuntimePaths({
    NODE_ENV: 'production',
    OMNI_DB_PATH: '/var/lib/omniseller/app.db',
    DOTENV_PATH: '/etc/omniseller/omniseller.env'
  }), 'P0_OPS_EXTERNAL_PATH_REQUIRED:OMNI_IMPORTS_DIR');
  expectThrow(() => resolveRuntimePaths({
    NODE_ENV: 'production',
    OMNI_DB_PATH: '/var/lib/omniseller/app.db',
    OMNI_IMPORTS_DIR: '/var/lib/omniseller/imports'
  }), 'P0_OPS_EXTERNAL_PATH_REQUIRED:DOTENV_PATH');
  console.log('  🟢 Production cannot silently fall back into the repository when config is missing.');

  // 5. Production rejects relative paths and paths lexically inside the repo.
  expectThrow(() => resolveRuntimePaths({
    NODE_ENV: 'production',
    OMNI_DB_PATH: 'server/app.db',
    OMNI_IMPORTS_DIR: '/var/lib/omniseller/imports',
    DOTENV_PATH: '/etc/omniseller/omniseller.env'
  }), 'P0_OPS_ABSOLUTE_PATH_REQUIRED:OMNI_DB_PATH');

  expectThrow(() => resolveRuntimePaths({
    NODE_ENV: 'production',
    OMNI_DB_PATH: path.join(REPO_ROOT, 'server/app.db'),
    OMNI_IMPORTS_DIR: '/var/lib/omniseller/imports',
    DOTENV_PATH: '/etc/omniseller/omniseller.env'
  }), 'P0_OPS_PATH_INSIDE_WORKTREE:OMNI_DB_PATH');

  expectThrow(() => resolveRuntimePaths({
    NODE_ENV: 'production',
    OMNI_DB_PATH: '/var/lib/omniseller/app.db',
    OMNI_IMPORTS_DIR: path.join(REPO_ROOT, 'data/imports'),
    DOTENV_PATH: '/etc/omniseller/omniseller.env'
  }), 'P0_OPS_PATH_INSIDE_WORKTREE:OMNI_IMPORTS_DIR');

  expectThrow(() => resolveRuntimePaths({
    NODE_ENV: 'production',
    OMNI_DB_PATH: '/var/lib/omniseller/app.db',
    OMNI_IMPORTS_DIR: '/var/lib/omniseller/imports',
    DOTENV_PATH: path.join(REPO_ROOT, '.env')
  }), 'P0_OPS_PATH_INSIDE_WORKTREE:DOTENV_PATH');
  console.log('  🟢 Production rejects relative or in-worktree runtime paths.');

  // 6. server.js must use one runtime-path resolver with no duplicate DB/imports resolution.
  const serverSrc = fs.readFileSync(require.resolve('../server/server.js'), 'utf8');
  const resolverCalls = (serverSrc.match(/=\s*resolveRuntimePaths\(/g) || []).length;
  assert.strictEqual(resolverCalls, 1, 'server.js must call resolveRuntimePaths() exactly once');
  assert.ok(serverSrc.includes("require('./config/paths')"));
  assert.ok(!/path\.resolve\(__dirname,\s*'app\.db'\)/.test(serverSrc));
  assert.ok(!/path\.resolve\(__dirname,\s*'\.\.\/data\/imports'\)/.test(serverSrc));
  assert.ok(/DOTENV_PATH/.test(serverSrc), 'server.js must support an external dotenv path');
  console.log('  🟢 server.js uses the shared resolver; duplicate path authorities are gone.');

  // 7. Runtime state must not be tracked by Git. A symlink inside the worktree is
  // not a safety boundary when tracked descendants exist: reset/checkout may
  // replace the symlink with tracked files. Keep both historical runtime paths
  // absent from the index and ignored for future additions.
  const trackedRuntimeState = execFileSync(
    'git',
    ['ls-files', '--', 'server/app.db', 'data/imports'],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  ).trim();
  assert.strictEqual(
    trackedRuntimeState,
    '',
    `Mutable runtime state must not be tracked by Git. Found:\n${trackedRuntimeState}`
  );
  const gitignore = fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8');
  assert.ok(/^server\/app\.db$/m.test(gitignore), 'server/app.db must remain ignored');
  assert.ok(/^data\/imports\/$/m.test(gitignore), 'data/imports/ must be ignored as mutable runtime state');
  console.log('  🟢 Git index contains no mutable DB/imports state; runtime paths are ignored.');

  console.log('\n================================================================');
  console.log('  🟢 ALL RUNTIME PATH BOUNDARY CASES PASSED!');
  console.log('================================================================');
}

testRuntimePathBoundary();
