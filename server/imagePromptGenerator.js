'use strict';

function text(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(', ');
  if (value && typeof value === 'object') {
    const rawDimensions = value.dimensions == null ? '' : String(value.dimensions).trim();
    const explicitUnit = value.unit == null ? '' : String(value.unit).trim();
    const unitEmbedded = /(?:\b(?:mm|cm|m|in|inch|inches|ft|feet)\b|["′″])/i.test(rawDimensions);
    const entries = Object.entries(value)
      .filter(([key]) => key !== 'dimensions' || explicitUnit || unitEmbedded)
      .map(([key, child]) => [key, text(child)]).filter(([, child]) => child);
    const type = entries.find(([key]) => key === 'type')?.[1] || '';
    const rest = entries.filter(([key]) => key !== 'type').map(([key, child]) => `${key}: ${child}`);
    return [type, ...rest].filter(Boolean).join('; ');
  }
  return value == null ? '' : String(value).trim();
}

function factsFromSnapshot(snapshot) {
  return Object.freeze(Object.fromEntries(Object.entries(snapshot?.asserted || {})
    .map(([key, assertion]) => [key, assertion?.value])));
}

function prompt(id, purpose, aspectRatio, body, missingInputs = [], status = null) {
  const promptReady = missingInputs.length === 0;
  return Object.freeze({ id, purpose, aspectRatio, ready: promptReady,
    status: status || (promptReady ? 'REFERENCE_REQUIRED' : 'OWNER_FACT_REQUIRED'),
    missingInputs: Object.freeze(missingInputs), prompt: promptReady ? body : '' });
}

function promptFact(value) {
  return text(value).replace(/\s*(?:[-—–]\s*)?theo listing tham chiếu\s*$/iu, '').trim();
}

function referenceRule(identity) {
  return `Create one ecommerce image for the product identified as ${identity}. The attached images may show different variants or existing promotional compositions. Select exactly one variant from one reference image; do not combine variants, duplicate a reference layout, or add another product. Use that selected reference as the only source for product geometry, artwork, structure, colors and lettering. Keep every visible product component unchanged. If small lettering cannot be reproduced exactly, leave it unchanged in the source photo instead of redrawing or inventing it.`;
}

function physicalPrompts(facts, marketplace) {
  const identity = text(facts.productType || facts.productName);
  const recipient = promptFact(facts.recipient || facts.audience);
  const occasion = promptFact(facts.occasion);
  const materials = promptFact(facts.materials || facts.composition);
  const dimensions = promptFact(facts.sizes || facts.dimensions);
  const personalizationValue = facts.personalization;
  const personalizationRecord = personalizationValue && typeof personalizationValue === 'object' && !Array.isArray(personalizationValue)
    ? personalizationValue : null;
  const personalizationMethod = personalizationRecord ? promptFact(personalizationRecord.method) : '';
  const personalizationArea = personalizationRecord
    ? promptFact(personalizationRecord.area || personalizationRecord.location || personalizationRecord.placement) : '';
  const personalizationFields = personalizationRecord
    ? promptFact(personalizationRecord.fields || personalizationRecord.options) : '';
  const personalizationSpecified = Boolean(personalizationMethod && personalizationArea);
  const personalizationDetail = [
    personalizationMethod && `method: ${personalizationMethod}`,
    personalizationArea && `area: ${personalizationArea}`,
    personalizationFields && `fields: ${personalizationFields}`
  ].filter(Boolean).join('; ');
  const packaging = promptFact(facts.packaging);
  const base = referenceRule(identity);
  const mainRatio = marketplace === 'ETSY' ? '1:1' : '1:1';
  return Object.freeze([
    prompt('main_product', 'Primary marketplace image', mainRatio,
      `${base} Extract only the one selected product variant from its source setting; place that same product on a pure white background, centered with a natural shadow. Do not paste an entire reference image or show two variants side by side. No props, badges, watermark or added text.`),
    prompt('alternate_angle', 'Alternate product angle', '1:1',
      `${base} Show an alternate view only if the attached references actually show that angle of the same selected variant. Never reconstruct unseen depth, lid, hinges, attachments, chain or lettering. If no alternate-angle reference exists, mark this slot as requiring another source photo. Neutral light background, no added text.`),
    prompt('material_detail', 'Material and surface detail', '1:1', materials
      ? `${base} Produce a macro detail showing only this verified material information: ${materials}. Preserve the real texture and finish. No added text.` : '',
    materials ? [] : ['materials']),
    prompt('personalization_detail', 'Personalization detail', '1:1', personalizationSpecified
      ? `${base} Show a close detail using only this verified personalization method and area: ${personalizationDetail}. Preserve spelling and layout from the supplied personalization reference. No added text.` : '',
    personalizationSpecified ? [] : ['personalization_method_and_area']),
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
