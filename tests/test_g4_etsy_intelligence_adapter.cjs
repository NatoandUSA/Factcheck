'use strict';

const assert = require('node:assert/strict');
const adapter = require('../server/commerceIntelligence/etsyIntelligenceAdapter');

const asserted = value => ({ disposition: 'ASSERTED', value, basis: 'SUPPLIER_SPEC' });
let passed = 0;
function check(value, message) { assert.ok(value, message); passed++; }
const master = (phrases, id = 1) => ({ id, kind: 'ETSY_MASTER_KEYWORDS', artifactHash: String(id).padStart(64, 'a'),
  revisionNumber: 1, payload: { keywords: phrases.map((phrase, index) => ({ keywordId: `ETSY-KW-${index + 1}`,
    phrase, priorityRank: index + 1, score: 100 - index, tier: 'PRIMARY', intent: 'TEST',
    semanticCluster: phrase.toLowerCase(), listingSpread: 1, provenance: [{ sourceType: 'TEST' }] })) } });

async function main() {
  const result = await adapter.buildIntelligence({
    research: { observations: { marketplace: 'ETSY', queryContexts: ['para mi hija'], sellers: [
      { listingId: '1', sourceRank: 1, title: 'Regalo para hija, collar de oro 18k',
        tags: ['regalo hija','collar 18k','cumpleanos hija'], provenance: { importId: 1 } },
      { listingId: '2', sourceRank: 2, title: 'Nike gift for daughter',
        tags: ['para mi hija','regalo especial','Daughter Lamp','No tags found','233','041 Favorites','147₫ 514','Sewing Accessories'], provenance: { importId: 1 } }
      ,{ listingId: '3', sourceRank: 3, title: 'Regalo LunaCraft para hija', shopName: 'LunaCraft',
        tags: ['gift for daughter'], provenance: { importId: 1 } }
    ] } },
    productTruth: { snapshot: { asserted: {
      productType: asserted('Custom Necklace'), materials: asserted('stainless steel'),
      personalization: asserted('Custom name personalization'), recipient: asserted('hija'),
      occasion: asserted('cumpleanos')
    } } }, configuration: { seedPhrase: 'para mi hija', listingLanguage: 'ES' }, masterKeywordArtifact: master([
      'regalo para hija', 'collar de oro 18k', 'cumpleanos hija', 'Nike gift for daughter', 'para mi hija',
      'regalo especial', 'Daughter Lamp', 'Regalo LunaCraft para hija', 'gift for daughter'
    ])
  });
  check(/^[0-9a-f]{64}$/.test(result.engineBindingHash), 'engine binding returned');
  check(result.output.listingDraft.etsyTitle.length <= 140, 'Etsy title within limit');
  check(/custom necklace/i.test(result.output.listingDraft.etsyTitle),
    'Etsy title retains the Product Truth identity while allocating safe Master KW phrases');
  check(result.output.listingDraft.etsyTitle.split(',').length <= 5,
    'Etsy title uses a bounded set of readable clauses instead of keyword stuffing');
  check(result.output.listingDraft.etsyTags.length <= 13, 'Etsy tag count within limit');
  check(result.output.listingDraft.etsyTags.every(tag => Array.from(tag).length <= 20), 'every Etsy tag within limit');
  check(result.output.listingDraft.etsyTagExplanations.length === result.output.listingDraft.etsyTags.length,
    'every generated Etsy tag has an allocation explanation');
  check(result.output.listingDraft.etsyTagExplanations.every(item => item.intent && item.reason
    && Array.isArray(item.sources)), 'tag explanations retain intent, reason and provenance');
  check(result.output.listingDraft.etsyTags.length === 13
    ? result.output.listingDraft.etsyTagStatus.code === 'COMPLETE'
    : result.output.listingDraft.etsyTagStatus.code === 'TAG_SHORTAGE'
      && result.output.listingDraft.etsyTagStatus.missingCount === 13 - result.output.listingDraft.etsyTags.length,
  'tag status reports a truthful shortage instead of padding unsafe tags');
  check(new Set(result.output.listingDraft.etsyTagExplanations.map(item => item.semanticCluster)).size
    === result.output.listingDraft.etsyTagExplanations.length, 'generated tags do not duplicate semantic clusters');
  const listingText = JSON.stringify(result.output.listingDraft).toLowerCase();
  check(!listingText.includes('18k') && !listingText.includes('oro'), 'unverified material excluded');
  check(!listingText.includes('nike'), 'canonical IP block excluded');
  check(result.accounting.claimBlockedCount >= 1, 'claim exclusions accounted');
  check(result.accounting.ipBlockedCount >= 1, 'IP exclusions accounted');
  check(result.accounting.languageTargetingCount >= 1, 'other-language phrases are accounted outside visible copy');
  check(result.accounting.competitorShopBlockedCount >= 1, 'competitor shop identity is blocked from copy');
  check(result.accounting.corpusAccountingGap === 0, 'every Etsy corpus candidate has exactly one disposition');
  check(result.output.keywordAllocation.unallocated.length === result.accounting.unallocatedCount,
    'unallocated keywords retained instead of silently dropped');
  check(result.output.keywordAllocation.reason.includes('NO_SELLER-SELECTED_PPC'), 'Etsy PPC limitation explicit');
  check(result.output.listingDraft.etsyDescription.includes('Materials: stainless steel'), 'description uses Product Truth');
  check(result.output.competitorSummary.uniqueListingIds === 3, 'competitor identities counted');
  check(result.output.listingDraft.imagePrompts.prompts.length === 8, 'full Etsy physical image prompt suite generated');
  check(result.output.listingDraft.imagePrompts.referenceImagesRequired === true, 'image prompts require real references');
  check(result.output.listingDraft.imagePrompts.blockedCount > 0, 'missing visual facts stay visibly blocked');
  check(!/no tags found|favorites|₫|sewing accessories|\b233\b/i.test(JSON.stringify(result.output.listingDraft)),
    'source boilerplate, metrics and irrelevant phrases never enter Etsy listing');
  check(result.accounting.masterKeywordCount === 9 && result.output.masterKeywordArtifact.id === 1,
    'intelligence consumes and reports the exact Etsy Master Keyword artifact');
  check(result.accounting.irrelevantCount >= 1 && result.output.keywordAllocation.irrelevant.length >= 1,
    'lexical but product-irrelevant phrases are retained with explicit disposition');
  check(result.output.keywordAllocation.irrelevant.some(item => item.phrase === 'Daughter Lamp'
    && item.reason === 'PRODUCT_TYPE_CONFLICT') && !listingText.includes('daughter lamp'),
  'wrong product noun is dispositioned and cannot contaminate a necklace listing');
  const pillow = await adapter.buildIntelligence({
    research: { observations: { marketplace: 'ETSY', queryContexts: ['gift for daughter'], sellers: [
      { listingId: 'p1', sourceRank: 1, title: 'Necklace for Daughter, Floral Striped Pillow',
        tags: ['Daughter Necklace','Floral Striped Pillow','Gift for Daughter'], provenance: { importId: 2 } }
    ] } }, productTruth: { snapshot: { asserted: {
      productType: asserted('Personalized Pillow'), personalization: asserted('Personalized name'),
      recipient: asserted('daughter')
    } } }, configuration: { seedPhrase: 'gift for daughter', listingLanguage: 'EN' },
    masterKeywordArtifact: master(['Daughter Necklace', 'Floral Striped Pillow', 'Gift for Daughter'], 2)
  });
  const pillowListing = JSON.stringify(pillow.output.listingDraft).toLowerCase();
  check(!pillowListing.includes('necklace') && pillow.output.keywordAllocation.irrelevant
    .some(item => item.reason === 'PRODUCT_TYPE_CONFLICT'),
  'cross-product necklace phrases cannot enter a pillow listing');
  check(!pillowListing.includes('floral') && !pillowListing.includes('striped')
    && pillow.output.keywordAllocation.irrelevant.some(item => item.reason === 'UNVERIFIED_PRODUCT_DESCRIPTOR'),
  'unsupported style descriptors cannot enter copy until Product Truth supplies them');
  check(adapter.unverifiedProductDescriptors({ phrase: 'Floral Striped Pillow' }, { productType: 'Personalized Pillow',
    style: 'floral striped' }).length === 0, 'Product Truth style fields can explicitly unlock matching descriptors');
  const automaticSpanish = await adapter.buildIntelligence({
    research: { observations: { marketplace: 'ETSY', queryContexts: ['para mi hija'], sellers: [
      { listingId: 'auto-es-1', sourceRank: 1, title: 'Collar para mi hija',
        tags: ['regalo para hija', 'collar personalizado'], provenance: { importId: 3 } }
    ] } }, productTruth: { snapshot: { asserted: {
      productName: asserted('Collar personalizado para mi hija'), productType: asserted('Collar'),
      personalization: asserted('Nombre personalizado'), recipient: asserted('hija')
    } } }, configuration: { seedPhrase: 'para mi hija' },
    masterKeywordArtifact: master(['para mi hija', 'regalo para hija', 'collar personalizado'], 3)
  });
  check(automaticSpanish.output.language === 'ES', 'AUTO infers Spanish from the canonical project seed');
  check(automaticSpanish.accounting.languageTargetingCount === 0,
    'AUTO does not misroute Spanish source phrases into the other-language bucket');
  console.log(`G4 Etsy intelligence adapter: ${passed}/${passed} PASS`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
