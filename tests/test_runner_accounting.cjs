const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { discoverTestFiles, runAllTests, exitCodeForResult } = require('./run_all_tests.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-accounting-'));
const write = (name, source) => {
  const filename = path.join(root, name);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, source);
  return filename;
};

try {
  const passOne = write('a_pass.cjs', "process.stdout.write('PASS_ONE')");
  const fail = write('b_fail.cjs', "process.stderr.write('EXPECTED_FAILURE'); process.exitCode=7");
  const passTwo = write('c_pass.cjs', "process.stdout.write('PASS_TWO')");
  const timeout = write('d_timeout.cjs', 'setInterval(() => {}, 1000)');
  write('ignored.js', 'throw new Error("must not execute")');
  write('nested/ignored.cjs', 'throw new Error("must not execute")');

  const discovered = discoverTestFiles(root).map(file => path.basename(file));
  assert.deepEqual(discovered, ['a_pass.cjs', 'b_fail.cjs', 'c_pass.cjs', 'd_timeout.cjs']);
  const accumulated = runAllTests({
    testFiles: [passOne, fail, passTwo],
    timeoutMs: 1000,
    prepareArtifacts: false
  });
  assert.deepEqual(
    { total: accumulated.total, invoked: accumulated.invoked, passed: accumulated.passed,
      failed: accumulated.failed, unexecuted: accumulated.unexecuted },
    { total: 3, invoked: 3, passed: 2, failed: 1, unexecuted: 0 }
  );
  assert.match(accumulated.failures[0].reason, /status 7|Command failed/);
  assert.equal(exitCodeForResult(accumulated), 1);

  const wrapper = write('runner_cli.cjs', `
    const runner = require(${JSON.stringify(path.resolve(__dirname, 'run_all_tests.cjs'))});
    const result = runner.runAllTests({
      testFiles: ${JSON.stringify([fail, passTwo])},
      timeoutMs: 1000,
      prepareArtifacts: false
    });
    process.exitCode = runner.exitCodeForResult(result);
  `);
  const cli = spawnSync(process.execPath, [wrapper], { encoding: 'utf8' });
  assert.equal(cli.status, 1);
  assert.match(cli.stdout, /PASS_TWO/);
  assert.match(cli.stdout, /SUITE_RESULT total=2 passed=1 failed=1 unexecuted=0/);

  const timed = runAllTests({
    testFiles: [timeout, passOne],
    timeoutMs: 100,
    prepareArtifacts: false
  });
  assert.deepEqual(
    { total: timed.total, invoked: timed.invoked, passed: timed.passed,
      failed: timed.failed, unexecuted: timed.unexecuted },
    { total: 2, invoked: 2, passed: 1, failed: 1, unexecuted: 0 }
  );
  assert.match(timed.failures[0].reason, /TIMED OUT/);
  const zero = runAllTests({ testFiles: [], prepareArtifacts: false });
  assert.deepEqual(
    { total: zero.total, invoked: zero.invoked, passed: zero.passed,
      failed: zero.failed, unexecuted: zero.unexecuted },
    { total: 0, invoked: 0, passed: 0, failed: 1, unexecuted: 0 }
  );
  assert.equal(zero.failures[0].reason, 'ZERO_TESTS_DISCOVERED');

  assert.equal(exitCodeForResult({ failed: 0, unexecuted: 0 }), 0);
  console.log('F-05 runner accounting measured=9 passed=9 failed=0 unexecuted=0');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
