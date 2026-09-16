'use strict';

const SHA256 = /^[a-f0-9]{64}$/;

function releaseGateDecision(input) {
  const fields = ['baselineSchemaFingerprint', 'targetSchemaFingerprint',
    'baselineComparatorFingerprint', 'targetComparatorFingerprint'];
  if (!input || fields.some(field => !SHA256.test(String(input[field] || '')))) {
    throw new Error('RELEASE_GATE_AUTHORITY_INVALID');
  }
  const schemaChanged = input.baselineSchemaFingerprint !== input.targetSchemaFingerprint;
  const comparatorChanged = input.baselineComparatorFingerprint !== input.targetComparatorFingerprint;
  return Object.freeze({
    schemaChanged,
    comparatorChanged,
    migrationRehearsalRequired: schemaChanged,
    ownerAuthorizationRequired: true
  });
}

if (require.main === module) {
  try {
    const [baselineSchemaFingerprint, targetSchemaFingerprint,
      baselineComparatorFingerprint, targetComparatorFingerprint] = process.argv.slice(2);
    process.stdout.write(`${JSON.stringify(releaseGateDecision({ baselineSchemaFingerprint,
      targetSchemaFingerprint, baselineComparatorFingerprint, targetComparatorFingerprint }))}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = Object.freeze({ releaseGateDecision });
