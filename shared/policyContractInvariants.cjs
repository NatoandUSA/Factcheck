'use strict';

function validatePolicyContractInvariants(contract) {
  const violations = [];
  const tags = contract?.rules?.tags;
  if (tags && Number.isInteger(tags.targetCount) && Number.isInteger(tags.maxCount) && tags.targetCount > tags.maxCount) {
    violations.push({
      code: 'POLICY_TAG_TARGET_EXCEEDS_MAX',
      path: '/rules/tags/targetCount',
      targetCount: tags.targetCount,
      maxCount: tags.maxCount
    });
  }
  for (const [index, sourceRef] of (contract?.sourceRefs || []).entries()) {
    if (Date.parse(sourceRef.capturedAt) > Date.parse(contract.checkedAt)) {
      violations.push({
        code: 'POLICY_SOURCE_CAPTURED_AFTER_CHECK',
        path: `/sourceRefs/${index}/capturedAt`,
        capturedAt: sourceRef.capturedAt,
        checkedAt: contract.checkedAt
      });
    }
  }
  return { valid: violations.length === 0, violations };
}

function assertPolicyContractInvariants(contract) {
  const result = validatePolicyContractInvariants(contract);
  if (!result.valid) {
    const error = new Error(result.violations.map(item => item.code).join(','));
    error.code = 'POLICY_CONTRACT_INVARIANT_VIOLATION';
    error.violations = result.violations;
    throw error;
  }
  return contract;
}

module.exports = { assertPolicyContractInvariants, validatePolicyContractInvariants };
