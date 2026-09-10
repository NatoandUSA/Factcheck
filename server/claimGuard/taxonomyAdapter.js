'use strict';

const taxonomy = require('../../contracts/omniseller-r3/v1/claim-taxonomy.v1.json');

const CLAIM_IDS = Object.freeze([...taxonomy.claimIds]);
const CLAIM_ID_SET = new Set(CLAIM_IDS);

const LEGACY_CANDIDATES = Object.freeze(Object.fromEntries(
  Object.entries(taxonomy.legacyClassCandidateTargets)
    .map(([legacyClass, ids]) => [legacyClass, Object.freeze([...ids])])
));

function isClaimId(value) {
  return typeof value === 'string' && CLAIM_ID_SET.has(value);
}

function normalizeLegacyClass(value) {
  const match = String(value || '').toUpperCase().match(/^C([1-8])(?:_|$)/);
  return match ? `C${match[1]}` : null;
}

function adaptLegacyClaim(legacyClaim, scanClaims) {
  const legacyClass = normalizeLegacyClass(
    typeof legacyClaim === 'string' ? legacyClaim : legacyClaim && (legacyClaim.class || legacyClaim.legacyClass)
  );
  const token = typeof legacyClaim === 'string'
    ? ''
    : String(legacyClaim && (legacyClaim.token || legacyClaim.text || legacyClaim.value) || '');
  const candidates = legacyClass ? LEGACY_CANDIDATES[legacyClass] : null;

  if (!candidates || !token.trim() || typeof scanClaims !== 'function') {
    return Object.freeze({ status: 'REVIEW', claimId: null, legacyClass, token });
  }

  const matches = scanClaims(token).filter(claim => candidates.includes(claim.claimId));
  const ids = [...new Set(matches.map(claim => claim.claimId))];
  if (ids.length !== 1) {
    return Object.freeze({ status: 'REVIEW', claimId: null, legacyClass, token, candidates: Object.freeze(ids) });
  }
  return Object.freeze({ status: 'MAPPED', claimId: ids[0], legacyClass, token });
}

function requireClaimId(value) {
  if (!isClaimId(value)) {
    const error = new Error(`Unknown claim id: ${String(value)}`);
    error.code = 'UNKNOWN_CLAIM_ID';
    throw error;
  }
  return value;
}

module.exports = Object.freeze({
  schemaVersion: taxonomy.schemaVersion,
  unknownClaimBehavior: taxonomy.unknownClaimBehavior,
  identityDoesNotProveAttribute: taxonomy.identityDoesNotProveAttribute,
  CLAIM_IDS,
  LEGACY_CANDIDATES,
  isClaimId,
  requireClaimId,
  normalizeLegacyClass,
  adaptLegacyClaim
});
