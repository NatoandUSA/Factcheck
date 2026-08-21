const assert = require('assert');
const http = require('http');

process.env.NODE_ENV = 'test';

const { app, db, databaseReady } = require('../server/server');
const { createRateLimiter } = require('../server/security/rateLimiter');

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}

async function waitForTestFixtures(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await dbAll(`
      SELECT u.id as user_id, u.email, w.tenant_id, wm.workspace_id, wm.role, w.marketplace
      FROM workspace_memberships wm
      JOIN users u ON u.id = wm.user_id
      JOIN workspaces w ON w.id = wm.workspace_id
      ORDER BY wm.workspace_id
    `);
    if (rows.length >= 2) return rows;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for test fixtures');
}

async function runLoginRateLimiterHttpTest() {
  await databaseReady;
  const fixtures = await waitForTestFixtures();
  const ownerFixture = fixtures.find(f => f.role === 'OWNER' && f.marketplace === 'AMAZON');

  console.log('================================================================');
  console.log('  TESTING LOGIN RATE LIMITER HTTP INTEGRATION SUITE (FAILONLY)');
  console.log('================================================================\n');

  // Create an explicit router endpoint for rate limit HTTP verification with low quota (3 hits)
  const strictLoginLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    maxHits: 3,
    failOnly: true,
    ignoreTestEnv: false, // Explicitly enforce in test mode
    message: 'Thao tác quá nhiều lần. Vui lòng thử lại sau 1 phút.'
  });

  app.post('/api/test-rate-limit/login', strictLoginLimiter, (req, res) => {
    const { password } = req.body || {};
    if (password === 'password123') {
      return res.status(200).json({ success: true, message: 'Logged in' });
    }
    return res.status(401).json({ success: false, error: 'INVALID_CREDENTIALS' });
  });

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const origin = { Origin: `http://127.0.0.1:${port}` };
  process.env.ALLOWED_ORIGINS = `http://127.0.0.1:${port},http://localhost:${port}`;

  try {
    // 1. Successful Logins must NOT consume quota
    console.log('Test 1: 5 Successful Logins (must NOT consume quota)...');
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${baseUrl}/api/test-rate-limit/login`, {
        method: 'POST',
        headers: { ...origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ownerFixture.email, password: 'password123' })
      });
      assert.strictEqual(res.status, 200, `Successful login ${i+1} failed with status ${res.status}`);
    }
    console.log('  🟢 5 successful logins completed with HTTP 200 without triggering 429.');

    // 2. Failed Logins consume quota (Hits 1, 2, 3)
    console.log('\nTest 2: 3 Failed Logins (consuming maxHits quota of 3)...');
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${baseUrl}/api/test-rate-limit/login`, {
        method: 'POST',
        headers: { ...origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ownerFixture.email, password: 'WRONG_PASSWORD' })
      });
      assert.strictEqual(res.status, 401, `Failed login ${i+1} should return 401, got ${res.status}`);
    }
    console.log('  🟢 3 failed login attempts recorded with 401.');

    // 3. 4th Attempt must trigger HTTP 429 and include Retry-After header
    console.log('\nTest 4: 4th Attempt (exceeding quota)...');
    const blockedRes = await fetch(`${baseUrl}/api/test-rate-limit/login`, {
      method: 'POST',
      headers: { ...origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ownerFixture.email, password: 'WRONG_PASSWORD' })
    });

    assert.strictEqual(blockedRes.status, 429, `Exceeded rate limit should return 429, got ${blockedRes.status}`);
    const retryAfter = blockedRes.headers.get('retry-after');
    assert.ok(retryAfter, 'HTTP 429 response must include Retry-After header');
    const blockedBody = await blockedRes.json();
    assert.strictEqual(blockedBody.error, 'TOO_MANY_REQUESTS');
    console.log(`  🟢 HTTP 429 TOO_MANY_REQUESTS returned cleanly with Retry-After: ${retryAfter} seconds.`);

    console.log('\n================================================================');
    console.log('  🟢 ALL LOGIN RATE LIMITER HTTP INTEGRATION TESTS PASSED CLEANLY');
    console.log('================================================================\n');
  } finally {
    server.close();
  }
}

runLoginRateLimiterHttpTest().catch(err => {
  console.error('🔴 LOGIN RATE LIMITER HTTP TEST FAILED:', err);
  process.exit(1);
});
