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
    bytes: bytes(contract),
    authorityScope: contract.approvalEligibility === 'APPROVAL_ELIGIBLE'
      ? { tenantId: 'tenant-1', workspaceId: 'workspace-1' }
      : undefined
  })), { lifecycleSnapshot: { events: [], completeThrough: '2026-12-31T23:59:59Z' } });
}

function registryWithLifecycle(contracts, events, completeThrough = '2026-12-31T23:59:59Z') {
  return new PolicyContractRegistry(contracts.map((contract, index) => ({
    source: `test-policy-${index}.json`,
    bytes: bytes(contract),
    authorityScope: contract.approvalEligibility === 'APPROVAL_ELIGIBLE'
      ? { tenantId: 'tenant-1', workspaceId: 'workspace-1' }
      : undefined
  })), { lifecycleSnapshot: { events, completeThrough } });
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
const amazonSurfaces = overrides => ({
  title: 'Safe title',
  itemHighlights: 'Safe highlight',
  bullets: ['One', 'Two', 'Three', 'Four', 'Five'],
  genericKeywords: '',
  ...overrides
});

// POLICY_CONTRACT_MUTATION_75_TO_200: contract bytes alone alter composition and validation.
const resolution75 = registryOf(amazon75).resolve(context(), { purpose: 'APPROVAL' });
const resolution200 = registryOf(amazon200).resolve(context(), { purpose: 'APPROVAL' });
const composed75 = composeTextSurface(longTitle, 'title', resolution75);
const composed200 = composeTextSurface(longTitle, 'title', resolution200);
assert.equal(composed75.chars, 75);
assert.equal(composed200.chars, 180);
assert.notEqual(composed75.policyBinding.policyContractArtifactHash, composed200.policyBinding.policyContractArtifactHash);
assert.equal(validatePolicySurfaces(amazonSurfaces({ title: longTitle.slice(0, 100) }), resolution75).policyContractApprovalEligible, false);
assert.equal(validatePolicySurfaces(amazonSurfaces({ title: longTitle.slice(0, 100) }), resolution200).policyContractApprovalEligible, true);

// Exact stored bytes, not semantic JSON, define the approval-critical artifact hash.
const amazon75Bytes = bytes(amazon75);
assert.equal(resolution75.policyContractArtifactHash, hash(amazon75Bytes));
assert.notEqual(registryOf(amazon75).artifacts[0].policyContractArtifactHash, hash(Buffer.from(JSON.stringify(amazon75), 'utf8')));
assert.throws(
  () => new PolicyContractRegistry([{ source: 'missing-lifecycle.json', bytes: amazon75Bytes, authorityScope: { tenantId: 'tenant-1', workspaceId: 'workspace-1' } }]),
  error => error.code === 'AUTHORITATIVE_LIFECYCLE_SNAPSHOT_REQUIRED'
);

// POLICY_CLIENT_OVERRIDE_FORBIDDEN: nested client payloads cannot select policy or its scalars.
assert.throws(
  () => assertNoClientPolicyOverrides({ draft: { settings: { titleLimit: 999 } } }),
  error => error.code === 'CLIENT_POLICY_OVERRIDE_FORBIDDEN' && error.details.path === '/draft/settings'
);
assert.throws(
  () => assertNoClientPolicyOverrides({ policy_contract_id: 'attacker-policy' }),
  error => error.code === 'CLIENT_POLICY_OVERRIDE_FORBIDDEN'
);
for (const attack of [
  { rules: { title: { maxChars: 9999 } } },
  { policy: { rules: { title: { max_chars: 9999 } } } },
  { contract: { genericKeywords: { maxUtf8Bytes: 9999 } } },
  { settings: { counting: 'UTF16_CODE_UNITS' } },
  { '%6d%61%78%43%68%61%72%73': 9999 }
]) {
  assert.throws(() => assertNoClientPolicyOverrides(attack), error => error.code === 'CLIENT_POLICY_OVERRIDE_FORBIDDEN');
}
const inheritedOverride = Object.create({ titleLimit: 999 });
inheritedOverride.content = 'safe';
assert.throws(() => assertNoClientPolicyOverrides(inheritedOverride), error => error.code === 'CLIENT_PAYLOAD_PROTOTYPE_FORBIDDEN');
const harmlessPayload = { anchors: ['gift for daughter'], facts: { materials: ['steel'] } };
assert.equal(assertNoClientPolicyOverrides(harmlessPayload), harmlessPayload);

// POLICY_COMPOSER_VALIDATOR_PARITY: both surfaces bind the identical ID + artifact hash.
const composedParity = composeTextSurface(longTitle, 'title', resolution75);
const validatedParity = validatePolicySurfaces(amazonSurfaces({ title: composedParity.text }), resolution75);
assert.deepEqual(validatedParity.policyBinding, composedParity.policyBinding);
assert.equal(validatedParity.policyContractApprovalEligible, true);
assert.equal(validatedParity.requiresAdditionalApprovalGates, true);
assert.equal('canApprove' in validatedParity, false);
assert.equal('canExport' in validatedParity, false);

// A caller cannot forge a resolved contract/hash or promote DRAFT resolution into approval.
assert.throws(
  () => validatePolicySurfaces(amazonSurfaces(), {
    contract: amazon200,
    policyContractId: 'attacker',
    policyContractArtifactHash: '0'.repeat(64),
    purpose: 'APPROVAL',
    resolutionContext: context()
  }),
  error => error.code === 'RESOLVED_POLICY_CONTRACT_REQUIRED'
);
const ownerDraftResolution = registryOf(amazon200).resolve(context(), { purpose: 'DRAFT' });
const ownerDraftValidation = validatePolicySurfaces(amazonSurfaces(), ownerDraftResolution);
assert.equal(ownerDraftValidation.policyContractApprovalEligible, false);
assert.equal(ownerDraftValidation.policyContractExportEligible, false);

// POLICY_UNKNOWN_OR_AMBIGUOUS_FAILS_CLOSED, including DRAFT_ONLY versus approval authority.
const publicRegistry = registryOf(amazonPublic);
const publicDraft = publicRegistry.resolve(context(), { purpose: 'DRAFT' });
assert.equal(publicDraft.contract.approvalEligibility, 'DRAFT_ONLY');
assert.equal(validatePolicySurfaces(amazonSurfaces(), publicDraft).policyContractApprovalEligible, false);
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
assert.throws(
  () => registryOf(amazon75).resolve(context({ tenantId: 'tenant-2' }), { purpose: 'APPROVAL' }),
  error => error.code === 'POLICY_CONTRACT_NOT_FOUND'
);
assert.throws(
  () => registryOf(amazon75).resolve(context({ tenantId: 'tenant-2' }), { purpose: 'DRAFT' }),
  error => error.code === 'POLICY_CONTRACT_NOT_FOUND'
);
assert.throws(
  () => registryOf(amazon75).resolve(context({ workspaceId: 'workspace-2' }), { purpose: 'EXPORT' }),
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
assert.throws(
  () => createServerPolicyContext({
    tenantId: 'tenant-1', workspaceId: 'workspace-1', sellerAccountId: 'ACCOUNT_MAIN', marketplace: 'AMAZON',
    site: 'US', locale: 'en-US', mediaClass: 'NON_MEDIA', productTypeId: 'NECKLACE', categoryId: 'JEWELRY_NECKLACE',
    effectiveAt: '2026-02-31T00:00:00Z'
  }),
  error => error.code === 'INVALID_SERVER_POLICY_CONTEXT'
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
const impossibleDate = ownerContract(amazonPublic, { policyContractId: 'owner-impossible-date-v1' });
impossibleDate.checkedAt = '2026-99-99T00:00:00Z';
assert.throws(() => registryOf(impossibleDate), error => error.code === 'INVALID_POLICY_CONTRACT');

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
assert.equal(safeShortage.policyContractApprovalEligible, true);
const tooManyTags = validatePolicySurfaces({
  title: 'Custom necklace gift',
  tags: Array.from({ length: 14 }, (_, index) => `safe tag ${index}`)
}, etsyResolution);
assert.ok(tooManyTags.policyViolations.some(item => item.code === 'ETSY_TAG_MAX_EXCEEDED'));
assert.equal(tooManyTags.policyContractApprovalEligible, false);
const longTag = validatePolicySurfaces({ title: 'Custom necklace gift', tags: ['x'.repeat(21)] }, etsyResolution);
assert.ok(longTag.policyViolations.some(item => item.code === 'ETSY_TAG_CHAR_LIMIT_EXCEEDED'));

// Required surfaces and declared bullet limits fail closed; safe shortages remain quality-only.
const emptyAmazon = validatePolicySurfaces({}, resolution200);
assert.equal(emptyAmazon.policyContractApprovalEligible, false);
assert.deepEqual(new Set(emptyAmazon.policyViolations.map(item => item.surface)), new Set(['title', 'itemHighlights', 'genericKeywords', 'bullets']));
const limitedBullets = ownerContract(amazonPublic, { policyContractId: 'amazon-owner-bullet-limit-v1', titleMaxChars: 200 });
limitedBullets.rules.bullets.maxChars = 10;
const limitedResolution = registryOf(limitedBullets).resolve(context(), { purpose: 'APPROVAL' });
const overlongBullet = validatePolicySurfaces(amazonSurfaces({ bullets: ['x'.repeat(11)] }), limitedResolution);
assert.ok(overlongBullet.policyViolations.some(item => item.code === 'AMAZON_BULLET_CHAR_LIMIT_EXCEEDED'));
for (const invalidSurfaces of [
  { title: {}, tags: [] },
  { title: '', tags: [] },
  { title: 'Valid title', tags: 'not-array' },
  { title: 'Valid title', tags: [null] },
  { title: 'Valid title', tags: Array(13).fill('duplicate') }
]) {
  assert.equal(validatePolicySurfaces(invalidSurfaces, etsyResolution).policyContractApprovalEligible, false);
}

// Exact-hash lifecycle events are authoritative for revocation; completeness is mandatory.
const amazon200Hash = hash(bytes(amazon200));
const revokeEvent = {
  schemaVersion: 'omniseller.policy-lifecycle-event.v1',
  eventId: 'revoke-amazon-owner-200-v1',
  policyContractId: amazon200.policyContractId,
  policyContractArtifactHash: amazon200Hash,
  eventType: 'REVOKED',
  actorId: 'owner-1',
  occurredAt: '2026-09-09T00:30:00Z',
  reasonCode: 'OWNER_REVOKED',
  supersedingPolicyContractId: null
};
assert.throws(
  () => registryWithLifecycle([amazon200], [revokeEvent]).resolve(context(), { purpose: 'APPROVAL' }),
  error => error.code === 'POLICY_CONTRACT_NOT_FOUND'
);
assert.throws(
  () => registryWithLifecycle([amazon200], [], '2026-09-09T00:59:59Z').resolve(context(), { purpose: 'APPROVAL' }),
  error => error.code === 'INCOMPLETE_POLICY_LIFECYCLE_SNAPSHOT'
);
const amazonNext = structuredClone(amazon200);
amazonNext.policyContractId = 'amazon-owner-next-v2';
amazonNext.effectiveFrom = '2026-09-09T00:45:00Z';
const supersedeEvent = {
  ...revokeEvent,
  eventId: 'supersede-amazon-owner-200-v1',
  eventType: 'SUPERSEDED',
  reasonCode: 'OWNER_REPLACED',
  supersedingPolicyContractId: amazonNext.policyContractId
};
const supersededResolution = registryWithLifecycle([amazon200, amazonNext], [supersedeEvent])
  .resolve(context(), { purpose: 'APPROVAL' });
assert.equal(supersededResolution.policyContractId, amazonNext.policyContractId);

console.log('C1_POLICY_REGISTRY PASS groups=10');
