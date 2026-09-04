// H0-A: policy derived from GOLDEN_RULES sections 8/11/12.
// Selectively reworked from PR25@078533d; no transition map is transplanted.
const crypto = require('crypto');
const AUTHORITY_VERSION = 'H0_V1';
const CONTROLLED_KIND = 'SMART_PULL_ARTIFACT_V1';
const PROVIDER_CONTROLLED_SOURCES = Object.freeze(['MCP_RETRIEVAL', 'ETSY_MCP_LIVE']);
const providerControlledSources = new Set(PROVIDER_CONTROLLED_SOURCES);
const RESERVED_AUTHORITY_FIELDS = Object.freeze([
  'kind', 'source', 'evidenceState', 'contentHash', 'authority', 'eligible',
  'verified', 'provider', 'acceptanceEligibility', 'accepted_at', 'accepted_by',
  'tier', 'authorityVersion', 'scope', 'tenantId', 'workspaceId', 'marketplace',
  'projectId', 'evidenceVersion', 'revoked', 'superseded', 'revokedAt', 'supersededBy', 'bindingHash'
]);
const normalizeAuthorityKey = key => String(key).normalize('NFKC').toLowerCase().replace(/[\s_-]+/g, '');
const reserved = new Set(RESERVED_AUTHORITY_FIELDS.map(normalizeAuthorityKey));
const pollution = new Set(['__proto__', 'prototype', 'constructor'].map(normalizeAuthorityKey));
const operational = new Set(['projectId', 'seedPhrase', 'source', 'sourceUrl', 'fileName', 'metadata']);

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
}
const hash = value => crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');

function inspectClientAuthorityMetadata(body) {
  const fields = [];
  let invalid = false, nodes = 0;
  function visit(value, path, depth) {
    if (++nodes > 2000 || depth > 16) { invalid = true; return; }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try { visit(JSON.parse(trimmed), path, depth + 1); } catch (_) { invalid = true; }
      }
      return;
    }
    if (value === null || typeof value === 'boolean' || typeof value === 'number') return;
    if (!value || typeof value !== 'object') { invalid = true; return; }
    for (const [key, entry] of Object.entries(value)) {
      const token = normalizeAuthorityKey(key);
      if (reserved.has(token) || pollution.has(token)) fields.push(path + '.' + key);
      visit(entry, path + '.' + key, depth + 1);
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid = true;
  else {
    if (Buffer.byteLength(JSON.stringify(body)) > 32768) invalid = true;
    for (const [key, value] of Object.entries(body)) {
      if (key === 'metadata') {
        if (!value || typeof value !== 'object' || Array.isArray(value)) invalid = true;
        visit(value, key, 0);
      } else if (!operational.has(key)) {
        const token = normalizeAuthorityKey(key);
        if (reserved.has(token) || pollution.has(token)) fields.push(key);
        visit(value, key, 0);
      }
    }
    if (typeof body.source === 'string' && providerControlledSources.has(body.source.trim().toUpperCase())) fields.push('source');
  }
  return { forbidden: fields.length > 0, invalid, fields };
}

function sanitizeGenericEvidenceMetadata(metadata = {}) {
  const inspection = inspectClientAuthorityMetadata({ metadata });
  if (inspection.forbidden || inspection.invalid) throw new Error('CLIENT_AUTHORITY_METADATA_FORBIDDEN');
  return { kind: 'GENERIC_NON_AUTHORITY_V1', authority: 'NONE', clientAnnotations: metadata };
}

function normalizeScope(scope = {}) {
  return { tenantId: scope.tenantId, workspaceId: scope.workspaceId,
    marketplace: scope.marketplace, projectId: scope.projectId, evidenceVersion: scope.evidenceVersion };
}
function validScope(s) {
  return typeof s.tenantId === 'string' && s.tenantId.length > 0
    && Number.isSafeInteger(s.workspaceId) && s.workspaceId > 0
    && ['AMAZON', 'ETSY'].includes(s.marketplace)
    && Number.isSafeInteger(s.projectId) && s.projectId > 0 && s.evidenceVersion === 1;
}
function deriveControlledEvidenceEnvelope({ provider, payload, scope, evidenceState = 'VERIFIED_RETRIEVED', extraMetadata = {} }) {
  const boundScope = normalizeScope(scope);
  if (!validScope(boundScope) || !['YTRENDS_MCP', 'H10_MCP'].includes(provider) || payload === undefined) throw new Error('INVALID_PROVIDER_ENVELOPE');
  const metadata = JSON.parse(JSON.stringify({
    ...extraMetadata, kind: CONTROLLED_KIND, authority: 'SERVER_PROVIDER',
    authorityVersion: AUTHORITY_VERSION, provider, evidenceState,
    scope: boundScope, evidenceVersion: 1,
    canonicalPayload: payload, contentHash: hash(payload)
  }));
  // Bind the persisted projection too: tampering with response/listings must
  // not qualify merely because the raw provider payload remains unchanged.
  delete metadata.bindingHash;
  metadata.bindingHash = hash(metadata);
  return { source: 'MCP_RETRIEVAL', metadata };
}
function evaluateEvidenceAuthority(evidence, expectedScope) {
  const deny = error => ({ qualifying: false, error, message: error });
  let m;
  try { m = typeof evidence?.metadata === 'string' ? JSON.parse(evidence.metadata) : evidence?.metadata; }
  catch (_) { return deny('UNQUALIFIED_EVIDENCE_KIND'); }
  if (!m || Array.isArray(m) || m.kind !== CONTROLLED_KIND) return deny('UNQUALIFIED_EVIDENCE_KIND');
  if (evidence.source !== 'MCP_RETRIEVAL' || m.authority !== 'SERVER_PROVIDER' || m.authorityVersion !== AUTHORITY_VERSION) return deny('UNQUALIFIED_EVIDENCE_AUTHORITY');
  if (!['YTRENDS_MCP', 'H10_MCP'].includes(m.provider)) return deny('UNQUALIFIED_EVIDENCE_PROVIDER');
  if (!['VERIFIED_RETRIEVED', 'RETRIEVED_NO_OBSERVED_AT'].includes(m.evidenceState)
      || m.revoked || m.revokedAt || m.superseded || m.supersededBy
      || ['REVOKED', 'SUPERSEDED', 'REJECTED'].includes(evidence.evidence_state)) return deny('UNQUALIFIED_EVIDENCE_STATE');
  const expected = normalizeScope(expectedScope);
  if (!validScope(expected) || !m.scope || canonicalJson(normalizeScope(m.scope)) !== canonicalJson(expected)
      || m.evidenceVersion !== 1) return deny('EVIDENCE_SCOPE_MISMATCH');
  if ((expected.marketplace === 'ETSY' && m.provider !== 'YTRENDS_MCP')
      || (expected.marketplace === 'AMAZON' && m.provider !== 'H10_MCP')) return deny('UNQUALIFIED_EVIDENCE_PROVIDER');
  if (m.canonicalPayload === undefined || typeof m.contentHash !== 'string' || hash(m.canonicalPayload) !== m.contentHash) return deny('UNQUALIFIED_EVIDENCE_HASH');
  const { bindingHash, ...bound } = m;
  if (typeof bindingHash !== 'string' || hash(bound) !== bindingHash) return deny('UNQUALIFIED_EVIDENCE_HASH');
  return { qualifying: true, error: null };
}
module.exports = { AUTHORITY_VERSION, CONTROLLED_KIND, PROVIDER_CONTROLLED_SOURCES, RESERVED_AUTHORITY_FIELDS,
  normalizeAuthorityKey, normalizeScope, canonicalJson, canonicalHash: hash, inspectClientAuthorityMetadata,
  sanitizeGenericEvidenceMetadata, deriveControlledEvidenceEnvelope, evaluateEvidenceAuthority };
