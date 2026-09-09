'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { TextDecoder } = require('node:util');
const { isRfc3339DateTime, validatePolicyContract, validatePolicyLifecycleEvent } = require('./contractSchemaValidator');

const VALID_SERVER_CONTEXTS = new WeakSet();
const VALID_SERVER_RESOLUTIONS = new WeakSet();
const PURPOSES = new Set(['DRAFT', 'APPROVAL', 'EXPORT']);
const FORBIDDEN_CLIENT_KEYS = new Set([
  'policy',
  'rules',
  'contract',
  'policycontract',
  'policyrules',
  'policylimits',
  'limits',
  'settings',
  'maxchars',
  'counting',
  'targetcount',
  'maxcount',
  'maxutf8bytes',
  'allowcommas',
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

function parseStrictJson(bytes, source) {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new PolicyContractError('POLICY_CONTRACT_UTF8_BOM_FORBIDDEN', { source });
  }
  let value;
  try {
    value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (_) {
    throw new PolicyContractError('INVALID_POLICY_CONTRACT_UTF8', { source });
  }
  let index = 0;
  let nodes = 0;
  const whitespace = () => { while (/\s/.test(value[index] || '')) index += 1; };
  const parseString = () => {
    const start = index++;
    while (index < value.length) {
      if (value[index] === '\\') { index += 2; continue; }
      if (value[index] === '"') {
        index += 1;
        return JSON.parse(value.slice(start, index));
      }
      index += 1;
    }
    throw new Error('unterminated string');
  };
  const parseValue = (depth = 0) => {
    if (depth > 64) throw new PolicyContractError('POLICY_CONTRACT_JSON_TOO_DEEP', { source });
    nodes += 1;
    if (nodes > 10000) throw new PolicyContractError('POLICY_CONTRACT_JSON_TOO_LARGE', { source });
    whitespace();
    if (value[index] === '{') {
      index += 1;
      whitespace();
      const keys = new Set();
      if (value[index] === '}') { index += 1; return; }
      while (index < value.length) {
        whitespace();
        if (value[index] !== '"') throw new Error('object key required');
        const key = parseString();
        if (keys.has(key)) throw new PolicyContractError('DUPLICATE_POLICY_CONTRACT_JSON_KEY', { source, key });
        keys.add(key);
        whitespace();
        if (value[index++] !== ':') throw new Error('colon required');
        parseValue(depth + 1);
        whitespace();
        const separator = value[index++];
        if (separator === '}') return;
        if (separator !== ',') throw new Error('object separator required');
      }
      throw new Error('unterminated object');
    }
    if (value[index] === '[') {
      index += 1;
      whitespace();
      if (value[index] === ']') { index += 1; return; }
      while (index < value.length) {
        parseValue(depth + 1);
        whitespace();
        const separator = value[index++];
        if (separator === ']') return;
        if (separator !== ',') throw new Error('array separator required');
      }
      throw new Error('unterminated array');
    }
    if (value[index] === '"') { parseString(); return; }
    const start = index;
    while (index < value.length && !/[\s,}\]]/.test(value[index])) index += 1;
    JSON.parse(value.slice(start, index));
  };
  try {
    parseValue();
    whitespace();
    if (index !== value.length) throw new Error('trailing content');
    return JSON.parse(value);
  } catch (error) {
    if (error instanceof PolicyContractError) throw error;
    throw new PolicyContractError('INVALID_POLICY_CONTRACT_JSON', { source });
  }
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
  if (!isRfc3339DateTime(effectiveAt)) {
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
  VALID_SERVER_CONTEXTS.add(context);
  return Object.freeze(context);
}

function assertNoClientPolicyOverrides(payload) {
  const seen = new WeakSet();
  const normalizedKey = key => {
    let decoded = String(key);
    for (let round = 0; round < 5; round += 1) {
      let next;
      try { next = decodeURIComponent(decoded); } catch (_) { break; }
      if (next === decoded) break;
      decoded = next;
    }
    if (/%[0-9a-f]{2}/i.test(decoded)) {
      throw new PolicyContractError('CLIENT_KEY_ENCODING_TOO_DEEP', { key });
    }
    return decoded.normalize('NFKC').replace(/[^a-z0-9]/gi, '').toLowerCase();
  };
  const queue = [{ value: payload, pointer: '', depth: 0 }];
  let cursor = 0;
  let visitedNodes = 0;
  while (cursor < queue.length) {
    const { value, pointer, depth } = queue[cursor++];
    if (!value || typeof value !== 'object') continue;
    if (depth > 64) throw new PolicyContractError('CLIENT_PAYLOAD_TOO_DEEP', { path: pointer });
    visitedNodes += 1;
    if (visitedNodes > 10000) throw new PolicyContractError('CLIENT_PAYLOAD_TOO_LARGE');
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== Array.prototype && prototype !== null) {
      throw new PolicyContractError('CLIENT_PAYLOAD_PROTOTYPE_FORBIDDEN', { path: pointer });
    }
    if (seen.has(value)) continue;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      const next = `${pointer}/${key}`;
      if (FORBIDDEN_CLIENT_KEYS.has(normalizedKey(key))) {
        throw new PolicyContractError('CLIENT_POLICY_OVERRIDE_FORBIDDEN', { key, path: next });
      }
      queue.push({ value: child, pointer: next, depth: depth + 1 });
    }
  }
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
    && Date.parse(contract.checkedAt) <= Date.parse(context.effectiveAt)
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

function validateAuthorityScope(scope, contract) {
  if (contract.approvalEligibility !== 'APPROVAL_ELIGIBLE') return null;
  const tenantId = assertNonEmptyString(scope?.tenantId, 'authorityScope.tenantId');
  const workspaceId = assertNonEmptyString(scope?.workspaceId, 'authorityScope.workspaceId');
  const authorityScopeHash = exactByteSha256(Buffer.from(JSON.stringify({ tenantId, workspaceId }), 'utf8'));
  return Object.freeze({ tenantId, workspaceId, authorityScopeHash });
}

function sameAuthorityScope(left, right) {
  return left?.tenantId === right?.tenantId && left?.workspaceId === right?.workspaceId;
}

function sameContractCohort(left, right) {
  const normalize = value => [...value].sort();
  return left.marketplace === right.marketplace
    && left.site === right.site
    && left.cohort.mediaClass === right.cohort.mediaClass
    && JSON.stringify(normalize(left.locales)) === JSON.stringify(normalize(right.locales))
    && JSON.stringify(normalize(left.cohort.productTypeIds)) === JSON.stringify(normalize(right.cohort.productTypeIds))
    && JSON.stringify(normalize(left.cohort.categoryIds)) === JSON.stringify(normalize(right.cohort.categoryIds))
    && JSON.stringify(normalize(left.cohort.sellerAccountIds)) === JSON.stringify(normalize(right.cohort.sellerAccountIds));
}

class PolicyContractRegistry {
  constructor(artifacts, options = {}) {
    if (!Array.isArray(artifacts) || !artifacts.length) {
      throw new PolicyContractError('NO_POLICY_CONTRACT_ARTIFACTS');
    }
    const ids = new Set();
    this.artifacts = artifacts.map((artifact, index) => {
      const bytes = Buffer.isBuffer(artifact.bytes) ? Buffer.from(artifact.bytes) : Buffer.from(String(artifact.bytes), 'utf8');
      const contract = parseStrictJson(bytes, artifact.source || index);
      requireContractShape(contract);
      if (ids.has(contract.policyContractId)) {
        throw new PolicyContractError('DUPLICATE_POLICY_CONTRACT_ID', { policyContractId: contract.policyContractId });
      }
      ids.add(contract.policyContractId);
      return deepFreeze({
        contract: deepFreeze(contract),
        policyContractArtifactHash: exactByteSha256(bytes),
        artifactByteLength: bytes.length,
        source: artifact.source || `artifact-${index}`,
        authorityScope: validateAuthorityScope(artifact.authorityScope, contract)
      });
    });
    if (!options.lifecycleSnapshot || !Array.isArray(options.lifecycleSnapshot.events)
      || !isRfc3339DateTime(options.lifecycleSnapshot.completeThrough)) {
      throw new PolicyContractError('AUTHORITATIVE_LIFECYCLE_SNAPSHOT_REQUIRED');
    }
    const eventIds = new Set();
    this.lifecycleSnapshot = deepFreeze({
      completeThrough: new Date(options.lifecycleSnapshot.completeThrough).toISOString(),
      events: options.lifecycleSnapshot.events.map((event, index) => {
        const validation = validatePolicyLifecycleEvent(event);
        if (!validation.valid) {
          throw new PolicyContractError('INVALID_POLICY_LIFECYCLE_EVENT', { index, schemaErrors: validation.schemaErrors });
        }
        if (eventIds.has(event.eventId)) throw new PolicyContractError('DUPLICATE_POLICY_LIFECYCLE_EVENT_ID', { eventId: event.eventId });
        eventIds.add(event.eventId);
        if (Date.parse(event.occurredAt) > Date.parse(options.lifecycleSnapshot.completeThrough)) {
          throw new PolicyContractError('POLICY_LIFECYCLE_EVENT_AFTER_SNAPSHOT', { eventId: event.eventId });
        }
        return deepFreeze(structuredClone(event));
      })
    });
    Object.freeze(this.artifacts);
  }

  static fromDirectory(directory, options) {
    const artifacts = fs.readdirSync(directory, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(entry => {
        const source = path.join(directory, entry.name);
        return { source, bytes: fs.readFileSync(source) };
      });
    return new PolicyContractRegistry(artifacts, options);
  }

  resolve(context, options = {}) {
    if (!context || !VALID_SERVER_CONTEXTS.has(context)) {
      throw new PolicyContractError('SERVER_POLICY_CONTEXT_REQUIRED');
    }
    const purpose = String(options.purpose || 'DRAFT').toUpperCase();
    if (!PURPOSES.has(purpose)) throw new PolicyContractError('INVALID_POLICY_PURPOSE', { purpose });
    if (purpose !== 'DRAFT' && Date.parse(this.lifecycleSnapshot.completeThrough) < Date.parse(context.effectiveAt)) {
      throw new PolicyContractError('INCOMPLETE_POLICY_LIFECYCLE_SNAPSHOT', {
        completeThrough: this.lifecycleSnapshot.completeThrough,
        effectiveAt: context.effectiveAt
      });
    }

    let candidates = this.artifacts.filter(artifact => matchesContext(artifact.contract, context)
      && (!artifact.authorityScope
        || (artifact.authorityScope.tenantId === context.tenantId
          && artifact.authorityScope.workspaceId === context.workspaceId)));
    if (purpose !== 'DRAFT') {
      candidates = candidates.filter(artifact => artifact.contract.approvalEligibility === 'APPROVAL_ELIGIBLE');
    }
    const lifecycleEvents = this.lifecycleSnapshot.events.filter(event => Date.parse(event.occurredAt) <= Date.parse(context.effectiveAt));
    const inactiveHashes = new Set();
    for (const event of lifecycleEvents) {
      const source = this.artifacts.find(item => item.contract.policyContractId === event.policyContractId
        && item.policyContractArtifactHash === event.policyContractArtifactHash);
      if (!source) throw new PolicyContractError('POLICY_LIFECYCLE_SOURCE_NOT_FOUND', { eventId: event.eventId });
      if (event.eventType === 'SUPERSEDED') {
        const target = this.artifacts.find(item => item.contract.policyContractId === event.supersedingPolicyContractId);
        if (!target || Date.parse(target.contract.effectiveFrom) <= Date.parse(source.contract.effectiveFrom)
          || Date.parse(event.occurredAt) < Math.max(Date.parse(source.contract.checkedAt), Date.parse(target.contract.checkedAt), Date.parse(target.contract.effectiveFrom))
          || !sameAuthorityScope(source.authorityScope, target.authorityScope)
          || !sameContractCohort(source.contract, target.contract)) {
          throw new PolicyContractError('INVALID_POLICY_SUPERSESSION', { eventId: event.eventId });
        }
      } else if (Date.parse(event.occurredAt) < Math.max(Date.parse(source.contract.checkedAt), Date.parse(source.contract.effectiveFrom))) {
        throw new PolicyContractError('INVALID_POLICY_REVOCATION_CHRONOLOGY', { eventId: event.eventId });
      }
      inactiveHashes.add(event.policyContractArtifactHash);
    }
    candidates = candidates.filter(item => !inactiveHashes.has(item.policyContractArtifactHash));
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
    const resolution = {
      contract: winner.contract,
      policyContractId: winner.contract.policyContractId,
      policyContractArtifactHash: winner.policyContractArtifactHash,
      purpose,
      resolutionContext: context,
      authorityScope: winner.authorityScope
    };
    VALID_SERVER_RESOLUTIONS.add(resolution);
    return deepFreeze(resolution);
  }
}

module.exports = {
  PolicyContractError,
  PolicyContractRegistry,
  assertNoClientPolicyOverrides,
  createServerPolicyContext,
  exactByteSha256,
  isServerPolicyResolution: value => Boolean(value && VALID_SERVER_RESOLUTIONS.has(value))
};
