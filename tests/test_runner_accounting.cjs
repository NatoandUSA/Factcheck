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
let measured = 0;
const check = assertion => { assertion(); measured++; };

(async () => {
  try {
    const passOne = write('a_pass.cjs', "process.stdout.write('PASS_ONE')");
    const fail = write('b_fail.cjs', "process.stderr.write('EXPECTED_FAILURE'); process.exitCode=7");
    const passTwo = write('c_pass.cjs', "process.stdout.write('PASS_TWO')");
    const stubborn = write('d_stubborn.cjs',
      "process.on('SIGTERM',()=>{}); setTimeout(()=>process.exit(0),10000)");
    const safeEnv = write('e_safe_env.cjs',
      "if(process.env.NODE_ENV!=='test') process.exit(9)");
    const explicitProduction = write('f_explicit_production.cjs', `
      const {spawnSync}=require('node:child_process');
      const r=spawnSync(process.execPath,['-e',
        "if(process.env.NODE_ENV!=='production')process.exit(8)"],
        {env:{...process.env,NODE_ENV:'production'}});
      process.exit(r.status ?? 9);
    `);
    write('ignored.js', 'throw new Error("must not execute")');
    write('nested/ignored.cjs', 'throw new Error("must not execute")');

    const discovered = discoverTestFiles(root).map(file => path.basename(file));
    check(() => assert.deepEqual(discovered,
      ['a_pass.cjs', 'b_fail.cjs', 'c_pass.cjs', 'd_stubborn.cjs',
       'e_safe_env.cjs', 'f_explicit_production.cjs']));

    const accumulated = await runAllTests({
      testFiles: [passOne, fail, passTwo],
      timeoutMs: 1000, prepareArtifacts: false
    });
    check(() => assert.deepEqual(
      { total: accumulated.total, invoked: accumulated.invoked, passed: accumulated.passed,
        failed: accumulated.failed, unexecuted: accumulated.unexecuted },
      { total: 3, invoked: 3, passed: 2, failed: 1, unexecuted: 0 }
    ));
    check(() => assert.equal(accumulated.failures[0].kind, 'TEST_FAILURE'));
    check(() => assert.equal(exitCodeForResult(accumulated), 1));

    const started = Date.now();
    const timed = await runAllTests({
      testFiles: [stubborn, passOne],
      timeoutMs: 150, killGraceMs: 150, prepareArtifacts: false
    });
    const elapsed = Date.now() - started;
    check(() => assert.deepEqual(
      { total: timed.total, invoked: timed.invoked, passed: timed.passed,
        failed: timed.failed, unexecuted: timed.unexecuted },
      { total: 2, invoked: 2, passed: 1, failed: 1, unexecuted: 0 }
    ));
    check(() => assert.equal(timed.failures[0].kind, 'TIMEOUT'));
    check(() => assert.ok(elapsed < 1500, `timeout escalation took ${elapsed}ms`));

    const zero = await runAllTests({ testFiles: [], prepareArtifacts: false });
    check(() => assert.deepEqual(
      { total: zero.total, passed: zero.passed, failed: zero.failed,
        unexecuted: zero.unexecuted, harnessErrors: zero.harnessErrors.length },
      { total: 0, passed: 0, failed: 0, unexecuted: 0, harnessErrors: 1 }
    ));
    check(() => assert.equal(zero.harnessErrors[0].reason, 'ZERO_TESTS_DISCOVERED'));
    check(() => assert.equal(exitCodeForResult(zero), 1));

    const missing = await runAllTests({
      testFiles: [path.join(root, 'missing.cjs'), passOne],
      prepareArtifacts: false
    });
    check(() => assert.deepEqual(
      { total: missing.total, invoked: missing.invoked, passed: missing.passed,
        failed: missing.failed, unexecuted: missing.unexecuted },
      { total: 2, invoked: 2, passed: 1, failed: 1, unexecuted: 0 }
    ));
    check(() => assert.equal(missing.failures[0].kind, 'STARTUP_ERROR'));

    const cleanupFailure = await runAllTests({
      testFiles: [passOne],
      prepareArtifacts: false,
      cleanup: suiteRoot => {
        fs.rmSync(suiteRoot, { recursive: true, force: true });
        throw new Error('INJECTED_CLEANUP_FAILURE');
      }
    });
    check(() => assert.deepEqual(
      { total: cleanupFailure.total, passed: cleanupFailure.passed,
        failed: cleanupFailure.failed, unexecuted: cleanupFailure.unexecuted,
        harnessErrors: cleanupFailure.harnessErrors.length },
      { total: 1, passed: 1, failed: 0, unexecuted: 0, harnessErrors: 1 }
    ));
    check(() => assert.equal(cleanupFailure.harnessErrors[0].phase, 'cleanup'));
    check(() => assert.equal(exitCodeForResult(cleanupFailure), 1));

    const environments = await runAllTests({
      testFiles: [safeEnv, explicitProduction],
      prepareArtifacts: false
    });
    check(() => assert.deepEqual(
      { passed: environments.passed, failed: environments.failed },
      { passed: 2, failed: 0 }
    ));

    const wrapper = write('runner_receipt.cjs', `
      const runner=require(${JSON.stringify(path.resolve(__dirname, 'run_all_tests.cjs'))});
      (async()=>{const result=await runner.runAllTests({
        testFiles:[${JSON.stringify(passOne)}],
        prepareArtifacts:false,
        cleanup:suiteRoot=>{
          require('node:fs').rmSync(suiteRoot,{recursive:true,force:true});
          throw new Error('INJECTED_CLEANUP_FAILURE')
        }
      });process.exitCode=runner.exitCodeForResult(result)})()
    `);
    const cli = spawnSync(process.execPath, [wrapper], { encoding: 'utf8' });
    check(() => assert.equal(cli.status, 1));
    check(() => assert.match(cli.stdout,
      /SUITE_RESULT total=1 passed=1 failed=0 unexecuted=0 harness_errors=1/));
    check(() => assert.match(cli.stderr, /INJECTED_CLEANUP_FAILURE/));

    check(() => assert.equal(exitCodeForResult({
      failed: 0, unexecuted: 0, harnessErrors: []
    }), 0));
    console.log(`F-05 runner lifecycle measured=${measured} passed=${measured} failed=0 unexecuted=0`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
