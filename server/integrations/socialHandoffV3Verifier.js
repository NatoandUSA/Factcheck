const crypto = require('node:crypto');
const Ajv2020 = require('ajv/dist/2020').default;

const CODEC_VERSION = 'ECOM_CANONICAL_ARTIFACT_V1';
const HANDOFF_SCHEMA_VERSION = 'OMNISELLER_INTELLIGENCE_HANDOFF_V3';
const HANDOFF_DOMAIN = 'OMNISELLER_HANDOFF_V3';
const MAX_DEPTH = 40;
const MAX_NODES = 20000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_CLOCK_SKEW_MS = 30 * 1000;
const MAX_RECEIPT_LIFETIME_MS = 5 * 60 * 1000;

class SocialHandoffVerificationError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = 'SocialHandoffVerificationError';
    this.code = code;
    this.status = 422;
    this.details = details;
  }
}

function fail(code, details) {
  throw new SocialHandoffVerificationError(code, details);
}

function normalizedString(value, path) {
  const normalized = value.normalize('NFC');
  if (/[\uD800-\uDFFF]/u.test(normalized)) fail('SOCIAL_HANDOFF_INVALID_UNICODE', { path });
  return normalized;
}

function parseCanonicalJson(jsonText, options = {}) {
  if (typeof jsonText !== 'string') fail('SOCIAL_HANDOFF_JSON_TEXT_REQUIRED');
  const maxDepth = options.maxDepth ?? MAX_DEPTH;
  const maxNodes = options.maxNodes ?? MAX_NODES;
  const maxBytes = options.maxBytes ?? MAX_BYTES;
  if (jsonText.length > maxBytes || Buffer.byteLength(jsonText, 'utf8') > maxBytes) {
    fail('SOCIAL_HANDOFF_MAX_BYTES');
  }
  let nodes = 0;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < jsonText.length; index += 1) {
    const character = jsonText[index];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (character === '\\') { escaped = true; continue; }
      if (character === '"') inString = false;
      continue;
    }
    if (character === '"') { nodes += 1; inString = true; }
    else if (character === '{' || character === '[') { nodes += 1; depth += 1; if (depth > maxDepth) fail('SOCIAL_HANDOFF_MAX_DEPTH'); }
    else if (character === '}' || character === ']') depth -= 1;
    else if (character === '-' || /[0-9tfn]/.test(character)) {
      nodes += 1;
      while (index + 1 < jsonText.length && !/[\s,\]}]/.test(jsonText[index + 1])) index += 1;
    }
    if (nodes > maxNodes) fail('SOCIAL_HANDOFF_MAX_NODES');
  }
  let parsed;
  try { parsed = JSON.parse(jsonText); } catch (_) { fail('SOCIAL_HANDOFF_INVALID_JSON'); }
  if (JSON.stringify(parsed) !== jsonText) fail('SOCIAL_HANDOFF_JSON_STRINGIFY_FORM_REQUIRED');
  return parsed;
}

function canonicalValueString(value, options = {}) {
  const state = { chunks: [], bytes: 0, nodes: 0, maxDepth: options.maxDepth ?? MAX_DEPTH,
    maxNodes: options.maxNodes ?? MAX_NODES, maxBytes: options.maxBytes ?? MAX_BYTES };
  const emit = chunk => {
    const bytes = Buffer.byteLength(chunk, 'utf8');
    if (state.bytes + bytes > state.maxBytes) fail('SOCIAL_HANDOFF_MAX_BYTES');
    state.bytes += bytes;
    state.chunks.push(chunk);
  };
  const emitString = (value, path) => {
    if (Buffer.byteLength(value, 'utf8') > state.maxBytes - state.bytes) fail('SOCIAL_HANDOFF_MAX_BYTES', { path });
    emit('"');
    let chunk = '';
    for (const character of value) {
      const code = character.codePointAt(0);
      let encoded = character;
      if (character === '"') encoded = '\\"';
      else if (character === '\\') encoded = '\\\\';
      else if (character === '\b') encoded = '\\b';
      else if (character === '\f') encoded = '\\f';
      else if (character === '\n') encoded = '\\n';
      else if (character === '\r') encoded = '\\r';
      else if (character === '\t') encoded = '\\t';
      else if (code <= 0x1f) encoded = `\\u${code.toString(16).padStart(4, '0')}`;
      if (chunk.length + encoded.length > 4096) { emit(chunk); chunk = ''; }
      chunk += encoded;
    }
    if (chunk) emit(chunk);
    emit('"');
  };
  const visit = (entry, path, depth) => {
    if (depth > state.maxDepth) fail('SOCIAL_HANDOFF_MAX_DEPTH', { path });
    state.nodes += 1;
    if (state.nodes > state.maxNodes) fail('SOCIAL_HANDOFF_MAX_NODES', { path });
    if (entry === null) return emit('null');
    if (typeof entry === 'string') return emitString(normalizedString(entry, path), path);
    if (typeof entry === 'boolean') return emit(entry ? 'true' : 'false');
    if (typeof entry === 'number') {
      if (!Number.isFinite(entry)) fail('SOCIAL_HANDOFF_NON_FINITE_NUMBER', { path });
      if (Object.is(entry, -0)) fail('SOCIAL_HANDOFF_NEGATIVE_ZERO', { path });
      return emit(JSON.stringify(entry));
    }
    if (!entry || typeof entry !== 'object') fail('SOCIAL_HANDOFF_UNSUPPORTED_TYPE', { path });
    if (Array.isArray(entry)) {
      if (entry.length > state.maxNodes - state.nodes) fail('SOCIAL_HANDOFF_MAX_NODES', { path });
      emit('[');
      entry.forEach((item, index) => { if (index) emit(','); visit(item, `${path}[${index}]`, depth + 1); });
      return emit(']');
    }
    const pairs = [];
    const normalizedKeys = new Set();
    const rawKeys = Object.keys(entry);
    if (rawKeys.length > state.maxNodes - state.nodes) fail('SOCIAL_HANDOFF_MAX_NODES', { path });
    for (const rawKey of rawKeys) {
      const key = normalizedString(rawKey, `${path}.<key>`);
      if (normalizedKeys.has(key)) fail('SOCIAL_HANDOFF_DUPLICATE_NORMALIZED_KEY', { path, key });
      normalizedKeys.add(key);
      pairs.push([key, entry[rawKey]]);
    }
    pairs.sort((left, right) => left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0);
    emit('{');
    pairs.forEach(([key, item], index) => {
      if (index) emit(',');
      emitString(key, `${path}.<key>`);
      emit(':');
      visit(item, `${path}.${key}`, depth + 1);
    });
    emit('}');
  };
  visit(value, '$', 0);
  return state.chunks.join('');
}

function canonicalArtifactString(jsonText, options = {}) {
  return canonicalValueString(parseCanonicalJson(jsonText, options), options);
}

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function artifactIdentity(domain, payload, metadata) {
  const canonical = canonicalValueString({ codecVersion: CODEC_VERSION, domain, metadata, payload });
  return { codecVersion: CODEC_VERSION, domain, sha256: sha256(canonical), bytes: Buffer.byteLength(canonical, 'utf8') };
}

function exactDateTime(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function uuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

const schema = require('../contracts/OMNISELLER_HANDOFF_V3.schema.json');
const ajv = new Ajv2020({ allErrors: true, strict: true });
ajv.addFormat('date-time', { type: 'string', validate: exactDateTime });
ajv.addFormat('uuid', { type: 'string', validate: uuid });
const validateSchema = ajv.compile(schema);

function timingSafeHexEqual(left, right) {
  if (!/^[a-f0-9]{64}$/.test(String(left)) || !/^[a-f0-9]{64}$/.test(String(right))) return false;
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function verifySocialHandoffV3(envelopeText, options = {}) {
  const envelope = parseCanonicalJson(envelopeText);
  if (!validateSchema(envelope)) {
    fail('SOCIAL_HANDOFF_SCHEMA_INVALID', { errors: validateSchema.errors.map(error => ({ path: error.instancePath, keyword: error.keyword })) });
  }
  if (envelope.schemaVersion !== HANDOFF_SCHEMA_VERSION) fail('SOCIAL_HANDOFF_SCHEMA_VERSION_INVALID');
  const allowedSha = String(options.allowedSourceSha || '').trim();
  const allowedDeploymentId = String(options.allowedDeploymentId || '').trim();
  if (!/^[a-f0-9]{40}$/.test(allowedSha) || envelope.sourceRelease.gitSha !== allowedSha) {
    fail('SOCIAL_HANDOFF_SOURCE_SHA_REJECTED');
  }
  if (!allowedDeploymentId || envelope.sourceRelease.deploymentId !== allowedDeploymentId) {
    fail('SOCIAL_HANDOFF_DEPLOYMENT_REJECTED');
  }
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const issuedAtMs = Date.parse(envelope.receipt.issuedAt);
  const expiresAtMs = Date.parse(envelope.receipt.expiresAt);
  if (expiresAtMs <= issuedAtMs || expiresAtMs - issuedAtMs > MAX_RECEIPT_LIFETIME_MS) fail('SOCIAL_HANDOFF_RECEIPT_WINDOW_INVALID');
  if (issuedAtMs > now.getTime() + MAX_CLOCK_SKEW_MS) fail('SOCIAL_HANDOFF_RECEIPT_NOT_YET_VALID');
  if (expiresAtMs < now.getTime()) fail('SOCIAL_HANDOFF_RECEIPT_EXPIRED');
  const { receipt, transportDigest, transportDigestAuthority, ...payload } = envelope;
  const { signature, ...unsignedReceipt } = receipt;
  const expectedArtifact = artifactIdentity(HANDOFF_DOMAIN, payload,
    { sourceRevision: payload.sourceRelease.gitSha, issuedAt: receipt.issuedAt });
  if (receipt.artifact.codecVersion !== CODEC_VERSION || receipt.artifact.domain !== HANDOFF_DOMAIN
      || receipt.artifact.bytes !== expectedArtifact.bytes || !timingSafeHexEqual(receipt.artifact.sha256, expectedArtifact.sha256)
      || !timingSafeHexEqual(transportDigest, expectedArtifact.sha256)) {
    fail('SOCIAL_HANDOFF_ARTIFACT_IDENTITY_INVALID');
  }
  for (const promotion of payload.reviewedPromotionQueue) {
    const expectedOpportunity = artifactIdentity('RESEARCH_OPPORTUNITY_V2', promotion.opportunityArtifact,
      promotion.opportunityArtifactMetadata);
    if (promotion.opportunityArtifactIdentity.codecVersion !== CODEC_VERSION
        || promotion.opportunityArtifactIdentity.domain !== 'RESEARCH_OPPORTUNITY_V2'
        || promotion.opportunityArtifactIdentity.bytes !== expectedOpportunity.bytes
        || !timingSafeHexEqual(promotion.opportunityArtifactIdentity.sha256, expectedOpportunity.sha256)
        || !timingSafeHexEqual(promotion.opportunityArtifactHash, expectedOpportunity.sha256)) {
      fail('SOCIAL_HANDOFF_PROMOTION_ARTIFACT_INVALID', { promotionId: promotion.promotionId });
    }
  }
  const secret = String(options.secret || '');
  if (!secret) fail('SOCIAL_HANDOFF_SECRET_MISSING');
  const signatureInput = canonicalArtifactString(JSON.stringify({ payload, receipt: unsignedReceipt,
    transportDigest, transportDigestAuthority }));
  const expectedSignature = crypto.createHmac('sha256', secret).update(signatureInput, 'utf8').digest('hex');
  if (!timingSafeHexEqual(signature, expectedSignature)) fail('SOCIAL_HANDOFF_SIGNATURE_INVALID');
  return Object.freeze({ envelope, payload, envelopeHash: sha256(envelopeText), artifact: expectedArtifact,
    nonce: receipt.nonce, issuedAt: receipt.issuedAt, expiresAt: receipt.expiresAt, signature });
}

module.exports = Object.freeze({ CODEC_VERSION, HANDOFF_SCHEMA_VERSION, HANDOFF_DOMAIN, MAX_BYTES,
  SocialHandoffVerificationError, canonicalArtifactString, artifactIdentity, verifySocialHandoffV3 });
