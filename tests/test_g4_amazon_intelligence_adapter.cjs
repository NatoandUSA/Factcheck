'use strict';

const assert = require('node:assert/strict');
const adapter = require('../server/commerceIntelligence/amazonIntelligenceAdapter');
const { compose } = require('../server/commerceIntelligence/amazonComposer');

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
  check(result.output.listingDraft.amazonAPlusModules.length >= 2
    && result.output.listingDraft.amazonAPlusModules.every(item => item.headline && item.body !== undefined
      && item.imageBrief && item.altText), 'A+ modules contain buyer copy and image guidance from confirmed facts');
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
  check(!visible.includes('english necklace') && result.output.listingDraft.amazonSearchTerms.includes('english'),
    'alternate-language phrase stays out of visible copy but contributes safe Amazon-US backend roots');
  check(result.accounting.backendLanguageCandidateCount === 1,
    'backend-only alternate-language disposition is explicitly accounted');
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
  check(result.output.listingDraft.amazonAPlusPoints.map(value => value.toLowerCase()).includes('materiales: acero inoxidable')
    && !JSON.stringify(result.output.listingDraft.amazonAPlusPoints).toLowerCase().includes('18k'),
  'A+ copy points are localized for ES while remaining derived only from Product Truth');

  const productionLike = structuredClone(input);
  productionLike.productTruth.snapshot.asserted.productName = asserted('Para Mi Hija Necklace Message Card');
  productionLike.productTruth.snapshot.asserted.includedItems = asserted('Message card');
  productionLike.productTruth.snapshot.asserted.packaging = asserted('Gift box');
  productionLike.productTruth.snapshot.asserted.colors = asserted('Silver / Yellow');
  const productionResult = await adapter.buildIntelligence(productionLike);
  const productionVisible = [productionResult.output.listingDraft.amazonTitle,
    ...productionResult.output.listingDraft.amazonBullets,
    productionResult.output.listingDraft.amazonDescription].join(' ').toLowerCase();
  check(productionVisible.includes('tarjeta con mensaje'), 'verified included message card survives ES rendering and claim guard');
  check(!/\b(?:necklace|message card|gift box|materials|packaging|recipient|occasion)\b/i.test(
    JSON.stringify(productionResult.output.listingDraft.amazonAPlusPoints)),
    'BA-AMZ-Q1.2 A+ buyer points are localized for ES');
  check(!productionVisible.includes('silver'), 'ambiguous silver color cannot become a material claim');
  check(productionResult.output.factClaimReview.some(item => item.field === 'colors' && item.value.includes('Silver')),
    'omitted ambiguous color remains visible in review accounting');
  const localizedAPlusInput = structuredClone(productionLike);
  delete localizedAPlusInput.productTruth.snapshot.asserted.colors;
  localizedAPlusInput.productTruth.snapshot.asserted.purity = asserted('Sterling Silver');
  localizedAPlusInput.productTruth.snapshot.asserted.components = asserted('Metal Type: Sterling Silver; Closure Type: Box');
  localizedAPlusInput.productTruth.snapshot.asserted.sizes = asserted('3.5 x 3.5 x 1 inches');
  const localizedAPlusResult = await adapter.buildIntelligence(localizedAPlusInput);
  const productionModules = JSON.stringify(localizedAPlusResult.output.listingDraft.amazonAPlusModules);
  check(!/\b(?:Sterling Silver|inches|Box)\b/i.test(productionModules)
    && /Plata esterlina/i.test(productionModules) && /pulgadas/i.test(productionModules),
  'Amazon ES A+ modules localize verified material, closure and measurement values');
  const annotatedPackaging = structuredClone(input);
  annotatedPackaging.productTruth.snapshot.asserted.packaging = asserted('Gift box — theo listing tham chiếu');
  const annotatedPackagingResult = await adapter.buildIntelligence(annotatedPackaging);
  check(!JSON.stringify(annotatedPackagingResult.output.listingDraft.amazonAPlusPoints).includes('theo listing tham chiếu'),
    'BA-AMZ-Q1.1 internal provenance suffix is removed from A+ buyer-facing copy');
  const novelProduct = structuredClone(input);
  novelProduct.research.observations.cerebro.keywords = Array.from({ length: 12 }, (_, index) =>
    keyword(`pet memorial keepsake dog remembrance ${index}`, 1200 - index * 25, 1.1));
  novelProduct.research.observations.xray = [];
  novelProduct.productTruth.snapshot.asserted = {
    productType: asserted('Pet Memorial Keepsake'),
    productName: asserted('Pet Memorial Keepsake'),
    recipient: asserted('Pet owner')
  };
  novelProduct.configuration = { seedPhrase: 'pet memorial gift', listingLanguage: 'EN' };
  const novelResult = await adapter.buildIntelligence(novelProduct);
  check(novelResult.output.productFamilyAlignment.status === 'ALIGNED'
    && novelResult.output.productFamilyAlignment.resolutionMode === 'DIRECT_IDENTITY_EVIDENCE',
    'new product outside the closed family dictionary is admitted by positive Product Truth identity evidence');

  const q1Keywords = [
    ['madrina proposal mug', 0.96, 1200],
    ['godmother proposal mug', 0.91, 900],
    ['baptism mug for godmother', 0.88, 700],
    ['regalo para madrina', 0.82, 650],
    ['bautizo madrina taza', 0.78, 500],
    ['spanish godmother keepsake', 0.72, 350]
  ].map(([phrase, relevance, searchVolume], index) => ({
    phrase, relevance, searchVolume, score: 100 - index, bid: 1,
    titleDensity: 2, competingProducts: 100, ipVerdict: 'ALLOW', ipHits: [],
    suspectedBrand: null, negativeHit: null, backendOnly: false,
    masterTier: index < 2 ? 'PRIMARY' : 'SECONDARY', rareReviewToken: false,
    tokenCount: phrase.split(/\s+/).length
  }));
  q1Keywords.meta = { inputUniquePhrases: q1Keywords.length, metricAvailability: {}, rareReviewTokens: [], brandTokens: [] };
  const q1Truth = {
    productType: 'Ceramic Mug',
    productName: 'Madrina Proposal Mug Gift Set 11oz Personalized Spanish Baptism Godmother',
    recipient: 'madrina', occasion: 'baptism', materials: 'ceramic', sizes: '11 oz',
    personalization: 'Custom name', packaging: 'Gift box', features: ['Spanish message']
  };
  const q1 = compose(q1Keywords, q1Truth);
  check(q1.title.text.toLowerCase() !== q1Truth.productName.toLowerCase(),
    'BA-AMZ-Q1 title is composed instead of copying long Product Truth productName verbatim');
  check(/mug/i.test(q1.title.text) && q1.title.text.length <= 75,
    'BA-AMZ-Q1 title retains verified product identity within policy ceiling');
  check(q1.itemHighlights.text.length <= 125 && (q1.itemHighlights.text.match(/,/g) || []).length <= 1,
    'BA-AMZ-Q1 Item Highlights is buyer-readable rather than a keyword chain');
  check(q1.bullets.length === 5 && q1.capacityTargets.bullets.every(item => item.minimum === undefined
    && item.qualityBasis === 'ONE_VERIFIED_BUYER_IDEA_NO_CAPACITY_FILL'),
  'BA-AMZ-Q1 bullets no longer use capacity-fill minimums');
  check(!q1.description.includes('<ul>') && !q1.description.includes(' · '),
    'BA-AMZ-Q1 description renders coherent paragraphs without spec-list or keyword-tail dump');
  check(q1.searchTermTotalBytes <= 249 && Number.isInteger(q1.analysisMeta.searchDiagnostics.unusedEligibleRoots),
    'BA-AMZ-Q1 backend search diagnostics account for eligible unused roots under byte cap');

  const q11Keywords = [
    ['collar para mi hija', 0.98, 1400], ['regalo collar hija', 0.92, 1000],
    ['collar graduacion hija', 0.86, 800], ['regalo de madre para hija', 0.80, 700]
  ].map(([phrase, relevance, searchVolume], index) => ({
    phrase, relevance, searchVolume, score: 120 - index, bid: 1,
    titleDensity: 2, competingProducts: 100, ipVerdict: 'ALLOW', ipHits: [],
    suspectedBrand: null, negativeHit: null, backendOnly: false,
    masterTier: index < 2 ? 'PRIMARY' : 'SECONDARY', rareReviewToken: false,
    tokenCount: phrase.split(/\s+/).length
  }));
  q11Keywords.meta = { inputUniquePhrases: q11Keywords.length, metricAvailability: {}, rareReviewTokens: [], brandTokens: [] };
  const q11 = compose(q11Keywords, {
    productType: 'Necklace',
    productName: 'Collar Para Mi Hija en Español, Regalo Para Hija de Mamá y Papá',
    recipient: 'Daughter / Hija', occasion: 'Graduation, Birthday', materials: 'Stainless Steel',
    weight: '5.3 ounces', quantity: '1', packaging: 'Gift box / ready-to-gift — theo listing tham chiếu', origin: 'US'
  }, { labelLanguage: 'ES' });
  const q11BuyerCopy = [q11.title.text, q11.itemHighlights.text, ...q11.bullets, q11.description].join(' ');
  check(!/^Necklace\b/i.test(q11.title.text) && !/^Necklace\b/i.test(q11.itemHighlights.text),
    'BA-AMZ-Q1.1 Spanish buyer copy prefers observed product wording over an English generic identity');
  check(!/THIẾU DỮ LIỆU|theo listing tham chiếu/i.test(q11BuyerCopy),
    'BA-AMZ-Q1.1 internal missing-data/provenance annotations never leak into buyer-facing copy');
  check(!/\b(?:Daughter|Graduation|Birthday|Stainless Steel|Weight|Quantity|Gift box|ready-to-gift|Origin|US)\b/i.test(q11BuyerCopy),
    'BA-AMZ-Q1.2 ES buyer rendering removes the known English Product Truth leakage from visible copy');
  check(!q11.bullets.some(item => /^TALLA Y COLOR\b/.test(item)),
    'BA-AMZ-Q1.1 size/color heading is suppressed when only weight and quantity are verified');

  const q12 = compose(q1Keywords, {
    productType: 'Mug',
    productName: 'Madrina - Padrino Proposal Mug',
    recipient: 'Madrina, Padrino',
    sizes: ['11 oz', '15 oz'],
    colors: ['White', 'Pink', 'Light Blue', 'Red', 'Navy', 'Black', 'Light Green'],
    personalization: 'name, year'
  }, { labelLanguage: 'ES' });
  const q12BuyerCopy = [q12.title.text, q12.itemHighlights.text, ...q12.bullets, q12.description].join(' ');
  check(!/\b(?:Proposal|Mug|name|year|White|Pink|Light Blue|Red|Navy|Black|Light Green)\b/i.test(q12BuyerCopy)
    && /Taza/i.test(q12BuyerCopy) && /nombre/i.test(q12BuyerCopy) && /año/i.test(q12BuyerCopy)
    && /Azul claro/i.test(q12BuyerCopy) && /Azul marino/i.test(q12BuyerCopy),
  'Fresh Acceptance mug Product Truth renders generic ES buyer values without English presentation leakage');

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
    && blockedOutput?.details?.blocking?.some(item => ['silver','plata'].includes(item.token)),
  'true output contamination stays blocked with field-level 422 diagnostics');
  console.log(`G4 Amazon intelligence adapter: ${passed}/${passed} PASS`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
