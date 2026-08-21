/**
 * Inventory of every operational route this server registers.
 *
 * This is documentation of intent, not the enforcement mechanism — the
 * actual enforcement is requireAuth/requireRole middleware attached to each
 * route in server.js. tests/route_registry_coverage.test.cjs walks the real
 * Express router stack and cross-checks it against this list in both
 * directions: every route here must exist in the app, and every route in
 * the app must be classified here. That's what stops a newly-added
 * unauthenticated route from silently shipping.
 *
 * `public: true` is the only allowlist for "no requireAuth expected" — it
 * must be justified per-route, not a default.
 */
const ROUTES = [
  { method: 'GET', path: '/api/health', public: true, note: 'health check endpoint for monitoring and reverse proxy probes' },
  { method: 'POST', path: '/api/auth/login', public: true, note: 'login must be reachable unauthenticated' },
  { method: 'POST', path: '/api/auth/logout', public: true, note: 'clears cookie regardless of session validity' },
  { method: 'GET', path: '/api/auth/me', public: false },
  { method: 'POST', path: '/api/auth/reauth', public: false },
  { method: 'GET', path: '/api/owner/users', public: false },
  { method: 'POST', path: '/api/owner/users', public: false },
  { method: 'GET', path: '/api/evidence', public: false },
  { method: 'POST', path: '/api/evidence', public: false },
  { method: 'POST', path: '/api/evidence/:id/accept', public: false },
  { method: 'GET', path: '/api/projects', public: false },
  { method: 'POST', path: '/api/projects', public: false },
  { method: 'PATCH', path: '/api/projects/:id/transition', public: false },
  { method: 'DELETE', path: '/api/reset-database', public: false },
  { method: 'POST', path: '/api/login', public: true, note: 'deprecated, returns 410 Gone' },
  { method: 'POST', path: '/api/listings', public: false },
  { method: 'GET', path: '/api/listings', public: false },
  { method: 'PATCH', path: '/api/listings/:id', public: false },
  { method: 'PATCH', path: '/api/listings/:id/approve', public: false },
  { method: 'GET', path: '/api/listings/:id/export', public: false },
  { method: 'POST', path: '/api/listings/:id/feedback', public: false },
  { method: 'GET', path: '/api/mcp/tools', public: false },
  { method: 'POST', path: '/api/mcp/call', public: false },
  { method: 'GET', path: '/api/mcp/niche', public: false },
  { method: 'POST', path: '/api/mcp/pull-etsy', public: false },
  { method: 'GET', path: '/api/mcp/h10/status', public: false },
  { method: 'GET', path: '/api/mcp/h10/tools', public: false },
  { method: 'GET', path: '/api/google-trends', public: false },
  { method: 'GET', path: '/api/ip-guard/library', public: false },
  { method: 'POST', path: '/api/ip-guard/custom-term', public: false },
  { method: 'GET', path: '/api/settings/llm', public: false },
  { method: 'POST', path: '/api/settings/llm', public: false },
  { method: 'POST', path: '/api/learning/analyze', public: false },
  { method: 'GET', path: '/api/learning/templates', public: false },
  { method: 'DELETE', path: '/api/learning/templates/:id', public: false },
  { method: 'POST', path: '/api/etsy/scan-search', public: false },
  { method: 'POST', path: '/api/etsy/batch-learn', public: false },
  { method: 'POST', path: '/api/amazon/quick-draft', public: false },
  { method: 'GET', path: '/api/master-keywords', public: false },
  { method: 'GET', path: '/api/benchmark/validate', public: false },
  { method: 'POST', path: '/api/upload-h10', public: false },
  { method: 'POST', path: '/api/upload-trends', public: false },
  { method: 'POST', path: '/api/asins/batch', public: false },
  { method: 'GET', path: '/api/analytics-summary', public: false },
  { method: 'GET', path: '/api/trends', public: false },
  { method: 'POST', path: '/api/trends/:id/draft', public: false },
  { method: 'POST', path: '/api/settings/apikey', public: false },
  { method: 'POST', path: '/api/chat', public: false },
  { method: 'GET', path: '/api/analytics', public: false },
  { method: 'GET', path: '/api/agents', public: false },
  { method: 'GET', path: '/api/agents/logs', public: false },
  { method: 'POST', path: '/api/agents/:id/toggle', public: false }
];

module.exports = { ROUTES };
