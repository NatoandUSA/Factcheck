function toObservedNumber(value) {
  // Trim before the emptiness check: Number('   ') coerces to 0 in
  // JavaScript, so a whitespace-only source cell would otherwise become an
  // observed zero instead of the missing value it actually is.
  const normalized = typeof value === 'string' ? value.trim() : value;
  if (normalized === undefined || normalized === null || normalized === '') return null;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function monthlySearchVolumeFromViews24h(value) {
  const observed = toObservedNumber(value);
  return observed === null ? null : observed * 30;
}

function insufficientScore(reason) {
  return {
    opportunityScore: null,
    scoringState: 'INSUFFICIENT_EVIDENCE',
    scoreSource: null,
    reason
  };
}

/**
 * Generic uploaded-keyword score used by server.js.
 *
 * Truth rule:
 * - An observed IQ score is already a source-provided score, including an
 *   explicit zero, so it may be preserved directly.
 * - Otherwise the local formula may run only when every input used by that
 *   formula is observed. Missing competition/title-density must never be
 *   replaced with a plausible zero/constant and then labeled SCORED.
 */
function scoreKeywordEvidence({ searchVolume, competingProducts, titleDensity, rawIq }) {
  const iq = toObservedNumber(rawIq);
  if (iq !== null) {
    if (iq < 0) return insufficientScore('INVALID_IQ_SCORE');
    return {
      opportunityScore: iq,
      scoringState: 'SCORED',
      scoreSource: 'OBSERVED_IQ',
      reason: null
    };
  }

  const volume = toObservedNumber(searchVolume);
  const competition = toObservedNumber(competingProducts);
  const density = toObservedNumber(titleDensity);

  if (volume === null || competition === null || density === null) {
    return insufficientScore('MISSING_FORMULA_INPUT');
  }
  if (volume < 0 || competition < 0 || density < 0) {
    return insufficientScore('INVALID_FORMULA_INPUT');
  }

  const compFactor = Math.sqrt(competition + 10);
  const tdFactor = density + 1;
  const opportunityScore = Math.round((volume / (compFactor * tdFactor)) * 100);

  return {
    opportunityScore,
    scoringState: 'SCORED',
    scoreSource: 'DERIVED_FROM_OBSERVED_INPUTS',
    reason: null
  };
}

module.exports = {
  toObservedNumber,
  monthlySearchVolumeFromViews24h,
  scoreKeywordEvidence
};
