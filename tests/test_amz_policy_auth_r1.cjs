'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createServerPolicyContext } = require('../server/policy/contractRegistry');
const { policyRegistryForContext } = require('../server/policy/authorityLoader');

const exact = createServerPolicyContext({
  tenantId: '8af7fc79-c563-41a4-8eaf-6a06cb7a51a8',
  workspaceId: '1',
  sellerAccountId: 'workspace:1',
  marketplace: 'AMAZON',
  site: 'US',
  locale: 'es-US',
  mediaClass: 'NON_MEDIA',
  productTypeId: 'CUSTOM_NECKLACE',
  categoryId: 'JEWELRY_NECKLACE',
  effectiveAt: '2026-09-24T15:07:00+07:00'
});

const registry = policyRegistryForContext(exact);
const draft = registry.resolve(exact, { purpose: 'DRAFT' });
const approval = registry.resolve(exact, { purpose: 'APPROVAL' });
const exported = registry.resolve(exact, { purpose: 'EXPORT' });

assert.equal(approval.contract.verificationStatus, 'OWNER_CONFIRMED_ACCOUNT_CATEGORY');
assert.equal(approval.contract.approvalEligibility, 'APPROVAL_ELIGIBLE');
assert.equal(approval.policyContractId, 'amazon-us-workspace1-jewelry-necklace-owner-2026-09-24-v1');
assert.equal(exported.policyContractId, approval.policyContractId);
assert.equal(draft.policyContractId, approval.policyContractId,
  'exact owner-scoped draft must bind to the same most-specific contract');
assert.match(approval.authorityScope.authorityScopeHash, /^[a-f0-9]{64}$/);
assert.equal(approval.authorityScope.tenantId, exact.tenantId);
assert.equal(approval.authorityScope.workspaceId, exact.workspaceId);
assert.equal(approval.lifecycleSnapshotCompleteThrough, '2026-09-24T08:07:00.000Z');
assert.match(approval.lifecycleSnapshotDigest, /^[a-f0-9]{64}$/);

const later = createServerPolicyContext({
  tenantId: exact.tenantId, workspaceId: exact.workspaceId, sellerAccountId: exact.sellerAccountId,
  marketplace: exact.marketplace, site: exact.site, locale: exact.locale, mediaClass: exact.mediaClass,
  productTypeId: exact.productTypeId, categoryId: exact.categoryId,
  effectiveAt: '2026-09-24T16:07:00+07:00'
});
const laterApproval = policyRegistryForContext(later).resolve(later, { purpose: 'APPROVAL' });
assert.equal(laterApproval.lifecycleSnapshotDigest, approval.lifecycleSnapshotDigest,
  'moving completeness watermark must not stale immutable event-set dependency binding');

const wrongWorkspace = createServerPolicyContext({
  tenantId: exact.tenantId, workspaceId: '999', sellerAccountId: exact.sellerAccountId,
  marketplace: exact.marketplace, site: exact.site, locale: exact.locale, mediaClass: exact.mediaClass,
  productTypeId: exact.productTypeId, categoryId: exact.categoryId, effectiveAt: exact.effectiveAt
});
assert.throws(() => policyRegistryForContext(wrongWorkspace).resolve(wrongWorkspace, { purpose: 'APPROVAL' }),
  error => error.code === 'POLICY_CONTRACT_NOT_FOUND');

const wrongCategory = createServerPolicyContext({
  tenantId: exact.tenantId, workspaceId: exact.workspaceId, sellerAccountId: exact.sellerAccountId,
  marketplace: exact.marketplace, site: exact.site, locale: exact.locale, mediaClass: exact.mediaClass,
  productTypeId: exact.productTypeId, categoryId: 'OTHER_CATEGORY', effectiveAt: exact.effectiveAt
});
assert.throws(() => policyRegistryForContext(wrongCategory).resolve(wrongCategory, { purpose: 'APPROVAL' }),
  error => error.code === 'POLICY_CONTRACT_NOT_FOUND');

const attestationPath = path.resolve(__dirname,
  '../contracts/omniseller-r3/v1/policy-owner-attestations/amz-policy-auth-r1-owner-20260924.json');
const original = fs.readFileSync(attestationPath);
try {
  fs.writeFileSync(attestationPath, Buffer.concat([original, Buffer.from('\n')]));
  assert.throws(() => policyRegistryForContext(exact), /OWNER_ATTESTATION_BINDING_MISMATCH/,
    'attestation byte changes must invalidate owner authority');
} finally {
  fs.writeFileSync(attestationPath, original);
}

console.log('AMZ_POLICY_AUTH_R1_PASS');
