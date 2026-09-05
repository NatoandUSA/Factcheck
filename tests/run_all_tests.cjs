const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { childImportsDir } = require('./helpers/suiteIsolation.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_TIMEOUT_MS = 180000;
const DEFAULT_KILL_GRACE_MS = 1000;
const DEFAULT_PIPE_GRACE_MS = 250;
const INVENTORY_PATH = path.join(__dirname, 'canonical_test_inventory.json');
const EXCLUDED_DIRS = new Set(['helpers', 'fixtures']);

function normalizeEntry(testsDir, filename) {
  return path.relative(REPO_ROOT, path.resolve(testsDir, filename)).split(path.sep).join('/');
}

function scanEntrypoints(testsDir) {
  const found = [];
  const visit = (directory, relative = '') => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name)) visit(path.join(directory, entry.name), path.join(relative, entry.name));
      } else if (entry.isFile() && entry.name.endsWith('.cjs') && entry.name !== 'run_all_tests.cjs') {
        found.push(normalizeEntry(testsDir, path.join(relative, entry.name)));
      }
    }
  };
  visit(testsDir);
  return found.sort();
}

function discoverTestFiles(testsDir = __dirname, inventoryPath = INVENTORY_PATH) {
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
  if (!Array.isArray(inventory) || inventory.length === 0) throw new Error('INVALID_TEST_INVENTORY');
  if (new Set(inventory).size !== inventory.length) throw new Error('DUPLICATE_TEST_INVENTORY_ENTRY');
  const expected = inventory.map(file => file.split(path.sep).join('/')).sort();
  const actual = scanEntrypoints(testsDir);
  const missing = expected.filter(file => !actual.includes(file));
  const unexpected = actual.filter(file => !expected.includes(file));
  if (missing.length || unexpected.length) {
    throw new Error(`TEST_INVENTORY_MISMATCH missing=[${missing.join(',')}] unexpected=[${unexpected.join(',')}]`);
  }
  return expected;
}

function tokenPids(token) {
  if (process.platform !== 'linux') return [];
  const pids = [];
  for (const name of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(name) || Number(name) === process.pid) continue;
    try {
      const env = fs.readFileSync(`/proc/${name}/environ`, 'utf8');
      if (env.split('\0').includes(`OMNI_RUNNER_TOKEN=${token}`)) pids.push(Number(name));
    } catch (_) {}
  }
  return pids;
}

function signalOwnedProcesses(child, token, signal) {
  const targets = new Set(tokenPids(token));
  if (child && child.pid) targets.add(child.pid);
  if (process.platform !== 'win32' && child && child.pid) {
    try { process.kill(-child.pid, signal); } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  for (const pid of targets) {
    try { process.kill(pid, signal); } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
}

function runChild(command, args, options) {
  return new Promise(resolve => {
    const token = crypto.randomBytes(16).toString('hex');
    const startedAt = Date.now();
    const child = spawn(command, args, {
      cwd: options.cwd || REPO_ROOT,
      detached: process.platform !== 'win32',
      env: { ...options.env, OMNI_RUNNER_TOKEN: token },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const stdout = [];
    const stderr = [];
    let timedOut = false;
    let isolationViolation = false;
    let isolationPids = [];
    let spawnError = null;
    let settled = false;
    let cleanupStarted = false;
    let code = null;
    let signal = null;
    let timeoutTimer;
    let killTimer;
    let pipeTimer;

    const resolveResult = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      clearTimeout(killTimer);
      clearTimeout(pipeTimer);
      const survivingPids = tokenPids(token);
      resolve({
        code, signal, timedOut, isolationViolation, isolationPids,
        spawnError, elapsedMs: Date.now() - startedAt,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        survivingPids
      });
    };
    const cleanupOwned = markIsolation => {
      if (cleanupStarted) return;
      cleanupStarted = true;
      clearTimeout(timeoutTimer);
      isolationPids = tokenPids(token);
      isolationViolation = markIsolation && isolationPids.length > 0;
      signalOwnedProcesses(child, token, 'SIGTERM');
      killTimer = setTimeout(() => {
        signalOwnedProcesses(child, token, 'SIGKILL');
        child.stdout.destroy();
        child.stderr.destroy();
        pipeTimer = setTimeout(resolveResult, options.pipeGraceMs);
      }, options.killGraceMs);
    };

    child.stdout.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.on('error', error => { spawnError = error; });
    child.on('exit', (exitCode, exitSignal) => { code = exitCode; signal = exitSignal; });
    child.on('close', (exitCode, exitSignal) => {
      if (code === null) code = exitCode;
      if (signal === null) signal = exitSignal;
      if (timedOut) return;
      const owned = tokenPids(token);
      if (owned.length > 0) cleanupOwned(true);
      else resolveResult();
    });

    timeoutTimer = setTimeout(() => {
      timedOut = true;
      cleanupOwned(false);
    }, options.timeoutMs);
  });
}
async function ensureBuildArtifact(options) {
  const artifactPath = options.artifactPath || path.resolve(REPO_ROOT, 'dist/index.html');
  if (fs.existsSync(artifactPath)) return { built: false };
  const command = options.buildCommand || process.execPath;
  const args = options.buildArgs || [path.resolve(REPO_ROOT, 'node_modules/vite/bin/vite.js'), 'build'];
  const result = await runChild(command, args, {
    cwd: options.buildCwd || REPO_ROOT,
    timeoutMs: options.buildTimeoutMs || DEFAULT_TIMEOUT_MS,
    killGraceMs: options.killGraceMs,
    pipeGraceMs: options.pipeGraceMs,
    env: { ...process.env, NODE_ENV: 'test', ...(options.buildEnv || {}) }
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.spawnError) throw Object.assign(result.spawnError, { kind: 'SETUP_ERROR' });
  if (result.isolationViolation || result.survivingPids.length > 0) {
    throw Object.assign(new Error('BUILD_PROCESS_LEAK'), { kind: 'SETUP_ERROR' });
  }
  if (result.timedOut) throw Object.assign(new Error('BUILD_TIMEOUT'), { kind: 'SETUP_ERROR' });
  if (result.code !== 0) throw Object.assign(new Error(`BUILD_EXIT_${result.code}`), { kind: 'SETUP_ERROR' });
  if (!fs.existsSync(artifactPath)) throw Object.assign(new Error('BUILD_ARTIFACT_MISSING'), { kind: 'SETUP_ERROR' });
  return { built: true, command, args };
}

function printSummary(result) {
  for (const error of result.harnessErrors) {
    console.error(`🔴 HARNESS_ERROR phase=${error.phase} reason=${error.reason}`);
  }
  console.log('================================================================');
  console.log(`SUITE_RESULT total=${result.total} passed=${result.passed} failed=${result.failed} unexecuted=${result.unexecuted} harness_errors=${result.harnessErrors.length}`);
  console.log('================================================================');
}

async function runAllTests(options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const killGraceMs = options.killGraceMs || DEFAULT_KILL_GRACE_MS;
  const pipeGraceMs = options.pipeGraceMs || DEFAULT_PIPE_GRACE_MS;
  const prepareArtifacts = options.prepareArtifacts !== false;
  const mode = options.mode || 'canonical';
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
      if (mode === 'subset') {
        if (!Array.isArray(options.testFiles) || options.testFiles.length === 0) {
          throw new Error('EMPTY_EXPLICIT_SUBSET');
        }
        testFiles = [...options.testFiles];
      } else if (mode === 'canonical') {
        if (options.testFiles) throw new Error('CANONICAL_MODE_REJECTS_EXPLICIT_TEST_FILES');
        testFiles = discoverTestFiles(options.testsDir || __dirname, options.inventoryPath || INVENTORY_PATH);
      } else {
        throw new Error(`INVALID_RUN_MODE_${mode}`);
      }
      suiteImportsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omniseller-suite-imports-'));
    } catch (error) {
      harnessErrors.push({ phase: 'discovery', reason: error.message });
    }

    for (const [idx, file] of testFiles.entries()) {
      const absoluteFile = path.isAbsolute(file) ? file : path.resolve(REPO_ROOT, file);
      if (!fs.existsSync(absoluteFile)) {
        invoked++;
        failed++;
        failures.push({ file, kind: 'STARTUP_ERROR', reason: 'TEST_FILE_NOT_FOUND' });
        console.error(`🔴 ${file} STARTUP_ERROR: TEST_FILE_NOT_FOUND\n`);
        continue;
      }

      invoked++;
      console.log(`[Test ${idx + 1}/${testFiles.length}] Executing ${file}...`);
      try {
        const performanceFile = options.performanceTestFile || 'tests/test_performance_and_latency.cjs';
        if (prepareArtifacts && file === performanceFile) {
          await ensureBuildArtifact({ ...options, killGraceMs, pipeGraceMs });
        }
        const result = await runChild(process.execPath, [absoluteFile], {
          timeoutMs, killGraceMs, pipeGraceMs,
          env: {
            ...process.env,
            NODE_ENV: 'test',
            TEST_IMPORTS_DIR: childImportsDir(suiteImportsRoot, idx, file)
          }
        });
        if (result.stdout) process.stdout.write(result.stdout);
        if (result.stderr) process.stderr.write(result.stderr);
        if (result.spawnError) {
          throw Object.assign(result.spawnError, { kind: 'STARTUP_ERROR' });
        }
        if (result.isolationViolation || result.survivingPids.length > 0) {
          throw Object.assign(
            new Error(`DESCENDANT_PROCESS_LEAK detected=${result.isolationPids.join(',')} survivors=${result.survivingPids.join(',')}`),
            { kind: 'ISOLATION_FAILURE' }
          );
        }
        if (result.timedOut) {
          const survivors = result.survivingPids.length ? ` survivors=${result.survivingPids.join(',')}` : '';
          throw Object.assign(new Error(`TIMED OUT AFTER ${timeoutMs} MS${survivors}`), { kind: 'TIMEOUT' });
        }
        if (result.code !== 0) {
          throw Object.assign(new Error(`TEST EXIT ${result.code}`), { kind: 'TEST_FAILURE' });
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

  const result = {
    total: testFiles.length,
    invoked,
    passed,
    failed,
    unexecuted: Math.max(0, testFiles.length - invoked),
    failures,
    harnessErrors,
    mode
  };
  printSummary(result);
  return result;
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
    printSummary({
      total: 0, passed: 0, failed: 0, unexecuted: 0,
      harnessErrors: [{ phase: 'fatal', reason: error.message }]
    });
    process.exitCode = 1;
  });
}

module.exports = {
  INVENTORY_PATH,
  scanEntrypoints,
  discoverTestFiles,
  runChild,
  ensureBuildArtifact,
  runAllTests,
  exitCodeForResult
};
