import { getVerifiedPersonalization, isIpCleared, projectVerifiedFacts, validateProductTruthCard } from '../../shared/productTruth.js';

const AUTHORIZED_PROJECTIONS = new WeakSet();
const SAFE_NON_FACTUAL_TOKENS = new Set([
  'a', 'an', 'and', 'as', 'at', 'be', 'by', 'choice', 'description', 'details',
  'everyday', 'for', 'from', 'gift', 'gifting', 'in', 'is', 'it', 'item', 'love',
  'meaningful', 'of', 'or', 'p', 'product', 'someone', 'special', 'strong', 'the',
  'this', 'to', 'use', 'with', 'your'
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

export function verifiedSubject(projection) {
  if (!projection?.eligible) return null;
  const candidate = projection.facts.productName ?? projection.facts.productType;
  if (typeof candidate !== 'string' || !candidate.trim()) return 'product';
  return candidate.trim().replace(/[\r\n\t]+/g, ' ').slice(0, 160);
}

export function validateModelClaims(output, projection) {
  if (!isAuthorizedAiProjection(projection)) return { valid: false, errors: ['UNQUALIFIED_PRODUCT_TRUTH'], claims: [] };
  const tokenize = value => new Set(flattenStrings(value).join(' ').toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
  const outputTokens = tokenize(output);
  const authorityTokens = tokenize(projection.facts);
  const claims = [...outputTokens]
    .filter(token => !authorityTokens.has(token) && !SAFE_NON_FACTUAL_TOKENS.has(token))
    .map(value => ({ kind: 'UNAUTHORIZED_TOKEN', value }));
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

export const AI_SAFE_NON_FACTUAL_TOKENS = Object.freeze([...SAFE_NON_FACTUAL_TOKENS]);
