/**
 * Authentication & Authorization Express Middleware
 * Production Security Module (server/middleware/auth.js)
 * 
 * Rules:
 * 1. Zero reliance on client-supplied userRole or userId.
 * 2. Parses cookie omni_session / __Host-omni_session strictly.
 * 3. Fails closed with 401 Unauthorized or 403 Forbidden.
 * 4. Exact origin allowlist validation for both CORS and CSRF.
 */

const { COOKIE_NAME, verifySessionRecord } = require('../security/session');
const { inspectClientAuthorityMetadata, evaluateEvidenceAuthority } = require('../evidenceAuthority');

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3001',
  'http://127.0.0.1:3001'
];

// C-03: every declared workflow edge must re-evaluate persisted evidence
// authority before the transition route can execute any stage-specific
// precondition or mutation. Keep this map aligned with the canonical server
// transition DAG; illegal edges are deliberately passed through so the route
// preserves its INVALID_STATE_TRANSITION error contract.
const PROJECT_TRANSITION_EDGES = Object.freeze({
  EVIDENCE_INTAKE: Object.freeze(['RESEARCH_ACCEPTED']),
  RESEARCH_ACCEPTED: Object.freeze(['DNA_ACCEPTED']),
  DNA_ACCEPTED: Object.freeze(['MKL_FROZEN']),
  MKL_FROZEN: Object.freeze(['DRAFT_GENERATED', 'PRODUCT_TRUTH_VERIFIED', 'PRODUCT_TRUTH_CONFIRMED']),
  DRAFT_GENERATED: Object.freeze(['PRODUCT_TRUTH_VERIFIED', 'VALIDATED']),
  PRODUCT_TRUTH_VERIFIED: Object.freeze(['MANAGER_APPROVED']),
  PRODUCT_TRUTH_CONFIRMED: Object.freeze(['DRAFT_GENERATED']),
  VALIDATED: Object.freeze(['MANAGER_APPROVED']),
  MANAGER_APPROVED: Object.freeze(['PUBLISH_READY']),
  PUBLISH_READY: Object.freeze([])
});

function getNormalizedAllowedOrigins() {
  if (process.env.ALLOWED_ORIGINS) {
    const custom = process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
    return new Set(custom);
  }
  return new Set(DEFAULT_ALLOWED_ORIGINS);
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
      // Malformed percent-encoding ignored safely
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

function isDeclaredProjectTransition(currentState, targetState) {
  const allowed = PROJECT_TRANSITION_EDGES[currentState] || [];
  return typeof targetState === 'string' && allowed.includes(targetState);
}

function hasQualifyingAcceptedAuthority(row) {
  try {
    return evaluateEvidenceAuthority(row, {
      tenantId: row?.tenant_id,
      workspaceId: Number(row?.workspace_id),
      marketplace: row?.marketplace,
      projectId: Number(row?.project_id),
      evidenceVersion: 1
    }).qualifying === true;
  } catch (_) {
    return false;
  }
}

function enforceProjectTransitionAuthority(db, req, res, next) {
  if (req.method !== 'PATCH') return next();
  const match = /^\/api\/projects\/(\d+)\/transition$/.exec(req.path || '');
  if (!match) return next();

  const projectId = Number(match[1]);
  const targetState = req.body?.targetState;
  if (!Number.isInteger(projectId) || projectId < 1 || typeof targetState !== 'string') return next();

  // Preserve the route's stronger role-specific error contract for approval
  // stages. C-03 is an authority gate, not a replacement authorization gate.
  if ((targetState === 'MANAGER_APPROVED' || targetState === 'PUBLISH_READY') &&
      !['OWNER', 'MANAGER', 'ADMIN'].includes(req.user?.role)) {
    return next();
  }

  db.get(
    `SELECT state FROM research_projects
     WHERE id = ? AND tenant_id = ? AND workspace_id = ? AND marketplace = ?`,
    [projectId, req.user.tenantId, req.user.workspaceId, req.user.marketplace],
    (projectErr, project) => {
      if (projectErr) return res.status(500).json({ success: false, error: 'DATABASE_ERROR' });
      if (!project || !isDeclaredProjectTransition(project.state, targetState)) return next();

      db.all(
        `SELECT * FROM research_evidence
         WHERE tenant_id = ? AND workspace_id = ? AND marketplace = ?
           AND project_id = ? AND evidence_state = 'ACCEPTED'`,
        [req.user.tenantId, req.user.workspaceId, req.user.marketplace, projectId],
        (evidenceErr, rows) => {
          if (evidenceErr) return res.status(500).json({ success: false, error: 'DATABASE_ERROR' });
          const qualifying = (rows || []).some(hasQualifyingAcceptedAuthority);
          if (!qualifying) {
            return res.status(400).json({
              success: false,
              error: 'MISSING_QUALIFYING_EVIDENCE_PRECONDITION',
              message: 'Cannot advance project workflow without at least 1 qualifying ACCEPTED evidence record bound specifically to this project.'
            });
          }
          next();
        }
      );
    }
  );
}

function requireAuth(db) {
  return function requireAuthMiddleware(req, res, next) {
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
      enforceProjectTransitionAuthority(db, req, res, next);
    });
  };
}

function rejectForgedGenericEvidenceAuthority(req, res) {
  if (req.method !== 'POST' || req.path !== '/api/evidence') return false;
  const inspection = inspectClientAuthorityMetadata(req.body || {});
  if (!inspection.forbidden) return false;
  res.status(400).json({
    success: false,
    error: 'CLIENT_AUTHORITY_METADATA_FORBIDDEN',
    message: 'Reserved authority metadata is server-controlled and forbidden on generic evidence intake.',
    fields: inspection.fields
  });
  return true;
}

function requireRole(allowedRoles) {
  const rolesSet = new Set(Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]);
  return function requireRoleMiddleware(req, res, next) {
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

    // H0-AUTH-01 / C-01: generic evidence clients may choose an operational
    // source, but may not submit authority metadata. This executes before the
    // route handler, so forged requests cannot reach any business persistence.
    if (rejectForgedGenericEvidenceAuthority(req, res)) return;

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

function corsOptionsDelegate(req, callback) {
  const allowedSet = getNormalizedAllowedOrigins();
  const origin = req.headers.origin;
  const isAllowed = origin && allowedSet.has(origin);

  callback(null, {
    origin: isAllowed ? origin : false,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  });
}

module.exports = {
  getNormalizedAllowedOrigins,
  parseCookies,
  extractRawToken,
  requireAuth,
  requireRole,
  requireCsrfOrigin,
  corsOptionsDelegate
};