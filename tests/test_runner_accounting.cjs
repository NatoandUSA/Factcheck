const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  discoverTestFiles, runAllTests, exitCodeForResult
} = require('./run_all_tests.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-accounting-'));
const write = (name, source) => {
  const filename = path.join(root, name);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, source);
  return filename;
};
const subset = options => ({ mode: 'subset', prepareArtifacts: false, ...options });
let measured = 0;
const check = assertion => { assertion(); measured++; };
const relative = filename => path.relative(path.resolve(__dirname, '..'), filename).split(path.sep).join('/');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

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
    const sentinelLeader = path.join(root, 'leader-sentinel');
    const leaderExited = write('g_leader_exited.cjs', `
      require('node:child_process').spawn(process.execPath,
        ['-e',${JSON.stringify(`setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(sentinelLeader)},'BAD'),1200);setInterval(()=>{},1000)`)}],
        {stdio:['ignore','inherit','inherit']});
    `);
    const sentinelDetached = path.join(root, 'detached-sentinel');
    const detachedDescendant = write('h_detached_descendant.cjs', `
      require('node:child_process').spawn(process.execPath,
        ['-e',${JSON.stringify(`setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(sentinelDetached)},'BAD'),1200);setInterval(()=>{},1000)`)}],
        {detached:true,stdio:['ignore','inherit','inherit']}).unref();
    `);

    const accumulated = await runAllTests(subset({
      testFiles: [passOne, fail, passTwo], timeoutMs: 1000
    }));
    check(() => assert.deepEqual(
      { total: accumulated.total, invoked: accumulated.invoked, passed: accumulated.passed,
        failed: accumulated.failed, unexecuted: accumulated.unexecuted },
      { total: 3, invoked: 3, passed: 2, failed: 1, unexecuted: 0 }
    ));
    check(() => assert.equal(accumulated.failures[0].kind, 'TEST_FAILURE'));
    check(() => assert.equal(exitCodeForResult(accumulated), 1));

    for (const childFile of [stubborn, leaderExited, detachedDescendant]) {
      const started = Date.now();
      const timed = await runAllTests(subset({
        testFiles: [childFile, passOne], timeoutMs: 150,
        killGraceMs: 150, pipeGraceMs: 100
      }));
      check(() => assert.deepEqual(
        { passed: timed.passed, failed: timed.failed, unexecuted: timed.unexecuted },
        { passed: 1, failed: 1, unexecuted: 0 }
      ));
      check(() => assert.equal(timed.failures[0].kind, 'TIMEOUT'));
      check(() => assert.ok(Date.now() - started < 1500));
    }
    await wait(1300);
    check(() => assert.equal(fs.existsSync(sentinelLeader), false));
    check(() => assert.equal(fs.existsSync(sentinelDetached), false));
    const watchdogWrapper = write('watchdog_wrapper.cjs', `
      const runner=require(${JSON.stringify(path.resolve(__dirname, 'run_all_tests.cjs'))});
      (async()=>{const r=await runner.runAllTests({
        mode:'subset',testFiles:[${JSON.stringify(detachedDescendant)},${JSON.stringify(passOne)}],
        timeoutMs:150,killGraceMs:150,pipeGraceMs:100,prepareArtifacts:false
      });process.exitCode=runner.exitCodeForResult(r)})()
    `);
    const watchdog = spawnSync(process.execPath, [watchdogWrapper], {
      encoding: 'utf8', timeout: 2500
    });
    check(() => assert.notEqual(watchdog.error && watchdog.error.code, 'ETIMEDOUT'));
    check(() => assert.equal(watchdog.status, 1));
    check(() => assert.match(watchdog.stdout,
      /SUITE_RESULT total=2 passed=1 failed=1 unexecuted=0 harness_errors=0/));

    const emptySubset = await runAllTests(subset({ testFiles: [] }));
    check(() => assert.deepEqual(
      { total: emptySubset.total, passed: emptySubset.passed, failed: emptySubset.failed,
        unexecuted: emptySubset.unexecuted, harnessErrors: emptySubset.harnessErrors.length },
      { total: 0, passed: 0, failed: 0, unexecuted: 0, harnessErrors: 1 }
    ));
    check(() => assert.equal(emptySubset.harnessErrors[0].reason, 'EMPTY_EXPLICIT_SUBSET'));

    const missing = await runAllTests(subset({
      testFiles: [path.join(root, 'missing.cjs'), passOne]
    }));
    check(() => assert.equal(missing.failures[0].kind, 'STARTUP_ERROR'));
    check(() => assert.equal(missing.passed, 1));

    const cleanupFailure = await runAllTests(subset({
      testFiles: [passOne],
      cleanup: suiteRoot => {
        fs.rmSync(suiteRoot, { recursive: true, force: true });
        throw new Error('INJECTED_CLEANUP_FAILURE');
      }
    }));
    check(() => assert.deepEqual(
      { passed: cleanupFailure.passed, failed: cleanupFailure.failed,
        harnessErrors: cleanupFailure.harnessErrors.length },
      { passed: 1, failed: 0, harnessErrors: 1 }
    ));
    check(() => assert.equal(exitCodeForResult(cleanupFailure), 1));
    const environments = await runAllTests(subset({
      testFiles: [safeEnv, explicitProduction]
    }));
    check(() => assert.deepEqual(
      { passed: environments.passed, failed: environments.failed },
      { passed: 2, failed: 0 }
    ));

    const artifact = path.join(root, 'dist', 'index.html');
    const builder = write('fake_vite.cjs', `
      if(process.argv[2]!=='build') process.exit(12);
      require('node:fs').mkdirSync(require('node:path').dirname(process.env.ARTIFACT),{recursive:true});
      require('node:fs').writeFileSync(process.env.ARTIFACT,'built');
    `);
    const perf = write('performance.cjs', `
      if(!require('node:fs').existsSync(${JSON.stringify(artifact)})) process.exit(13)
    `);
    const built = await runAllTests({
      mode: 'subset', testFiles: [perf], performanceTestFile: perf,
      artifactPath: artifact, buildCommand: process.execPath,
      buildArgs: [builder, 'build'], buildEnv: { ARTIFACT: artifact }
    });
    check(() => assert.deepEqual({ passed: built.passed, failed: built.failed }, { passed: 1, failed: 0 }));
    check(() => assert.equal(fs.existsSync(artifact), true));

    fs.rmSync(artifact);
    const failedBuild = write('failed_build.cjs', "process.exit(6)");
    const buildFailure = await runAllTests({
      mode: 'subset', testFiles: [perf, passOne], performanceTestFile: perf,
      artifactPath: artifact, buildCommand: process.execPath,
      buildArgs: [failedBuild, 'build']
    });
    check(() => assert.deepEqual(
      { passed: buildFailure.passed, failed: buildFailure.failed, unexecuted: buildFailure.unexecuted },
      { passed: 1, failed: 1, unexecuted: 0 }
    ));
    check(() => assert.equal(buildFailure.failures[0].kind, 'SETUP_ERROR'));

    const buildTimeout = await runAllTests({
      mode: 'subset', testFiles: [perf, passOne], performanceTestFile: perf,
      artifactPath: artifact, buildCommand: process.execPath,
      buildArgs: [stubborn, 'build'], buildTimeoutMs: 150,
      killGraceMs: 150, pipeGraceMs: 100
    });
    check(() => assert.deepEqual(
      { passed: buildTimeout.passed, failed: buildTimeout.failed, unexecuted: buildTimeout.unexecuted },
      { passed: 1, failed: 1, unexecuted: 0 }
    ));
    check(() => assert.match(buildTimeout.failures[0].reason, /BUILD_TIMEOUT/));

    const discoveryRoot = path.join(root, 'discovery');
    const top = write('discovery/top.test.cjs', '');
    const nested = write('discovery/nested/deep.test.cjs', '');
    write('discovery/helpers/helper.cjs', 'throw new Error("helper")');
    write('discovery/fixtures/fixture.cjs', 'throw new Error("fixture")');
    const inventory = write('discovery/inventory.json',
      JSON.stringify([relative(top), relative(nested)]));
    const discovered = discoverTestFiles(discoveryRoot, inventory);
    check(() => assert.deepEqual(discovered.sort(), [relative(nested), relative(top)].sort()));

    const missingInventory = write('discovery/missing.json',
      JSON.stringify([relative(top), relative(nested), relative(path.join(discoveryRoot, 'lost.test.cjs'))]));
    check(() => assert.throws(
      () => discoverTestFiles(discoveryRoot, missingInventory),
      /TEST_INVENTORY_MISMATCH missing=/
    ));
    const incompleteInventory = write('discovery/incomplete.json', JSON.stringify([relative(top)]));
    check(() => assert.throws(
      () => discoverTestFiles(discoveryRoot, incompleteInventory),
      /unexpected=/
    ));

    const badDiscovery = await runAllTests({
      mode: 'canonical', testsDir: path.join(root, 'does-not-exist'),
      inventoryPath: inventory, prepareArtifacts: false
    });
    check(() => assert.deepEqual(
      { total: badDiscovery.total, failed: badDiscovery.failed,
        harnessErrors: badDiscovery.harnessErrors.length },
      { total: 0, failed: 0, harnessErrors: 1 }
    ));

    const receiptWrapper = write('runner_receipt.cjs', `
      const runner=require(${JSON.stringify(path.resolve(__dirname, 'run_all_tests.cjs'))});
      (async()=>{const result=await runner.runAllTests({
        mode:'subset',testFiles:[${JSON.stringify(passOne)}],prepareArtifacts:false,
        cleanup:suiteRoot=>{
          require('node:fs').rmSync(suiteRoot,{recursive:true,force:true});
          throw new Error('INJECTED_CLEANUP_FAILURE')
        }
      });process.exitCode=runner.exitCodeForResult(result)})()
    `);
    const receipt = spawnSync(process.execPath, [receiptWrapper], { encoding: 'utf8' });
    check(() => assert.equal(receipt.status, 1));
    check(() => assert.match(receipt.stdout,
      /SUITE_RESULT total=1 passed=1 failed=0 unexecuted=0 harness_errors=1/));
    check(() => assert.match(receipt.stderr, /INJECTED_CLEANUP_FAILURE/));

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
