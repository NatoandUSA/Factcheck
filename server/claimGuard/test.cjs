'use strict';

const assert = require('node:assert/strict');
const guard = require('./index');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  process.stdout.write(`ok ${passed} - ${name}\n`);
}

function ids(text) {
  return guard.scanClaims(text).map(claim => claim.claimId);
}

test('registry exposes exactly the canonical 14 stable ids', () => {
  assert.equal(guard.CLAIM_IDS.length, 14);
  assert(guard.CLAIM_IDS.includes('DIGITAL_FORMAT_LICENSE_USAGE_RIGHT'));
  assert.equal(Object.isFrozen(guard.DEFINITIONS.COMPOSITION_MATERIAL_PURITY.terms), true);
  assert.equal(Object.isFrozen(guard.FIELD_RULES[0].paths), true);
});

test('EN and accent-folded ES claims use word boundaries', () => {
  assert(ids('Plata 925 y algodón orgánico').includes('COMPOSITION_MATERIAL_PURITY'));
  assert(ids('Plata 925 y algodón orgánico').includes('ENVIRONMENT_ETHICAL_SUSTAINABILITY'));
  assert(!ids('goldfish watercolor').includes('COMPOSITION_MATERIAL_PURITY'));
  assert(ids('ＧＯＬＤ necklace').includes('COMPOSITION_MATERIAL_PURITY'));
  assert(ids('#1 daughter gift').includes('COMPARATIVE_SUPERLATIVE_EXCLUSIVITY'));
});

test('legacy one-to-many classes map by token, never by whole class', () => {
  assert.equal(guard.adaptLegacyClaim({ class: 'C4_CAPABILITY', token: 'waterproof' }, guard.scanClaims).claimId,
    'PERFORMANCE_DURABILITY_WATERPROOF_COMPATIBILITY');
  assert.equal(guard.adaptLegacyClaim({ class: 'C4_CAPABILITY', token: 'vegan' }, guard.scanClaims).claimId,
    'ENVIRONMENT_ETHICAL_SUSTAINABILITY');
  assert.equal(guard.adaptLegacyClaim({ class: 'C4_CAPABILITY', token: 'unknown' }, guard.scanClaims).status, 'REVIEW');
});

test('product identity cannot prove material, purity, dimensions, included items or fulfillment', () => {
  const truth = { productName: 'Sterling Silver 925 Necklace 18 inch set of 3', productType: 'Express gift box' };
  const audit = guard.auditComposedOutput({ title: 'Sterling silver 925 necklace, 18 inch set of 3 with gift box, express delivery' }, truth);
  const families = new Set(audit.blocking.map(item => item.claimId));
  assert(families.has('COMPOSITION_MATERIAL_PURITY'));
  assert(families.has('MEASURE_DIMENSION_WEIGHT_QUANTITY_CAPACITY'));
  assert(families.has('PACKAGING_ACCESSORY_INCLUDED_EXTRA'));
  assert(families.has('FULFILLMENT_PROCESSING_DELIVERY'));
});

test('product identity never corroborates a capability or process claim', () => {
  const truth = { productName: 'Personalized necklace' };
  assert.equal(guard.auditComposedOutput({ title: 'Personalized necklace' }, truth).claimSurfaceBlockingFree, false);
  assert.equal(guard.auditComposedOutput({ title: 'Laser engraved necklace' }, truth).claimSurfaceBlockingFree, false);
});

test('personalization entitlement proves personalization but not engraving method', () => {
  const truth = { personalization: 'Enter up to 3 names' };
  const audit = guard.auditComposedOutput({ title: 'Custom necklace', bullet: 'Laser engraved' }, truth);
  assert(!audit.blocking.some(item => item.token === 'custom'));
  assert(audit.blocking.some(item => item.token === 'laser'));
  assert(audit.blocking.some(item => item.token === 'engraved'));
});

test('dedicated truth fields corroborate matching material and size claims', () => {
  const truth = { materials: ['14k gold plated', 'stainless steel'], sizes: ['18 inch'] };
  const audit = guard.auditComposedOutput({ title: '14k gold plated stainless steel necklace', bullet: '18 inch chain' }, truth);
  assert.equal(audit.clean, true);
});

test('confirmed gemstone truth corroborates the exact observed stone but not a different stone', () => {
  const truth = { gemstones: 'Cubic Zirconia' };
  assert.equal(guard.auditComposedOutput({ description: 'Cubic zirconia necklace' }, truth).clean, true);
  assert.equal(guard.auditComposedOutput({ description: 'Diamond necklace' }, truth).claimSurfaceBlockingFree, false);
});

test('verified included items corroborate message cards without making identity authoritative', () => {
  const truth = { productName: 'Necklace Message Card', includedItems: 'Message card' };
  assert.equal(guard.auditComposedOutput({ title: 'Necklace with message card' }, truth).clean, true);
  assert.equal(guard.auditComposedOutput({ title: 'Necklace with velvet pouch' }, truth).claimSurfaceBlockingFree, false);
});

test('wrong material and wrong size remain blocked', () => {
  const truth = { materials: ['14k gold plated stainless steel'], sizes: ['18 inch'] };
  const audit = guard.auditComposedOutput({ title: 'Sterling silver necklace', bullet: '20 inch chain' }, truth);
  assert(audit.blocking.some(item => item.token === 'sterling'));
  assert(audit.blocking.some(item => item.token === 'silver'));
  assert(audit.blocking.some(item => item.token === '20 inch'));
});

test('surface policy blocks copy, excludes backend terms and retains flagged PPC', () => {
  const truth = { materials: ['stainless steel'] };
  const copy = guard.evaluateText('925 silver necklace', truth, guard.SURFACES.VISIBLE_COPY);
  const search = guard.evaluateText('925 silver necklace', truth, guard.SURFACES.BACKEND_SEARCH);
  const ppc = guard.evaluateText('925 silver necklace', truth, guard.SURFACES.PPC);
  assert.equal(copy.allowed, false);
  assert.equal(search.excluded, true);
  assert.equal(ppc.allowed, true);
  assert(ppc.unverifiedClaims.length > 0);
});

test('unknown surfaces fail closed', () => {
  assert.throws(() => guard.actionForSurface('SOMETHING_ELSE'), { code: 'UNKNOWN_CLAIM_SURFACE' });
});

test('second pass catches template and staff-edit injected claims', () => {
  const truth = { materials: ['stainless steel'] };
  assert.equal(guard.auditComposedOutput({ description: 'Template: genuine diamond' }, truth).claimSurfaceBlockingFree, false);
  assert.equal(guard.auditEditedOutput({ description: 'Edited: waterproof' }, truth).claimSurfaceBlockingFree, false);
});

test('nested image prompts receive the same blocking audit as visible copy', () => {
  const truth = { materials: ['stainless steel'] };
  const result = guard.auditOutput({ creative: { prompts: ['Macro photo of 925 silver pendant'] } }, truth, { surface: guard.SURFACES.IMAGE_PROMPT });
  assert.equal(result.claimSurfaceBlockingFree, false);
  assert(result.blocking.some(item => item.field === 'creative.prompts[0]'));
});

test('digital, commercial and comparative families have direct stable coverage', () => {
  const found = new Set(ids('PDF file for commercial use, 20% off, best and exclusive'));
  assert(found.has('DIGITAL_FORMAT_LICENSE_USAGE_RIGHT'));
  assert(found.has('PRICE_DISCOUNT_SCARCITY_COMMERCIAL_PROMISE'));
  assert(found.has('COMPARATIVE_SUPERLATIVE_EXCLUSIVITY'));
});

test('all twelve known abandoned image-prompt fabrications remain blocked', () => {
  const truth = {
    productType: 'Embroidered Crewneck Sweatshirt',
    productName: 'Embroidered Mama Sweatshirt',
    materials: '65% cotton, 35% polyester',
    sizes: 'S, M, L, XL',
    capabilities: ['Machine embroidery, not printed'],
    shipFrom: 'Vietnam'
  };
  const fabrications = [
    'laser-etched precision details', 'solid timber base', 'USB plug and play',
    'velvet-lined embossed gift box', 'we handcraft and ship in 24h',
    '100% quality inspected USA workshop', 'optical grade acrylic', 'European beechwood',
    'Austin Texas artisan workshop', 'sustainable timber and eco-friendly packaging',
    '5-star review social proof', 'fade-proof UV tech'
  ];
  for (const text of fabrications) {
    assert(guard.unverifiedClaims(text, truth).length > 0, `fabrication passed unchallenged: ${text}`);
  }
});

test('real Esposa material/purity conflicts and matching 14k truth are separated', () => {
  const truth = { productType: 'Necklace', materials: 'Acero inoxidable, bano de oro 14k' };
  assert.equal(guard.unverifiedClaims('collar de oro 14k', truth).length, 0);
  assert(guard.unverifiedClaims('collar de oro 18k', truth).some(item => item.token === '18k'));
  assert(guard.unverifiedClaims('collar de plata 925', truth).some(item => item.token === '925'));
});

test('ordinary Hija audience and occasion phrases are not treated as product attributes', () => {
  const truth = { productType: 'Necklace', recipient: 'daughter' };
  for (const text of ['necklace for daughter from mom', 'birthday gift for daughter necklace', 'regalo para mi hija navidad']) {
    assert.equal(guard.unverifiedClaims(text, truth).length, 0, text);
  }
});

test('corroboration is opaque and forged or caller-mutated sets cannot authorize claims', () => {
  const empty = guard.buildCorroboration({});
  assert.equal(Object.isFrozen(empty), true);
  assert.equal(empty.supported, undefined);
  assert.equal(guard.evaluateText('silver 925', empty, guard.SURFACES.VISIBLE_COPY).allowed, false);
  const forged = { supported: new Set(['COMPOSITION_MATERIAL_PURITY\u0000925']) };
  assert.equal(guard.evaluateText('925', forged, guard.SURFACES.VISIBLE_COPY).allowed, false);
});

test('claim audit returns no publish or approval authority boolean', () => {
  const audit = guard.auditOutput({ backend: 'silver 925' }, {}, {
    surface: guard.SURFACES.BACKEND_SEARCH
  });
  assert.equal(audit.claimSurfaceBlockingFree, true);
  assert.equal('publishable' in audit, false);
  assert.equal('canApprove' in audit, false);
  assert.equal('canExport' in audit, false);
  assert(audit.excluded.length > 0);
});

process.stdout.write(`# ${passed} passed / 0 failed / 0 unexecuted\n`);
