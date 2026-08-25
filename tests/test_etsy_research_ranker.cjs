const assert = require('assert');
const { rankEtsyResearchListings } = require('../server/etsyResearchRanker');

const ranked = rankEtsyResearchListings([
  { id: 'old', title: 'Old listing', country: 'CN', ageDays: 800, totalSold: 400, totalViews: 4000, reviewCount: 500, sold24h: 0, views24h: 0, conversionRate: null, isStarSeller: false, isBestSeller: false, hasFreeShipping: false, tags: [] },
  { id: 'new', title: 'New Vietnamese listing', country: 'Viet Nam', ageDays: 20, totalSold: 30, totalViews: 1000, reviewCount: 20, sold24h: 12, views24h: 600, conversionRate: 4, isStarSeller: true, isBestSeller: false, hasFreeShipping: true, tags: ['para mi hija'] },
  { id: 'unknown', title: 'Unknown metrics', country: null, ageDays: null, totalSold: null, totalViews: null, reviewCount: null, sold24h: null, views24h: null, conversionRate: null, isStarSeller: null, isBestSeller: null, hasFreeShipping: null, tags: [] }
]);

assert.strictEqual(ranked[0].id, 'new', 'fresh source-reported velocity should outrank an old low-velocity row');
assert.strictEqual(ranked[0].researchPriority.rank, 1);
assert(ranked[0].researchPriority.reasons.some(reason => reason.includes('New listing')));
assert(ranked[0].researchPriority.reasons.some(reason => reason.includes('Vietnam sourcing preference')));
assert.strictEqual(ranked.find(row => row.id === 'unknown').researchPriority.confidence, 0, 'unknown data must not fabricate a confidence signal');
assert.strictEqual(ranked.find(row => row.id === 'unknown').researchPriority.score, 0, 'unknown data must not fabricate a priority score');
console.log('Etsy research priority ranking passed.');
