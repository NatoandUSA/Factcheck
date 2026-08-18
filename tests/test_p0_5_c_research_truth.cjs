/**
 * P0.5-C: research-signal truth. Missing/unavailable evidence must stay
 * UNKNOWN/SOURCE_ERROR/INSUFFICIENT_EVIDENCE -- never a plausible-looking
 * default that Staff could mistake for a real, measured signal.
 *
 * fetchGoogleTrends and the Amazon suggestions fetch inside getMarketBenchmark
 * both make real outbound network calls with no existing dependency-injection
 * seam (unlike the LLM calls elsewhere in this suite). Rather than skip
 * coverage, this file checks invariants that must hold true REGARDLESS of
 * whether the live call actually succeeds or fails in this environment --
 * the same pattern already used for the SSRF url guard's positive-path test.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { fetchGoogleTrends } = require('../server/googleTrendsService');
const { getMarketBenchmark } = require('../server/benchmarkService');
const { rankKeywords } = require('../server/keywordRanker');

async function main() {
  console.log('================================================================');
  console.log('  TESTING P0.5-C RESEARCH SIGNAL TRUTH (NO FABRICATED DEFAULTS)');
  console.log('================================================================\n');

  // --- 1. keywordRanker.rankKeywords: missing metrics stay null, explicit
  // zero is preserved, and opportunityScore/scoringState reflect whether
  // real evidence actually exists (pure logic, no network) ---
  const noMetrics = rankKeywords([{ keyword: 'gift necklace for mom' }], 'Jewelry', 'gift necklace');
  assert.strictEqual(noMetrics[0].searchVolume, null, 'Missing searchVolume must stay null, not default to 100');
  assert.strictEqual(noMetrics[0].opportunityScore, null, 'No real volume evidence must not produce a fabricated opportunityScore');
  assert.strictEqual(noMetrics[0].scoringState, 'INSUFFICIENT_EVIDENCE');
  console.log('🟢 rankKeywords: missing metrics stay null/INSUFFICIENT_EVIDENCE, no 100/10/8 defaults leak into output.');

  const explicitZero = rankKeywords([{ keyword: 'gift necklace for mom', searchVolume: 0, competingProducts: 0 }], 'Jewelry', 'gift necklace');
  assert.strictEqual(explicitZero[0].searchVolume, 0, 'An explicit source zero must be preserved as 0, not treated as missing');
  assert.strictEqual(explicitZero[0].competingProducts, 0);
  console.log('🟢 rankKeywords: explicit source zero is preserved as a real observation, not converted to null or a default.');

  const realMetrics = rankKeywords([{ keyword: 'gift necklace for mom', searchVolume: 5000, competingProducts: 120, titleDensity: 3, cpr: 12 }], 'Jewelry', 'gift necklace');
  assert.strictEqual(realMetrics[0].searchVolume, 5000);
  assert.strictEqual(realMetrics[0].opportunityScore !== null, true, 'Real volume evidence must produce a real computed score');
  assert.strictEqual(realMetrics[0].scoringState, 'SCORED');
  console.log('🟢 rankKeywords: real metrics produce a real SCORED opportunityScore (positive case).');

  // --- 2. server.js HTML ingestion: no 1200/350/2 fabricated defaults remain ---
  const serverSrc = fs.readFileSync(path.resolve(__dirname, '../server/server.js'), 'utf8');
  assert.ok(!serverSrc.includes("'Search Volume': kw.views24h ? kw.views24h * 30 : 1200"), 'HTML ingestion must not default Search Volume to 1200');
  assert.ok(!serverSrc.includes("'Competing Products': kw.listings || 350"), 'HTML ingestion must not default Competing Products to 350');
  assert.ok(!serverSrc.includes("'Title Density': 2"), 'HTML ingestion must not hardcode Title Density to 2');
  assert.ok(!serverSrc.includes('opportunityScore = 50;'), 'Generic keyword evaluation must not default opportunityScore to 50');
  console.log('🟢 server.js HTML/generic keyword ingestion no longer fabricates missing metrics.');

  // --- 3. googleTrendsService.js: no synthetic simulation fallback remains ---
  const gtSrc = fs.readFileSync(path.resolve(__dirname, '../server/googleTrendsService.js'), 'utf8');
  assert.ok(!gtSrc.includes('momentumPercent: 28'), 'Provider failure must not return a fabricated momentum value');
  assert.ok(!gtSrc.includes("geo: 'US (Reference Estimate)'"), 'Provider failure must not present a simulated timeline as real geography data');
  assert.ok(!gtSrc.includes('Generating algorithmic simulation model'), 'Provider failure must not generate a simulated timeline at all');
  console.log('🟢 googleTrendsService.js no longer fabricates a synthetic timeline/momentum on provider failure.');

  // --- 4. benchmarkService.js: no fabricated Amazon suggestions, no default
  // growth/intent, no fake third "Pinterest" source ---
  const benchSrc = fs.readFileSync(path.resolve(__dirname, '../server/benchmarkService.js'), 'utf8');
  assert.ok(!benchSrc.includes('collar de plata'), 'Benchmark must not fabricate Amazon suggestion strings when the live fetch is empty');
  assert.ok(!benchSrc.includes('etsyIntentScore'), 'Unused fabricated etsyIntentScore must be removed');
  assert.ok(!benchSrc.includes('pinterestGiftIntent'), 'Benchmark must not present a non-existent Pinterest source as real evidence');
  assert.ok(!benchSrc.includes('growth || 15'), 'Missing Google Trends growth must not default to 15');
  console.log('🟢 benchmarkService.js no longer fabricates Amazon suggestions, default growth, or a fake third source.');

  // --- 5. Live behavioral check: fetchGoogleTrends must return a
  // well-formed OBSERVED result on success, or a clean SOURCE_ERROR with NO
  // timeline/momentum/relatedQueries on failure -- whichever actually
  // happens in this environment, it must never be a hybrid of the two ---
  const gtResult = await fetchGoogleTrends('test seed phrase');
  if (gtResult.success) {
    assert.strictEqual(gtResult.evidenceState, 'OBSERVED');
    assert.ok(Array.isArray(gtResult.timeline), 'A successful result must include a real timeline');
    console.log('🟢 fetchGoogleTrends: live call succeeded, returned as OBSERVED with a real timeline.');
  } else {
    assert.strictEqual(gtResult.evidenceState, 'SOURCE_ERROR');
    assert.strictEqual(gtResult.timeline, undefined, 'A failed result must not include a fabricated timeline');
    assert.strictEqual(gtResult.momentumPercent, undefined, 'A failed result must not include a fabricated momentum value');
    assert.strictEqual(gtResult.relatedQueries, undefined, 'A failed result must not include fabricated related queries');
    console.log('🟢 fetchGoogleTrends: live call failed, returned as clean SOURCE_ERROR with no fabricated fields (no network in this environment, or provider unreachable).');
  }

  // --- 6. Live behavioral check: getMarketBenchmark must never emit a
  // decision-grade GO/NICHE_DOWN/AVOID verdict when required evidence is
  // unavailable, regardless of which source actually failed ---
  const benchResult = await getMarketBenchmark({ seed: 'test seed phrase benchmark', category: 'Jewelry' });
  if (benchResult.evidenceState === 'INSUFFICIENT_EVIDENCE') {
    assert.strictEqual(benchResult.opportunityScore, null, 'Insufficient evidence must not carry a numeric score');
    assert.ok(!['GO', 'NICHE_DOWN', 'AVOID'].includes(benchResult.verdict), 'Insufficient evidence must not produce a decision-grade verdict');
    console.log('🟢 getMarketBenchmark: a source was unavailable, correctly returned INSUFFICIENT_EVIDENCE with no decision-grade verdict.');
  } else {
    assert.strictEqual(benchResult.evidenceState, 'OBSERVED');
    assert.ok(['GO', 'NICHE_DOWN', 'AVOID'].includes(benchResult.verdict), 'A fully-observed benchmark must produce a real verdict');
    assert.strictEqual(benchResult.sources.pinterestGiftIntent, undefined, 'The fake third source must not reappear');
    console.log('🟢 getMarketBenchmark: both sources were available, produced a real decision-grade verdict with no fake third source.');
  }

  console.log('\n================================================================');
  console.log('  🟢 P0.5-C RESEARCH SIGNAL TRUTH SUITE PASSED');
  console.log('================================================================');
}

main().catch(err => {
  console.error('🔴 P0.5-C RESEARCH TRUTH TEST FAILED:', err.message);
  process.exit(1);
});
