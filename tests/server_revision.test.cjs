/**
 * SERVER REVISION RESOLUTION UNIT TEST SUITE
 * Tests dynamic SERVER_REVISION resolution via process.env.GIT_REVISION, git rev-parse HEAD, and UNKNOWN fallback.
 */

const assert = require('assert');
const { execSync } = require('child_process');

function resolveServerRevision(envRevision, cwd) {
  let revision = envRevision || 'UNKNOWN';
  if (revision === 'UNKNOWN') {
    try {
      revision = execSync('git rev-parse HEAD', { cwd, encoding: 'utf8' }).trim();
    } catch (_) {
      revision = 'UNKNOWN';
    }
  }
  return revision;
}

function runRevisionTests() {
  console.log('================================================================');
  console.log('  TESTING SERVER REVISION RESOLUTION LOGIC SUITE');
  console.log('================================================================\n');

  // Test 1: Explicit GIT_REVISION environment variable takes precedence
  console.log('Test 1: Explicit process.env.GIT_REVISION precedence...');
  const explicitSha = 'e6df541c4a5d7fbc9d6e5bbca18b48d442039b96';
  const res1 = resolveServerRevision(explicitSha, __dirname);
  assert.strictEqual(res1, explicitSha, 'Explicit GIT_REVISION must be preserved');
  console.log('  🟢 Explicit GIT_REVISION test PASSED.');

  // Test 2: Git worktree resolution when GIT_REVISION is undefined
  console.log('\nTest 2: Dynamic git rev-parse HEAD resolution...');
  const expectedGitSha = execSync('git rev-parse HEAD', { cwd: __dirname, encoding: 'utf8' }).trim();
  const res2 = resolveServerRevision(undefined, __dirname);
  assert.strictEqual(res2, expectedGitSha, 'Worktree git rev-parse HEAD must be resolved');
  console.log('  🟢 Dynamic git worktree resolution test PASSED.');

  // Test 3: Fallback to 'UNKNOWN' when git is unavailable and env is empty
  console.log('\nTest 3: Fallback to UNKNOWN when git is unavailable...');
  const res3 = resolveServerRevision(undefined, '/invalid/nonexistent/directory/path');
  assert.strictEqual(res3, 'UNKNOWN', 'Fallback must strictly be UNKNOWN, never hardcoded fake SHA');
  console.log('  🟢 Fallback UNKNOWN test PASSED.');

  console.log('\n================================================================');
  console.log('  🟢 ALL SERVER REVISION RESOLUTION TESTS PASSED CLEANLY');
  console.log('================================================================');
}

runRevisionTests();
