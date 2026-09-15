'use strict';

const R43_SINGLE_PATH_FLAG = 'OMNI_R43_SINGLE_PATH';

function shouldDenyLegacyWrites(env = process.env) {
  return env[R43_SINGLE_PATH_FLAG] === '1' || env.OMNI_R43_ALLOW_LEGACY_WRITES !== '1';
}

function assertProductionRuntimePolicy(env = process.env) {
  if (env.NODE_ENV !== 'production') return Object.freeze({ production: false, r43SinglePath: false });
  if (env[R43_SINGLE_PATH_FLAG] !== '1') {
    throw new Error(`P0_RUNTIME_POLICY_REQUIRED:${R43_SINGLE_PATH_FLAG}=1`);
  }
  if (env.OMNI_R43_ALLOW_LEGACY_WRITES === '1') {
    throw new Error('P0_RUNTIME_POLICY_FORBIDS_LEGACY_WRITE_OVERRIDE');
  }
  return Object.freeze({ production: true, r43SinglePath: true });
}

module.exports = Object.freeze({ assertProductionRuntimePolicy, R43_SINGLE_PATH_FLAG, shouldDenyLegacyWrites });
