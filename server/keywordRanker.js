const ipGuard = require('./ipGuard');
const { toObservedNumber } = require('./researchTruth');

/**
 * Master Keyword Selection & Ranking Engine (Updated for Aug 15, 2026 Policy Standards)
 * Amazon: Title <= 75 chars, Item Highlights <= 125 chars, Search Terms <= 249 UTF-8 bytes
 * Etsy: Title <= 140 chars (Buyer-friendly, non-stuffed), 13 Tags <= 20 chars
 */

const GARBAGE_PATTERNS = [
  /^b0[a-z0-9]{8}$/i,
  /^[a-z0-9]{10}$/i,
  /^\d+[\.\)]?$/,
  /^\d+$/,
  /^[\W_]+$/,
  /\bgif\b/i
];

const BANNED_DELIVERY_TERMS = [
  'same day', 'sameday', 'overnight', 'overnight delivery', 'delivery gifts',
  'delivery items', 'express delivery', 'express shipping', '24h shipping',
  'fresh flowers', 'flowers', 'fast shipping', 'next day'
];

const BANNED_IRRELEVANT_TERMS = [
  'abused', 'abuse', 'girlfriend abused', 'chucky', 'chucky doll', 'horror',
  'dog toy', 'cat toy', 'phone case', 'keychain', 'sticker', 'plastic', 'cheap'
];

function sanitizeKeyword(rawKw) {
  if (!rawKw || typeof rawKw !== 'string') return null;
  let kw = rawKw.trim().toLowerCase();
  if (kw.length < 4) return null;
  for (const pat of GARBAGE_PATTERNS) if (pat.test(kw)) return null;
  for (const bad of BANNED_DELIVERY_TERMS) if (kw.includes(bad)) return null;
  for (const bad of BANNED_IRRELEVANT_TERMS) if (kw.includes(bad)) return null;
  const ipCheck = ipGuard.screenText(kw);
  if (ipCheck.verdict === 'BLOCK') return null;
  return kw;
}

function computeDynamicSeedRelevance(keyword, seedPhrase) {
  if (!seedPhrase || typeof seedPhrase !== 'string') return 1.0;
  const seedLower = seedPhrase.toLowerCase().trim();
  const kwLower = keyword.toLowerCase().trim();
  const seedTokens = seedLower.split(/\s+/).filter(t => t.length > 2);
  const kwTokens = kwLower.split(/\s+/).filter(t => t.length > 2);
  if (seedTokens.length === 0 || kwTokens.length === 0) return 1.0;

  const isSpanishSeed = /para|el|la|amor|vida|esposa|novia|regalo|suegra|mama|madre|aniversario|con|de|mi/i.test(seedLower);
  const isSpanishKw = /regalo|regalos|amor|vida|esposa|novia|esposo|para|suegra|collar|corazon|aniversario|san valentin|detalles|pareja|cumpleaños/i.test(kwLower);
  let langMultiplier = 1.0;
  if (isSpanishSeed) langMultiplier = isSpanishKw ? 3.0 : 0.3;

  let matchingTokensCount = 0;
  seedTokens.forEach(st => {
    if (kwTokens.some(kt => kt.includes(st) || st.includes(kt))) matchingTokensCount++;
  });
  const overlapRatio = matchingTokensCount / seedTokens.length;
  return langMultiplier * (1.0 + (overlapRatio * 2.5));
}

function rankKeywords(keywordList, contextCategory = 'Jewelry', seedPhrase = '') {
  if (!Array.isArray(keywordList)) return [];

  const scoredList = keywordList.map(item => {
    const rawKw = typeof item === 'string' ? item : item.keyword || item.phrase || item.searchQuery || '';
    const kw = sanitizeKeyword(rawKw);
    if (!kw) return null;

    const isObj = typeof item === 'object' && item !== null;
    const realVolume = isObj ? toObservedNumber(item.searchVolume ?? item.volume ?? item.searches) : null;
    const realDensity = isObj ? toObservedNumber(item.titleDensity ?? item.density) : null;
    const realCpr = isObj ? toObservedNumber(item.cpr) : null;
    const competingProducts = isObj ? toObservedNumber(item.competingProducts) : null;

    // Stable ranking may use private heuristic defaults, but exposed business
    // metrics must never be computed from those defaults.
    const sortVol = realVolume ?? 100;
    const sortDensity = realDensity ?? 10;
    const sortCpr = realCpr ?? 8;

    const wordsCount = kw.split(/\s+/).length;
    let longTailMultiplier = 1.0;
    if (wordsCount >= 3) longTailMultiplier = 2.5;
    else if (wordsCount === 1) longTailMultiplier = 0.1;
    if (sortDensity < 5) longTailMultiplier *= 1.4;

    const dynamicIntentMultiplier = computeDynamicSeedRelevance(kw, seedPhrase);
    if (/^(gift for women|gifts for women|gifts for her|gift for her|gifts for wife|husband birthday gift)$/i.test(kw)) {
      longTailMultiplier *= 0.3;
    }

    // Soft priority boost, not a hard eligibility gate: a keyword with
    // observed competingProducts under 1,000 ranks higher, but a higher-
    // competition keyword is never excluded -- it may still be worth a
    // Tier 2 slot (owner decision 2026-08-20).
    const competitionMultiplier = (competingProducts !== null && competingProducts < 1000) ? 1.3 : 1.0;

    const baseSortScore = (sortVol * Math.max(1, 100 - sortDensity)) / (sortCpr + 1);
    const sortScore = baseSortScore * longTailMultiplier * dynamicIntentMultiplier * competitionMultiplier;

    // Hardening rule: a decision/exposed score is allowed only when the full
    // research metric set expected by the upload pipeline is observed. This
    // deliberately includes competingProducts even though the historical
    // rank formula does not use it directly; otherwise a row with missing
    // competition could arrive from server.js with a hidden default and be
    // re-labeled SCORED downstream.
    const completeScoreEvidence = [realVolume, realDensity, realCpr, competingProducts]
      .every(value => value !== null && value >= 0);
    const exposedScore = completeScoreEvidence ? sortScore : null;

    return {
      keyword: kw,
      volume: realVolume,
      searchVolume: realVolume,
      density: realDensity,
      titleDensity: realDensity,
      competingProducts,
      cpr: realCpr,
      score: exposedScore,
      opportunityScore: completeScoreEvidence ? Math.round(exposedScore) : null,
      scoringState: completeScoreEvidence ? 'SCORED' : 'INSUFFICIENT_EVIDENCE',
      isLongTail: wordsCount >= 3,
      isNicheRelevant: dynamicIntentMultiplier > 0.5,
      _sortScore: sortScore
    };
  }).filter(Boolean);

  return scoredList
    .sort((a, b) => b._sortScore - a._sortScore)
    .map(({ _sortScore, ...item }) => item);
}

function buildAmazonTitle75(keywordList, categoryName = 'Gift') {
  const ranked = rankKeywords(keywordList);
  const topKw = ranked.length > 0 ? ranked[0].keyword : categoryName;
  const toTitleCase = (str) => str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
  let baseTitle = toTitleCase(topKw);
  if (baseTitle.length > 75) {
    baseTitle = baseTitle.substring(0, 75).trim();
  } else if (ranked.length > 1) {
    const secKw = toTitleCase(ranked[1].keyword);
    if ((baseTitle + `, ${secKw}`).length <= 75) baseTitle += `, ${secKw}`;
  }
  return baseTitle.substring(0, 75);
}

function buildAmazonItemHighlights125(keywordList, categoryName = 'Gift') {
  const ranked = rankKeywords(keywordList);
  const toTitleCase = (str) => str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
  const highlights = [];
  highlights.push(`${toTitleCase(categoryName)} makes a thoughtful gift`);
  highlights.push('Heartfelt gift for family & loved ones');
  let text = highlights.join(' • ');
  if (text.length > 125) text = text.substring(0, 122) + '...';
  return text.substring(0, 125);
}

function buildEtsyTitleClean(keywordList, categoryName = 'Handmade Gift') {
  const ranked = rankKeywords(keywordList);
  const toTitleCase = (str) => str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
  const coreKw = ranked.length > 0 ? toTitleCase(ranked[0].keyword) : categoryName;
  let title = ranked.length > 1 ? `${coreKw} - ${toTitleCase(ranked[1].keyword)}` : coreKw;
  if (title.length > 140) title = title.substring(0, 140).trim();
  return title;
}

function buildAmazonSearchTerms(keywordList) {
  if (!Array.isArray(keywordList) || keywordList.length === 0) return '';
  const ranked = rankKeywords(keywordList);
  const wordsSet = new Set();
  const resultWords = [];
  let currentBytes = 0;

  for (const item of ranked) {
    if (!item || !item.keyword) continue;
    const words = item.keyword.split(/\s+/);
    for (let word of words) {
      word = word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').trim();
      if (!word || word.length < 2) continue;
      const ipCheck = ipGuard.screenText(word);
      if (ipCheck.verdict === 'BLOCK') continue;
      if (!wordsSet.has(word)) {
        const wordBytes = Buffer.byteLength(word, 'utf8');
        const addedBytes = resultWords.length > 0 ? wordBytes + 1 : wordBytes;
        if (currentBytes + addedBytes <= 249) {
          wordsSet.add(word);
          resultWords.push(word);
          currentBytes += addedBytes;
        } else break;
      }
    }
    if (currentBytes >= 240) break;
  }

  return resultWords.join(' ');
}

function buildEtsyTags(keywordList, categoryName = 'Gift') {
  if (!Array.isArray(keywordList) || keywordList.length === 0) return [];
  const ranked = rankKeywords(keywordList);
  const tagsSet = new Set();
  const resultTags = [];

  for (const item of ranked) {
    if (!item || !item.keyword) continue;
    let tag = item.keyword.toLowerCase().trim();
    tag = tag.replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
    if (tag && tag.length >= 3 && tag.length <= 20 && !tagsSet.has(tag)) {
      const ipCheck = ipGuard.screenText(tag);
      if (ipCheck.verdict !== 'BLOCK') {
        tagsSet.add(tag);
        resultTags.push(tag);
      }
    }
    if (resultTags.length >= 13) break;
  }

  return resultTags.slice(0, 13);
}

module.exports = {
  sanitizeKeyword,
  rankKeywords,
  buildAmazonTitle75,
  buildAmazonItemHighlights125,
  buildAmazonSearchTerms,
  buildEtsyTitleClean,
  buildEtsyTags
};
