'use strict';

const { PolicyContractError, isServerPolicyResolution } = require('./contractRegistry');

function bindingOf(resolution) {
  if (!isServerPolicyResolution(resolution) || !resolution?.contract || !resolution.policyContractId || !resolution.policyContractArtifactHash) {
    throw new PolicyContractError('RESOLVED_POLICY_CONTRACT_REQUIRED');
  }
  return Object.freeze({
    policyContractId: resolution.policyContractId,
    policyContractArtifactHash: resolution.policyContractArtifactHash,
    purpose: resolution.purpose,
    tenantId: resolution.resolutionContext.tenantId,
    workspaceId: resolution.resolutionContext.workspaceId,
    sellerAccountId: resolution.resolutionContext.sellerAccountId,
    marketplace: resolution.resolutionContext.marketplace,
    site: resolution.resolutionContext.site,
    locale: resolution.resolutionContext.locale,
    productTypeId: resolution.resolutionContext.productTypeId,
    categoryId: resolution.resolutionContext.categoryId,
    authorityScopeHash: resolution.authorityScope?.authorityScopeHash || null
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

  const requireSurface = (surface, predicate) => {
    if (!Object.prototype.hasOwnProperty.call(surfaces, surface) || !predicate(surfaces[surface])) {
      policyViolations.push({ code: 'POLICY_SURFACE_REQUIRED', surface });
      return false;
    }
    return true;
  };
  const validateText = surface => {
    const rule = contract.rules[surface];
    if (!rule || !requireSurface(surface, value => typeof value === 'string' && value.trim().length > 0)) return;
    const actual = countCharacters(surfaces[surface], rule.counting);
    if (actual > rule.maxChars) {
      policyViolations.push({ code: 'POLICY_TEXT_LIMIT_EXCEEDED', surface, actual, max: rule.maxChars });
    }
  };
  validateText('title');
  validateText('itemHighlights');

  if (contract.marketplace === 'AMAZON') {
    if (requireSurface('genericKeywords', value => typeof value === 'string')) {
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
    if (requireSurface('bullets', value => Array.isArray(value) && value.every(item => typeof item === 'string' && item.trim().length > 0))) {
      const bullets = surfaces.bullets;
      if (bullets.length < contract.rules.bullets.targetCount) {
        qualityGaps.push({ code: 'AMAZON_BULLET_TARGET_SHORTAGE', actual: bullets.length, target: contract.rules.bullets.targetCount });
      }
      if (contract.rules.bullets.maxChars != null) {
        bullets.forEach((bullet, index) => {
          const actual = Array.from(bullet).length;
          if (actual > contract.rules.bullets.maxChars) {
            policyViolations.push({ code: 'AMAZON_BULLET_CHAR_LIMIT_EXCEEDED', index, actual, max: contract.rules.bullets.maxChars });
          }
        });
      }
    }
  }

  if (contract.marketplace === 'ETSY' && requireSurface('tags', value => Array.isArray(value)
    && value.every(tag => typeof tag === 'string' && tag.trim().length > 0))) {
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
    const normalizedTags = tags.map(tag => tag.normalize('NFKC').toLocaleLowerCase(resolution.resolutionContext.locale));
    if (new Set(normalizedTags).size !== normalizedTags.length) {
      policyViolations.push({ code: 'ETSY_DUPLICATE_TAGS_FORBIDDEN' });
    }
    if (tags.length < rule.targetCount) {
      qualityGaps.push({ code: 'ETSY_SAFE_TAG_TARGET_SHORTAGE', actual: tags.length, target: rule.targetCount });
    }
  }

  const policyApprovalBlockers = [];
  if (contract.approvalEligibility !== 'APPROVAL_ELIGIBLE') {
    policyApprovalBlockers.push({ code: 'POLICY_CONTRACT_DRAFT_ONLY' });
  }
  policyApprovalBlockers.push(...policyViolations);
  return Object.freeze({
    policyBinding: binding,
    policyViolations: Object.freeze(policyViolations),
    qualityGaps: Object.freeze(qualityGaps),
    policyApprovalBlockers: Object.freeze(policyApprovalBlockers),
    policyCompliant: policyViolations.length === 0,
    policyContractApprovalEligible: resolution.purpose === 'APPROVAL' && policyApprovalBlockers.length === 0,
    policyContractExportEligible: resolution.purpose === 'EXPORT' && policyApprovalBlockers.length === 0,
    requiresAdditionalApprovalGates: true
  });
}

module.exports = { bindingOf, clipCharacters, composeTextSurface, countCharacters, validatePolicySurfaces };
