'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { validatePolicyContract } = require('./contractSchemaValidator');

const SERVER_CONTEXT = Symbol('omniseller.serverPolicyContext');
const PURPOSES = new Set(['DRAFT', 'APPROVAL', 'EXPORT']);
const FORBIDDEN_CLIENT_KEYS = new Set([
  'titlelimit',
  'highlightlimit',
  'itemhighlightslimit',
  'searchtermbytes',
  'maxtitlechars',
  'maxsearchtermsbytes',
  'maxtagchars',
  'maxtags',
  'targettags',
  'policycontractid',
  'policycontracthash',
  'policycontractartifacthash',
  'approvaleligibility',
  'verificationstatus'
]);

class PolicyContractError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = 'PolicyContractError';
    this.code = code;
    this.details = details;
  }
}

function exactByteSha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function assertNonEmptyString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new PolicyContractError('INVALID_SERVER_POLICY_CONTEXT', { field });
  }
  return value.trim();
}

function createServerPolicyContext(input = {}) {
  const effectiveAt = input.effectiveAt == null ? new Date().toISOString() : input.effectiveAt;
  if (!Number.isFinite(Date.parse(effectiveAt))) {
    throw new PolicyContractError('INVALID_SERVER_POLICY_CONTEXT', { field: 'effectiveAt' });
  }
  const context = {
    tenantId: assertNonEmptyString(input.tenantId, 'tenantId'),
    workspaceId: assertNonEmptyString(input.workspaceId, 'workspaceId'),
    sellerAccountId: assertNonEmptyString(input.sellerAccountId, 'sellerAccountId'),
    marketplace: assertNonEmptyString(input.marketplace, 'marketplace').toUpperCase(),
    site: assertNonEmptyString(input.site, 'site').toUpperCase(),
    locale: assertNonEmptyString(input.locale, 'locale'),
    mediaClass: assertNonEmptyString(input.mediaClass, 'mediaClass').toUpperCase(),
    productTypeId: assertNonEmptyString(input.productTypeId, 'productTypeId'),
    categoryId: assertNonEmptyString(input.categoryId, 'categoryId'),
    effectiveAt: new Date(effectiveAt).toISOString()
  };
  Object.defineProperty(context, SERVER_CONTEXT, { value: true, enumerable: false });
  return Object.freeze(context);
}

function assertNoClientPolicyOverrides(payload) {
  const seen = new WeakSet();
  const visit = (value, pointer) => {
    if (!value || typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      const next = `${pointer}/${key}`;
      if (FORBIDDEN_CLIENT_KEYS.has(key.replace(/[^a-z0-9]/gi, '').toLowerCase())) {
        throw new PolicyContractError('CLIENT_POLICY_OVERRIDE_FORBIDDEN', { key, path: next });
      }
      visit(child, next);
    }
  };
  visit(payload, '');
  return payload;
}

function requireContractShape(contract) {
  const validation = validatePolicyContract(contract);
  if (!validation.valid) {
    throw new PolicyContractError('INVALID_POLICY_CONTRACT', {
      schemaErrors: validation.schemaErrors,
      invariantErrors: validation.invariantErrors
    });
  }
}

function listMatches(list, value) {
  return list.length === 0 || list.includes(value);
}

function matchesContext(contract, context) {
  return contract.marketplace === context.marketplace
    && contract.site === context.site
    && contract.locales.includes(context.locale)
    && Date.parse(contract.effectiveFrom) <= Date.parse(context.effectiveAt)
    && (contract.cohort.mediaClass === 'ALL' || contract.cohort.mediaClass === context.mediaClass)
    && listMatches(contract.cohort.productTypeIds, context.productTypeId)
    && listMatches(contract.cohort.categoryIds, context.categoryId)
    && listMatches(contract.cohort.sellerAccountIds, context.sellerAccountId);
}

function specificity(contract) {
  return (contract.verificationStatus === 'OWNER_CONFIRMED_ACCOUNT_CATEGORY' ? 100 : 0)
    + (contract.cohort.sellerAccountIds.length ? 16 : 0)
    + (contract.cohort.categoryIds.length ? 8 : 0)
    + (contract.cohort.productTypeIds.length ? 4 : 0)
    + (contract.cohort.mediaClass !== 'ALL' ? 2 : 0);
}

class PolicyContractRegistry {
  constructor(artifacts) {
    if (!Array.isArray(artifacts) || !artifacts.length) {
      throw new PolicyContractError('NO_POLICY_CONTRACT_ARTIFACTS');
    }
    const ids = new Set();
    this.artifacts = artifacts.map((artifact, index) => {
      const bytes = Buffer.isBuffer(artifact.bytes) ? Buffer.from(artifact.bytes) : Buffer.from(String(artifact.bytes), 'utf8');
      let contract;
      try {
        contract = JSON.parse(bytes.toString('utf8'));
      } catch (error) {
        throw new PolicyContractError('INVALID_POLICY_CONTRACT_JSON', { source: artifact.source || index });
      }
      requireContractShape(contract);
      if (ids.has(contract.policyContractId)) {
        throw new PolicyContractError('DUPLICATE_POLICY_CONTRACT_ID', { policyContractId: contract.policyContractId });
      }
      ids.add(contract.policyContractId);
      return deepFreeze({
        contract: deepFreeze(contract),
        policyContractArtifactHash: exactByteSha256(bytes),
        artifactByteLength: bytes.length,
        source: artifact.source || `artifact-${index}`
      });
    });
    Object.freeze(this.artifacts);
  }

  static fromDirectory(directory) {
    const artifacts = fs.readdirSync(directory, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(entry => {
        const source = path.join(directory, entry.name);
        return { source, bytes: fs.readFileSync(source) };
      });
    return new PolicyContractRegistry(artifacts);
  }

  resolve(context, options = {}) {
    if (!context || context[SERVER_CONTEXT] !== true) {
      throw new PolicyContractError('SERVER_POLICY_CONTEXT_REQUIRED');
    }
    const purpose = String(options.purpose || 'DRAFT').toUpperCase();
    if (!PURPOSES.has(purpose)) throw new PolicyContractError('INVALID_POLICY_PURPOSE', { purpose });

    let candidates = this.artifacts.filter(artifact => matchesContext(artifact.contract, context));
    if (purpose !== 'DRAFT') {
      candidates = candidates.filter(artifact => artifact.contract.approvalEligibility === 'APPROVAL_ELIGIBLE');
    }
    const supersededIds = new Set(candidates.map(item => item.contract.supersedes).filter(Boolean));
    candidates = candidates.filter(item => !supersededIds.has(item.contract.policyContractId));
    if (!candidates.length) {
      throw new PolicyContractError('POLICY_CONTRACT_NOT_FOUND', {
        purpose,
        marketplace: context.marketplace,
        site: context.site,
        categoryId: context.categoryId,
        sellerAccountId: context.sellerAccountId
      });
    }
    const highest = Math.max(...candidates.map(item => specificity(item.contract)));
    const winners = candidates.filter(item => specificity(item.contract) === highest);
    if (winners.length !== 1) {
      throw new PolicyContractError('AMBIGUOUS_POLICY_CONTRACT', {
        purpose,
        policyContractIds: winners.map(item => item.contract.policyContractId).sort()
      });
    }
    const winner = winners[0];
    return deepFreeze({
      contract: winner.contract,
      policyContractId: winner.contract.policyContractId,
      policyContractArtifactHash: winner.policyContractArtifactHash,
      purpose,
      resolutionContext: context
    });
  }
}

module.exports = {
  PolicyContractError,
  PolicyContractRegistry,
  assertNoClientPolicyOverrides,
  createServerPolicyContext,
  exactByteSha256
};
