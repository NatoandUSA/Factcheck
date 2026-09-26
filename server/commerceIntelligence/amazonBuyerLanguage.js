'use strict';

const ES_REPLACEMENTS = Object.freeze([
  [/\bDaughter\s*\/\s*Hija\b/giu, 'Hija'],
  [/\bNecklace\b/giu, 'Collar'],
  [/\bCustom\b/giu, 'Personalizado'],
  [/\bGraduation\b/giu, 'Graduación'],
  [/\bBirthday\b/giu, 'Cumpleaños'],
  [/\bProposal Mug\b/giu, 'Taza de propuesta'],
  [/\bMug\b/giu, 'Taza'],
  [/\bProposal\b/giu, 'Propuesta'],
  [/\bLight Blue\b/giu, 'Azul claro'],
  [/\bLight Green\b/giu, 'Verde claro'],
  [/\bNavy\b/giu, 'Azul marino'],
  [/\bWhite\b/giu, 'Blanco'],
  [/\bPink\b/giu, 'Rosa'],
  [/\bRed\b/giu, 'Rojo'],
  [/\bBlack\b/giu, 'Negro'],
  [/\bname\b/giu, 'nombre'],
  [/\byear\b/giu, 'año'],
  [/\bStainless Steel\b/giu, 'Acero inoxidable'],
  [/\bSterling Silver\b/giu, 'Plata esterlina'],
  [/\bSilver\b/giu, 'Plata'],
  [/\bYellow\b/giu, 'Amarillo'],
  [/\bPolished\b/giu, 'Pulido'],
  [/\bCubic Zirconia\b/giu, 'Circonita cúbica'],
  [/\bMetal Type\b/giu, 'Tipo de metal'],
  [/\bClasp Type\b/giu, 'Tipo de cierre'],
  [/\bChain Type\b/giu, 'Tipo de cadena'],
  [/\bSetting Type\b/giu, 'Tipo de engaste'],
  [/\bClosure Type\b/giu, 'Tipo de cierre'],
  [/\blobster clasp\b/giu, 'cierre de mosquetón'],
  [/\bLobster\b/giu, 'Mosquetón'],
  [/\bProng\b/giu, 'Garras'],
  [/\bGift box\b/giu, 'Caja de regalo'],
  [/\bready-to-gift\b/giu, 'lista para regalar'],
  [/\bMessage card\b/giu, 'Tarjeta con mensaje'],
  [/\binches?\b/giu, 'pulgadas'],
  [/\bBox\b/giu, 'Caja'],
  [/\bounces\b/giu, 'onzas'],
  [/\bUS\b/gu, 'EE. UU.']
]);

function renderBuyerValue(value, language = 'EN') {
  let text = String(value == null ? '' : value).trim();
  if (String(language).toUpperCase() !== 'ES' || !text) return text;
  for (const [pattern, replacement] of ES_REPLACEMENTS) text = text.replace(pattern, replacement);
  return text;
}

function guardFactsForLanguage(facts, language = 'EN') {
  if (String(language).toUpperCase() !== 'ES') return facts;
  const augment = value => {
    const raw = Array.isArray(value) ? value : [value];
    return [...new Set(raw.flatMap(item => {
      const source = String(item == null ? '' : item).trim();
      const rendered = renderBuyerValue(source, 'ES');
      return [source, rendered].filter(Boolean);
    }))];
  };
  return Object.freeze({
    ...facts,
    materials: augment(facts.materials || facts.composition),
    purity: augment(facts.purity),
    finish: augment(facts.finish),
    gemstones: augment(facts.gemstones),
    components: augment(facts.components),
    sizes: augment(facts.sizes),
    dimensions: augment(facts.dimensions),
    weight: augment(facts.weight),
    colors: augment(facts.colors),
    packaging: augment(facts.packaging),
    includedItems: augment(facts.includedItems),
    recipient: augment(facts.recipient || facts.audience),
    occasion: augment(facts.occasion),
    origin: augment(facts.origin)
  });
}

module.exports = Object.freeze({ ES_REPLACEMENTS, guardFactsForLanguage, renderBuyerValue });
