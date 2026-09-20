'use strict';

const assert = require('node:assert/strict');
const {
  VERSION,
  canonicalSerializeArtifact,
  computeArtifactHash,
  buildArtifactIdentity,
  verifyArtifactIdentity
} = require('../server/security/artifactCodec');

let measured = 0;
const check = (name, fn) => {
  fn(); measured += 1; console.log(`PASS ${name}`);
};
const rejects = (value, code) => assert.throws(
  () => canonicalSerializeArtifact(value), error => error.code === code
);

check('versioned deterministic object serialization', () => {
  assert.equal(VERSION, 'OMNISELLER_ARTIFACT_CODEC_V1');
  assert.equal(canonicalSerializeArtifact({ z: 1, a: { y: true, x: 'café' } }),
    '{"a":{"x":"café","y":true},"z":1}');
  assert.equal(canonicalSerializeArtifact({ a: { x: 'cafe\u0301', y: true }, z: 1 }),
    '{"a":{"x":"café","y":true},"z":1}');
});

check('domain-separated golden hash vector', () => {
  const payload = { a: [1, 'two', false], b: null };
  assert.equal(computeArtifactHash('GLOBAL_SIDECAR.TEST', payload),
    'c3462d3b99737364d0927267148d25031828f22d6b2b3c9acd9ac62e51e5bc28');
  assert.notEqual(computeArtifactHash('GLOBAL_SIDECAR.TEST', payload),
    computeArtifactHash('GLOBAL_SIDECAR.OTHER', payload));
});

check('undefined and sparse arrays fail instead of colliding with empty arrays', () => {
  rejects([undefined], 'ARTIFACT_CODEC_UNDEFINED');
  const sparse = new Array(1);
  rejects(sparse, 'ARTIFACT_CODEC_INVALID_ARRAY_SLOT');
  rejects({ value: undefined }, 'ARTIFACT_CODEC_UNDEFINED');
  assert.notEqual(canonicalSerializeArtifact([]), canonicalSerializeArtifact([null]));
});

check('non-finite and negative-zero numbers fail closed', () => {
  for (const value of [Number.NaN, Infinity, -Infinity, -0]) rejects(value, 'ARTIFACT_CODEC_INVALID_NUMBER');
});

check('non-JSON values and object shapes fail closed', () => {
  for (const value of [1n, Symbol('x'), () => true]) rejects(value, 'ARTIFACT_CODEC_UNSUPPORTED_TYPE');
  for (const value of [new Date(), new Map(), Buffer.from('x')]) rejects(value, 'ARTIFACT_CODEC_NON_PLAIN_OBJECT');
  const accessor = {};
  Object.defineProperty(accessor, 'value', { enumerable: true, get: () => 1 });
  rejects(accessor, 'ARTIFACT_CODEC_NON_DATA_PROPERTY');
});

check('cycles and extra array properties fail closed', () => {
  const cyclic = {}; cyclic.self = cyclic;
  rejects(cyclic, 'ARTIFACT_CODEC_CYCLE');
  const array = [1]; array.extra = true;
  rejects(array, 'ARTIFACT_CODEC_NON_JSON_ARRAY_PROPERTY');
});

check('pollution keys and normalized-key collisions fail closed', () => {
  rejects(JSON.parse('{"__proto__":{"polluted":true}}'), 'ARTIFACT_CODEC_FORBIDDEN_KEY');
  rejects({ constructor: 'x' }, 'ARTIFACT_CODEC_FORBIDDEN_KEY');
  const collision = { 'é': 1, 'e\u0301': 2 };
  rejects(collision, 'ARTIFACT_CODEC_KEY_NORMALIZATION_COLLISION');
});

check('identity binds codec, domain, bytes and payload', () => {
  const identity = buildArtifactIdentity('GLOBAL_SIDECAR.PROPOSAL', { members: ['a', 'b'] });
  assert.deepEqual(verifyArtifactIdentity(identity, { members: ['a', 'b'] }), { valid: true, code: 'VALID' });
  assert.deepEqual(verifyArtifactIdentity(identity, { members: ['a', 'c'] }),
    { valid: false, code: 'ARTIFACT_CODEC_IDENTITY_MISMATCH' });
  assert(Object.isFrozen(identity));
});

check('resource limits fail closed', () => {
  assert.throws(() => canonicalSerializeArtifact({ a: { b: 1 } }, { limits: { maxDepth: 1 } }),
    error => error.code === 'ARTIFACT_CODEC_DEPTH_LIMIT');
  assert.throws(() => canonicalSerializeArtifact(['12345'], { limits: { maxBytes: 3 } }),
    error => error.code === 'ARTIFACT_CODEC_BYTE_LIMIT');
  assert.throws(() => canonicalSerializeArtifact([1, 2], { limits: { maxNodes: 2 } }),
    error => error.code === 'ARTIFACT_CODEC_NODE_LIMIT');
});

console.log(`ARTIFACT_CODEC_ACCOUNTING measured=${measured} passed=${measured} failed=0 unexecuted=0`);
