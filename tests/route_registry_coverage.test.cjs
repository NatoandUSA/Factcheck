/**
 * Fails the build if any /api/* route is either:
 *   (a) missing requireAuthMiddleware in its actual Express middleware stack
 *       while not explicitly marked `public: true` in the route registry, or
 *   (b) registered in the app but absent from the route registry, or
 *   (c) listed in the route registry but no longer registered in the app.
 *
 * This walks the real Express router stack rather than trusting the
 * registry's claims — the registry can go stale, this test cannot, because
 * it inspects the actual middleware functions attached to each route.
 */
process.env.NODE_ENV = 'test';
const assert = require('assert');
const { ROUTES } = require('../server/security/routeRegistry');

function collectApiRoutes(app) {
  const stack = app._router?.stack || app.router?.stack || [];
  const routes = [];
  for (const layer of stack) {
    if (!layer.route || typeof layer.route.path !== 'string') continue;
    if (!layer.route.path.startsWith('/api/')) continue;
    const methods = Object.keys(layer.route.methods).filter(m => layer.route.methods[m]);
    const middlewareNames = layer.route.stack.map(s => s.name);
    for (const method of methods) {
      routes.push({
        method: method.toUpperCase(),
        path: layer.route.path,
        hasRequireAuth: middlewareNames.includes('requireAuthMiddleware')
      });
    }
  }
  return routes;
}

async function main() {
  const { app } = require('../server/server.js');
  const actualRoutes = collectApiRoutes(app);

  assert(actualRoutes.length > 0, 'No /api/* routes discovered — router stack introspection may be broken for this Express version');

  const registryKey = (r) => `${r.method} ${r.path}`;
  const registryMap = new Map(ROUTES.map(r => [registryKey(r), r]));
  const actualKeys = new Set(actualRoutes.map(registryKey));

  const missingFromRegistry = actualRoutes.filter(r => !registryMap.has(registryKey(r)));
  assert.strictEqual(
    missingFromRegistry.length, 0,
    `Route(s) registered in server.js but missing from server/security/routeRegistry.js — classify them:\n` +
    missingFromRegistry.map(r => `  ${r.method} ${r.path}`).join('\n')
  );

  const staleInRegistry = ROUTES.filter(r => !actualKeys.has(registryKey(r)));
  assert.strictEqual(
    staleInRegistry.length, 0,
    `Route(s) in routeRegistry.js no longer registered in server.js — remove them:\n` +
    staleInRegistry.map(r => `  ${r.method} ${r.path}`).join('\n')
  );

  const shouldBeAuthed = actualRoutes.filter(r => {
    const entry = registryMap.get(registryKey(r));
    return entry && !entry.public;
  });
  const unauthed = shouldBeAuthed.filter(r => !r.hasRequireAuth);
  assert.strictEqual(
    unauthed.length, 0,
    `Route(s) classified as non-public but have no requireAuthMiddleware in their actual middleware stack:\n` +
    unauthed.map(r => `  ${r.method} ${r.path}`).join('\n')
  );

  console.log(`Route registry coverage: ${actualRoutes.length} routes discovered, ${shouldBeAuthed.length} classified non-public, all carry requireAuthMiddleware.`);
  console.log('✅ tests/route_registry_coverage.test.cjs PASSED CLEANLY!');
  process.exit(0);
}

main().catch(err => {
  console.error('🔴 ROUTE REGISTRY COVERAGE FAILED:', err.message);
  process.exit(1);
});
