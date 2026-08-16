const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Set TEST mode environment variables before requiring server modules
process.env.NODE_ENV = 'test';

const { hashPassword, verifyPassword } = require('../server/security/scrypt');
const { hashToken, generateRawToken } = require('../server/security/session');
const { app, db, databaseReady } = require('../server/server');

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}

async function waitForTestFixtures(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await dbAll(`
      SELECT wm.workspace_id, wm.role, w.marketplace
      FROM workspace_memberships wm
      JOIN users u ON u.id = wm.user_id
      JOIN workspaces w ON w.id = wm.workspace_id
      WHERE u.email = 'owner@omniseller.local'
      ORDER BY wm.workspace_id
    `);
    if (rows.length === 2) return rows;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for deterministic test fixtures');
}

async function runAuthFoundationTests() {
  console.log('================================================================');
  console.log('  TESTING PR-2B IDENTITY & SESSION FOUNDATION SECURITY SUITE');
  console.log('================================================================\n');

  let server;
  let port;

  try {
    await databaseReady;
    const ownerMemberships = await waitForTestFixtures();
    const amazonWorkspace = ownerMemberships.find(row => row.marketplace === 'AMAZON');
    const etsyWorkspace = ownerMemberships.find(row => row.marketplace === 'ETSY');
    assert(amazonWorkspace && etsyWorkspace, 'Amazon and Etsy owner fixtures are required');

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

    // Bind server to ephemeral OS port and inject allowed origin for test suite
    server = app.listen(0);
    port = server.address().port;
    process.env.ALLOWED_ORIGINS = `http://127.0.0.1:${port},http://localhost:${port}`;
    console.log(`\nBound test Express server to ephemeral port ${port} and configured ALLOWED_ORIGINS`);

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
        password: 'password123',
        workspaceId: amazonWorkspace.workspace_id
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

    // Test 8: Legacy Tombstone POST /api/login -> 410 Gone (Zero User Data)
    console.log('\nTest 8: Legacy Tombstone POST /api/login...');
    const legacyRes = await fetch(`http://127.0.0.1:${port}/api/login`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Origin': `http://127.0.0.1:${port}`
      },
      body: JSON.stringify({ email: 'owner@omniseller.local' })
    });
    assert.strictEqual(legacyRes.status, 410, 'Legacy login endpoint did not return 410 Gone');
    const legacyBody = await legacyRes.json();
    assert.strictEqual(legacyBody.error, 'ENDPOINT_DEPRECATED');
    assert(!legacyBody.user, 'Legacy endpoint returned user data');
    console.log('  🟢 Test 8 (Legacy Tombstone 410 Protection): PASSED');

    // Test 9: Protected DELETE /api/reset-database -> 401 Unauthorized
    console.log('\nTest 9: Protected DELETE /api/reset-database...');
    const resetRes = await fetch(`http://127.0.0.1:${port}/api/reset-database`, {
      method: 'DELETE',
      headers: { 'Origin': `http://127.0.0.1:${port}` }
    });
    assert.strictEqual(resetRes.status, 401, 'Unauthenticated reset database request did not return 401');
    console.log('  🟢 Test 9 (Protected Reset-Database 401): PASSED');

    // Test 10: Input Bounds & Non-Member Workspace Denial
    console.log('\nTest 10: Input Bounds & Non-Member Workspace Denial...');
    const shortPassRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Origin': `http://127.0.0.1:${port}`
      },
      body: JSON.stringify({ email: 'owner@omniseller.local', password: '123' })
    });
    assert.strictEqual(shortPassRes.status, 400, 'Short password did not return 400 Bad Request');

    const nonMemberWsRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Origin': `http://127.0.0.1:${port}`
      },
      body: JSON.stringify({ email: 'owner@omniseller.local', password: 'password123', workspaceId: 99999 })
    });
    assert.strictEqual(nonMemberWsRes.status, 403, 'Non-member workspaceId login did not return 403 Forbidden');
    console.log('  🟢 Test 10 (Input Bounds & Workspace Denial 403): PASSED');

    // Test 11: Listing Approval Role Authorization (Unauthenticated 401, Seller 403, Owner 200)
    console.log('\nTest 11: Listing Approval Role Authorization...');
    const unauthApproveRes = await fetch(`http://127.0.0.1:${port}/api/listings/1/approve`, {
      method: 'PATCH',
      headers: { 'Origin': `http://127.0.0.1:${port}` }
    });
    assert.strictEqual(unauthApproveRes.status, 401, 'Unauthenticated approval did not return 401');

    // Login seller user
    const sellerLoginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Origin': `http://127.0.0.1:${port}`
      },
      body: JSON.stringify({ email: 'seller@omniseller.local', password: 'password123' })
    });
    const sellerCookie = sellerLoginRes.headers.get('set-cookie')?.split(';')[0];

    const sellerApproveRes = await fetch(`http://127.0.0.1:${port}/api/listings/1/approve`, {
      method: 'PATCH',
      headers: { 
        Cookie: sellerCookie,
        Origin: `http://127.0.0.1:${port}`
      }
    });
    assert.strictEqual(sellerApproveRes.status, 403, 'Seller role approval did not return 403 Forbidden');

    // Login owner user
    const ownerLoginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Origin': `http://127.0.0.1:${port}`
      },
      body: JSON.stringify({
        email: 'owner@omniseller.local',
        password: 'password123',
        workspaceId: amazonWorkspace.workspace_id
      })
    });
    const ownerCookie = ownerLoginRes.headers.get('set-cookie')?.split(';')[0];
    assert(ownerCookie, 'Owner login cookie missing');

    const createListingRes = await fetch(`http://127.0.0.1:${port}/api/listings`, {
      method: 'POST',
      headers: {
        Cookie: ownerCookie,
        'Content-Type': 'application/json',
        Origin: `http://127.0.0.1:${port}`
      },
      body: JSON.stringify({
        amazonTitle: 'Personalized Embroidered Test Sweatshirt',
        etsyTitle: 'Personalized Embroidered Test Sweatshirt',
        categoryName: 'Embroidery',
        payload: {
          ipVerdict: 'ALLOW',
          ipHits: [],
          etsyTags: Array.from({ length: 13 }, (_, index) => `test tag ${index + 1}`)
        }
      })
    });
    assert.strictEqual(createListingRes.status, 200, 'Owner could not create approval fixture');
    const createdListing = await createListingRes.json();
    const ownerApproveRes = await fetch(`http://127.0.0.1:${port}/api/listings/${createdListing.id}/approve`, {
      method: 'PATCH',
      headers: { Cookie: ownerCookie, Origin: `http://127.0.0.1:${port}` }
    });
    assert.strictEqual(ownerApproveRes.status, 200, 'Owner approval did not return 200 OK');
    const ownerApproveBody = await ownerApproveRes.json();
    assert.strictEqual(ownerApproveBody.status, 'PUBLISH_READY');
    console.log('  🟢 Test 11 (Approval 401/403 & Real Owner 200): PASSED');

    // Test 12: Database Reset Role Authorization (Seller 403, Manager 403, Owner 200)
    console.log('\nTest 12: Database Reset Role Authorization...');
    const sellerResetRes = await fetch(`http://127.0.0.1:${port}/api/reset-database`, {
      method: 'DELETE',
      headers: { 
        Cookie: sellerCookie,
        Origin: `http://127.0.0.1:${port}`
      }
    });
    assert.strictEqual(sellerResetRes.status, 403, 'Seller role database reset did not return 403 Forbidden');

    const managerLoginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${port}` },
      body: JSON.stringify({ email: 'manager@omniseller.local', password: 'password123' })
    });
    assert.strictEqual(managerLoginRes.status, 200);
    const managerCookie = managerLoginRes.headers.get('set-cookie')?.split(';')[0];
    const managerResetRes = await fetch(`http://127.0.0.1:${port}/api/reset-database`, {
      method: 'DELETE',
      headers: { Cookie: managerCookie, Origin: `http://127.0.0.1:${port}` }
    });
    assert.strictEqual(managerResetRes.status, 403, 'Manager role database reset did not return 403 Forbidden');

    const ownerResetRes = await fetch(`http://127.0.0.1:${port}/api/reset-database`, {
      method: 'DELETE',
      headers: { 
        Cookie: ownerCookie,
        Origin: `http://127.0.0.1:${port}`
      }
    });
    assert.strictEqual(ownerResetRes.status, 200, 'Owner role database reset did not return 200 OK');
    const resetAudit = await dbAll("SELECT * FROM audit_events WHERE action = 'admin:reset' AND outcome = 'SUCCESS'");
    assert(resetAudit.length >= 1, 'Successful owner reset was not appended to audit log');
    console.log('  🟢 Test 12 (Reset Seller/Manager 403, Owner 200 & Audit): PASSED');

    // Test 13: Amazon vs Etsy Workspace Selection & Isolation
    console.log('\nTest 13: Amazon vs Etsy Workspace Selection...');
    const ambiguousLoginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Origin': `http://127.0.0.1:${port}`
      },
      body: JSON.stringify({ email: 'owner@omniseller.local', password: 'password123' })
    });
    assert.strictEqual(ambiguousLoginRes.status, 409, 'Multi-workspace login silently selected a workspace');
    const ambiguousBody = await ambiguousLoginRes.json();
    assert.strictEqual(ambiguousBody.error, 'WORKSPACE_SELECTION_REQUIRED');
    assert.deepStrictEqual(
      new Set(ambiguousBody.workspaces.map(workspace => workspace.marketplace)),
      new Set(['AMAZON', 'ETSY'])
    );

    const amzLoginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${port}` },
      body: JSON.stringify({
        email: 'owner@omniseller.local',
        password: 'password123',
        workspaceId: amazonWorkspace.workspace_id
      })
    });
    assert.strictEqual(amzLoginRes.status, 200);
    const amzBody = await amzLoginRes.json();
    assert.strictEqual(amzBody.user.marketplace, 'AMAZON');

    const etsyLoginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Origin': `http://127.0.0.1:${port}`
      },
      body: JSON.stringify({
        email: 'owner@omniseller.local',
        password: 'password123',
        workspaceId: etsyWorkspace.workspace_id
      })
    });
    assert.strictEqual(etsyLoginRes.status, 200, 'Explicit Etsy workspace login failed');
    const etsyBody = await etsyLoginRes.json();
    assert.strictEqual(etsyBody.user.marketplace, 'ETSY');
    console.log('  🟢 Test 13 (Amazon vs Etsy Workspace Selection & Marketplace Scope): PASSED');

    // Test 14: Listing workspace isolation and IDOR-safe 404 behavior
    console.log('\nTest 14: Listing Workspace Isolation & IDOR 404...');
    const amzCookie = amzLoginRes.headers.get('set-cookie')?.split(';')[0];
    const etsyCookie = etsyLoginRes.headers.get('set-cookie')?.split(';')[0];
    assert(amzCookie && etsyCookie, 'Marketplace session cookies are required');

    const scopedCreateRes = await fetch(`http://127.0.0.1:${port}/api/listings`, {
      method: 'POST',
      headers: {
        Cookie: amzCookie,
        'Content-Type': 'application/json',
        Origin: `http://127.0.0.1:${port}`
      },
      body: JSON.stringify({
        amazonTitle: 'Amazon Workspace Private Listing',
        etsyTitle: 'Amazon Workspace Private Listing',
        categoryName: 'Embroidery',
        payload: {
          ipVerdict: 'ALLOW',
          ipHits: [],
          etsyTags: Array.from({ length: 13 }, (_, index) => `scope tag ${index + 1}`)
        }
      })
    });
    assert.strictEqual(scopedCreateRes.status, 200, 'Amazon scoped listing creation failed');
    const scopedListing = await scopedCreateRes.json();

    const amazonListRes = await fetch(`http://127.0.0.1:${port}/api/listings`, {
      headers: { Cookie: amzCookie }
    });
    assert.strictEqual(amazonListRes.status, 200);
    const amazonListings = await amazonListRes.json();
    assert(amazonListings.some(listing => listing.id === scopedListing.id), 'Amazon session cannot read its own listing');

    const etsyListRes = await fetch(`http://127.0.0.1:${port}/api/listings`, {
      headers: { Cookie: etsyCookie }
    });
    assert.strictEqual(etsyListRes.status, 200);
    const etsyListings = await etsyListRes.json();
    assert(!etsyListings.some(listing => listing.id === scopedListing.id), 'Etsy session leaked an Amazon listing');

    const crossApproveRes = await fetch(`http://127.0.0.1:${port}/api/listings/${scopedListing.id}/approve`, {
      method: 'PATCH',
      headers: { Cookie: etsyCookie, Origin: `http://127.0.0.1:${port}` }
    });
    assert.strictEqual(crossApproveRes.status, 404, 'Cross-workspace approval must return non-enumerating 404');

    const crossExportRes = await fetch(`http://127.0.0.1:${port}/api/listings/${scopedListing.id}/export`, {
      headers: { Cookie: etsyCookie }
    });
    assert.strictEqual(crossExportRes.status, 404, 'Cross-workspace export must return non-enumerating 404');
    console.log('  🟢 Test 14 (Amazon/Etsy Listing Isolation & IDOR-safe 404): PASSED');

    console.log('\n================================================================');
    console.log('  🟢 ALL 14 PR-2B/PR-2C SECURITY FOUNDATION TESTS PASSED!');
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
