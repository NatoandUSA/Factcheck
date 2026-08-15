const { execSync } = require('child_process');
const path = require('path');

function runAllTests() {
  console.log('================================================================');
  console.log('  RUNNING OMNISELLER STUDIO SUITE - 100% EXECUTABLE ASSERTIONS');
  console.log('================================================================\n');

  const testFiles = [
    'scratch/test_real_child_asin_batcher.cjs',
    'scratch/test_strict_keyword_sanitizer.cjs',
    'scratch/test_full_cerebro_mkl_flow.cjs',
    'scratch/test_white_screen_failsafe.cjs'
  ];

  let passedCount = 0;

  testFiles.forEach((file, idx) => {
    console.log(`[Test ${idx + 1}/${testFiles.length}] Executing ${file}...`);
    try {
      const output = execSync(`node ${file}`, { encoding: 'utf-8', cwd: path.resolve(__dirname, '..') });
      console.log(output);
      console.log(`✅ ${file} PASSED CLEANLY!\n`);
      passedCount++;
    } catch (err) {
      console.error(`🔴 ${file} FAILED WITH EXIT CODE 1:`, err.message);
      process.exit(1);
    }
  });

  console.log('================================================================');
  console.log(`  🟢 100% SUITE PASSED: ${passedCount}/${testFiles.length} TEST FILES EXECUTED!`);
  console.log('================================================================');
}

runAllTests();
