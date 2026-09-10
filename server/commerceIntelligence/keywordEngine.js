'use strict';
// Cerebro / X-Ray extraction + keyword scoring.
const { fold, contentTokens } = require('./text');

const NUM = value => {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/[, ]/g, '').replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

const CEREBRO_COLUMNS = {
  phrase: ['keyword phrase', 'keyword', 'search term', 'frase clave'],
  keywordSales: ['keyword sales'],
  iq: ['cerebro iq score'],
  searchVolume: ['search volume'],
  trend: ['search volume trend'],
  competingProducts: ['competing products'],
  cpr: ['cpr'],
  titleDensity: ['title density'],
  bid: ['h10 ppc sugg. bid', 'h10 ppc sugg bid'],
  positionRank: ['position (rank)']
};

function buildColumnMap(header) {
  const normalized = header.map(h => fold(h).trim());
  const map = {};
  for (const key of Object.keys(CEREBRO_COLUMNS)) {
    for (const label of CEREBRO_COLUMNS[key]) {
      const index = normalized.indexOf(fold(label));
      if (index >= 0) { map[key] = index; break; }
    }
  }
  return map;
}

// A Cerebro sheet is any sheet whose header row carries a keyword-phrase
// column and a search-volume column. Workbooks in real use hold one sheet per
// anchor (esposa / navidad / collar ...), so every matching sheet is read and
// the rows are merged, keeping the strongest observation per phrase.
function extractKeywords(sheets) {
  const byPhrase = new Map();
  const sourceSheets = [];
  let rawRows = 0;
  for (const sheet of sheets) {
    const header = sheet.rows[0] || [];
    const map = buildColumnMap(header);
    if (map.phrase === undefined || map.searchVolume === undefined) continue;
    sourceSheets.push(sheet.name);
    for (let r = 1; r < sheet.rows.length; r++) {
      const row = sheet.rows[r] || [];
      const phrase = String(row[map.phrase] ?? '').trim();
      if (!phrase) continue;
      rawRows++;
      const record = {
        phrase,
        searchVolume: NUM(row[map.searchVolume]) ?? 0,
        keywordSales: map.keywordSales !== undefined ? NUM(row[map.keywordSales]) : null,
        iq: map.iq !== undefined ? NUM(row[map.iq]) : null,
        trend: map.trend !== undefined ? NUM(row[map.trend]) : null,
        competingProducts: map.competingProducts !== undefined ? NUM(row[map.competingProducts]) : null,
        cpr: map.cpr !== undefined ? NUM(row[map.cpr]) : null,
        titleDensity: map.titleDensity !== undefined ? NUM(row[map.titleDensity]) : null,
        bid: map.bid !== undefined ? NUM(row[map.bid]) : null,
        positionRank: map.positionRank !== undefined ? NUM(row[map.positionRank]) : null,
        sheets: [sheet.name]
      };
      const key = fold(phrase);
      const existing = byPhrase.get(key);
      if (!existing) { byPhrase.set(key, record); continue; }
      // Same phrase seen on several anchor sheets: keep the highest observed
      // search volume and remember every sheet it appeared on.
      if (record.searchVolume > existing.searchVolume) {
        record.sheets = [...new Set([...existing.sheets, sheet.name])];
        byPhrase.set(key, record);
      } else {
        existing.sheets = [...new Set([...existing.sheets, sheet.name])];
      }
    }
  }
  return { keywords: [...byPhrase.values()], sourceSheets, rawRows, uniquePhrases: byPhrase.size };
}

const XRAY_COLUMNS = {
  title: ['product details', 'title'],
  asin: ['asin'],
  brand: ['brand'],
  price: ['price $', 'price'],
  sales: ['asin sales', 'parent level sales'],
  revenue: ['asin revenue'],
  titleChars: ['title char. count', 'title char count'],
  bsr: ['bsr'],
  reviews: ['review count'],
  rating: ['ratings']
};

function extractCompetitors(sheets) {
  for (const sheet of sheets) {
    const header = sheet.rows[0] || [];
    const normalized = header.map(h => fold(h).trim());
    const map = {};
    for (const key of Object.keys(XRAY_COLUMNS)) {
      for (const label of XRAY_COLUMNS[key]) {
        const index = normalized.indexOf(fold(label));
        if (index >= 0) { map[key] = index; break; }
      }
    }
    if (map.title === undefined || map.asin === undefined) continue;
    const rows = [];
    for (let r = 1; r < sheet.rows.length; r++) {
      const row = sheet.rows[r] || [];
      const title = String(row[map.title] ?? '').trim();
      const asin = String(row[map.asin] ?? '').trim();
      if (!title && !asin) continue;
      rows.push({
        title, asin,
        brand: map.brand !== undefined ? String(row[map.brand] ?? '').trim() : '',
        price: map.price !== undefined ? NUM(row[map.price]) : null,
        sales: map.sales !== undefined ? NUM(row[map.sales]) : null,
        revenue: map.revenue !== undefined ? NUM(row[map.revenue]) : null,
        titleChars: map.titleChars !== undefined ? NUM(row[map.titleChars]) : null,
        bsr: map.bsr !== undefined ? NUM(row[map.bsr]) : null,
        reviews: map.reviews !== undefined ? NUM(row[map.reviews]) : null
      });
    }
    if (rows.length) return { sheet: sheet.name, rows };
  }
  return { sheet: null, rows: [] };
}

// Relevance is anchor-driven on purpose: the operator states what the product
// actually is, and only phrases sharing vocabulary with those anchors can
// enter the listing. Nothing here infers meaning on its own.
function relevanceScore(phrase, anchorTokenSets) {
  const phraseTokens = new Set(contentTokens(phrase));
  if (!phraseTokens.size || !anchorTokenSets.length) return 0;
  let best = 0;
  for (const anchor of anchorTokenSets) {
    if (!anchor.size) continue;
    let shared = 0;
    for (const token of anchor) if (phraseTokens.has(token)) shared++;
    best = Math.max(best, shared / anchor.size);
  }
  return best;
}

// Cerebro returns real shopper phrases AND long competitor title dumps
// ("mousya oversized mama sweatshirt woman mama letter print pullover ...").
// The dumps still carry useful tokens for backend search terms, but they must
// never be lifted into a title. Shopper phrases sit at 2-6 tokens.
function phraseQuality(phrase) {
  const count = contentTokens(phrase).length;
  if (count === 0) return 0;
  if (count <= 6) return 1;
  if (count <= 8) return 0.6;
  if (count <= 11) return 0.25;
  return 0.08;
}

const WEIGHTS = Object.freeze({ demand: 0.30, relevance: 0.30, gap: 0.12, sales: 0.10, competition: 0.05, quality: 0.13 });

// Rival brand names that are not in the IP library still leak into Cerebro
// exports ("giftify mama nursing sweatshirt", "blooming jelly mama bear ...").
// A leading token that occurs in only one or two phrases across the whole
// corpus is almost always such a brand. This flags them for the operator; it
// never deletes them silently, because a legitimate niche word can look the
// same and only the operator knows the product.
function documentFrequency(keywords) {
  const df = new Map();
  const leading = new Map();
  for (const keyword of keywords) {
    const list = contentTokens(keyword.phrase);
    const unique = new Set(list);
    for (const token of unique) df.set(token, (df.get(token) || 0) + 1);
    if (list.length) {
      const entry = leading.get(list[0]) || { count: 0, totalLength: 0 };
      entry.count++;
      entry.totalLength += list.length;
      leading.set(list[0], entry);
    }
  }
  return { df, leading };
}

// Seller brands in a Cerebro export ("myhalf", "lotucy", "leedya", "jbf")
// can appear across several listings, so a raw frequency cut misses them.
// Their real signature is positional: the token is almost always the FIRST
// word of the phrase, because that is where a scraped competitor title puts
// the store name. Ordinary vocabulary ("mama", "gift", "memaw") is spread
// through the middle of phrases instead.
// Frequency-based signals need a corpus large enough for a frequency to mean
// anything. On a 40-row export every token is "rare", which would flag the
// entire vocabulary as rival brands and leave the listing empty. Below this
// size the tool trusts the operator's own anchors and IP library instead.
const MIN_CORPUS_FOR_FREQUENCY_SIGNALS = 50;

function brandLikeTokens({ df, leading }, anchorVocabulary, { maxDf = 12, leadShare = 0.6, minLeadLength = 7, corpusSize = 0 } = {}) {
  const suspects = new Set();
  if (corpusSize < MIN_CORPUS_FOR_FREQUENCY_SIGNALS) return suspects;
  for (const [token, count] of df.entries()) {
    if (anchorVocabulary.has(token)) continue;
    if (token.length < 3 || /^\d+$/.test(token)) continue;
    if (count > maxDf) continue;
    const lead = leading.get(token);
    if (!lead || lead.count < 2 || lead.count / count < leadShare) continue;
    // Ordinary words also start phrases ("best gift for mom", "girl mom
    // era"), but those phrases are SHORT. A store name leads a long scraped
    // competitor title. Requiring both conditions keeps normal vocabulary.
    if (lead.totalLength / lead.count < minLeadLength) continue;
    suspects.add(token);
  }
  return suspects;
}

const RARE_TOKEN_MAX_DF = 3;

function suspectedBrandToken(phrase, stats, anchorVocabulary, brandSet) {
  const list = contentTokens(phrase);
  if (!list.length) return null;
  for (const token of list.slice(0, 3)) {
    if (anchorVocabulary.has(token)) continue;
    if (token.length < 3 || /^\d+$/.test(token)) continue;
    if (brandSet.has(token)) return token;
  }
  return null;
}

const METRIC_USAGE = Object.freeze({
  searchVolume: 'score+filter', keywordSales: 'score_when_present', iq: 'diagnostic',
  trend: 'diagnostic', competingProducts: 'score_when_present', cpr: 'diagnostic',
  titleDensity: 'score_when_present', bid: 'ppc_export', positionRank: 'diagnostic'
});

function metricAvailability(keywords) {
  const result = {};
  for (const field of Object.keys(METRIC_USAGE)) {
    const present = keywords.filter(k => k[field] !== null && k[field] !== undefined).length;
    result[field] = { present, total: keywords.length,
      coveragePercent: keywords.length ? Math.round((present / keywords.length) * 100) : 0,
      usage: METRIC_USAGE[field] };
  }
  return result;
}

function scoreKeywords(keywords, { anchors = [], library = null, screen = null, minSearchVolume = 0, negativeKeywords = [] } = {}) {
  const anchorTokenSets = anchors.map(a => new Set(contentTokens(a))).filter(s => s.size);
  const anchorVocabulary = new Set(anchorTokenSets.flatMap(set => [...set]));
  const stats = documentFrequency(keywords);
  const df = stats.df;
  const brandSet = brandLikeTokens(stats, anchorVocabulary, { corpusSize: keywords.length });
  const rareReviewTokens = new Set();
  if (keywords.length >= MIN_CORPUS_FOR_FREQUENCY_SIGNALS) {
    for (const [token, count] of df.entries()) if (count <= RARE_TOKEN_MAX_DF && !anchorVocabulary.has(token)) rareReviewTokens.add(token);
  }
  const maxVolume = Math.max(1, ...keywords.map(k => k.searchVolume || 0));
  const knownSales = keywords.map(k => k.keywordSales).filter(v => v !== null && v !== undefined);
  const maxSales = Math.max(1, ...knownSales, 1);
  const negatives = negativeKeywords.map(n => fold(n).trim()).filter(Boolean);
  const scored = [];
  const preRejected = [];
  for (const keyword of keywords) {
    if ((keyword.searchVolume || 0) < minSearchVolume) {
      preRejected.push({ phrase: keyword.phrase, searchVolume: keyword.searchVolume,
        code: 'BELOW_MIN_SEARCH_VOLUME', detail: `Search Volume ${keyword.searchVolume || 0} below minimum ${minSearchVolume}` });
      continue;
    }
    const folded = fold(keyword.phrase);
    const negativeHit = negatives.find(n => new RegExp('(^|[^a-z0-9])' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)').test(folded));
    const relevance = relevanceScore(keyword.phrase, anchorTokenSets);
    const demand = Math.log10((keyword.searchVolume || 0) + 1) / Math.log10(maxVolume + 1);
    const sales = keyword.keywordSales === null || keyword.keywordSales === undefined ? null : Math.log10(keyword.keywordSales + 1) / Math.log10(maxSales + 1);
    const gap = keyword.titleDensity === null || keyword.titleDensity === undefined ? null : 1 - Math.min(keyword.titleDensity, 40) / 40;
    const competition = keyword.competingProducts === null || keyword.competingProducts === undefined ? null : 1 / Math.log10(Math.max(keyword.competingProducts, 1) + 10);
    const quality = phraseQuality(keyword.phrase);
    const components = { demand, relevance, gap, sales, competition, quality };
    let weighted = 0, activeWeight = 0;
    for (const [name, value] of Object.entries(components)) {
      if (!Number.isFinite(value)) continue;
      weighted += WEIGHTS[name] * value; activeWeight += WEIGHTS[name];
    }
    const rawScore = activeWeight ? weighted / activeWeight : 0;
    const brandToken = suspectedBrandToken(keyword.phrase, stats, anchorVocabulary, brandSet);
    const rareReviewToken = contentTokens(keyword.phrase).find(t => rareReviewTokens.has(t)) || null;
    const score = brandToken ? rawScore * 0.55 : rawScore;
    const ip = library && screen ? screen(keyword.phrase, library) : { verdict: 'OK', hits: [] };
    scored.push({ ...keyword, relevance, demand, gap, competitionScore: competition, quality,
      tokenCount: contentTokens(keyword.phrase).length, suspectedBrand: brandToken, rareReviewToken,
      negativeHit: negativeHit || null, score: negativeHit ? score * 0.1 : score, rawScore,
      scoreComponentsUsed: Object.fromEntries(Object.entries(components).filter(([,v]) => Number.isFinite(v))),
      ipVerdict: ip.verdict, ipHits: ip.hits });
  }
  scored.sort((a, b) => b.score - a.score);
  Object.defineProperty(scored, 'meta', { value: { df, leading: stats.leading, rareReviewTokens,
    brandTokens: brandSet, anchorVocabulary, preRejected, inputUniquePhrases: keywords.length,
    scoredPhrases: scored.length, metricAvailability: metricAvailability(keywords) }, enumerable: false });
  return scored;
}

module.exports = { extractKeywords, extractCompetitors, scoreKeywords, relevanceScore, phraseQuality, suspectedBrandToken, brandLikeTokens, metricAvailability, MIN_CORPUS_FOR_FREQUENCY_SIGNALS, WEIGHTS };
