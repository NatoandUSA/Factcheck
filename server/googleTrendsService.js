const googleTrends = require('google-trends-api');

/**
 * Fetches real Google Trends data for a Seed Phrase keyword
 * Returns interest over time, 30-day momentum %, and breakout related queries
 */
async function fetchGoogleTrends(seedKeyword) {
  const seed = String(seedKeyword || '').trim();
  if (!seed) {
    throw new Error('Seed keyword is required for Google Trends check');
  }

  try {
    // 1. Fetch Interest Over Time (Past 12 months)
    const startTime = new Date();
    startTime.setFullYear(startTime.getFullYear() - 1);

    const trendResults = await googleTrends.interestOverTime({
      keyword: seed,
      startTime,
      geo: 'US'
    });

    const parsedData = JSON.parse(trendResults);
    const timelineData = parsedData?.default?.timelineData || [];

    // Format chart points. A point with no usable value is dropped rather
    // than defaulted to 0 -- a missing sample is not the same observation as
    // a measured zero (P0.5-C truth fix).
    const points = timelineData
      .map(pt => ({
        date: pt.formattedAxisTime || pt.formattedTime,
        value: Array.isArray(pt.value) && pt.value.length > 0 ? pt.value[0] : null
      }))
      .filter(p => p.value !== null);

    // An empty/unusable timeline is not a measured "stable at 50" -- it is
    // no evidence at all. Returning OBSERVED with fabricated 50/100 defaults
    // here would be the exact same fabrication class the outer catch below
    // was fixed to stop doing (P0.5-C truth fix).
    if (points.length === 0) {
      return {
        success: false,
        evidenceState: 'INSUFFICIENT_EVIDENCE',
        seed,
        reason: 'Google Trends returned no usable timeline data points',
        data: null
      };
    }

    // Calculate Momentum (last 4 weeks vs previous 4 weeks)
    let momentumPercent = 0;
    if (points.length >= 8) {
      const recent4 = points.slice(-4).reduce((sum, p) => sum + p.value, 0);
      const prev4 = points.slice(-8, -4).reduce((sum, p) => sum + p.value, 0);
      if (prev4 > 0) {
        momentumPercent = Math.round(((recent4 - prev4) / prev4) * 100);
      } else if (recent4 > 0) {
        momentumPercent = 100;
      }
    }

    const currentScore = points[points.length - 1].value;
    const peakScore = Math.max(...points.map(p => p.value));

    // 2. Fetch Related & Breakout Queries
    let relatedQueries = [];
    try {
      const relatedResults = await googleTrends.relatedQueries({
        keyword: seed,
        geo: 'US'
      });
      const parsedRelated = JSON.parse(relatedResults);
      const rankedList = parsedRelated?.default?.rankedList || [];
      const topList = rankedList[0]?.rankedKeyword || [];
      const risingList = rankedList[1]?.rankedKeyword || [];

      relatedQueries = [
        ...risingList.slice(0, 5).map(q => ({ query: q.query, value: `+${q.value}% (Breakout)`, type: 'RISING' })),
        ...topList.slice(0, 5).map(q => ({ query: q.query, value: `${q.value}/100`, type: 'TOP' }))
      ];
    } catch (relErr) {
      console.warn('Google Trends related queries skipped:', relErr.message);
    }

    return {
      success: true,
      evidenceState: 'OBSERVED',
      seed,
      geo: 'US (United States)',
      currentScore,
      peakScore,
      momentumPercent,
      isBreakout: momentumPercent > 50,
      statusBadge: momentumPercent > 50 ? '🔥 BREAKOUT MOMENTUM' : momentumPercent > 10 ? '📈 RISING DEMAND' : '📊 STABLE INTEREST',
      timeline: points.slice(-24), // last 24 data points for crisp UI
      relatedQueries
    };
  } catch (err) {
    // Fail closed: a provider outage or parsing failure must be visible as a
    // real failure, not silently replaced with a plausible-looking simulated
    // timeline/momentum/related-queries that Staff could mistake for
    // measured demand (P0.5-C, same class as the P0.5-A/B/PT truth fixes).
    console.warn(`Google Trends API error for "${seed}": ${err.message}`);
    return {
      success: false,
      evidenceState: 'SOURCE_ERROR',
      seed,
      reason: err.message,
      data: null
    };
  }
}

module.exports = { fetchGoogleTrends };
