'use strict';

const R43_SINGLE_PATH_FLAG = 'OMNI_R43_SINGLE_PATH';

function assertProductionRuntimePolicy(env = process.env) {
  if (env.NODE_ENV !== 'production') return Object.freeze({ production: false, r43SinglePath: false });
  if (env[R43_SINGLE_PATH_FLAG] !== '1') {
    throw new Error(`P0_RUNTIME_POLICY_REQUIRED:${R43_SINGLE_PATH_FLAG}=1`);
  }
  return Object.freeze({ production: true, r43SinglePath: true });
}

module.exports = Object.freeze({ assertProductionRuntimePolicy, R43_SINGLE_PATH_FLAG });
