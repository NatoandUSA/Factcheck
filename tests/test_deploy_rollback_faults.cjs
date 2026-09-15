'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const deploySource = fs.readFileSync(path.resolve(__dirname, '../scripts/vps_deploy_and_verify.sh'), 'utf8');
const functionStart = deploySource.indexOf('atomic_symlink_switch() {');
const functionEnd = deploySource.indexOf('\n# --- STEP 2:', functionStart);
assert.ok(functionStart >= 0 && functionEnd > functionStart, 'deploy rollback functions must remain extractable');
const rollbackFunctions = deploySource.slice(functionStart, functionEnd);

for (const fault of ['ln', 'mv']) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `omni-rollback-${fault}-`));
  try {
    const bashRoot = root.replace(/^([A-Za-z]):\\/, (_, drive) => `/mnt/${drive.toLowerCase()}/`)
      .split(path.sep).join('/');
    const harness = `#!/bin/bash
set -Eeuo pipefail
BASE_DIR=${JSON.stringify(bashRoot)}
FAULT=${JSON.stringify(fault)}
CURRENT_SYMLINK="\${BASE_DIR}/omniseller-current"
BASELINE_SHA="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
BASELINE_RELEASE_DIR="\${BASE_DIR}/baseline"
TARGET_RELEASE_DIR="\${BASE_DIR}/target"
TARGET_RELEASE_CREATED=0
SERVICE_STATE="\${BASE_DIR}/service.state"
mkdir -p "\${BASELINE_RELEASE_DIR}" "\${TARGET_RELEASE_DIR}"
command ln -s "\${TARGET_RELEASE_DIR}" "\${CURRENT_SYMLINK}"
echo stopped > "\${SERVICE_STATE}"
sudo() {
  case "$2" in
    stop) echo stopped > "\${SERVICE_STATE}" ;;
    restart) echo running > "\${SERVICE_STATE}" ;;
    is-active) [ "$(cat "\${SERVICE_STATE}")" = running ] ;;
  esac
}
ln() { [ "$FAULT" = ln ] && return 1; command ln "$@"; }
mv() { [ "$FAULT" = mv ] && return 1; command mv "$@"; }
sleep() { :; }
${rollbackFunctions}
rollback
`;
    const result = spawnSync('bash', [], {
      input: harness, encoding: 'utf8'
    });
    assert.equal(result.status, 1, `${fault} rollback fault must preserve failure exit status`);
    assert.equal(fs.existsSync(path.join(root, 'service.state')), true,
      `${fault} harness must reach the rollback path: ${result.stderr}`);
    assert.equal(fs.readFileSync(path.join(root, 'service.state'), 'utf8').trim(), 'running',
      `${fault} rollback fault must still attempt baseline service restart`);
    assert.match(`${result.stdout}\n${result.stderr}`, /CRITICAL: Baseline symlink could not be restored/,
      `${fault} rollback fault must emit a visible critical operator message`);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /successfully rolled back to baseline/,
      `${fault} rollback fault must never end with a false baseline-success claim`);
    assert.match(`${result.stdout}\n${result.stderr}`, /Active target is '[^']*\/target'/,
      `${fault} injection control must report the actual target instead of assuming baseline`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

console.log('DEPLOY_ROLLBACK_FAULT_TESTS_PASSED');
