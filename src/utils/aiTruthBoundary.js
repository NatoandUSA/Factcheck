import { isIpCleared, projectVerifiedFacts, validateProductTruthCard } from '../../shared/productTruth.js';

const CLAIM_RULES = Object.freeze([
  { kind: 'ORIGIN', patterns: [/\bmade in (?:the )?u\.?s\.?a\b/i, /\baustin workshop\b/i, /\busa workshop\b/i] },
  { kind: 'MATERIAL', patterns: [/\bsolid gold\b/i, /\b925 sterling silver\b/i, /\b100% cotton\b/i, /\boptical(?:-grade)? acrylic\b/i, /\bbeechwood\b/i] },
  { kind: 'FULFILLMENT', patterns: [/\bships? in 24\s*(?:hours?|h)\b/i, /\b24\s*(?:hour|h) shipping\b/i, /\barrival guarantee\b/i] },
  { kind: 'PERFORMANCE', patterns: [/\bwaterproof\b/i, /\bfade[- ]proof\b/i, /\bshatterproof\b/i, /\bdrop[- ]tested\b/i] },
  { kind: 'SOCIAL_PROOF', patterns: [/\bbest[ -]?seller\b/i, /\bfive[- ]star\b/i, /\b5\s*(?:gold\s*)?stars?\b/i, /\bquality exceeded all expectations\b/i] },
  { kind: 'PERSONALIZATION', patterns: [/\benter (?:your )?(?:custom )?(?:name|names|date|song title)\b/i, /\bwe (?:will )?personalize\b/i] }
]);

function listingContext(listing) {
  return {
    productId: listing?.productId ?? listing?.dbId ?? listing?.id,
    listingVersion: listing?.listingVersion ?? listing?.listing_version
  };
}

function flattenStrings(value, output = []) {
  if (typeof value === 'string') output.push(value);
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
  return Object.freeze({ eligible: true, code: 'VERIFIED_PRODUCT_TRUTH', facts: projectVerifiedFacts(card, context), context });
}

export function verifiedSubject(projection) {
  if (!projection?.eligible) return null;
  const candidate = projection.facts.productName ?? projection.facts.productType;
  if (typeof candidate !== 'string' || !candidate.trim()) return 'product';
  return candidate.trim().replace(/[\r\n\t]+/g, ' ').slice(0, 160);
}

export function validateModelClaims(output, projection) {
  if (!projection?.eligible) return { valid: false, errors: ['UNQUALIFIED_PRODUCT_TRUTH'], claims: [] };
  const outputText = flattenStrings(output).join(' ');
  const authorityText = flattenStrings(projection.facts).join(' ');
  const claims = [];
  for (const rule of CLAIM_RULES) {
    for (const pattern of rule.patterns) {
      const match = outputText.match(pattern);
      if (match && !pattern.test(authorityText)) claims.push({ kind: rule.kind, value: match[0] });
    }
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

export const AI_CLAIM_RULES = CLAIM_RULES;
