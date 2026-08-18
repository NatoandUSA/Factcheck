const googleTrends = require('./googleTrendsService');

/**
 * Multi-Source Public Benchmark Engine (Google Trends + Amazon Live A9 Suggestions)
 * Evaluates seed phrases in real-time to generate a derived Go / No-Go decision.
 *
 * deps is injectable for deterministic provider-failure tests. Production
 * callers use the real Google Trends service and global fetch by default.
 */
async function getMarketBenchmark(
  { seed = 'mom sweatshirt', category = 'Apparel: Sweatshirt' },
  deps = {}
) {
  const cleanSeed = String(seed || '').trim();
  if (!cleanSeed) {
    throw new Error('Seed phrase is required for market benchmark analysis.');
  }

  const fetchGoogleTrends = deps.fetchGoogleTrends || googleTrends.fetchGoogleTrends;
  const fetchImpl = deps.fetch || global.fetch;
  if (typeof fetchGoogleTrends !== 'function' || typeof fetchImpl !== 'function') {
    throw new Error('Benchmark provider dependencies are unavailable.');
  }

  let googleData = null;
  let amazonSuggestions = [];
  let amazonSuggestionsAvailable = false;

  const gt = await fetchGoogleTrends(cleanSeed);
  const googleTrendsAvailable = Boolean(gt?.success && gt.evidenceState === 'OBSERVED');
  if (googleTrendsAvailable) {
    googleData = {
      summary: {
        growth: gt.momentumPercent,
        status: gt.isBreakout ? 'ĐỘT PHÁ' : gt.momentumPercent > 10 ? 'TĂNG' : 'ỔN ĐỊNH'
      },
      relatedQueries: Array.isArray(gt.relatedQueries) ? gt.relatedQueries : [],
      // relatedQueries is its own sub-source: a provider failure/malformed
      // response on it must not present as a confirmed "zero breakout
      // keywords" fact downstream (same class as the GoogleTrendsWidget fix).
      relatedQueriesEvidenceState: gt.relatedQueriesEvidenceState || 'SOURCE_ERROR'
    };
  }

  try {
    const amzUrl = `https://completion.amazon.com/api/2017/suggestions?prefix=${encodeURIComponent(cleanSeed)}&alias=aps&mid=ATVPDKIKX0DER`;
    const amzRes = await fetchImpl(amzUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });
    if (amzRes?.ok) {
      const amzJson = await amzRes.json();
      if (Array.isArray(amzJson?.suggestions)) {
        amazonSuggestions = amzJson.suggestions
          .map(s => typeof s === 'string' ? s : s?.value)
          .filter(value => typeof value === 'string' && value.trim().length > 0);
        amazonSuggestionsAvailable = amazonSuggestions.length > 0;
      }
    }
  } catch (amzErr) {
    console.warn('Amazon suggestion fetch warning:', amzErr.message);
  }

  const googleEvidenceState = gt?.evidenceState || 'SOURCE_ERROR';
  const amazonEvidenceState = amazonSuggestionsAvailable ? 'OBSERVED' : 'SOURCE_ERROR';

  // Both real source families are required before a decision-grade verdict.
  if (!googleTrendsAvailable || !amazonSuggestionsAvailable) {
    const missing = [];
    if (!googleTrendsAvailable) missing.push('Google Trends');
    if (!amazonSuggestionsAvailable) missing.push('Amazon US Live Suggestions');
    return {
      success: true,
      evidenceState: 'INSUFFICIENT_EVIDENCE',
      decisionBasis: 'INSUFFICIENT_EVIDENCE',
      seed: cleanSeed,
      category,
      opportunityScore: null,
      verdict: 'INSUFFICIENT_EVIDENCE',
      verdictBadge: '⚪ CHƯA ĐỦ DỮ LIỆU (INSUFFICIENT EVIDENCE)',
      verdictColor: '#64748b',
      verdictBg: '#f1f5f9',
      staffAdvice: `Không thể đánh giá: thiếu dữ liệu từ ${missing.join(', ')}. Vui lòng thử lại hoặc thu thập bằng chứng thủ công trước khi quyết định.`,
      keyFindings: missing.map(source => `${source} hiện không khả dụng -- không dùng số liệu giả định.`),
      sourceEvidence: {
        googleTrends: googleEvidenceState,
        amazonLiveSuggestions: amazonEvidenceState
      },
      sources: {
        googleTrends: googleTrendsAvailable
          ? {
              evidenceState: 'OBSERVED',
              growth: googleData.summary.growth,
              status: googleData.summary.status,
              relatedQueriesEvidenceState: googleData.relatedQueriesEvidenceState,
              breakoutCount: googleData.relatedQueriesEvidenceState === 'OBSERVED' ? googleData.relatedQueries.length : null
            }
          : { evidenceState: googleEvidenceState },
        amazonLiveSuggestions: amazonSuggestionsAvailable ? amazonSuggestions.slice(0, 6) : []
      }
    };
  }

  // The following score is DERIVED from observed sources; it is not itself a
  // raw observation. No unavailable/defaulted source participates here.
  let score = 50;
  const reasons = [];

  const gtGrowth = googleData.summary.growth;
  const gtStatus = googleData.summary.status;
  if (gtGrowth > 20 || gtStatus.includes('TĂNG') || gtStatus.includes('ĐỘT PHÁ')) {
    score += 25;
    reasons.push(`Google Trends ghi nhận xu hướng tăng trưởng +${gtGrowth}% trong 4 tuần gần nhất.`);
  } else if (gtGrowth < -10) {
    score -= 15;
    reasons.push(`Google Trends ghi nhận sự suy giảm nhu cầu -${Math.abs(gtGrowth)}%.`);
  } else {
    score += 10;
    reasons.push('Nhu cầu tìm kiếm trên Google duy trì ở mức ổn định.');
  }

  if (amazonSuggestions.length >= 5) {
    score += 20;
    reasons.push(`Xuất hiện trong Top gợi ý tìm kiếm mua sắm thời gian thực của Amazon US (${amazonSuggestions.length} gợi ý liên quan).`);
  } else if (amazonSuggestions.length >= 2) {
    score += 10;
    reasons.push(`Có ${amazonSuggestions.length} gợi ý tìm kiếm trên Amazon US.`);
  } else {
    // This branch remains reachable only with exactly one observed suggestion;
    // zero suggestions were rejected above as insufficient evidence.
    score -= 10;
    reasons.push('Amazon US trả về 1 gợi ý tìm kiếm liên quan; tín hiệu mua sắm còn yếu.');
  }

  const wordCount = cleanSeed.split(/\s+/).length;
  if (wordCount >= 2 && wordCount <= 5) {
    score += 15;
    reasons.push(`Độ dài hạt giống ${wordCount} từ lý tưởng, không quá chung chung và đủ độ nhắm trúng đối tượng.`);
  } else if (wordCount === 1) {
    score -= 10;
    reasons.push('Từ khóa hạt giống quá ngắn (1 từ), độ cạnh tranh sẽ rất khốc liệt.');
  }

  const finalScore = Math.max(15, Math.min(98, Math.round(score)));

  let verdict = 'GO';
  let verdictBadge = '🟢 NÊN LÀM NGAY (PROCEED)';
  let verdictColor = '#16a34a';
  let verdictBg = '#dcfce7';
  let staffAdvice = 'Thị trường có lực cầu mạnh và đang được người mua chủ động tìm kiếm. Khuyên Staff tiến hành nạp Xray / Cerebro hoặc quét Top Sellers ngay!';

  if (finalScore < 50) {
    verdict = 'AVOID';
    verdictBadge = '🔴 KHÔNG NÊN LÀM (SKIP / CHANGE SEED)';
    verdictColor = '#dc2626';
    verdictBg = '#fee2e2';
    staffAdvice = 'Nhu cầu thấp hoặc đang suy giảm. Khuyên Staff đổi sang từ khóa hạt giống khác để tránh lãng phí thời gian và ngân sách ads.';
  } else if (finalScore < 75) {
    verdict = 'NICHE_DOWN';
    verdictBadge = '🟡 CẦN NGÁCH HÓA THÊM (NICHE DOWN)';
    verdictColor = '#d97706';
    verdictBg = '#fef3c7';
    staffAdvice = 'Từ khóa có lượng tìm kiếm nhưng hơi rộng. Khuyên Staff ghép thêm 1 từ khóa ngách chỉ rõ đối tượng (ví dụ: thêm nghề nghiệp, người nhận hoặc chất liệu) trước khi tạo listing.';
  }

  return {
    success: true,
    evidenceState: 'DERIVED_FROM_OBSERVED',
    decisionBasis: 'DERIVED_FROM_OBSERVED_SOURCES',
    seed: cleanSeed,
    category,
    opportunityScore: finalScore,
    verdict,
    verdictBadge,
    verdictColor,
    verdictBg,
    staffAdvice,
    keyFindings: reasons,
    sourceEvidence: {
      googleTrends: 'OBSERVED',
      amazonLiveSuggestions: 'OBSERVED'
    },
    sources: {
      googleTrends: {
        evidenceState: 'OBSERVED',
        growth: gtGrowth,
        status: gtStatus,
        relatedQueriesEvidenceState: googleData.relatedQueriesEvidenceState,
        breakoutCount: googleData.relatedQueriesEvidenceState === 'OBSERVED' ? googleData.relatedQueries.length : null
      },
      amazonLiveSuggestions: amazonSuggestions.slice(0, 6)
    }
  };
}

module.exports = { getMarketBenchmark };
