'use strict';

const ES_REPLACEMENTS = Object.freeze([
  [/\bDaughter\s*\/\s*Hija\b/giu, 'Hija'],
  [/\bNecklace\b/giu, 'Collar'],
  [/\bCustom\b/giu, 'Personalizado'],
  [/\bGraduation\b/giu, 'Graduación'],
  [/\bBirthday\b/giu, 'Cumpleaños'],
  [/\bStainless Steel\b/giu, 'Acero inoxidable'],
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
    gemstones: augment(facts.gemstones),
    components: augment(facts.components),
    packaging: augment(facts.packaging),
    includedItems: augment(facts.includedItems)
  });
}

module.exports = Object.freeze({ ES_REPLACEMENTS, guardFactsForLanguage, renderBuyerValue });
