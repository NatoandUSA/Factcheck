/**
 * Authentication & Authorization Express Middleware
 * Production Security Module (server/middleware/auth.js)
 * 
 * Rules:
 * 1. Zero reliance on client-supplied userRole or userId.
 * 2. Parses cookie omni_session / __Host-omni_session strictly.
 * 3. Fails closed with 401 Unauthorized or 403 Forbidden.
 * 4. CSRF Origin validation for state-changing HTTP requests.
 */

const { COOKIE_NAME, verifySessionRecord } = require('../security/session');

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

  const origin = req.headers.origin || req.headers.referer;
  const host = req.headers.host;

  if (!origin || !host) {
    // Fail closed if state-changing request has missing origin/referer in production
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        error: 'CSRF_ORIGIN_MISSING',
        message: 'State-changing requests require valid Origin/Referer header'
      });
    }
    return next();
  }

  try {
    const originUrl = new URL(origin);
    if (originUrl.host !== host) {
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
      message: 'Invalid Origin/Referer header'
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
