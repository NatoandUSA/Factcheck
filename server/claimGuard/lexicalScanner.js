'use strict';

const { requireClaimId } = require('./taxonomyAdapter');

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function fold(value) {
  return String(value == null ? '' : value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function singular(token) {
  if (token.length > 4 && token.endsWith('es')) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
  return token;
}

const DEFINITIONS = deepFreeze({
  COMPOSITION_MATERIAL_PURITY: {
    terms: ['gold', 'golden', 'silver', 'sterling', 'platinum', 'titanium', 'brass', 'copper', 'bronze', 'stainless', 'steel', 'alloy', 'plated', 'vermeil', 'rhodium', 'oro', 'dorado', 'plata', 'plateado', 'acero', 'inoxidable', 'laton', 'cotton', 'polyester', 'fleece', 'wool', 'cashmere', 'linen', 'silk', 'rayon', 'spandex', 'nylon', 'algodon', 'poliester', 'lana', 'seda', 'leather', 'suede', 'wood', 'wooden', 'timber', 'beechwood', 'oak', 'walnut', 'bamboo', 'acrylic', 'glass', 'crystal', 'ceramic', 'porcelain', 'resin', 'silicone', 'marble', 'madera', 'cuero', 'vidrio', 'ceramica'],
    patterns: [/\b\d{1,2}\s?k\b/, /\b(?:925|999|585|750|375)\b/]
  },
  COMPONENT_GEMSTONE_INCLUDED_PART: {
    terms: ['diamond', 'diamante', 'pearl', 'perla', 'birthstone', 'zirconia', 'moissanite', 'sapphire', 'ruby', 'emerald', 'opal', 'topaz', 'amethyst', 'garnet', 'rhinestone', 'gemstone', 'zafiro', 'esmeralda', 'circonita'],
    patterns: [/\bcubic zirconia\b/]
  },
  MEASURE_DIMENSION_WEIGHT_QUANTITY_CAPACITY: {
    terms: ['inch', 'inches', 'centimeter', 'centimeters', 'millimeter', 'millimeters', 'ounce', 'ounces', 'pound', 'pounds', 'gram', 'grams', 'gsm', 'carat', 'carats', 'pulgada', 'pulgadas'],
    patterns: [/\b\d+(?:[.,]\d+)?\s?(?:inch|inches|in|cm|mm|oz|lb|g|gram|grams|gsm|ct|carat|carats|ml|l)\b/, /\bset of \d+\b/, /\bconjunto de \d+\b/, /\b\d+\s?(?:pack|pcs|pieces|piece|count|nombres?|names?)\b/]
  },
  CAPABILITY_PERSONALIZATION_PROCESS: {
    terms: ['personalized', 'personalised', 'personalizado', 'personalizada', 'customized', 'customised', 'customizable', 'custom', 'engraved', 'engraving', 'grabado', 'grabada', 'laser', 'etched', 'embossed', 'embroidered', 'embroidery', 'bordado', 'bordada', 'printed', 'sublimated', 'monogram', 'monogrammed', 'handmade', 'handcraft', 'handcrafted', 'handstitched', 'artisan']
  },
  ORIGIN_FACILITY_PRODUCTION_PARTNER: {
    terms: ['usa', 'american', 'america', 'texas', 'austin', 'european', 'europe', 'italian', 'italy', 'french', 'france', 'german', 'germany', 'japanese', 'japan', 'swiss', 'switzerland', 'workshop', 'atelier', 'factory', 'studio', 'sourced', 'imported', 'domestic'],
    patterns: [/\bmade in\s+[a-z]+(?:\s+[a-z]+)?\b/, /\bhecho en\s+[a-z]+(?:\s+[a-z]+)?\b/]
  },
  FULFILLMENT_PROCESSING_DELIVERY: {
    terms: ['overnight', 'express', 'expedited'],
    patterns: [/\bsame[- ]?day\b/, /\bnext[- ]?day\b/, /\bship(?:s|ped|ping)? in \d+\s?(?:h|hr|hrs|hours?|days?)\b/, /\b\d+\s?(?:h|hr|hrs|hours?)\s?(?:shipping|delivery|dispatch)\b/, /\b(?:fast|free) shipping\b/, /\benvio (?:rapido|gratis)\b/, /\bentrega en \d+\s?(?:horas?|dias?)\b/]
  },
  SOCIAL_PROOF_RANK_CERTIFICATION: {
    terms: ['bestseller', 'bestselling', 'certified', 'certificado', 'certificada'],
    patterns: [/\b\d\s?[- ]?star\b/, /\bfive[- ]?star\b/, /\bbest ?seller\b/, /\bamazon(?:'s)? choice\b/, /\btop[- ]?rated\b/, /\bnumber one\b/, /(?:^|[^a-z0-9])#1\b/, /\bquality inspected\b/, /\baward[- ]?winning\b/, /\bmost popular\b/, /\bguarantee(?:d)?\b/, /\b\d\s?estrellas?\b/, /\bmas vendido\b/, /\bgarantizado\b/, /\bmejor calidad\b/]
  },
  PACKAGING_ACCESSORY_INCLUDED_EXTRA: {
    terms: ['box', 'giftbox', 'boxed', 'velvet', 'pouch', 'ribbon', 'satin', 'caja', 'estuche', 'bolsa', 'card', 'tarjeta', 'certificate', 'usb', 'charger', 'cable', 'battery', 'batteries'],
    patterns: [/\bgift box\b/, /\bcaja de regalo\b/, /\bcertificado incluido\b/, /\b(?:includes?|comes with)\s+(?:a|an|one|two|three|\d+)\s+(?:box|pouch|card|charger|cable|battery)\b/]
  },
  SAFETY_MEDICAL_HEALTH_AGE_COMPLIANCE: {
    terms: ['hypoallergenic', 'antialergico', 'antialergica', 'nontoxic', 'non-toxic'],
    patterns: [/\bnickel[- ]?free\b/, /\blead[- ]?free\b/, /\bfood[- ]?safe\b/, /\bchild[- ]?safe\b/, /\blibre de (?:niquel|plomo)\b/, /\b(?:fda|ce|cpsia) compliant\b/]
  },
  PERFORMANCE_DURABILITY_WATERPROOF_COMPATIBILITY: {
    terms: ['waterproof', 'adjustable', 'ajustable', 'reversible', 'rechargeable', 'compatible', 'compatibility'],
    patterns: [/\bwater[- ]?proof\b/, /\bfade[- ]?proof\b/, /\btarnish[- ]?(?:free|resistant)\b/, /\bmachine[- ]?washable\b/, /\bdishwasher[- ]?safe\b/, /\bscratch[- ]?resistant\b/, /\bshatter[- ]?proof\b/, /\bcompatible (?:with|con)\s+[a-z0-9-]+\b/]
  },
  ENVIRONMENT_ETHICAL_SUSTAINABILITY: {
    terms: ['organic', 'vegan', 'recycled', 'biodegradable', 'sustainable', 'organico', 'organica', 'vegano', 'vegana', 'reciclado', 'reciclada', 'biodegradable', 'sostenible'],
    patterns: [/\bethically sourced\b/, /\bcomercio justo\b/, /\bcarbon[- ]?neutral\b/]
  },
  DIGITAL_FORMAT_LICENSE_USAGE_RIGHT: {
    patterns: [/\bdigital download\b/, /\bdescarga digital\b/, /\b(?:pdf|svg|png|jpe?g|dxf) files?\b/, /\barchivos? (?:pdf|svg|png|jpe?g|dxf)\b/, /\bcommercial use\b/, /\bpersonal use only\b/, /\buso (?:comercial|personal)\b/]
  },
  PRICE_DISCOUNT_SCARCITY_COMMERCIAL_PROMISE: {
    terms: ['sale', 'discount', 'descuento', 'limited'],
    patterns: [/\b\d+% off\b/, /\bonly \d+ left\b/, /\bsolo quedan \d+\b/, /\blimited[- ]?time\b/, /\bbuy \d+ get \d+\b/]
  },
  COMPARATIVE_SUPERLATIVE_EXCLUSIVITY: {
    terms: ['best', 'better', 'superior', 'exclusive', 'exclusivo', 'exclusiva', 'unique', 'unico', 'unica'],
    patterns: [/\bnumber one\b/, /(?:^|[^a-z0-9])#1\b/, /\bmost (?:popular|durable|comfortable)\b/, /\bmejor (?:calidad|precio)\b/, /\bone of a kind\b/]
  }
});

const TERM_INDEX = (() => {
  const index = new Map();
  for (const [claimId, definition] of Object.entries(DEFINITIONS)) {
    requireClaimId(claimId);
    for (const rawTerm of definition.terms || []) {
      const term = fold(rawTerm);
      for (const key of new Set([term, singular(term)])) {
        const values = index.get(key) || [];
        if (!values.includes(claimId)) values.push(claimId);
        index.set(key, values);
      }
    }
  }
  return index;
})();

function tokensOf(value) {
  return fold(value).split(/[^a-z0-9]+/).filter(Boolean);
}

function allMatches(pattern, value) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  return [...value.matchAll(new RegExp(pattern.source, flags))];
}

function scanClaims(text) {
  const value = fold(text);
  const found = new Map();
  for (const token of tokensOf(value)) {
    for (const claimId of TERM_INDEX.get(token) || TERM_INDEX.get(singular(token)) || []) {
      const key = `${claimId}\u0000TERM\u0000${token}`;
      if (!found.has(key)) found.set(key, Object.freeze({ claimId, token, kind: 'TERM' }));
    }
  }
  for (const [claimId, definition] of Object.entries(DEFINITIONS)) {
    for (const pattern of definition.patterns || []) {
      for (const match of allMatches(pattern, value)) {
        const token = match[0].trim();
        const key = `${claimId}\u0000PATTERN\u0000${token}`;
        if (!found.has(key)) found.set(key, Object.freeze({ claimId, token, kind: 'PATTERN' }));
      }
    }
  }
  return [...found.values()];
}

module.exports = Object.freeze({ DEFINITIONS, fold, singular, tokensOf, scanClaims });
