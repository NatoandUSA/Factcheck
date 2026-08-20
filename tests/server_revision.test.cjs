/**
 * SERVER REVISION RESOLUTION UNIT TEST SUITE
 * Tests 4-tier SERVER_REVISION resolution:
 * 1. process.env.GIT_REVISION
 * 2. REVISION file in release root
 * 3. git rev-parse HEAD worktree fallback
 * 4. 'UNKNOWN' fallback
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

function resolveServerRevision(envRevision, targetDir) {
  if (envRevision && envRevision.trim() && envRevision !== 'UNKNOWN') {
    return envRevision.trim();
  }
  const revisionFilePath = path.resolve(targetDir, 'REVISION');
  if (fs.existsSync(revisionFilePath)) {
    try {
      const content = fs.readFileSync(revisionFilePath, 'utf8').trim();
      if (content) return content;
    } catch (_) {}
  }
  try {
    return execSync('git rev-parse HEAD', { cwd: targetDir, encoding: 'utf8' }).trim();
  } catch (_) {}
  return 'UNKNOWN';
}

function runRevisionTests() {
  console.log('================================================================');
  console.log('  TESTING 4-TIER SERVER REVISION RESOLUTION LOGIC SUITE');
  console.log('================================================================\n');

  // Test 1: Explicit GIT_REVISION environment variable takes highest precedence
  console.log('Test 1: Explicit process.env.GIT_REVISION precedence...');
  const explicitSha = '26481c6889677b345b10ac428aa0c9c6c4685105';
  const res1 = resolveServerRevision(explicitSha, __dirname);
  assert.strictEqual(res1, explicitSha, 'Explicit GIT_REVISION must take highest priority');
  console.log('  🟢 Explicit GIT_REVISION test PASSED.');

  // Test 2: REVISION file resolution when GIT_REVISION is empty
  console.log('\nTest 2: REVISION file in release root resolution...');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rev-test-'));
  const fileSha = 'e6df541c4a5d7fbc9d6e5bbca18b48d442039b96';
  fs.writeFileSync(path.join(tmpDir, 'REVISION'), `${fileSha}\n`);
  const res2 = resolveServerRevision(undefined, tmpDir);
  assert.strictEqual(res2, fileSha, 'REVISION file must be resolved when env is empty');
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('  🟢 REVISION file resolution test PASSED.');

  // Test 3: Git worktree resolution when GIT_REVISION and REVISION file are empty
  console.log('\nTest 3: Dynamic git rev-parse HEAD resolution...');
  const expectedGitSha = execSync('git rev-parse HEAD', { cwd: __dirname, encoding: 'utf8' }).trim();
  const res3 = resolveServerRevision(undefined, __dirname);
  assert.strictEqual(res3, expectedGitSha, 'Worktree git rev-parse HEAD must be resolved');
  console.log('  🟢 Dynamic git worktree resolution test PASSED.');

  // Test 4: Fallback to 'UNKNOWN' when env, file, and git are all unavailable
  console.log('\nTest 4: Fallback to UNKNOWN when env, file, and git are unavailable...');
  const res4 = resolveServerRevision(undefined, '/invalid/nonexistent/directory/path');
  assert.strictEqual(res4, 'UNKNOWN', 'Fallback must strictly be UNKNOWN, never hardcoded fake SHA');
  console.log('  🟢 Fallback UNKNOWN test PASSED.');

  console.log('\n================================================================');
  console.log('  🟢 ALL 4-TIER SERVER REVISION RESOLUTION TESTS PASSED CLEANLY');
  console.log('================================================================');
}

runRevisionTests();
