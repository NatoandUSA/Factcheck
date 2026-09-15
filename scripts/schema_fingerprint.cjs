'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const INCLUDED_EXTENSION = /\.(?:js|cjs|mjs|sql|json)$/i;
const EXCLUDED_DIRECTORIES = new Set(['.git', 'node_modules', 'dist', 'coverage', '.cache']);

function schemaFingerprint(releaseRoot) {
  const root = path.resolve(releaseRoot);
  if (!fs.statSync(root).isDirectory()) throw new Error('SCHEMA_FINGERPRINT_ROOT_INVALID');
  const files = [];
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && INCLUDED_EXTENSION.test(entry.name)) {
        const bytes = fs.readFileSync(absolute);
        files.push({
          path: path.relative(root, absolute).split(path.sep).join('/'),
          sha256: crypto.createHash('sha256').update(bytes).digest('hex')
        });
      }
    }
  };
  visit(root);
  files.sort((a, b) => a.path.localeCompare(b.path));
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex');
  return Object.freeze({ schemaVersion: 2, fingerprint, files: Object.freeze(files) });
}

if (require.main === module) {
  try { process.stdout.write(`${JSON.stringify(schemaFingerprint(process.argv[2]))}\n`); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

module.exports = Object.freeze({ EXCLUDED_DIRECTORIES, INCLUDED_EXTENSION, schemaFingerprint });
