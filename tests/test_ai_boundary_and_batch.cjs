'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { makeProductTruthCard } = require('./helpers/productTruth.cjs');
const {
  generateAmazonListingImagePrompts,
  generateAmazonAPlusImagePrompts,
  generateEtsyListingImagePrompts
} = require('../src/services/imagePromptGenerator.js');
const {
  buildVerifiedAiRequest,
  projectVerifiedAiInput,
  validateModelClaims
} = require('../src/utils/aiTruthBoundary.js');
const { generateVerifiedBatchRow, prepareVerifiedBatchRow } = require('../src/utils/batchTruthBoundary.js');
const { generateListingAI } = require('../src/services/geminiService.js');

const productId = 'product-77';
const listingVersion = 3;
const evidence = {
  state: 'VERIFIED', subjectId: productId, listingVersion,
  source: { kind: 'SUPPLIER_SPEC', id: 'supplier-77' }
};
const card = makeProductTruthCard(productId, listingVersion, {
  facts: {
    productType: { value: 'SWEATSHIRT', evidence },
    materials: { value: ['cotton'], evidence },
    personalization: { value: { supported: false, instructions: 'Enter a name' }, evidence }
  }
});
const listing = {
  productId,
  listingVersion,
  productTruthCard: card,
  amazonTitle: 'Official Disney solid gold bestseller ships in 24h',
  amazonSearchTerms: 'made in USA waterproof',
  etsyTitle: 'Official Disney personalized sweatshirt',
  etsyTags: ['solid gold', 'five star']
};

assert.deepStrictEqual(generateAmazonListingImagePrompts(listing.amazonTitle, 'Apparel', 'official disney'), []);
assert.deepStrictEqual(generateAmazonAPlusImagePrompts(listing.amazonTitle, 'Apparel'), []);
assert.deepStrictEqual(generateEtsyListingImagePrompts(listing.etsyTitle, 'Apparel', 'solid gold'), []);

const amazon = generateAmazonListingImagePrompts(listing);
const aplus = generateAmazonAPlusImagePrompts(listing);
const etsy = generateEtsyListingImagePrompts(listing);
assert.ok(amazon.length > 0 && aplus.length > 0 && etsy.length > 0, 'valid bound truth must generate safe prompt slots');
const promptText = [...amazon, ...aplus, ...etsy].map(item => item.prompt).join(' ').toLowerCase();
for (const poisoned of ['official disney', 'solid gold', 'best seller', 'bestseller', 'ships in 24', 'made in usa', 'waterproof', 'five star', 'enter a name']) {
  assert.strictEqual(promptText.includes(poisoned), false, `raw/model-only claim leaked into prompt: ${poisoned}`);
}
assert.ok(promptText.includes('sweatshirt'), 'verified product type should flow into prompts');

const stale = { ...listing, listingVersion: listingVersion + 1 };
assert.deepStrictEqual(generateAmazonListingImagePrompts(stale), [], 'stale evidence must produce zero prompts');
assert.strictEqual(projectVerifiedAiInput({ ...listing, productTruthCard: { ...card, ipEvidence: { ...card.ipEvidence, state: 'REVIEW_REQUIRED' } } }).eligible, false);

const projection = projectVerifiedAiInput(listing);
assert.strictEqual(projection.eligible, true);
assert.strictEqual(Object.hasOwn(projection.facts, 'personalization'), false, 'supported:false personalization must not enter AI authority');
const singleRequest = buildVerifiedAiRequest(projection, { tone: { id: 'warm', name: 'Warm' } });
assert.strictEqual(singleRequest.productBrief.includes('Official Disney'), false, 'single-listing AI request must not reuse raw title/brief prose');
assert.strictEqual(singleRequest.category.name, 'SWEATSHIRT');
assert.strictEqual(singleRequest.imageBase64, null, 'unverified image input must not enter the factual AI request');
assert.strictEqual(validateModelClaims({ etsyDescription: 'Made in USA and ships in 24 hours.' }, projection).valid, false);
assert.strictEqual(validateModelClaims({ etsyDescription: 'Organic linen with dishwasher-safe finish.' }, projection).valid, false, 'unlisted factual claims must fail deny-by-default validation');
assert.strictEqual(validateModelClaims({ etsyDescription: 'Handwoven with a lifetime warranty.' }, projection).valid, false, 'novel claims must not bypass a finite blacklist');
assert.strictEqual(validateModelClaims({ etsyDescription: 'A sweatshirt for everyday gifting.' }, projection).valid, true);

const linenCard = makeProductTruthCard(productId, listingVersion, {
  facts: {
    productType: { value: 'NAPKIN', evidence },
    materials: { value: ['organic linen'], evidence }
  }
});
const linenProjection = projectVerifiedAiInput({ productId, listingVersion, productTruthCard: linenCard });
assert.strictEqual(validateModelClaims({ etsyDescription: 'Organic linen gift' }, linenProjection).valid, true, 'exact verified facts must remain usable');

const fullModelOutput = {
  amazonTitle: 'Sweatshirt Gift for Family Everyday Style',
  amazonBullets: [
    'A meaningful sweatshirt gift for someone special',
    'Everyday sweatshirt style for gifting',
    'A thoughtful choice for family',
    'Sweatshirt design for everyday use',
    'A special gift with meaningful style'
  ],
  amazonSearchTerms: 'sweatshirt family gift everyday style thoughtful',
  amazonDescription: '<p>A meaningful sweatshirt gift for someone special.</p>',
  amazonAPlusContent: {
    brandStoryHeadline: 'Meaningful Everyday Gifting',
    brandStoryBody: 'A thoughtful sweatshirt choice for someone special.',
    modules: [
      { moduleType: 'Hero Banner Story', heading: 'Everyday Style', body: 'A sweatshirt for meaningful gifting.' },
      { moduleType: 'Three Feature Highlights', features: [{ title: 'Gift Style', desc: 'A thoughtful choice.' }] }
    ]
  },
  etsyTitle: 'Sweatshirt Gift for Family Everyday Style',
  etsyTags: ['sweatshirt gift', 'family gift', 'everyday style'],
  etsyMaterials: ['cotton'],
  etsyPersonalizationInstructions: '',
  etsyDescription: 'A meaningful cotton sweatshirt gift for someone special.'
};
assert.strictEqual(validateModelClaims(fullModelOutput, projection).valid, true, 'realistic model-shaped generic copy with exact verified facts must pass');

const appSource = fs.readFileSync(path.resolve(__dirname, '../src/App.jsx'), 'utf8');
const singleSource = fs.readFileSync(path.resolve(__dirname, '../src/components/SingleListingGenerator.jsx'), 'utf8');
assert.ok(appSource.includes('buildVerifiedAiRequest(verifiedProjection'), 'single-listing flow must rebuild the AI request from verified facts');
assert.strictEqual(appSource.includes('generateListingAI(formData)'), false, 'raw single-listing form data must not reach AI');
assert.ok(singleSource.includes('disabled={isGenerating || !verifiedProjection.eligible}'), 'single-listing UI must visibly fail closed before generation');
assert.ok(singleSource.includes('Product Truth Required'), 'single-listing UI must explain the evidence gate');

const batchRow = {
  ProductId: productId,
  ListingVersion: String(listingVersion),
  ProductTruthCard: JSON.stringify(card),
  ProductBrief: 'Official Disney solid gold product',
  Materials: '925 sterling silver'
};
const prepared = prepareVerifiedBatchRow(batchRow);
assert.strictEqual(prepared.eligible, true);
assert.strictEqual(prepared.aiInput.productBrief.includes('Official Disney'), false);
assert.strictEqual(prepared.aiInput.materials.includes('925 sterling silver'), false);
assert.strictEqual(prepared.aiInput.productBrief.includes('Enter a name'), false, 'disabled personalization instructions must not enter the AI brief');
assert.deepStrictEqual(prepareVerifiedBatchRow({ ProductBrief: 'raw prose only' }).eligible, false);
assert.deepStrictEqual(prepareVerifiedBatchRow({ ...batchRow, ListingVersion: '4' }).eligible, false);
assert.deepStrictEqual(prepareVerifiedBatchRow({ ...batchRow, ProductId: 'other-product' }).eligible, false);

(async () => {
  let fetchCalls = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    fetchCalls += 1;
    throw new Error('fetch must not be called');
  };
  await assert.rejects(
    () => generateListingAI({ productBrief: 'raw prose without projection' }),
    error => error?.code === 'UNQUALIFIED_PRODUCT_TRUTH'
  );
  await assert.rejects(
    () => generateListingAI({ productBrief: 'forged projection', verifiedProjection: Object.freeze({ eligible: true, facts: {} }) }),
    error => error?.code === 'UNQUALIFIED_PRODUCT_TRUTH'
  );
  assert.strictEqual(fetchCalls, 0, 'missing or forged projection must fail before any network/AI call');
  global.fetch = originalFetch;

  let aiCalls = 0;
  const generate = async input => {
    aiCalls += 1;
    return { etsyTitle: input.category.name };
  };
  const rejected = await generateVerifiedBatchRow({ ProductBrief: 'Official Disney solid gold' }, generate);
  assert.strictEqual(rejected.generated, false);
  assert.strictEqual(aiCalls, 0, 'unqualified batch row must cause zero AI calls');
  const accepted = await generateVerifiedBatchRow(batchRow, generate);
  assert.strictEqual(accepted.generated, true);
  assert.strictEqual(aiCalls, 1, 'eligible control must call AI exactly once');
  assert.strictEqual(accepted.listing.etsyTitle, 'SWEATSHIRT');
  console.log('AI prompt, output-claim, and Batch Product Truth boundaries passed.');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
