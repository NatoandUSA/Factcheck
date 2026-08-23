'use strict';

const { getVerifiedPersonalization, isIpCleared, projectVerifiedFacts, validateProductTruthCard } = require('./productTruth.cjs');

const AUTHORIZED_PROJECTIONS = new WeakSet();
const CREATIVE_PROFILES = Object.freeze({
  WARM: Object.freeze({ title: 'A Thoughtful Everyday Gift', hook: 'THOUGHTFUL GIFT', tone: 'A meaningful choice for someone special.' }),
  MINIMAL: Object.freeze({ title: 'Simple Everyday Gift Style', hook: 'SIMPLE STYLE', tone: 'A simple choice for everyday gifting.' }),
  CELEBRATORY: Object.freeze({ title: 'A Gift for Special Moments', hook: 'SPECIAL MOMENTS', tone: 'A cheerful choice for a special occasion.' })
});
const COMMERCE_FIELDS = Object.freeze([
  'amazonTitle', 'amazonBullets', 'amazonSearchTerms', 'amazonDescription',
  'amazonAPlusContent', 'amazonAPlusPoints', 'etsyTitle', 'etsyTags',
  'etsyMaterials', 'etsyPersonalizationInstructions', 'etsyDescription'
]);
const SERVER_METADATA_FIELDS = new Set([
  'creativeProfile', ...COMMERCE_FIELDS, 'parentSku', 'itemHighlights',
  'variations', 'categoryName', 'evidenceState', 'provenance',
  'sourceProductId', 'sourceListingVersion', 'generatedAt', 'status', 'dbId'
]);

function listingContext(listing) {
  return { productId: listing?.productId ?? listing?.dbId ?? listing?.id, listingVersion: listing?.listingVersion ?? listing?.listing_version };
}

function projectVerifiedAiInput(listingOrEnvelope) {
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

function isAuthorizedAiProjection(projection) {
  return Boolean(projection?.eligible) && AUTHORIZED_PROJECTIONS.has(projection);
}

function buildVerifiedAiRequest(projection, options = {}) {
  if (!isAuthorizedAiProjection(projection)) return null;
  const productType = typeof projection.facts.productType === 'string' && projection.facts.productType.trim() ? projection.facts.productType.trim() : 'Verified Product';
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

function verifiedSubject(projection) {
  if (!projection?.eligible) return null;
  const candidate = projection.facts.productName ?? projection.facts.productType;
  if (typeof candidate !== 'string' || !candidate.trim()) return 'Product';
  return candidate.trim().replace(/[\r\n\t]+/g, ' ').slice(0, 120);
}

function normalizeCreativePlan(modelOutput) {
  if (!modelOutput || typeof modelOutput !== 'object' || Array.isArray(modelOutput)) return null;
  const keys = Object.keys(modelOutput);
  if (keys.length !== 1 || keys[0] !== 'creativeProfile') return null;
  const creativeProfile = String(modelOutput.creativeProfile || '').toUpperCase();
  return CREATIVE_PROFILES[creativeProfile] ? { creativeProfile } : null;
}

function safeTag(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

// The model selects one enum only. All commerce prose is rendered from
// server-owned templates, and every factual slot comes from verified facts.
function renderVerifiedCommerceListing(projection, modelOutput) {
  if (!isAuthorizedAiProjection(projection)) return null;
  const plan = normalizeCreativePlan(modelOutput);
  if (!plan) return null;
  const profile = CREATIVE_PROFILES[plan.creativeProfile];
  const subject = verifiedSubject(projection);
  const materials = Array.isArray(projection.facts.materials) ? projection.facts.materials.map(value => String(value).trim()).filter(Boolean) : [];
  const personalization = projection.facts.personalization?.instructions || '';
  const materialSentence = materials.length ? ` Verified materials: ${materials.join(', ')}.` : '';
  const personalizationSentence = personalization ? ` Personalization: ${personalization}` : '';
  const htmlSubject = escapeHtml(subject);
  const htmlMaterialSentence = escapeHtml(materialSentence);
  const htmlPersonalizationSentence = escapeHtml(personalizationSentence);
  const title = `${subject} | ${profile.title}`.slice(0, 140);
  const tags = [safeTag(subject), 'thoughtful gift', 'everyday gift', 'gift idea'].filter(Boolean);
  return {
    creativeProfile: plan.creativeProfile,
    amazonTitle: title.slice(0, 80),
    amazonBullets: [
      `[${profile.hook}] ${profile.tone}`,
      `[PRODUCT] ${subject}.`,
      `[DETAILS] Review the verified product details before ordering.${materialSentence}`,
      '[GIFTING] Suitable for thoughtful everyday gifting.',
      `[ORDERING] Confirm the selected product options before purchase.${personalizationSentence}`
    ],
    amazonSearchTerms: tags.join(' ').slice(0, 240),
    amazonDescription: `<p>${profile.tone}</p><p>Product: ${htmlSubject}.${htmlMaterialSentence}${htmlPersonalizationSentence}</p>`,
    amazonAPlusContent: { brandStoryHeadline: profile.title, brandStoryBody: profile.tone, modules: [] },
    amazonAPlusPoints: [profile.tone],
    etsyTitle: title,
    etsyTags: tags,
    etsyMaterials: materials,
    etsyPersonalizationInstructions: personalization,
    etsyDescription: `${profile.tone} Product: ${subject}.${materialSentence}${personalizationSentence}`
  };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.keys(value).sort().reduce((result, key) => { result[key] = stable(value[key]); return result; }, {});
  return value;
}

function validateModelClaims(output, projection) {
  if (!isAuthorizedAiProjection(projection)) return { valid: false, errors: ['UNQUALIFIED_PRODUCT_TRUTH'], claims: [] };
  const unexpectedFields = output && typeof output === 'object'
    ? Object.keys(output).filter(field => !SERVER_METADATA_FIELDS.has(field))
    : [];
  if (unexpectedFields.length) return {
    valid: false,
    errors: ['UNVERIFIED_OUTPUT_CLAIM'],
    claims: unexpectedFields.map(value => ({ kind: 'UNAUTHORIZED_OUTPUT_FIELD', value }))
  };
  const expected = renderVerifiedCommerceListing(projection, { creativeProfile: output?.creativeProfile });
  if (!expected) return { valid: false, errors: ['INVALID_COMMERCE_OUTPUT_CONTRACT'], claims: [{ kind: 'STRUCTURE', value: 'creativeProfile' }] };
  const actualCommerce = {};
  const expectedCommerce = {};
  for (const field of ['creativeProfile', ...COMMERCE_FIELDS]) {
    actualCommerce[field] = output?.[field];
    expectedCommerce[field] = expected[field];
  }
  const valid = JSON.stringify(stable(actualCommerce)) === JSON.stringify(stable(expectedCommerce));
  return valid ? { valid: true, errors: [], claims: [] } : {
    valid: false,
    errors: ['UNVERIFIED_OUTPUT_CLAIM'],
    claims: [{ kind: 'NON_CANONICAL_COMMERCE_OUTPUT', value: 'MODEL_AUTHORED_PROSE' }]
  };
}

function assertModelClaimsAuthorized(output, projection) {
  const result = validateModelClaims(output, projection);
  if (!result.valid) {
    const error = new Error(result.errors[0]);
    error.code = result.errors[0];
    error.claims = result.claims;
    throw error;
  }
  return output;
}

module.exports = {
  AI_FACTUAL_CLAIM_RULES: Object.freeze([]),
  CREATIVE_PROFILES,
  assertModelClaimsAuthorized,
  buildVerifiedAiRequest,
  isAuthorizedAiProjection,
  projectVerifiedAiInput,
  renderVerifiedCommerceListing,
  validateModelClaims,
  verifiedSubject
};
