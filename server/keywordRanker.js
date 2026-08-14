const ipGuard = require('./ipGuard');

/**
 * Master Keyword Selection & Ranking Engine (Updated for Aug 15, 2026 Policy Standards)
 * Amazon: Title <= 75 chars, Item Highlights <= 125 chars, Search Terms <= 249 UTF-8 bytes
 * Etsy: Title <= 140 chars (Buyer-friendly, non-stuffed), 13 Tags <= 20 chars
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
  rankKeywords,
  buildAmazonTitle75,
  buildAmazonItemHighlights125,
  buildAmazonSearchTerms,
  buildEtsyTitleClean,
  buildEtsyTags
};
