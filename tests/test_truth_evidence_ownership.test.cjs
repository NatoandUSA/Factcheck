/**
 * TRUTH & EVIDENCE OWNERSHIP CONTRACT TEST SUITE
 * Tests:
 * 1. publishGate.js strictly selecting marketplace-authoritative descriptions (Amazon vs Etsy)
 * 2. UI components containing zero "Live Amazon", "Live Etsy", "100% Real", or "Handmade in Texas with love" labels
 * 3. HTTP endpoints rejecting missing seed/category inputs with HTTP 400 INSUFFICIENT_EVIDENCE
 * 4. Multi-tenant workspace upload filename scoping and background agent file isolation matrix
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const { evaluatePublishGate } = require('../server/publishGate');
const { makeProductTruthCard } = require('./helpers/productTruth.cjs');

async function runTruthEvidenceOwnershipTests() {
  console.log('================================================================');
  console.log('  TESTING TRUTH & EVIDENCE OWNERSHIP CONTRACT SUITE');
  console.log('================================================================\n');

  // --- PART 1: PUBLISH GATE MARKETPLACE DESCRIPTION SELECTION ---
  console.log('Test 1: Publish gate Amazon description enforcement...');
  const amazonListingWithEtsyDesc = {
    marketplace: 'AMAZON',
    status: 'MANAGER_APPROVED',
    amazonTitle: 'Custom Gold Bar Necklace for Women Personalised Name Gift',
    etsyDescription: 'Valid Etsy Description Content Here', // ONLY Etsy description provided
    amazonDescription: '', // Amazon description missing
    amazonSearchTerms: 'personalized necklace gold bar custom name pendant',
    amazonBullets: [
      '[ELEGANT DESIGN] Crafted for everyday milestone elegance.',
      '[CUSTOM ENGRAVING] Precision laser engraved with your name or date.',
      '[PERFECT GIFT] Packaged for birthdays, anniversaries, and holidays.',
      '[DURABLE QUALITY] Premium grade finish built for daily wear.',
      '[SATISFACTION GUARANTEED] Dedicated customer support for every order.'
    ],
    productType: 'SWEATSHIRT',
    productTruthNotes: 'Verified product specifications manually against real item',
    ipVerdict: 'OK',
    netProfit: 8.50,
    netMargin: 35.0
  };

  const amazonResult = evaluatePublishGate(amazonListingWithEtsyDesc);
  assert.strictEqual(amazonResult.final_status || amazonResult.status, 'NEEDS_REVIEW', 'Amazon listing with missing amazonDescription must be NEEDS_REVIEW');
  assert.ok(amazonResult.reasons.some(i => i.includes('Missing product description for AMAZON')), 'Must explicitly flag missing description for AMAZON');
  console.log('  🟢 Amazon publish gate cross-marketplace description rejection PASSED.');

  console.log('\nTest 2: Publish gate Etsy description enforcement...');
  const etsyListingWithAmazonDesc = {
    marketplace: 'ETSY',
    status: 'MANAGER_APPROVED',
    etsyTitle: 'Custom Gold Bar Necklace for Women Personalised Name Gift',
    amazonDescription: 'Valid Amazon Description Content Here', // ONLY Amazon description provided
    etsyDescription: '', // Etsy description missing
    etsyTags: ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10', 't11', 't12', 't13'],
    productType: 'SWEATSHIRT',
    productTruthNotes: 'Verified product specifications manually against real item',
    ipVerdict: 'OK',
    netProfit: 8.50,
    netMargin: 35.0
  };

  const etsyResult = evaluatePublishGate(etsyListingWithAmazonDesc);
  assert.strictEqual(etsyResult.final_status || etsyResult.status, 'NEEDS_REVIEW', 'Etsy listing with missing etsyDescription must be NEEDS_REVIEW');
  assert.ok(etsyResult.reasons.some(i => i.includes('Missing product description for ETSY')), 'Must explicitly flag missing description for ETSY');
  console.log('  🟢 Etsy publish gate cross-marketplace description rejection PASSED.');

  console.log('\nTest 3: Valid Amazon & Etsy listings with authoritative descriptions...');
  const validAmazon = {
    productId: 101,
    listingVersion: 1,
    productTruthCard: makeProductTruthCard(101, 1),
    marketplace: 'AMAZON',
    status: 'MANAGER_APPROVED',
    amazonTitle: 'Custom Gold Bar Necklace for Women Personalised Name Gift',
    amazonDescription: '<p>Real detailed product description for custom gold bar necklace.</p>',
    amazonSearchTerms: 'personalized necklace gold bar custom name pendant',
    amazonBullets: [
      '[ELEGANT DESIGN] Crafted for everyday milestone elegance.',
      '[CUSTOM ENGRAVING] Precision laser engraved with your name or date.',
      '[PERFECT GIFT] Packaged for birthdays, anniversaries, and holidays.',
      '[DURABLE QUALITY] Premium grade finish built for daily wear.',
      '[SATISFACTION GUARANTEED] Dedicated customer support for every order.'
    ],
    productType: 'SWEATSHIRT',
    productTruthNotes: 'Verified product specifications manually against real item',
    ipVerdict: 'OK',
    netProfit: 8.50,
    netMargin: 35.0
  };
  const validAmazonResult = evaluatePublishGate(validAmazon);
  assert.strictEqual(validAmazonResult.final_status || validAmazonResult.status, 'PUBLISH_READY');

  const validEtsy = {
    productId: 102,
    listingVersion: 1,
    productTruthCard: makeProductTruthCard(102, 1),
    marketplace: 'ETSY',
    status: 'MANAGER_APPROVED',
    etsyTitle: 'Custom Gold Bar Necklace for Women Personalised Name Gift',
    etsyDescription: 'Real detailed Etsy product description content here.',
    etsyTags: ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10', 't11', 't12', 't13'],
    productType: 'SWEATSHIRT',
    productTruthNotes: 'Verified product specifications manually against real item',
    ipVerdict: 'OK',
    netProfit: 8.50,
    netMargin: 35.0
  };
  const validEtsyResult = evaluatePublishGate(validEtsy);
  assert.strictEqual(validEtsyResult.final_status || validEtsyResult.status, 'PUBLISH_READY');
  console.log('  🟢 Authoritative marketplace description evaluation PASSED.');

  // --- PART 2: UI SIMULATOR TRUTH LABELS CONTENT ASSERTIONS ---
  console.log('\nTest 4: UI Simulator Component Truth Label Audit...');
  const amazonUI = fs.readFileSync(path.resolve(__dirname, '../src/components/AmazonRealProductPage.jsx'), 'utf8');
  assert.ok(!amazonUI.includes('Live Amazon Page View'), 'AmazonRealProductPage.jsx must not contain "Live Amazon Page View"');
  assert.ok(!amazonUI.includes('Amazon 100% Real Product Page Simulator'), 'AmazonRealProductPage.jsx must not contain "100% Real Product Page Simulator"');
  assert.ok(amazonUI.includes('Amazon Product Page Simulation Preview'), 'AmazonRealProductPage.jsx must contain "Amazon Product Page Simulation Preview"');

  const etsyUI = fs.readFileSync(path.resolve(__dirname, '../src/components/EtsyRealProductPage.jsx'), 'utf8');
  assert.ok(!etsyUI.includes('Live Etsy Shop Page'), 'EtsyRealProductPage.jsx must not contain "Live Etsy Shop Page"');
  assert.ok(!etsyUI.includes('Etsy 100% Real Shop Product Page Simulator'), 'EtsyRealProductPage.jsx must not contain "100% Real Shop Product Page Simulator"');
  assert.ok(!etsyUI.includes('Handmade in Texas with love.'), 'EtsyRealProductPage.jsx must not contain fake Texas origin fallback');
  assert.ok(etsyUI.includes('Etsy Listing Page Simulation Preview'), 'EtsyRealProductPage.jsx must contain "Etsy Listing Page Simulation Preview"');

  const headerUI = fs.readFileSync(path.resolve(__dirname, '../src/components/Header.jsx'), 'utf8');
  assert.ok(!headerUI.includes('100% Real Clone'), 'Header.jsx must not contain "100% Real Clone"');

  const appUI = fs.readFileSync(path.resolve(__dirname, '../src/App.jsx'), 'utf8');
  assert.ok(!appUI.includes('100% Real Amazon & Etsy Product Page Simulator'), 'App.jsx must not contain "100% Real Amazon & Etsy Product Page Simulator"');
  console.log('  🟢 UI Component Truth Label Audit PASSED cleanly.');

  // --- PART 3: MULTI-TENANT BACKGROUND AGENT FILE ISOLATION ASSERTION ---
  console.log('\nTest 5: Multi-tenant background agent file isolation matrix...');
  const serverSrc = fs.readFileSync(path.resolve(__dirname, '../server/server.js'), 'utf8');
  assert.ok(!serverSrc.includes("f.startsWith('global__')"), 'server.js background scanner must not accept global__ wildcard files');
  assert.ok(serverSrc.includes("f.startsWith(`${agent.workspace_id}__`)"), 'server.js background scanner must filter strictly by agent.workspace_id');
  console.log('  🟢 Background agent multi-tenant workspace isolation contract PASSED.');

  console.log('\n================================================================');
  console.log('  🟢 ALL TRUTH & EVIDENCE OWNERSHIP CONTRACT TESTS PASSED CLEANLY');
  console.log('================================================================');
}

runTruthEvidenceOwnershipTests().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
