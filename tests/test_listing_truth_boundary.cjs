/**
 * Regression coverage for the Listing Truth Boundary fixes (GPT/Manus combined
 * review 2026-08-18): a listing must not reach PUBLISH_READY on an empty
 * description, the server/AI paths must not silently fabricate material or
 * quality claims, and a failed backend save must not be presented to Staff
 * as a saved catalog listing.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { evaluatePublishGate } = require('../server/publishGate');
const { makeProductTruthCard } = require('./helpers/productTruth.cjs');

function run() {
  console.log('================================================================');
  console.log('  TESTING LISTING TRUTH BOUNDARY (PUBLISH GATE + FABRICATION)');
  console.log('================================================================\n');

  // --- 1. publishGate: empty description blocks PUBLISH_READY even when
  // Manager-approved and otherwise compliant ---
  const approvedButEmptyDescription = {
    status: 'MANAGER_APPROVED',
    amazonTitle: 'Personalized Custom Necklace Gift',
    amazonBullets: ['Bullet 1', 'Bullet 2', 'Bullet 3', 'Bullet 4', 'Bullet 5'],
    amazonSearchTerms: 'personalized custom necklace gift pendant sterling silver',
    etsyTags: Array.from({ length: 13 }, (_, i) => `tag${i}`),
    amazonDescription: '',
    etsyDescription: '',
    netProfit: 8.50,
    netMargin: 35.0
    ,productId: 1
    ,listingVersion: 1
  };
  const res1 = evaluatePublishGate(approvedButEmptyDescription);
  assert.notStrictEqual(res1.final_status, 'PUBLISH_READY', 'Empty description must not reach PUBLISH_READY');
  assert.strictEqual(res1.canExport, false, 'Empty description must not be exportable');
  assert.ok(res1.reasons.some(r => /description/i.test(r)), 'Gate must explain the description is missing');
  console.log('🟢 publishGate rejects an approved listing with no real description.');

  // --- 2. publishGate: a real description ALONE is not enough -- a fully
  // AI-generated, non-empty, plausible-sounding description must still be
  // rejected without an explicit human Product Truth attestation (GPT PR-10
  // re-audit: "non-empty" is necessary but not sufficient) ---
  const realDescriptionNoAttestation = {
    ...approvedButEmptyDescription,
    amazonDescription: 'Hand-stamped sterling silver necklace, 18-inch chain, gift-boxed.'
  };
  const res2 = evaluatePublishGate(realDescriptionNoAttestation);
  assert.notStrictEqual(res2.final_status, 'PUBLISH_READY', 'Real description without a Product Truth attestation must not reach PUBLISH_READY');
  assert.strictEqual(res2.canExport, false);
  assert.ok(res2.reasons.some(r => /Product Truth Card/i.test(r)), 'Gate must explain the structured Product Truth Card is missing');
  console.log('🟢 publishGate rejects a real description with no structured Product Truth Card.');

  // --- 3. publishGate: real description AND a real attestation passes
  // (positive case, proves this isn't just failing everything closed) ---
  const approvedWithAttestation = {
    ...realDescriptionNoAttestation,
    productTruthCard: makeProductTruthCard(1, 1)
  };
  const res3 = evaluatePublishGate(approvedWithAttestation);
  assert.strictEqual(res3.final_status, 'PUBLISH_READY', 'Real description + real attestation must reach PUBLISH_READY');
  assert.strictEqual(res3.canExport, true);
  console.log('🟢 publishGate accepts an approved listing with both a real description and a real attestation.');

  // --- 4. publishGate: a trivially short attestation ("ok", "yes") does not
  // satisfy the requirement -- it must be a real statement, not a rubber stamp ---
  const trivialAttestation = { ...realDescriptionNoAttestation, productTruthNotes: 'This free-text note is deliberately long but non-authoritative.' };
  const res4 = evaluatePublishGate(trivialAttestation);
  assert.notStrictEqual(res4.final_status, 'PUBLISH_READY', 'A trivial/rubber-stamp attestation must not satisfy the gate');
  console.log('🟢 publishGate rejects a trivial rubber-stamp attestation.');

  // --- 5. server.js: no fabricated fallback description text remains, and
  // the Amazon Quick Draft / trend-draft paths no longer auto-generate
  // Gold/Sterling Silver/Rose Gold child variations regardless of what the
  // real product is (GPT PR-10 re-audit: this fabrication fed directly into
  // listing.variations, the exact field the live viewer renders) ---
  const serverSrc = fs.readFileSync(path.resolve(__dirname, '../server/server.js'), 'utf8');
  assert.ok(!serverSrc.includes('Crafted with premium materials and attention to detail'), 'server.js must not inject a fabricated fallback description');
  assert.ok(serverSrc.includes("amazonDescription: payload.amazonDescription || ''"), 'server.js must leave a missing description empty, not fabricated');
  assert.ok(!serverSrc.includes('Sterling Silver / Medium'), 'server.js must not fabricate Gold/Silver/Rose-Gold child variations');
  assert.ok(!serverSrc.includes('variationThemes'), 'server.js must not auto-generate fabricated variation themes');
  assert.ok(serverSrc.includes('PRODUCT_TRUTH_CARD_INVALID'), 'server.js approve endpoint must require a canonical Product Truth Card');
  console.log('🟢 server.js no longer fabricates fallback content and requires structured Product Truth evidence on approve.');

  // --- 5b. server.js: the Amazon Quick Draft and trend-draft AI prompts no
  // longer instruct the model to invent materials/specs/care/workshop facts
  // when no real product data was supplied (GPT PR-10 second re-audit --
  // these two prompts were missed by the first amendment, which only fixed
  // the frontend geminiService.js generation path) ---
  assert.ok(!serverSrc.includes('3-5 authentic materials'), 'Quick Draft prompt must not instruct the AI to invent materials');
  assert.ok(!serverSrc.includes('3-5 authentic handmade materials'), 'trend-draft prompt must not instruct the AI to invent materials');
  assert.ok(!serverSrc.includes('US WORKSHOP PROMISE') && !serverSrc.includes('US Workshop Promise'), 'trend-draft prompt must not instruct the AI to assert an unverified workshop/origin claim');
  console.log('🟢 server.js Quick Draft / trend-draft prompts no longer instruct the AI to invent materials/specs/workshop facts.');

  // --- 5c. server.js: /api/chat (the Copilot Chat endpoint geminiService.js
  // actually calls) had its OWN separate, unedited system_instruction still
  // mandating "3-5 material strings" -- a fourth independent prompt-builder
  // missed across three prior rounds. Fixed now. Also: no auto-generated
  // parentSku (the live viewer presents it as paste-ready Seller Central
  // data, not just an internal label) and no unconditional "Personalized"
  // title claim from search-demand keywords alone (GPT PR-10 3rd re-audit) ---
  assert.ok(!serverSrc.includes('3-5 material strings'), '/api/chat system_instruction must not mandate fabricated materials');
  assert.ok(!serverSrc.includes('"Clear buyer instructions"'), '/api/chat system_instruction must not mandate fabricated personalization instructions');
  assert.ok(!serverSrc.includes('parentSku: `PARENT-SKU-'), 'Quick Draft / trend-draft must not auto-generate a fake parentSku presented as real Seller Central data');
  assert.ok(!serverSrc.includes('`Personalized ${trend.category}`'), 'trend-draft must not unconditionally claim "Personalized" as a verified product capability');
  console.log('🟢 server.js /api/chat no longer mandates fabricated materials/personalization, and no path auto-generates a fake parentSku or unconditional Personalized claim.');

  // --- 5d. server.js: Quick Draft / trend-draft must never trust the AI's
  // own judgment on personalization capability. The only non-empty value is
  // the canonical, listing-bound Product Truth projection; seed/keywords and
  // aiData are never authority. The "Custom" fallback is also gone. ---
  assert.ok(!serverSrc.includes('`Custom ${trend.category}`'), 'trend-draft etsyTitle fallback must not imply a "Custom" capability with no evidence');
  const canonicalRendererCount = (serverSrc.match(/renderVerifiedCommerceListing\(aiAuthority\.projection,/g) || []).length;
  assert.ok(canonicalRendererCount >= 3, 'All active commerce routes must render output from the canonical verified projection');
  assert.ok(!serverSrc.includes('etsyPersonalizationInstructions: aiData.etsyPersonalizationInstructions'), 'AI output must never authorize personalization capability');
  console.log('🟢 active server routes render personalization and commerce prose only from canonical Product Truth templates.');

  // --- 6. geminiService.js: sanitizer no longer injects fabricated A+ module
  // claims or category defaultMaterials as if they were confirmed facts ---
  const geminiSrc = fs.readFileSync(path.resolve(__dirname, '../src/services/geminiService.js'), 'utf8');
  assert.ok(!geminiSrc.includes('optical-grade materials'), 'geminiService.js must not fabricate specific material claims');
  assert.ok(!geminiSrc.includes('Solid wood build'), 'geminiService.js must not fabricate specific material claims');
  assert.ok(!geminiSrc.includes('category?.defaultMaterials || []'), 'geminiService.js must not silently fall back to unverified category defaults as real materials');
  assert.ok(geminiSrc.includes('do NOT invent material claims'), 'prompt must instruct the AI not to invent unverified materials');
  assert.ok(!geminiSrc.includes('Carefully inspected and packaged'), 'geminiService.js bullet padding must not assert an unverified inspection/packaging process claim');
  assert.ok(!geminiSrc.includes('[GIFT PRESENTATION BOX]') && !geminiSrc.includes('[CARE INSTRUCTIONS]'), 'geminiService.js prompt must not mandate a specific packaging/care bullet hook regardless of real input');
  assert.ok(!geminiSrc.includes('Product Specifications & Gift Unboxing'), 'geminiService.js prompt must not mandate an A+ specifications module with no real specs');
  console.log('🟢 geminiService.js no longer fabricates material/A+ content claims, process claims in bullet padding, or mandatory packaging/care/specs hooks.');

  // --- 7. SingleListingGenerator.jsx: category presets are no longer sent to
  // the AI as if they were confirmed real materials for this product ---
  const generatorSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/SingleListingGenerator.jsx'), 'utf8');
  assert.ok(!generatorSrc.includes('materials: selectedCategory.defaultMaterials'), 'category defaultMaterials must not be auto-asserted as real product facts');
  console.log('🟢 SingleListingGenerator.jsx no longer auto-asserts category presets as real materials.');

  // --- 7b. SingleListingGenerator.jsx / geminiService.js: category example
  // text (sampleBrief) must never auto-become the submitted/factual product
  // brief -- it's fictional example content ("luxury gift box", "LED wooden
  // light base"), not evidence about the real product (GPT PR-10 4th
  // re-audit) ---
  assert.ok(!generatorSrc.includes('useState(CATEGORIES[0].sampleBrief)'), 'productBrief must not be pre-filled with fabricated category example text');
  assert.ok(!generatorSrc.includes('setProductBrief(category.sampleBrief)') && !generatorSrc.includes('setProductBrief(selectedCategory.sampleBrief)'), 'category selection / reset must not inject example text as the real submitted brief');
  assert.ok(!geminiSrc.includes('|| category?.sampleBrief'), 'geminiService.js prompt must not fall back to category example text as if it were a real product brief');
  console.log('🟢 SingleListingGenerator.jsx / geminiService.js no longer let category example text become the submitted factual product brief.');

  // --- 8. App.jsx: a failed/rejected backend listing save must not show a
  // success toast or get added to the saved catalog history, and approval
  // must collect an explicit Product Truth attestation from Staff ---
  const appSrc = fs.readFileSync(path.resolve(__dirname, '../src/App.jsx'), 'utf8');
  assert.ok(appSrc.includes('NOT_PERSISTED'), 'App.jsx must have an explicit NOT_PERSISTED state for failed backend saves');
  assert.ok(appSrc.includes('if (enrichedResult.dbId)'), 'App.jsx must gate the success toast/history-save on an actual backend id, not just local generation');
  assert.ok(appSrc.includes('productTruthCard'), 'App.jsx approval flow must send a structured Product Truth Card');
  assert.ok(!appSrc.includes('window.prompt('), 'App.jsx must not turn free-text notes into Product Truth authority');
  console.log('🟢 App.jsx no longer shows false save success and only submits structured Product Truth evidence.');

  // --- 9. The live Staff-facing listing viewer (ProductListingPageSimulator)
  // stays clean of synthetic ASIN/SKU/price fallback data. Note: a separate
  // unreferenced file, ListingOutputViewer.jsx, still contains fabricated
  // fallback ASIN/SKU/price content and has pre-existing syntax errors, but
  // it is not imported anywhere and is absent from the built bundle -- it
  // does not reach Staff and is intentionally out of scope for this fix. ---
  const simulatorSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/ProductListingPageSimulator.jsx'), 'utf8');
  assert.ok(!simulatorSrc.includes('B0PARENT99'), 'live listing viewer must not fabricate placeholder ASINs');
  assert.ok(!simulatorSrc.includes('B0CHILD01'), 'live listing viewer must not fabricate placeholder child ASINs');
  console.log('🟢 ProductListingPageSimulator.jsx (the live listing viewer) has no fabricated ASIN/SKU/price fallback.');

  const etsyViewerSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/EtsyRealProductPage.jsx'), 'utf8');
  assert.ok(etsyViewerSrc.includes('generateEtsyListingImagePrompts(listing)'), 'Etsy viewer must pass the evidence-bearing listing object to the canonical image generator');
  assert.ok(!etsyViewerSrc.includes('generateEtsyListingImagePrompts(listing.etsyTitle'), 'Etsy viewer must not pass raw title/tags as factual prompt inputs');
  console.log('🟢 Etsy viewer image prompts consume the evidence-bearing listing object, not raw strings.');

  console.log('\n================================================================');
  console.log('  🟢 LISTING TRUTH BOUNDARY REGRESSION SUITE PASSED');
  console.log('================================================================');
}

try {
  run();
  console.log('✅ tests/test_listing_truth_boundary.cjs PASSED CLEANLY!');
} catch (err) {
  console.error('🔴 LISTING TRUTH BOUNDARY TEST FAILED:', err.message);
  process.exit(1);
}
