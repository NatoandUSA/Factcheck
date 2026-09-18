const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { ROUTES } = require('../server/security/routeRegistry');

const route = ROUTES.find(r => r.path === '/api/market-intelligence/dashboard');
assert(route, 'Market Intelligence route missing from registry');
assert.strictEqual(route.method, 'GET', 'Market Intelligence bridge must stay GET-only');
assert.strictEqual(route.public, false, 'Market Intelligence bridge must require authentication');

const server = fs.readFileSync(path.join(__dirname, '..', 'server', 'server.js'), 'utf8');
const routeBlockStart = server.indexOf("app.get('/api/market-intelligence/dashboard'");
assert(routeBlockStart >= 0, 'Market Intelligence route missing from server');
const routeBlockEnd = server.indexOf("// API: Real-Time Google Trends", routeBlockStart);
const routeBlock = server.slice(routeBlockStart, routeBlockEnd);
assert(routeBlock.includes("requireAuth(db)"), 'Market Intelligence route must require auth');
assert(routeBlock.includes("requireRole(['OWNER', 'MANAGER', 'SELLER'])"), 'Market Intelligence route must be role-gated');
assert(routeBlock.includes("method: 'GET'"), 'Upstream Market Intelligence fetch must be GET-only');
assert(!/method:\s*['"](POST|PUT|PATCH|DELETE)['"]/.test(routeBlock), 'Market Intelligence bridge must never write upstream');

console.log('✅ Market Intelligence server-side read-only boundary contract PASSED');
