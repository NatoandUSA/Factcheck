/**
 * OPPORTUNITY SCORER TRUTH BOUNDARY TEST SUITE
 * Verifies that calculateOpportunityScore returns overallScore: null and verdict: 'UNSCORED'
 * when observed market data is absent, preventing fabricated decision data.
 */

const assert = require('assert');
const { calculateOpportunityScore } = require('../server/opportunityScorer');

function runScorerTruthTests() {
  console.log('================================================================');
  console.log('  TESTING OPPORTUNITY SCORER TRUTH BOUNDARY & PROVENANCE');
  console.log('================================================================\n');

  // Test 1: Empty input returns UNSCORED & overallScore: null
  console.log('Test 1: Empty input evaluation...');
  const emptyRes = calculateOpportunityScore({});
  assert.strictEqual(emptyRes.overallScore, null, 'overallScore must be null when market evidence is absent');
  assert.strictEqual(emptyRes.verdict, 'UNSCORED', 'verdict must be UNSCORED when market evidence is absent');
  assert.strictEqual(emptyRes.provenance.status, 'INSUFFICIENT_MARKET_EVIDENCE');
  console.log('  🟢 Empty input UNSCORED test PASSED.');

  // Test 2: Category preset title alone without market metrics returns UNSCORED
  console.log('\nTest 2: Title-only input without search volume/competitors...');
  const titleOnlyRes = calculateOpportunityScore({
    categoryName: 'Jewelry',
    etsyTitle: 'Personalized Gold Custom Necklace Engraved Gift'
  });
  assert.strictEqual(titleOnlyRes.overallScore, null, 'overallScore must be null without real market numbers');
  assert.strictEqual(titleOnlyRes.verdict, 'UNSCORED', 'verdict must be UNSCORED without real market numbers');
  console.log('  🟢 Title-only input UNSCORED test PASSED.');

  // Test 3: Input with observed market data scores properly
  console.log('\nTest 3: Input with real observed search volume & competitor count...');
  const observedRes = calculateOpportunityScore({
    searchVolume: 8500,
    competitorCount: 150,
    etsyTitle: 'Handmade Custom Embroidered Personalized Blanket'
  });
  assert.strictEqual(typeof observedRes.overallScore, 'number', 'overallScore must be a number when real market data is present');
  assert.ok(['GO', 'CONDITIONAL', 'WATCH', 'SKIP'].includes(observedRes.verdict), 'verdict must be calculated from observed score');
  assert.strictEqual(observedRes.provenance.status, 'OBSERVED_EVIDENCE_SCORED');
  console.log('  🟢 Observed market input scored test PASSED.');

  console.log('\n================================================================');
  console.log('  🟢 ALL OPPORTUNITY SCORER TRUTH BOUNDARY TESTS PASSED CLEANLY');
  console.log('================================================================');
}

runScorerTruthTests();
