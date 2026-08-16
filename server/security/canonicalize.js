/**
 * Canonical Approval Payload Serializer & SHA-256 Hasher
 * Production Security Module (server/security/canonicalize.js)
 * 
 * Rules:
 * 1. Omit volatile metadata keys (id, dbId, status, timestamps, version fields).
 * 2. Recursively sort all object keys lexicographically.
 * 3. Normalize all strings using Unicode NFC (String.prototype.normalize('NFC')).
 * 4. Serialize using JSON.stringify().
 */

const crypto = require('crypto');

const VOLATILE_KEYS = new Set([
  'id',
  'dbId',
  'status',
  'created_at',
  'updated_at',
  'approved_by',
  'approved_at',
  'approved_hash',
  'approved_version',
  'listing_version'
]);

function canonicalizeValue(val) {
  if (val === null || val === undefined) {
    return null;
  }
  if (typeof val === 'string') {
    return val.normalize('NFC');
  }
  if (typeof val === 'number' || typeof val === 'boolean') {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(canonicalizeValue);
  }
  if (typeof val === 'object') {
    const sortedKeys = Object.keys(val)
      .filter(k => !VOLATILE_KEYS.has(k))
      .sort();
    
    const sortedObj = {};
    for (const key of sortedKeys) {
      sortedObj[key] = canonicalizeValue(val[key]);
    }
    return sortedObj;
  }
  return String(val).normalize('NFC');
}

function canonicalSerialize(payload) {
  const canonicalObj = canonicalizeValue(payload);
  return JSON.stringify(canonicalObj);
}

function computePayloadHash(payload) {
  const canonicalString = canonicalSerialize(payload);
  return crypto.createHash('sha256').update(canonicalString).digest('hex');
}

module.exports = {
  canonicalSerialize,
  computePayloadHash,
  VOLATILE_KEYS
};
