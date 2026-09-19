const assert = require('assert');
const {
  VERSION, familyOf, intentOf, similarity, compatible, proposeClusters
} = require('../server/globalOpportunityClusterEngine');

assert.strictEqual(VERSION, 'GLOBAL_CLUSTER_ENGINE_V1_PROPOSAL');
assert.strictEqual(familyOf('dog memorial wind chime'), 'wind_chime');
assert.strictEqual(familyOf('pet memorial necklace'), 'necklace');
assert.strictEqual(intentOf('pet loss sympathy wind chime'), 'MEMORIAL');
assert.strictEqual(compatible('dog memorial wind chime', 'pet memorial necklace'), false);
assert(similarity('dog memorial wind chime', 'personalized dog memorial wind chime') > 0.8);

const clusters = proposeClusters([
  'dog memorial wind chime',
  'personalized dog memorial wind chime',
  'pet memorial wind chime',
  'dog loss sympathy wind chime',
  'pet memorial necklace',
  'personalized pet memorial necklace'
]);

assert.strictEqual(clusters.length, 2, 'product-family separation must keep wind chimes and necklaces apart');
const chime = clusters.find(item => item.productFamily === 'wind_chime');
const necklace = clusters.find(item => item.productFamily === 'necklace');
assert(chime && necklace);
assert.strictEqual(chime.authority, 'PROPOSAL_ONLY');
assert.strictEqual(necklace.authority, 'PROPOSAL_ONLY');
assert(chime.members.includes('dog memorial wind chime'));
assert(chime.members.includes('pet memorial wind chime'));
assert(!chime.members.includes('pet memorial necklace'));

const split = proposeClusters([
  'dog memorial wind chime',
  'personalized dog memorial wind chime'
], {
  overrides: { split: [['dog memorial wind chime', 'personalized dog memorial wind chime']] }
});
assert.strictEqual(split.length, 2, 'human split override must win over lexical similarity');

const merged = proposeClusters([
  'pet remembrance keepsake',
  'animal memorial keepsake'
], {
  threshold: 0.95,
  overrides: { merge: [['pet remembrance keepsake', 'animal memorial keepsake']] }
});
assert.strictEqual(merged.length, 1, 'human merge override must be explicit and deterministic');

const deterministicA = proposeClusters(['b pet memorial necklace', 'a pet memorial necklace']);
const deterministicB = proposeClusters(['a pet memorial necklace', 'b pet memorial necklace']);
assert.deepStrictEqual(deterministicA, deterministicB, 'input order must not change cluster proposals');

const guardedSplit = proposeClusters([
  'dog memorial wind chime',
  'personalized dog memorial wind chime',
  'custom dog memorial wind chime'
], {
  overrides: { split: [['dog memorial wind chime', 'custom dog memorial wind chime']] }
});
assert.strictEqual(guardedSplit.length, 2,
  'split override against any existing member must block accidental transitive merge');

console.log('GLOBAL_OPPORTUNITY_CLUSTER_ENGINE_V1 PASS');
