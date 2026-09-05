const assert = require('node:assert/strict');
const fs = require('node:fs');
const cp = require('node:child_process');
const Module = require('node:module');
const mutated = process.argv.includes('--mutation');
const registryPath = require.resolve('../server/projectStateRegistry');
if (mutated) {
  const source = fs.readFileSync(registryPath, 'utf8');
  const anchor = "EVIDENCE_INTAKE: Object.freeze({ RESEARCH_ACCEPTED: 'QUALIFYING_RESEARCH' })";
  assert.ok(source.includes(anchor));
  const replacement = source.replace(anchor, "EVIDENCE_INTAKE: Object.freeze({ RESEARCH_ACCEPTED: 'QUALIFYING_RESEARCH', DNA_ACCEPTED: null })");
  const moduleCopy = new Module(registryPath, module);
  moduleCopy.filename = registryPath; moduleCopy.paths = module.paths;
  moduleCopy._compile(replacement, registryPath);
  require.cache[registryPath] = moduleCopy;
  // Mutation is a real changed registry consumed by the real route, not a
  // surrogate guard. Startup classification assertion must detect it too.
  assert.throws(() => moduleCopy.exports.assertRegistry(), /UNCLASSIFIED_PROJECT_TRANSITION/);
}
process.env.NODE_ENV = 'test';
const { app, db, databaseReady } = require('../server/server');
const { createSessionRecord } = require('../server/security/session');
const registry = require('../server/projectStateRegistry');
const all = (sql, args = []) => new Promise((resolve, reject) => db.all(sql, args, (e, rows) => e ? reject(e) : resolve(rows)));
const run = (sql, args = []) => new Promise((resolve, reject) => db.run(sql, args, function(e) { e ? reject(e) : resolve(this.lastID); }));
let server, measured = 0;
async function snapshot() {
  const out = {};
  for (const t of ['research_projects', 'research_evidence', 'project_transition_events', 'evidence_acceptance_events', 'market_trends', 'listings', 'agent_logs']) out[t] = await all(`SELECT * FROM ${t} ORDER BY rowid`);
  return out;
}
async function main() {
  await databaseReady;
  if (!mutated) { assert.equal(registry.assertRegistry(), 12); measured++; }
  const [o] = await all(`SELECT u.id AS userId,w.id AS workspaceId,w.tenant_id AS tenantId,w.marketplace FROM users u
    JOIN workspace_memberships m ON m.user_id=u.id JOIN workspaces w ON w.id=m.workspace_id
    WHERE u.email='owner@omniseller.local' AND w.marketplace='AMAZON'`);
  const session = await new Promise((resolve,reject) => createSessionRecord(db,o.userId,o.workspaceId,o.tenantId,(e,s) => e ? reject(e) : resolve(s)));
  server = app.listen(0,'127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const headers = { 'Content-Type':'application/json', Origin:'http://localhost:3001', Cookie:`omni_session=${session.rawToken}` };
  async function transition(id, target) {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api/projects/${id}/transition`, { method:'PATCH',headers,body:JSON.stringify({targetState:target,productTruthNotes:'legacy notes'}) });
    return { status:r.status, body:await r.json() };
  }
  async function project(state) {
    return run(`INSERT INTO research_projects(tenant_id,workspace_id,marketplace,name,seed_phrase,state,actor_id) VALUES (?,?,?,'C03','seed',?,?)`,[o.tenantId,o.workspaceId,o.marketplace,state,o.userId]);
  }
  if (mutated) {
    const id = await project('EVIDENCE_INTAKE');
    const eid = await require('./helpers/controlledEvidence.cjs')(db,id);
    await run("UPDATE research_evidence SET evidence_state='ACCEPTED' WHERE id=?",[eid]);
    const before = await snapshot();
    const r = await transition(id,'DNA_ACCEPTED');
    assert.equal(r.status,400);assert.equal(r.body.error,'INVALID_STATE_TRANSITION');
    assert.deepEqual(await snapshot(),before);measured++;
    console.log('H0-B mutation measured=1 passed=1 failed=0 unexecuted=0');
    return;
  }
  for (const [from, targets] of Object.entries(registry.transitions)) for (const target of targets) {
    const id = await project(from);
    await run(`INSERT INTO research_evidence(tenant_id,workspace_id,marketplace,project_id,seed_phrase,source,actor_id,evidence_state,metadata)
      VALUES (?,?,?,?,'seed','MANUAL',?,'ACCEPTED','{}')`,[o.tenantId,o.workspaceId,o.marketplace,id,o.userId]);
    const before = await snapshot();
    const r = await transition(id,target);
    assert.equal(r.status,400,JSON.stringify(r)); assert.equal(r.body.error,'MISSING_QUALIFYING_EVIDENCE_PRECONDITION');
    assert.deepEqual(await snapshot(),before); measured++;
  }
  for (const [from,target] of [['MKL_FROZEN','PRODUCT_TRUTH_VERIFIED'],['DRAFT_GENERATED','PRODUCT_TRUTH_VERIFIED'],['PRODUCT_TRUTH_VERIFIED','MANAGER_APPROVED']]) {
    const id = await project(from);
    const eid = await require('./helpers/controlledEvidence.cjs')(db,id);
    await run("UPDATE research_evidence SET evidence_state='ACCEPTED' WHERE id=?",[eid]);
    await run(`INSERT INTO listings(tenant_id,workspace_id,marketplace,project_id,amazonTitle,categoryName,status,authorId,payload,product_truth_notes)
      VALUES (?,?,?,?,'C03','C03','MANAGER_APPROVED',?,'{}','legacy verified notes')`,[o.tenantId,o.workspaceId,o.marketplace,id,o.userId]);
    const beforeEvents = (await all('SELECT * FROM project_transition_events WHERE project_id=?',[id])).length;
    const r = await transition(id,target); assert.equal(r.status,200,JSON.stringify(r));
    assert.equal((await all('SELECT state FROM research_projects WHERE id=?',[id]))[0].state,target);
    assert.equal((await all('SELECT * FROM project_transition_events WHERE project_id=?',[id])).length,beforeEvents+1); measured++;
  }
  const illegal = await project('EVIDENCE_INTAKE'); const before = await snapshot();
  assert.equal((await transition(illegal,'UNKNOWN')).status,400); assert.deepEqual(await snapshot(),before); measured++;
  const mutation = cp.spawnSync(process.execPath,[__filename,'--mutation'],{encoding:'utf8',timeout:60000});
  assert.equal(mutation.status,0,mutation.stdout+mutation.stderr);
  assert.match(mutation.stdout,/mutation measured=1/);measured++;
  assert.ok(measured > 0);
  console.log(`H0-B C03 measured=${measured} passed=${measured} failed=0 unexecuted=0`);
}
main().catch(e => { console.error(e);process.exitCode=1; }).finally(async()=>{if(server)await new Promise(r=>server.close(r));await new Promise(r=>db.close(r));});
