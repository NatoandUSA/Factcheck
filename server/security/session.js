/**
 * Opaque Session Token & Database Lifecycle Management
 * Production Security Module (server/security/session.js)
 * 
 * Rules:
 * 1. Generate 32-byte cryptographically secure random raw token buffer.
 * 2. Store only SHA-256 token_hash in database. Raw token is sent in cookie only.
 * 3. Cookie name: omni_session (or __Host-omni_session in HTTPS production).
 */

const crypto = require('crypto');

const COOKIE_NAME = process.env.NODE_ENV === 'production' ? '__Host-omni_session' : 'omni_session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 Hours

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function generateRawToken() {
  return crypto.randomBytes(32).toString('hex');
}

function createSessionRecord(db, userId, workspaceId, tenantId, callback) {
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  const query = `
    INSERT INTO sessions (token_hash, user_id, workspace_id, expires_at)
    VALUES (?, ?, ?, ?)
  `;

  db.run(query, [tokenHash, userId, workspaceId, expiresAt], function(err) {
    if (err) {
      return callback(err);
    }
    callback(null, {
      sessionId: this.lastID,
      rawToken,
      tokenHash,
      expiresAt
    });
  });
}

function verifySessionRecord(db, rawToken, callback) {
  if (!rawToken || typeof rawToken !== 'string') {
    return callback(null, null);
  }

  const tokenHash = hashToken(rawToken);
  const nowIso = new Date().toISOString();

  const query = `
    SELECT 
      s.id as session_id,
      s.user_id,
      s.workspace_id,
      s.expires_at,
      u.email,
      u.name,
      wm.role,
      wm.status as membership_status,
      w.tenant_id,
      w.marketplace
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    JOIN workspace_memberships wm ON wm.user_id = s.user_id AND wm.workspace_id = s.workspace_id
    JOIN workspaces w ON w.id = s.workspace_id
    WHERE s.token_hash = ?
      AND s.revoked_at IS NULL
      AND s.expires_at > ?
      AND wm.status = 'ACTIVE'
  `;

  db.get(query, [tokenHash, nowIso], (err, row) => {
    if (err || !row) {
      return callback(err, null);
    }

    // Touch last_seen_at asynchronously
    db.run(`UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?`, [row.session_id], () => {});

    callback(null, {
      sessionId: row.session_id,
      userId: row.user_id,
      email: row.email,
      name: row.name,
      workspaceId: row.workspace_id,
      tenantId: row.tenant_id,
      marketplace: row.marketplace,
      role: row.role
    });
  });
}

function revokeSessionRecord(db, rawToken, callback) {
  if (!rawToken) {
    return callback(null, false);
  }
  const tokenHash = hashToken(rawToken);
  const query = `UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ? AND revoked_at IS NULL`;
  db.run(query, [tokenHash], function(err) {
    if (err) {
      return callback(err, false);
    }
    callback(null, this.changes > 0);
  });
}

module.exports = {
  COOKIE_NAME,
  SESSION_TTL_MS,
  hashToken,
  generateRawToken,
  createSessionRecord,
  verifySessionRecord,
  revokeSessionRecord
};
