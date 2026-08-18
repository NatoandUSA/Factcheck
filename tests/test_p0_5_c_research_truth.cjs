/**
 * P0.5-C research-signal truth hardening.
 *
 * Locks the nine remaining gaps identified in PR #13:
 * 1) explicit zero through YTrends HTML ingestion;
 * 2) generic partial-metric scoring;
 * 3) keywordRanker partial-metric scoring;
 * 4) Google Trends empty timeline;
 * 5) Google Trends short timeline;
 * 6) deterministic provider-failure/provenance matrix;
 * 7) Google Trends relatedQueries sub-source provenance;
 * 8) Staff-facing measurement-window labels (real-time/30d/90D claims);
 * 9) benchmarkService propagating relatedQueries provenance (no false zero).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { fetchGoogleTrends } = require('../server/googleTrendsService');
const { getMarketBenchmark } = require('../server/benchmarkService');
const { rankKeywords } = require('../server/keywordRanker');
const { parseYTrendsHtml } = require('../server/ytrendsParser');
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

function fakeTrendClient(values, { throwInterest = null, relatedQueriesBehavior = 'empty' } = {}) {
  return {
    async interestOverTime() {
      if (throwInterest) throw throwInterest;
      return trendPayload(values);
    },
    async relatedQueries() {
      if (relatedQueriesBehavior === 'throw') throw new Error('related queries provider down');
      if (relatedQueriesBehavior === 'malformed') return '{not valid json';
      if (relatedQueriesBehavior === 'nonempty') {
        return JSON.stringify({
          default: {
            rankedList: [
              { rankedKeyword: [{ query: 'rising related term', value: 120 }] },
              { rankedKeyword: [{ query: 'top related term', value: 88 }] }
            ]
          }
        });
      }
      // 'empty' (default): a valid provider response with no usable ranked queries.
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

  // GAP 1: missing !== explicit zero, including the existing server upload
  // adapter's truthiness check. Parser keeps observed integers as normalized
  // numeric text so source "0" survives that adapter and becomes numeric 0.
  assert.strictEqual(toObservedNumber(undefined), null);
  assert.strictEqual(toObservedNumber(null), null);
  assert.strictEqual(toObservedNumber(''), null);
  assert.strictEqual(toObservedNumber('not-a-number'), null);
  assert.strictEqual(toObservedNumber(0), 0);
  assert.strictEqual(toObservedNumber('0'), 0);
  // Number('   ') coerces to 0 in JavaScript -- a whitespace-only source
  // cell must stay null (missing), not become a fabricated observed zero.
  assert.strictEqual(toObservedNumber('   '), null, 'Whitespace-only string must stay null, not become observed zero');
  assert.strictEqual(toObservedNumber('\t'), null);
  assert.strictEqual(toObservedNumber('\n'), null);
  assert.strictEqual(toObservedNumber(' 5 '), 5, 'A padded real number must still be preserved');
  assert.strictEqual(monthlySearchVolumeFromViews24h(null), null);
  assert.strictEqual(monthlySearchVolumeFromViews24h('0'), 0);

  const zeroHtml = `
    <table><tbody><tr>
      <td>1</td><td><a>embroidered nurse sweatshirt</a></td><td>0</td>
      <td>0</td><td>0</td><td>0</td><td>0</td><td>0%</td><td></td><td></td><td></td>
    </tr></tbody></table>`;
  const parsedZero = parseYTrendsHtml(zeroHtml)[0];
  assert.ok(parsedZero, 'YTrends zero row must parse');
  assert.strictEqual(parsedZero.views24h, '0', 'Source zero must remain an observed value, not missing');
  assert.strictEqual(parsedZero.listings, '0');
  const uploadAdapterMonthlyVolume = parsedZero.views24h ? parsedZero.views24h * 30 : null;
  assert.strictEqual(uploadAdapterMonthlyVolume, 0, 'Explicit zero must survive current HTML upload adapter');
  console.log('🟢 GAP 1: YTrends HTML explicit zero survives ingestion as observed zero.');

  // GAP 2: generic upload scorer requires every input used by the formula.
  for (const [label, input] of [
    ['no evidence', {}],
    ['missing competition', { searchVolume: 1000, titleDensity: 3 }],
    ['missing title density', { searchVolume: 1000, competingProducts: 50 }],
    ['missing volume', { competingProducts: 50, titleDensity: 3 }]
  ]) {
    const result = scoreKeywordEvidence(input);
    assert.strictEqual(result.opportunityScore, null, `${label} must not score`);
    assert.strictEqual(result.scoringState, 'INSUFFICIENT_EVIDENCE');
  }
  const explicitZeroFormula = scoreKeywordEvidence({ searchVolume: 0, competingProducts: 0, titleDensity: 0 });
  assert.strictEqual(explicitZeroFormula.opportunityScore, 0);
  assert.strictEqual(explicitZeroFormula.scoringState, 'SCORED');
  assert.strictEqual(explicitZeroFormula.scoreSource, 'DERIVED_FROM_OBSERVED_INPUTS');
  const observedIqZero = scoreKeywordEvidence({ rawIq: 0 });
  assert.strictEqual(observedIqZero.opportunityScore, 0);
  assert.strictEqual(observedIqZero.scoreSource, 'OBSERVED_IQ');
  console.log('🟢 GAP 2: generic scoring rejects partial evidence and preserves observed zero.');

  // GAP 3: ranker may use private defaults for ordering only. It must not
  // expose score/opportunityScore unless the complete metric set is observed,
  // and must overwrite an upstream fabricated score on partial evidence.
  const noMetrics = rankKeywords([{ keyword: 'gift necklace for mom' }], 'Jewelry', 'gift necklace');
  assert.strictEqual(noMetrics[0].searchVolume, null);
  assert.strictEqual(noMetrics[0].score, null);
  assert.strictEqual(noMetrics[0].opportunityScore, null);
  assert.strictEqual(noMetrics[0].scoringState, 'INSUFFICIENT_EVIDENCE');
  assert.strictEqual(noMetrics[0]._sortScore, undefined);

  for (const partial of [
    { keyword: 'gift necklace for mom', searchVolume: 5000 },
    { keyword: 'gift necklace for mom', searchVolume: 5000, titleDensity: 3 },
    { keyword: 'gift necklace for mom', searchVolume: 5000, cpr: 12 },
    { keyword: 'gift necklace for mom', titleDensity: 3, cpr: 12 },
    { keyword: 'gift necklace for mom', searchVolume: 5000, titleDensity: 3, cpr: 12 },
    {
      keyword: 'gift necklace for mom',
      searchVolume: 5000,
      titleDensity: 3,
      cpr: 12,
      competingProducts: null,
      opportunityScore: 999999,
      scoringState: 'SCORED'
    }
  ]) {
    const ranked = rankKeywords([partial], 'Jewelry', 'gift necklace');
    assert.strictEqual(ranked[0].opportunityScore, null, 'Partial rank metrics must not produce opportunityScore');
    assert.strictEqual(ranked[0].score, null, 'Partial rank metrics must not expose heuristic/upstream score');
    assert.strictEqual(ranked[0].scoringState, 'INSUFFICIENT_EVIDENCE');
  }

  const fullRankEvidence = rankKeywords([
    { keyword: 'gift necklace for mom', searchVolume: 5000, titleDensity: 3, cpr: 12, competingProducts: 120 }
  ], 'Jewelry', 'gift necklace');
  assert.ok(Number.isFinite(fullRankEvidence[0].opportunityScore));
  assert.ok(Number.isFinite(fullRankEvidence[0].score));
  assert.strictEqual(fullRankEvidence[0].scoringState, 'SCORED');
  console.log('🟢 GAP 3: keywordRanker cannot promote partial/defaulted evidence to SCORED.');

  // GAP 4 + 5: Google Trends provider success is not usable evidence if the
  // returned timeline is empty or too short for the advertised 4-vs-4 metric.
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
  console.log('🟢 GAP 4: empty Google Trends timeline is INSUFFICIENT_EVIDENCE.');

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
  assert.strictEqual(observedTimeline.peakScore, 24, 'Peak must be observed max, not hardcoded 100');
  assert.ok(Number.isFinite(observedTimeline.momentumPercent));
  console.log('🟢 GAP 5: short timeline cannot masquerade as stable observed demand.');

  // GAP 6: deterministic provider matrix and provenance. No live network is
  // needed to exercise Google-only failure, Amazon-only failure, Google
  // insufficient evidence, and fully observed success.
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
  console.log('🟢 GAP 6: provider failure matrix is deterministic and verdict provenance is explicit.');

  // GAP 9: benchmarkService must propagate relatedQueries sub-source
  // provenance rather than presenting an unavailable/failed related-query
  // fetch as a confirmed "0 breakout keywords" fact.
  const benchRelatedUnavailable = await getMarketBenchmark(
    { seed: 'test seed phrase', category: 'Jewelry' },
    { fetchGoogleTrends: async () => observedGoogleResult({ relatedQueriesEvidenceState: 'SOURCE_ERROR' }), fetch: amazonSuccess }
  );
  assert.strictEqual(benchRelatedUnavailable.sources.googleTrends.relatedQueriesEvidenceState, 'SOURCE_ERROR');
  assert.strictEqual(benchRelatedUnavailable.sources.googleTrends.breakoutCount, null, 'Unavailable related-query evidence must not present as a factual 0');

  const benchRelatedInsufficientEvidence = await getMarketBenchmark(
    { seed: 'test seed phrase', category: 'Jewelry' },
    { fetchGoogleTrends: async () => observedGoogleResult({ relatedQueriesEvidenceState: 'INSUFFICIENT_EVIDENCE' }), fetch: amazonFetchFailure() }
  );
  assert.strictEqual(benchRelatedInsufficientEvidence.sources.googleTrends.breakoutCount, null, 'Insufficient related-query evidence must not present as a factual 0 even on the INSUFFICIENT_EVIDENCE benchmark branch');

  const benchRelatedObserved = await getMarketBenchmark(
    { seed: 'test seed phrase', category: 'Jewelry' },
    {
      fetchGoogleTrends: async () => observedGoogleResult({
        relatedQueriesEvidenceState: 'OBSERVED',
        relatedQueries: [{ query: 'a', value: '1', type: 'TOP' }, { query: 'b', value: '2', type: 'RISING' }]
      }),
      fetch: amazonSuccess
    }
  );
  assert.strictEqual(benchRelatedObserved.sources.googleTrends.relatedQueriesEvidenceState, 'OBSERVED');
  assert.strictEqual(benchRelatedObserved.sources.googleTrends.breakoutCount, 2, 'Real observed related queries must still be counted');
  console.log('🟢 GAP 9: benchmark propagates relatedQueries sub-source provenance instead of a false zero breakout count.');

  // GAP 7: relatedQueries is a separate sub-source with its own field-level
  // provenance. A throw/malformed related-query response must not collapse
  // into the same [] shape as a genuinely empty result, and neither must
  // downgrade the already-confirmed OBSERVED timeline.
  const relatedThrow = await fetchGoogleTrends('seed', fakeTrendClient([10, 12, 14, 16, 18, 20, 22, 24], { relatedQueriesBehavior: 'throw' }));
  assert.strictEqual(relatedThrow.success, true, 'A related-query failure must not downgrade a valid timeline');
  assert.strictEqual(relatedThrow.evidenceState, 'OBSERVED');
  assert.strictEqual(relatedThrow.currentScore, 24);
  assert.strictEqual(relatedThrow.relatedQueriesEvidenceState, 'SOURCE_ERROR');
  assert.deepStrictEqual(relatedThrow.relatedQueries, []);
  assert.ok(relatedThrow.relatedQueriesReason, 'A related-query provider failure must carry a visible reason');

  const relatedMalformed = await fetchGoogleTrends('seed', fakeTrendClient([10, 12, 14, 16, 18, 20, 22, 24], { relatedQueriesBehavior: 'malformed' }));
  assert.strictEqual(relatedMalformed.evidenceState, 'OBSERVED');
  assert.strictEqual(relatedMalformed.relatedQueriesEvidenceState, 'SOURCE_ERROR', 'Malformed related-query JSON must be visible, not silently empty');

  const relatedEmpty = await fetchGoogleTrends('seed', fakeTrendClient([10, 12, 14, 16, 18, 20, 22, 24], { relatedQueriesBehavior: 'empty' }));
  assert.strictEqual(relatedEmpty.evidenceState, 'OBSERVED');
  assert.strictEqual(relatedEmpty.relatedQueriesEvidenceState, 'INSUFFICIENT_EVIDENCE', 'A valid empty related-query response is distinct from a provider failure');
  assert.deepStrictEqual(relatedEmpty.relatedQueries, []);

  const relatedObserved = await fetchGoogleTrends('seed', fakeTrendClient([10, 12, 14, 16, 18, 20, 22, 24], { relatedQueriesBehavior: 'nonempty' }));
  assert.strictEqual(relatedObserved.evidenceState, 'OBSERVED');
  assert.strictEqual(relatedObserved.relatedQueriesEvidenceState, 'OBSERVED');
  assert.ok(relatedObserved.relatedQueries.length > 0, 'Usable related queries must be preserved');
  console.log('🟢 GAP 7: relatedQueries provider failure/malformed/empty/observed are provenance-distinct and never downgrade a valid timeline.');

  // Secondary same-bug-class tripwires.
  const gtSrc = fs.readFileSync(path.resolve(__dirname, '../server/googleTrendsService.js'), 'utf8');
  const benchSrc = fs.readFileSync(path.resolve(__dirname, '../server/benchmarkService.js'), 'utf8');
  assert.ok(!gtSrc.includes('momentumPercent: 28'));
  assert.ok(!gtSrc.includes("geo: 'US (Reference Estimate)'"));
  assert.ok(!gtSrc.includes('Generating algorithmic simulation model'));
  assert.ok(!benchSrc.includes('collar de plata'));
  assert.ok(!benchSrc.includes('etsyIntentScore'));
  assert.ok(!benchSrc.includes('pinterestGiftIntent'));
  assert.ok(!benchSrc.includes('growth || 15'));

  // GAP 8: Staff-facing measurement-window labels must match the actual
  // query/formula. The service requests a 12-month interestOverTime window
  // and computes momentum from the last ~4 weeks vs the prior ~4 weeks --
  // it is neither "real-time" nor a "90-day"/"30d" measurement.
  assert.ok(!benchSrc.includes('trong 90 ngày'), 'Benchmark reasons must not claim a 90-day window the formula does not measure');
  const gtWidgetSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/GoogleTrendsWidget.jsx'), 'utf8');
  const benchWidgetSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/MarketBenchmarkWidget.jsx'), 'utf8');
  assert.ok(!gtWidgetSrc.includes('US Real-Time Data'), 'Historical interestOverTime data must not be labeled real-time');
  assert.ok(!gtWidgetSrc.includes('(30d)'), 'Growth label must not claim a calendar 30-day window the formula does not measure');
  assert.ok(!benchWidgetSrc.includes('90 ngày'), 'Benchmark widget must not claim a 90-day Google Trends window');
  assert.ok(!benchWidgetSrc.includes('Google Trends 90D'), 'Benchmark widget card must not claim a 90-day Google Trends window');
  console.log('🟢 GAP 8: Staff-facing measurement-window labels match the actual 12-month query / 4-week momentum formula.');

  console.log('\n================================================================');
  console.log('  🟢 P0.5-C NINE-GAP HARDENING SUITE PASSED');
  console.log('================================================================');
}

main().catch(err => {
  console.error('🔴 P0.5-C RESEARCH TRUTH TEST FAILED:', err.stack || err.message);
  process.exit(1);
});
