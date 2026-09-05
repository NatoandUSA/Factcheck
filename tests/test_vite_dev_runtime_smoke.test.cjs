const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

async function waitForServer(url, timeoutMs, getDiagnostics) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  const diagnostics = getDiagnostics?.().trim();
  throw new Error(
    `Timed out waiting for Vite dev server at ${url} after ${timeoutMs}ms.`
    + (diagnostics ? `\nVite output:\n${diagnostics}` : '')
  );
}

async function shutdownChildProcess(child, options = {}) {
  const termGraceMs = options.termGraceMs ?? 1000;
  const killGraceMs = options.killGraceMs ?? 1000;
  const pollMs = options.pollMs ?? 20;
  const taskkillTimeoutMs = options.taskkillTimeoutMs ?? 2000;
  const platform = options.platform ?? process.platform;
  const runTaskkill = options.spawnSyncFn ?? spawnSync;
  const pid = child?.pid;
  if (!pid) return { escalated: false };

  const treeAlive = options.treeAliveFn ?? (() => {
    try {
      process.kill(platform === 'win32' ? pid : -pid, 0);
      return true;
    } catch (error) {
      if (error.code === 'ESRCH') return false;
      throw error;
    }
  });
  const signalTree = signal => {
    if (platform === 'win32') {
      const args = ['/PID', String(pid), '/T'];
      if (signal === 'SIGKILL') args.push('/F');
      const result = runTaskkill('taskkill', args, {
        stdio: 'ignore',
        timeout: taskkillTimeoutMs,
        windowsHide: true
      });
      return {
        ok: !result.error && result.status === 0,
        status: result.status,
        error: result.error
      };
    }
    try {
      process.kill(-pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
    return { ok: true, status: 0, error: null };
  };
  const waitForTreeExit = async timeoutMs => {
    const deadline = Date.now() + timeoutMs;
    while (treeAlive() && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, pollMs));
    }
    return !treeAlive();
  };

  const termResult = signalTree('SIGTERM');
  const termExited = await waitForTreeExit(termGraceMs);
  if (termResult.ok && termExited) return { escalated: false };

  const forceResult = signalTree('SIGKILL');
  if (!forceResult.ok) {
    const detail = forceResult.error?.code || forceResult.error?.message || forceResult.status;
    throw new Error(`TASKKILL_FORCE_TREE_FAILED pid=${pid} detail=${detail}`);
  }
  if (await waitForTreeExit(killGraceMs)) return { escalated: true };
  child.stdout?.destroy();
  child.stderr?.destroy();
  throw new Error(`VITE_PROCESS_TREE_SHUTDOWN_TIMEOUT pid=${pid} platform=${platform}`);
}

async function runViteSmokeTest() {
  console.log('================================================================');
  console.log('  TESTING VITE DEV RUNTIME MODULE BOUNDARY & REAL VITE SERVER');
  console.log('================================================================\n');

  // Test 1: Verify ESM file syntax & export directly
  console.log('Test 1: Verifying src/utils/xrayUploadOutcome.js ESM file syntax...');
  const esmFilePath = path.join(__dirname, '../src/utils/xrayUploadOutcome.js');
  assert.ok(fs.existsSync(esmFilePath), 'src/utils/xrayUploadOutcome.js file must exist');
  const esmContent = fs.readFileSync(esmFilePath, 'utf8');
  assert.ok(esmContent.includes('export function deriveXrayUploadOutcome'), 'ESM file must export deriveXrayUploadOutcome for Vite dev server');
  console.log('  🟢 ESM module file syntax & export verified.');

  // Test 2: Verify CJS module file has ZERO string evaluation (no eval, no new Function)
  console.log('\nTest 2: Verifying src/utils/xrayUploadOutcome.cjs has ZERO string evaluation...');
  const cjsFilePath = path.join(__dirname, '../src/utils/xrayUploadOutcome.cjs');
  assert.ok(fs.existsSync(cjsFilePath), 'src/utils/xrayUploadOutcome.cjs file must exist');
  const cjsContent = fs.readFileSync(cjsFilePath, 'utf8');
  assert.strictEqual(cjsContent.includes('new Function'), false, 'CJS file must NOT use new Function');
  assert.strictEqual(cjsContent.includes('eval('), false, 'CJS file must NOT use eval');
  console.log('  🟢 CJS module verified: ZERO string evaluation (no eval / no new Function).');

  // Test 3: Launch real Vite dev server and fetch component module graph over HTTP
  console.log('\nTest 3: Launching real Vite Dev Server on port 5179...');
  const viteCli = path.join(__dirname, '../node_modules/vite/bin/vite.js');
  assert.ok(fs.existsSync(viteCli), 'Local Vite CLI must be installed before the runtime smoke test');
  let viteOutput = '';
  const viteProc = spawn(process.execPath, [viteCli, '--host', '127.0.0.1', '--port', '5179', '--strictPort'], {
    cwd: path.join(__dirname, '..'),
    detached: process.platform !== 'win32',
    env: { ...process.env, NODE_ENV: 'development' }
  });
  viteProc.stdout.on('data', chunk => { viteOutput += chunk.toString(); });
  viteProc.stderr.on('data', chunk => { viteOutput += chunk.toString(); });

  try {
    const indexRes = await waitForServer('http://127.0.0.1:5179/', 30000, () => viteOutput);
    assert.strictEqual(indexRes.status, 200, 'Vite dev server root must return 200 OK');
    const indexText = await indexRes.text();
    assert.ok(indexText.includes('src/main.jsx'), 'Index HTML must load main.jsx entry point');
    console.log('  🟢 Real Vite dev server started and index.html served cleanly.');

    // Fetch xrayUploadOutcome module over Vite HTTP
    const utilRes = await fetch('http://127.0.0.1:5179/src/utils/xrayUploadOutcome.js');
    assert.strictEqual(utilRes.status, 200, 'Vite must transform & serve xrayUploadOutcome.js');
    const utilText = await utilRes.text();
    assert.ok(utilText.includes('deriveXrayUploadOutcome'), 'Served JS must contain deriveXrayUploadOutcome');
    console.log('  🟢 Vite served src/utils/xrayUploadOutcome.js without compilation errors.');

    // Fetch AmazonPipelineWorkflow component over Vite HTTP
    const compRes = await fetch('http://127.0.0.1:5179/src/components/AmazonPipelineWorkflow.jsx');
    assert.strictEqual(compRes.status, 200, 'Vite must transform & serve AmazonPipelineWorkflow.jsx');
    console.log('  🟢 Vite served AmazonPipelineWorkflow.jsx without module import errors.');

    console.log('\n================================================================');
    console.log('  🟢 ALL VITE DEV RUNTIME MODULE & SERVER SMOKE TESTS PASSED');
    console.log('================================================================\n');
  } finally {
    await shutdownChildProcess(viteProc);
  }
}

if (require.main === module) {
  runViteSmokeTest().catch(err => {
    console.error('🔴 VITE SMOKE TEST FAILED:', err);
    process.exitCode = 1;
  });
}

module.exports = { waitForServer, shutdownChildProcess, runViteSmokeTest };
