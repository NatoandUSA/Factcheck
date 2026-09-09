'use strict';

const { assertNoClientPolicyOverrides } = require('./policy/contractRegistry');
const {
  SURFACES,
  auditOutput,
  evaluateText
} = require('./claimGuard');
const { projectVerifiedFacts } = require('../shared/productTruth.cjs');

class ListingGuardError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = 'ListingGuardError';
    this.code = code;
    this.details = details;
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeCard(value) {
  if (isRecord(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

function verifiedTruth(productTruthCard, context) {
  const card = safeCard(productTruthCard);
  if (!card) return Object.freeze({});
  // Persisting/authority-consuming callers first resolve the server-issued
  // audit binding. IP clearance is intentionally not required to project facts:
  // a blocked listing must remain editable so staff can remove the violation.
  // projectVerifiedFacts still enforces exact product/version evidence binding.
  return projectVerifiedFacts(card, context);
}

function visibleCopyOf(listing = {}) {
  return {
    amazonTitle: listing.amazonTitle,
    etsyTitle: listing.etsyTitle,
    itemHighlights: listing.itemHighlights,
    amazonBullets: listing.amazonBullets,
    amazonDescription: listing.amazonDescription,
    amazonAPlusPoints: listing.amazonAPlusPoints,
    etsyDescription: listing.etsyDescription
  };
}

function imagePromptsOf(listing = {}) {
  const prompts = {};
  const visit = (value, path = '', depth = 0) => {
    if (depth > 12 || value == null) return;
    if (Array.isArray(value)) {
      value.forEach((child, index) => visit(child, `${path}[${index}]`, depth + 1));
      return;
    }
    if (!isRecord(value)) return;
    for (const [key, child] of Object.entries(value)) {
      const next = path ? `${path}.${key}` : key;
      if (/prompt/i.test(key) && (typeof child === 'string' || Array.isArray(child) || isRecord(child))) {
        prompts[next] = child;
      } else if (/imageprompts?|visualprompts?|creativeassets?/i.test(key)) {
        prompts[next] = child;
      } else if (depth < 4) {
        visit(child, next, depth + 1);
      }
    }
  };
  visit(listing);
  return prompts;
}

function sanitizeBackendKeywords(listing, truth) {
  const sanitized = { ...listing };
  const excluded = [];

  if (typeof sanitized.amazonSearchTerms === 'string' && sanitized.amazonSearchTerms.trim()) {
    const result = evaluateText(sanitized.amazonSearchTerms, truth, SURFACES.BACKEND_SEARCH);
    if (result.excluded) {
      excluded.push({ field: 'amazonSearchTerms', value: sanitized.amazonSearchTerms, claims: result.unverifiedClaims });
      // Generic Keywords have no reliable phrase delimiter. Keeping fragments
      // after deleting claim tokens can change meaning, so fail closed by
      // removing the whole field while retaining full exclusion accounting.
      sanitized.amazonSearchTerms = '';
    }
  }

  if (Array.isArray(sanitized.etsyTags)) {
    sanitized.etsyTags = sanitized.etsyTags.filter((tag, index) => {
      const result = evaluateText(tag, truth, SURFACES.BACKEND_SEARCH);
      if (!result.excluded) return true;
      excluded.push({ field: `etsyTags[${index}]`, value: tag, claims: result.unverifiedClaims });
      return false;
    });
  }

  return { sanitized, excluded };
}

function ppcAuditOf(listing, truth) {
  const ppc = {};
  for (const [key, value] of Object.entries(listing || {})) {
    if (/ppc|campaign|adKeywords?/i.test(key)) ppc[key] = value;
  }
  return auditOutput(ppc, truth, { surface: SURFACES.PPC });
}

function evaluateListingGuard({ listing, productTruthCard = null, context = null, clientPayload = null } = {}) {
  if (!isRecord(listing)) throw new ListingGuardError('INVALID_LISTING_PAYLOAD');
  try {
    if (clientPayload != null) assertNoClientPolicyOverrides(clientPayload);
  } catch (error) {
    throw new ListingGuardError(error.code || 'CLIENT_POLICY_OVERRIDE_FORBIDDEN', error.details || {});
  }

  const truth = verifiedTruth(productTruthCard, context);
  const visibleAudit = auditOutput(visibleCopyOf(listing), truth, { surface: SURFACES.VISIBLE_COPY });
  const imageAudit = auditOutput(imagePromptsOf(listing), truth, { surface: SURFACES.IMAGE_PROMPT });
  const backend = sanitizeBackendKeywords(listing, truth);
  const ppcAudit = ppcAuditOf(listing, truth);
  const blocking = [...visibleAudit.blocking, ...imageAudit.blocking];

  if (blocking.length) {
    throw new ListingGuardError('UNVERIFIED_OUTPUT_CLAIM', {
      blocking,
      backendExcluded: backend.excluded,
      ppcFlagged: ppcAudit.flagged
    });
  }

  return Object.freeze({
    listing: Object.freeze(backend.sanitized),
    claimSurfaceBlockingFree: true,
    backendExcluded: Object.freeze(backend.excluded),
    ppcFlagged: Object.freeze(ppcAudit.flagged)
  });
}

module.exports = Object.freeze({
  ListingGuardError,
  evaluateListingGuard,
  imagePromptsOf,
  sanitizeBackendKeywords,
  verifiedTruth,
  visibleCopyOf
});
