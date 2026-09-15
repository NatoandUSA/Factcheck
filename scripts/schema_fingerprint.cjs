'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DDL_PATTERN = /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX|TRIGGER)\b|\bstateColumnSql\b/i;

function schemaFingerprint(releaseRoot) {
  const root = path.resolve(releaseRoot);
  const serverRoot = path.join(root, 'server');
  const files = [];
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && /\.(?:js|cjs)$/.test(entry.name)) {
        const bytes = fs.readFileSync(absolute);
        if (DDL_PATTERN.test(bytes.toString('utf8'))) files.push({
          path: path.relative(root, absolute).split(path.sep).join('/'),
          sha256: crypto.createHash('sha256').update(bytes).digest('hex')
        });
      }
    }
  };
  visit(serverRoot);
  files.sort((a, b) => a.path.localeCompare(b.path));
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex');
  return Object.freeze({ schemaVersion: 1, fingerprint, files: Object.freeze(files) });
}

if (require.main === module) {
  try { process.stdout.write(`${JSON.stringify(schemaFingerprint(process.argv[2]))}\n`); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

module.exports = Object.freeze({ DDL_PATTERN, schemaFingerprint });
