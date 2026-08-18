const googleTrends = require('google-trends-api');

function insufficientTrendEvidence(seed, reason, observedPoints = 0) {
  return {
    success: false,
    evidenceState: 'INSUFFICIENT_EVIDENCE',
    seed,
    reason,
    observedPoints,
    data: null
  };
}

/**
 * Fetches real Google Trends data for a Seed Phrase keyword.
 * A provider response is decision-usable only when it contains enough real
 * timeline observations to calculate the 4-week-vs-4-week momentum metric.
 *
 * client is injectable for deterministic tests; production callers use the
 * real google-trends-api module by default.
 */
async function fetchGoogleTrends(seedKeyword, client = googleTrends) {
  const seed = String(seedKeyword || '').trim();
  if (!seed) {
    throw new Error('Seed keyword is required for Google Trends check');
  }

  try {
    const startTime = new Date();
    startTime.setFullYear(startTime.getFullYear() - 1);

    const trendResults = await client.interestOverTime({
      keyword: seed,
      startTime,
      geo: 'US'
    });

    const parsedData = JSON.parse(trendResults);
    const timelineData = Array.isArray(parsedData?.default?.timelineData)
      ? parsedData.default.timelineData
      : [];

    const points = timelineData.map(pt => {
      const rawValue = Array.isArray(pt?.value) ? Number(pt.value[0]) : null;
      if (!Number.isFinite(rawValue)) return null;
      return {
        date: pt.formattedAxisTime || pt.formattedTime || '',
        value: rawValue
      };
    }).filter(Boolean);

    // Reaching the provider is not the same as having usable evidence. The
    // old code turned an empty timeline into currentScore=50/peakScore=100 and
    // a short timeline into momentum=0, both of which looked observed.
    if (points.length === 0) {
      return insufficientTrendEvidence(seed, 'GOOGLE_TRENDS_EMPTY_TIMELINE', 0);
    }
    if (points.length < 8) {
      return insufficientTrendEvidence(seed, 'GOOGLE_TRENDS_INSUFFICIENT_TIMELINE', points.length);
    }

    const recent4 = points.slice(-4).reduce((sum, p) => sum + p.value, 0);
    const prev4 = points.slice(-8, -4).reduce((sum, p) => sum + p.value, 0);
    let momentumPercent = 0;
    if (prev4 > 0) {
      momentumPercent = Math.round(((recent4 - prev4) / prev4) * 100);
    } else if (recent4 > 0) {
      momentumPercent = 100;
    }

    const currentScore = points[points.length - 1].value;
    const peakScore = Math.max(...points.map(p => p.value));

    let relatedQueries = [];
    try {
      const relatedResults = await client.relatedQueries({
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
      timeline: points.slice(-24),
      relatedQueries
    };
  } catch (err) {
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
