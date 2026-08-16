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

const SCRYPT_PREFIX = 'scrypt$v1$N=16384,r=8,p=1$';
const COST_N = 16384;
const BLOCK_SIZE_R = 8;
const PARALLELIZATION_P = 1;
const KEY_LEN = 64;
const SALT_LEN = 16;

// Pre-computed dummy salt & hash to run timing-safe comparison on non-existent users
const DUMMY_SALT = '00112233445566778899aabbccddeeff';
const DUMMY_HASH_HEX = crypto.scryptSync('dummy_password_protection', DUMMY_SALT, KEY_LEN, {
  N: COST_N,
  r: BLOCK_SIZE_R,
  p: PARALLELIZATION_P
}).toString('hex');

function hashPassword(plainTextPassword) {
  return new Promise((resolve, reject) => {
    if (!plainTextPassword || typeof plainTextPassword !== 'string') {
      return reject(new Error('Password must be a non-empty string'));
    }
    const saltBuf = crypto.randomBytes(SALT_LEN);
    const saltHex = saltBuf.toString('hex');
    
    crypto.scrypt(plainTextPassword, saltHex, KEY_LEN, {
      N: COST_N,
      r: BLOCK_SIZE_R,
      p: PARALLELIZATION_P
    }, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${SCRYPT_PREFIX}${saltHex}$${derivedKey.toString('hex')}`);
    });
  });
}

function verifyPassword(plainTextPassword, storedHashString) {
  return new Promise((resolve) => {
    if (!storedHashString || typeof storedHashString !== 'string' || !storedHashString.startsWith(SCRYPT_PREFIX)) {
      // Perform dummy work to equalize execution timing
      crypto.scrypt(plainTextPassword || 'dummy', DUMMY_SALT, KEY_LEN, {
        N: COST_N,
        r: BLOCK_SIZE_R,
        p: PARALLELIZATION_P
      }, (err, dummyBuf) => {
        if (!err && dummyBuf) {
          try {
            crypto.timingSafeEqual(dummyBuf, Buffer.from(DUMMY_HASH_HEX, 'hex'));
          } catch (e) {}
        }
        resolve(false);
      });
      return;
    }

    const parts = storedHashString.substring(SCRYPT_PREFIX.length).split('$');
    if (parts.length !== 2) {
      return resolve(false);
    }

    const [saltHex, originalHashHex] = parts;
    const originalHashBuf = Buffer.from(originalHashHex, 'hex');

    crypto.scrypt(plainTextPassword, saltHex, KEY_LEN, {
      N: COST_N,
      r: BLOCK_SIZE_R,
      p: PARALLELIZATION_P
    }, (err, derivedBuf) => {
      if (err || !derivedBuf || derivedBuf.length !== originalHashBuf.length) {
        return resolve(false);
      }

      try {
        const match = crypto.timingSafeEqual(derivedBuf, originalHashBuf);
        resolve(match);
      } catch (e) {
        resolve(false);
      }
    });
  });
}

module.exports = {
  hashPassword,
  verifyPassword
};
