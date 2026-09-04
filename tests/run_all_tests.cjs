const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { childImportsDir } = require('./helpers/suiteIsolation.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_TIMEOUT_MS = 180000;
const DEFAULT_KILL_GRACE_MS = 1000;

function discoverTestFiles(testsDir = __dirname) {
  return fs.readdirSync(testsDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.cjs') && entry.name !== 'run_all_tests.cjs')
    .map(entry => path.relative(REPO_ROOT, path.join(testsDir, entry.name)).split(path.sep).join('/'))
    .sort();
}

function terminateProcessTree(child, signal) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === 'win32') {
      child.kill(signal);
    } else {
      process.kill(-child.pid, signal);
    }
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

function runChild(file, options) {
  return new Promise(resolve => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, [file], {
      cwd: REPO_ROOT,
      detached: process.platform !== 'win32',
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const stdout = [];
    const stderr = [];
    let timedOut = false;
    let spawnError = null;
    let killTimer = null;
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child, 'SIGTERM');
      killTimer = setTimeout(() => terminateProcessTree(child, 'SIGKILL'), options.killGraceMs);
    }, options.timeoutMs);

    child.stdout.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.on('error', error => { spawnError = error; });
    child.on('close', (code, signal) => {
      clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      resolve({
        code, signal, timedOut, spawnError,
        elapsedMs: Date.now() - startedAt,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8')
      });
    });
  });
}

async function runAllTests(options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const killGraceMs = options.killGraceMs || DEFAULT_KILL_GRACE_MS;
  const prepareArtifacts = options.prepareArtifacts !== false;
  const failures = [];
  const harnessErrors = [];
  let testFiles = [];
  let suiteImportsRoot = null;
  let invoked = 0;
  let passed = 0;
  let failed = 0;

  console.log('================================================================');
  console.log('  RUNNING OMNISELLER STUDIO SUITE - EXECUTABLE ASSERTIONS');
  console.log('================================================================\n');

  try {
    try {
      testFiles = options.testFiles || discoverTestFiles(options.testsDir);
      if (!Array.isArray(testFiles)) throw new TypeError('testFiles must be an array');
      if (testFiles.length === 0) {
        harnessErrors.push({ phase: 'discovery', reason: 'ZERO_TESTS_DISCOVERED' });
      } else {
        suiteImportsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omniseller-suite-imports-'));
      }
    } catch (error) {
      harnessErrors.push({ phase: 'setup', reason: error.message });
    }

    for (const [idx, file] of testFiles.entries()) {
      if (harnessErrors.length > 0) break;
      const absoluteFile = path.isAbsolute(file) ? file : path.resolve(REPO_ROOT, file);
      if (!fs.existsSync(absoluteFile)) {
        invoked++;
        failed++;
        failures.push({ file, kind: 'STARTUP_ERROR', reason: 'TEST_FILE_NOT_FOUND' });
        console.error(`🔴 ${file} STARTUP ERROR: TEST_FILE_NOT_FOUND\n`);
        continue;
      }

      invoked++;
      console.log(`[Test ${idx + 1}/${testFiles.length}] Executing ${file}...`);
      try {
        if (prepareArtifacts && file === 'tests/test_performance_and_latency.cjs'
            && !fs.existsSync(path.resolve(REPO_ROOT, 'dist/index.html'))) {
          const build = await runChild(path.resolve(REPO_ROOT, 'node_modules/vite/bin/vite.js'), {
            timeoutMs: DEFAULT_TIMEOUT_MS,
            killGraceMs,
            env: { ...process.env, NODE_ENV: 'test' }
          });
          if (build.code !== 0 || build.spawnError || build.timedOut) {
            const reason = build.timedOut ? 'BUILD_TIMEOUT'
              : build.spawnError ? build.spawnError.message : `BUILD_EXIT_${build.code}`;
            throw Object.assign(new Error(reason), { kind: 'SETUP_ERROR', output: build });
          }
          if (build.stdout) process.stdout.write(build.stdout);
          if (build.stderr) process.stderr.write(build.stderr);
        }

        const result = await runChild(absoluteFile, {
          timeoutMs,
          killGraceMs,
          env: {
            ...process.env,
            NODE_ENV: 'test',
            TEST_IMPORTS_DIR: childImportsDir(suiteImportsRoot, idx, file)
          }
        });
        if (result.stdout) process.stdout.write(result.stdout);
        if (result.stderr) process.stderr.write(result.stderr);
        if (result.spawnError) {
          throw Object.assign(result.spawnError, { kind: 'STARTUP_ERROR', output: result });
        }
        if (result.timedOut) {
          throw Object.assign(new Error(`TIMED OUT AFTER ${timeoutMs} MS`),
            { kind: 'TIMEOUT', output: result });
        }
        if (result.code !== 0) {
          throw Object.assign(new Error(`TEST EXIT ${result.code}`),
            { kind: 'TEST_FAILURE', output: result });
        }
        console.log(`✅ ${file} PASSED CLEANLY!\n`);
        passed++;
      } catch (error) {
        failed++;
        const kind = error.kind || 'TEST_FAILURE';
        failures.push({ file, kind, reason: error.message });
        console.error(`🔴 ${file} ${kind}: ${error.message}\n`);
      }
    }
  } finally {
    if (suiteImportsRoot) {
      try {
        const cleanup = options.cleanup || (root => fs.rmSync(root, { recursive: true, force: true }));
        await cleanup(suiteImportsRoot);
      } catch (error) {
        harnessErrors.push({ phase: 'cleanup', reason: error.message });
        console.error(`🔴 HARNESS CLEANUP ERROR: ${error.message}`);
      }
    }
  }

  const total = testFiles.length;
  const unexecuted = Math.max(0, total - invoked);
  for (const error of harnessErrors) {
    console.error(`🔴 HARNESS_ERROR phase=${error.phase} reason=${error.reason}`);
  }
  console.log('================================================================');
  console.log(`SUITE_RESULT total=${total} passed=${passed} failed=${failed} unexecuted=${unexecuted} harness_errors=${harnessErrors.length}`);
  console.log('================================================================');
  return { total, invoked, passed, failed, unexecuted, failures, harnessErrors };
}

const exitCodeForResult = result =>
  result.failed > 0 || result.unexecuted > 0 || result.harnessErrors.length > 0 ? 1 : 0;

async function main() {
  const result = await runAllTests();
  process.exitCode = exitCodeForResult(result);
}

if (require.main === module) {
  main().catch(error => {
    console.error(`HARNESS_FATAL: ${error.stack || error.message}`);
    console.log('SUITE_RESULT total=0 passed=0 failed=0 unexecuted=0 harness_errors=1');
    process.exitCode = 1;
  });
}

module.exports = { discoverTestFiles, runAllTests, runChild, exitCodeForResult };
