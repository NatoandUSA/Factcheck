'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createServerPolicyContext } = require('../server/policy/contractRegistry');
const { policyRegistryForContext } = require('../server/policy/authorityLoader');
const { validatePolicyContract } = require('../server/policy/contractSchemaValidator');

const root = path.resolve(__dirname, '..');
const contractPath = path.join(root, 'contracts/omniseller-r3/v1/policy-owner-contracts',
  'amazon-us-workspace1-jewelry-necklace-owner-2026-09-24-v1.json');
const attestationPath = path.join(root, 'contracts/omniseller-r3/v1/policy-owner-attestations',
  'amz-policy-auth-r1-owner-20260924.json');
const scopeMapPath = path.join(root, 'contracts/omniseller-r3/v1/policy-authority-scopes.json');

const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const attestationBytes = fs.readFileSync(attestationPath);
const attestation = JSON.parse(attestationBytes.toString('utf8'));
const scopes = JSON.parse(fs.readFileSync(scopeMapPath, 'utf8'));

assert.equal(validatePolicyContract(contract).valid, true);
const ownerRef = contract.sourceRefs.find(item => item.kind === 'OWNER_ATTESTATION');
assert.ok(ownerRef);
assert.equal(ownerRef.artifactHash, crypto.createHash('sha256').update(attestationBytes).digest('hex'));
assert.equal(ownerRef.actorId, attestation.actorId);
assert.equal(scopes.contracts[contract.policyContractId].attestationId, attestation.attestationId);

function context(overrides = {}) {
  return createServerPolicyContext({
    tenantId: '8af7fc79-c563-41a4-8eaf-6a06cb7a51a8',
    workspaceId: '1',
    sellerAccountId: 'workspace:1',
    marketplace: 'AMAZON',
    site: 'US',
    locale: 'es-US',
    mediaClass: 'NON_MEDIA',
    productTypeId: 'CUSTOM_NECKLACE',
    categoryId: 'JEWELRY_NECKLACE',
    effectiveAt: '2026-09-24T06:10:00Z',
    ...overrides
  });
}

const approvedContext = context();
const approval = policyRegistryForContext(approvedContext).resolve(approvedContext, { purpose: 'APPROVAL' });
assert.equal(approval.policyContractId, contract.policyContractId);
assert.equal(approval.contract.approvalEligibility, 'APPROVAL_ELIGIBLE');
assert.equal(approval.authorityScope.tenantId, attestation.tenantId);
assert.equal(approval.authorityScope.workspaceId, attestation.workspaceId);

const first = context({ effectiveAt: '2026-09-24T06:10:00Z' });
const later = context({ effectiveAt: '2026-09-24T06:20:00Z' });
const firstResolution = policyRegistryForContext(first).resolve(first, { purpose: 'DRAFT' });
const laterResolution = policyRegistryForContext(later).resolve(later, { purpose: 'DRAFT' });
assert.equal(firstResolution.lifecycleSnapshotDigest, laterResolution.lifecycleSnapshotDigest,
  'clock watermark alone must not stale immutable draft dependencies');

for (const overrides of [
  { tenantId: 'tenant-other' },
  { workspaceId: '2' },
  { sellerAccountId: 'workspace:99' },
  { categoryId: 'GENERAL_MERCHANDISE' },
  { productTypeId: 'UNIVERSAL_PRODUCT' }
]) {
  const denied = context(overrides);
  assert.throws(() => policyRegistryForContext(denied).resolve(denied, { purpose: 'APPROVAL' }),
    error => error.code === 'POLICY_CONTRACT_NOT_FOUND');
}

console.log('AMZ_POLICY_AUTH_R1_PASSED');
