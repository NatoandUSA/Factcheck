const ipGuard = require('./ipGuard');

/**
 * Master Keyword Selection & Ranking Engine (Updated for Aug 15, 2026 Policy Standards)
 * Amazon: Title <= 75 chars, Item Highlights <= 125 chars, Search Terms <= 249 UTF-8 bytes
 * Etsy: Title <= 140 chars (Buyer-friendly, non-stuffed), 13 Tags <= 20 chars
 */

const GARBAGE_PATTERNS = [
  /^b0[a-z0-9]{8}$/i,        // ASIN code like b0gl7dyp9r
  /^[a-z0-9]{10}$/i,          // 10-char alphanumeric code like b0h19x4t7d
  /^\d+[\.\)]?$/,            // Line numbers like 10., 11., 12.
  /^\d+$/,                    // Pure numbers like 10, 11
  /^[\W_]+$/,                 // Punctuation junk
  /\bgif\b/i                  // Typo "my gif", "gif for"
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

  // 1. Minimum length check
  if (kw.length < 4) return null;

  // 2. Pattern check (ASINs, Line Numbers)
  for (const pat of GARBAGE_PATTERNS) {
    if (pat.test(kw)) return null;
  }

  // 3. Delivery & speed term blacklist
  for (const bad of BANNED_DELIVERY_TERMS) {
    if (kw.includes(bad)) return null;
  }

  // 4. Irrelevant / offensive blacklist
  for (const bad of BANNED_IRRELEVANT_TERMS) {
    if (kw.includes(bad)) return null;
  }

  // 5. Trademark / IP Check
  const ipCheck = ipGuard.screenText(kw);
  if (ipCheck.verdict === 'BLOCK') return null;

  return kw;
}

/**
 * Dynamic Seed Relevance & Concept Intent Matcher (Zero Hardcoded Niche Blacklists)
 * If seedPhrase is "housewarming gift", "housewarming" is boosted 3.0x!
 * If seedPhrase is "para el amor de mi vida", Spanish romantic terms are boosted 3.5x!
 */
function computeDynamicSeedRelevance(keyword, seedPhrase) {
  if (!seedPhrase || typeof seedPhrase !== 'string') return 1.0;
  
  const seedLower = seedPhrase.toLowerCase().trim();
  const kwLower = keyword.toLowerCase().trim();
  
  const seedTokens = seedLower.split(/\s+/).filter(t => t.length > 2);
  const kwTokens = kwLower.split(/\s+/).filter(t => t.length > 2);

  if (seedTokens.length === 0 || kwTokens.length === 0) return 1.0;

  // Language Detection: Spanish vs English
  const isSpanishSeed = /para|el|la|amor|vida|esposa|novia|regalo|suegra|mama|madre|aniversario|con|de|mi/i.test(seedLower);
  const isSpanishKw = /regalo|regalos|amor|vida|esposa|novia|esposo|para|suegra|collar|corazon|aniversario|san valentin|detalles|pareja|cumpleaños/i.test(kwLower);

  let langMultiplier = 1.0;
  if (isSpanishSeed) {
    langMultiplier = isSpanishKw ? 3.0 : 0.3; // High boost for Spanish terms matching Spanish seed, penalty for English mismatch
  }

  // Dynamic Token Overlap & Concept Matching
  let matchingTokensCount = 0;
  seedTokens.forEach(st => {
    if (kwTokens.some(kt => kt.includes(st) || st.includes(kt))) {
      matchingTokensCount++;
    }
  });

  const overlapRatio = matchingTokensCount / seedTokens.length;
  const tokenMatchMultiplier = 1.0 + (overlapRatio * 2.5); // Dynamic boost up to 3.5x based on active seed concept match

  return langMultiplier * tokenMatchMultiplier;
}

function rankKeywords(keywordList, contextCategory = 'Jewelry', seedPhrase = '') {
  if (!Array.isArray(keywordList)) return [];

  const scoredList = keywordList.map(item => {
    let rawKw = typeof item === 'string' ? item : item.keyword || item.phrase || item.searchQuery || '';
    const kw = sanitizeKeyword(rawKw);

    if (!kw) return null;

    const vol = typeof item === 'object' ? (parseFloat(item.searchVolume || item.volume || item.searches) || 100) : 100;
    const density = typeof item === 'object' ? (parseFloat(item.titleDensity || item.density) || 10) : 10;
    const cpr = typeof item === 'object' ? (parseFloat(item.cpr) || 8) : 8;
    const competingProducts = (typeof item === 'object' && item.competingProducts != null) ? parseFloat(item.competingProducts) : null;

    // Long-tail Keyword Priority Multiplier
    const wordsCount = kw.split(/\s+/).length;
    let longTailMultiplier = 1.0;
    if (wordsCount >= 3) {
      longTailMultiplier = 2.5; // Strong boost for long-tail buyer intent
    } else if (wordsCount === 1) {
      longTailMultiplier = 0.1; // Severe penalty for 1-word generic noise ("gift", "gifts")
    }

    if (density < 5) {
      longTailMultiplier *= 1.4; // Low competition boost
    }

    // Dynamic Concept Intent Matcher (Adapts to ANY active seed phrase dynamically!)
    const dynamicIntentMultiplier = computeDynamicSeedRelevance(kw, seedPhrase);

    // Broad generic penalty ("gift for women", "gifts for her")
    if (/^(gift for women|gifts for women|gifts for her|gift for her|gifts for wife|husband birthday gift)$/i.test(kw)) {
      longTailMultiplier *= 0.3;
    }

    // Base Ranking Score Formula with Long-tail Priority & Dynamic Intent
    const baseScore = (vol * Math.max(1, 100 - density)) / (cpr + 1);
    const score = baseScore * longTailMultiplier * dynamicIntentMultiplier;

    return {
      keyword: kw,
      volume: vol,
      searchVolume: vol,
      density,
      titleDensity: density,
      competingProducts,
      cpr,
      score,
      opportunityScore: Math.round(score),
      isLongTail: wordsCount >= 3,
      isNicheRelevant: dynamicIntentMultiplier > 0.5
    };
  }).filter(Boolean);

  // Sort descending by opportunity score
  return scoredList.sort((a, b) => b.score - a.score);
}





/**
 * Build Amazon Title (Strictly <= 75 characters per July 27, 2026 Amazon Policy)
 */
function buildAmazonTitle75(keywordList, categoryName = 'Gift') {
  const ranked = rankKeywords(keywordList);
  const topKw = ranked.length > 0 ? ranked[0].keyword : categoryName;
  
  const toTitleCase = (str) => str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
  
  let baseTitle = `Personalized ${toTitleCase(topKw)}`;
  if (baseTitle.length > 75) {
    baseTitle = baseTitle.substring(0, 75).trim();
  } else if (ranked.length > 1) {
    const secKw = toTitleCase(ranked[1].keyword);
    if ((baseTitle + `, ${secKw}`).length <= 75) {
      baseTitle += `, ${secKw}`;
    }
  }

  return baseTitle.substring(0, 75);
}

/**
 * Build Amazon Item Highlights (Strictly <= 125 characters per July 27, 2026 Amazon Policy)
 * Separated by bullet dots •
 */
function buildAmazonItemHighlights125(keywordList, categoryName = 'Gift') {
  const ranked = rankKeywords(keywordList);
  const toTitleCase = (str) => str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());

  const highlights = [];
  highlights.push(`Custom ${toTitleCase(categoryName)} with personalized details`);
  highlights.push(`Heartfelt gift for family & loved ones`);
  highlights.push(`Multiple colors & sizes available`);

  let text = highlights.join(' • ');
  if (text.length > 125) {
    text = text.substring(0, 122) + '...';
  }
  return text.substring(0, 125);
}

/**
 * Build Etsy Title (Buyer-friendly, non-stuffed, Max 140 chars, optimal 70-100 chars per 2026 Etsy Policy)
 */
function buildEtsyTitleClean(keywordList, categoryName = 'Handmade Gift') {
  const ranked = rankKeywords(keywordList);
  const toTitleCase = (str) => str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());

  const coreKw = ranked.length > 0 ? toTitleCase(ranked[0].keyword) : categoryName;
  const secondaryKw = ranked.length > 1 ? toTitleCase(ranked[1].keyword) : 'Custom Handmade Gift';

  let title = `Personalized ${coreKw} - ${secondaryKw}`;
  if (title.length > 140) {
    title = title.substring(0, 140).trim();
  }

  return title;
}

/**
 * Build Amazon Backend Search Terms (Max 249 Bytes, deduplicated words)
 */
function buildAmazonSearchTerms(keywordList) {
  const ranked = rankKeywords(keywordList);
  const wordsSet = new Set();
  const resultWords = [];
  let currentBytes = 0;

  for (const item of ranked) {
    const words = item.keyword.split(/\s+/);
    for (let word of words) {
      word = word.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
      if (!word || word.length < 2) continue;

      // Skip common filler words or trademarked words
      const ipCheck = ipGuard.screenText(word);
      if (ipCheck.verdict === 'BLOCK') continue;

      if (!wordsSet.has(word)) {
        const wordBytes = Buffer.byteLength(word, 'utf8');
        const addedBytes = resultWords.length > 0 ? wordBytes + 1 : wordBytes; // 1 space

        if (currentBytes + addedBytes <= 249) {
          wordsSet.add(word);
          resultWords.push(word);
          currentBytes += addedBytes;
        } else {
          break;
        }
      }
    }
    if (currentBytes >= 240) break;
  }

  // Fallback relevant terms to fill up to 249 bytes if needed
  const fallbackTerms = [
    'gifts', 'gift', 'women', 'mom', 'spanish', 'birthday', 'wedding', 'anniversary', 
    'personalized', 'custom', 'handmade', 'unique', 'keepsake', 'mother', 'daughter', 
    'regalos', 'para', 'mujer', 'esposa', 'novia', 'navidad', 'cumpleanos', 'collar'
  ];

  if (currentBytes < 220) {
    for (let word of fallbackTerms) {
      word = word.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
      if (!word || wordsSet.has(word)) continue;

      const ipCheck = ipGuard.screenText(word);
      if (ipCheck.verdict === 'BLOCK') continue;

      const wordBytes = Buffer.byteLength(word, 'utf8');
      const addedBytes = resultWords.length > 0 ? wordBytes + 1 : wordBytes;

      if (currentBytes + addedBytes <= 249) {
        wordsSet.add(word);
        resultWords.push(word);
        currentBytes += addedBytes;
      } else {
        break;
      }
    }
  }

  return resultWords.join(' ');
}

/**
 * Build Etsy 13 Tags (Max 20 chars per tag, exactly 13 non-repetitive tags)
 */
function buildEtsyTags(keywordList, categoryName = 'Gift') {
  const ranked = rankKeywords(keywordList);
  const tagsSet = new Set();
  const resultTags = [];

  const defaultTags = [
    `custom ${categoryName.toLowerCase()}`,
    `personalized gift`,
    `milestone keepsake`,
    `gift for her`,
    `gift for mom`,
    `unique keepsake`,
    `birthday gift`,
    `anniversary gift`,
    `custom name gift`,
    `aesthetic gift`,
    `trending gift`,
    `handicraft decor`,
    `handmade gift`
  ];

  for (const item of ranked) {
    let tag = item.keyword.toLowerCase().trim();
    tag = tag.replace(/[^a-z0-9\s]/g, '').trim();

    if (tag && tag.length <= 20 && !tagsSet.has(tag)) {
      tagsSet.add(tag);
      resultTags.push(tag);
    }
    if (resultTags.length >= 13) break;
  }

  if (resultTags.length < 13) {
    for (const defTag of defaultTags) {
      const cleanDef = defTag.substring(0, 20).trim();
      if (!tagsSet.has(cleanDef)) {
        tagsSet.add(cleanDef);
        resultTags.push(cleanDef);
      }
      if (resultTags.length >= 13) break;
    }
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

