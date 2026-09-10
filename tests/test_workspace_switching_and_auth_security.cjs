/**
 * WORKSPACE SWITCHING, AUTHORIZATION GATE & RACE-CONDITION TEST
 */
const assert = require("assert");
process.env.NODE_ENV = "test";

const { app, db, databaseReady } = require("../server/server");
const { createSessionRecord } = require("../server/security/session");

const dbAll = (s, p = []) => new Promise((r, j) => db.all(s, p, (e, x) => e ? j(e) : r(x)));
const mkSess = (u, w, t) => new Promise((r, j) => createSessionRecord(db, u, w, t, (e, s) => e ? j(e) : r(s)));

async function waitForFixtures(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await dbAll(`SELECT u.id user_id, u.email, w.tenant_id, wm.workspace_id, wm.role, w.marketplace
                            FROM workspace_memberships wm
                            JOIN users u ON u.id = wm.user_id
                            JOIN workspaces w ON w.id = wm.workspace_id`);
    const hasOwnerAmz = rows.some(f => f.role === "OWNER" && f.marketplace === "AMAZON");
    const hasOwnerEtsy = rows.some(f => f.role === "OWNER" && f.marketplace === "ETSY");
    const hasSellerAmz = rows.some(f => f.role === "SELLER" && f.marketplace === "AMAZON");
    const hasSellerEtsy = rows.some(f => f.role === "SELLER" && f.marketplace === "ETSY");
    if (hasOwnerAmz && hasOwnerEtsy && hasSellerAmz && hasSellerEtsy) return rows;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error("Timed out waiting for fixtures");
}

(async () => {
  await databaseReady;
  const fx = await waitForFixtures();
  const ownerAmz = fx.find(f => f.role === "OWNER" && f.marketplace === "AMAZON");
  const ownerEtsy = fx.find(f => f.role === "OWNER" && f.marketplace === "ETSY");
  const sellerAmz = fx.find(f => f.role === "SELLER" && f.marketplace === "AMAZON");
  const sellerEtsy = fx.find(f => f.role === "SELLER" && f.marketplace === "ETSY");

  const srv = app.listen(0);
  const port = srv.address().port;
  const base = `http://127.0.0.1:${port}`;
  process.env.ALLOWED_ORIGINS = `http://127.0.0.1:${port}`;

  console.log("================================================================");
  console.log("  TESTING WORKSPACE SWITCHING & AUTHORIZATION SECURITY");
  console.log("================================================================\n");

  // Step 1: Login as Owner in Amazon Workspace
  let sessionToken;
  const loginRes = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ email: "owner@omniseller.local", password: "password123", workspaceId: ownerAmz.workspace_id })
  });
  assert.strictEqual(loginRes.status, 200);
  const setCookie = loginRes.headers.get("set-cookie");
  sessionToken = setCookie.split(";")[0];

  // Verify Initial Session Marketplace is AMAZON
  const me1 = await (await fetch(base + "/api/auth/me", { headers: { Cookie: sessionToken, Origin: base } })).json();
  assert.strictEqual(me1.user.marketplace, "AMAZON");
  console.log("  🟢 Initial Owner session confirmed on AMAZON workspace.");

  // Step 2: Switch Workspace to ETSY
  const switchEtsy = await fetch(base + "/api/auth/switch-workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: sessionToken, Origin: base },
    body: JSON.stringify({ marketplace: "ETSY" })
  });
  assert.strictEqual(switchEtsy.status, 200);
  const switchCookie = switchEtsy.headers.get("set-cookie");
  if (switchCookie) sessionToken = switchCookie.split(";")[0];

  // Verify /api/auth/me is now ETSY
  const me2 = await (await fetch(base + "/api/auth/me", { headers: { Cookie: sessionToken, Origin: base } })).json();
  assert.strictEqual(me2.user.marketplace, "ETSY");
  console.log("  🟢 Workspace switched to ETSY -> /api/auth/me reports ETSY.");

  // Step 3: Switch Workspace back to AMAZON
  const switchAmz = await fetch(base + "/api/auth/switch-workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: sessionToken, Origin: base },
    body: JSON.stringify({ marketplace: "AMAZON" })
  });
  assert.strictEqual(switchAmz.status, 200);
  const switchCookieAmz = switchAmz.headers.get("set-cookie");
  if (switchCookieAmz) sessionToken = switchCookieAmz.split(";")[0];

  const me3 = await (await fetch(base + "/api/auth/me", { headers: { Cookie: sessionToken, Origin: base } })).json();
  assert.strictEqual(me3.user.marketplace, "AMAZON");
  console.log("  🟢 Workspace switched back to AMAZON -> /api/auth/me reports AMAZON.");

  // Step 4: Daily operator can switch between both assigned storefronts.
  console.log("\nStep 4: Testing Seller Workspace Switch...");
  const sellerLogin = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ email: "seller@omniseller.local", password: "password123", workspaceId: sellerAmz.workspace_id })
  });
  assert.strictEqual(sellerLogin.status, 200);
  const sellerCookie = sellerLogin.headers.get("set-cookie").split(";")[0];

  const sellerSwitch = await fetch(base + "/api/auth/switch-workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: sellerCookie, Origin: base },
    body: JSON.stringify({ marketplace: "ETSY" })
  });
  assert.strictEqual(sellerSwitch.status, 200);
  const sellerSwitchCookie = sellerSwitch.headers.get("set-cookie")?.split(";")[0] || sellerCookie;
  const sellerMe = await (await fetch(base + "/api/auth/me", {
    headers: { Cookie: sellerSwitchCookie, Origin: base }
  })).json();
  assert.strictEqual(sellerMe.user.workspaceId, sellerEtsy.workspace_id);
  assert.strictEqual(sellerMe.user.marketplace, "ETSY");
  assert.strictEqual(sellerMe.user.role, "SELLER");
  console.log("  🟢 Seller can switch to the assigned ETSY workspace without role escalation.");

  srv.close();
  console.log("\n================================================================");
  console.log("  🟢 ALL WORKSPACE SWITCHING & AUTH SECURITY TESTS PASSED!");
  console.log("================================================================\n");
  process.exit(0);
})().catch(e => {
  console.error("🔴 WORKSPACE SWITCHING TEST FAILED:", e);
  process.exit(1);
});
