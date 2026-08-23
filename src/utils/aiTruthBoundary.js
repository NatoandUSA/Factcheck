import { getVerifiedPersonalization, isIpCleared, projectVerifiedFacts, validateProductTruthCard } from '../../shared/productTruth.js';

const AUTHORIZED_PROJECTIONS = new WeakSet();
const FACTUAL_CLAIM_RULES = Object.freeze([
  { kind: 'MATERIAL', pattern: /\b(?:acrylic|aluminum|bamboo|beechwood|brass|cashmere|ceramic|cotton|crystal|diamond|fleece|glass|gold|leather|linen|mahogany|nylon|oak|platinum|polyester|resin|sherpa|silk|silver|steel|timber|titanium|velvet|wool|wood)\b/giu },
  { kind: 'PERFORMANCE', pattern: /\b(?:dishwasher|fade|fire|heat|scratch|shatter|stain|water)[- ]?(?:proof|resistant|safe)\b|\b(?:bpa|chemical|lead|toxin)[- ]?free\b|\b(?:durable|hypoallergenic|non[- ]?toxic|washable)\b/giu },
  { kind: 'PROCESS', pattern: /\b(?:artisan|handcrafted|handmade|handwoven|laser[- ]?(?:cut|engraved)|organic|sustainable)\b/giu },
  { kind: 'ORIGIN', pattern: /\bmade in\b|\b(?:usa|u\.s\.a\.|austin|american)\s+(?:made|workshop)\b/giu },
  { kind: 'FULFILLMENT', pattern: /\b(?:ships?|dispatch(?:es|ed)?|delivers?|arrives?)\s+(?:in|within|by)\b|\b(?:shipping|delivery|arrival)\s+(?:guarantee|guaranteed)\b/giu },
  { kind: 'WARRANTY', pattern: /\b(?:warranty|guarantee|guaranteed|lifetime)\b/giu },
  { kind: 'SOCIAL_PROOF', pattern: /\b(?:best[ -]?seller|top[ -]?seller|five[ -]?star|5\s*stars?|customer review|testimonial)\b/giu },
  { kind: 'IP_OR_LICENSE', pattern: /\b(?:licensed|official|authentic)\b/giu },
  { kind: 'PERSONALIZATION', pattern: /\b(?:customi[sz](?:e|ed|ation)|personaliz(?:e|ed|ation)|engrave(?:d|ment))\b/giu },
  { kind: 'MEASUREMENT', pattern: /\b\d+(?:\.\d+)?\s*(?:cm|mm|inches?|inch|oz|ounces?|lb|lbs|kg|gsm|k)\b/giu }
]);

function listingContext(listing) {
  return {
    productId: listing?.productId ?? listing?.dbId ?? listing?.id,
    listingVersion: listing?.listingVersion ?? listing?.listing_version
  };
}

function flattenStrings(value, output = []) {
  if (typeof value === 'string') output.push(value);
  else if (typeof value === 'number' || typeof value === 'boolean') output.push(String(value));
  else if (Array.isArray(value)) value.forEach(item => flattenStrings(item, output));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => flattenStrings(item, output));
  return output;
}

export function projectVerifiedAiInput(listingOrEnvelope) {
  const listing = listingOrEnvelope?.listing || listingOrEnvelope;
  const card = listingOrEnvelope?.productTruthCard || listing?.productTruthCard;
  const context = listingOrEnvelope?.context || listingContext(listing);
  const validation = validateProductTruthCard(card, context);
  if (!validation.valid || !isIpCleared(card, context)) {
    return Object.freeze({ eligible: false, code: 'UNQUALIFIED_PRODUCT_TRUTH', facts: Object.freeze({}), context });
  }
  const facts = { ...projectVerifiedFacts(card, context) };
  const personalization = getVerifiedPersonalization(card, context);
  if (personalization) facts.personalization = personalization;
  else delete facts.personalization;
  const projection = Object.freeze({ eligible: true, code: 'VERIFIED_PRODUCT_TRUTH', facts: Object.freeze(facts), context });
  AUTHORIZED_PROJECTIONS.add(projection);
  return projection;
}

export function isAuthorizedAiProjection(projection) {
  return Boolean(projection?.eligible) && AUTHORIZED_PROJECTIONS.has(projection);
}

export function buildVerifiedAiRequest(projection, options = {}) {
  if (!isAuthorizedAiProjection(projection)) return null;
  const productType = typeof projection.facts.productType === 'string' && projection.facts.productType.trim()
    ? projection.facts.productType.trim()
    : 'Verified Product';
  return Object.freeze({
    category: Object.freeze({ id: 'verified-product', name: productType }),
    productBrief: JSON.stringify(projection.facts),
    occasion: typeof projection.facts.occasion === 'string' ? projection.facts.occasion.trim() : '',
    tone: options.tone || null,
    materials: Array.isArray(projection.facts.materials) ? [...projection.facts.materials] : [],
    imageBase64: null,
    verifiedProjection: projection
  });
}

export function verifiedSubject(projection) {
  if (!projection?.eligible) return null;
  const candidate = projection.facts.productName ?? projection.facts.productType;
  if (typeof candidate !== 'string' || !candidate.trim()) return 'product';
  return candidate.trim().replace(/[\r\n\t]+/g, ' ').slice(0, 160);
}

export function validateModelClaims(output, projection) {
  if (!isAuthorizedAiProjection(projection)) return { valid: false, errors: ['UNQUALIFIED_PRODUCT_TRUTH'], claims: [] };
  const normalize = value => String(value).normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  let unauthorizedText = normalize(flattenStrings(output).join(' '));
  const authorizedValues = flattenStrings(projection.facts)
    .map(normalize)
    .filter(value => value.length > 0)
    .sort((a, b) => b.length - a.length);
  for (const value of authorizedValues) {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    unauthorizedText = unauthorizedText.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'giu'), ' ');
  }

  const claims = [];
  for (const rule of FACTUAL_CLAIM_RULES) {
    for (const match of unauthorizedText.matchAll(rule.pattern)) claims.push({ kind: rule.kind, value: match[0] });
  }

  const materials = Array.isArray(output?.etsyMaterials) ? output.etsyMaterials.map(normalize).filter(Boolean) : [];
  const verifiedMaterials = new Set((Array.isArray(projection.facts.materials) ? projection.facts.materials : []).map(normalize));
  for (const material of materials) {
    if (!verifiedMaterials.has(material)) claims.push({ kind: 'MATERIAL_FIELD', value: material });
  }

  const personalization = normalize(output?.etsyPersonalizationInstructions || '');
  const verifiedPersonalization = normalize(projection.facts.personalization?.instructions || '');
  if (personalization && personalization !== verifiedPersonalization) {
    claims.push({ kind: 'PERSONALIZATION_FIELD', value: personalization });
  }
  return { valid: claims.length === 0, errors: claims.length ? ['UNVERIFIED_OUTPUT_CLAIM'] : [], claims };
}

export function assertModelClaimsAuthorized(output, projection) {
  const result = validateModelClaims(output, projection);
  if (!result.valid) {
    const error = new Error(result.errors[0]);
    error.code = result.errors[0];
    error.claims = result.claims;
    throw error;
  }
  return output;
}

export const AI_FACTUAL_CLAIM_RULES = FACTUAL_CLAIM_RULES;
