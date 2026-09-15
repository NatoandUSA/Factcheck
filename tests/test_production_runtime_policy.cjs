'use strict';

const assert = require('node:assert/strict');
const { assertProductionRuntimePolicy, R43_SINGLE_PATH_FLAG,
  shouldDenyLegacyWrites } = require('../server/config/runtimePolicy');

assert.equal(R43_SINGLE_PATH_FLAG, 'OMNI_R43_SINGLE_PATH');
assert.equal(shouldDenyLegacyWrites({}), true, 'unconfigured processes must deny legacy writes');
assert.equal(shouldDenyLegacyWrites({ OMNI_R43_ALLOW_LEGACY_WRITES: '1' }), false,
  'historical compatibility requires an explicit opt-in');
assert.equal(shouldDenyLegacyWrites({ OMNI_R43_ALLOW_LEGACY_WRITES: '1', OMNI_R43_SINGLE_PATH: '1' }), true,
  'R4.3 must override historical compatibility');
assert.deepEqual(assertProductionRuntimePolicy({ NODE_ENV: 'test' }), {
  production: false,
  r43SinglePath: false
});
assert.throws(
  () => assertProductionRuntimePolicy({ NODE_ENV: 'production' }),
  /P0_RUNTIME_POLICY_REQUIRED:OMNI_R43_SINGLE_PATH=1/
);
assert.throws(
  () => assertProductionRuntimePolicy({ NODE_ENV: 'production', OMNI_R43_SINGLE_PATH: 'true' }),
  /P0_RUNTIME_POLICY_REQUIRED:OMNI_R43_SINGLE_PATH=1/
);
assert.deepEqual(assertProductionRuntimePolicy({ NODE_ENV: 'production', OMNI_R43_SINGLE_PATH: '1' }), {
  production: true,
  r43SinglePath: true
});
assert.throws(
  () => assertProductionRuntimePolicy({ NODE_ENV: 'production', OMNI_R43_SINGLE_PATH: '1',
    OMNI_R43_ALLOW_LEGACY_WRITES: '1' }),
  /P0_RUNTIME_POLICY_FORBIDS_LEGACY_WRITE_OVERRIDE/
);

console.log('PRODUCTION_RUNTIME_POLICY_TESTS_PASSED');
