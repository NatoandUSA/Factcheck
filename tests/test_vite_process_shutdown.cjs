const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { shutdownChildProcess } = require('./test_vite_dev_runtime_smoke.test.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vite-shutdown-'));
const sentinel = path.join(root, 'late-write');
const alive = pid => {
  try { process.kill(pid, 0); return true; } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitReady = childProcess => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('CHILD_READY_TIMEOUT')), 1000);
  childProcess.stdout.once('data', chunk => {
    clearTimeout(timer);
    if (!String(chunk).includes('READY')) return reject(new Error('INVALID_CHILD_READY_SIGNAL'));
    resolve();
  });
});
let child = null;
let measured = 0;
const check = assertion => { assertion(); measured++; };

(async () => {
  try {
    child = spawn(process.execPath, ['-e', `
      process.on('SIGTERM',()=>{});
      process.stdout.write('READY');
      setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(sentinel)},'BAD'),700);
      setInterval(()=>{},1000);
    `], {
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const stubbornPid = child.pid;
    await waitReady(child);
    const started = Date.now();
    const result = await shutdownChildProcess(child, {
      termGraceMs: 100,
      killGraceMs: 300
    });
    check(() => assert.equal(result.escalated, true));
    check(() => assert.equal(alive(stubbornPid), false));
    check(() => assert.ok(Date.now() - started < 1200));
    await wait(800);
    check(() => assert.equal(fs.existsSync(sentinel), false));

    child = spawn(process.execPath, ['-e',
      "process.on('SIGTERM',()=>process.exit(0));process.stdout.write('READY');setInterval(()=>{},1000)"
    ], {
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const cooperativePid = child.pid;
    await waitReady(child);
    const clean = await shutdownChildProcess(child, {
      termGraceMs: 500,
      killGraceMs: 300
    });
    check(() => assert.equal(clean.escalated, false));
    check(() => assert.equal(alive(cooperativePid), false));

    console.log(`VITE_SHUTDOWN_RESULT measured=${measured} passed=${measured} failed=0 unexecuted=0`);
  } finally {
    if (child && alive(child.pid)) {
      try {
        if (process.platform === 'win32') child.kill('SIGKILL');
        else process.kill(-child.pid, 'SIGKILL');
      } catch (_) {}
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
