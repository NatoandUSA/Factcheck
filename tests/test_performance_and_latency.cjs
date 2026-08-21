/**
 * PERFORMANCE, LATENCY & ZERO-404 BENCHMARK SUITE
 */
const assert = require("assert");
process.env.NODE_ENV = "test";

const { app, db, databaseReady } = require("../server/server");
const { createSessionRecord } = require("../server/security/session");

(async () => {
  await databaseReady;
  const srv = app.listen(0);
  const port = srv.address().port;
  const base = `http://127.0.0.1:${port}`;
  process.env.ALLOWED_ORIGINS = `http://127.0.0.1:${port}`;

  console.log("================================================================");
  console.log("  BENCHMARKING LATENCY, ASSET SERVING & TTFB");
  console.log("================================================================\n");

  const dbAll = (s, p = []) => new Promise((r, j) => db.all(s, p, (e, x) => e ? j(e) : r(x)));
  
  async function waitForFixtures(timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const rows = await dbAll(`SELECT u.id user_id, u.email, w.tenant_id, wm.workspace_id, wm.role, w.marketplace
                              FROM workspace_memberships wm
                              JOIN users u ON u.id = wm.user_id
                              JOIN workspaces w ON w.id = wm.workspace_id`);
      const hasOwner = rows.some(f => f.role === "OWNER");
      if (hasOwner) return rows;
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error("Timed out waiting for fixtures");
  }

  const rows = await waitForFixtures();
  const ownerAmz = rows.find(f => f.role === "OWNER") || { workspace_id: 1 };

  // Authenticate to test authenticated endpoints
  const loginRes = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ email: "owner@omniseller.local", password: "password123", workspaceId: ownerAmz.workspace_id })
  });
  assert.strictEqual(loginRes.status, 200);
  const cookie = loginRes.headers.get("set-cookie").split(";")[0];

  const endpoints = [
    { path: "/api/health", expected: 200, name: "Health Probe", auth: false },
    { path: "/", expected: 200, name: "SPA Index HTML", auth: false },
    { path: "/api/auth/me", expected: 200, name: "Session Auth Profile", auth: true },
    { path: "/api/ip-guard/library", expected: 200, name: "IP Guard Library", auth: true },
    { path: "/api/projects", expected: 200, name: "Projects Scoped Ingest", auth: true }
  ];

  for (const ep of endpoints) {
    const start = performance.now();
    const headers = { Origin: base };
    if (ep.auth) headers.Cookie = cookie;
    const res = await fetch(base + ep.path, { headers });
    const latency = performance.now() - start;
    assert.strictEqual(res.status, ep.expected, `Expected ${ep.expected} for ${ep.path}, got ${res.status}`);
    console.log(`  🟢 [${ep.name}] -> HTTP ${res.status} | Latency: ${latency.toFixed(2)}ms`);
    assert.ok(latency < 200, `Latency for ${ep.path} exceeded 200ms threshold: ${latency}ms`);
  }

  // Measure concurrent load throughput (50 concurrent requests)
  console.log("\nTesting Concurrent Load (50 parallel requests to /api/health)...");
  const concurrentStart = performance.now();
  const promises = Array.from({ length: 50 }, () => fetch(base + "/api/health", { headers: { Origin: base } }));
  const results = await Promise.all(promises);
  const totalConcurrentDuration = performance.now() - concurrentStart;
  
  for (const r of results) {
    assert.strictEqual(r.status, 200);
  }
  const avgLatency = totalConcurrentDuration / 50;
  console.log(`  🟢 50 Concurrent Requests completed in ${totalConcurrentDuration.toFixed(2)}ms (Avg: ${avgLatency.toFixed(2)}ms/req, Zero 404s/Errors!)`);

  srv.close();
  console.log("\n================================================================");
  console.log("  🟢 PERFORMANCE & LATENCY BENCHMARK PASSED (ULTRA-FAST & ZERO 404)!");
  console.log("================================================================\n");
  process.exit(0);
})().catch(e => {
  console.error("🔴 BENCHMARK FAILED:", e);
  process.exit(1);
});
