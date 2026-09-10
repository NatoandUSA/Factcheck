'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const amazonResearch = require('../server/commerceIntelligence/amazonResearchAdapter');
const amazonIntelligence = require('../server/commerceIntelligence/amazonIntelligenceAdapter');
const etsyResearch = require('../server/commerceIntelligence/etsyResearchAdapter');
const etsyIntelligence = require('../server/commerceIntelligence/etsyIntelligenceAdapter');

const base = process.argv[2] || 'C:\\Users\\Admin\\Downloads\\Inputdata08092026';
const raw = (id, kind, name, adapter) => {
  const raw_bytes = fs.readFileSync(path.join(base, name));
  return { id, kind, file_name: name, raw_bytes, raw_hash: crypto.createHash('sha256').update(raw_bytes).digest('hex'),
    media_type: name.endsWith('.csv') ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    selected_sheet: null, parser_id: adapter.PARSER_ID, parser_hash: adapter.parserBindingHash() };
};
const truth = { id: 1, content_hash: 'owner-confirmed-minimal-truth', snapshot: {
  asserted: {
    productName: { value: 'Para Mi Hija Custom Necklace' }, productType: { value: 'Custom Necklace' },
    personalization: { value: 'Custom option available' }, recipient: { value: 'daughter' },
    occasion: { value: 'gift' }
  },
  unknown: { materials: { reason: 'Not supplied in Owner confirmation' }, purity: { reason: 'Not supplied' },
    sizes: { reason: 'Not supplied' }, packaging: { reason: 'Not supplied' } }
} };

(async () => {
  const amazon = await amazonResearch.buildSnapshot([
    raw(1, 'AMAZON_CEREBRO', 'Cerebro_Hija.xlsx', amazonResearch),
    raw(2, 'AMAZON_XRAY', 'Xray_Hija.xlsx', amazonResearch)
  ]);
  const amazonResult = await amazonIntelligence.buildIntelligence({ research: amazon, productTruth: truth,
    configuration: { seedPhrase: 'para mi hija' } });
  const etsy = await etsyResearch.buildSnapshot([
    raw(3, 'ETSY_SEARCH', 'para_mi_hija_search_20260908_222159.csv', etsyResearch),
    raw(4, 'ETSY_SEARCH', 'para_mi_hija_search_20260908_222205.csv', etsyResearch),
    raw(5, 'ETSY_SEARCH', 'para_mi_hija_search_20260908_222208.csv', etsyResearch)
  ]);
  const etsyResult = await etsyIntelligence.buildIntelligence({ research: etsy, productTruth: truth,
    configuration: { seedPhrase: 'para mi hija' } });
  const materialPattern = /(?:18k|925|sterling silver|oro 18k|plata 925)/;
  const amazonListing = amazonResult.output.listingDraft;
  const amazonAssertionSurfaces = JSON.stringify({ title: amazonListing.amazonTitle, bullets: amazonListing.amazonBullets,
    highlights: amazonListing.itemHighlights, searchTerms: amazonListing.amazonSearchTerms,
    description: amazonListing.amazonDescription, aPlus: amazonListing.amazonAPlusPoints,
    imagePrompts: amazonListing.imagePrompts }).toLowerCase();
  const etsyListing = etsyResult.output.listingDraft;
  const etsyAssertionSurfaces = JSON.stringify({ title: etsyListing.etsyTitle, tags: etsyListing.etsyTags,
    highlights: etsyListing.itemHighlights, description: etsyListing.etsyDescription,
    imagePrompts: etsyListing.imagePrompts }).toLowerCase();
  const report = {
    generatedAt: new Date().toISOString(), inputDirectory: base,
    productTruth: { asserted: Object.keys(truth.snapshot.asserted), unknown: Object.keys(truth.snapshot.unknown) },
    amazon: {
      researchAccounting: amazon.accounting, intelligenceAccounting: amazonResult.accounting,
      sourceColumnCounts: amazon.observations.sources.flatMap(source => source.consumedSheets.map(sheet => ({
        kind: source.kind, sheet: sheet.sheetName, columns: sheet.headers.length,
        blankHeaderColumns: sheet.headerColumns.filter(column => column.blank).map(column => column.key)
      }))),
      blankHeaderCellsRetained: amazon.observations.cerebro.observations.filter(item =>
        Object.entries(item.sourceFields).some(([key, value]) => key.startsWith('__blank_column_') && value != null && value !== '')).length,
      title: amazonResult.output.listingDraft.amazonTitle,
      bulletCount: amazonResult.output.listingDraft.amazonBullets.length,
      searchTermBytes: Buffer.byteLength(amazonResult.output.listingDraft.amazonSearchTerms, 'utf8'),
      promptReady: amazonResult.output.listingDraft.imagePrompts.readyCount,
      promptBlockedForMissingTruth: amazonResult.output.listingDraft.imagePrompts.blockedCount,
      forbiddenMaterialLeak: materialPattern.test(amazonAssertionSurfaces),
      unverifiedMaterialRetainedOnlyForFlaggedPpc: amazonResult.output.claimTargeting
        .filter(item => materialPattern.test(item.phrase.toLowerCase())).length
    },
    etsy: {
      researchAccounting: etsy.accounting, intelligenceAccounting: etsyResult.accounting,
      title: etsyResult.output.listingDraft.etsyTitle,
      tags: etsyResult.output.listingDraft.etsyTags,
      promptReady: etsyResult.output.listingDraft.imagePrompts.readyCount,
      promptBlockedForMissingTruth: etsyResult.output.listingDraft.imagePrompts.blockedCount,
      forbiddenMaterialLeak: materialPattern.test(etsyAssertionSurfaces),
      unverifiedMaterialExcludedFromEtsyBecauseNoPpcSurface: etsyResult.output.keywordAllocation.claimBlocked
        .filter(item => materialPattern.test(item.phrase.toLowerCase())).length
    }
  };
  if (report.amazon.forbiddenMaterialLeak || report.etsy.forbiddenMaterialLeak) throw new Error('UNVERIFIED_MATERIAL_LEAK');
  console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exit(1); });
