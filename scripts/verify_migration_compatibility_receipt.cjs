'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SHA40 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const EVIDENCE_FILE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}\.json$/;
const PASS_CHECKS = ['forwardMigration', 'baselineReadAfterForward', 'restoreFromBackup'];

function sameCounts(left, right) {
  const a = JSON.stringify(Object.fromEntries(Object.entries(left || {}).sort()));
  const b = JSON.stringify(Object.fromEntries(Object.entries(right || {}).sort()));
  return a === b && Object.values(left || {}).every(value => Number.isInteger(value) && value >= 0);
}

function readBoundEvidence(receipt, evidenceRoot) {
  if (!path.isAbsolute(evidenceRoot) || !EVIDENCE_FILE.test(String(receipt?.evidenceFile || ''))) {
    throw new Error('MIGRATION_EVIDENCE_PATH_INVALID');
  }
  const root = fs.realpathSync(evidenceRoot);
  const candidate = path.resolve(root, receipt.evidenceFile);
  if (path.dirname(candidate) !== root) throw new Error('MIGRATION_EVIDENCE_PATH_ESCAPE');
  const stat = fs.lstatSync(candidate);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > 5 * 1024 * 1024) {
    throw new Error('MIGRATION_EVIDENCE_FILE_INVALID');
  }
  const bytes = fs.readFileSync(candidate);
  const actualSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  if (actualSha256 !== receipt.evidenceSha256) throw new Error('MIGRATION_EVIDENCE_HASH_MISMATCH');
  return { evidence: JSON.parse(bytes.toString('utf8')), stat };
}

function verifyMigrationCompatibilityReceipt(receipt, options) {
  const { baselineSha, targetSha, baselineSchemaFingerprint, targetSchemaFingerprint, evidenceRoot,
    requireIndependentOwner = false, currentUid = typeof process.getuid === 'function' ? process.getuid() : null } = options || {};
  if (!SHA40.test(String(baselineSha || '')) || !SHA40.test(String(targetSha || ''))
    || !SHA256.test(String(baselineSchemaFingerprint || '')) || !SHA256.test(String(targetSchemaFingerprint || ''))) {
    throw new Error('MIGRATION_RECEIPT_AUTHORITY_REQUIRED');
  }
  const errors = [];
  if (receipt?.schemaVersion !== 2) errors.push('schemaVersion');
  if (receipt?.baselineSha !== baselineSha) errors.push('baselineSha');
  if (receipt?.targetSha !== targetSha) errors.push('targetSha');
  if (receipt?.baselineSchemaFingerprint !== baselineSchemaFingerprint) errors.push('baselineSchemaFingerprint');
  if (receipt?.targetSchemaFingerprint !== targetSchemaFingerprint) errors.push('targetSchemaFingerprint');
  if (receipt?.status !== 'PASS') errors.push('status');
  if (!String(receipt?.approvedBy || '').trim()) errors.push('approvedBy');
  if (!Number.isFinite(Date.parse(receipt?.approvedAt))) errors.push('approvedAt');
  if (!SHA256.test(String(receipt?.evidenceSha256 || ''))) errors.push('evidenceSha256');
  if (errors.length) throw new Error(`INVALID_MIGRATION_COMPATIBILITY_RECEIPT:${errors.join(',')}`);

  const { evidence, stat } = readBoundEvidence(receipt, evidenceRoot);
  if (requireIndependentOwner && currentUid != null && stat.uid === currentUid) {
    throw new Error('MIGRATION_EVIDENCE_NOT_INDEPENDENTLY_OWNED');
  }
  const evidenceErrors = [];
  if (evidence?.schemaVersion !== 1) evidenceErrors.push('schemaVersion');
  for (const field of ['baselineSha', 'targetSha', 'baselineSchemaFingerprint', 'targetSchemaFingerprint']) {
    if (evidence?.[field] !== options[field]) evidenceErrors.push(field);
  }
  if (!Number.isFinite(Date.parse(evidence?.startedAt)) || !Number.isFinite(Date.parse(evidence?.finishedAt))
    || Date.parse(evidence.finishedAt) < Date.parse(evidence.startedAt)) evidenceErrors.push('timeRange');
  for (const field of PASS_CHECKS) if (evidence?.checks?.[field] !== 'PASS') evidenceErrors.push(`checks.${field}`);
  if (!SHA256.test(String(evidence?.database?.backupSha256 || ''))
    || evidence.database.backupSha256 !== evidence?.database?.restoredSha256) evidenceErrors.push('database.restoreChecksum');
  if (!SHA256.test(String(evidence?.database?.forwardSha256 || ''))) evidenceErrors.push('database.forwardSha256');
  if (!sameCounts(evidence?.rowCounts?.before, evidence?.rowCounts?.afterForward)) evidenceErrors.push('rowCounts.afterForward');
  if (!sameCounts(evidence?.rowCounts?.before, evidence?.rowCounts?.afterRestore)) evidenceErrors.push('rowCounts.afterRestore');
  if (evidenceErrors.length) throw new Error(`INVALID_MIGRATION_REHEARSAL_EVIDENCE:${evidenceErrors.join(',')}`);
  return true;
}

if (require.main === module) {
  const [receiptPath, baselineSha, targetSha, baselineSchemaFingerprint, targetSchemaFingerprint, evidenceRoot] = process.argv.slice(2);
  try {
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    verifyMigrationCompatibilityReceipt(receipt, { baselineSha, targetSha, baselineSchemaFingerprint,
      targetSchemaFingerprint, evidenceRoot, requireIndependentOwner: true });
    process.stdout.write('MIGRATION_COMPATIBILITY_RECEIPT_VERIFIED\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = Object.freeze({ verifyMigrationCompatibilityReceipt });
