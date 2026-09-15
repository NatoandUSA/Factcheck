'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
assert.match(gitignore, /^\/reports\/$/m,
  'private review receipts and agent scratch artifacts must stay outside the public Git tree');
assert.match(gitignore, /^\/server\/package-lock\.json$/m,
  'the root workspace lockfile must remain the only npm dependency authority');
assert.equal(fs.existsSync(path.join(root, 'server/package-lock.json')), false,
  'a second server lockfile can silently drift from the CI/deploy workspace lock');

let trackedReports = [];
try {
  trackedReports = execFileSync('git', ['ls-files', '-z', '--', 'reports'], {
    cwd: root,
    encoding: 'utf8'
  }).split('\0').filter(Boolean);
} catch (error) {
  // Release archives intentionally contain no .git directory. In that mode,
  // the absence of reports/ is the equivalent packaged-artifact invariant.
  assert.equal(fs.existsSync(path.join(root, 'reports')), false,
    `release archive unexpectedly contains reports/: ${error.message}`);
}
assert.deepEqual(trackedReports, [],
  `public repository must not track reports/: ${trackedReports.join(', ')}`);

console.log('REPOSITORY_HYGIENE_TESTS_PASSED');
