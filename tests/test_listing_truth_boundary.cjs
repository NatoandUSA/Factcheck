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

  // --- 2. publishGate: real, non-empty description passes (positive case,
  // proves this isn't just failing everything closed) ---
  const approvedWithRealDescription = {
    ...approvedButEmptyDescription,
    amazonDescription: 'Hand-stamped sterling silver necklace, 18-inch chain, gift-boxed.'
  };
  const res2 = evaluatePublishGate(approvedWithRealDescription);
  assert.strictEqual(res2.final_status, 'PUBLISH_READY', 'Real description with approval must reach PUBLISH_READY');
  assert.strictEqual(res2.canExport, true);
  console.log('🟢 publishGate accepts an approved listing with a real description.');

  // --- 3. server.js: no fabricated fallback description text remains ---
  const serverSrc = fs.readFileSync(path.resolve(__dirname, '../server/server.js'), 'utf8');
  assert.ok(!serverSrc.includes('Crafted with premium materials and attention to detail'), 'server.js must not inject a fabricated fallback description');
  assert.ok(serverSrc.includes("amazonDescription: payload.amazonDescription || ''"), 'server.js must leave a missing description empty, not fabricated');
  console.log('🟢 server.js POST /api/listings no longer fabricates a fallback description.');

  // --- 4. geminiService.js: sanitizer no longer injects fabricated A+ module
  // claims or category defaultMaterials as if they were confirmed facts ---
  const geminiSrc = fs.readFileSync(path.resolve(__dirname, '../src/services/geminiService.js'), 'utf8');
  assert.ok(!geminiSrc.includes('optical-grade materials'), 'geminiService.js must not fabricate specific material claims');
  assert.ok(!geminiSrc.includes('Solid wood build'), 'geminiService.js must not fabricate specific material claims');
  assert.ok(!geminiSrc.includes('category?.defaultMaterials || []'), 'geminiService.js must not silently fall back to unverified category defaults as real materials');
  assert.ok(geminiSrc.includes('do NOT invent material claims'), 'prompt must instruct the AI not to invent unverified materials');
  console.log('🟢 geminiService.js no longer fabricates material/A+ content claims.');

  // --- 5. SingleListingGenerator.jsx: category presets are no longer sent to
  // the AI as if they were confirmed real materials for this product ---
  const generatorSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/SingleListingGenerator.jsx'), 'utf8');
  assert.ok(!generatorSrc.includes('materials: selectedCategory.defaultMaterials'), 'category defaultMaterials must not be auto-asserted as real product facts');
  console.log('🟢 SingleListingGenerator.jsx no longer auto-asserts category presets as real materials.');

  // --- 6. App.jsx: a failed/rejected backend listing save must not show a
  // success toast or get added to the saved catalog history ---
  const appSrc = fs.readFileSync(path.resolve(__dirname, '../src/App.jsx'), 'utf8');
  assert.ok(appSrc.includes('NOT_PERSISTED'), 'App.jsx must have an explicit NOT_PERSISTED state for failed backend saves');
  assert.ok(appSrc.includes('if (enrichedResult.dbId)'), 'App.jsx must gate the success toast/history-save on an actual backend id, not just local generation');
  console.log('🟢 App.jsx no longer shows a false success state after a failed backend save.');

  // --- 7. The live Staff-facing listing viewer (ProductListingPageSimulator)
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
