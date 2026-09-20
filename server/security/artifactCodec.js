'use strict';

const crypto = require('node:crypto');
const { types: utilTypes } = require('node:util');

const VERSION = 'OMNISELLER_ARTIFACT_CODEC_V1';
const ALGORITHM = 'sha256';
const DEFAULT_LIMITS = Object.freeze({ maxDepth: 64, maxNodes: 100000, maxBytes: 5 * 1024 * 1024 });
const DOMAIN_RE = /^[A-Z][A-Z0-9_.:-]{0,127}$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function fail(code, path = '$') {
  const error = new Error(code);
  error.code = code;
  error.path = path;
  throw error;
}

function normalizeDomain(domain) {
  if (typeof domain !== 'string' || !DOMAIN_RE.test(domain)) fail('ARTIFACT_CODEC_INVALID_DOMAIN', '$domain');
  return domain;
}

function normalizeLimits(options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...(options.limits || {}) };
  for (const key of Object.keys(DEFAULT_LIMITS)) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] <= 0) fail('ARTIFACT_CODEC_INVALID_LIMIT', `$limits.${key}`);
  }
  return limits;
}

function canonicalSerializeArtifact(value, options = {}) {
  const limits = normalizeLimits(options);
  const active = new WeakSet();
  let nodes = 0;
  let emittedBytes = 0;
  const emit = (text, path) => {
    emittedBytes += Buffer.byteLength(text, 'utf8');
    if (emittedBytes > limits.maxBytes) fail('ARTIFACT_CODEC_BYTE_LIMIT', path);
    return text;
  };

  const encode = (entry, path, depth) => {
    nodes += 1;
    if (nodes > limits.maxNodes) fail('ARTIFACT_CODEC_NODE_LIMIT', path);
    if (depth > limits.maxDepth) fail('ARTIFACT_CODEC_DEPTH_LIMIT', path);
    if (entry === null) return emit('null', path);

    switch (typeof entry) {
      case 'string':
        return emit(JSON.stringify(entry.normalize('NFC')), path);
      case 'boolean':
        return emit(entry ? 'true' : 'false', path);
      case 'number':
        if (!Number.isFinite(entry) || Object.is(entry, -0)) fail('ARTIFACT_CODEC_INVALID_NUMBER', path);
        return emit(JSON.stringify(entry), path);
      case 'undefined':
        fail('ARTIFACT_CODEC_UNDEFINED', path);
        break;
      case 'bigint':
      case 'symbol':
      case 'function':
        fail('ARTIFACT_CODEC_UNSUPPORTED_TYPE', path);
        break;
      default:
        break;
    }

    if (!entry || typeof entry !== 'object') fail('ARTIFACT_CODEC_UNSUPPORTED_TYPE', path);
    // Proxy traps can fabricate prototypes, keys and descriptors. Detect the
    // wrapper with the runtime intrinsic before any reflective traversal.
    if (utilTypes.isProxy(entry)) fail('ARTIFACT_CODEC_PROXY_FORBIDDEN', path);
    if (active.has(entry)) fail('ARTIFACT_CODEC_CYCLE', path);
    active.add(entry);
    try {
      if (Array.isArray(entry)) {
        const ownKeys = Reflect.ownKeys(entry);
        if (ownKeys.some(key => typeof key === 'symbol')) fail('ARTIFACT_CODEC_SYMBOL_KEY', path);
        const expectedKeys = new Set(['length', ...Array.from({ length: entry.length }, (_, index) => String(index))]);
        const items = [];
        emit('[', path);
        for (let index = 0; index < entry.length; index += 1) {
          const descriptor = Object.getOwnPropertyDescriptor(entry, String(index));
          if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
            fail('ARTIFACT_CODEC_INVALID_ARRAY_SLOT', `${path}[${index}]`);
          }
          if (index > 0) emit(',', path);
          items.push(encode(descriptor.value, `${path}[${index}]`, depth + 1));
        }
        if (ownKeys.length !== expectedKeys.size || ownKeys.some(key => !expectedKeys.has(key))) {
          fail('ARTIFACT_CODEC_NON_JSON_ARRAY_PROPERTY', path);
        }
        emit(']', path);
        return `[${items.join(',')}]`;
      }

      const prototype = Object.getPrototypeOf(entry);
      if (prototype !== Object.prototype && prototype !== null) fail('ARTIFACT_CODEC_NON_PLAIN_OBJECT', path);
      const ownKeys = Reflect.ownKeys(entry);
      if (ownKeys.some(key => typeof key === 'symbol')) fail('ARTIFACT_CODEC_SYMBOL_KEY', path);
      const normalized = new Map();
      for (const key of ownKeys) {
        const descriptor = Object.getOwnPropertyDescriptor(entry, key);
        if (!descriptor?.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
          fail('ARTIFACT_CODEC_NON_DATA_PROPERTY', `${path}.${String(key)}`);
        }
        const canonicalKey = String(key).normalize('NFC');
        if (FORBIDDEN_KEYS.has(canonicalKey)) fail('ARTIFACT_CODEC_FORBIDDEN_KEY', `${path}.${canonicalKey}`);
        if (normalized.has(canonicalKey)) fail('ARTIFACT_CODEC_KEY_NORMALIZATION_COLLISION', `${path}.${canonicalKey}`);
        normalized.set(canonicalKey, descriptor.value);
      }
      const parts = [];
      emit('{', path);
      for (const [index, key] of [...normalized.keys()].sort().entries()) {
        if (index > 0) emit(',', path);
        const encodedKey = JSON.stringify(key);
        emit(encodedKey, `${path}.${key}`);
        emit(':', path);
        parts.push(`${encodedKey}:${encode(normalized.get(key), `${path}.${key}`, depth + 1)}`);
      }
      emit('}', path);
      return `{${parts.join(',')}}`;
    } finally {
      active.delete(entry);
    }
  };

  return encode(value, '$', 0);
}

function computeArtifactHash(domain, value, options = {}) {
  const canonicalDomain = normalizeDomain(domain);
  const serialized = canonicalSerializeArtifact(value, options);
  return crypto.createHash(ALGORITHM)
    .update(VERSION, 'utf8').update('\0')
    .update(canonicalDomain, 'utf8').update('\0')
    .update(serialized, 'utf8').digest('hex');
}

function buildArtifactIdentity(domain, value, options = {}) {
  const canonicalDomain = normalizeDomain(domain);
  const serialized = canonicalSerializeArtifact(value, options);
  const hash = crypto.createHash(ALGORITHM)
    .update(VERSION, 'utf8').update('\0')
    .update(canonicalDomain, 'utf8').update('\0')
    .update(serialized, 'utf8').digest('hex');
  return Object.freeze({
    codecVersion: VERSION,
    algorithm: ALGORITHM,
    domain: canonicalDomain,
    hash,
    canonicalBytes: Buffer.byteLength(serialized, 'utf8')
  });
}

function verifyArtifactIdentity(identity, value, options = {}) {
  try {
    if (!identity || identity.codecVersion !== VERSION || identity.algorithm !== ALGORITHM
      || typeof identity.hash !== 'string' || !/^[a-f0-9]{64}$/.test(identity.hash)) {
      return Object.freeze({ valid: false, code: 'ARTIFACT_CODEC_INVALID_IDENTITY' });
    }
    const expected = buildArtifactIdentity(identity.domain, value, options);
    const valid = crypto.timingSafeEqual(Buffer.from(expected.hash, 'hex'), Buffer.from(identity.hash, 'hex'))
      && expected.canonicalBytes === identity.canonicalBytes;
    return Object.freeze({ valid, code: valid ? 'VALID' : 'ARTIFACT_CODEC_IDENTITY_MISMATCH' });
  } catch (error) {
    return Object.freeze({ valid: false, code: error.code || 'ARTIFACT_CODEC_INVALID_VALUE' });
  }
}

module.exports = Object.freeze({
  VERSION,
  ALGORITHM,
  DEFAULT_LIMITS,
  canonicalSerializeArtifact,
  computeArtifactHash,
  buildArtifactIdentity,
  verifyArtifactIdentity
});
