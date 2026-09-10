'use strict';

function text(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(', ');
  return value == null ? '' : String(value).trim();
}

function factsFromSnapshot(snapshot) {
  return Object.freeze(Object.fromEntries(Object.entries(snapshot?.asserted || {})
    .map(([key, assertion]) => [key, assertion?.value])));
}

function prompt(id, purpose, aspectRatio, body, missingInputs = []) {
  return Object.freeze({ id, purpose, aspectRatio, ready: missingInputs.length === 0,
    missingInputs: Object.freeze(missingInputs), prompt: missingInputs.length ? '' : body });
}

function referenceRule(identity) {
  return `Create an ecommerce image of ${identity}. Use the attached product reference images as the only visual source for product geometry, design, colors and surface details. Keep the product unchanged.`;
}

function physicalPrompts(facts, marketplace) {
  const identity = text(facts.productName || facts.productType);
  const recipient = text(facts.recipient || facts.audience);
  const occasion = text(facts.occasion);
  const materials = text(facts.materials || facts.composition);
  const dimensions = text(facts.sizes || facts.dimensions);
  const personalization = text(facts.personalization);
  const packaging = text(facts.packaging);
  const base = referenceRule(identity);
  const mainRatio = marketplace === 'ETSY' ? '1:1' : '1:1';
  return Object.freeze([
    prompt('main_product', 'Primary marketplace image', mainRatio,
      `${base} Pure white background, product centered, evenly lit, sharp edges, natural shadow, no props, no badge, no watermark and no added text.`),
    prompt('alternate_angle', 'Alternate product angle', '1:1',
      `${base} Show a useful alternate angle that reveals construction without changing any component. Neutral light background, no added text.`),
    prompt('material_detail', 'Material and surface detail', '1:1', materials
      ? `${base} Produce a macro detail showing only this verified material information: ${materials}. Preserve the real texture and finish. No added text.` : '',
    materials ? [] : ['materials']),
    prompt('personalization_detail', 'Personalization detail', '1:1', personalization
      ? `${base} Show a close detail of the verified personalization area and method: ${personalization}. Preserve spelling and layout from the supplied personalization reference. No added text.` : '',
    personalization ? [] : ['personalization']),
    prompt('scale_dimensions', 'Scale and dimensions', '4:5', dimensions
      ? `${base} Create a clean scale image using only these verified measurements: ${dimensions}. Any dimension labels must reproduce those values exactly. Do not infer measurements.` : '',
    dimensions ? [] : ['sizes_or_dimensions']),
    prompt('lifestyle', 'Lifestyle context', '4:5',
      `${base} Place the unchanged product in a natural ${occasion || 'everyday'} setting${recipient ? ` appropriate for ${recipient}` : ''}. The product remains the clear focal point. Do not add unverified accessories, text or packaging.`),
    prompt('features_infographic', 'Verified feature overview', '4:5',
      `${base} Create a restrained ecommerce feature layout. Use only facts visibly supplied in the reference images and verified Product Truth. Leave any unsupported callout absent. No ratings, rankings, guarantees or delivery promises.`),
    prompt('packaging_contents', 'Packaging and included contents', '1:1', packaging
      ? `${base} Show only the verified packaging and included presentation: ${packaging}. Keep every item count and component consistent with the supplied references. No added promotional claim.` : '',
    packaging ? [] : ['packaging'])
  ]);
}

function digitalPrompts(facts) {
  const identity = text(facts.productName || facts.productType);
  const format = text(facts.fileFormat || facts.digitalDetails);
  const players = text(facts.playerCount);
  const age = text(facts.minimumAge);
  const duration = text(facts.duration);
  const base = `Create an ecommerce preview for the digital product ${identity}. Use the attached source pages and cover artwork as the only visual source. Do not imply that a physical item is shipped.`;
  return Object.freeze([
    prompt('digital_main', 'Primary digital product image', '1:1', `${base} Show the cover clearly in a clean square composition. No marketplace badge, rating or watermark.`),
    prompt('digital_contents', 'Included file overview', '4:5', format
      ? `${base} Present an overview using only this verified file information: ${format}. Show only pages or files present in the supplied source.` : '',
    format ? [] : ['fileFormat']),
    prompt('digital_evidence_detail', 'Content detail', '4:5', `${base} Show a legible close preview of representative supplied pages. Obscure the solution or spoiler content.`),
    prompt('digital_how_it_works', 'How it works', '4:5', `${base} Create a simple visual sequence using only verified workflow steps from Product Truth. Omit any step that is not supplied.`),
    prompt('digital_group_context', 'Use context', '4:5', players
      ? `${base} Show a realistic use context for ${players}. Screens and paper pages must reproduce supplied source content without inventing clues.` : '',
    players ? [] : ['playerCount']),
    prompt('digital_age_duration', 'Age and duration information', '4:5', age && duration
      ? `${base} Create a clean information image using exactly these verified values: minimum age ${age}; duration ${duration}. Add no performance or difficulty claim.` : '',
    [!age ? 'minimumAge' : null, !duration ? 'duration' : null].filter(Boolean)),
    prompt('digital_print_preview', 'Print and screen preview', '4:5', `${base} Show the supplied pages on a screen and as paper page previews. Do not invent paper size, device requirements or included physical items.`)
  ]);
}

function generateImagePromptSuite(snapshot, marketplace) {
  const facts = factsFromSnapshot(snapshot); const identity = text(facts.productName || facts.productType);
  if (!identity) throw Object.assign(new Error('PRODUCT_IDENTITY_REQUIRED'), { code: 'PRODUCT_IDENTITY_REQUIRED' });
  const digital = Boolean(text(facts.fileFormat || facts.digitalDetails));
  const prompts = digital ? digitalPrompts(facts) : physicalPrompts(facts, marketplace);
  return Object.freeze({ schemaVersion: 'omniseller.image-prompts.v1', marketplace, productMode: digital ? 'DIGITAL' : 'PHYSICAL',
    referenceImagesRequired: true, prompts, readyCount: prompts.filter(item => item.ready).length,
    blockedCount: prompts.filter(item => !item.ready).length });
}

module.exports = Object.freeze({ factsFromSnapshot, generateImagePromptSuite });
