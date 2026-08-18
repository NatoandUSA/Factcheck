const path = require('path');

// Single source of truth for the two mutable runtime-state paths (SQLite DB,
// uploaded-report imports dir) that server.js previously hard-coded inline
// in two different places with no way to relocate them. Both now accept an
// env override so production can point them outside the Git-controlled
// release tree — being gitignored only stops them from being *committed*,
// it doesn't stop a `git clean -fdx` (or the reset that caused the prior
// app.db incident) from deleting an untracked file that still lives inside
// the working tree. Dev/test defaults are unchanged.
const SERVER_DIR = path.resolve(__dirname, '..'); // server/

function resolveRuntimePaths(env = process.env) {
  const isTest = env.NODE_ENV === 'test';

  const dbPath = isTest
    ? ':memory:'
    : (env.OMNI_DB_PATH || path.resolve(SERVER_DIR, 'app.db'));

  const importsDir = env.TEST_IMPORTS_DIR
    ? env.TEST_IMPORTS_DIR
    : (isTest
        ? path.resolve(SERVER_DIR, '../data/test_imports')
        : (env.OMNI_IMPORTS_DIR || path.resolve(SERVER_DIR, '../data/imports')));

  return { dbPath, importsDir };
}

module.exports = { resolveRuntimePaths };
