'use strict';

const { unverifiedClaims } = require('./corroboration');

const SURFACES = Object.freeze({
  VISIBLE_COPY: 'VISIBLE_COPY',
  IMAGE_PROMPT: 'IMAGE_PROMPT',
  BACKEND_SEARCH: 'BACKEND_SEARCH',
  PPC: 'PPC'
});

const ACTIONS = Object.freeze({
  BLOCK: 'BLOCK',
  EXCLUDE_BY_DEFAULT: 'EXCLUDE_BY_DEFAULT',
  ALLOW_WITH_FLAG: 'ALLOW_WITH_FLAG'
});

function actionForSurface(surface) {
  if (surface === SURFACES.VISIBLE_COPY || surface === SURFACES.IMAGE_PROMPT) return ACTIONS.BLOCK;
  if (surface === SURFACES.BACKEND_SEARCH) return ACTIONS.EXCLUDE_BY_DEFAULT;
  if (surface === SURFACES.PPC) return ACTIONS.ALLOW_WITH_FLAG;
  const error = new Error(`Unknown claim surface: ${String(surface)}`);
  error.code = 'UNKNOWN_CLAIM_SURFACE';
  throw error;
}

function evaluateText(text, truth, surface) {
  const claims = unverifiedClaims(text, truth);
  const action = actionForSurface(surface);
  return Object.freeze({
    surface,
    action,
    allowed: claims.length === 0 || action === ACTIONS.ALLOW_WITH_FLAG,
    excluded: claims.length > 0 && action === ACTIONS.EXCLUDE_BY_DEFAULT,
    unverifiedClaims: Object.freeze(claims)
  });
}

module.exports = Object.freeze({ SURFACES, ACTIONS, actionForSurface, evaluateText });
