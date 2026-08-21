const { execSync } = require('child_process');
const path = require('path');

function runAllTests() {
  console.log('================================================================');
  console.log('  RUNNING OMNISELLER STUDIO SUITE - 100% EXECUTABLE ASSERTIONS');
  console.log('================================================================\n');

  const testFiles = [
    'tests/spec_hash_vector.test.cjs',
    'tests/security_controls_unit.test.cjs',
    'tests/listing_scope_migration.test.cjs',
    'tests/sec_auth_foundation.test.cjs',
    'tests/route_registry_coverage.test.cjs',
    'tests/ssrf_url_guard.test.cjs',
    'tests/p0_route_security.test.cjs',
    'tests/test_real_child_asin_batcher.cjs',
    'tests/test_runtime_paths.cjs',
    'tests/test_etsy_truth_semantics.cjs',
    'tests/test_etsy_provenance_authority.cjs',
    'tests/test_etsy_scanner_evidence_ui.cjs',
    'tests/test_strict_keyword_sanitizer.cjs',
    'tests/test_full_cerebro_mkl_flow.cjs',
    'tests/test_white_screen_failsafe.cjs',
    'tests/test_listing_truth_boundary.cjs',
    'tests/test_malicious_model_outputs.cjs',
    'tests/test_adversarial_control_plane.cjs',
    'tests/test_p0_5_c_research_truth.cjs',
    'tests/test_ytrends_unknown_defaults.cjs',
    'tests/test_listing_ip_rescreen.cjs',
    'tests/spec_simulator_and_mkl_truth.test.cjs',
    'tests/spec_publish_gate_contracts.test.cjs',
    'tests/server_revision.test.cjs',
    'tests/vps_platform_scripts.test.cjs',
    'tests/test_opportunity_truth_boundary.cjs',
    'tests/test_truth_evidence_ownership.test.cjs',
    'tests/test_workflow_state_machine.test.cjs'
  ];

  let passedCount = 0;

  testFiles.forEach((file, idx) => {
    console.log(`[Test ${idx + 1}/${testFiles.length}] Executing ${file}...`);
    try {
      const output = execSync(`node ${file}`, {
        encoding: 'utf-8',
        cwd: path.resolve(__dirname, '..'),
        timeout: 180000,
        killSignal: 'SIGTERM'
      });
      console.log(output);
      console.log(`✅ ${file} PASSED CLEANLY!\n`);
      passedCount++;
    } catch (err) {
      const reason = err.code === 'ETIMEDOUT' ? 'TIMED OUT AFTER 180 SECONDS' : err.message;
      console.error(`🔴 ${file} FAILED:`, reason);
      process.exit(1);
    }
  });

  console.log('================================================================');
  console.log(`  🟢 100% SUITE PASSED: ${passedCount}/${testFiles.length} TEST FILES EXECUTED!`);
  console.log('================================================================');
}

runAllTests();
