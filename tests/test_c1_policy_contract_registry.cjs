'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  PolicyContractRegistry,
  assertNoClientPolicyOverrides,
  createServerPolicyContext
} = require('../server/policy/contractRegistry');
const { composeTextSurface, validatePolicySurfaces } = require('../server/policy/enforce');

const root = path.resolve(__dirname, '..');
const fixture = name => JSON.parse(fs.readFileSync(path.join(
  root, 'contracts', 'omniseller-r3', 'v1', 'policy-fixtures', name
), 'utf8'));
const bytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function ownerContract(base, overrides = {}) {
  const contract = structuredClone(base);
  contract.policyContractId = overrides.policyContractId || `${base.marketplace.toLowerCase()}-owner-confirmed-v1`;
  contract.verificationStatus = 'OWNER_CONFIRMED_ACCOUNT_CATEGORY';
  contract.approvalEligibility = 'APPROVAL_ELIGIBLE';
  contract.cohort.categoryIds = [overrides.categoryId || 'JEWELRY_NECKLACE'];
  contract.cohort.sellerAccountIds = [overrides.sellerAccountId || 'ACCOUNT_MAIN'];
  contract.sourceRefs.push({
    kind: 'OWNER_ATTESTATION',
    artifactHash: 'a'.repeat(64),
    capturedAt: '2026-09-09T00:00:00Z',
    actorId: 'owner-1'
  });
  if (overrides.titleMaxChars) contract.rules.title.maxChars = overrides.titleMaxChars;
  return contract;
}

function registryOf(...contracts) {
  return new PolicyContractRegistry(contracts.map((contract, index) => ({
    source: `test-policy-${index}.json`,
    bytes: bytes(contract)
  })));
}

function context(overrides = {}) {
  return createServerPolicyContext({
    tenantId: 'tenant-1',
    workspaceId: 'workspace-1',
    sellerAccountId: 'ACCOUNT_MAIN',
    marketplace: 'AMAZON',
    site: 'US',
    locale: 'en-US',
    mediaClass: 'NON_MEDIA',
    productTypeId: 'NECKLACE',
    categoryId: 'JEWELRY_NECKLACE',
    effectiveAt: '2026-09-09T01:00:00Z',
    ...overrides
  });
}

const amazonPublic = fixture('amazon-us-nonmedia-2026-07-27-v1.json');
const amazon75 = ownerContract(amazonPublic, { policyContractId: 'amazon-owner-75-v1', titleMaxChars: 75 });
const amazon200 = ownerContract(amazonPublic, { policyContractId: 'amazon-owner-200-v1', titleMaxChars: 200 });
const longTitle = Array.from({ length: 180 }, (_, index) => String.fromCharCode(97 + (index % 26))).join('');

// POLICY_CONTRACT_MUTATION_75_TO_200: contract bytes alone alter composition and validation.
const resolution75 = registryOf(amazon75).resolve(context(), { purpose: 'APPROVAL' });
const resolution200 = registryOf(amazon200).resolve(context(), { purpose: 'APPROVAL' });
const composed75 = composeTextSurface(longTitle, 'title', resolution75);
const composed200 = composeTextSurface(longTitle, 'title', resolution200);
assert.equal(composed75.chars, 75);
assert.equal(composed200.chars, 180);
assert.notEqual(composed75.policyBinding.policyContractArtifactHash, composed200.policyBinding.policyContractArtifactHash);
assert.equal(validatePolicySurfaces({ title: longTitle.slice(0, 100) }, resolution75).canApprove, false);
assert.equal(validatePolicySurfaces({ title: longTitle.slice(0, 100) }, resolution200).canApprove, true);

// Exact stored bytes, not semantic JSON, define the approval-critical artifact hash.
const amazon75Bytes = bytes(amazon75);
assert.equal(resolution75.policyContractArtifactHash, hash(amazon75Bytes));
assert.notEqual(registryOf(amazon75).artifacts[0].policyContractArtifactHash, hash(Buffer.from(JSON.stringify(amazon75), 'utf8')));

// POLICY_CLIENT_OVERRIDE_FORBIDDEN: nested client payloads cannot select policy or its scalars.
assert.throws(
  () => assertNoClientPolicyOverrides({ draft: { settings: { titleLimit: 999 } } }),
  error => error.code === 'CLIENT_POLICY_OVERRIDE_FORBIDDEN' && error.details.path === '/draft/settings/titleLimit'
);
assert.throws(
  () => assertNoClientPolicyOverrides({ policy_contract_id: 'attacker-policy' }),
  error => error.code === 'CLIENT_POLICY_OVERRIDE_FORBIDDEN'
);
const harmlessPayload = { anchors: ['gift for daughter'], facts: { materials: ['steel'] } };
assert.equal(assertNoClientPolicyOverrides(harmlessPayload), harmlessPayload);

// POLICY_COMPOSER_VALIDATOR_PARITY: both surfaces bind the identical ID + artifact hash.
const composedParity = composeTextSurface(longTitle, 'title', resolution75);
const validatedParity = validatePolicySurfaces({ title: composedParity.text }, resolution75);
assert.deepEqual(validatedParity.policyBinding, composedParity.policyBinding);
assert.equal(validatedParity.canApprove, true);

// POLICY_UNKNOWN_OR_AMBIGUOUS_FAILS_CLOSED, including DRAFT_ONLY versus approval authority.
const publicRegistry = registryOf(amazonPublic);
const publicDraft = publicRegistry.resolve(context(), { purpose: 'DRAFT' });
assert.equal(publicDraft.contract.approvalEligibility, 'DRAFT_ONLY');
assert.equal(validatePolicySurfaces({ title: 'Safe draft' }, publicDraft).canApprove, false);
assert.throws(
  () => publicRegistry.resolve(context(), { purpose: 'APPROVAL' }),
  error => error.code === 'POLICY_CONTRACT_NOT_FOUND'
);
assert.throws(
  () => registryOf(amazon75).resolve(context({ categoryId: 'WRONG_CATEGORY' }), { purpose: 'APPROVAL' }),
  error => error.code === 'POLICY_CONTRACT_NOT_FOUND'
);
assert.throws(
  () => registryOf(amazon75).resolve(context({ sellerAccountId: 'WRONG_ACCOUNT' }), { purpose: 'EXPORT' }),
  error => error.code === 'POLICY_CONTRACT_NOT_FOUND'
);
const competing75 = ownerContract(amazonPublic, { policyContractId: 'amazon-owner-75-competing-v1', titleMaxChars: 75 });
assert.throws(
  () => registryOf(amazon75, competing75).resolve(context(), { purpose: 'APPROVAL' }),
  error => error.code === 'AMBIGUOUS_POLICY_CONTRACT'
    && error.details.policyContractIds.length === 2
);

// Runtime registry must apply the C0 schema and shared cross-field invariants, not a partial shape check.
const ownerWithoutBoundEvidence = ownerContract(amazonPublic, { policyContractId: 'owner-without-evidence-v1' });
ownerWithoutBoundEvidence.sourceRefs = amazonPublic.sourceRefs;
assert.throws(
  () => registryOf(ownerWithoutBoundEvidence),
  error => error.code === 'INVALID_POLICY_CONTRACT'
);
const invalidEtsyTarget = ownerContract(fixture('etsy-us-general-2026-09-08-v1.json'), {
  policyContractId: 'etsy-invalid-target-v1',
  categoryId: 'CUSTOM_JEWELRY'
});
invalidEtsyTarget.rules.tags.maxCount = 5;
invalidEtsyTarget.rules.tags.targetCount = 13;
assert.throws(
  () => registryOf(invalidEtsyTarget),
  error => error.code === 'INVALID_POLICY_CONTRACT'
    && error.details.invariantErrors.some(item => item.code === 'POLICY_TAG_TARGET_EXCEEDS_MAX')
);

// Unbranded caller objects cannot invoke the resolver as if they were server-derived context.
assert.throws(
  () => registryOf(amazon75).resolve({ ...context() }, { purpose: 'APPROVAL' }),
  error => error.code === 'SERVER_POLICY_CONTEXT_REQUIRED'
);

// ETSY_POLICY_VS_QUALITY_TARGET: maximum is policy; shortage is a non-padding quality gap.
const etsyPublic = fixture('etsy-us-general-2026-09-08-v1.json');
const etsyOwner = ownerContract(etsyPublic, {
  policyContractId: 'etsy-owner-general-v1',
  categoryId: 'CUSTOM_JEWELRY'
});
const etsyResolution = registryOf(etsyOwner).resolve(context({
  marketplace: 'ETSY',
  mediaClass: 'ALL',
  productTypeId: 'CUSTOM_NECKLACE',
  categoryId: 'CUSTOM_JEWELRY'
}), { purpose: 'APPROVAL' });
const safeShortage = validatePolicySurfaces({
  title: 'Custom necklace gift',
  tags: Array.from({ length: 8 }, (_, index) => `safe tag ${index}`)
}, etsyResolution);
assert.equal(safeShortage.policyViolations.length, 0);
assert.deepEqual(safeShortage.qualityGaps.map(gap => gap.code), ['ETSY_SAFE_TAG_TARGET_SHORTAGE']);
assert.equal(safeShortage.canApprove, true);
const tooManyTags = validatePolicySurfaces({
  title: 'Custom necklace gift',
  tags: Array.from({ length: 14 }, (_, index) => `safe tag ${index}`)
}, etsyResolution);
assert.ok(tooManyTags.policyViolations.some(item => item.code === 'ETSY_TAG_MAX_EXCEEDED'));
assert.equal(tooManyTags.canApprove, false);
const longTag = validatePolicySurfaces({ title: 'Custom necklace gift', tags: ['x'.repeat(21)] }, etsyResolution);
assert.ok(longTag.policyViolations.some(item => item.code === 'ETSY_TAG_CHAR_LIMIT_EXCEEDED'));

console.log('C1_POLICY_REGISTRY PASS cases=5');
