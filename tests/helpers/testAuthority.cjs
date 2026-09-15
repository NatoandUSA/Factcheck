'use strict';

const fs = require('node:fs');

const ALLOWED_AUTHORITIES = new Set([
  'ACTIVE_R43',
  'HISTORICAL_COMPATIBILITY',
  'MIGRATION_LINEAGE',
  'SECURITY_CONTROL',
  'HARNESS_RELEASE_OPS'
]);

function loadAuthorityMap(inventory, authorityPath) {
  const manifest = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
  if (manifest.schemaVersion !== 1 || !ALLOWED_AUTHORITIES.has(manifest.defaultAuthority)) {
    throw new Error('INVALID_TEST_AUTHORITY_MANIFEST');
  }
  const inventorySet = new Set(inventory);
  const result = new Map(inventory.map(file => [file, manifest.defaultAuthority]));
  const assigned = new Set();
  for (const [authority, files] of Object.entries(manifest.authorities || {})) {
    if (!ALLOWED_AUTHORITIES.has(authority) || !Array.isArray(files)) throw new Error('INVALID_TEST_AUTHORITY');
    for (const file of files) {
      if (!inventorySet.has(file)) throw new Error(`UNKNOWN_TEST_AUTHORITY_ENTRY:${file}`);
      if (assigned.has(file)) throw new Error(`DUPLICATE_TEST_AUTHORITY_ENTRY:${file}`);
      assigned.add(file);
      result.set(file, authority);
    }
  }
  return result;
}

function authorityCounts(authorityMap) {
  return [...authorityMap.values()].reduce((counts, authority) => {
    counts[authority] = (counts[authority] || 0) + 1;
    return counts;
  }, {});
}

module.exports = Object.freeze({ ALLOWED_AUTHORITIES, loadAuthorityMap, authorityCounts });
