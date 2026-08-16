const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Set TEST mode environment variables before requiring server modules
process.env.NODE_ENV = 'test';

const { hashPassword, verifyPassword } = require('../server/security/scrypt');
const { hashToken, generateRawToken } = require('../server/security/session');
const { app, db } = require('../server/server');

async function runAuthFoundationTests() {
  console.log('================================================================');
  console.log('  TESTING PR-2B IDENTITY & SESSION FOUNDATION SECURITY SUITE');
  console.log('================================================================\n');

  let server;
  let port;

  try {
    // Test 1: Scrypt Password Hashing & Timing-Safe Verification
    console.log('Test 1: Scrypt Password Hashing & Verification...');
    const plainPassword = 'SuperSecretPassword123!';
    const hashedPassword = await hashPassword(plainPassword);
    
    assert(hashedPassword.startsWith('scrypt$v1$N=16384,r=8,p=1$'), 'Hash does not match scrypt v1 prefix');
    const isValid = await verifyPassword(plainPassword, hashedPassword);
    assert.strictEqual(isValid, true, 'Valid password verification failed');

    const isInvalid = await verifyPassword('WrongPassword123!', hashedPassword);
    assert.strictEqual(isInvalid, false, 'Invalid password accepted unexpectedly');
    
    const dummyVerify = await verifyPassword('SomePassword', null);
    assert.strictEqual(dummyVerify, false, 'Null hash verification failed');
    console.log('  🟢 Test 1 (Scrypt Hashing & Dummy Verification): PASSED');

    // Test 2: Opaque Session Token Generation & SHA-256 Hashing
    console.log('\nTest 2: Session Token Generation & Hashing...');
    const rawToken = generateRawToken();
    assert.strictEqual(typeof rawToken, 'string', 'Raw token is not a string');
    assert.strictEqual(rawToken.length, 64, 'Raw token hex string length is not 64 (32 bytes)');

    const tokenHash = hashToken(rawToken);
    assert.strictEqual(tokenHash.length, 64, 'SHA-256 hash digest length is not 64 hex characters');
    assert.notStrictEqual(rawToken, tokenHash, 'Raw token equals token hash');
    console.log('  🟢 Test 2 (32-byte Opaque Token & SHA-256 Hash): PASSED');

    // Bind server to ephemeral OS port
    server = app.listen(0);
    port = server.address().port;
    console.log(`\nBound test Express server to ephemeral port ${port}`);

    // Test 3: Unauthenticated GET /api/auth/me -> 401 Unauthorized
    console.log('\nTest 3: Unauthenticated GET /api/auth/me...');
    const unauthRes = await fetch(`http://127.0.0.1:${port}/api/auth/me`);
    assert.strictEqual(unauthRes.status, 401, 'Unauthenticated request did not return 401');
    const unauthBody = await unauthRes.json();
    assert.strictEqual(unauthBody.error, 'UNAUTHENTICATED');
    console.log('  🟢 Test 3 (Unauthenticated 401 Protection): PASSED');

    // Test 4: Valid Login POST /api/auth/login -> 200 OK + Set-Cookie
    console.log('\nTest 4: Valid Login POST /api/auth/login...');
    const loginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Origin': `http://127.0.0.1:${port}`
      },
      body: JSON.stringify({
        email: 'owner@omniseller.local',
        password: 'password123'
      })
    });

    assert.strictEqual(loginRes.status, 200, `Login failed with status ${loginRes.status}`);
    const loginBody = await loginRes.json();
    assert.strictEqual(loginBody.success, true, 'Login body success is false');
    assert.strictEqual(loginBody.user.email, 'owner@omniseller.local');
    assert.strictEqual(loginBody.user.role, 'OWNER');

    const setCookieHeader = loginRes.headers.get('set-cookie');
    assert(setCookieHeader, 'Set-Cookie header missing from login response');
    assert(setCookieHeader.includes('omni_session='), 'omni_session cookie missing from Set-Cookie header');
    assert(setCookieHeader.includes('HttpOnly'), 'HttpOnly attribute missing from cookie');

    const cookieValue = setCookieHeader.split(';')[0];
    // Redacted log: Do NOT print raw session token into logs
    console.log(`  Received Session Cookie: omni_session=***[REDACTED_SESSION_TOKEN]***`);
    console.log('  🟢 Test 4 (Login 200 & HttpOnly Session Cookie): PASSED');

    // Test 5: Authenticated GET /api/auth/me with Cookie -> 200 OK
    console.log('\nTest 5: Authenticated GET /api/auth/me with Cookie...');
    const meRes = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
      headers: { Cookie: cookieValue }
    });

    assert.strictEqual(meRes.status, 200, `Authenticated GET /me failed with status ${meRes.status}`);
    const meBody = await meRes.json();
    assert.strictEqual(meBody.success, true);
    assert.strictEqual(meBody.user.email, 'owner@omniseller.local');
    assert.strictEqual(meBody.user.role, 'OWNER');
    console.log('  🟢 Test 5 (Authenticated Session Profile Verification): PASSED');

    // Test 6: POST /api/auth/logout -> Revokes Session
    console.log('\nTest 6: POST /api/auth/logout...');
    const logoutRes = await fetch(`http://127.0.0.1:${port}/api/auth/logout`, {
      method: 'POST',
      headers: { 
        Cookie: cookieValue,
        Origin: `http://127.0.0.1:${port}`
      }
    });


    assert.strictEqual(logoutRes.status, 200);
    const logoutBody = await logoutRes.json();
    assert.strictEqual(logoutBody.success, true);

    // Verify session is revoked
    const meAfterLogout = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
      headers: { Cookie: cookieValue }
    });
    assert.strictEqual(meAfterLogout.status, 401, 'Revoked session accessed endpoint successfully');
    console.log('  🟢 Test 6 (Session Revocation & Cookie Teardown): PASSED');

    // Test 7: Malformed Cookie & CSRF Origin Mismatch -> Safe Fail-Closed
    console.log('\nTest 7: Malformed Cookie & CSRF Origin Mismatch...');
    const malformedRes = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
      headers: { Cookie: 'omni_session=%E0%A4%A' } // Malformed percent encoding
    });
    assert.strictEqual(malformedRes.status, 401, 'Malformed cookie did not return 401');

    const csrfRes = await fetch(`http://127.0.0.1:${port}/api/auth/logout`, {
      method: 'POST',
      headers: { 
        Cookie: cookieValue,
        Origin: 'https://evil-attacker-site.com',
        Host: `127.0.0.1:${port}`
      }
    });
    assert.strictEqual(csrfRes.status, 403, 'Cross-site CSRF request was not blocked with 403');
    console.log('  🟢 Test 7 (Malformed Cookie & CSRF Protection): PASSED');

    console.log('\n================================================================');
    console.log('  🟢 ALL 7 PR-2B AUTHENTICATION FOUNDATION TESTS PASSED!');
    console.log('================================================================\n');

  } finally {
    if (server) {
      await new Promise(res => server.close(res));
    }
    if (db && typeof db.close === 'function') {
      await new Promise(res => db.close(res));
    }
  }
}


runAuthFoundationTests().catch(err => {
  console.error('🔴 UNHANDLED REJECTION IN AUTH FOUNDATION TEST:', err);
  process.exitCode = 1;
});
