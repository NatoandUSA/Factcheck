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
check(physical.prompts.find(item => item.id === 'main_product').ready, 'main image prompt body is fact-complete');
check(physical.prompts.find(item => item.id === 'main_product').status === 'REFERENCE_REQUIRED',
  'physical prompt explicitly requires a product reference before image generation');
check(physical.prompts.find(item => item.id === 'main_product').prompt.includes('Select exactly one variant'), 'main image selects one variant');
check(physical.prompts.find(item => item.id === 'alternate_angle').status === 'REFERENCE_REQUIRED'
  && physical.prompts.find(item => item.id === 'alternate_angle').prompt.includes('only if the attached references actually show'),
  'alternate angle is reference-required and cannot invent unseen geometry');
check(!physical.prompts.find(item => item.id === 'packaging_contents').ready, 'packaging image blocked when missing');
check(physical.prompts.find(item => item.id === 'packaging_contents').status === 'OWNER_FACT_REQUIRED',
  'missing packaging is owner-fact-required');
check(physical.prompts.find(item => item.id === 'packaging_contents').prompt === '', 'blocked prompt contains no invented copy');
check(physical.readyCount + physical.blockedCount === 8, 'prompt accounting complete');
const vaguePersonalization = generateImagePromptSuite({ asserted: {
  productType: asserted('Necklace'), personalization: asserted('Yes') } }, 'ETSY');
check(!vaguePersonalization.prompts.find(item => item.id === 'personalization_detail').ready
  && vaguePersonalization.prompts.find(item => item.id === 'personalization_detail').status === 'OWNER_FACT_REQUIRED',
  'boolean personalization does not claim a verified area or method');
const annotatedPackaging = generateImagePromptSuite({ asserted: {
  productType: asserted('Necklace'), packaging: asserted('Gift box / ready-to-gift — theo listing tham chiếu') } }, 'AMAZON');
const packagingPrompt = annotatedPackaging.prompts.find(item => item.id === 'packaging_contents');
check(packagingPrompt.ready && packagingPrompt.status === 'REFERENCE_REQUIRED'
  && !/theo listing tham chiếu/i.test(packagingPrompt.prompt),
'verified packaging prompt strips internal provenance while retaining the reference requirement');

const structuredPackaging = generateImagePromptSuite({ asserted: {
  productType: asserted('Necklace'), packaging: asserted({ type: 'gift box', dimensions: '8*8*3' }) } }, 'ETSY');
const structuredPackagingPrompt = structuredPackaging.prompts.find(item => item.id === 'packaging_contents');
check(structuredPackagingPrompt.ready
  && /gift box/i.test(structuredPackagingPrompt.prompt)
  && !/8\*8\*3|\[object Object\]/.test(structuredPackagingPrompt.prompt),
'structured packaging prompt keeps verified type and hides dimensions whose unit is not verified');

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
console.log(`G4 image prompt generator: ${passed}/${passed} PASS`);
