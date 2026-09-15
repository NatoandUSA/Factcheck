'use strict';

const assert = require('node:assert/strict');
const { verifyMigrationCompatibilityReceipt } = require('../scripts/verify_migration_compatibility_receipt.cjs');

const baselineSha = 'a'.repeat(40);
const targetSha = 'b'.repeat(40);
const valid = {
  schemaVersion: 1, baselineSha, targetSha, status: 'PASS',
  rehearsal: { forwardMigration: 'PASS', baselineReadAfterForward: 'PASS', restoreFromBackup: 'PASS' },
  approvedBy: 'OWNER', approvedAt: '2026-09-15T12:00:00.000Z', evidenceSha256: 'c'.repeat(64)
};
assert.equal(verifyMigrationCompatibilityReceipt(valid, { baselineSha, targetSha }), true);
assert.throws(() => verifyMigrationCompatibilityReceipt({ ...valid, targetSha: 'd'.repeat(40) }, { baselineSha, targetSha }),
  /targetSha/);
assert.throws(() => verifyMigrationCompatibilityReceipt({ ...valid, rehearsal: { ...valid.rehearsal, baselineReadAfterForward: 'UNTESTED' } }, { baselineSha, targetSha }),
  /baselineReadAfterForward/);
assert.throws(() => verifyMigrationCompatibilityReceipt({ ...valid, evidenceSha256: '' }, { baselineSha, targetSha }),
  /evidenceSha256/);
console.log('MIGRATION_COMPATIBILITY_RECEIPT_TESTS_PASSED');
