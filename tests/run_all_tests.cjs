const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { childImportsDir } = require('./helpers/suiteIsolation.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');

function discoverTestFiles(testsDir = __dirname) {
  return fs.readdirSync(testsDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.cjs') && entry.name !== 'run_all_tests.cjs')
    .map(entry => path.relative(REPO_ROOT, path.join(testsDir, entry.name)).split(path.sep).join('/'))
    .sort();
}

function runAllTests(options = {}) {
  const testFiles = options.testFiles || discoverTestFiles();
  const timeoutMs = options.timeoutMs || 180000;
  const prepareArtifacts = options.prepareArtifacts !== false;
  const suiteImportsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omniseller-suite-imports-'));
  let invoked = 0;
  let passed = 0;
  let failed = 0;
  const failures = [];

  console.log('================================================================');
  console.log('  RUNNING OMNISELLER STUDIO SUITE - EXECUTABLE ASSERTIONS');
  console.log('================================================================\n');
  try {
    for (const [idx, file] of testFiles.entries()) {
      invoked++;
      console.log(`[Test ${idx + 1}/${testFiles.length}] Executing ${file}...`);
      try {
        if (prepareArtifacts && file === 'tests/test_performance_and_latency.cjs'
            && !fs.existsSync(path.resolve(REPO_ROOT, 'dist/index.html'))) {
          execFileSync(process.execPath, [path.resolve(REPO_ROOT, 'node_modules/vite/bin/vite.js'), 'build'], {
            cwd: REPO_ROOT,
            stdio: 'inherit',
            timeout: 180000
          });
        }
        const output = execFileSync(process.execPath, [file], {
          encoding: 'utf-8',
          cwd: REPO_ROOT,
          env: { ...process.env, TEST_IMPORTS_DIR: childImportsDir(suiteImportsRoot, idx, file) },
          timeout: timeoutMs,
          killSignal: 'SIGTERM'
        });
        console.log(output);
        console.log(`✅ ${file} PASSED CLEANLY!\n`);
        passed++;
      } catch (error) {
        failed++;
        const timedOut = error.code === 'ETIMEDOUT' || error.signal === 'SIGTERM';
        const reason = timedOut ? `TIMED OUT AFTER ${timeoutMs} MS` : error.message;
        failures.push({ file, reason });
        if (error.stdout) console.error(String(error.stdout));
        if (error.stderr) console.error(String(error.stderr));
        console.error(`🔴 ${file} FAILED: ${reason}\n`);
      }
    }
  } finally {
    fs.rmSync(suiteImportsRoot, { recursive: true, force: true });
  }

  const total = testFiles.length;
  const unexecuted = total - invoked;
  if (total === 0) {
    failures.push({ file: null, reason: 'ZERO_TESTS_DISCOVERED' });
    failed++;
    console.error('🔴 ZERO_TESTS_DISCOVERED');
  }
  console.log('================================================================');
  console.log(`SUITE_RESULT total=${total} passed=${passed} failed=${failed} unexecuted=${unexecuted}`);
  console.log('================================================================');
  return { total, invoked, passed, failed, unexecuted, failures };
}

const exitCodeForResult = result => result.failed > 0 || result.unexecuted > 0 ? 1 : 0;

if (require.main === module) {
  process.exitCode = exitCodeForResult(runAllTests());
}

module.exports = { discoverTestFiles, runAllTests, exitCodeForResult };
