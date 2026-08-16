/**
 * Scrypt Password Hashing & Verification Utility
 * Production Security Module (server/security/scrypt.js)
 * 
 * Rules:
 * 1. Parameters: N=16384, r=8, p=1, keyLen=64. Salt is random 16-byte buffer.
 * 2. Format: scrypt$v1$N=16384,r=8,p=1$<salt_hex>$<hash_hex>
 * 3. Verification uses crypto.timingSafeEqual.
 * 4. Includes dummy Scrypt work for unknown emails to prevent timing enumeration.
 */

const crypto = require('crypto');
const { promisify } = require('util');

const scryptAsync = promisify(crypto.scrypt);

const SCRYPT_PREFIX = 'scrypt$v1$N=16384,r=8,p=1$';
const COST_N = 16384;
const BLOCK_SIZE_R = 8;
const PARALLELIZATION_P = 1;
const KEY_LEN = 64;
const SALT_LEN = 16;

// Pre-computed dummy hash to run timing-safe comparison on non-existent users
const DUMMY_SALT = crypto.randomBytes(SALT_LEN).toString('hex');
let DUMMY_HASH_HEX = '';

async function initDummyHash() {
  const buf = await scryptAsync('dummy_password_protection', DUMMY_SALT, KEY_LEN, {
    N: COST_N,
    r: BLOCK_SIZE_R,
    p: PARALLELIZATION_P
  });
  DUMMY_HASH_HEX = buf.toString('hex');
}
initDummyHash().catch(() => {});

async function hashPassword(plainTextPassword) {
  if (!plainTextPassword || typeof plainTextPassword !== 'string') {
    throw new Error('Password must be a non-empty string');
  }
  const saltBuf = crypto.randomBytes(SALT_LEN);
  const saltHex = saltBuf.toString('hex');
  const derivedKey = await scryptAsync(plainTextPassword, saltHex, KEY_LEN, {
    N: COST_N,
    r: BLOCK_SIZE_R,
    p: PARALLELIZATION_P
  });
  return `${SCRYPT_PREFIX}${saltHex}$${derivedKey.toString('hex')}`;
}

async function verifyPassword(plainTextPassword, storedHashString) {
  if (!storedHashString || !storedHashString.startsWith(SCRYPT_PREFIX)) {
    // Perform dummy work to equalize execution timing
    if (DUMMY_HASH_HEX) {
      const dummyBuf = await scryptAsync(plainTextPassword || 'dummy', DUMMY_SALT, KEY_LEN, {
        N: COST_N,
        r: BLOCK_SIZE_R,
        p: PARALLELIZATION_P
      });
      crypto.timingSafeEqual(dummyBuf, Buffer.from(DUMMY_HASH_HEX, 'hex'));
    }
    return false;
  }

  const parts = storedHashString.substring(SCRYPT_PREFIX.length).split('$');
  if (parts.length !== 2) {
    return false;
  }

  const [saltHex, originalHashHex] = parts;
  const originalHashBuf = Buffer.from(originalHashHex, 'hex');

  const derivedBuf = await scryptAsync(plainTextPassword, saltHex, KEY_LEN, {
    N: COST_N,
    r: BLOCK_SIZE_R,
    p: PARALLELIZATION_P
  });

  if (derivedBuf.length !== originalHashBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(derivedBuf, originalHashBuf);
}

module.exports = {
  hashPassword,
  verifyPassword
};
