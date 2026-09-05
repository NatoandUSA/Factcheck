const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { shutdownChildProcess } = require('./test_vite_dev_runtime_smoke.test.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vite-shutdown-'));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const alive = pid => {
  try { process.kill(pid, 0); return true; } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
};
const groupAlive = pgid => {
  if (process.platform === 'win32') return alive(pgid);
  try { process.kill(-pgid, 0); return true; } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
};
const waitReady = child => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('TREE_READY_TIMEOUT')), 1500);
  child.stdout.once('data', chunk => {
    clearTimeout(timer);
    const match = String(chunk).match(/READY:(\d+)/);
    if (!match) return reject(new Error('INVALID_TREE_READY_SIGNAL'));
    resolve(Number(match[1]));
  });
});
const spawnTree = sentinel => spawn(process.execPath, ['-e', `
  const {spawn}=require('node:child_process');
  const grandchild=spawn(process.execPath,['-e',
    ${JSON.stringify(`process.on('SIGTERM',()=>{});process.stdout.write('GRANDCHILD_READY');setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(sentinel)},'BAD'),700);setInterval(()=>{},1000)`)}],
    {stdio:['ignore','pipe','ignore']});
  process.on('SIGTERM',()=>process.exit(0));
  grandchild.stdout.once('data',()=>process.stdout.write('READY:'+grandchild.pid));
  setInterval(()=>{},1000);
`], {
  detached: process.platform !== 'win32',
  stdio: ['ignore', 'pipe', 'pipe']
});

let activeChild = null;
let measured = 0;
const check = assertion => { assertion(); measured++; };

(async () => {
  try {
    const successSentinel = path.join(root, 'success-late-write');
    activeChild = spawnTree(successSentinel);
    const successPgid = activeChild.pid;
    const successGrandchild = await waitReady(activeChild);
    let successCleanupRan = false;
    let successShutdown;
    try {
      check(() => assert.equal(groupAlive(successPgid), true));
    } finally {
      successShutdown = await shutdownChildProcess(activeChild, {
        termGraceMs: 100, killGraceMs: 500, pollMs: 10
      });
      successCleanupRan = true;
    }
    check(() => assert.equal(successCleanupRan, true));
    check(() => assert.equal(successShutdown.escalated, true));
    check(() => assert.equal(groupAlive(successPgid), false));
    check(() => assert.equal(alive(successGrandchild), false));
    await wait(800);
    check(() => assert.equal(fs.existsSync(successSentinel), false));

    const failureSentinel = path.join(root, 'failure-late-write');
    activeChild = spawnTree(failureSentinel);
    const failurePgid = activeChild.pid;
    const failureGrandchild = await waitReady(activeChild);
    let caught = null;
    let failureCleanupRan = false;
    let failureShutdown;
    try {
      try {
        throw new Error('INJECTED_OPERATION_FAILURE');
      } finally {
        failureShutdown = await shutdownChildProcess(activeChild, {
          termGraceMs: 100, killGraceMs: 500, pollMs: 10
        });
        failureCleanupRan = true;
      }
    } catch (error) {
      caught = error;
    }
    check(() => assert.equal(caught && caught.message, 'INJECTED_OPERATION_FAILURE'));
    check(() => assert.equal(failureCleanupRan, true));
    check(() => assert.equal(failureShutdown.escalated, true));
    check(() => assert.equal(groupAlive(failurePgid), false));
    check(() => assert.equal(alive(failureGrandchild), false));
    await wait(800);
    check(() => assert.equal(fs.existsSync(failureSentinel), false));

    activeChild = spawn(process.execPath, ['-e',
      "process.on('SIGTERM',()=>process.exit(0));process.stdout.write('READY:0');setInterval(()=>{},1000)"
    ], {
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    await waitReady(activeChild);
    const cooperativePgid = activeChild.pid;
    const cooperative = await shutdownChildProcess(activeChild, {
      termGraceMs: 500, killGraceMs: 300, pollMs: 10
    });
    check(() => assert.equal(cooperative.escalated, process.platform === 'win32'));
    check(() => assert.equal(groupAlive(cooperativePgid), false));

    const windowsCalls = [];
    let windowsForced = false;
    const windowsEscalation = await shutdownChildProcess({ pid: 4242 }, {
      platform: 'win32',
      termGraceMs: 0,
      killGraceMs: 20,
      pollMs: 1,
      taskkillTimeoutMs: 321,
      treeAliveFn: () => !windowsForced,
      spawnSyncFn: (_command, args, options) => {
        windowsCalls.push({ args, timeout: options.timeout });
        if (args.includes('/F')) {
          windowsForced = true;
          return { status: 0 };
        }
        return { status: 128 };
      }
    });
    check(() => assert.equal(windowsEscalation.escalated, true));
    check(() => assert.deepEqual(windowsCalls.map(call => call.args), [
      ['/PID', '4242', '/T'],
      ['/PID', '4242', '/T', '/F']
    ]));
    check(() => assert.deepEqual(windowsCalls.map(call => call.timeout), [321, 321]));

    let timeoutForced = false;
    const timeoutEscalation = await shutdownChildProcess({ pid: 4343 }, {
      platform: 'win32',
      termGraceMs: 0,
      killGraceMs: 20,
      pollMs: 1,
      taskkillTimeoutMs: 17,
      treeAliveFn: () => !timeoutForced,
      spawnSyncFn: (_command, args) => {
        if (args.includes('/F')) {
          timeoutForced = true;
          return { status: 0 };
        }
        return { status: null, error: Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }) };
      }
    });
    check(() => assert.equal(timeoutEscalation.escalated, true));

    await assert.rejects(
      shutdownChildProcess({ pid: 4444 }, {
        platform: 'win32',
        termGraceMs: 0,
        killGraceMs: 0,
        treeAliveFn: () => true,
        spawnSyncFn: () => ({ status: 128 })
      }),
      /TASKKILL_FORCE_TREE_FAILED pid=4444 detail=128/
    );
    measured++;

    console.log(`VITE_TREE_SHUTDOWN_RESULT measured=${measured} passed=${measured} failed=0 unexecuted=0`);
  } finally {
    if (activeChild && groupAlive(activeChild.pid)) {
      try {
        await shutdownChildProcess(activeChild, {
          termGraceMs: 0,
          killGraceMs: 500,
          pollMs: 10,
          taskkillTimeoutMs: 1000
        });
      } catch (_) {}
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
