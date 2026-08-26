const crypto = require('crypto');

const AUTHORITY_VERSION = 'H0_V1_4';
const CONTROLLED_KIND = 'SMART_PULL_ARTIFACT_V1';
const GENERIC_KIND = 'GENERIC_RESEARCH_ARTIFACT_V1';
const ACCEPTABLE_STATES = new Set(['RETRIEVED_NO_OBSERVED_AT', 'VERIFIED_RETRIEVED']);
const CONTROLLED_PROVIDERS = new Set(['YTRENDS_MCP', 'H10_MCP']);

const RESERVED_AUTHORITY_FIELDS = Object.freeze([
  'kind',
  'source',
  'evidenceState',
  'contentHash',
  'authority',
  'eligible',
  'verified',
  'provider',
  'acceptanceEligibility',
  'accepted_at',
  'accepted_by',
  'tier',
  'authorityVersion',
  'scope',
  'tenantId',
  'workspaceId',
  'marketplace',
  'projectId',
  'evidenceVersion',
  'tamperState',
  'providerPayload'
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

function normalizeAuthorityKey(key) {
  return String(key || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

const RESERVED_AUTHORITY_KEY_TOKENS = new Set(RESERVED_AUTHORITY_FIELDS.map(normalizeAuthorityKey));

function parseStructuredMetadata(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

function collectReservedKeys(value, path, findings, seen = new Set()) {
  const structured = parseStructuredMetadata(value);
  if (!structured) return;
  if (seen.has(structured)) return;
  seen.add(structured);

  if (Array.isArray(structured)) {
    structured.forEach((entry, index) => collectReservedKeys(entry, `${path}[${index}]`, findings, seen));
    return;
  }

  for (const [key, nested] of Object.entries(structured)) {
    if (RESERVED_AUTHORITY_KEY_TOKENS.has(normalizeAuthorityKey(key))) {
      findings.push(`${path}.${key}`);
    }
    collectReservedKeys(nested, `${path}.${key}`, findings, seen);
  }
}

function inspectClientAuthorityMetadata(body) {
  const source = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const findings = [];

  for (const [key, value] of Object.entries(source)) {
    if (key === 'metadata') {
      collectReservedKeys(value, 'metadata', findings);
      continue;
    }

    // `source` is an operational top-level field on /api/evidence. Every other
    // authority-shaped top-level key (including Source/SOURCE confusables) is forbidden.
    if (key !== 'source' && RESERVED_AUTHORITY_KEY_TOKENS.has(normalizeAuthorityKey(key))) {
      findings.push(`body.${key}`);
    }
  }

  return {
    forbidden: findings.length > 0,
    fields: [...new Set(findings)]
  };
}

function createClientAuthorityMetadataError(fields = []) {
  const error = new Error('Client-supplied authority metadata is forbidden on generic evidence intake.');
  error.code = 'CLIENT_AUTHORITY_METADATA_FORBIDDEN';
  error.status = 400;
  error.fields = [...fields];
  return error;
}

function sanitizeGenericEvidenceMetadata(input) {
  const structured = parseStructuredMetadata(input);
  const source = structured && !Array.isArray(structured) ? structured : {};
  const inspection = inspectClientAuthorityMetadata({ metadata: source });
  if (inspection.forbidden) throw createClientAuthorityMetadataError(inspection.fields);
  return {
    kind: GENERIC_KIND,
    authority: 'NON_AUTHORITY',
    clientMetadata: canonicalize(source)
  };
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
  const parsed = parseStructuredMetadata(evidence.metadata);
  return parsed && !Array.isArray(parsed) ? parsed : {};
}

function deriveControlledEvidenceEnvelope({ provider, payload, scope, evidenceState = 'VERIFIED_RETRIEVED', extraMetadata = {} }) {
  const normalizedScope = normalizeScope(scope);
  const cleanProvider = typeof provider === 'string' ? provider.trim().toUpperCase() : '';
  const providerPayload = canonicalize(payload ?? null);
  const contentHash = crypto.createHash('sha256').update(canonicalJson(providerPayload)).digest('hex');
  const extras = extraMetadata && typeof extraMetadata === 'object' && !Array.isArray(extraMetadata)
    ? Object.fromEntries(Object.entries(extraMetadata).filter(([key]) => !RESERVED_AUTHORITY_KEY_TOKENS.has(normalizeAuthorityKey(key))))
    : {};

  return {
    source: 'MCP_RETRIEVAL',
    metadata: {
      providerMetadata: canonicalize(extras),
      kind: CONTROLLED_KIND,
      authority: 'SERVER_PROVIDER',
      authorityVersion: AUTHORITY_VERSION,
      evidenceState,
      contentHash,
      provider: cleanProvider,
      providerPayload,
      tamperState: 'CLEAN',
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
    return deny('UNQUALIFIED_EVIDENCE_AUTHORITY', 'Evidence is missing the current server authority binding/version.');
  }
  if (!ACCEPTABLE_STATES.has(metadata.evidenceState)) {
    return deny('UNQUALIFIED_EVIDENCE_STATE', `Evidence state ${metadata.evidenceState || 'UNKNOWN'} is not qualifying.`);
  }
  if (!CONTROLLED_PROVIDERS.has(metadata.provider)) {
    return deny('UNQUALIFIED_EVIDENCE_PROVIDER', 'Evidence provider is not on the controlled provider path.');
  }
  if (metadata.tamperState !== 'CLEAN') {
    return deny('EVIDENCE_TAMPER_STATE_INVALID', 'Evidence tamper state is not clean.');
  }
  if (!Object.prototype.hasOwnProperty.call(metadata, 'providerPayload')) {
    return deny('UNQUALIFIED_EVIDENCE_HASH_PAYLOAD', 'Evidence is missing persisted server hash material.');
  }
  const recomputedHash = crypto.createHash('sha256').update(canonicalJson(metadata.providerPayload)).digest('hex');
  if (typeof metadata.contentHash !== 'string' || !/^[a-f0-9]{64}$/i.test(metadata.contentHash) || metadata.contentHash.toLowerCase() !== recomputedHash) {
    return deny('EVIDENCE_CONTENT_HASH_MISMATCH', 'Persisted evidence payload no longer matches the server-derived content hash.');
  }
  if (!expected.tenantId || expected.workspaceId === null || !expected.marketplace || expected.projectId === null || expected.evidenceVersion === null) {
    return deny('INVALID_EXPECTED_SCOPE', 'Authority evaluation requires complete tenant/workspace/marketplace/project/version scope.');
  }
  if (!sameScope(actual, expected) || metadata.evidenceVersion !== expected.evidenceVersion) {
    return deny('EVIDENCE_SCOPE_MISMATCH', 'Evidence authority scope/version does not match the requested project context.');
  }
  return { qualifying: true, error: null, message: 'Server/provider authority binding and content integrity verified.' };
}

module.exports = {
  AUTHORITY_VERSION,
  CONTROLLED_KIND,
  GENERIC_KIND,
  RESERVED_AUTHORITY_FIELDS,
  evaluateEvidenceAuthority,
  inspectClientAuthorityMetadata,
  createClientAuthorityMetadataError,
  sanitizeGenericEvidenceMetadata,
  deriveControlledEvidenceEnvelope,
  normalizeScope,
  normalizeAuthorityKey,
  canonicalJson
};
