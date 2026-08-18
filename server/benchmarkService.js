const googleTrends = require('./googleTrendsService');

/**
 * Multi-Source Public Benchmark Engine (Google Trends + Amazon Live A9 Suggestions + Etsy Intent)
 * Evaluates seed phrases in real-time to generate a Go / No-Go Decision for Staff before listing creation.
 */
async function getMarketBenchmark({ seed = 'mom sweatshirt', category = 'Apparel: Sweatshirt' }) {
  const cleanSeed = seed.trim();
  if (!cleanSeed) {
    throw new Error('Seed phrase is required for market benchmark analysis.');
  }

  let googleData = null;
  let amazonSuggestions = [];
  let amazonSuggestionsAvailable = false;

  // 1. Fetch Google Trends Data. fetchGoogleTrends now fails closed
  // (success:false, no synthetic timeline/momentum) rather than throwing, so
  // this must check gt.success explicitly -- a failed/unavailable source
  // must not silently read as "stable, +15% growth" (P0.5-C truth fix).
  const gt = await googleTrends.fetchGoogleTrends(cleanSeed);
  const googleTrendsAvailable = Boolean(gt.success);
  if (googleTrendsAvailable) {
    googleData = {
      summary: {
        growth: gt.momentumPercent,
        status: gt.isBreakout ? 'ĐỘT PHÁ' : gt.momentumPercent > 10 ? 'TĂNG' : 'ỔN ĐỊNH'
      },
      relatedQueries: gt.relatedQueries
    };
  }

  // 2. Fetch Live Amazon A9 Search Suggestions (Public & Free Endpoint). No
  // fallback: a blocked/rate-limited/empty response means this source is
  // unavailable, not a cue to fabricate plausible-looking suggestions
  // (P0.5-C truth fix -- the previous fallback presented invented strings as
  // if they were real live Amazon buyer search data).
  try {
    const amzUrl = `https://completion.amazon.com/api/2017/suggestions?prefix=${encodeURIComponent(cleanSeed)}&alias=aps&mid=ATVPDKIKX0DER`;
    const amzRes = await fetch(amzUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });
    if (amzRes.ok) {
      const amzJson = await amzRes.json();
      if (Array.isArray(amzJson.suggestions)) {
        amazonSuggestions = amzJson.suggestions.map(s => s.value).filter(Boolean);
        amazonSuggestionsAvailable = amazonSuggestions.length > 0;
      }
    }
  } catch (amzErr) {
    console.warn('Amazon suggestion fetch warning:', amzErr.message);
  }

  // 3. Both sources are required for a decision-grade verdict. Missing
  // evidence must produce an explicit INSUFFICIENT_EVIDENCE state, never a
  // computed GO/NICHE_DOWN/AVOID built on defaults for the missing source
  // (P0.5-C truth fix, same class as the Listing Truth Boundary work).
  if (!googleTrendsAvailable || !amazonSuggestionsAvailable) {
    const missing = [];
    if (!googleTrendsAvailable) missing.push('Google Trends');
    if (!amazonSuggestionsAvailable) missing.push('Amazon US Live Suggestions');
    return {
      success: true,
      evidenceState: 'INSUFFICIENT_EVIDENCE',
      seed: cleanSeed,
      category,
      opportunityScore: null,
      verdict: 'INSUFFICIENT_EVIDENCE',
      verdictBadge: '⚪ CHƯA ĐỦ DỮ LIỆU (INSUFFICIENT EVIDENCE)',
      verdictColor: '#64748b',
      verdictBg: '#f1f5f9',
      staffAdvice: `Không thể đánh giá: thiếu dữ liệu từ ${missing.join(', ')}. Vui lòng thử lại hoặc thu thập bằng chứng thủ công trước khi quyết định.`,
      keyFindings: missing.map(source => `${source} hiện không khả dụng -- không dùng số liệu giả định.`),
      sources: {
        googleTrends: googleTrendsAvailable
          ? { growth: googleData.summary.growth, status: googleData.summary.status, breakoutCount: (googleData.relatedQueries || []).length }
          : { evidenceState: 'SOURCE_ERROR' },
        amazonLiveSuggestions: amazonSuggestionsAvailable ? amazonSuggestions.slice(0, 6) : []
      }
    };
  }

  // 4. Compute Multi-Dimensional Opportunity Score (0 - 100) -- both sources
  // are confirmed real at this point, so no defaults are needed.
  let score = 50;
  let reasons = [];

  // A. Google Trends Contribution (up to 40 pts)
  const gtGrowth = googleData.summary.growth;
  const gtStatus = googleData.summary.status;
  if (gtGrowth > 20 || gtStatus.includes('TĂNG') || gtStatus.includes('ĐỘT PHÁ')) {
    score += 25;
    reasons.push(`Google Trends ghi nhận xu hướng tăng trưởng +${gtGrowth}% trong 90 ngày.`);
  } else if (gtGrowth < -10) {
    score -= 15;
    reasons.push(`Google Trends ghi nhận sự suy giảm nhu cầu -${Math.abs(gtGrowth)}%.`);
  } else {
    score += 10;
    reasons.push(`Nhu cầu tìm kiếm trên Google duy trì ở mức ổn định.`);
  }

  // B. Amazon A9 Live Buying Intent Contribution (up to 40 pts)
  if (amazonSuggestions.length >= 5) {
    score += 20;
    reasons.push(`Xuất hiện trong Top gợi ý tìm kiếm mua sắm thời gian thực của Amazon US (${amazonSuggestions.length} gợi ý liên quan).`);
  } else if (amazonSuggestions.length >= 2) {
    score += 10;
    reasons.push(`Có ${amazonSuggestions.length} gợi ý tìm kiếm trên Amazon US.`);
  } else {
    score -= 10;
    reasons.push(`Ít gợi ý mua sắm trên Amazon US, người mua ít chủ động gõ cụm từ này.`);
  }

  // C. Specificity & Long-tail depth (up to 20 pts)
  const wordCount = cleanSeed.split(/\s+/).length;
  if (wordCount >= 2 && wordCount <= 5) {
    score += 15;
    reasons.push(`Độ dài hạt giống ${wordCount} từ lý tưởng, không quá chung chung và đủ độ nhắm trúng đối tượng.`);
  } else if (wordCount === 1) {
    score -= 10;
    reasons.push(`Từ khóa hạt giống quá ngắn (1 từ), độ cạnh tranh sẽ rất khốc liệt.`);
  }

  // Clamp score between 10 and 99
  const finalScore = Math.max(15, Math.min(98, Math.round(score)));

  // 4. Formulate Go / No-Go Staff Verdict
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
    evidenceState: 'OBSERVED',
    seed: cleanSeed,
    category,
    opportunityScore: finalScore,
    verdict,
    verdictBadge,
    verdictColor,
    verdictBg,
    staffAdvice,
    keyFindings: reasons,
    // No third "Pinterest gift intent" source: there was never a real
    // Pinterest integration behind it, just a restatement of the score
    // itself relabeled as if it were independent evidence (P0.5-C truth fix).
    sources: {
      googleTrends: {
        growth: gtGrowth,
        status: gtStatus,
        breakoutCount: (googleData.relatedQueries || []).length
      },
      amazonLiveSuggestions: amazonSuggestions.slice(0, 6)
    }
  };
}

module.exports = { getMarketBenchmark };
