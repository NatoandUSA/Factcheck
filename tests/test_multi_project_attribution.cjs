/**
 * MULTI-PROJECT ATTRIBUTION & SILENT MISATTRIBUTION PREVENTION TEST
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
    const rows = await dbAll(`SELECT u.id user_id, w.tenant_id, wm.workspace_id, wm.role, w.marketplace
                            FROM workspace_memberships wm
                            JOIN users u ON u.id = wm.user_id
                            JOIN workspaces w ON w.id = wm.workspace_id`);
    const hasOwnerEtsy = rows.some(f => f.role === "OWNER" && f.marketplace === "ETSY");
    if (hasOwnerEtsy) return rows;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error("Timed out waiting for fixtures");
}

(async () => {
  await databaseReady;
  const fx = await waitForFixtures();
  const ownerEtsy = fx.find(f => f.role === "OWNER" && f.marketplace === "ETSY");

  const srv = app.listen(0);
  const port = srv.address().port;
  const base = `http://127.0.0.1:${port}`;
  process.env.ALLOWED_ORIGINS = `http://127.0.0.1:${port}`;

  const sEtsy = await mkSess(ownerEtsy.user_id, ownerEtsy.workspace_id, ownerEtsy.tenant_id);
  const rawEtsy = sEtsy.rawToken || sEtsy.token || sEtsy;
  const H = { "Content-Type": "application/json", Origin: base, Cookie: `omni_session=${rawEtsy}` };

  const call = async (m, p, b) => {
    const r = await fetch(base + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined });
    let j = null; try { j = await r.json(); } catch (_) {}
    return { status: r.status, j };
  };

  console.log("================================================================");
  console.log("  TESTING MULTI-PROJECT ATTRIBUTION & MISATTRIBUTION PREVENTION");
  console.log("================================================================\n");

  // Step 1: Create 3 concurrent projects in the same workspace
  console.log("Step 1: Creating 3 concurrent projects (P1, P2, P3)...");
  const p1 = await call("POST", "/api/projects", { name: "Project Alpha (Gold Ring)", seedPhrase: "gold ring" });
  const p2 = await call("POST", "/api/projects", { name: "Project Beta (Silver Bracelet)", seedPhrase: "silver bracelet" });
  const p3 = await call("POST", "/api/projects", { name: "Project Gamma (Leather Wallet)", seedPhrase: "leather wallet" });

  const pid1 = p1.j?.projectId ?? p1.j?.project?.id;
  const pid2 = p2.j?.projectId ?? p2.j?.project?.id;
  const pid3 = p3.j?.projectId ?? p3.j?.project?.id;

  assert(pid1 && pid2 && pid3, "Failed to create 3 test projects");
  console.log(`  🟢 Projects created: #${pid1} (Alpha), #${pid2} (Beta), #${pid3} (Gamma).`);

  // Step 2: Evidence ingestion with explicit projectId for P1
  console.log("\nStep 2: Ingesting evidence explicitly targeted to P1...");
  const ev1 = await call("POST", "/api/evidence", { projectId: pid1, seedPhrase: "gold ring", source: "MANUAL" });
  assert.strictEqual(ev1.status, 200);
  await call("POST", `/api/evidence/${ev1.j.evidenceId}/accept`);

  // Step 3: Transition P1 to RESEARCH_ACCEPTED & DNA_ACCEPTED
  const t1 = await call("PATCH", `/api/projects/${pid1}/transition`, { targetState: "RESEARCH_ACCEPTED" });
  assert.strictEqual(t1.status, 200);
  const t1Dna = await call("PATCH", `/api/projects/${pid1}/transition`, { targetState: "DNA_ACCEPTED" });
  assert.strictEqual(t1Dna.status, 200);

  // Step 4: Attempt ambiguous keyword pull without projectId when 3 projects exist
  console.log("\nStep 4: Pulling MCP data without projectId when 3 candidate projects exist (Ambiguity check)...");
  const pullAmbiguous = await call("POST", "/api/mcp/pull-etsy", { seed: "silver bracelet", category: "Jewelry" });
  assert.strictEqual(pullAmbiguous.status, 200);
  // When 3 projects exist, resolveActiveProjectId must return null (projectId is null)
  assert.strictEqual(pullAmbiguous.j.projectId, null, "Ambiguous resolution must fail closed (projectId must be null)");
  console.log("  🟢 Ambiguous ingest without projectId safely failed closed (no silent misattribution).");

  // Step 5: Assert P1 cannot unlock MKL_FROZEN with unassigned keyword pull
  console.log("\nStep 5: Asserting P1 cannot freeze MKL using unassigned/ambiguous pull...");
  const t1MklFail = await call("PATCH", `/api/projects/${pid1}/transition`, { targetState: "MKL_FROZEN" });
  assert.strictEqual(t1MklFail.status, 400);
  assert.strictEqual(t1MklFail.j.error, "MISSING_MKL_PRECONDITION");
  console.log("  🟢 P1 correctly blocked from MKL_FROZEN (Precondition enforced).");

  // Step 6: Explicitly ingest keyword data for P1
  console.log("\nStep 6: Ingesting MCP data explicitly scoped to P1 (projectId = " + pid1 + ")...");
  const pullP1 = await call("POST", "/api/mcp/pull-etsy", { projectId: pid1, seed: "gold ring", category: "Jewelry" });
  assert.strictEqual(pullP1.status, 200);
  assert.strictEqual(pullP1.j.projectId, pid1);

  // Now P1 can freeze MKL!
  const t1MklOk = await call("PATCH", `/api/projects/${pid1}/transition`, { targetState: "MKL_FROZEN" });
  assert.strictEqual(t1MklOk.status, 200);
  console.log("  🟢 P1 successfully transitioned to MKL_FROZEN with its own scoped MKL data.");

  // Step 7: Assert P2 and P3 are still in initial states and cannot jump to MKL_FROZEN
  console.log("\nStep 7: Asserting P2 and P3 remain cleanly isolated...");
  const t2MklFail = await call("PATCH", `/api/projects/${pid2}/transition`, { targetState: "MKL_FROZEN" });
  assert.strictEqual(t2MklFail.status, 400);
  const t3MklFail = await call("PATCH", `/api/projects/${pid3}/transition`, { targetState: "MKL_FROZEN" });
  assert.strictEqual(t3MklFail.status, 400);
  console.log("  🟢 P2 and P3 remain strictly isolated and cannot hijack P1 evidence or MKL.");

  srv.close();
  console.log("\n================================================================");
  console.log("  🟢 MULTI-PROJECT ATTRIBUTION TEST PASSED CLEANLY!");
  console.log("================================================================\n");
  process.exit(0);
})().catch(e => {
  console.error("🔴 MULTI-PROJECT ATTRIBUTION TEST FAILED (SILENT MISATTRIBUTION DETECTED):", e);
  process.exit(1);
});
