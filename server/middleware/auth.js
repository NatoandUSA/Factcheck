/**
 * Authentication & Authorization Express Middleware
 * Production Security Module (server/middleware/auth.js)
 * 
 * Rules:
 * 1. Zero reliance on client-supplied userRole or userId.
 * 2. Parses cookie omni_session / __Host-omni_session strictly.
 * 3. Fails closed with 401 Unauthorized or 403 Forbidden.
 * 4. Exact origin allowlist validation for state-changing HTTP requests.
 */

const { COOKIE_NAME, verifySessionRecord } = require('../security/session');

const DEFAULT_ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3001',
  'http://127.0.0.1:3001'
]);

function getNormalizedAllowedOrigins() {
  if (process.env.ALLOWED_ORIGINS) {
    const custom = process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
    return new Set(custom);
  }
  return DEFAULT_ALLOWED_ORIGINS;
}

function parseCookies(cookieHeader) {
  const list = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return list;
  cookieHeader.split(';').forEach(cookie => {
    let [name, ...rest] = cookie.split('=');
    name = name?.trim();
    if (!name) return;
    const value = rest.join('=').trim();
    if (!value) return;
    try {
      list[name] = decodeURIComponent(value);
    } catch (e) {
      // Malformed percent-encoding ignored
    }
  });
  return list;
}

function extractRawToken(req) {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[COOKIE_NAME]) {
    return cookies[COOKIE_NAME];
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

function requireCsrfOrigin(req, res, next) {
  const method = req.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return next();
  }

  const originHeader = req.headers.origin || req.headers.referer;
  if (!originHeader) {
    return res.status(403).json({
      success: false,
      error: 'CSRF_ORIGIN_MISSING',
      message: 'State-changing requests require valid Origin or Referer header'
    });
  }

  try {
    const originUrl = new URL(originHeader);
    const originNormalized = `${originUrl.protocol}//${originUrl.host}`;
    const allowedSet = getNormalizedAllowedOrigins();

    // Strictly validate against allowed origin set in all environments
    if (!allowedSet.has(originNormalized)) {
      return res.status(403).json({
        success: false,
        error: 'CSRF_ORIGIN_MISMATCH',
        message: 'Cross-site request blocked by CSRF policy'
      });
    }

  } catch (e) {
    return res.status(403).json({
      success: false,
      error: 'CSRF_ORIGIN_INVALID',
      message: 'Invalid Origin or Referer header'
    });
  }

  next();
}

module.exports = {
  parseCookies,
  extractRawToken,
  requireAuth,
  requireRole,
  requireCsrfOrigin
};
