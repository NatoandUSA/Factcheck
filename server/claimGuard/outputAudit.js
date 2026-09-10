'use strict';

const { SURFACES, ACTIONS, evaluateText } = require('./surfacePolicy');

function flattenFields(value, prefix = '', output = []) {
  if (value == null || value === '') return output;
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenFields(item, `${prefix}[${index}]`, output));
  } else if (typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => flattenFields(item, prefix ? `${prefix}.${key}` : key, output));
  } else {
    output.push({ field: prefix || 'output', text: String(value) });
  }
  return output;
}

function auditOutput(fields, truth, options = {}) {
  const defaultSurface = options.surface || SURFACES.VISIBLE_COPY;
  const surfaceByField = options.surfaceByField || {};
  const results = [];
  const violations = [];

  for (const { field, text } of flattenFields(fields)) {
    const surface = surfaceByField[field] || defaultSurface;
    const result = evaluateText(text, truth, surface);
    results.push(Object.freeze({ field, text, ...result }));
    for (const claim of result.unverifiedClaims) {
      violations.push(Object.freeze({ field, surface, action: result.action, ...claim }));
    }
  }

  const blocking = violations.filter(item => item.action === ACTIONS.BLOCK);
  const excluded = violations.filter(item => item.action === ACTIONS.EXCLUDE_BY_DEFAULT);
  const flagged = violations.filter(item => item.action === ACTIONS.ALLOW_WITH_FLAG);
  return Object.freeze({
    clean: violations.length === 0,
    claimSurfaceBlockingFree: blocking.length === 0,
    violations: Object.freeze(violations),
    blocking: Object.freeze(blocking),
    excluded: Object.freeze(excluded),
    flagged: Object.freeze(flagged),
    fields: Object.freeze(results)
  });
}

// The same second-pass audit is used after composition and after staff edits.
function auditComposedOutput(fields, truth, options) {
  return auditOutput(fields, truth, options);
}

function auditEditedOutput(fields, truth, options) {
  return auditOutput(fields, truth, options);
}

module.exports = Object.freeze({ flattenFields, auditOutput, auditComposedOutput, auditEditedOutput });
