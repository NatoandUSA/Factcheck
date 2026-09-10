'use strict';

const assert = require('node:assert/strict');
const { generateImagePromptSuite } = require('../server/imagePromptGenerator');
const { evaluateListingGuard } = require('../server/listingGuard');

const asserted = value => ({ disposition: 'ASSERTED', value, basis: 'SUPPLIER_SPEC' });
let passed = 0;
function check(value, message) { assert.ok(value, message); passed++; }

const physicalSnapshot = { asserted: {
  productType: asserted('Custom Necklace'), personalization: asserted('Custom name personalization'),
  materials: asserted('stainless steel'), recipient: asserted('daughter')
} };
const physical = generateImagePromptSuite(physicalSnapshot, 'AMAZON');
check(physical.productMode === 'PHYSICAL', 'physical mode selected');
check(physical.prompts.length === 8, 'eight physical image slots');
check(physical.prompts.find(item => item.id === 'main_product').ready, 'main image ready');
check(!physical.prompts.find(item => item.id === 'packaging_contents').ready, 'packaging image blocked when missing');
check(physical.prompts.find(item => item.id === 'packaging_contents').prompt === '', 'blocked prompt contains no invented copy');
check(physical.readyCount + physical.blockedCount === 8, 'prompt accounting complete');
assert.doesNotThrow(() => evaluateListingGuard({ listing: { amazonTitle: 'Custom Necklace',
  imagePrompts: physical }, verifiedFacts: { productType: 'Custom Necklace',
  personalization: 'Custom name personalization', materials: 'stainless steel', recipient: 'daughter' } }));
passed++;

const digitalSnapshot = { asserted: {
  productType: asserted('Murder Mystery Game'), fileFormat: asserted('PDF files'),
  playerCount: asserted('1-6 players'), minimumAge: asserted('14 years'), duration: asserted('2-4 hours')
} };
const digital = generateImagePromptSuite(digitalSnapshot, 'ETSY');
check(digital.productMode === 'DIGITAL', 'digital mode selected');
check(digital.prompts.length === 7, 'seven digital image slots');
check(digital.prompts.every(item => item.ready), 'complete digital truth unlocks every prompt');
assert.doesNotThrow(() => evaluateListingGuard({ listing: { etsyTitle: 'Murder Mystery Game',
  imagePrompts: digital }, verifiedFacts: { productType: 'Murder Mystery Game', fileFormat: 'PDF files',
  playerCount: '1-6 players', minimumAge: '14 years', duration: '2-4 hours' } }));
passed++;
console.log(`G4 image prompt generator: ${passed}/11 PASS`);
