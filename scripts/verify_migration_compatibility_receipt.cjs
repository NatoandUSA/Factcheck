'use strict';

const fs = require('node:fs');
const SHA40 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;

function verifyMigrationCompatibilityReceipt(receipt, { baselineSha, targetSha }) {
  if (!SHA40.test(baselineSha) || !SHA40.test(targetSha)) throw new Error('MIGRATION_RECEIPT_SHA_REQUIRED');
  const errors = [];
  if (receipt?.schemaVersion !== 1) errors.push('schemaVersion');
  if (receipt?.baselineSha !== baselineSha) errors.push('baselineSha');
  if (receipt?.targetSha !== targetSha) errors.push('targetSha');
  if (receipt?.status !== 'PASS') errors.push('status');
  for (const field of ['forwardMigration', 'baselineReadAfterForward', 'restoreFromBackup']) {
    if (receipt?.rehearsal?.[field] !== 'PASS') errors.push(`rehearsal.${field}`);
  }
  if (!String(receipt?.approvedBy || '').trim()) errors.push('approvedBy');
  if (!Number.isFinite(Date.parse(receipt?.approvedAt))) errors.push('approvedAt');
  if (!SHA256.test(String(receipt?.evidenceSha256 || ''))) errors.push('evidenceSha256');
  if (errors.length) throw new Error(`INVALID_MIGRATION_COMPATIBILITY_RECEIPT:${errors.join(',')}`);
  return true;
}

if (require.main === module) {
  const [receiptPath, baselineSha, targetSha] = process.argv.slice(2);
  try {
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    verifyMigrationCompatibilityReceipt(receipt, { baselineSha, targetSha });
    process.stdout.write('MIGRATION_COMPATIBILITY_RECEIPT_VERIFIED\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = Object.freeze({ verifyMigrationCompatibilityReceipt });
