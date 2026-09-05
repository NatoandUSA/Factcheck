const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
const { app, db, databaseReady } = require('../server/server');
const { createSessionRecord } = require('../server/security/session');
const { makeProductTruthCard } = require('./helpers/productTruth.cjs');
const { runMigrations } = require('../server/database/migrations');
const all = (sql,args=[]) => new Promise((resolve,reject)=>db.all(sql,args,(e,r)=>e?reject(e):resolve(r)));
const run = (sql,args=[]) => new Promise((resolve,reject)=>db.run(sql,args,function(e){e?reject(e):resolve(this.lastID);}));
let server, measured=0;
async function snapshot(){const out={};for(const t of ['listings','research_projects','research_evidence','project_transition_events','evidence_acceptance_events','market_trends','agent_logs'])out[t]=await all(`SELECT * FROM ${t} ORDER BY rowid`);return out;}
async function main(){
  await databaseReady;
  const [owner]=await all(`SELECT u.id userId,w.id workspaceId,w.tenant_id tenantId,w.marketplace FROM users u JOIN workspace_memberships m ON m.user_id=u.id JOIN workspaces w ON w.id=m.workspace_id WHERE u.email='owner@omniseller.local' AND w.marketplace='AMAZON'`);
  const session=await new Promise((resolve,reject)=>createSessionRecord(db,owner.userId,owner.workspaceId,owner.tenantId,(e,s)=>e?reject(e):resolve(s)));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const headers={'Content-Type':'application/json',Origin:'http://localhost:3001',Cookie:`omni_session=${session.rawToken}`};
  async function request(route,method='PATCH',body={}){const r=await fetch(`http://127.0.0.1:${server.address().port}${route}`,{method,headers,...(method==='GET'?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};}
  const projectId=await run(`INSERT INTO research_projects(tenant_id,workspace_id,marketplace,name,seed_phrase,state,actor_id) VALUES (?,?,?,'Publish','neutral gift','MANAGER_APPROVED',?)`,[owner.tenantId,owner.workspaceId,owner.marketplace,owner.userId]);
  const eid=await require('./helpers/controlledEvidence.cjs')(db,projectId);
  await run("UPDATE research_evidence SET evidence_state='ACCEPTED' WHERE id=?",[eid]);
  const payload={amazonTitle:'Neutral Family Gift Idea',amazonDescription:'Human checked neutral product description.',amazonBullets:['One','Two','Three','Four','Five'],amazonSearchTerms:'neutral family gift',netProfit:8.5,netMargin:35,categoryName:'APPAREL'};
  const listingId=await run(`INSERT INTO listings(tenant_id,workspace_id,marketplace,project_id,amazonTitle,categoryName,status,authorId,payload)
    VALUES (?,?,?,?,'Neutral Family Gift Idea','APPAREL','NEEDS_QA',?,?)`,[owner.tenantId,owner.workspaceId,owner.marketplace,projectId,owner.userId,JSON.stringify(payload)]);
  const approved=await request(`/api/listings/${listingId}/approve`,'PATCH',{expectedVersion:1,productTruthCard:makeProductTruthCard(listingId,1)});
  assert.equal(approved.status,200,JSON.stringify(approved));measured++;
  const [baseline]=await all('SELECT * FROM listings WHERE id=?',[listingId]);
  const [otherUser]=await all('SELECT id FROM users WHERE id<>? LIMIT 1',[owner.userId]);
  const [otherWorkspace]=await all('SELECT id FROM workspaces WHERE id<>? LIMIT 1',[owner.workspaceId]);
  const otherProject=await run(`INSERT INTO research_projects(tenant_id,workspace_id,marketplace,name,seed_phrase,actor_id) VALUES (?,?,?,'Other','other',?)`,[owner.tenantId,owner.workspaceId,owner.marketplace,owner.userId]);
  assert.match(baseline.approved_context_hash,/^[a-f0-9]{64}$/);measured++;
  const exportGood=await request(`/api/listings/${listingId}/export`,'GET');assert.equal(exportGood.status,200,JSON.stringify(exportGood));measured++;
  const target=`/api/projects/${projectId}/transition`;
  async function reject(route,method,body,status){const before=await snapshot();const r=await request(route,method,body);assert.equal(r.status,status,JSON.stringify(r));assert.deepEqual(await snapshot(),before);measured++;}
  const transition={targetState:'PUBLISH_READY',listingId,expectedVersion:1};
  await reject(target,'PATCH',{...transition,expectedVersion:999},412);
  await reject(target,'PATCH',{...transition,listingId:999999},404);
  await reject(target,'PATCH',{...transition,expectedVersion:'1'},400);
  for(const [column,value] of [
    ['payload',JSON.stringify({...payload,amazonTitle:'changed'})],['payload','bad json'],
    ['listing_version',2],['approved_version',2],['approved_hash','f'.repeat(64)],
    ['approved_context_hash',null],['approved_by',otherUser.id],['approved_at',null],
    ['product_truth_card',JSON.stringify(makeProductTruthCard(listingId,2))],
    ['product_truth_card',JSON.stringify(makeProductTruthCard(listingId,1,{state:'UNVERIFIED'}))],
    ['project_id',otherProject],['tenant_id','wrong'],['workspace_id',otherWorkspace.id],['marketplace','ETSY']
  ]){
    await run(`UPDATE listings SET ${column}=? WHERE id=?`,[value,listingId]);
    // Without a client selection, missing scope is a non-enumerating project
    // precondition failure. Exact selected listing uses 404.
    await reject(target,'PATCH',{targetState:'PUBLISH_READY'},400);
    const routeStatus=['tenant_id','workspace_id','marketplace'].includes(column)?404:409;
    await reject(`/api/listings/${listingId}/export`,'GET',{},routeStatus);
    await run(`UPDATE listings SET ${column}=? WHERE id=?`,[baseline[column],listingId]);
  }
  // A valid-looking but edited Truth Card must invalidate its approval context.
  const card=JSON.parse(baseline.product_truth_card);card.facts.productType.value='HOME_DECOR';
  await run('UPDATE listings SET product_truth_card=? WHERE id=?',[JSON.stringify(card),listingId]);
  await reject(target,'PATCH',{targetState:'PUBLISH_READY'},400);
  await run('UPDATE listings SET product_truth_card=? WHERE id=?',[baseline.product_truth_card,listingId]);
  // Migration rerun cannot fill/repair a missing legacy approval hash.
  await run('ALTER TABLE listings DROP COLUMN approved_context_hash');
  await run("DELETE FROM schema_migrations WHERE id='2026-09-02_publish_approval_context'");
  const [preMigrationListing]=await all('SELECT * FROM listings WHERE id=?',[listingId]);
  await runMigrations(db);
  const [postMigrationListing]=await all('SELECT * FROM listings WHERE id=?',[listingId]);
  const {approved_context_hash:legacyContext,...preserved}=postMigrationListing;
  assert.equal(legacyContext,null);assert.deepEqual(preserved,preMigrationListing);measured++;
  const migrationOnce=await snapshot();await runMigrations(db);assert.deepEqual(await snapshot(),migrationOnce);measured++;
  await reject(target,'PATCH',{targetState:'PUBLISH_READY'},400);
  await run('UPDATE listings SET approved_context_hash=? WHERE id=?',[baseline.approved_context_hash,listingId]);
  // Even correctly bound stale policy artifacts must run the current gate.
  const { approvalContextHash }=require('../server/currentPublishDecision');
  const { approvalHash }=require('../server/security/approval');
  const poorPayload=JSON.stringify({...payload,netProfit:0});
  const poorRow={...baseline,payload:poorPayload};
  await run('UPDATE listings SET payload=?,approved_hash=?,approved_context_hash=? WHERE id=?',
    [poorPayload,approvalHash(JSON.parse(poorPayload)),approvalContextHash(poorRow,JSON.parse(baseline.product_truth_card)),listingId]);
  await reject(target,'PATCH',{targetState:'PUBLISH_READY'},400);
  await reject(`/api/listings/${listingId}/export`,'GET',{},403);
  await run('UPDATE listings SET payload=?,approved_hash=?,approved_context_hash=? WHERE id=?',
    [baseline.payload,baseline.approved_hash,baseline.approved_context_hash,listingId]);
  // Revoke the original approver while retaining a different OWNER request
  // principal, so the measured rejection is the approval gate, not authn.
  const [manager]=await all("SELECT id FROM users WHERE email='manager@omniseller.local'");
  const managerContext=approvalContextHash(baseline,JSON.parse(baseline.product_truth_card),manager.id);
  await run('UPDATE listings SET approved_by=?,approved_context_hash=? WHERE id=?',[manager.id,managerContext,listingId]);
  await run("UPDATE workspace_memberships SET role='SELLER' WHERE user_id=? AND workspace_id=?",[manager.id,owner.workspaceId]);
  await reject(target,'PATCH',{targetState:'PUBLISH_READY'},400);
  await reject(`/api/listings/${listingId}/export`,'GET',{},409);
  await run("UPDATE workspace_memberships SET role='MANAGER' WHERE user_id=? AND workspace_id=?",[manager.id,owner.workspaceId]);
  await run('UPDATE listings SET approved_by=?,approved_context_hash=? WHERE id=?',[baseline.approved_by,baseline.approved_context_hash,listingId]);
  const beforeEvents=(await all('SELECT * FROM project_transition_events WHERE project_id=?',[projectId])).length;
  const good=await request(target,'PATCH',transition);assert.equal(good.status,200,JSON.stringify(good));measured++;
  assert.equal((await all('SELECT state FROM research_projects WHERE id=?',[projectId]))[0].state,'PUBLISH_READY');measured++;
  assert.equal((await all('SELECT * FROM project_transition_events WHERE project_id=?',[projectId])).length,beforeEvents+1);measured++;
  assert.ok(measured>0);console.log(`H0-C measured=${measured} passed=${measured} failed=0 unexecuted=0`);
}
main().catch(e=>{console.error(e);console.error('measured before failure='+measured);process.exitCode=1;}).finally(async()=>{if(server)await new Promise(r=>server.close(r));await new Promise(r=>db.close(r));});
