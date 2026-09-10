'use strict';

const assert = require('node:assert/strict');
const { storedResearch } = require('../server/commerceIntelligence');

const cerebro = storedResearch.normalizeCerebroRows([
  { 'Keyword Phrase': 'collar para mi hija', 'Search Volume': '1,200', 'Keyword Sales': '44',
    'Cerebro IQ Score': '900', 'Search Volume Trend': '-5%', 'Competing Products': '2,000',
    CPR: '12', 'Title Density': '7', 'H10 PPC Sugg. Bid': '$1.35', 'Position (Rank)': '3' },
  { 'Frase Clave': 'COLLAR PARA MI HIJA', 'Search Volume': '900', 'Keyword Sales': '',
    'H10 PPC Sugg Bid': '', 'Position (Rank)': '8' },
  { 'Keyword Phrase': 'regalo hija', 'Search Volume': '', 'Keyword Sales': '' },
  { 'Keyword Phrase': '   ', 'Search Volume': '99' }
], { importId: 11, sheet: 'Cerebro' });

assert.deepEqual(cerebro.accounting, {
  inputRows: 4, nonEmptyRows: 3, blankRows: 1, uniquePhrases: 2, duplicateObservations: 1
});
assert.equal(cerebro.keywords[0].phrase, 'collar para mi hija');
assert.equal(cerebro.keywords[0].searchVolume, 1200);
assert.equal(cerebro.keywords[0].positionRank, 3);
assert.equal(cerebro.keywords[0].bid, 1.35);
assert.deepEqual(cerebro.keywords[0].sourceRows, [2, 3]);
assert.equal(cerebro.keywords[0].occurrences, 2);
assert.equal(cerebro.keywords[1].searchVolume, null);
assert.equal(cerebro.keywords[1].keywordSales, null);
assert.equal(cerebro.observations.length, 3);
assert.deepEqual(cerebro.keywords[0].provenance, [
  { importId: 11, sheet: 'Cerebro', sourceRow: 2 },
  { importId: 11, sheet: 'Cerebro', sourceRow: 3 }
]);

const xray = storedResearch.normalizeXrayRows([{
  ASIN: ' b0abc12345 ', 'Product Details': 'Collar Para Mi Hija', Brand: 'Example',
  'Price $': '$29.99', 'ASIN Sales': '1,005', 'Parent Level Sales': '2,004',
  'ASIN Revenue': '$30,000', 'Parent Level Revenue': '$60,000', 'Title Char. Count': '72',
  BSR: '#1,234', 'Review Count': '88', Ratings: '4.7', Fulfillment: 'FBA', Seller: 'Example LLC',
  'Seller Country/Region': 'US', 'Active Sellers': '2', Category: 'Necklaces', 'Creation Date': '2024-01-02'
}], { importId: 12, sheet: 'Xray' });
assert.deepEqual({
  asin: xray[0].asin, title: xray[0].title, brand: xray[0].brand, price: xray[0].price,
  asinSales: xray[0].asinSales, parentSales: xray[0].parentSales,
  asinRevenue: xray[0].asinRevenue, parentRevenue: xray[0].parentRevenue,
  titleChars: xray[0].titleChars, bsr: xray[0].bsr, reviews: xray[0].reviews,
  rating: xray[0].rating, fulfillment: xray[0].fulfillment, seller: xray[0].seller,
  sellerCountry: xray[0].sellerCountry, activeSellers: xray[0].activeSellers,
  category: xray[0].category, creationDate: xray[0].creationDate, provenance: xray[0].provenance
}, {
  asin: 'B0ABC12345', title: 'Collar Para Mi Hija', brand: 'Example', price: 29.99,
  asinSales: 1005, parentSales: 2004, asinRevenue: 30000, parentRevenue: 60000,
  titleChars: 72, bsr: 1234, reviews: 88, rating: 4.7, fulfillment: 'FBA',
  seller: 'Example LLC', sellerCountry: 'US', activeSellers: 2, category: 'Necklaces',
  creationDate: '2024-01-02', provenance: { importId: 12, sheet: 'Xray', sourceRow: 2 }
});
assert.equal(xray[0].sourceFields['Product Details'], 'Collar Para Mi Hija');
assert.equal(cerebro.observations[0].sourceFields['Position (Rank)'], '3');
console.log('G4 stored research normalization: 17/17 PASS');
