const path = require('path');

// Single source of truth for mutable runtime-state paths. Dev/test keep their
// existing local defaults, but production must explicitly place state outside
// the Git-controlled worktree so a reset/clean/checkout cannot delete live
// data as collateral damage.
const SERVER_DIR = path.resolve(__dirname, '..'); // server/
const REPO_ROOT = path.resolve(SERVER_DIR, '..');

function isPathInsideRepo(candidate) {
  const resolved = path.resolve(candidate);
  const relative = path.relative(REPO_ROOT, resolved);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function requireExternalAbsolutePath(value, label) {
  if (!value || !String(value).trim()) {
    throw new Error(`P0_OPS_EXTERNAL_PATH_REQUIRED:${label}`);
  }
  if (!path.isAbsolute(value)) {
    throw new Error(`P0_OPS_ABSOLUTE_PATH_REQUIRED:${label}`);
  }
  const resolved = path.resolve(value);
  if (isPathInsideRepo(resolved)) {
    throw new Error(`P0_OPS_PATH_INSIDE_WORKTREE:${label}`);
  }
  return resolved;
}

function resolveRuntimePaths(env = process.env) {
  const isTest = env.NODE_ENV === 'test';
  const isProduction = env.NODE_ENV === 'production';

  if (isTest) {
    return {
      dbPath: ':memory:',
      importsDir: env.TEST_IMPORTS_DIR || path.resolve(SERVER_DIR, '../data/test_imports')
    };
  }

  if (isProduction) {
    // Production is fail-closed: overrides are not optional and must be
    // absolute paths outside the repository worktree. DOTENV_PATH is checked
    // here as a startup invariant too; server.js already uses it when loading
    // secrets. Deployment may alternatively inject secrets directly, but the
    // current production contract intentionally standardizes on an external
    // environment file to avoid a repo-local .env becoming release state.
    requireExternalAbsolutePath(env.DOTENV_PATH, 'DOTENV_PATH');
    return {
      dbPath: requireExternalAbsolutePath(env.OMNI_DB_PATH, 'OMNI_DB_PATH'),
      importsDir: requireExternalAbsolutePath(env.OMNI_IMPORTS_DIR, 'OMNI_IMPORTS_DIR')
    };
  }

  // Development/default behavior remains backward compatible. Optional
  // overrides are still honored for local experimentation.
  return {
    dbPath: env.OMNI_DB_PATH || path.resolve(SERVER_DIR, 'app.db'),
    importsDir: env.TEST_IMPORTS_DIR || env.OMNI_IMPORTS_DIR || path.resolve(SERVER_DIR, '../data/imports')
  };
}

module.exports = {
  resolveRuntimePaths,
  isPathInsideRepo,
  requireExternalAbsolutePath,
  REPO_ROOT
};
