const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function waitForServer(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for Vite dev server at ${url}`);
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
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const viteProc = spawn(npxCmd, ['vite', '--port', '5179', '--strictPort'], {
    cwd: path.join(__dirname, '..'),
    shell: true,
    env: { ...process.env, NODE_ENV: 'development' }
  });

  try {
    const indexRes = await waitForServer('http://127.0.0.1:5179/');
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
    if (process.platform === 'win32') {
      try {
        require('child_process').execSync(`taskkill /F /T /PID ${viteProc.pid}`, { stdio: 'ignore' });
      } catch (_) {
        viteProc.kill('SIGKILL');
      }
    } else {
      viteProc.kill('SIGKILL');
    }
  }
  process.exit(0);
}

runViteSmokeTest().catch(err => {
  console.error('🔴 VITE SMOKE TEST FAILED:', err);
  process.exit(1);
});
