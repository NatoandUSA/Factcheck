/**
 * Authentication & Authorization Express Middleware
 * Production Security Module (server/middleware/auth.js)
 * 
 * Rules:
 * 1. Zero reliance on client-supplied userRole or userId.
 * 2. Parses cookie omni_session / __Host-omni_session or Authorization Bearer header.
 * 3. Sets req.user = { userId, email, workspaceId, tenantId, marketplace, role }.
 * 4. Fails closed with 401 Unauthorized or 403 Forbidden.
 */

const { COOKIE_NAME, verifySessionRecord } = require('../security/session');

function parseCookies(cookieHeader) {
  const list = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    let [name, ...rest] = cookie.split('=');
    name = name?.trim();
    if (!name) return;
    const value = rest.join('=').trim();
    if (!value) return;
    list[name] = decodeURIComponent(value);
  });
  return list;
}

function extractRawToken(req) {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[COOKIE_NAME]) {
    return cookies[COOKIE_NAME];
  }
  // Fallback for dev/Bearer
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  return null;
}

function requireAuth(db) {
  return function(req, res, next) {
    const rawToken = extractRawToken(req);

    if (!rawToken) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHENTICATED',
        message: 'Authentication session required'
      });
    }

    verifySessionRecord(db, rawToken, (err, principal) => {
      if (err || !principal) {
        return res.status(401).json({
          success: false,
          error: 'INVALID_SESSION',
          message: 'Session is invalid, expired, or revoked'
        });
      }

      req.user = principal;
      next();
    });
  };
}

function requireRole(allowedRoles) {
  const rolesSet = new Set(Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]);
  return function(req, res, next) {
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHENTICATED',
        message: 'Authentication context missing'
      });
    }

    if (!rolesSet.has(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: `Role ${req.user.role} does not have required permission`
      });
    }

    next();
  };
}

module.exports = {
  parseCookies,
  extractRawToken,
  requireAuth,
  requireRole
};
