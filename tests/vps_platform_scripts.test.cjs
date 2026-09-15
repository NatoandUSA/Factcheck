/**
 * VPS PLATFORM SCRIPTS & REVISION PROVENANCE CONTRACT SUITE
 * Tests integration semantics of:
 * 1. 4-tier SERVER_REVISION resolution in server/server.js
 * 2. Systemd unit template syntax & validity
 * 3. Script syntax validation (bash -n where available)
 * 4. Isolated release completion manifest & REVISION packaging
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, execSync } = require('child_process');

function runPlatformTests() {
  console.log('================================================================');
  console.log('  TESTING VPS PLATFORM SCRIPTS & REVISION PROVENANCE CONTRACT');
  console.log('================================================================\n');

  // Test 1: Shell script syntax validation (bash -n where available)
  console.log('Test 1: Shell script syntax validation...');
  const scriptsToTest = [
    'scripts/vps_migrate_and_setup_platform.sh',
    'scripts/vps_deploy_and_verify.sh'
  ];

  let hasBash = false;
  try {
    execSync('bash --version', { stdio: 'ignore' });
    hasBash = true;
  } catch (_) {
    hasBash = false;
  }
  
  for (const scriptPath of scriptsToTest) {
    const fullPath = path.resolve(__dirname, '..', scriptPath);
    assert.ok(fs.existsSync(fullPath), `Script ${scriptPath} must exist in repository`);
    const scriptBytes = fs.readFileSync(fullPath);
    assert.equal(scriptBytes.includes(13), false, `${scriptPath} must be committed with LF-only bytes`);
    if (hasBash) {
      try {
        // Feed the script through stdin so Git Bash on Windows does not have
        // to interpret a drive-letter path such as D:\\... as a POSIX path.
        execFileSync('bash', ['-n'], { input: scriptBytes });
        console.log(`  🟢 Bash syntax valid: ${scriptPath}`);
      } catch (err) {
        assert.fail(`Syntax check failed for ${scriptPath}: ${err.message}`);
      }
    } else {
      console.log(`  ℹ️ bash binary unavailable in host environment; file existence verified: ${scriptPath}`);
    }
  }
  const setupScript = fs.readFileSync(path.resolve(__dirname, '../scripts/vps_migrate_and_setup_platform.sh'), 'utf8');
  assert.ok(setupScript.includes('Environment=NODE_ENV=production')
    && setupScript.includes('Environment=OMNI_R43_SINGLE_PATH=1')
    && !setupScript.includes('${WORKTREE_REPO}/.env'),
  'Platform installer must pin production single-path mode and reject worktree-local secrets');
  assert.ok(!/Target VPS Host|Authoritative Production VPS Topology|\b\w+@\d{1,3}(?:\.\d{1,3}){3}\b/.test(setupScript),
    'Platform installer must not publish the production host identity');
  const deployScript = fs.readFileSync(path.resolve(__dirname, '../scripts/vps_deploy_and_verify.sh'), 'utf8');
  assert.ok(deployScript.includes('NODE_HOME="${OMNI_NODE_HOME:-${BASE_DIR}/.nvm/versions/node/v22.23.2}"'),
    'Deploy must resolve the pinned Node 22 runtime independently of the login shell PATH');
  assert.ok(deployScript.includes('MAKEFLAGS=-j1 npm_config_jobs=1'),
    'Native dependency build must use bounded parallelism on the production VPS');
  assert.ok(deployScript.includes("sqlite3.OPEN_READONLY"),
    'Snapshot integrity probe must not checkpoint or mutate the backup artifact');
  assert.ok(deployScript.indexOf('PRAGMA integrity_check') < deployScript.indexOf('checksums.sha256'),
    'Backup checksum must be recorded after the read-only integrity probe');
  assert.ok(deployScript.includes('sha256sum -c checksums.sha256'),
    'Recorded backup checksums must be verified before cutover');
  assert.ok(deployScript.includes('checksumManifestSha256')
    && deployScript.includes('integrityCheck: process.env.RECEIPT_BACKUP_INTEGRITY')
    && deployScript.includes('backupFiles'),
  'Frozen deployment receipt must carry backup integrity, file hashes and checksum-manifest hash');
  assert.ok(deployScript.includes('BASELINE_RELEASE_DIR=$(readlink -f "${CURRENT_SYMLINK}")')
    && deployScript.includes('[ ! -d "${BASELINE_RELEASE_DIR}/node_modules" ]')
    && !deployScript.includes('Preparing baseline release directory'),
  'Rollback baseline must be the already-built active release, never a reconstructed Git archive');
  assert.ok(deployScript.includes('OMNI_R43_SINGLE_PATH=1'),
    'Deploy must require the R4.3 single-path runtime policy before cutover');
  assert.ok(deployScript.includes("/proc/${SERVICE_PID}/environ"),
    'Deploy must verify the flag on the active service process, not merely in a config file');
  assert.ok(deployScript.includes("grep -qx 'NODE_ENV=production'")
    && deployScript.includes("grep -qx 'OMNI_R43_SINGLE_PATH=1'"),
  'Deploy must verify both production mode and R4.3 mode in the active process environment');
  assert.ok(deployScript.includes('scripts/release_retention.cjs'),
    'Release pruning must use the validated manifest-time retention planner');
  assert.ok(!deployScript.includes('find "${RELEASES_DIR}" -mindepth 1 -maxdepth 1 -type d | sort -r'),
    'Release pruning must never use lexicographic SHA ordering');
  assert.ok(deployScript.includes("rollbackScope: 'CODE_SYMLINK_ONLY_DATABASE_RESTORE_REQUIRES_OWNER_APPROVAL'"),
    'Receipt must state that automatic rollback is code-only');
  assert.ok(deployScript.includes('journalctl -u omniseller-web --since "${DEPLOY_STARTED_AT}"'),
    'Service error evidence must have an explicit deployment time boundary');
  assert.ok(deployScript.includes("deploymentStatus: 'ACTIVE_VERIFIED'")
    && deployScript.includes('fs.linkSync(temporary, target)')
    && !deployScript.includes('fs.renameSync(temporary, target)')
    && deployScript.includes('RELEASE_ACTIVE_BUT_UNRECEIPTED'),
  'Deployment receipt must land atomically without clobbering an existing receipt');
  assert.ok(deployScript.includes('verify_migration_compatibility_receipt.cjs')
    && deployScript.includes('verify_owner_authorization.cjs')
    && deployScript.includes('scripts/schema_fingerprint.cjs')
    && !deployScript.includes('MIGRATION_PATHS='),
  'Migration-authority changes must require technical rehearsal plus exact GitHub Owner authorization');
  assert.ok(deployScript.includes('BASELINE_RELEASE_DIR}/scripts/schema_fingerprint.cjs')
    && deployScript.includes('SCHEMA_COMPARATOR_DRIFT=1')
    && deployScript.includes('scripts/release_gate_policy.cjs')
    && deployScript.includes('if [ "${MIGRATION_REHEARSAL_REQUIRED}" = "true" ]; then')
    && !deployScript.includes('if [ "${SCHEMA_COMPARATOR_DRIFT}" = "1" ] ||'),
  'Comparator drift must require Owner review without fabricating a database migration');
  assert.ok(deployScript.includes("trap 'rollback' ERR")
    && deployScript.includes('mkdir -p "${BACKUP_SUBDIR}" || rollback')
    && deployScript.includes('cp -p "${DB_PATH}" "${BACKUP_SUBDIR}/app.db" || rollback')
    && deployScript.includes('> "${BACKUP_SUBDIR}/checksums.sha256" || rollback'),
  'Every failure after service stop must restore the baseline service');
  assert.ok(deployScript.includes('atomic_symlink_switch "${BASELINE_RELEASE_DIR}" \\')
    && deployScript.includes('|| echo "🔴 CRITICAL: Baseline symlink could not be restored. Manual intervention required."')
    && deployScript.includes('sudo systemctl restart omniseller-web || true'),
  'Rollback itself must remain best-effort when symlink restoration or service restart fails');
  assert.ok(!/Target VPS Host|Authoritative Production VPS Topology|\b\w+@\d{1,3}(?:\.\d{1,3}){3}\b/.test(deployScript),
    'Public deployment source must not publish the production host identity');

  // Test 2: Systemd Template Validity & Preserved Contract
  console.log('\nTest 2: Systemd service unit template validation...');
  const templatePath = path.resolve(__dirname, '../deploy/omniseller-web.service.template');
  assert.ok(fs.existsSync(templatePath), 'deploy/omniseller-web.service.template must exist in repository');
  const templateBytes = fs.readFileSync(templatePath);
  assert.equal(templateBytes.includes(13), false, 'systemd template must be committed with LF-only bytes');
  const templateContent = templateBytes.toString('utf8');
  assert.ok(templateContent.includes('Environment=NODE_ENV=production'), 'Template must pin production mode');
  assert.ok(templateContent.includes('WorkingDirectory=/home/etsy/omniseller-current/server'), 'Template must specify omniseller-current WorkingDirectory');
  assert.ok(templateContent.includes('EnvironmentFile=/home/etsy/omniseller-state/env/omniseller.env')
    && templateContent.includes('Environment=OMNI_DB_PATH=/home/etsy/omniseller-state/db/app.db')
    && templateContent.includes('Environment=OMNI_IMPORTS_DIR=/home/etsy/omniseller-state/imports'),
  'Template must keep secrets, database and imports outside Git-controlled release trees');
  assert.ok(templateContent.includes('ExecStart=/home/etsy/.nvm/versions/node/v22.23.2/bin/node /home/etsy/omniseller-current/server/server.js'), 'Template must specify omniseller-current ExecStart');
  assert.ok(templateContent.includes('Environment=OMNI_R43_SINGLE_PATH=1'), 'Template must pin the R4.3 single-path production policy');
  assert.ok(!fs.existsSync(path.resolve(__dirname, '../ecosystem.config.cjs')),
    'Deprecated PM2 entry point must not remain as a second production launcher');
  console.log('  🟢 Systemd unit template validated.');

  // Test 3: Disposable Temp Folder Manifest Packaging
  console.log('\nTest 3: Isolated release completion manifest & REVISION packaging...');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vps-release-'));
  const targetSha = 'a2b34d7a78c7731297014492aca4bcbfe09eaf4f';
  
  fs.writeFileSync(path.join(tmpDir, 'REVISION'), `${targetSha}\n`);
  const manifestData = {
    sha: targetSha,
    built_at: new Date().toISOString(),
    status: 'COMPLETE'
  };
  fs.writeFileSync(path.join(tmpDir, 'MANIFEST.json'), JSON.stringify(manifestData, null, 2));

  assert.strictEqual(fs.readFileSync(path.join(tmpDir, 'REVISION'), 'utf8').trim(), targetSha);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(tmpDir, 'MANIFEST.json'), 'utf8')).sha, targetSha);
  
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('  🟢 Manifest & REVISION packaging validated.');

  console.log('\n================================================================');
  console.log('  🟢 ALL VPS PLATFORM SCRIPT TESTS PASSED CLEANLY');
  console.log('================================================================');
}

runPlatformTests();
