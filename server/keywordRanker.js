const ipGuard = require('./ipGuard');

/**
 * Master Keyword Selection & Ranking Engine
 * Ported from AMZ Toolkit (sqp_crosscheck.py & phaseA_master.py) & 22etsy-agent
 */

function rankKeywords(keywordList) {
  if (!Array.isArray(keywordList)) return [];

  const scoredList = keywordList.map(item => {
    let kw = typeof item === 'string' ? item : item.keyword || item.phrase || item.searchQuery || '';
    kw = String(kw).trim().toLowerCase();

    const vol = typeof item === 'object' ? (parseFloat(item.searchVolume || item.volume || item.searches) || 100) : 100;
    const density = typeof item === 'object' ? (parseFloat(item.titleDensity || item.density) || 10) : 10;
    const cpr = typeof item === 'object' ? (parseFloat(item.cpr) || 8) : 8;

    // Exclude misleading delivery or irrelevant terms (e.g. same day, flowers, typos)
    const isMisleading = [
      'same day', 'sameday', 'fresh flowers', 'flowers', 'overnight', '24h', 
      'express shipping', 'dísan', 'díla', 'dílas', '39 ños'
    ].some(bad => kw.includes(bad));

    if (isMisleading) {
      return null;
    }

    // IP Check
    const ipCheck = ipGuard.screenText(kw);
    if (ipCheck.verdict === 'BLOCK') {
      return null; // Exclude trademarked terms
    }

    // Ranking Score Formula
    const score = (vol * Math.max(1, 100 - density)) / (cpr + 1);

    return {
      keyword: kw,
      volume: vol,
      density,
      cpr,
      score
    };
  }).filter(Boolean);


  // Sort descending by opportunity score
  return scoredList.sort((a, b) => b.score - a.score);
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

  return resultWords.join(' ');
}

/**
 * Build Etsy 13 Tags (Max 20 chars per tag, exactly 13 non-repetitive tags)
 */
function buildEtsyTags(keywordList, categoryName = 'Gift') {
  const ranked = rankKeywords(keywordList);
  const tagsSet = new Set();
  const resultTags = [];

  // Default fallback tags per category if list is short
  const defaultTags = [
    `custom ${categoryName.toLowerCase()}`,
    `personalized gift`,
    `best gift 2026`,
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

  // First extract from ranked keywords
  for (const item of ranked) {
    let tag = item.keyword.toLowerCase().trim();
    tag = tag.replace(/[^a-z0-9\s]/g, '').trim();

    if (tag && tag.length <= 20 && !tagsSet.has(tag)) {
      tagsSet.add(tag);
      resultTags.push(tag);
    }
    if (resultTags.length >= 13) break;
  }

  // Fill up to 13 tags using defaults if needed
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
  rankKeywords,
  buildAmazonSearchTerms,
  buildEtsyTags
};
