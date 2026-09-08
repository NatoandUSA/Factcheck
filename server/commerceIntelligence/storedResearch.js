'use strict';
const { fold } = require('./text');

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const cleaned = String(value).replace(/[, ]/g, '').replace(/[^0-9.\-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function lookup(row, labels) {
  if (!row || typeof row !== 'object') return undefined;
  const map = new Map(Object.keys(row).map(key => [fold(key).trim(), key]));
  for (const label of labels) {
    const original = map.get(fold(label).trim());
    if (original !== undefined) return row[original];
  }
  return undefined;
}

const CEREBRO = {
  phrase: ['keyword phrase','keyword','search term','frase clave'],
  searchVolume: ['search volume'], keywordSales: ['keyword sales'], iq: ['cerebro iq score'],
  trend: ['search volume trend'], competingProducts: ['competing products'], cpr: ['cpr'],
  titleDensity: ['title density'], bid: ['h10 ppc sugg. bid','h10 ppc sugg bid'], positionRank: ['position (rank)']
};
function normalizeCerebroRows(rows) {
  const byPhrase = new Map();
  let inputRows = 0;
  rows.forEach((row, index) => {
    const phrase = String(lookup(row, CEREBRO.phrase) ?? '').trim();
    if (!phrase) return;
    inputRows++;
    const record = {
      phrase,
      searchVolume: num(lookup(row, CEREBRO.searchVolume)) ?? 0,
      keywordSales: num(lookup(row, CEREBRO.keywordSales)),
      iq: num(lookup(row, CEREBRO.iq)),
      trend: num(lookup(row, CEREBRO.trend)),
      competingProducts: num(lookup(row, CEREBRO.competingProducts)),
      cpr: num(lookup(row, CEREBRO.cpr)),
      titleDensity: num(lookup(row, CEREBRO.titleDensity)),
      bid: num(lookup(row, CEREBRO.bid)),
      positionRank: num(lookup(row, CEREBRO.positionRank)),
      sourceRows: [index + 1], occurrences: 1
    };
    const key = fold(phrase).trim();
    const prior = byPhrase.get(key);
    if (!prior) return byPhrase.set(key, record);
    prior.occurrences++;
    prior.sourceRows.push(index + 1);
    if (record.searchVolume > prior.searchVolume) {
      record.occurrences = prior.occurrences;
      record.sourceRows = prior.sourceRows;
      byPhrase.set(key, record);
    }
  });
  return {
    keywords: [...byPhrase.values()],
    accounting: { inputRows, uniquePhrases: byPhrase.size, duplicateObservations: inputRows - byPhrase.size }
  };
}

const XRAY = {
  asin: ['asin'], title: ['product details','title','product name'], brand: ['brand'], price: ['price $','price'],
  asinSales: ['asin sales'], parentSales: ['parent level sales','parent sales'],
  asinRevenue: ['asin revenue'], parentRevenue: ['parent level revenue','parent revenue'],
  titleChars: ['title char. count','title char count','title length'], bsr: ['bsr','rank'],
  reviews: ['review count','reviews'], rating: ['ratings','rating'], fulfillment: ['fulfillment'],
  seller: ['seller','sold by'], sellerCountry: ['seller country/region','seller country'],
  activeSellers: ['active sellers','sellers'], category: ['category'], creationDate: ['creation date','date first available']
};

function normalizeXrayRows(rows) {
  return rows.map((row, index) => ({
    asin: String(lookup(row, XRAY.asin) ?? '').trim().toUpperCase(),
    title: String(lookup(row, XRAY.title) ?? '').trim(),
    brand: String(lookup(row, XRAY.brand) ?? '').trim() || null,
    price: num(lookup(row, XRAY.price)), asinSales: num(lookup(row, XRAY.asinSales)),
    parentSales: num(lookup(row, XRAY.parentSales)), asinRevenue: num(lookup(row, XRAY.asinRevenue)),
    parentRevenue: num(lookup(row, XRAY.parentRevenue)), titleChars: num(lookup(row, XRAY.titleChars)),
    bsr: num(lookup(row, XRAY.bsr)), reviews: num(lookup(row, XRAY.reviews)), rating: num(lookup(row, XRAY.rating)),
    fulfillment: lookup(row, XRAY.fulfillment) ?? null, seller: lookup(row, XRAY.seller) ?? null,
    sellerCountry: lookup(row, XRAY.sellerCountry) ?? null, activeSellers: num(lookup(row, XRAY.activeSellers)),
    category: lookup(row, XRAY.category) ?? null, creationDate: lookup(row, XRAY.creationDate) ?? null,
    sourceRow: index + 1
  }));
}
function extractOwnAsinsFromReferenceRows(rows) {
  const own = new Map();
  rows.forEach((row, index) => {
    const asin = String(lookup(row, ['asin']) ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(asin)) return;
    own.set(asin, `REFERENCE row ${index + 1}`);
  });
  return own;
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
  return String(value || '').split(/[;\n]/).map(v => v.trim()).filter(Boolean);
}

function factsToAmazonTruth(facts = {}) {
  return {
    productType: String(facts.productType || '').trim(),
    productName: String(facts.productName || '').trim(),
    recipient: String(facts.recipient || '').trim(),
    occasion: String(facts.occasion || '').trim(),
    materials: splitList(facts.materials), sizes: splitList(facts.sizes), colors: splitList(facts.colors),
    features: splitList(facts.features || facts.design),
    personalization: String(facts.personalization || '').trim(),
    packaging: String(facts.packaging || '').trim(), care: String(facts.care || '').trim(),
    shipFrom: String(facts.shipFrom || '').trim()
  };
}

module.exports = { normalizeCerebroRows, normalizeXrayRows, extractOwnAsinsFromReferenceRows,
  factsToAmazonTruth, lookup, num, splitList };
