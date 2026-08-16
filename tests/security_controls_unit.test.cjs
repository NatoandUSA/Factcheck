const assert = require('assert');
const { encryptSecret, decryptSecret } = require('../server/security/secretBox');
const { stableStringify, approvalHash } = require('../server/security/approval');

process.env.OMNI_MASTER_KEY = Buffer.alloc(32, 9).toString('base64');

const context = 'tenant-a:workspace-1:openai_api_key';
const encrypted = encryptSecret('sk-unit-secret', context);
assert(encrypted.startsWith('enc:v1:'));
assert(!encrypted.includes('sk-unit-secret'));
assert.strictEqual(decryptSecret(encrypted, context), 'sk-unit-secret');
assert.throws(() => decryptSecret(encrypted, 'tenant-b:workspace-1:openai_api_key'));

const tampered = `${encrypted.slice(0, -2)}AA`;
assert.throws(() => decryptSecret(tampered, context));

const a = { z: 1, nested: { b: 2, a: 1 }, list: [3, 2, 1] };
const b = { list: [3, 2, 1], nested: { a: 1, b: 2 }, z: 1 };
assert.strictEqual(stableStringify(a), stableStringify(b));
assert.strictEqual(approvalHash(a), approvalHash(b));
assert.notStrictEqual(approvalHash(a), approvalHash({ ...a, z: 2 }));

console.log('🟢 SECURITY CONTROLS UNIT: AES-256-GCM context binding, tamper detection, and canonical approval hashing passed');
