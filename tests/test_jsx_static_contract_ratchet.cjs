const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const declaration = JSON.parse(fs.readFileSync(path.join(root, 'jsx_static_contract_allowlist.json'), 'utf8'));
const allowed = declaration.entries;
const allowedNames = Object.keys(allowed).sort();
assert.strictEqual(allowedNames.length, 15, 'RR-TEST-01 baseline must remain exactly 15 named files');

for (const name of allowedNames) {
  assert.ok(['static-prohibition', 'behavioral-debt', 'runtime-shape'].includes(allowed[name]));
  assert.ok(fs.existsSync(path.join(root, '..', name)), `Declared JSX contract file missing: ${name}`);
}

const candidates = fs.readdirSync(root)
  .filter(name => name.endsWith('.cjs'))
  .map(name => `tests/${name}`)
  .filter(name => name !== 'tests/test_jsx_static_contract_ratchet.cjs')
  .filter(name => {
    const source = fs.readFileSync(path.join(root, path.basename(name)), 'utf8');
    return source.includes('.jsx') && source.includes('readFileSync') && /assert[.(]/.test(source);
  })
  .sort();

const unlisted = candidates.filter(name => !allowedNames.includes(name));
assert.deepStrictEqual(unlisted, [], `Unlisted source-text JSX assertions: ${unlisted.join(', ')}`);
assert.ok(!allowedNames.includes('tests/test_project_bound_react_wiring.cjs'),
  'Executable React wiring test must not be admitted to static-test debt');
console.log(`RR_TEST_RATCHET measured=${allowedNames.length + candidates.length + 1} passed=${allowedNames.length + candidates.length + 1} failed=0 unexecuted=0`);
