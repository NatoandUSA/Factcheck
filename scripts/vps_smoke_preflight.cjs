const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

// Set up external production paths outside repo worktree before requiring server
const vpsTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vps-prod-test-'));
const extDotenv = path.join(vpsTmpDir, 'omniseller.env');
const extDb = path.join(vpsTmpDir, 'omni_prod_app.db');
const extImports = path.join(vpsTmpDir, 'imports');

fs.mkdirSync(extImports, { recursive: true });
fs.writeFileSync(extDotenv, 'GEMINI_API_KEY=test_key\n');

process.env.NODE_ENV = 'production';
process.env.DOTENV_PATH = extDotenv;
process.env.OMNI_DB_PATH = extDb;
process.env.OMNI_IMPORTS_DIR = extImports;

const { app, db, databaseReady } = require('../server/server');

function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function runVpsSmokePreflight() {
  console.log('================================================================');
  console.log('  EXECUTING VPS PRODUCTION PREFLIGHT & SMOKE VERIFICATION SUITE');
  console.log('================================================================\n');

  await databaseReady;

  const { hashPassword } = require('../server/security/scrypt');
  const defaultPasswordHash = await hashPassword('password123');

  await new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO workspaces (tenant_id, marketplace, name) VALUES ('tenant-alpha-uuid', 'AMAZON', 'Amazon Main Store')",
      function(wErr) {
        if (wErr) return reject(wErr);
        const amzWsId = this.lastID;
        db.run(
          "INSERT INTO users (email, password_hash, name) VALUES ('owner@omniseller.local', ?, 'Store Owner')",
          [defaultPasswordHash],
          function(uErr) {
            if (uErr) return reject(uErr);
            const ownerId = this.lastID;
            db.run(
              "INSERT INTO workspace_memberships (user_id, workspace_id, role) VALUES (?, ?, 'OWNER')",
              [ownerId, amzWsId],
              (mErr) => mErr ? reject(mErr) : resolve()
            );
          }
        );
      }
    );
  });

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  process.env.ALLOWED_ORIGINS = baseUrl;

  try {
    // 1. Health Check Endpoint Probe
    console.log('Step 1: Probing GET /api/health...');
    const healthRes = await fetchUrl(`${baseUrl}/api/health`);
    assert.strictEqual(healthRes.status, 200, 'Health endpoint must return 200 OK');
    const healthData = JSON.parse(healthRes.body);
    assert.strictEqual(healthData.status, 'OK');
    assert.strictEqual(healthData.database, 'CONNECTED');
    assert.strictEqual(typeof healthData.uptime, 'number');
    assert.strictEqual(healthData.error, undefined, 'Public health check must not leak internal error details');
    console.log('  🟢 GET /api/health probe PASSED (Status 200 OK, database CONNECTED, zero error leaks).');

    // 2. Production Static Bundle Serving
    console.log('\nStep 2: Probing GET / (SPA Index Serving)...');
    const indexRes = await fetchUrl(`${baseUrl}/`);
    assert.strictEqual(indexRes.status, 200, 'Index serving must return 200 OK');
    assert.ok(indexRes.body.includes('<div id="root"></div>') || indexRes.body.includes('<html'), 'Index page must render valid HTML document');
    console.log('  🟢 GET / SPA Index probe PASSED.');

    // 3. Unauthenticated Security Defense
    console.log('\nStep 3: Probing Unauthenticated GET /api/auth/me...');
    const unauthRes = await fetchUrl(`${baseUrl}/api/auth/me`);
    assert.strictEqual(unauthRes.status, 401, 'Unauthenticated access must return 401');
    console.log('  🟢 Unauthenticated 401 protection PASSED.');

    // 4. Authenticated Login & Workspace Binding
    console.log('\nStep 4: Probing POST /api/auth/login...');
    const loginRes = await fetchUrl(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: baseUrl },
      body: JSON.stringify({ email: 'owner@omniseller.local', password: 'password123', workspaceId: 1 })
    });
    assert.strictEqual(loginRes.status, 200, 'Login must succeed with 200 OK');
    const setCookie = loginRes.headers['set-cookie']?.[0];
    assert.ok(setCookie && setCookie.includes('omni_session'), 'Login response must set HttpOnly omni_session cookie');
    const cookieHeader = setCookie.split(';')[0];
    console.log('  🟢 Owner login & HttpOnly session cookie PASSED.');

    // 5. Authenticated Profile Probe
    console.log('\nStep 5: Probing Authenticated GET /api/auth/me with session cookie...');
    const authMeRes = await fetchUrl(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: cookieHeader }
    });
    assert.strictEqual(authMeRes.status, 200, 'Authenticated profile must return 200 OK');
    const meData = JSON.parse(authMeRes.body);
    assert.strictEqual(meData.user.email, 'owner@omniseller.local');
    assert.strictEqual(meData.user.role, 'OWNER');
    console.log('  🟢 Authenticated session profile verification PASSED.');

    // 6. Local File-Copy Smoke Test
    console.log('\nStep 6: Executing Local File-Copy Smoke Test...');
    const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-copy-test-'));
    const backupDbPath = path.join(backupDir, 'app_copy_test.db');
    
    // Simulate temp file copy ops
    if (fs.existsSync(extDb)) {
      fs.copyFileSync(extDb, backupDbPath);
      assert.ok(fs.existsSync(backupDbPath), 'Temp copy file must exist');
    }
    fs.rmSync(backupDir, { recursive: true, force: true });
    console.log('  🟢 Local file-copy smoke test PASSED.');

    console.log('\n================================================================');
    console.log('  🟢 ALL 6 VPS PREFLIGHT & SMOKE VERIFICATION CHECKS PASSED!');
    console.log('================================================================');
  } finally {
    server.close();
    await new Promise(resolve => db.close(resolve));
    try { fs.rmSync(vpsTmpDir, { recursive: true, force: true }); } catch (_) {}
  }
}

runVpsSmokePreflight().catch(err => {
  console.error('🔴 VPS Smoke Preflight Failed:', err);
  process.exit(1);
});
