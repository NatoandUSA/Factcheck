'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { PolicyContractRegistry } = require('./contractRegistry');

const contractRoot = path.resolve(__dirname, '../../contracts/omniseller-r3/v1');
const publicDir = path.join(contractRoot, 'policy-fixtures');
const ownerDir = path.join(contractRoot, 'policy-owner-contracts');
const attestationDir = path.join(contractRoot, 'policy-owner-attestations');
const lifecycleDir = path.join(contractRoot, 'policy-lifecycle-events');
const scopeMapPath = path.join(contractRoot, 'policy-authority-scopes.json');

function files(dir, suffix = '.json') {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith(suffix))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(entry => path.join(dir, entry.name));
}

function parseJson(bytes, source) {
  try { return JSON.parse(Buffer.from(bytes).toString('utf8')); }
  catch (_) { throw new Error('INVALID_POLICY_AUTHORITY_JSON:' + source); }
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function loadScopeMap() {
  const bytes = fs.readFileSync(scopeMapPath);
  const value = parseJson(bytes, scopeMapPath);
  if (value?.schemaVersion !== 'omniseller.policy-authority-scope-map.v1'
    || !value.contracts || typeof value.contracts !== 'object' || Array.isArray(value.contracts)) {
    throw new Error('INVALID_POLICY_AUTHORITY_SCOPE_MAP');
  }
  return value.contracts;
}

function attestationById(id) {
  const matches = files(attestationDir).map(source => {
    const bytes = fs.readFileSync(source);
    const value = parseJson(bytes, source);
    return { source, bytes, value, hash: sha256(bytes) };
  }).filter(item => item.value?.attestationId === id);
  if (matches.length !== 1) throw new Error('OWNER_ATTESTATION_NOT_UNIQUE:' + id);
  return matches[0];
}

function assertOwnerBinding(contract, scope, attestation, source) {
  const ref = (contract.sourceRefs || []).find(item => item.kind === 'OWNER_ATTESTATION');
  if (!ref) throw new Error('OWNER_ATTESTATION_SOURCE_REQUIRED:' + contract.policyContractId);
  if (attestation.value?.schemaVersion !== 'omniseller.owner-policy-attestation.v1'
    || attestation.hash !== ref.artifactHash
    || String(attestation.value.actorId) !== String(ref.actorId)
    || attestation.value.capturedAt !== ref.capturedAt
    || attestation.value.tenantId !== scope.tenantId
    || String(attestation.value.workspaceId) !== String(scope.workspaceId)
    || attestation.value.marketplace !== contract.marketplace
    || attestation.value.site !== contract.site
    || !contract.cohort?.sellerAccountIds?.includes(attestation.value.sellerAccountId)
    || !contract.cohort?.categoryIds?.includes(attestation.value.categoryId)
    || !contract.cohort?.productTypeIds?.includes(attestation.value.productTypeId)
    || contract.cohort?.mediaClass !== attestation.value.mediaClass) {
    throw new Error('OWNER_ATTESTATION_BINDING_MISMATCH:' + source);
  }
}

function policyArtifacts() {
  const publicArtifacts = files(publicDir).map(source => ({ source, bytes: fs.readFileSync(source) }));
  const scopes = loadScopeMap();
  const ownerArtifacts = files(ownerDir).map(source => {
    const bytes = fs.readFileSync(source);
    const contract = parseJson(bytes, source);
    const scope = scopes[contract.policyContractId];
    if (!scope?.tenantId || !scope?.workspaceId || !scope?.attestationId) {
      throw new Error('OWNER_POLICY_AUTHORITY_SCOPE_REQUIRED:' + contract.policyContractId);
    }
    const attestation = attestationById(scope.attestationId);
    assertOwnerBinding(contract, scope, attestation, source);
    return {
      source,
      bytes,
      authorityScope: { tenantId: String(scope.tenantId), workspaceId: String(scope.workspaceId) }
    };
  });
  return [...publicArtifacts, ...ownerArtifacts];
}

function lifecycleEventsThrough(effectiveAt) {
  const boundary = Date.parse(effectiveAt);
  if (!Number.isFinite(boundary)) throw new Error('INVALID_POLICY_EFFECTIVE_AT');
  return files(lifecycleDir).map(source => parseJson(fs.readFileSync(source), source))
    .filter(event => Number.isFinite(Date.parse(event?.occurredAt)) && Date.parse(event.occurredAt) <= boundary);
}

function policyRegistryForContext(context) {
  if (!context?.effectiveAt) throw new Error('SERVER_POLICY_CONTEXT_REQUIRED');
  return new PolicyContractRegistry(policyArtifacts(), {
    lifecycleSnapshot: {
      completeThrough: context.effectiveAt,
      events: lifecycleEventsThrough(context.effectiveAt)
    }
  });
}

module.exports = Object.freeze({
  policyRegistryForContext,
  policyArtifacts,
  lifecycleEventsThrough
});
