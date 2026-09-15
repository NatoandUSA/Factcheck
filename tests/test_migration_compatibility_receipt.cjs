'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { verifyMigrationCompatibilityReceipt } = require('../scripts/verify_migration_compatibility_receipt.cjs');

const baselineSha = 'a'.repeat(40);
const targetSha = 'b'.repeat(40);
const baselineSchemaFingerprint = 'c'.repeat(64);
const targetSchemaFingerprint = 'd'.repeat(64);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-migration-evidence-'));
const evidenceFile = 'rehearsal.json';
const evidencePath = path.join(root, evidenceFile);
const counts = { research_projects: 7, listings: 11, listing_revisions: 4 };
const evidence = {
  schemaVersion: 1, baselineSha, targetSha, baselineSchemaFingerprint, targetSchemaFingerprint,
  startedAt: '2026-09-15T10:00:00.000Z', finishedAt: '2026-09-15T10:05:00.000Z',
  checks: { forwardMigration: 'PASS', baselineReadAfterForward: 'PASS', restoreFromBackup: 'PASS' },
  database: { backupSha256: 'e'.repeat(64), forwardSha256: 'f'.repeat(64), restoredSha256: 'e'.repeat(64) },
  rowCounts: { before: counts, afterForward: counts, afterRestore: counts }
};

try {
  const evidenceBytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`);
  fs.writeFileSync(evidencePath, evidenceBytes);
  const valid = {
    schemaVersion: 3, baselineSha, targetSha, baselineSchemaFingerprint, targetSchemaFingerprint,
    status: 'TECHNICAL_REHEARSAL_PASS',
    evidenceFile, evidenceSha256: crypto.createHash('sha256').update(evidenceBytes).digest('hex')
  };
  const options = { baselineSha, targetSha, baselineSchemaFingerprint, targetSchemaFingerprint,
    evidenceRoot: root, nowMs: Date.parse('2026-09-15T12:00:00.000Z') };
  assert.equal(verifyMigrationCompatibilityReceipt(valid, options), true);
  assert.throws(() => verifyMigrationCompatibilityReceipt({ ...valid, evidenceSha256: '0'.repeat(64) }, options),
    /MIGRATION_EVIDENCE_HASH_MISMATCH/);
  const forgedPath = path.join(root, 'forged.json');
  fs.writeFileSync(forgedPath, JSON.stringify({ ...evidence, checks: { ...evidence.checks, forwardMigration: 'NOT_RUN' } }));
  const forgedBytes = fs.readFileSync(forgedPath);
  assert.throws(() => verifyMigrationCompatibilityReceipt({ ...valid, evidenceFile: 'forged.json',
    evidenceSha256: crypto.createHash('sha256').update(forgedBytes).digest('hex') }, options), /checks.forwardMigration/);
  assert.throws(() => verifyMigrationCompatibilityReceipt({ ...valid, evidenceFile: '../escape.json' }, options),
    /MIGRATION_EVIDENCE_PATH_INVALID/);
  const writeEvidence = (name, value) => {
    const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
    fs.writeFileSync(path.join(root, name), bytes);
    return { ...valid, evidenceFile: name, evidenceSha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  };
  assert.throws(() => verifyMigrationCompatibilityReceipt(writeEvidence('empty-counts.json', {
    ...evidence, rowCounts: { before: {}, afterForward: {}, afterRestore: {} }
  }), options), /rowCounts/);
  assert.throws(() => verifyMigrationCompatibilityReceipt(writeEvidence('noop.json', {
    ...evidence, database: { ...evidence.database, forwardSha256: evidence.database.backupSha256 }
  }), options), /database.forwardMigrationNoop/);
  assert.throws(() => verifyMigrationCompatibilityReceipt(writeEvidence('stale.json', {
    ...evidence, startedAt: '2020-01-01T00:00:00.000Z', finishedAt: '2020-01-01T00:05:00.000Z'
  }), options), /freshness/);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log('MIGRATION_COMPATIBILITY_RECEIPT_TESTS_PASSED');
