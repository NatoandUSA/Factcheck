'use strict';

const assert = require('node:assert/strict');
const { assertProductionRuntimePolicy, R43_SINGLE_PATH_FLAG } = require('../server/config/runtimePolicy');

assert.equal(R43_SINGLE_PATH_FLAG, 'OMNI_R43_SINGLE_PATH');
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

console.log('PRODUCTION_RUNTIME_POLICY_TESTS_PASSED');
