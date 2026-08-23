'use strict';

const EVIDENCE_STATES = Object.freeze({ VERIFIED: 'VERIFIED', UNKNOWN: 'UNKNOWN', UNVERIFIED: 'UNVERIFIED' });
const IP_STATES = Object.freeze({ CLEARED: 'CLEARED', BLOCKED: 'BLOCKED', REVIEW_REQUIRED: 'REVIEW_REQUIRED', UNKNOWN: 'UNKNOWN' });

function normalizeId(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function isListingContext(context) {
  return Boolean(normalizeId(context?.productId)) && Number.isInteger(context?.listingVersion) && context.listingVersion >= 1;
}

function isEvidenceBoundToListing(evidence, context) {
  return isListingContext(context) &&
    evidence?.state === EVIDENCE_STATES.VERIFIED &&
    normalizeId(evidence.subjectId) === normalizeId(context.productId) &&
    evidence.listingVersion === context.listingVersion &&
    typeof evidence.source?.kind === 'string' && evidence.source.kind.trim().length > 0 &&
    normalizeId(evidence.source?.id) !== null;
}

function isVerifiedFact(fact, context) {
  return Boolean(fact) && fact.value !== null && fact.value !== undefined && isEvidenceBoundToListing(fact.evidence, context);
}

function getVerifiedPersonalization(card, context = card) {
  const fact = card?.facts?.personalization;
  if (!isVerifiedFact(fact, context) || fact.value?.supported !== true) return null;
  const instructions = typeof fact.value.instructions === 'string' ? fact.value.instructions.trim() : '';
  if (!instructions) return null;
  return Object.freeze({ supported: true, instructions });
}

function isVerifiedPersonalization(card, context = card) {
  return getVerifiedPersonalization(card, context) !== null;
}

function isIpCleared(card, context = card) {
  const evidence = card?.ipEvidence;
  return isListingContext(context) && evidence?.state === IP_STATES.CLEARED &&
    normalizeId(evidence.subjectId) === normalizeId(context.productId) &&
    evidence.listingVersion === context.listingVersion &&
    typeof evidence.checkerVersion === 'string' && evidence.checkerVersion.trim().length > 0 &&
    typeof evidence.checkedAt === 'string' && Number.isFinite(Date.parse(evidence.checkedAt));
}

function validateProductTruthCard(card, context = card) {
  const errors = [];
  if (!card || typeof card !== 'object' || Array.isArray(card)) return { valid: false, errors: ['PRODUCT_TRUTH_CARD_REQUIRED'] };
  if (!isListingContext(card)) errors.push('INVALID_CARD_BINDING');
  if (context && (!isListingContext(context) || normalizeId(card.productId) !== normalizeId(context.productId) || card.listingVersion !== context.listingVersion)) {
    errors.push('STALE_OR_MISMATCHED_CARD_BINDING');
  }
  if (!card.facts || typeof card.facts !== 'object' || Array.isArray(card.facts)) errors.push('FACTS_OBJECT_REQUIRED');
  const verifiedFacts = card.facts && typeof card.facts === 'object'
    ? Object.entries(card.facts).filter(([, fact]) => isVerifiedFact(fact, context || card)).map(([name]) => name)
    : [];
  if (verifiedFacts.length === 0) errors.push('AT_LEAST_ONE_VERIFIED_FACT_REQUIRED');
  if (!isIpCleared(card, context || card)) errors.push('IP_CLEARANCE_REQUIRED');
  return { valid: errors.length === 0, errors, verifiedFacts };
}

function projectVerifiedFacts(card, context = card) {
  if (!card?.facts || typeof card.facts !== 'object') return Object.freeze({});
  const projection = {};
  for (const [name, fact] of Object.entries(card.facts)) {
    if (isVerifiedFact(fact, context)) projection[name] = fact.value;
  }
  return Object.freeze(projection);
}

function invalidateProductTruthCard(card) {
  if (!card || typeof card !== 'object') return null;
  return Object.freeze({
    ...card,
    state: EVIDENCE_STATES.UNVERIFIED,
    invalidatedAt: new Date().toISOString(),
    invalidationReason: 'LISTING_VERSION_CHANGED'
  });
}

module.exports = {
  EVIDENCE_STATES,
  IP_STATES,
  getVerifiedPersonalization,
  invalidateProductTruthCard,
  isEvidenceBoundToListing,
  isIpCleared,
  isVerifiedFact,
  isVerifiedPersonalization,
  projectVerifiedFacts,
  validateProductTruthCard
};
