const crypto = require('crypto');

const AUTHORITY_VERSION = 'H0_V1';
const CONTROLLED_KIND = 'SMART_PULL_ARTIFACT_V1';
const ACCEPTABLE_STATES = new Set(['RETRIEVED_NO_OBSERVED_AT', 'VERIFIED_RETRIEVED']);
const CONTROLLED_PROVIDERS = new Set(['YTRENDS_MCP', 'H10_MCP']);
const RESERVED_AUTHORITY_KEYS = new Set([
  'kind',
  'authority',
  'authorityVersion',
  'evidenceState',
  'contentHash',
  'provider',
  'scope',
  'tenantId',
  'workspaceId',
  'marketplace',
  'projectId',
  'evidenceVersion'
]);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = canonicalize(value[key]);
    return out;
  }, {});
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function normalizeScope(scope = {}) {
  const workspaceId = Number(scope.workspaceId);
  const projectId = Number(scope.projectId);
  const evidenceVersion = Number(scope.evidenceVersion);
  return {
    tenantId: typeof scope.tenantId === 'string' ? scope.tenantId : '',
    workspaceId: Number.isInteger(workspaceId) ? workspaceId : null,
    marketplace: typeof scope.marketplace === 'string' ? scope.marketplace.toUpperCase() : '',
    projectId: Number.isInteger(projectId) ? projectId : null,
    evidenceVersion: Number.isInteger(evidenceVersion) && evidenceVersion > 0 ? evidenceVersion : null
  };
}

function parseMetadata(evidence) {
  if (!evidence || !evidence.metadata) return {};
  if (typeof evidence.metadata === 'object' && !Array.isArray(evidence.metadata)) return evidence.metadata;
  if (typeof evidence.metadata !== 'string') return {};
  try {
    const parsed = JSON.parse(evidence.metadata);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function sanitizeGenericEvidenceMetadata(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const clientMetadata = {};
  for (const [key, value] of Object.entries(source)) {
    if (!RESERVED_AUTHORITY_KEYS.has(key)) clientMetadata[key] = value;
  }
  return {
    kind: 'GENERIC_NON_AUTHORITY_V1',
    authority: 'NON_AUTHORITY',
    clientMetadata
  };
}

function deriveControlledEvidenceEnvelope({ provider, payload, scope, evidenceState = 'VERIFIED_RETRIEVED', extraMetadata = {} }) {
  const normalizedScope = normalizeScope(scope);
  const cleanProvider = typeof provider === 'string' ? provider.trim().toUpperCase() : '';
  const contentHash = crypto.createHash('sha256').update(canonicalJson(payload ?? null)).digest('hex');
  const extras = extraMetadata && typeof extraMetadata === 'object' && !Array.isArray(extraMetadata)
    ? Object.fromEntries(Object.entries(extraMetadata).filter(([key]) => !RESERVED_AUTHORITY_KEYS.has(key)))
    : {};

  return {
    source: 'MCP_RETRIEVAL',
    metadata: {
      ...extras,
      kind: CONTROLLED_KIND,
      authority: 'SERVER_PROVIDER',
      authorityVersion: AUTHORITY_VERSION,
      evidenceState,
      contentHash,
      provider: cleanProvider,
      scope: normalizedScope,
      evidenceVersion: normalizedScope.evidenceVersion
    }
  };
}

function sameScope(left, right) {
  return left.tenantId === right.tenantId
    && left.workspaceId === right.workspaceId
    && left.marketplace === right.marketplace
    && left.projectId === right.projectId
    && left.evidenceVersion === right.evidenceVersion;
}

function deny(error, message) {
  return { qualifying: false, error, message };
}

function evaluateEvidenceAuthority(evidence, expectedScope) {
  const metadata = parseMetadata(evidence);
  const expected = normalizeScope(expectedScope);
  const actual = normalizeScope(metadata.scope || {});

  if (metadata.kind !== CONTROLLED_KIND) {
    return deny('UNQUALIFIED_EVIDENCE_KIND', 'Evidence kind is not a server-controlled authority artifact.');
  }
  if (evidence?.source !== 'MCP_RETRIEVAL') {
    return deny('UNQUALIFIED_EVIDENCE_SOURCE', 'Only the controlled MCP retrieval path can carry qualifying authority.');
  }
  if (metadata.authority !== 'SERVER_PROVIDER' || metadata.authorityVersion !== AUTHORITY_VERSION) {
    return deny('UNQUALIFIED_EVIDENCE_AUTHORITY', 'Evidence is missing the current server authority binding.');
  }
  if (!ACCEPTABLE_STATES.has(metadata.evidenceState)) {
    return deny('UNQUALIFIED_EVIDENCE_STATE', `Evidence state ${metadata.evidenceState || 'UNKNOWN'} is not qualifying.`);
  }
  if (typeof metadata.contentHash !== 'string' || !/^[a-f0-9]{64}$/i.test(metadata.contentHash)) {
    return deny('UNQUALIFIED_EVIDENCE_HASH', 'Evidence is missing a server-derived SHA-256 content hash.');
  }
  if (!CONTROLLED_PROVIDERS.has(metadata.provider)) {
    return deny('UNQUALIFIED_EVIDENCE_PROVIDER', 'Evidence provider is not on the controlled provider path.');
  }
  if (!expected.tenantId || expected.workspaceId === null || !expected.marketplace || expected.projectId === null || expected.evidenceVersion === null) {
    return deny('INVALID_EXPECTED_SCOPE', 'Authority evaluation requires complete tenant/workspace/marketplace/project/version scope.');
  }
  if (!sameScope(actual, expected) || metadata.evidenceVersion !== expected.evidenceVersion) {
    return deny('EVIDENCE_SCOPE_MISMATCH', 'Evidence authority scope/version does not match the requested project context.');
  }
  return { qualifying: true, error: null, message: 'Server/provider authority binding verified.' };
}

module.exports = {
  AUTHORITY_VERSION,
  CONTROLLED_KIND,
  evaluateEvidenceAuthority,
  sanitizeGenericEvidenceMetadata,
  deriveControlledEvidenceEnvelope,
  normalizeScope,
  canonicalJson
};
