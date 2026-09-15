'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { planReleaseRetention } = require('../scripts/release_retention.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-retention-'));
const shas = ['0'.repeat(40), 'f'.repeat(40), 'a'.repeat(40), 'b'.repeat(40), 'c'.repeat(40)];
const built = ['2026-01-05T00:00:00Z', '2026-01-01T00:00:00Z', '2026-01-04T00:00:00Z', '2026-01-03T00:00:00Z', '2026-01-02T00:00:00Z'];

try {
  shas.forEach((sha, index) => {
    const directory = path.join(root, sha);
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory, 'MANIFEST.json'), JSON.stringify({ sha, built_at: built[index], status: 'COMPLETE' }));
  });
  const invalidSha = 'd'.repeat(40);
  fs.mkdirSync(path.join(root, invalidSha));
  fs.writeFileSync(path.join(root, invalidSha, 'MANIFEST.json'), '{broken');

  const plan = planReleaseRetention(root, { targetSha: shas[1], baselineSha: shas[4], keepRecent: 2 });
  const kept = plan.keep.map(item => path.basename(item)).sort();
  const pruned = plan.prune.map(item => path.basename(item)).sort();
  assert.deepEqual(kept, [shas[0], shas[1], shas[2], shas[4]].sort(),
    'target and baseline must survive even when lexicographic order disagrees with build chronology');
  assert.deepEqual(pruned, [shas[3]]);
  assert.deepEqual(plan.warnings, [{ sha: invalidSha, code: 'INVALID_OR_MISSING_MANIFEST' }]);
  assert.throws(() => planReleaseRetention(root, { targetSha: '../escape', baselineSha: shas[0] }),
    /RELEASE_RETENTION_SHA_REQUIRED/);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log('RELEASE_RETENTION_TESTS_PASSED');
