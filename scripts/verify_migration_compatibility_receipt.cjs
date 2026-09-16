'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SHA40 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const EVIDENCE_FILE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}\.json$/;
const PASS_CHECKS = ['forwardMigration', 'baselineReadAfterForward', 'restoreFromBackup'];
const REQUIRED_TABLES = ['research_projects', 'listings'];
const MAX_EVIDENCE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

function validCounts(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && REQUIRED_TABLES.every(table => Number.isInteger(value[table]) && value[table] >= 0)
    && Object.keys(value).length > 0
    && Object.values(value).every(count => Number.isInteger(count) && count >= 0);
}

function sameCounts(left, right) {
  if (!validCounts(left) || !validCounts(right)) return false;
  const normalise = value => JSON.stringify(Object.fromEntries(Object.entries(value).sort()));
  return normalise(left) === normalise(right);
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
  return JSON.parse(bytes.toString('utf8'));
}

function verifyMigrationCompatibilityReceipt(receipt, options) {
  const { baselineSha, targetSha, baselineSchemaFingerprint, targetSchemaFingerprint, evidenceRoot,
    nowMs = Date.now() } = options || {};
  if (!SHA40.test(String(baselineSha || '')) || !SHA40.test(String(targetSha || ''))
    || !SHA256.test(String(baselineSchemaFingerprint || '')) || !SHA256.test(String(targetSchemaFingerprint || ''))) {
    throw new Error('MIGRATION_RECEIPT_AUTHORITY_REQUIRED');
  }
  const errors = [];
  if (receipt?.schemaVersion !== 3) errors.push('schemaVersion');
  if (receipt?.baselineSha !== baselineSha) errors.push('baselineSha');
  if (receipt?.targetSha !== targetSha) errors.push('targetSha');
  if (receipt?.baselineSchemaFingerprint !== baselineSchemaFingerprint) errors.push('baselineSchemaFingerprint');
  if (receipt?.targetSchemaFingerprint !== targetSchemaFingerprint) errors.push('targetSchemaFingerprint');
  if (receipt?.status !== 'TECHNICAL_REHEARSAL_PASS') errors.push('status');
  if (!SHA256.test(String(receipt?.evidenceSha256 || ''))) errors.push('evidenceSha256');
  if (errors.length) throw new Error(`INVALID_MIGRATION_COMPATIBILITY_RECEIPT:${errors.join(',')}`);

  const evidence = readBoundEvidence(receipt, evidenceRoot);
  const evidenceErrors = [];
  if (evidence?.schemaVersion !== 1) evidenceErrors.push('schemaVersion');
  for (const field of ['baselineSha', 'targetSha', 'baselineSchemaFingerprint', 'targetSchemaFingerprint']) {
    if (evidence?.[field] !== options[field]) evidenceErrors.push(field);
  }
  const startedAt = Date.parse(evidence?.startedAt);
  const finishedAt = Date.parse(evidence?.finishedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt) || finishedAt < startedAt) {
    evidenceErrors.push('timeRange');
  } else if (finishedAt < nowMs - MAX_EVIDENCE_AGE_MS || finishedAt > nowMs + MAX_CLOCK_SKEW_MS) {
    evidenceErrors.push('freshness');
  }
  for (const field of PASS_CHECKS) if (evidence?.checks?.[field] !== 'PASS') evidenceErrors.push(`checks.${field}`);
  const backupSha256 = evidence?.database?.backupSha256;
  const forwardSha256 = evidence?.database?.forwardSha256;
  if (!SHA256.test(String(backupSha256 || '')) || backupSha256 !== evidence?.database?.restoredSha256) {
    evidenceErrors.push('database.restoreChecksum');
  }
  if (!SHA256.test(String(forwardSha256 || ''))) evidenceErrors.push('database.forwardSha256');
  else if (forwardSha256 === backupSha256) evidenceErrors.push('database.forwardMigrationNoop');
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
      targetSchemaFingerprint, evidenceRoot });
    process.stdout.write('MIGRATION_TECHNICAL_RECEIPT_VERIFIED\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = Object.freeze({ MAX_EVIDENCE_AGE_MS, REQUIRED_TABLES, verifyMigrationCompatibilityReceipt });
