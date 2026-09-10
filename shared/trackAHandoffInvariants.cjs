'use strict';

function validateTrackAHandoffInvariants(manifest) {
  const violations = [];
  const accounting = manifest?.keywordAccounting;
  if (!accounting || accounting.inputObservations !== accounting.accountedObservations) {
    violations.push({
      code: 'TRACK_A_KEYWORD_ACCOUNTING_MISMATCH',
      inputObservations: accounting?.inputObservations ?? null,
      accountedObservations: accounting?.accountedObservations ?? null
    });
  }
  return { valid: violations.length === 0, violations };
}

module.exports = { validateTrackAHandoffInvariants };
