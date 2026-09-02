const path = require('path');

function childImportsDir(suiteRoot, index, testFile) {
  const ordinal = String(index + 1).padStart(3, '0');
  const label = path.basename(testFile).replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(path.resolve(suiteRoot), `${ordinal}-${label}`);
}

module.exports = { childImportsDir };
