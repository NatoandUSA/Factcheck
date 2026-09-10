'use strict';

const { approvalHash } = require('./security/approval');

const FACT_KEYS = Object.freeze(new Set([
  'productName', 'productType', 'category', 'colors', 'finish', 'design', 'style', 'theme', 'pattern',
  'materials', 'composition', 'purity',
  'components', 'gemstones', 'includedItems', 'sizes', 'dimensions', 'weight',
  'quantity', 'capacity', 'capabilities', 'personalization', 'process', 'origin',
  'shipFrom', 'facility', 'productionPartner', 'fulfillment', 'processingTime',
  'delivery', 'packaging', 'accessories', 'safety', 'medical', 'health',
  'ageCompliance', 'compliance', 'performance', 'durability', 'compatibility',
  'care', 'environment', 'ethical', 'sustainability', 'digital', 'digitalDetails',
  'fileFormat', 'license', 'usageRights', 'audience', 'recipient', 'occasion',
  'playerCount', 'minimumAge', 'duration', 'language'
]));
const BASES = Object.freeze(new Set([
  'SUPPLIER_SPEC', 'OWN_LISTING_RECORD', 'REFERENCE_LISTING_SAME_SOURCE', 'PHYSICAL_INSPECTION',
  'PRODUCTION_WORKFLOW', 'RIGHTS_RECORD', 'OTHER'
]));

function fail(code, details = {}) {
  throw Object.assign(new Error(code), { code, ...details });
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, allowed, path) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail('PRODUCT_TRUTH_CLIENT_AUTHORITY_FORBIDDEN', { path: `${path}.${key}` });
}

function boundedText(value, path, required = true) {
  if (value == null && !required) return null;
  if (typeof value !== 'string') fail('INVALID_PRODUCT_TRUTH_TEXT', { path });
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > 4000) fail('INVALID_PRODUCT_TRUTH_TEXT', { path });
  return normalized || null;
}

function boundedValue(value, path = 'value', depth = 0) {
  if (depth > 8) fail('PRODUCT_TRUTH_TOO_DEEP', { path });
  if (typeof value === 'string') return boundedText(value, path);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('INVALID_PRODUCT_TRUTH_NUMBER', { path });
    return value;
  }
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    if (!value.length || value.length > 100) fail('INVALID_PRODUCT_TRUTH_ARRAY', { path });
    return value.map((item, index) => boundedValue(item, `${path}[${index}]`, depth + 1));
  }
  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (!entries.length || entries.length > 100) fail('INVALID_PRODUCT_TRUTH_OBJECT', { path });
    return Object.fromEntries(entries.map(([key, child]) => {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key)) fail('INVALID_PRODUCT_TRUTH_SUBFIELD', { path: `${path}.${key}` });
      return [key, boundedValue(child, `${path}.${key}`, depth + 1)];
    }));
  }
  fail('INVALID_PRODUCT_TRUTH_VALUE', { path });
}

function normalizeSnapshot(input) {
  if (!isRecord(input) || !Object.keys(input).length) fail('PRODUCT_TRUTH_FACTS_REQUIRED');
  if (Object.keys(input).length > FACT_KEYS.size) fail('PRODUCT_TRUTH_TOO_MANY_FACTS');
  const asserted = {};
  const unknown = {};
  for (const [fact, entry] of Object.entries(input)) {
    if (!FACT_KEYS.has(fact)) fail('UNKNOWN_PRODUCT_TRUTH_FACT', { fact });
    if (!isRecord(entry)) fail('INVALID_PRODUCT_TRUTH_ENTRY', { fact });
    if (entry.disposition === 'ASSERTED') {
      exactKeys(entry, ['disposition', 'value', 'basis', 'basisNote'], `facts.${fact}`);
      if (!BASES.has(entry.basis)) fail('INVALID_PRODUCT_TRUTH_BASIS', { fact });
      asserted[fact] = Object.freeze({
        value: boundedValue(entry.value, `facts.${fact}.value`),
        basis: entry.basis,
        basisNote: boundedText(entry.basisNote, `facts.${fact}.basisNote`, false)
      });
    } else if (entry.disposition === 'UNKNOWN') {
      exactKeys(entry, ['disposition', 'reason'], `facts.${fact}`);
      unknown[fact] = Object.freeze({ reason: boundedText(entry.reason, `facts.${fact}.reason`) });
    } else {
      fail('INVALID_PRODUCT_TRUTH_DISPOSITION', { fact });
    }
  }
  return Object.freeze({ asserted: Object.freeze(asserted), unknown: Object.freeze(unknown) });
}

function buildStaffAttestedCard({ productId, listingVersion, snapshot, actorId, auditEventId, ipEvidence }) {
  const attestation = Object.freeze({ kind: 'STAFF_ATTESTATION_V1', id: String(auditEventId), actorId });
  const evidence = Object.freeze({
    state: 'VERIFIED',
    subjectId: String(productId),
    listingVersion,
    source: Object.freeze({ kind: attestation.kind, id: attestation.id }),
    actorId
  });
  return Object.freeze({
    productId: String(productId),
    listingVersion,
    state: 'STAFF_ATTESTED',
    attestation,
    facts: Object.freeze(Object.fromEntries(Object.entries(snapshot.asserted).map(([fact, assertion]) => [
      fact,
      Object.freeze({ value: assertion.value, basis: assertion.basis, basisNote: assertion.basisNote, evidence })
    ]))),
    unknownFacts: snapshot.unknown,
    ipEvidence: Object.freeze(ipEvidence)
  });
}

function productTruthAuthorityHash(card) {
  return approvalHash({
    productId: card?.productId,
    listingVersion: card?.listingVersion,
    state: card?.state,
    attestation: card?.attestation,
    facts: card?.facts,
    unknownFacts: card?.unknownFacts
  });
}

// Product fact authority and IP clearance have different lifecycles. A blocked
// IP screen must not erase a valid staff attestation, otherwise staff cannot
// edit the listing to remove the protected term. Approval/export still require
// a freshly cleared IP screen through validateProductTruthCard/publishGate.
function validateStaffAttestedCard(card, context) {
  const errors = [];
  if (!isRecord(card)) return { valid: false, errors: ['PRODUCT_TRUTH_CARD_REQUIRED'] };
  const productId = String(context?.productId ?? '').trim();
  const listingVersion = context?.listingVersion;
  if (!productId || !Number.isInteger(listingVersion) || listingVersion < 1) errors.push('INVALID_LISTING_CONTEXT');
  if (String(card.productId ?? '').trim() !== productId || card.listingVersion !== listingVersion) errors.push('STALE_OR_MISMATCHED_CARD_BINDING');
  if (card.state !== 'STAFF_ATTESTED') errors.push('INVALID_PRODUCT_TRUTH_STATE');
  if (card?.attestation?.kind !== 'STAFF_ATTESTATION_V1' || !/^\d+$/.test(String(card?.attestation?.id || ''))) errors.push('INVALID_STAFF_ATTESTATION');
  if (!isRecord(card.facts) || !isRecord(card.unknownFacts)) errors.push('INVALID_PRODUCT_TRUTH_FACTS');
  for (const [fact, entry] of Object.entries(isRecord(card.facts) ? card.facts : {})) {
    const evidence = entry?.evidence;
    if (!FACT_KEYS.has(fact)
      || evidence?.state !== 'VERIFIED'
      || String(evidence?.subjectId ?? '').trim() !== productId
      || evidence?.listingVersion !== listingVersion
      || evidence?.source?.kind !== 'STAFF_ATTESTATION_V1'
      || String(evidence?.source?.id ?? '') !== String(card?.attestation?.id ?? '')
      || evidence?.actorId !== card?.attestation?.actorId) {
      errors.push(`INVALID_FACT_BINDING:${fact}`);
    }
  }
  for (const fact of Object.keys(isRecord(card.unknownFacts) ? card.unknownFacts : {})) {
    if (!FACT_KEYS.has(fact)) errors.push(`INVALID_UNKNOWN_FACT:${fact}`);
  }
  return { valid: errors.length === 0, errors };
}

module.exports = Object.freeze({
  BASES,
  FACT_KEYS,
  buildStaffAttestedCard,
  normalizeSnapshot,
  productTruthAuthorityHash,
  validateStaffAttestedCard
});
