const crypto = require('crypto');

const ENVELOPE_PREFIX = 'enc:v1:';

function getMasterKey() {
  const encoded = process.env.OMNI_MASTER_KEY;
  if (!encoded) throw new Error('OMNI_MASTER_KEY is required for encrypted database secrets');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('OMNI_MASTER_KEY must be exactly 32 bytes encoded as base64');
  return key;
}

function encryptSecret(plaintext, context) {
  if (typeof plaintext !== 'string' || plaintext.length === 0 || plaintext.length > 8192) {
    throw new Error('Secret must be a non-empty string of at most 8192 characters');
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getMasterKey(), iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENVELOPE_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

function decryptSecret(envelope, context) {
  if (typeof envelope !== 'string' || !envelope.startsWith(ENVELOPE_PREFIX)) {
    throw new Error('Secret is not stored in the supported encrypted envelope format');
  }
  const parts = envelope.slice(ENVELOPE_PREFIX.length).split(':');
  if (parts.length !== 3) throw new Error('Encrypted secret envelope is malformed');
  const [ivEncoded, tagEncoded, ciphertextEncoded] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', getMasterKey(), Buffer.from(ivEncoded, 'base64'));
  decipher.setAAD(Buffer.from(context, 'utf8'));
  decipher.setAuthTag(Buffer.from(tagEncoded, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextEncoded, 'base64')),
    decipher.final()
  ]).toString('utf8');
}

function maskSecret(secret) {
  return secret ? `••••••••${secret.slice(-4)}` : '';
}

module.exports = { ENVELOPE_PREFIX, encryptSecret, decryptSecret, maskSecret };
