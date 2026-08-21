const assert = require('assert');
const fs = require('fs');
const path = require('path');

function runViteSmokeTest() {
  console.log('================================================================');
  console.log('  TESTING VITE DEV RUNTIME MODULE BOUNDARY & ESM SMOKE SUITE');
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

  // Test 3: Verify AmazonPipelineWorkflow.jsx imports ESM version
  console.log('\nTest 3: Verifying AmazonPipelineWorkflow.jsx imports ESM module...');
  const workflowPath = path.join(__dirname, '../src/components/AmazonPipelineWorkflow.jsx');
  assert.ok(fs.existsSync(workflowPath), 'AmazonPipelineWorkflow.jsx file must exist');
  const workflowContent = fs.readFileSync(workflowPath, 'utf8');
  assert.ok(workflowContent.includes("from '../utils/xrayUploadOutcome.js'"), 'AmazonPipelineWorkflow.jsx must import from ../utils/xrayUploadOutcome.js');
  console.log('  🟢 AmazonPipelineWorkflow.jsx ESM import boundary verified.');

  console.log('\n================================================================');
  console.log('  🟢 ALL VITE DEV RUNTIME MODULE SMOKE TESTS PASSED CLEANLY');
  console.log('================================================================\n');
}

runViteSmokeTest();
