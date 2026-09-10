'use strict';

const assert = require('node:assert/strict');
const adapter = require('../server/commerceIntelligence/amazonIntelligenceAdapter');

const keyword = (phrase, searchVolume, bid = null) => ({ phrase, searchVolume, bid,
  keywordSales: null, iq: null, trend: null, competingProducts: null, cpr: null,
  titleDensity: null, positionRank: null });
const asserted = value => ({ disposition: 'ASSERTED', value, basis: 'SUPPLIER_SPEC' });
let passed = 0;
function check(value, message) { assert.ok(value, message); passed++; }

async function main() {
  const input = {
    research: { observations: { marketplace: 'AMAZON', cerebro: { keywords: [
      keyword('para mi hija collar', 1500, 1.2),
      keyword('collar de oro para mujer 18k', 900, 2.1),
      keyword('collar regalo especial para hija', 700, 1.0),
      keyword('regalo de cumpleanos para hija', 500, 0.8),
      keyword('english necklace for daughter', 450, 0.9),
      keyword('example collar para hija', 425, 0.9),
      keyword('nike necklace for daughter', 400, 1.7)
    ] }, xray: [{ asin: 'B0ABC12345', title: 'Collar Para Mi Hija Necklace', brand: 'Example',
      price: 29.99, asinSales: 100, parentSales: 150, asinRevenue: 2999, parentRevenue: 4499,
      titleChars: 31, bsr: 1200, reviews: 40, rating: 4.6, seller: 'Example' }] } },
    productTruth: { snapshot: { asserted: {
      productType: asserted('Custom Necklace'), materials: asserted('stainless steel'),
      personalization: asserted('Custom name personalization'), recipient: asserted('hija'),
      occasion: asserted('cumpleanos')
    } } },
    configuration: { seedPhrase: 'para mi hija', listingLanguage: 'ES' }
  };
  const result = await adapter.buildIntelligence(input);
  check(/^[0-9a-f]{64}$/.test(result.engineBindingHash), 'engine code binding returned');
  check(result.output.language === 'ES', 'Spanish listing language selected');
  check(result.accounting.inputKeywordCount === 7, 'entire keyword corpus counted');
  check(result.accounting.claimTargetingCount === 1, 'unverified 18k phrase diverted');
  check(result.accounting.ipBlockedKeywordCount === 1, 'canonical IP screen blocks Nike');
  check(result.accounting.languageTargetingCount === 1, 'non-Spanish phrase leaves visible and backend copy');
  check(result.accounting.competitorBrandBlockedCount === 1, 'Xray competitor brand is excluded');
  check(result.accounting.allocatedKeywordCount === 7 && result.accounting.unallocatedCount === 0,
    'every scored keyword has exactly one accounted disposition');
  check(adapter.detectLanguage(input.research.observations.cerebro.keywords, 'para mi hija necklace') === 'ES',
    'AUTO language follows an unambiguous seed phrase');
  const visible = [result.output.listingDraft.amazonTitle, result.output.listingDraft.itemHighlights,
    ...result.output.listingDraft.amazonBullets, result.output.listingDraft.amazonDescription].join(' ').toLowerCase();
  check(!visible.includes('18k') && !visible.includes('oro'), 'unverified material excluded from visible copy');
  check(!result.output.listingDraft.amazonSearchTerms.toLowerCase().includes('18k'), 'unverified material excluded from backend terms');
  check(result.output.listingDraft.ppcKeywords.includes('collar de oro para mujer 18k'), 'unverified claim retained for PPC targeting');
  check(result.output.guardAccounting.ppcFlagged.some(item => JSON.stringify(item).includes('18k')), 'PPC claim explicitly flagged');
  check(!JSON.stringify(result.output.listingDraft).toLowerCase().includes('nike'), 'IP-blocked phrase absent from every listing surface');
  check(!visible.includes('english necklace') && !result.output.listingDraft.amazonSearchTerms.includes('english'),
    'language mismatch absent from visible and backend copy');
  check(result.output.listingDraft.ppcKeywords.includes('english necklace for daughter'),
    'language mismatch remains accounted in PPC targeting');
  check(!JSON.stringify(result.output.listingDraft).toLowerCase().includes('example collar'),
    'Xray competitor brand absent from every listing surface');
  check(result.output.asinSelection.acceptedCount === 1, 'relevant Xray ASIN accepted');
  check(result.accounting.asinAcceptedCount === 1 && result.accounting.asinRejectedCount === 0, 'ASIN accounting exact');
  check(result.output.commerce.searchTermTotalBytes <= 249, 'Amazon generic keyword byte cap enforced');
  check(result.output.commerce.coverage.tokenCoveragePercent <= 100, 'keyword coverage bounded');
  check(result.output.listingDraft.imagePrompts.prompts.length === 8, 'full physical image prompt suite generated');
  check(result.output.listingDraft.imagePrompts.prompts.find(item => item.id === 'main_product').ready === true,
    'main image prompt ready');
  check(result.output.listingDraft.imagePrompts.prompts.find(item => item.id === 'packaging_contents').prompt === '',
    'missing packaging produces no fabricated prompt');
  check(result.output.listingDraft.amazonAPlusPoints.includes('Materials: stainless steel')
    && !JSON.stringify(result.output.listingDraft.amazonAPlusPoints).toLowerCase().includes('18k'),
  'A+ copy points are non-empty and derived only from Product Truth');

  const productionLike = structuredClone(input);
  productionLike.productTruth.snapshot.asserted.productName = asserted('Para Mi Hija Necklace Message Card');
  productionLike.productTruth.snapshot.asserted.includedItems = asserted('Message card');
  productionLike.productTruth.snapshot.asserted.packaging = asserted('Gift box');
  productionLike.productTruth.snapshot.asserted.colors = asserted('Silver / Yellow');
  const productionResult = await adapter.buildIntelligence(productionLike);
  const productionVisible = [productionResult.output.listingDraft.amazonTitle,
    ...productionResult.output.listingDraft.amazonBullets,
    productionResult.output.listingDraft.amazonDescription].join(' ').toLowerCase();
  check(productionVisible.includes('message card'), 'verified included message card survives claim guard');
  check(!productionVisible.includes('silver'), 'ambiguous silver color cannot become a material claim');
  check(productionResult.output.factClaimReview.some(item => item.field === 'colors' && item.value.includes('Silver')),
    'omitted ambiguous color remains visible in review accounting');
  let missingCerebro;
  try {
    await adapter.buildIntelligence({ ...input, research: { observations: { marketplace: 'AMAZON', xray: [] } } });
  } catch (error) { missingCerebro = error; }
  check(missingCerebro?.code === 'CEREBRO_KEYWORDS_REQUIRED' && missingCerebro?.status === 409,
    'missing Cerebro is an actionable workflow precondition, not a server failure');
  const unsafeIdentity = structuredClone(input);
  unsafeIdentity.productTruth.snapshot.asserted.productName = asserted('Sterling Silver Necklace');
  let blockedOutput;
  try { await adapter.buildIntelligence(unsafeIdentity); } catch (error) { blockedOutput = error; }
  check(blockedOutput?.code === 'UNVERIFIED_OUTPUT_CLAIM' && blockedOutput?.status === 422
    && blockedOutput?.details?.blocking?.some(item => item.token === 'silver'),
  'true output contamination stays blocked with field-level 422 diagnostics');
  console.log(`G4 Amazon intelligence adapter: ${passed}/${passed} PASS`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
