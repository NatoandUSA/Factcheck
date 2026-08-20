process.env.NODE_ENV = 'test';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

// Create temporary directory in OS temp dir for total test isolation
const tempUploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-test-imports-'));
process.env.TEST_IMPORTS_DIR = tempUploadDir;

// Import Express app & db after setting TEST_IMPORTS_DIR
const { app, db, databaseReady } = require('../server/server');

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}

async function waitForOwnerAmazonWorkspace(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await dbAll(`
      SELECT wm.workspace_id
      FROM workspace_memberships wm
      JOIN users u ON u.id = wm.user_id
      JOIN workspaces w ON w.id = wm.workspace_id
      WHERE u.email = 'owner@omniseller.local' AND w.marketplace = 'AMAZON'
    `);
    if (rows.length === 1) return rows[0].workspace_id;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for deterministic test fixtures');
}

async function loginAndGetCookie(port, workspaceId) {
  const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': `http://127.0.0.1:${port}` },
    body: JSON.stringify({ email: 'owner@omniseller.local', password: 'password123', workspaceId })
  });
  assert.strictEqual(res.status, 200, `Login failed with status ${res.status}`);
  const setCookieHeader = res.headers.get('set-cookie');
  assert(setCookieHeader, 'Set-Cookie header missing from login response');
  return setCookieHeader.split(';')[0];
}

function httpPostMultipart(port, filePath, cookie) {
  return new Promise((resolve, reject) => {
    const fileContent = fs.readFileSync(filePath);
    const boundary = '--------------------------' + Date.now().toString(16);

    const postDataHeader = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="seedPhrase"\r\n\r\npara el amor de mi vida\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="category"\r\n\r\nJewelry\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="reportFile"; filename="${path.basename(filePath)}"\r\n` +
      `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`
    );

    const postDataFooter = Buffer.from(`\r\n--${boundary}--\r\n`);

    const options = {
      hostname: 'localhost',
      port: port,
      path: '/api/upload-h10',
      method: 'POST',
      headers: {
        'Origin': `http://localhost:${port}`,
        'Cookie': cookie,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': postDataHeader.length + fileContent.length + postDataFooter.length
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch (e) { resolve({ status: res.statusCode, rawBody: body }); }
      });
    });

    req.on('error', reject);
    req.write(postDataHeader);
    req.write(fileContent);
    req.write(postDataFooter);
    req.end();
  });
}

function httpGet(port, pathUrl, cookie) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${port}${pathUrl}`, { headers: { Cookie: cookie } }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch (e) { resolve({ status: res.statusCode, rawBody: body }); }
      });
    }).on('error', reject);
  });
}

async function testFullCerebroMklFlow() {
  console.log('================================================================');
  console.log('  TESTING REAL CEREBRO FILE UPLOAD & MASTER KEYWORD TABLE INTEGRATION');
  console.log('================================================================\n');

  // PR-1.1 Fix: Bind to OS-assigned ephemeral port (app.listen(0))
  const server = app.listen(0);
  const TEST_PORT = server.address().port;
  process.env.ALLOWED_ORIGINS = `http://localhost:${TEST_PORT},http://127.0.0.1:${TEST_PORT}`;
  console.log(`Bound in-process server to ephemeral OS port ${TEST_PORT}`);

  try {
    await databaseReady;
    const workspaceId = await waitForOwnerAmazonWorkspace();
    const cookie = await loginAndGetCookie(TEST_PORT, workspaceId);
    console.log('Authenticated as owner@omniseller.local for Amazon workspace', workspaceId);

    const trackedFixture = path.resolve(__dirname, 'fixtures/sample_cerebro.xlsx');
    assert.ok(fs.existsSync(trackedFixture), `CRITICAL TEST FAILURE: Tracked fixture file missing at ${trackedFixture}`);

    console.log(`Step 1: Uploading Tracked Cerebro Fixtures File (${trackedFixture})...`);

    const startTime = Date.now();
    const uploadRes = await httpPostMultipart(TEST_PORT, trackedFixture, cookie);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    assert.strictEqual(uploadRes.status, 200, 'Upload Cerebro file status must be HTTP 200 OK');
    assert.strictEqual(uploadRes.data?.totalRows, 27018, 'Total parsed rows must be 27018');
    assert.strictEqual(uploadRes.data?.topKeywordsDetailed?.length, 100, 'Returned MKL items count must be 100');

    console.log(`Upload HTTP Status: ${uploadRes.status} (Processed 27,018 rows in ${duration}s)`);
    console.log(`Total Rows Parsed: ${uploadRes.data?.totalRows}`);
    console.log(`Keywords Returned to Frontend State: ${uploadRes.data?.topKeywordsDetailed?.length}`);

    console.log('\nStep 2: Testing GET /api/master-keywords DB Persistence...');
    const dbRes = await httpGet(TEST_PORT, '/api/master-keywords?marketplace=AMAZON', cookie);
    assert.strictEqual(dbRes.status, 200, 'GET master-keywords status must be 200');
    assert.ok(dbRes.data?.keywords?.length > 0, 'DB keywords count must be > 0');

    console.log(`DB Keywords Count: ${dbRes.data?.keywords?.length}`);

    console.log('\n================================================================');
    console.log('  🟢 100% OPERATIONAL SUCCESS: REAL CEREBRO FILE PARSED & POPULATED!');
    console.log('================================================================\n');
  } finally {
    // PR-1.1 Fix: Await server shutdown, close SQLite db, and cleanup temp dir
    await new Promise((res) => server.close(res));
    if (db && typeof db.close === 'function') {
      await new Promise((res) => db.close(res));
    }
    if (fs.existsSync(tempUploadDir)) {
      try { fs.rmSync(tempUploadDir, { recursive: true, force: true }); } catch (e) {}
    }
  }
}

testFullCerebroMklFlow().catch(err => {
  console.error('🔴 UNHANDLED REJECTION IN CEREBRO TEST:', err);
  process.exitCode = 1;
});
