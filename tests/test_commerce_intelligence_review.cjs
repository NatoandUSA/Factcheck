'use strict';
const assert = require('node:assert/strict');
const { ip, semantic, asin, keyword, amazon } = require('../server/commerceIntelligence');
const { contentTokens } = require('../server/commerceIntelligence/text');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  PASS  ' + name); }
  catch (error) { failed++; console.log('  FAIL  ' + name + '\n        ' + error.message); }
}

const library = ip.loadLibrary();

console.log('\nIP review layer');
test('Dedication does not collide with cat', () => {
  assert.equal(ip.screen('Dedication Necklace', library).verdict, 'OK');
});
test('evasion forms are caught', () => {
  for (const value of ['n1ke sweatshirt', 'nikee hoodie', 'nikesweatshirt', 'mickeymouse ears']) {
    assert.notEqual(ip.screen(value, library).verdict, 'OK', value);
  }
});
test('ambiguous common vocabulary remains REVIEW', () => {
  assert.equal(ip.screen('gift for football coach', library).verdict, 'REVIEW');
});

console.log('\nSemantic layer');
test('one phrase can belong to several clusters', () => {
  const result = semantic.classify('mothers day gift for mom sweatshirt');
  for (const name of ['occasion', 'recipient', 'core', 'intent']) assert.ok(result.clusters.includes(name), name);
});
test('buyer mention does not create a false audience conflict', () => {
  const allowed = semantic.allowedRecipientFamilies(['moms']);
  assert.equal(semantic.conflictingRecipient('mothers day sweatshirt for mom from daughter', allowed), null);
  assert.equal(semantic.conflictingRecipient('boo boo crew nurse sweatshirt', allowed), 'nurse');
  const daughterAllowed = semantic.allowedRecipientFamilies(['daughter', 'hija']);
  assert.equal(semantic.conflictingRecipient('regalos para papa de hija', daughterAllowed), 'papa');
  assert.equal(semantic.conflictingRecipient('gift for dad from daughter', daughterAllowed), 'dad');
  assert.equal(semantic.conflictingRecipient('regalo de madre para hija', daughterAllowed), null);
});

console.log('\nCerebro metric preservation');
const sheets = [{ name: 'Cerebro', rows: [
  ['Keyword Phrase','Search Volume','Keyword Sales','Cerebro IQ Score','Search Volume Trend','Competing Products','CPR','Title Density','H10 PPC Sugg. Bid','Position (Rank)'],
  ['mama sweatshirt', 900, 22, 1200, 15, 500, 8, 2, 1.25, 7],
  ['embroidered mom sweatshirt', 700, '', 900, -5, 300, 6, '', 0.95, 14],
  ['low volume mom sweatshirt', 5, 1, 10, 0, 900, 15, 4, 0.5, 45]
]}];
const extraction = keyword.extractKeywords(sheets);
test('Position Rank survives extraction', () => {
  assert.equal(extraction.keywords[0].positionRank, 7);
  assert.equal(extraction.keywords[1].positionRank, 14);
});
const scoredSmall = keyword.scoreKeywords(extraction.keywords, {
  anchors: ['mama sweatshirt', 'mom sweatshirt'], library, screen: ip.screen, minSearchVolume: 50
});
test('minimum Search Volume is explicitly accounted for', () => {
  assert.equal(scoredSmall.meta.preRejected.length, 1);
  assert.equal(scoredSmall.meta.preRejected[0].code, 'BELOW_MIN_SEARCH_VOLUME');
  assert.equal(scoredSmall.meta.inputUniquePhrases, 3);
});
test('missing optional metrics are omitted from score components, not treated as zero', () => {
  const row = scoredSmall.find(k => k.phrase === 'embroidered mom sweatshirt');
  assert.ok(!Object.hasOwn(row.scoreComponentsUsed, 'sales'));
  assert.ok(!Object.hasOwn(row.scoreComponentsUsed, 'gap'));
});
test('metric availability explains observed-but-not-scored fields', () => {
  const meta = scoredSmall.meta.metricAvailability;
  assert.equal(meta.positionRank.present, 3);
  assert.equal(meta.positionRank.usage, 'diagnostic');
  assert.equal(meta.cpr.usage, 'diagnostic');
  assert.equal(meta.bid.usage, 'ppc_export');
});

console.log('\nASIN batching');
const xrayRows = [];
for (let i = 0; i < 7; i++) xrayRows.push({ asin: `B0ALPHA0${String(i).padStart(2,'0')}`, title: 'Mama Embroidered Sweatshirt Gift', brand: 'Alpha', price: 35, asinSales: 100-i, reviews: 50-i, titleChars: 35 });
for (let i = 0; i < 7; i++) xrayRows.push({ asin: `B0BETA00${String(i).padStart(2,'0')}`, title: 'Mom Embroidered Sweatshirt Gift', brand: 'Beta', price: 36, asinSales: 90-i, reviews: 40-i, titleChars: 34 });
const batchResult = asin.selectAsinBatches(xrayRows, {
  anchors: ['mama sweatshirt', 'mom sweatshirt'], library, screen: ip.screen,
  targetPrice: 35, maxPerBrand: 2, batchSize: 10
});
test('brand diversity cap is enforced independently in every batch', () => {
  for (const batch of batchResult.batches) {
    const counts = new Map();
    for (const item of batch.items) counts.set(item.brand, (counts.get(item.brand) || 0) + 1);
    for (const count of counts.values()) assert.ok(count <= 2, `brand count ${count}`);
  }
});
test('first ASIN is explicitly marked seed', () => {
  for (const batch of batchResult.batches) {
    assert.equal(batch.items[0].seed, true);
    assert.equal(batch.seedAsin, batch.items[0].asin);
    assert.equal(batch.items.filter(i => i.seed).length, 1);
  }
});
test('short batches are allowed instead of violating brand cap', () => {
  assert.ok(batchResult.batches.some(b => b.partial));
});
test('ASIN rejection details are not truncated', () => {
  const invalid = Array.from({length: 55}, (_,i) => ({ asin: `BAD${i}`, title: 'Mama Sweatshirt' }));
  const result = asin.selectAsinBatches(invalid, { anchors: ['mama sweatshirt'] });
  assert.equal(result.rejected.length, 55);
  assert.equal(result.rejectedPreview.length, 40);
});

console.log('\nAmazon composition and allocation');
const manyKeywords = [];
for (let i = 0; i < 70; i++) {
  manyKeywords.push({ phrase: `mama sweatshirt gift idea ${i} for mom`, searchVolume: 1000-i*8,
    keywordSales: i % 4 === 0 ? null : 30-(i%20), titleDensity: i%7,
    competingProducts: 300+i*10, bid: 0.8+(i%5)*0.1, positionRank: i+1 });
}
manyKeywords.push({ phrase: 'mama sweatshirt auroraword', searchVolume: 20, keywordSales: null,
  titleDensity: 20, competingProducts: 1000, bid: 0.5, positionRank: 80 });
manyKeywords.push({ phrase: 'nike mom sweatshirt', searchVolume: 2000, keywordSales: 50,
  titleDensity: 0, competingProducts: 100, bid: 2.5, positionRank: 2 });
const scoredMany = keyword.scoreKeywords(manyKeywords, {
  anchors: ['mama sweatshirt', 'mom sweatshirt'], library, screen: ip.screen
});
const truth = { productType: 'Embroidered Crewneck Sweatshirt', productName: 'Embroidered Mama Sweatshirt',
  recipient: 'moms', occasion: 'Mothers Day', materials: ['65% cotton','35% polyester'],
  sizes: ['S','M','L'], colors: ['Black'], features: ['Machine embroidered'],
  personalization: 'Up to 3 names', care: 'Machine wash cold', packaging: 'Poly bag', shipFrom: 'Vietnam' };
const draft = amazon.compose(scoredMany, truth, { searchTermBytes: 999 });
const identityScored = keyword.scoreKeywords([
  { phrase: 'regalo de madre para hija', searchVolume: 9000, keywordSales: 300, positionRank: 1 },
  { phrase: 'collar para hija', searchVolume: 1200, keywordSales: 40, positionRank: 5 }
], { anchors: ['collar para mi hija', 'custom necklace'], library, screen: ip.screen });
const identityDraft = amazon.compose(identityScored, {
  productType: 'Custom Necklace', productName: 'Collar Para Mi Hija', recipient: 'hija', occasion: 'graduacion',
  materials: ['stainless steel'], sizes: ['18 inch'], colors: ['gold'], packaging: 'gift box'
}, { labelLanguage: 'ES' });
test('Amazon title names the product rather than matching only recipient or occasion', () => {
  assert.match(identityDraft.title.text.toLowerCase(), /collar|necklace/);
});
test('rare frequency is review metadata, not an automatic rival-brand block', () => {
  const row = scoredMany.find(k => k.phrase === 'mama sweatshirt auroraword');
  assert.equal(row.suspectedBrand, null);
  assert.equal(row.rareReviewToken, 'auroraword');
});
test('Generic Keywords use one total budget capped at 249 bytes', () => {
  assert.ok(draft.searchTerms.length <= 1);
  assert.ok(draft.searchTermTotalBytes <= 249, draft.searchTermTotalBytes);
  if (draft.searchTerms[0]) assert.equal(draft.searchTerms[0].limit, 249);
});
test('backend terms do not repeat any token in finalized visible copy', () => {
  const visible = new Set(contentTokens([draft.title.text, draft.itemHighlights.text,
    ...draft.bullets, draft.description].join(' ')));
  for (const token of contentTokens(draft.searchTerms[0]?.text || '')) {
    assert.ok(!visible.has(token), `duplicate visible token: ${token}`);
  }
});
test('IP-blocked keyword never reaches visible, backend, or PPC output', () => {
  const output = [draft.title.text, draft.itemHighlights.text, ...draft.bullets,
    draft.description, ...draft.searchTerms.map(s => s.text),
    ...draft.ppc.exact.map(x => x.phrase), ...draft.ppc.phrase.map(x => x.phrase),
    ...draft.ppc.broad.map(x => x.phrase)].join(' ').toLowerCase();
  assert.ok(!output.includes('nike'));
});
test('all usable phrases are allocated to copy or PPC', () => {
  assert.equal(draft.coverage.usedSomewhere, draft.coverage.usablePhrases);
});
test('coverage never exceeds 100 percent', () => {
  assert.ok(draft.coverage.tokenCoveragePercent <= 100);
});
test('rejected keyword details are complete, not preview-truncated', () => {
  assert.equal(draft.rejectedKeywords.length, draft.coverage.rejectedPhrases);
});
test('pre-score Search Volume rejections remain in composer accounting', () => {
  const lowDraft = amazon.compose(scoredSmall, truth, {});
  assert.ok(lowDraft.rejectedKeywords.some(r => r.code === 'BELOW_MIN_SEARCH_VOLUME'));
  assert.equal(lowDraft.coverage.corpusPhrases, scoredSmall.meta.inputUniquePhrases);
});
test('PPC export candidates preserve bid and research metrics', () => {
  const ppc = [...draft.ppc.exact, ...draft.ppc.phrase, ...draft.ppc.broad];
  assert.ok(ppc.length > 20);
  assert.ok(ppc.some(row => row.bid !== null && row.bid !== undefined));
});

console.log(`\nSUITE_RESULT total=${passed + failed} passed=${passed} failed=${failed}\n`);
process.exit(failed ? 1 : 0);
