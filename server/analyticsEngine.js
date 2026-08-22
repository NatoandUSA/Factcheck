/**
 * Analytics Engine for Multi-Source Market Intelligence (Etsy & Amazon)
 * 
 * Provides:
 * 1. Semantic keyword clustering (Core, Recipient, Occasion, Style, Longtail)
 * 2. Multi-factor Opportunity Scoring (Search Volume, Competition, Relevancy)
 * 3. Tag Frequency Matrix (Extracts & ranks 13 optimal non-infringing tags from competitors)
 * 4. Price & Niche Viability Analytics (Min/Max/Avg price, 24h views/sales, contribution estimate)
 * 5. Fail-closed Trademark screening integration
 */

const ipGuard = require('./ipGuard');

// Semantic Dictionaries for Clustering
const RECIPIENT_PATTERNS = [
  'daughter', 'hija', 'son', 'hijo', 'mom', 'mama', 'mother', 'madre', 'dad', 'papa', 'father', 'padre',
  'sister', 'hermana', 'brother', 'hermano', 'wife', 'esposa', 'husband', 'esposo',
  'girlfriend', 'novia', 'boyfriend', 'novio', 'grandma', 'abuela', 'grandpa', 'abuelo',
  'aunt', 'tia', 'uncle', 'tio', 'niece', 'sobrina', 'nephew', 'sobrino',
  'teacher', 'profesora', 'nurse', 'enfermera', 'bestie', 'friend', 'amiga', 'amigo',
  'bride', 'groom', 'bridesmaid', 'dog mom', 'cat mom', 'family', 'familia', 'baby', 'bebe'
];

const OCCASION_PATTERNS = [
  'birthday', 'cumpleanos', 'christmas', 'navidad', 'halloween', 'mothers day', 'fathers day',
  'wedding', 'boda', 'anniversary', 'aniversario', 'quinceanera', 'graduation', 'graduacion',
  'valentine', 'san valentin', 'baby shower', 'retirement', 'holiday', 'thanksgiving', 'easter', 'new year'
];

const STYLE_PATTERNS = [
  'embroidered', 'bordado', 'embroidery', 'custom', 'personalized', 'personalizado',
  'vintage', 'retro', 'minimalist', 'minimalista', 'aesthetic', 'handmade', 'hecho a mano',
  'floral', 'oversized', 'gothic', 'boho', 'y2k', 'trendy', 'cute', 'funny', 'classic'
];

const CORE_PRODUCT_PATTERNS = [
  'sweatshirt', 'sudadera', 'hoodie', 'shirt', 'camisa', 'tshirt', 'camiseta', 'sweater',
  'jacket', 'jewelry', 'joyeria', 'necklace', 'collar', 'ring', 'anillo', 'bracelet', 'pulsera',
  'earrings', 'pendientes', 'mug', 'taza', 'tumbler', 'vaso', 'tote bag', 'bolso', 'hat', 'cap',
  'poster', 'print', 'blanket', 'manta', 'pillow', 'candle', 'keychain', 'llavero', 'card', 'tarjeta'
];

/**
 * Normalizes a string (lowercased, trimmed, whitespace collapsed)
 */
function normalizeText(str) {
  return String(str || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Classifies a single keyword or phrase into a semantic category
 */
function classifyKeywordCategory(keyword) {
  const norm = normalizeText(keyword);
  if (!norm) return 'general_longtail';

  // 1. Check Occasion / Holiday (Event-driven seasonality)
  if (OCCASION_PATTERNS.some(p => norm.includes(p))) {
    return 'occasion_holiday';
  }
  // 2. Check Recipient / Persona
  if (RECIPIENT_PATTERNS.some(p => norm.includes(p))) {
    return 'recipient_persona';
  }
  // 3. Check Style / Customization Attribute
  if (STYLE_PATTERNS.some(p => norm.includes(p))) {
    return 'style_attribute';
  }
  // 4. Check Core Product Type
  if (CORE_PRODUCT_PATTERNS.some(p => norm.includes(p))) {
    return 'core_product';
  }

  return 'general_longtail';
}

/**
 * Clusters a list of keywords into structured semantic groups
 */
function clusterKeywords(keywords = []) {
  const clusters = {
    core_product: [],
    recipient_persona: [],
    occasion_holiday: [],
    style_attribute: [],
    general_longtail: []
  };

  const seen = new Set();

  (keywords || []).forEach(item => {
    const term = typeof item === 'string' ? item : (item.keyword || item.term || item.tag || '');
    const clean = normalizeText(term);
    if (!clean || seen.has(clean)) return;
    seen.add(clean);

    // Trademark check
    let ipVerdict = 'CLEAR';
    let ipHits = [];
    try {
      const screen = ipGuard.screenText(clean);
      ipVerdict = screen.verdict;
      ipHits = screen.hits;
    } catch (e) {
      // If IP guard fails, fail-closed
      ipVerdict = 'BLOCK';
      ipHits = [{ term: clean, why: 'IP Guard scan unavailable' }];
    }

    if (ipVerdict === 'BLOCK') {
      return; // Omit trademark violations from clean clusters
    }

    const category = classifyKeywordCategory(clean);
    const kwObj = {
      term: clean,
      category,
      ipVerdict,
      ipHits,
      searchVolume: typeof item === 'object' && Number.isFinite(Number(item.searchVolume)) ? Number(item.searchVolume) : null,
      competition: typeof item === 'object' && Number.isFinite(Number(item.competition)) ? Number(item.competition) : null,
      cpc: typeof item === 'object' && Number.isFinite(Number(item.cpc)) ? Number(item.cpc) : null
    };

    clusters[category].push(kwObj);
  });

  return clusters;
}

/**
 * Analyzes only provider-supplied listing tags. Title phrases are deliberately
 * excluded so derived copy is never presented as an observed Etsy tag.
 */
function analyzeTagFrequency(listings = [], maxTags = 13) {
  const tagCounts = {};
  const tagOrigins = {};

  (listings || []).forEach((listing, index) => {
    const rawTags = [...new Set(Array.isArray(listing.tags) ? listing.tags : [])];
    rawTags.forEach(rawTag => {
      if (!rawTag || typeof rawTag !== 'string') return;
      const clean = normalizeText(rawTag.replace(/^[#\s]+|[#\s]+$/g, ''));
      if (clean.length < 3 || clean.length > 20) return;

      // Trademark screen
      try {
        const screen = ipGuard.screenText(clean);
        if (screen.verdict === 'BLOCK') return;
      } catch (e) {
        return; // drop if IP guard throws
      }

      tagCounts[clean] = (tagCounts[clean] || 0) + 1;
      if (!tagOrigins[clean]) {
        tagOrigins[clean] = [];
      }
      if (tagOrigins[clean].length < 3) {
        tagOrigins[clean].push(listing.shop || listing.title || `Seller #${index + 1}`);
      }
    });
  });

  // Sort by frequency descending
  const sortedTags = Object.keys(tagCounts)
    .map(tag => ({
      tag,
      count: tagCounts[tag],
      frequencyPercent: listings.length > 0 ? Math.round((tagCounts[tag] / listings.length) * 100) : 0,
      sampleSources: tagOrigins[tag] || []
    }))
    .sort((a, b) => b.count - a.count);

  const selected13Tags = sortedTags.slice(0, maxTags).map(t => t.tag);

  return {
    totalDistinctTags: sortedTags.length,
    rankedTags: sortedTags,
    selected13Tags
  };
}

function deriveTitlePhrases(listings = []) {
  const phrases = [];
  const seen = new Set();
  for (const listing of listings || []) {
    const candidates = String(listing.title || '')
      .split(/[,–—|/•:]+/)
      .map(normalizeText)
      .filter(value => value.length >= 3 && value.length <= 40);
    for (const phrase of candidates) {
      if (seen.has(phrase)) continue;
      try {
        if (ipGuard.screenText(phrase).verdict === 'BLOCK') continue;
      } catch (_) {
        continue;
      }
      seen.add(phrase);
      phrases.push({ phrase, evidenceState: 'DERIVED_FROM_TITLE' });
    }
  }
  return phrases.slice(0, 25);
}

/**
 * Computes price distribution and key market metrics from competitors
 */
function computePriceAndNicheAnalytics(listings = [], unitCost = null) {
  const prices = [];
  let totalViews24h = 0;
  let viewsCount = 0;
  let totalSold24h = 0;
  let soldCount = 0;

  (listings || []).forEach(l => {
    let p = null;
    if (typeof l.price === 'number' && Number.isFinite(l.price)) {
      p = l.price;
    } else if (typeof l.price === 'string') {
      const match = l.price.replace(/[^0-9.]/g, '');
      const parsed = parseFloat(match);
      if (Number.isFinite(parsed) && parsed > 0) p = parsed;
    }

    if (p !== null && p > 0) {
      prices.push(p);
    }

    if (Number.isFinite(Number(l.views24h)) && Number(l.views24h) >= 0) {
      totalViews24h += Number(l.views24h);
      viewsCount++;
    }
    if (Number.isFinite(Number(l.sold24h)) && Number(l.sold24h) >= 0) {
      totalSold24h += Number(l.sold24h);
      soldCount++;
    }
  });

  let minPrice = null;
  let maxPrice = null;
  let avgPrice = null;
  let medianPrice = null;

  if (prices.length > 0) {
    prices.sort((a, b) => a - b);
    minPrice = prices[0];
    maxPrice = prices[prices.length - 1];
    const sum = prices.reduce((acc, v) => acc + v, 0);
    avgPrice = parseFloat((sum / prices.length).toFixed(2));
    const mid = Math.floor(prices.length / 2);
    medianPrice = prices.length % 2 !== 0 ? prices[mid] : parseFloat(((prices[mid - 1] + prices[mid]) / 2).toFixed(2));
  }

  const cost = unitCost !== null && unitCost !== '' && Number.isFinite(Number(unitCost)) && Number(unitCost) >= 0
    ? Number(unitCost)
    : null;
  const benchmarkPrice = avgPrice || medianPrice || null;
  const estimatedPriceMinusUnitCost = (benchmarkPrice !== null && cost !== null) ? parseFloat((benchmarkPrice - cost).toFixed(2)) : null;
  const estimatedContributionMargin = (estimatedPriceMinusUnitCost !== null && benchmarkPrice !== null && benchmarkPrice > 0)
    ? parseFloat(((estimatedPriceMinusUnitCost / benchmarkPrice) * 100).toFixed(1))
    : null;

  return {
    competitorCount: listings.length,
    validPriceCount: prices.length,
    minPrice,
    maxPrice,
    avgPrice,
    medianPrice,
    avgViews24h: viewsCount > 0 ? Math.round(totalViews24h / viewsCount) : null,
    avgSold24h: soldCount > 0 ? Math.round(totalSold24h / soldCount) : null,
    economics: {
      enteredUnitCost: cost,
      benchmarkPrice,
      estimatedPriceMinusUnitCost,
      estimatedContributionMargin,
      publishGateEligible: false,
      disclaimer: 'Estimate excludes marketplace fees, payment fees, shipping, packaging, advertising, returns, and taxes.'
    }
  };
}

/**
 * Master synthesis function: Combines all layers into a complete intelligence payload
 */
function synthesizeNicheIntelligence({ seedPhrase, listings = [], keywords = [], unitCost = null }) {
  const clusters = clusterKeywords(keywords);
  const tagAnalytics = analyzeTagFrequency(listings, 13);
  const priceAnalytics = computePriceAndNicheAnalytics(listings, unitCost);
  const derivedTitlePhrases = deriveTitlePhrases(listings);

  // Extract Top Title Patterns from Bestsellers
  const bestsellerTitles = (listings || [])
    .filter(l => l.isBestseller || (l.sold24h && l.sold24h > 5))
    .slice(0, 5)
    .map(l => l.title);

  return {
    success: true,
    seedPhrase: String(seedPhrase || '').trim(),
    summary: {
      totalCompetitorsScanned: listings.length,
      totalKeywordsExtracted: keywords.length,
      avgMarketPrice: priceAnalytics.avgPrice,
      estimatedPriceMinusUnitCost: priceAnalytics.economics.estimatedPriceMinusUnitCost,
      estimatedContributionMargin: priceAnalytics.economics.estimatedContributionMargin,
      publishGateEligible: false
    },
    clusters,
    tagAnalytics,
    derivedTitlePhrases,
    priceAnalytics,
    bestsellerPatterns: bestsellerTitles
  };
}

module.exports = {
  classifyKeywordCategory,
  clusterKeywords,
  analyzeTagFrequency,
  deriveTitlePhrases,
  computePriceAndNicheAnalytics,
  synthesizeNicheIntelligence
};
