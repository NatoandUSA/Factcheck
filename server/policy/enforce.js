'use strict';

const { PolicyContractError } = require('./contractRegistry');

function bindingOf(resolution) {
  if (!resolution?.contract || !resolution.policyContractId || !resolution.policyContractArtifactHash) {
    throw new PolicyContractError('RESOLVED_POLICY_CONTRACT_REQUIRED');
  }
  return Object.freeze({
    policyContractId: resolution.policyContractId,
    policyContractArtifactHash: resolution.policyContractArtifactHash
  });
}

function countCharacters(value, counting) {
  const text = String(value ?? '');
  return counting === 'UTF16_CODE_UNITS' ? text.length : Array.from(text).length;
}

function clipCharacters(value, limit, counting) {
  const text = String(value ?? '');
  if (countCharacters(text, counting) <= limit) return text;
  return counting === 'UTF16_CODE_UNITS' ? text.slice(0, limit) : Array.from(text).slice(0, limit).join('');
}

function ruleForSurface(contract, surface) {
  if (surface === 'title') return contract.rules.title;
  if (surface === 'itemHighlights') return contract.rules.itemHighlights;
  throw new PolicyContractError('UNSUPPORTED_POLICY_TEXT_SURFACE', { surface });
}

function composeTextSurface(candidate, surface, resolution) {
  const binding = bindingOf(resolution);
  const rule = ruleForSurface(resolution.contract, surface);
  if (!rule) throw new PolicyContractError('POLICY_RULE_NOT_AVAILABLE', { surface });
  const text = clipCharacters(candidate, rule.maxChars, rule.counting);
  return Object.freeze({
    surface,
    text,
    chars: countCharacters(text, rule.counting),
    maxChars: rule.maxChars,
    counting: rule.counting,
    policyBinding: binding
  });
}

function validatePolicySurfaces(surfaces = {}, resolution) {
  const binding = bindingOf(resolution);
  const contract = resolution.contract;
  const policyViolations = [];
  const qualityGaps = [];

  const validateText = surface => {
    const rule = contract.rules[surface];
    if (!rule || surfaces[surface] == null) return;
    const actual = countCharacters(surfaces[surface], rule.counting);
    if (actual > rule.maxChars) {
      policyViolations.push({ code: 'POLICY_TEXT_LIMIT_EXCEEDED', surface, actual, max: rule.maxChars });
    }
  };
  validateText('title');
  validateText('itemHighlights');

  if (contract.marketplace === 'AMAZON') {
    if (surfaces.genericKeywords != null) {
      const value = String(surfaces.genericKeywords);
      const actual = Buffer.byteLength(value, 'utf8');
      const rule = contract.rules.genericKeywords;
      if (actual > rule.maxUtf8Bytes) {
        policyViolations.push({ code: 'POLICY_UTF8_BYTE_LIMIT_EXCEEDED', surface: 'genericKeywords', actual, max: rule.maxUtf8Bytes });
      }
      if (!rule.allowCommas && value.includes(',')) {
        policyViolations.push({ code: 'POLICY_COMMA_FORBIDDEN', surface: 'genericKeywords' });
      }
    }
    if (Array.isArray(surfaces.bullets) && surfaces.bullets.filter(Boolean).length < contract.rules.bullets.targetCount) {
      qualityGaps.push({ code: 'AMAZON_BULLET_TARGET_SHORTAGE', actual: surfaces.bullets.filter(Boolean).length, target: contract.rules.bullets.targetCount });
    }
  }

  if (contract.marketplace === 'ETSY' && Array.isArray(surfaces.tags)) {
    const tags = surfaces.tags.map(tag => String(tag).trim()).filter(Boolean);
    const rule = contract.rules.tags;
    if (tags.length > rule.maxCount) {
      policyViolations.push({ code: 'ETSY_TAG_MAX_EXCEEDED', actual: tags.length, max: rule.maxCount });
    }
    tags.forEach((tag, index) => {
      const actual = Array.from(tag).length;
      if (actual > rule.maxChars) {
        policyViolations.push({ code: 'ETSY_TAG_CHAR_LIMIT_EXCEEDED', index, actual, max: rule.maxChars });
      }
    });
    if (tags.length < rule.targetCount) {
      qualityGaps.push({ code: 'ETSY_SAFE_TAG_TARGET_SHORTAGE', actual: tags.length, target: rule.targetCount });
    }
  }

  const approvalBlockers = [];
  if (contract.approvalEligibility !== 'APPROVAL_ELIGIBLE') {
    approvalBlockers.push({ code: 'POLICY_CONTRACT_DRAFT_ONLY' });
  }
  approvalBlockers.push(...policyViolations);
  return Object.freeze({
    policyBinding: binding,
    policyViolations: Object.freeze(policyViolations),
    qualityGaps: Object.freeze(qualityGaps),
    approvalBlockers: Object.freeze(approvalBlockers),
    canApprove: approvalBlockers.length === 0,
    canExport: approvalBlockers.length === 0
  });
}

module.exports = { bindingOf, clipCharacters, composeTextSurface, countCharacters, validatePolicySurfaces };
