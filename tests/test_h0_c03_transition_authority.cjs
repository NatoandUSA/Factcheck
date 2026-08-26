const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'h0-c03-'));
process.env.NODE_ENV = 'test';
process.env.OMNI_DB_PATH = path.join(tmpRoot, 'c03.db');
process.env.OMNI_IMPORTS_DIR = path.join(tmpRoot, 'imports');

const { app, db, databaseReady } = require('../server/server');
const { createSessionRecord } = require('../server/security/session');
const { deriveControlledEvidenceEnvelope } = require('../server/evidenceAuthority');

const get = (sql, p = []) => new Promise((ok, bad) => db.get(sql, p, (e, r) => e ? bad(e) : ok(r)));
const run = (sql, p = []) => new Promise((ok, bad) => db.run(sql, p, function(e) { e ? bad(e) : ok({ lastID: this.lastID, changes: this.changes }); }));
const sessionFor = (u, w, t) => new Promise((ok, bad) => createSessionRecord(db, u, w, t, (e, s) => e ? bad(e) : ok(s)));

async function ownerFixture() {
  for (let i = 0; i < 300; i++) {
    const r = await get(`SELECT u.id user_id,w.id workspace_id,w.tenant_id,w.marketplace
      FROM users u JOIN workspace_memberships wm ON wm.user_id=u.id
      JOIN workspaces w ON w.id=wm.workspace_id
      WHERE u.email='owner@omniseller.local' AND w.marketplace='AMAZON' LIMIT 1`);
    if (r) return r;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error('owner fixture timeout');
}

const edges = [
  ['EVIDENCE_INTAKE','RESEARCH_ACCEPTED'],
  ['RESEARCH_ACCEPTED','DNA_ACCEPTED'],
  ['DNA_ACCEPTED','MKL_FROZEN'],
  ['MKL_FROZEN','DRAFT_GENERATED'],
  ['MKL_FROZEN','PRODUCT_TRUTH_VERIFIED'],
  ['MKL_FROZEN','PRODUCT_TRUTH_CONFIRMED'],
  ['DRAFT_GENERATED','PRODUCT_TRUTH_VERIFIED'],
  ['DRAFT_GENERATED','VALIDATED'],
  ['PRODUCT_TRUTH_VERIFIED','MANAGER_APPROVED'],
  ['PRODUCT_TRUTH_CONFIRMED','DRAFT_GENERATED'],
  ['VALIDATED','MANAGER_APPROVED'],
  ['MANAGER_APPROVED','PUBLISH_READY']
];

async function project(o, state, n) {
  if (state === 'PRODUCT_TRUTH_VERIFIED') await run('PRAGMA ignore_check_constraints=ON');
  try {
    return (await run(`INSERT INTO research_projects
      (tenant_id,workspace_id,marketplace,name,seed_phrase,state,actor_id,product_truth_notes)
      VALUES (?,?,?,?,?,?,?,'verified notes')`,
    [o.tenant_id,o.workspace_id,o.marketplace,`C03-${n}`,`seed-${n}`,state,o.user_id])).lastID;
  } finally {
    if (state === 'PRODUCT_TRUTH_VERIFIED') await run('PRAGMA ignore_check_constraints=OFF');
  }
}

async function legacyAccepted(o, pid) {
  await run(`INSERT INTO research_evidence
    (tenant_id,workspace_id,marketplace,project_id,seed_phrase,source,actor_id,evidence_state,metadata)
    VALUES (?,?,?,?,'legacy','MANUAL',?,'ACCEPTED',?)`,
  [o.tenant_id,o.workspace_id,o.marketplace,pid,o.user_id,JSON.stringify({kind:'GENERIC_NON_AUTHORITY_V1',authority:'NON_AUTHORITY'})]);
}

async function targetFixture(o, pid, target) {
  if (target === 'MKL_FROZEN') await run(`INSERT INTO market_trends
    (category,trending_keywords,marketplace,tenant_id,workspace_id,project_id) VALUES ('C03','kw',?,?,?,?)`,
  [o.marketplace,o.tenant_id,o.workspace_id,pid]);
  const status = target === 'MANAGER_APPROVED' ? 'MANAGER_APPROVED' : target === 'PUBLISH_READY' ? 'PUBLISH_READY' : 'NEEDS_QA';
  if (['DRAFT_GENERATED','PRODUCT_TRUTH_VERIFIED','MANAGER_APPROVED','PUBLISH_READY'].includes(target)) {
    await run(`INSERT INTO listings
      (tenant_id,workspace_id,marketplace,project_id,amazonTitle,categoryName,status,authorId,payload,product_truth_notes)
      VALUES (?,?,?,?,'C03','C03',?,?,'{}','verified listing truth')`,
    [o.tenant_id,o.workspace_id,o.marketplace,pid,status,o.user_id]);
  }
}

async function digest(pid) {
  return {
    project: await get('SELECT state,updated_at,validated_at,validated_by FROM research_projects WHERE id=?',[pid]),
    events: Number((await get('SELECT COUNT(*) c FROM project_transition_events WHERE project_id=?',[pid])).c),
    logs: Number((await get('SELECT COUNT(*) c FROM agent_logs')).c)
  };
}

async function controlled(o, pid) {
  const env = deriveControlledEvidenceEnvelope({ provider:'H10_MCP', payload:{rows:[{asin:'B0C03AUTH1',rank:1}]}, scope:{
    tenantId:o.tenant_id, workspaceId:o.workspace_id, marketplace:o.marketplace, projectId:pid, evidenceVersion:1
  }});
  return (await run(`INSERT INTO research_evidence
    (tenant_id,workspace_id,marketplace,project_id,seed_phrase,source,actor_id,evidence_state,metadata)
    VALUES (?,?,?,?,'controlled','MCP_RETRIEVAL',?,'OBSERVED',?)`,
  [o.tenant_id,o.workspace_id,o.marketplace,pid,o.user_id,JSON.stringify(env.metadata)])).lastID;
}

(async () => {
  await databaseReady;
  const o = await ownerFixture();
  const s = await sessionFor(o.user_id,o.workspace_id,o.tenant_id);
  const token = s.rawToken || s.token || s;
  const server = app.listen(0,'127.0.0.1');
  await new Promise(r => server.once('listening',r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = {'Content-Type':'application/json',Origin:'http://localhost:3001',Cookie:`omni_session=${token}`};
  try {
    for (let i=0;i<edges.length;i++) {
      const [from,target] = edges[i];
      const pid = await project(o,from,i);
      await legacyAccepted(o,pid);
      await targetFixture(o,pid,target);
      const before = await digest(pid);
      const r = await fetch(`${base}/api/projects/${pid}/transition`,{method:'PATCH',headers,body:JSON.stringify({targetState:target,productTruthNotes:'verified product truth notes'})});
      const j = await r.json();
      assert.strictEqual(r.status,400,`${from}->${target} must reject legacy ACCEPTED`);
      assert.strictEqual(j.error,'MISSING_QUALIFYING_EVIDENCE_PRECONDITION',`${from}->${target} must recompute authority`);
      assert.deepStrictEqual(await digest(pid),before,`${from}->${target} must be zero-write`);
    }

    const illegal = await project(o,'EVIDENCE_INTAKE','illegal');
    const bad = await fetch(`${base}/api/projects/${illegal}/transition`,{method:'PATCH',headers,body:JSON.stringify({targetState:'PUBLISH_READY'})});
    assert.strictEqual(bad.status,400);
    assert.strictEqual((await bad.json()).error,'INVALID_STATE_TRANSITION');

    const goodPid = await project(o,'DRAFT_GENERATED','positive');
    const eid = await controlled(o,goodPid);
    const a = await fetch(`${base}/api/evidence/${eid}/accept`,{method:'POST',headers,body:'{}'});
    assert.strictEqual(a.status,200);
    const beforeEvents = Number((await get('SELECT COUNT(*) c FROM project_transition_events WHERE project_id=?',[goodPid])).c);
    const good = await fetch(`${base}/api/projects/${goodPid}/transition`,{method:'PATCH',headers,body:JSON.stringify({targetState:'VALIDATED'})});
    assert.strictEqual(good.status,200);
    assert.strictEqual((await good.json()).state,'VALIDATED');
    assert.strictEqual(Number((await get('SELECT COUNT(*) c FROM project_transition_events WHERE project_id=?',[goodPid])).c),beforeEvents+1);

    console.log(`PASS C-03: ${edges.length}/${edges.length} declared transition edges reject legacy ACCEPTED non-authority with zero writes.`);
    console.log('PASS C-03: illegal edge keeps INVALID_STATE_TRANSITION precedence.');
    console.log('PASS C-03: qualifying controlled evidence unlocks downstream VALIDATED transition.');
  } finally {
    await new Promise(r => server.close(r));
    await new Promise(r => db.close(r));
    fs.rmSync(tmpRoot,{recursive:true,force:true});
  }
})().catch(e => { console.error('FAIL H0 C-03:',e); try{db.close(()=>{});}catch(_){}; try{fs.rmSync(tmpRoot,{recursive:true,force:true});}catch(_){}; process.exit(1); });