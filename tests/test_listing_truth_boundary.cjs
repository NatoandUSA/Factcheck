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

function run() {
  console.log('================================================================');
  console.log('  TESTING LISTING TRUTH BOUNDARY (PUBLISH GATE + FABRICATION)');
  console.log('================================================================\n');

  // --- 1. publishGate: empty description blocks PUBLISH_READY even when
  // Manager-approved and otherwise compliant ---
  const approvedButEmptyDescription = {
    status: 'MANAGER_APPROVED',
    amazonTitle: 'Personalized Custom Necklace Gift',
    etsyTags: Array.from({ length: 13 }, (_, i) => `tag${i}`),
    amazonDescription: '',
    etsyDescription: ''
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
  assert.ok(res2.reasons.some(r => /attestation/i.test(r)), 'Gate must explain the attestation is missing');
  console.log('🟢 publishGate rejects a real description with no human Product Truth attestation.');

  // --- 3. publishGate: real description AND a real attestation passes
  // (positive case, proves this isn't just failing everything closed) ---
  const approvedWithAttestation = {
    ...realDescriptionNoAttestation,
    productTruthNotes: 'Checked against supplier spec sheet: 925 sterling silver, 18in cable chain, matches sample photo.'
  };
  const res3 = evaluatePublishGate(approvedWithAttestation);
  assert.strictEqual(res3.final_status, 'PUBLISH_READY', 'Real description + real attestation must reach PUBLISH_READY');
  assert.strictEqual(res3.canExport, true);
  console.log('🟢 publishGate accepts an approved listing with both a real description and a real attestation.');

  // --- 4. publishGate: a trivially short attestation ("ok", "yes") does not
  // satisfy the requirement -- it must be a real statement, not a rubber stamp ---
  const trivialAttestation = { ...approvedWithAttestation, productTruthNotes: 'ok' };
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
  assert.ok(serverSrc.includes('PRODUCT_TRUTH_ATTESTATION_REQUIRED'), 'server.js approve endpoint must require an explicit Product Truth attestation');
  console.log('🟢 server.js no longer fabricates a fallback description or Gold/Silver/Rose-Gold variations, and requires attestation on approve.');

  // --- 6. geminiService.js: sanitizer no longer injects fabricated A+ module
  // claims or category defaultMaterials as if they were confirmed facts ---
  const geminiSrc = fs.readFileSync(path.resolve(__dirname, '../src/services/geminiService.js'), 'utf8');
  assert.ok(!geminiSrc.includes('optical-grade materials'), 'geminiService.js must not fabricate specific material claims');
  assert.ok(!geminiSrc.includes('Solid wood build'), 'geminiService.js must not fabricate specific material claims');
  assert.ok(!geminiSrc.includes('category?.defaultMaterials || []'), 'geminiService.js must not silently fall back to unverified category defaults as real materials');
  assert.ok(geminiSrc.includes('do NOT invent material claims'), 'prompt must instruct the AI not to invent unverified materials');
  console.log('🟢 geminiService.js no longer fabricates material/A+ content claims.');

  // --- 7. SingleListingGenerator.jsx: category presets are no longer sent to
  // the AI as if they were confirmed real materials for this product ---
  const generatorSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/SingleListingGenerator.jsx'), 'utf8');
  assert.ok(!generatorSrc.includes('materials: selectedCategory.defaultMaterials'), 'category defaultMaterials must not be auto-asserted as real product facts');
  console.log('🟢 SingleListingGenerator.jsx no longer auto-asserts category presets as real materials.');

  // --- 8. App.jsx: a failed/rejected backend listing save must not show a
  // success toast or get added to the saved catalog history, and approval
  // must collect an explicit Product Truth attestation from Staff ---
  const appSrc = fs.readFileSync(path.resolve(__dirname, '../src/App.jsx'), 'utf8');
  assert.ok(appSrc.includes('NOT_PERSISTED'), 'App.jsx must have an explicit NOT_PERSISTED state for failed backend saves');
  assert.ok(appSrc.includes('if (enrichedResult.dbId)'), 'App.jsx must gate the success toast/history-save on an actual backend id, not just local generation');
  assert.ok(appSrc.includes('productTruthNotes'), 'App.jsx approval flow must collect and send a Product Truth attestation');
  console.log('🟢 App.jsx no longer shows a false success state after a failed backend save, and collects a Product Truth attestation on approve.');

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
