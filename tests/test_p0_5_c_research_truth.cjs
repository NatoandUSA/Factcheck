/**
 * P0.5-C research-signal truth hardening.
 *
 * Required invariants:
 * - missing !== explicit zero;
 * - partial evidence never becomes a decision-grade numeric score through
 *   hidden heuristic defaults;
 * - Google Trends provider success with empty/short data is still
 *   INSUFFICIENT_EVIDENCE;
 * - provider failures are deterministic in tests and cannot emit GO /
 *   NICHE_DOWN / AVOID;
 * - a benchmark verdict is DERIVED_FROM_OBSERVED, not itself raw evidence.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { fetchGoogleTrends } = require('../server/googleTrendsService');
const { getMarketBenchmark } = require('../server/benchmarkService');
const { rankKeywords } = require('../server/keywordRanker');
const {
  toObservedNumber,
  monthlySearchVolumeFromViews24h,
  scoreKeywordEvidence
} = require('../server/researchTruth');

function trendPayload(values) {
  return JSON.stringify({
    default: {
      timelineData: values.map((value, index) => ({
        formattedAxisTime: `T${index + 1}`,
        value: [value]
      }))
    }
  });
}

function fakeTrendClient(values, { throwInterest = null } = {}) {
  return {
    async interestOverTime() {
      if (throwInterest) throw throwInterest;
      return trendPayload(values);
    },
    async relatedQueries() {
      return JSON.stringify({ default: { rankedList: [] } });
    }
  };
}

function observedGoogleResult(overrides = {}) {
  return {
    success: true,
    evidenceState: 'OBSERVED',
    momentumPercent: 20,
    isBreakout: false,
    relatedQueries: [],
    timeline: Array.from({ length: 8 }, (_, i) => ({ date: `T${i + 1}`, value: 20 + i })),
    ...overrides
  };
}

function googleFailureResult(state = 'SOURCE_ERROR') {
  return {
    success: false,
    evidenceState: state,
    reason: state === 'SOURCE_ERROR' ? 'provider failed' : 'not enough observations',
    data: null
  };
}

function amazonFetchWithSuggestions(values) {
  return async () => ({
    ok: true,
    async json() {
      return { suggestions: values.map(value => ({ value })) };
    }
  });
}

function amazonFetchFailure() {
  return async () => ({
    ok: false,
    async json() { return {}; }
  });
}

async function main() {
  console.log('================================================================');
  console.log('  TESTING P0.5-C RESEARCH SIGNAL TRUTH HARDENING');
  console.log('================================================================\n');

  // 1. Primitive observation semantics.
  assert.strictEqual(toObservedNumber(undefined), null);
  assert.strictEqual(toObservedNumber(null), null);
  assert.strictEqual(toObservedNumber(''), null);
  assert.strictEqual(toObservedNumber('not-a-number'), null);
  assert.strictEqual(toObservedNumber(0), 0);
  assert.strictEqual(toObservedNumber('0'), 0);
  assert.strictEqual(monthlySearchVolumeFromViews24h(null), null);
  assert.strictEqual(monthlySearchVolumeFromViews24h(undefined), null);
  assert.strictEqual(monthlySearchVolumeFromViews24h(0), 0, 'Explicit views24h=0 must stay observed zero');
  assert.strictEqual(monthlySearchVolumeFromViews24h('0'), 0, 'String zero must stay observed zero');
  assert.strictEqual(monthlySearchVolumeFromViews24h(5), 150);
  console.log('🟢 Missing numeric evidence stays null while explicit zero stays zero.');

  // 2. Generic upload scorer: no missing competition/title-density defaults.
  const noGenericEvidence = scoreKeywordEvidence({});
  assert.strictEqual(noGenericEvidence.opportunityScore, null);
  assert.strictEqual(noGenericEvidence.scoringState, 'INSUFFICIENT_EVIDENCE');

  const missingCompetition = scoreKeywordEvidence({ searchVolume: 1000, titleDensity: 3 });
  assert.strictEqual(missingCompetition.opportunityScore, null, 'Missing competition must not be treated as 0');
  assert.strictEqual(missingCompetition.scoringState, 'INSUFFICIENT_EVIDENCE');

  const missingDensity = scoreKeywordEvidence({ searchVolume: 1000, competingProducts: 50 });
  assert.strictEqual(missingDensity.opportunityScore, null, 'Missing title density must not use a synthetic factor');
  assert.strictEqual(missingDensity.scoringState, 'INSUFFICIENT_EVIDENCE');

  const explicitZeroFormula = scoreKeywordEvidence({ searchVolume: 0, competingProducts: 0, titleDensity: 0 });
  assert.strictEqual(explicitZeroFormula.opportunityScore, 0);
  assert.strictEqual(explicitZeroFormula.scoringState, 'SCORED');
  assert.strictEqual(explicitZeroFormula.scoreSource, 'DERIVED_FROM_OBSERVED_INPUTS');

  const observedIqZero = scoreKeywordEvidence({ rawIq: 0 });
  assert.strictEqual(observedIqZero.opportunityScore, 0);
  assert.strictEqual(observedIqZero.scoreSource, 'OBSERVED_IQ');
  console.log('🟢 Generic keyword scoring requires complete formula evidence and preserves observed zero.');

  // 3. keywordRanker: hidden 100/10/8 values may sort internally but may not
  // leak into score/opportunityScore.
  const noMetrics = rankKeywords([{ keyword: 'gift necklace for mom' }], 'Jewelry', 'gift necklace');
  assert.strictEqual(noMetrics[0].searchVolume, null);
  assert.strictEqual(noMetrics[0].score, null);
  assert.strictEqual(noMetrics[0].opportunityScore, null);
  assert.strictEqual(noMetrics[0].scoringState, 'INSUFFICIENT_EVIDENCE');
  assert.strictEqual(noMetrics[0]._sortScore, undefined, 'Internal sort heuristic must not escape the ranker');

  for (const partial of [
    { keyword: 'gift necklace for mom', searchVolume: 5000 },
    { keyword: 'gift necklace for mom', searchVolume: 5000, titleDensity: 3 },
    { keyword: 'gift necklace for mom', searchVolume: 5000, cpr: 12 },
    { keyword: 'gift necklace for mom', titleDensity: 3, cpr: 12 }
  ]) {
    const ranked = rankKeywords([partial], 'Jewelry', 'gift necklace');
    assert.strictEqual(ranked[0].opportunityScore, null, 'Partial rank metrics must not produce opportunityScore');
    assert.strictEqual(ranked[0].score, null, 'Partial rank metrics must not expose heuristic score');
    assert.strictEqual(ranked[0].scoringState, 'INSUFFICIENT_EVIDENCE');
  }

  const fullRankEvidence = rankKeywords([
    { keyword: 'gift necklace for mom', searchVolume: 5000, titleDensity: 3, cpr: 12, competingProducts: 120 }
  ], 'Jewelry', 'gift necklace');
  assert.strictEqual(fullRankEvidence[0].searchVolume, 5000);
  assert.ok(Number.isFinite(fullRankEvidence[0].opportunityScore));
  assert.ok(Number.isFinite(fullRankEvidence[0].score));
  assert.strictEqual(fullRankEvidence[0].scoringState, 'SCORED');
  console.log('🟢 keywordRanker never exposes a score built from partial hidden-default metrics.');

  // 4. server.js must call the shared truth helpers rather than retain the
  // old truthiness/default formula patterns. This locks wiring, while helper
  // behavior above is tested as executable logic.
  const serverSrc = fs.readFileSync(path.resolve(__dirname, '../server/server.js'), 'utf8');
  assert.ok(serverSrc.includes("require('./researchTruth')"), 'server.js must use the shared research truth helper');
  assert.ok(serverSrc.includes('monthlySearchVolumeFromViews24h(kw.views24h)'), 'HTML ingestion must preserve explicit zero through the helper');
  assert.ok(serverSrc.includes('scoreKeywordEvidence({'), 'Generic scoring must use complete-evidence helper');
  assert.ok(!serverSrc.includes('Math.sqrt((competingProducts || 0) + 10)'), 'Missing competition must not default to zero');
  assert.ok(!serverSrc.includes("? (titleDensity + 1) : 4"), 'Missing title density must not use a synthetic factor');
  assert.ok(!serverSrc.includes('kwItem.opportunityScore ?? kwItem.score ?? null'), 'Master Keyword must not revive legacy heuristic score fallback');
  console.log('🟢 server.js wiring no longer contains missing→default scoring paths.');

  // 5. Google Trends deterministic failure/insufficient matrix.
  const providerError = await fetchGoogleTrends('seed', fakeTrendClient([], { throwInterest: new Error('provider down') }));
  assert.strictEqual(providerError.success, false);
  assert.strictEqual(providerError.evidenceState, 'SOURCE_ERROR');
  assert.strictEqual(providerError.timeline, undefined);
  assert.strictEqual(providerError.momentumPercent, undefined);

  const emptyTimeline = await fetchGoogleTrends('seed', fakeTrendClient([]));
  assert.strictEqual(emptyTimeline.success, false);
  assert.strictEqual(emptyTimeline.evidenceState, 'INSUFFICIENT_EVIDENCE');
  assert.strictEqual(emptyTimeline.reason, 'GOOGLE_TRENDS_EMPTY_TIMELINE');
  assert.strictEqual(emptyTimeline.currentScore, undefined);
  assert.strictEqual(emptyTimeline.peakScore, undefined);
  assert.strictEqual(emptyTimeline.momentumPercent, undefined);

  const shortTimeline = await fetchGoogleTrends('seed', fakeTrendClient([10, 11, 12, 13, 14, 15, 16]));
  assert.strictEqual(shortTimeline.success, false);
  assert.strictEqual(shortTimeline.evidenceState, 'INSUFFICIENT_EVIDENCE');
  assert.strictEqual(shortTimeline.reason, 'GOOGLE_TRENDS_INSUFFICIENT_TIMELINE');
  assert.strictEqual(shortTimeline.observedPoints, 7);
  assert.strictEqual(shortTimeline.momentumPercent, undefined);

  const observedTimeline = await fetchGoogleTrends('seed', fakeTrendClient([10, 12, 14, 16, 18, 20, 22, 24]));
  assert.strictEqual(observedTimeline.success, true);
  assert.strictEqual(observedTimeline.evidenceState, 'OBSERVED');
  assert.strictEqual(observedTimeline.currentScore, 24);
  assert.strictEqual(observedTimeline.peakScore, 24, 'Peak must be the observed maximum, not a hardcoded 100');
  assert.ok(Number.isFinite(observedTimeline.momentumPercent));
  console.log('🟢 Google Trends provider error, empty, short, and sufficient timelines are truth-distinct.');

  // 6. Deterministic benchmark provider matrix.
  const googleSuccess = async () => observedGoogleResult();
  const amazonSuccess = amazonFetchWithSuggestions(['seed one', 'seed two', 'seed three']);

  const amazonOnlyFailure = await getMarketBenchmark(
    { seed: 'test seed phrase', category: 'Jewelry' },
    { fetchGoogleTrends: googleSuccess, fetch: amazonFetchFailure() }
  );
  assert.strictEqual(amazonOnlyFailure.evidenceState, 'INSUFFICIENT_EVIDENCE');
  assert.strictEqual(amazonOnlyFailure.opportunityScore, null);
  assert.ok(!['GO', 'NICHE_DOWN', 'AVOID'].includes(amazonOnlyFailure.verdict));
  assert.strictEqual(amazonOnlyFailure.sourceEvidence.googleTrends, 'OBSERVED');
  assert.strictEqual(amazonOnlyFailure.sourceEvidence.amazonLiveSuggestions, 'SOURCE_ERROR');

  const googleOnlyFailure = await getMarketBenchmark(
    { seed: 'test seed phrase', category: 'Jewelry' },
    { fetchGoogleTrends: async () => googleFailureResult('SOURCE_ERROR'), fetch: amazonSuccess }
  );
  assert.strictEqual(googleOnlyFailure.evidenceState, 'INSUFFICIENT_EVIDENCE');
  assert.strictEqual(googleOnlyFailure.opportunityScore, null);
  assert.ok(!['GO', 'NICHE_DOWN', 'AVOID'].includes(googleOnlyFailure.verdict));
  assert.strictEqual(googleOnlyFailure.sourceEvidence.googleTrends, 'SOURCE_ERROR');
  assert.strictEqual(googleOnlyFailure.sourceEvidence.amazonLiveSuggestions, 'OBSERVED');

  const googleInsufficient = await getMarketBenchmark(
    { seed: 'test seed phrase', category: 'Jewelry' },
    { fetchGoogleTrends: async () => googleFailureResult('INSUFFICIENT_EVIDENCE'), fetch: amazonSuccess }
  );
  assert.strictEqual(googleInsufficient.evidenceState, 'INSUFFICIENT_EVIDENCE');
  assert.strictEqual(googleInsufficient.sourceEvidence.googleTrends, 'INSUFFICIENT_EVIDENCE');

  const fullyObserved = await getMarketBenchmark(
    { seed: 'test seed phrase', category: 'Jewelry' },
    { fetchGoogleTrends: googleSuccess, fetch: amazonSuccess }
  );
  assert.strictEqual(fullyObserved.evidenceState, 'DERIVED_FROM_OBSERVED');
  assert.strictEqual(fullyObserved.decisionBasis, 'DERIVED_FROM_OBSERVED_SOURCES');
  assert.strictEqual(fullyObserved.sourceEvidence.googleTrends, 'OBSERVED');
  assert.strictEqual(fullyObserved.sourceEvidence.amazonLiveSuggestions, 'OBSERVED');
  assert.ok(Number.isFinite(fullyObserved.opportunityScore));
  assert.ok(['GO', 'NICHE_DOWN', 'AVOID'].includes(fullyObserved.verdict));
  assert.strictEqual(fullyObserved.sources.pinterestGiftIntent, undefined);
  console.log('🟢 Benchmark provider matrix is deterministic and derived verdict provenance is explicit.');

  // Legacy source-string guards remain useful as a secondary tripwire.
  const gtSrc = fs.readFileSync(path.resolve(__dirname, '../server/googleTrendsService.js'), 'utf8');
  const benchSrc = fs.readFileSync(path.resolve(__dirname, '../server/benchmarkService.js'), 'utf8');
  assert.ok(!gtSrc.includes('momentumPercent: 28'));
  assert.ok(!gtSrc.includes("geo: 'US (Reference Estimate)'"));
  assert.ok(!gtSrc.includes('Generating algorithmic simulation model'));
  assert.ok(!benchSrc.includes('collar de plata'));
  assert.ok(!benchSrc.includes('etsyIntentScore'));
  assert.ok(!benchSrc.includes('pinterestGiftIntent'));
  assert.ok(!benchSrc.includes('growth || 15'));

  console.log('\n================================================================');
  console.log('  🟢 P0.5-C RESEARCH SIGNAL TRUTH HARDENING SUITE PASSED');
  console.log('================================================================');
}

main().catch(err => {
  console.error('🔴 P0.5-C RESEARCH TRUTH TEST FAILED:', err.stack || err.message);
  process.exit(1);
});
