'use strict';

const { fold } = require('./text');
const { sourceRowNumber } = require('../services/spreadsheetReader');

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const cleaned = String(value).replace(/[, ]/g, '').replace(/[^0-9.\-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function lookup(row, labels) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return undefined;
  const indexed = new Map(Object.keys(row).map(key => [fold(key).trim(), key]));
  for (const label of labels) {
    const original = indexed.get(fold(label).trim());
    if (original !== undefined) return row[original];
  }
  return undefined;
}

function jsonSourceValue(value) {
  if (value === null || value === undefined || typeof value === 'string' ||
    typeof value === 'number' || typeof value === 'boolean') return value ?? null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function sourceFields(row) {
  return Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [key, jsonSourceValue(value)]));
}

const CEREBRO = Object.freeze({
  phrase: ['keyword phrase', 'keyword', 'search term', 'frase clave'],
  searchVolume: ['search volume'], keywordSales: ['keyword sales'], iq: ['cerebro iq score'],
  trend: ['search volume trend'], competingProducts: ['competing products'], cpr: ['cpr'],
  titleDensity: ['title density'], bid: ['h10 ppc sugg. bid', 'h10 ppc sugg bid'],
  minBid: ['h10 ppc sugg. min bid', 'h10 ppc sugg min bid'],
  maxBid: ['h10 ppc sugg. max bid', 'h10 ppc sugg max bid'],
  sponsoredAsins: ['sponsored asins'], organic: ['organic'], sponsoredProduct: ['sponsored product'],
  amazonRecommended: ['amazon recommended'], amazonChoice: ['amazon choice'], highlyRated: ['highly rated'],
  sponsoredBrandHeader: ['sponsored brand header'], sponsoredBrandVideo: ['sponsored brand video'],
  topRatedFromOurBrand: ['top rated from our brand'], trendingNow: ['trending now'],
  sponsoredRankAverage: ['sponsored rank (avg)'], sponsoredRankCount: ['sponsored rank (count)'],
  amazonRecommendedRankAverage: ['amazon recommended rank (avg)'],
  amazonRecommendedRankCount: ['amazon recommended rank (count)'], relativeRank: ['relative rank'],
  competitorRankAverage: ['competitor rank (avg)'], rankingCompetitorsCount: ['ranking competitors (count)'],
  competitorPerformanceScore: ['competitor performance score'],
  positionRank: ['position (rank)']
});

function normalizeCerebroRows(rows = [], source = {}) {
  const byPhrase = new Map();
  const observations = [];
  let nonEmptyRows = 0;
  rows.forEach((row, index) => {
    const sourceRow = sourceRowNumber(row, index + 2);
    const phrase = String(lookup(row, CEREBRO.phrase) ?? '').trim();
    if (!phrase) return;
    nonEmptyRows++;
    const record = {
      phrase, searchVolume: numberOrNull(lookup(row, CEREBRO.searchVolume)),
      keywordSales: numberOrNull(lookup(row, CEREBRO.keywordSales)),
      iq: numberOrNull(lookup(row, CEREBRO.iq)), trend: numberOrNull(lookup(row, CEREBRO.trend)),
      competingProducts: numberOrNull(lookup(row, CEREBRO.competingProducts)),
      cpr: numberOrNull(lookup(row, CEREBRO.cpr)), titleDensity: numberOrNull(lookup(row, CEREBRO.titleDensity)),
      bid: numberOrNull(lookup(row, CEREBRO.bid)), positionRank: numberOrNull(lookup(row, CEREBRO.positionRank)),
      minBid: numberOrNull(lookup(row, CEREBRO.minBid)), maxBid: numberOrNull(lookup(row, CEREBRO.maxBid)),
      sponsoredAsins: numberOrNull(lookup(row, CEREBRO.sponsoredAsins)),
      organic: numberOrNull(lookup(row, CEREBRO.organic)), sponsoredProduct: numberOrNull(lookup(row, CEREBRO.sponsoredProduct)),
      amazonRecommended: numberOrNull(lookup(row, CEREBRO.amazonRecommended)),
      amazonChoice: numberOrNull(lookup(row, CEREBRO.amazonChoice)), highlyRated: numberOrNull(lookup(row, CEREBRO.highlyRated)),
      sponsoredBrandHeader: numberOrNull(lookup(row, CEREBRO.sponsoredBrandHeader)),
      sponsoredBrandVideo: numberOrNull(lookup(row, CEREBRO.sponsoredBrandVideo)),
      topRatedFromOurBrand: numberOrNull(lookup(row, CEREBRO.topRatedFromOurBrand)),
      trendingNow: numberOrNull(lookup(row, CEREBRO.trendingNow)),
      sponsoredRankAverage: numberOrNull(lookup(row, CEREBRO.sponsoredRankAverage)),
      sponsoredRankCount: numberOrNull(lookup(row, CEREBRO.sponsoredRankCount)),
      amazonRecommendedRankAverage: numberOrNull(lookup(row, CEREBRO.amazonRecommendedRankAverage)),
      amazonRecommendedRankCount: numberOrNull(lookup(row, CEREBRO.amazonRecommendedRankCount)),
      relativeRank: numberOrNull(lookup(row, CEREBRO.relativeRank)),
      competitorRankAverage: numberOrNull(lookup(row, CEREBRO.competitorRankAverage)),
      rankingCompetitorsCount: numberOrNull(lookup(row, CEREBRO.rankingCompetitorsCount)),
      competitorPerformanceScore: numberOrNull(lookup(row, CEREBRO.competitorPerformanceScore)),
      sourceFields: sourceFields(row),
      sourceRows: [sourceRow], occurrences: 1,
      provenance: [{ importId: source.importId ?? null, sheet: source.sheet ?? null, sourceRow }]
    };
    const { sourceRows: _sourceRows, occurrences: _occurrences, ...observation } = record;
    observations.push(Object.freeze(observation));
    const key = fold(phrase).trim();
    const prior = byPhrase.get(key);
    if (!prior) { byPhrase.set(key, record); return; }
    prior.occurrences++;
    prior.sourceRows.push(sourceRow);
    prior.provenance.push(record.provenance[0]);
    if (record.searchVolume > prior.searchVolume) {
      record.occurrences = prior.occurrences;
      record.sourceRows = prior.sourceRows;
      record.provenance = prior.provenance;
      byPhrase.set(key, record);
    }
  });
  return Object.freeze({ keywords: [...byPhrase.values()], observations, accounting: Object.freeze({
    inputRows: rows.length, nonEmptyRows, blankRows: rows.length - nonEmptyRows,
    uniquePhrases: byPhrase.size, duplicateObservations: nonEmptyRows - byPhrase.size
  }) });
}

const XRAY = Object.freeze({
  asin: ['asin'], title: ['product details', 'title', 'product name'], brand: ['brand'],
  price: ['price $', 'price'], asinSales: ['asin sales'], parentSales: ['parent level sales', 'parent sales'],
  asinRevenue: ['asin revenue'], parentRevenue: ['parent level revenue', 'parent revenue'],
  titleChars: ['title char. count', 'title char count', 'title length'], bsr: ['bsr', 'rank'],
  reviews: ['review count', 'reviews'], rating: ['ratings', 'rating'], fulfillment: ['fulfillment'],
  seller: ['seller', 'sold by'], sellerCountry: ['seller country/region', 'seller country'],
  activeSellers: ['active sellers', 'sellers'], category: ['category'], creationDate: ['creation date', 'date first available'],
  url: ['url'], imageUrl: ['image url'], recentPurchases: ['recent purchases'], fees: ['fees $', 'fees'],
  images: ['images'], reviewVelocity: ['review velocity'], buyBox: ['buy box'], sizeTier: ['size tier'],
  dimensions: ['dimensions'], weight: ['weight'], abaMostClicked: ['aba most clicked'], sponsored: ['sponsored'],
  bestSeller: ['best seller'], sellerAgeMonths: ['seller age (mo)']
});

function normalizeXrayRows(rows = [], source = {}) {
  return rows.map((row, index) => ({
    asin: String(lookup(row, XRAY.asin) ?? '').trim().toUpperCase(),
    title: String(lookup(row, XRAY.title) ?? '').trim(), brand: String(lookup(row, XRAY.brand) ?? '').trim() || null,
    price: numberOrNull(lookup(row, XRAY.price)), asinSales: numberOrNull(lookup(row, XRAY.asinSales)),
    parentSales: numberOrNull(lookup(row, XRAY.parentSales)), asinRevenue: numberOrNull(lookup(row, XRAY.asinRevenue)),
    parentRevenue: numberOrNull(lookup(row, XRAY.parentRevenue)), titleChars: numberOrNull(lookup(row, XRAY.titleChars)),
    bsr: numberOrNull(lookup(row, XRAY.bsr)), reviews: numberOrNull(lookup(row, XRAY.reviews)),
    rating: numberOrNull(lookup(row, XRAY.rating)), fulfillment: jsonSourceValue(lookup(row, XRAY.fulfillment)),
    seller: jsonSourceValue(lookup(row, XRAY.seller)), sellerCountry: jsonSourceValue(lookup(row, XRAY.sellerCountry)),
    activeSellers: numberOrNull(lookup(row, XRAY.activeSellers)), category: jsonSourceValue(lookup(row, XRAY.category)),
    creationDate: jsonSourceValue(lookup(row, XRAY.creationDate)),
    url: jsonSourceValue(lookup(row, XRAY.url)), imageUrl: jsonSourceValue(lookup(row, XRAY.imageUrl)),
    recentPurchases: numberOrNull(lookup(row, XRAY.recentPurchases)), fees: numberOrNull(lookup(row, XRAY.fees)),
    images: numberOrNull(lookup(row, XRAY.images)), reviewVelocity: numberOrNull(lookup(row, XRAY.reviewVelocity)),
    buyBox: jsonSourceValue(lookup(row, XRAY.buyBox)), sizeTier: jsonSourceValue(lookup(row, XRAY.sizeTier)),
    dimensions: jsonSourceValue(lookup(row, XRAY.dimensions)), weight: jsonSourceValue(lookup(row, XRAY.weight)),
    abaMostClicked: jsonSourceValue(lookup(row, XRAY.abaMostClicked)), sponsored: jsonSourceValue(lookup(row, XRAY.sponsored)),
    bestSeller: jsonSourceValue(lookup(row, XRAY.bestSeller)), sellerAgeMonths: numberOrNull(lookup(row, XRAY.sellerAgeMonths)),
    sourceFields: sourceFields(row),
    provenance: { importId: source.importId ?? null, sheet: source.sheet ?? null,
      sourceRow: sourceRowNumber(row, index + 2) }
  }));
}

module.exports = Object.freeze({ lookup, normalizeCerebroRows, normalizeXrayRows, numberOrNull, sourceFields });
