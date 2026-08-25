const assert = require('assert');
const { evaluateEtsyNiche } = require('../server/etsyNicheEvaluator');

const report = evaluateEtsyNiche({
  seedPhrase: 'para mi hija',
  sellers: [
    { title: 'Para mi hija necklace personalized gift', tags: ['para mi hija', 'daughter gift'], country: 'VN', ageDays: 18, sold24h: 8, views24h: 400, totalSold: 80, totalViews: 4000, priceAmount: 19.99, conversionRate: 3.5, isAd: false },
    { title: 'Spanish daughter keepsake', tags: ['daughter gift', 'spanish gift'], country: 'US', ageDays: 50, sold24h: 2, views24h: 200, totalSold: 200, totalViews: 5000, priceAmount: 24.99, conversionRate: 2.2, isAd: true },
    { title: 'Custom daughter gift', tags: ['custom gift'], country: 'CN', ageDays: 220, sold24h: 0, views24h: 20, totalSold: 500, totalViews: 9000, priceAmount: 15.99, conversionRate: 0.8, isAd: false },
    { title: 'Mother daughter present', tags: ['mother daughter'], country: 'VN', ageDays: 30, sold24h: 1, views24h: 80, totalSold: 10, totalViews: 500, priceAmount: 21.99, conversionRate: 1.8, isAd: false },
    { title: 'Daughter jewelry', tags: ['jewelry gift'], country: 'US', ageDays: 100, sold24h: 0, views24h: 30, totalSold: 20, totalViews: 700, priceAmount: 29.99, conversionRate: 1.1, isAd: false },
    { title: 'Personalized keepsake', tags: ['personalized gift'], country: 'VN', ageDays: 60, sold24h: 2, views24h: 90, totalSold: 30, totalViews: 800, priceAmount: 18.99, conversionRate: 2.5, isAd: false },
    { title: 'Gift for daughter', tags: ['gift for daughter'], country: 'US', ageDays: 70, sold24h: 1, views24h: 60, totalSold: 25, totalViews: 600, priceAmount: 22.99, conversionRate: 1.6, isAd: false },
    { title: 'Daughter necklace', tags: ['daughter necklace'], country: 'VN', ageDays: 88, sold24h: 1, views24h: 70, totalSold: 18, totalViews: 500, priceAmount: 20.99, conversionRate: 2.1, isAd: false },
    { title: 'Custom family gift', tags: ['family gift'], country: 'US', ageDays: 120, sold24h: 0, views24h: 25, totalSold: 40, totalViews: 1000, priceAmount: 25.99, conversionRate: 1.0, isAd: false },
    { title: 'Spanish mom gift', tags: ['spanish mom'], country: 'VN', ageDays: 35, sold24h: 1, views24h: 75, totalSold: 15, totalViews: 450, priceAmount: 17.99, conversionRate: 1.9, isAd: false }
  ]
});

assert.strictEqual(report.decision, 'PROCEED_TO_PATTERN_RESEARCH');
assert.strictEqual(report.confidence, 100);
assert(report.scorecard.find(row => row.key === 'freshness').value.includes('signal'));
assert(report.patterns.tags.some(item => item.tag === 'daughter gift'));
assert(report.scorecard.find(row => row.key === 'sourcing').detail.includes('operational preference'));

const empty = evaluateEtsyNiche({ seedPhrase: 'unknown', sellers: [] });
assert.strictEqual(empty.decision, 'NEEDS_MORE_DATA');
assert.strictEqual(empty.confidence, 0);
assert(empty.nextDataRequest.length > 0);
console.log('Etsy niche evaluator passed.');
