'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SHA40 = /^[a-f0-9]{40}$/;

function planReleaseRetention(releasesDir, { targetSha, baselineSha, keepRecent = 2, nowMs = Date.now() } = {}) {
  const root = path.resolve(releasesDir);
  if (!SHA40.test(String(targetSha || '')) || !SHA40.test(String(baselineSha || ''))) {
    throw new Error('RELEASE_RETENTION_SHA_REQUIRED');
  }
  if (!Number.isInteger(keepRecent) || keepRecent < 0 || keepRecent > 20) {
    throw new Error('INVALID_KEEP_RECENT');
  }
  const valid = [];
  const warnings = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !SHA40.test(entry.name)) continue;
    const releasePath = path.resolve(root, entry.name);
    if (path.dirname(releasePath) !== root) throw new Error('RELEASE_PATH_ESCAPE');
    const manifestPath = path.join(releasePath, 'MANIFEST.json');
    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
    catch (_) { warnings.push({ sha: entry.name, code: 'INVALID_OR_MISSING_MANIFEST' }); continue; }
    const builtAtMs = Date.parse(manifest.built_at);
    if (manifest.sha !== entry.name || manifest.status !== 'COMPLETE' || !Number.isFinite(builtAtMs)
      || builtAtMs > nowMs + (24 * 60 * 60 * 1000)) {
      warnings.push({ sha: entry.name, code: 'UNTRUSTED_RELEASE_MANIFEST' });
      continue;
    }
    valid.push({ sha: entry.name, path: releasePath, builtAt: manifest.built_at, builtAtMs });
  }
  valid.sort((a, b) => b.builtAtMs - a.builtAtMs || b.sha.localeCompare(a.sha));
  const keep = new Set([targetSha, baselineSha, ...valid.slice(0, keepRecent).map(item => item.sha)]);
  return Object.freeze({
    keep: valid.filter(item => keep.has(item.sha)).map(item => item.path),
    prune: valid.filter(item => !keep.has(item.sha)).map(item => item.path),
    warnings
  });
}

if (require.main === module) {
  const [releasesDir, targetSha, baselineSha, keepRecent = '2'] = process.argv.slice(2);
  try {
    process.stdout.write(`${JSON.stringify(planReleaseRetention(releasesDir, {
      targetSha, baselineSha, keepRecent: Number(keepRecent)
    }))}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = Object.freeze({ planReleaseRetention, SHA40 });
