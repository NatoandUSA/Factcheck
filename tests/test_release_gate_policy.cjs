'use strict';

const assert = require('node:assert/strict');
const { releaseGateDecision } = require('../scripts/release_gate_policy.cjs');

const a = 'a'.repeat(64);
const b = 'b'.repeat(64);
const same = releaseGateDecision({
  baselineSchemaFingerprint: a, targetSchemaFingerprint: a,
  baselineComparatorFingerprint: a, targetComparatorFingerprint: a
});
assert.equal(same.migrationRehearsalRequired, false);
assert.equal(same.ownerAuthorizationRequired, true);

const comparatorOnly = releaseGateDecision({
  baselineSchemaFingerprint: a, targetSchemaFingerprint: a,
  baselineComparatorFingerprint: a, targetComparatorFingerprint: b
});
assert.equal(comparatorOnly.comparatorChanged, true);
assert.equal(comparatorOnly.migrationRehearsalRequired, false,
  'comparator-only upgrade must not fabricate a database migration');

const schemaChange = releaseGateDecision({
  baselineSchemaFingerprint: a, targetSchemaFingerprint: b,
  baselineComparatorFingerprint: a, targetComparatorFingerprint: a
});
assert.equal(schemaChange.schemaChanged, true);
assert.equal(schemaChange.migrationRehearsalRequired, true,
  'actual schema change must require technical migration rehearsal');

console.log('RELEASE_GATE_POLICY_TESTS_PASSED');
