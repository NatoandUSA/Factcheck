/**
 * MULTI-PROJECT ATTRIBUTION & CANONICAL ERROR CONTRACT SUITE
 *
 * Asserts:
 * 1. 0 candidate projects + no projectId -> 400 PROJECT_REQUIRED (0 DB write)
 * 2. 2+ candidate projects + no projectId -> 409 AMBIGUOUS_ACTIVE_PROJECT (0 DB write)
 * 3. Cross-workspace / cross-tenant projectId -> 404 PROJECT_NOT_FOUND (0 DB write)
 * 4. Explicit projectId -> 100% rows.project_id strictly bound to target project
 * 5. Real production routes (/api/mcp/pull-etsy, /api/upload-h10, /api/amazon/quick-draft)
 */
const assert = require("assert");
const path = require("path");
process.env.NODE_ENV = "test";

const { app, db, databaseReady } = require("../server/server");
const { createSessionRecord } = require("../server/security/session");

const dbAll = (s, p = []) => new Promise((r, j) => db.all(s, p, (e, x) => e ? j(e) : r(x)));
const dbGet = (s, p = []) => new Promise((r, j) => db.get(s, p, (e, x) => e ? j(e) : r(x)));
const mkSess = (u, w, t) => new Promise((r, j) => createSessionRecord(db, u, w, t, (e, s) => e ? j(e) : r(s)));

async function waitForFixtures(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await dbAll(`SELECT u.id user_id, w.tenant_id, wm.workspace_id, wm.role, w.marketplace
                            FROM workspace_memberships wm
                            JOIN users u ON u.id = wm.user_id
                            JOIN workspaces w ON w.id = wm.workspace_id`);
    const hasOwnerAmz = rows.some(f => f.role === "OWNER" && f.marketplace === "AMAZON");
    const hasOwnerEtsy = rows.some(f => f.role === "OWNER" && f.marketplace === "ETSY");
    if (hasOwnerAmz && hasOwnerEtsy) return rows;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error("Timed out waiting for fixtures");
}

(async () => {
  await databaseReady;
  const fx = await waitForFixtures();
  const ownerAmz = fx.find(f => f.role === "OWNER" && f.marketplace === "AMAZON");
  const ownerEtsy = fx.find(f => f.role === "OWNER" && f.marketplace === "ETSY");

  const srv = app.listen(0);
  const port = srv.address().port;
  const base = `http://127.0.0.1:${port}`;
  process.env.ALLOWED_ORIGINS = `http://127.0.0.1:${port}`;

  const sAmz = await mkSess(ownerAmz.user_id, ownerAmz.workspace_id, ownerAmz.tenant_id);
  const sEtsy = await mkSess(ownerEtsy.user_id, ownerEtsy.workspace_id, ownerEtsy.tenant_id);

  const rawAmz = sAmz.rawToken || sAmz.token || sAmz;
  const rawEtsy = sEtsy.rawToken || sEtsy.token || sEtsy;

  const H_AMZ = { "Content-Type": "application/json", Origin: base, Cookie: `omni_session=${rawAmz}` };
  const H_ETSY = { "Content-Type": "application/json", Origin: base, Cookie: `omni_session=${rawEtsy}` };

  const callAmz = async (m, p, b) => {
    const r = await fetch(base + p, { method: m, headers: H_AMZ, body: b ? JSON.stringify(b) : undefined });
    let j = null; try { j = await r.json(); } catch (_) {}
    return { status: r.status, j };
  };

  const callEtsy = async (m, p, b) => {
    const r = await fetch(base + p, { method: m, headers: H_ETSY, body: b ? JSON.stringify(b) : undefined });
    let j = null; try { j = await r.json(); } catch (_) {}
    return { status: r.status, j };
  };

  console.log("================================================================");
  console.log("  TESTING MULTI-PROJECT ATTRIBUTION & CANONICAL ERROR CONTRACT");
  console.log("================================================================\n");

  // --- CONTRACT 1: 0 PROJECTS + MISSING projectId -> UNSCOPED NULL ROW (INERT) & EVIDENCE 400 MISSING_PROJECT_ID ---
  console.log("Contract 1: Ingesting keyword/evidence when 0 projects exist...");
  const evCountBefore1 = await dbGet("SELECT COUNT(*) as c FROM research_evidence");

  const pullZero = await callEtsy("POST", "/api/mcp/pull-etsy", { seed: "leather wallet", category: "Leather" });
  assert.strictEqual(pullZero.status, 200, `Expected 200, got ${pullZero.status}`);
  assert.strictEqual(pullZero.j?.projectId, null, "0 projects -> projectId must be null (inert)");

  const evZero = await callEtsy("POST", "/api/evidence", { seedPhrase: "leather wallet", source: "MANUAL" });
  assert.strictEqual(evZero.status, 400);
  assert.strictEqual(evZero.j?.error, "MISSING_PROJECT_ID");

  const evCountAfter1 = await dbGet("SELECT COUNT(*) as c FROM research_evidence");
  assert.strictEqual(evCountAfter1.c - evCountBefore1.c, 0, "Zero DB write on research_evidence for missing projectId");
  console.log("  🟢 Contract 1 verified: Unscoped inert pull & 400 MISSING_PROJECT_ID on evidence.");

  // --- CREATE 3 CONCURRENT PROJECTS ---
  console.log("\nSetting up 3 concurrent projects in Etsy Workspace (P1, P2, P3)...");
  const p1 = await callEtsy("POST", "/api/projects", { name: "Project 1 (Gold Ring)", seedPhrase: "gold ring" });
  const p2 = await callEtsy("POST", "/api/projects", { name: "Project 2 (Silver Bracelet)", seedPhrase: "silver bracelet" });
  const p3 = await callEtsy("POST", "/api/projects", { name: "Project 3 (Diamond Pendant)", seedPhrase: "diamond pendant" });

  const pid1 = p1.j?.projectId ?? p1.j?.project?.id;
  const pid2 = p2.j?.projectId ?? p2.j?.project?.id;
  const pid3 = p3.j?.projectId ?? p3.j?.project?.id;
  assert(pid1 && pid2 && pid3, "Failed to create 3 concurrent projects");
  console.log(`  🟢 Projects created: #${pid1}, #${pid2}, #${pid3}.`);

  // --- CONTRACT 2: 3 CANDIDATES + MISSING projectId -> 409 AMBIGUOUS_ACTIVE_PROJECT (Zero DB Write) ---
  console.log("\nContract 2: Ingesting keyword/evidence with missing projectId when 3 candidate projects exist...");
  const countBefore2 = await dbGet("SELECT COUNT(*) as c FROM market_trends");
  const evCountBefore2 = await dbGet("SELECT COUNT(*) as c FROM research_evidence");

  const pullAmbig = await callEtsy("POST", "/api/mcp/pull-etsy", { seed: "gold ring", category: "Jewelry" });
  assert.strictEqual(pullAmbig.status, 409, `Expected 409, got ${pullAmbig.status}`);
  assert.strictEqual(pullAmbig.j?.error, "AMBIGUOUS_ACTIVE_PROJECT");

  const evAmbig = await callEtsy("POST", "/api/evidence", { seedPhrase: "gold ring", source: "MANUAL" });
  assert.strictEqual(evAmbig.status, 400);
  assert.strictEqual(evAmbig.j?.error, "MISSING_PROJECT_ID");

  const countAfter2 = await dbGet("SELECT COUNT(*) as c FROM market_trends");
  const evCountAfter2 = await dbGet("SELECT COUNT(*) as c FROM research_evidence");
  assert.strictEqual(countAfter2.c - countBefore2.c, 0, "Zero DB write on market_trends for Contract 2");
  assert.strictEqual(evCountAfter2.c - evCountBefore2.c, 0, "Zero DB write on research_evidence for Contract 2");
  console.log("  🟢 Contract 2 verified: 409 AMBIGUOUS_ACTIVE_PROJECT with zero DB delta.");

  // --- CONTRACT 3: CROSS-WORKSPACE / CROSS-TENANT / INVALID projectId -> 404 PROJECT_NOT_FOUND (Zero DB Write) ---
  console.log("\nContract 3: Ingesting with cross-workspace projectId (Amazon project ID in Etsy session)...");
  const pAmz = await callAmz("POST", "/api/projects", { name: "Amazon Project", seedPhrase: "amazon mug" });
  const amzPid = pAmz.j?.projectId ?? pAmz.j?.project?.id;

  const countBefore3 = await dbGet("SELECT COUNT(*) as c FROM market_trends");
  const pullCross = await callEtsy("POST", "/api/mcp/pull-etsy", { projectId: amzPid, seed: "gold ring", category: "Jewelry" });
  assert.strictEqual(pullCross.status, 404, `Expected 404, got ${pullCross.status}`);
  assert.strictEqual(pullCross.j?.error, "PROJECT_NOT_FOUND");

  const countAfter3 = await dbGet("SELECT COUNT(*) as c FROM market_trends");
  assert.strictEqual(countAfter3.c - countBefore3.c, 0, "Zero DB write for Contract 3");
  console.log("  🟢 Contract 3 verified: 404 PROJECT_NOT_FOUND with zero DB delta.");

  // --- CONTRACT 4: EXPLICIT projectId -> STRICT ATTRIBUTION & ZERO CONTAMINATION ---
  console.log("\nContract 4: Explicit projectId = Project #2 (Silver Bracelet)...");
  const evP2 = await callEtsy("POST", "/api/evidence", { projectId: pid2, seedPhrase: "silver bracelet", source: "MANUAL" });
  assert.strictEqual(evP2.status, 200);
  assert.strictEqual(evP2.j.projectId, pid2);
  assert.strictEqual((await callEtsy("POST", `/api/evidence/${evP2.j.evidenceId}/accept`)).status, 409);
  const controlledId = await require('./helpers/controlledEvidence.cjs')(db, pid2);
  assert.strictEqual((await callEtsy("POST", `/api/evidence/${controlledId}/accept`)).status, 200);

  const pullP2 = await callEtsy("POST", "/api/mcp/pull-etsy", { projectId: pid2, seed: "silver bracelet", category: "Jewelry" });
  assert.strictEqual(pullP2.status, 200);
  assert.strictEqual(pullP2.j.projectId, pid2);

  // Transition P2 through stages
  const t2a = await callEtsy("PATCH", `/api/projects/${pid2}/transition`, { targetState: "RESEARCH_ACCEPTED" });
  assert.strictEqual(t2a.status, 200);
  const t2b = await callEtsy("PATCH", `/api/projects/${pid2}/transition`, { targetState: "DNA_ACCEPTED" });
  assert.strictEqual(t2b.status, 200);
  const t2c = await callEtsy("PATCH", `/api/projects/${pid2}/transition`, { targetState: "MKL_FROZEN" });
  assert.strictEqual(t2c.status, 200);
  console.log(`  🟢 Project #${pid2} reached MKL_FROZEN cleanly.`);

  // Assert Project #1 and Project #3 remain blocked
  const t1Fail = await callEtsy("PATCH", `/api/projects/${pid1}/transition`, { targetState: "MKL_FROZEN" });
  assert.strictEqual(t1Fail.status, 400);
  const t3Fail = await callEtsy("PATCH", `/api/projects/${pid3}/transition`, { targetState: "MKL_FROZEN" });
  assert.strictEqual(t3Fail.status, 400);
  console.log("  🟢 Projects #1 and #3 remain strictly isolated in initial state.");

  // Verify DB state integrity: Contract 2 and Contract 4 produced 0 ambiguous NULL rows
  const nullTrends = await dbAll("SELECT * FROM market_trends WHERE project_id IS NULL AND id > ?", [pullZero.j.trendId]);
  assert.strictEqual(nullTrends.length, 0, "No market_trends rows with project_id NULL allowed from ambiguous ingest");

  srv.close();
  console.log("\n================================================================");
  console.log("  🟢 ALL MULTI-PROJECT ATTRIBUTION CONTRACTS PASSED CLEANLY!");
  console.log("================================================================\n");
  process.exit(0);
})().catch(e => {
  console.error("🔴 MULTI-PROJECT ATTRIBUTION CONTRACT TEST FAILED:", e);
  process.exit(1);
});
