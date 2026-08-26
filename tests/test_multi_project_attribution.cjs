/**
 * MULTI-PROJECT ATTRIBUTION & CANONICAL ERROR CONTRACT SUITE
 */
const assert = require("assert");
process.env.NODE_ENV = "test";

const { app, db, databaseReady } = require("../server/server");
const { createSessionRecord } = require("../server/security/session");
const { deriveControlledEvidenceEnvelope } = require("../server/evidenceAuthority");

const dbAll = (s, p = []) => new Promise((r, j) => db.all(s, p, (e, x) => e ? j(e) : r(x)));
const dbGet = (s, p = []) => new Promise((r, j) => db.get(s, p, (e, x) => e ? j(e) : r(x)));
const dbRun = (s, p = []) => new Promise((r, j) => db.run(s, p, function(e) { e ? j(e) : r({ lastID: this.lastID, changes: this.changes }); }));
const mkSess = (u, w, t) => new Promise((r, j) => createSessionRecord(db, u, w, t, (e, s) => e ? j(e) : r(s)));

async function waitForFixtures(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await dbAll(`SELECT u.id user_id, w.tenant_id, wm.workspace_id, wm.role, w.marketplace
                            FROM workspace_memberships wm JOIN users u ON u.id = wm.user_id JOIN workspaces w ON w.id = wm.workspace_id`);
    if (rows.some(f => f.role === "OWNER" && f.marketplace === "AMAZON") && rows.some(f => f.role === "OWNER" && f.marketplace === "ETSY")) return rows;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error("Timed out waiting for fixtures");
}

async function insertControlledEvidence(fixture, projectId, seedPhrase) {
  const envelope = deriveControlledEvidenceEnvelope({
    provider: "YTRENDS_MCP",
    payload: { keywords: [{ keyword: seedPhrase, observed: true }] },
    scope: { tenantId: fixture.tenant_id, workspaceId: fixture.workspace_id, marketplace: fixture.marketplace, projectId, evidenceVersion: 1 }
  });
  const row = await dbRun(`INSERT INTO research_evidence
    (tenant_id, workspace_id, marketplace, project_id, seed_phrase, source, actor_id, evidence_state, metadata)
    VALUES (?, ?, ?, ?, ?, 'MCP_RETRIEVAL', ?, 'OBSERVED', ?)`,
    [fixture.tenant_id, fixture.workspace_id, fixture.marketplace, projectId, seedPhrase, fixture.user_id, JSON.stringify(envelope.metadata)]);
  return row.lastID;
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
  const H_AMZ = { "Content-Type": "application/json", Origin: base, Cookie: `omni_session=${sAmz.rawToken || sAmz.token || sAmz}` };
  const H_ETSY = { "Content-Type": "application/json", Origin: base, Cookie: `omni_session=${sEtsy.rawToken || sEtsy.token || sEtsy}` };
  const call = async (headers, m, p, b) => {
    const r = await fetch(base + p, { method: m, headers, body: b ? JSON.stringify(b) : undefined });
    let j = null; try { j = await r.json(); } catch (_) {}
    return { status: r.status, j };
  };
  const callAmz = (m, p, b) => call(H_AMZ, m, p, b);
  const callEtsy = (m, p, b) => call(H_ETSY, m, p, b);

  console.log("================================================================");
  console.log("  TESTING MULTI-PROJECT ATTRIBUTION & CANONICAL ERROR CONTRACT");
  console.log("================================================================\n");

  console.log("Contract 1: Ingesting keyword/evidence when 0 projects exist...");
  const evCountBefore1 = await dbGet("SELECT COUNT(*) as c FROM research_evidence");
  const pullZero = await callEtsy("POST", "/api/mcp/pull-etsy", { seed: "leather wallet", category: "Leather" });
  assert.strictEqual(pullZero.status, 200);
  assert.strictEqual(pullZero.j?.projectId, null);
  const evZero = await callEtsy("POST", "/api/evidence", { seedPhrase: "leather wallet", source: "MANUAL" });
  assert.strictEqual(evZero.status, 400);
  assert.strictEqual(evZero.j?.error, "MISSING_PROJECT_ID");
  assert.strictEqual((await dbGet("SELECT COUNT(*) as c FROM research_evidence")).c - evCountBefore1.c, 0);

  console.log("\nSetting up 3 concurrent projects in Etsy Workspace...");
  const p1 = await callEtsy("POST", "/api/projects", { name: "Project 1 (Gold Ring)", seedPhrase: "gold ring" });
  const p2 = await callEtsy("POST", "/api/projects", { name: "Project 2 (Silver Bracelet)", seedPhrase: "silver bracelet" });
  const p3 = await callEtsy("POST", "/api/projects", { name: "Project 3 (Diamond Pendant)", seedPhrase: "diamond pendant" });
  const pid1 = p1.j?.projectId ?? p1.j?.project?.id;
  const pid2 = p2.j?.projectId ?? p2.j?.project?.id;
  const pid3 = p3.j?.projectId ?? p3.j?.project?.id;
  assert(pid1 && pid2 && pid3);

  console.log("\nContract 2: Ambiguous active project fails with zero writes...");
  const countBefore2 = await dbGet("SELECT COUNT(*) as c FROM market_trends");
  const evCountBefore2 = await dbGet("SELECT COUNT(*) as c FROM research_evidence");
  const pullAmbig = await callEtsy("POST", "/api/mcp/pull-etsy", { seed: "gold ring", category: "Jewelry" });
  assert.strictEqual(pullAmbig.status, 409);
  assert.strictEqual(pullAmbig.j?.error, "AMBIGUOUS_ACTIVE_PROJECT");
  const evAmbig = await callEtsy("POST", "/api/evidence", { seedPhrase: "gold ring", source: "MANUAL" });
  assert.strictEqual(evAmbig.status, 400);
  assert.strictEqual((await dbGet("SELECT COUNT(*) as c FROM market_trends")).c - countBefore2.c, 0);
  assert.strictEqual((await dbGet("SELECT COUNT(*) as c FROM research_evidence")).c - evCountBefore2.c, 0);

  console.log("\nContract 3: Cross-workspace projectId fails with zero write...");
  const pAmz = await callAmz("POST", "/api/projects", { name: "Amazon Project", seedPhrase: "amazon mug" });
  const amzPid = pAmz.j?.projectId ?? pAmz.j?.project?.id;
  const countBefore3 = await dbGet("SELECT COUNT(*) as c FROM market_trends");
  const pullCross = await callEtsy("POST", "/api/mcp/pull-etsy", { projectId: amzPid, seed: "gold ring", category: "Jewelry" });
  assert.strictEqual(pullCross.status, 404);
  assert.strictEqual(pullCross.j?.error, "PROJECT_NOT_FOUND");
  assert.strictEqual((await dbGet("SELECT COUNT(*) as c FROM market_trends")).c - countBefore3.c, 0);

  console.log("\nContract 4: Explicit projectId stays strictly attributed and authority-gated...");
  const evP2 = await callEtsy("POST", "/api/evidence", { projectId: pid2, seedPhrase: "silver bracelet", source: "MANUAL" });
  assert.strictEqual(evP2.status, 200);
  assert.strictEqual(evP2.j.projectId, pid2);
  const genericAccept = await callEtsy("POST", `/api/evidence/${evP2.j.evidenceId}/accept`);
  assert.strictEqual(genericAccept.status, 409, "Explicit scope must not turn generic evidence into authority");

  const controlledId = await insertControlledEvidence(ownerEtsy, pid2, "silver bracelet");
  const controlledAccept = await callEtsy("POST", `/api/evidence/${controlledId}/accept`);
  assert.strictEqual(controlledAccept.status, 200);

  const pullP2 = await callEtsy("POST", "/api/mcp/pull-etsy", { projectId: pid2, seed: "silver bracelet", category: "Jewelry" });
  assert.strictEqual(pullP2.status, 200);
  assert.strictEqual(pullP2.j.projectId, pid2);
  assert.strictEqual((await callEtsy("PATCH", `/api/projects/${pid2}/transition`, { targetState: "RESEARCH_ACCEPTED" })).status, 200);
  assert.strictEqual((await callEtsy("PATCH", `/api/projects/${pid2}/transition`, { targetState: "DNA_ACCEPTED" })).status, 200);
  assert.strictEqual((await callEtsy("PATCH", `/api/projects/${pid2}/transition`, { targetState: "MKL_FROZEN" })).status, 200);

  assert.strictEqual((await callEtsy("PATCH", `/api/projects/${pid1}/transition`, { targetState: "MKL_FROZEN" })).status, 400);
  assert.strictEqual((await callEtsy("PATCH", `/api/projects/${pid3}/transition`, { targetState: "MKL_FROZEN" })).status, 400);
  const nullTrends = await dbAll("SELECT * FROM market_trends WHERE project_id IS NULL AND id > ?", [pullZero.j.trendId]);
  assert.strictEqual(nullTrends.length, 0);

  srv.close();
  console.log("\n================================================================");
  console.log("  🟢 ALL MULTI-PROJECT ATTRIBUTION & H0 AUTHORITY CONTRACTS PASSED CLEANLY!");
  console.log("================================================================\n");
  process.exit(0);
})().catch(e => {
  console.error("🔴 MULTI-PROJECT ATTRIBUTION CONTRACT TEST FAILED:", e);
  process.exit(1);
});
