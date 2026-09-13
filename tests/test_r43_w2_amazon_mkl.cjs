'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');
const sqlite3 = require('sqlite3').verbose();

process.env.NODE_ENV = 'test';
process.env.OMNI_MASTER_KEY ||= Buffer.alloc(32, 82).toString('base64');
process.env.OMNI_DB_PATH = path.join(__dirname, `.tmp-r43-w2-${process.pid}.sqlite`);
try { fs.unlinkSync(process.env.OMNI_DB_PATH); } catch (_) {}

const { app, db, databaseReady } = require('../server/server');
const { createSessionRecord } = require('../server/security/session');
const { getArtifactState } = require('../server/commerceWorkflowArtifactStore');
const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params,
  (error, row) => error ? reject(error) : resolve(row || null)));
const key = value => `82000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
let server; let dbClosed = false; let passed = 0;
function check(value, message) { assert.ok(value, message); passed++; }

async function generated(kind) {
  const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet(kind);
  if (kind === 'XRAY') sheet.addRows([
    ['ASIN', 'Product Details', 'Brand', 'Seller', 'Price $', 'ASIN Sales', 'ASIN Revenue', 'BSR', 'Review Count', 'Review Velocity', 'Seller Age (mo)', 'Creation Date'],
    ...Array.from({ length: 16 }, (_, i) => [`B0W2${String(i).padStart(6, '0')}`, `Para Mi Hija Necklace ${i}`,
      `Brand${i % 6}`, `Seller${i % 7}`, 20 + i, 1000 - i * 30, 25000 - i * 500, 100 + i * 20,
      50 + i * 10, 20 - i / 2, 1 + i, new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)])
  ]); else sheet.addRows([
    ['Keyword Phrase', 'Search Volume', 'Keyword Sales', 'Cerebro IQ Score', 'Position (Rank)', 'Ranking Competitors (Count)', 'Search Volume Trend', 'CPR', 'H10 PPC Sugg. Bid'],
    ['para mi hija', 2400, 80, 3100, 2, 8, 12, 17, 1.25],
    ['regalo para hija', 1800, 61, 2600, 4, 7, 9, 14, 1.1],
    ['collar hija espanol', 900, 35, 1700, 8, 6, 4, 11, .9],
    ['random unrelated phrase', 80, null, null, null, null, null, null, null]
  ]);
  return Buffer.from(await book.xlsx.writeBuffer());
}

async function main() {
  await databaseReady;
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`; process.env.ALLOWED_ORIGINS = origin;
  const users = await new Promise((resolve, reject) => db.all(`SELECT u.id AS userId,u.email,w.id AS workspaceId,w.tenant_id AS tenantId
    FROM users u JOIN workspace_memberships m ON m.user_id=u.id JOIN workspaces w ON w.id=m.workspace_id
    WHERE w.marketplace='AMAZON' AND u.email IN ('owner@omniseller.local','manager@omniseller.local')`, [],
  (error, rows) => error ? reject(error) : resolve(rows)));
  const makeClient = async email => {
    const user = users.find(item => item.email === email); check(Boolean(user), `${email} fixture exists`);
    const session = await new Promise((resolve, reject) => createSessionRecord(db, user.userId, user.workspaceId,
      user.tenantId, (error, value) => error ? reject(error) : resolve(value)));
    const headers = { Cookie: `omni_session=${session.rawToken}`, Origin: origin };
    const json = async (route, method = 'GET', body) => {
      const response = await fetch(`${origin}${route}`, { method,
        headers: { ...headers, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: await response.json() };
    };
    const upload = async (projectId, kind, name, bytes, idempotencyKey) => {
      const form = new FormData(); form.append('kind', kind); form.append('idempotencyKey', idempotencyKey);
      form.append('researchFile', new Blob([bytes]), name);
      const response = await fetch(`${origin}/api/projects/${projectId}/research-imports`, { method: 'POST', headers, body: form });
      return { status: response.status, body: await response.json() };
    };
    return { json, upload };
  };
  const owner = await makeClient('owner@omniseller.local'); const manager = await makeClient('manager@omniseller.local');
  const createProject = async suffix => {
    const result = await owner.json('/api/projects', 'POST', { name: `W2 Amazon ${suffix}`,
      seedPhrase: 'para mi hija', locale: 'es-US', mediaClass: 'NON_MEDIA', productTypeId: 'CUSTOM_NECKLACE',
      categoryId: 'JEWELRY_NECKLACE', productFamilyVersion: 'custom-necklace-v1' });
    check(result.status === 200, JSON.stringify(result.body)); return result.body.projectId;
  };
  const projectId = await createProject(Date.now());
  const realRoot = 'D:/Claude/Factcheck/Inputdata08092026';
  const xrayBytes = fs.existsSync(`${realRoot}/Xray_Hija.xlsx`) ? fs.readFileSync(`${realRoot}/Xray_Hija.xlsx`) : await generated('XRAY');
  const cerebroBytes = fs.existsSync(`${realRoot}/Cerebro_Hija.xlsx`) ? fs.readFileSync(`${realRoot}/Cerebro_Hija.xlsx`) : await generated('CEREBRO');
  const xray = await owner.upload(projectId, 'AMAZON_XRAY', 'Xray_Hija.xlsx', xrayBytes, key(1));
  check(xray.status === 201, JSON.stringify(xray.body));
  const cerebro = await owner.upload(projectId, 'AMAZON_CEREBRO', 'Cerebro_Hija.xlsx', cerebroBytes, key(2));
  check(cerebro.status === 201, JSON.stringify(cerebro.body));

  const cohorts = await owner.json(`/api/projects/${projectId}/amazon/asin-plan/preview`, 'POST', {
    xrayImportIds: [xray.body.researchImportId]
  });
  check(cohorts.status === 200 && cohorts.body.zeroWrite, JSON.stringify(cohorts.body));
  check(cohorts.body.payload.cohorts.length === 8, 'eight transparent Xray cohort strategies');
  check(cohorts.body.payload.cohorts.every(group => group.asins.length <= 10), 'each Xray cohort is at most ten ASINs');
  check(cohorts.body.accounting.droppedCandidateCount === 0, 'Xray candidates are fully accounted');
  const staffAsins = cohorts.body.payload.cohorts[0].asins.slice(0, 7);
  const plan = await owner.json(`/api/projects/${projectId}/amazon/asin-plan`, 'POST', {
    xrayImportIds: [xray.body.researchImportId], selectedAsins: staffAsins, expectedHeadArtifactId: null,
    idempotencyKey: key(3), changeReason: 'STAFF_EDITED_ASIN_RUN_SET'
  });
  check(plan.status === 201 && plan.body.payload.selectedAsins.join('|') === staffAsins.join('|'), JSON.stringify(plan.body));

  const snapshot = await owner.json(`/api/projects/${projectId}/research-snapshots`, 'POST', {
    expectedHeadResearchSnapshotId: null, importIds: [cerebro.body.researchImportId],
    idempotencyKey: key(4), changeReason: 'DIRECT_CEREBRO_RESEARCH'
  });
  check(snapshot.status === 201, JSON.stringify(snapshot.body));
  const preview = await owner.json(`/api/projects/${projectId}/amazon/master-keywords/preview`, 'POST', {
    researchSnapshotId: snapshot.body.researchSnapshotId
  });
  check(preview.status === 200 && preview.body.zeroWrite, JSON.stringify(preview.body));
  check(preview.body.accounting.masterKeywordCount > 0 && preview.body.accounting.droppedKeywordCount === 0,
    'direct Cerebro creates lossless MKL without Xray ancestry or Product Truth');
  check(preview.body.payload.keywords.every(item => item.provenance?.length), 'every MKL keyword retains provenance');
  check(preview.body.payload.keywords.every(item => item.opportunityComponents
    && Object.hasOwn(item.opportunityComponents, 'lowCompetingProducts')
    && Object.hasOwn(item.opportunityComponents, 'lowTitleDensity')),
  'Amazon MKL separates high demand, competing-product opportunity and title-density opportunity');
  check(preview.body.payload.roots.length > 0 && Array.isArray(preview.body.payload.residue), 'roots and residue exposed');
  check(!preview.body.dependencies.asinPlanArtifactId, 'ASIN plan is not mandatory ancestry');
  const phrase = preview.body.payload.keywords[0].phrase;
  const saveBody = { researchSnapshotId: snapshot.body.researchSnapshotId,
    decisions: [{ phrase, tier: 'SECONDARY', note: 'Staff điều chỉnh sau khi xem metrics' }],
    expectedHeadArtifactId: null, idempotencyKey: key(5), changeReason: 'FREEZE_AMAZON_MASTER_KEYWORDS' };
  const master = await owner.json(`/api/projects/${projectId}/amazon/master-keywords`, 'POST', saveBody);
  check(master.status === 201 && master.body.payload.keywords.find(item => item.phrase === phrase).tier === 'SECONDARY',
    JSON.stringify(master.body));
  const replay = await owner.json(`/api/projects/${projectId}/amazon/master-keywords`, 'POST', saveBody);
  check(replay.status === 200 && replay.body.duplicate && replay.body.id === master.body.id, 'exact replay is idempotent');
  const reuse = await owner.json(`/api/projects/${projectId}/amazon/master-keywords`, 'POST', {
    ...saveBody, decisions: [{ phrase, tier: 'EXCLUDED' }]
  });
  check(reuse.status === 409 && reuse.body.error === 'IDEMPOTENCY_KEY_REUSE', 'same key different body rejected');
  const actorReplay = await manager.json(`/api/projects/${projectId}/amazon/master-keywords`, 'POST', saveBody);
  check(actorReplay.status === 409 && actorReplay.body.error === 'IDEMPOTENCY_ACTOR_MISMATCH', 'actor mismatch rejected');
  const state = await owner.json(`/api/projects/${projectId}/marketplace-workflow`);
  check(state.status === 200 && state.body.heads.AMAZON_MASTER_KEYWORDS.id === master.body.id, 'MKL reopens from persisted state');
  check(state.body.heads.AMAZON_MASTER_KEYWORDS.artifactHash === master.body.artifactHash, 'reopened artifact hash is stable');
  const raceBodies = ['PRIMARY', 'LONG_TAIL'].map((tier, index) => ({ researchSnapshotId: snapshot.body.researchSnapshotId,
    decisions: [{ phrase, tier }], expectedHeadArtifactId: master.body.id, idempotencyKey: key(6 + index),
    changeReason: `CONCURRENT_MKL_REVISION_${index + 1}` }));
  const race = await Promise.all(raceBodies.map(body => owner.json(`/api/projects/${projectId}/amazon/master-keywords`, 'POST', body)));
  check(race.map(item => item.status).sort().join(',') === '201,409', 'two concurrent writers yield one revision and one deterministic conflict');
  check(race.find(item => item.status === 409).body.error === 'WORKFLOW_ARTIFACT_CONFLICT', 'concurrent loser receives CAS conflict');
  const postRaceState = await owner.json(`/api/projects/${projectId}/marketplace-workflow`);
  const latestMasterHash = postRaceState.body.heads.AMAZON_MASTER_KEYWORDS.artifactHash;

  const project2 = await createProject(`${Date.now()}-second`);
  const cerebro2 = await owner.upload(project2, 'AMAZON_CEREBRO', 'Cerebro_Hija.xlsx', cerebroBytes, key(20));
  check(cerebro2.status === 201, JSON.stringify(cerebro2.body));
  const snapshot2 = await owner.json(`/api/projects/${project2}/research-snapshots`, 'POST', {
    expectedHeadResearchSnapshotId: null, importIds: [cerebro2.body.researchImportId],
    idempotencyKey: key(21), changeReason: 'SECOND_PROJECT_DIRECT_CEREBRO'
  });
  check(snapshot2.status === 201, JSON.stringify(snapshot2.body));
  const crossProjectSameKey = await owner.json(`/api/projects/${project2}/amazon/master-keywords`, 'POST', {
    researchSnapshotId: snapshot2.body.researchSnapshotId, decisions: [], expectedHeadArtifactId: null,
    idempotencyKey: key(5), changeReason: 'FREEZE_SECOND_PROJECT_MKL'
  });
  check(crossProjectSameKey.status === 201 && crossProjectSameKey.body.projectId === project2,
    'same idempotency key is independent across projects');
  const immutableError = await new Promise(resolve => db.run('UPDATE commerce_workflow_artifacts SET change_reason=? WHERE id=?',
    ['tamper', master.body.id], error => resolve(error)));
  check(Boolean(immutableError), 'artifact update trigger blocks tampering');
  const row = await get('SELECT integrity_version,request_hash,engine_binding_hash,normalization_binding_hash FROM commerce_workflow_artifacts WHERE id=?', [master.body.id]);
  check(row.integrity_version === 2 && /^[0-9a-f]{64}$/.test(row.request_hash), 'v2 request envelope persisted');
  check(/^[0-9a-f]{64}$/.test(row.engine_binding_hash) && /^[0-9a-f]{64}$/.test(row.normalization_binding_hash),
    'separate engine and normalization bindings persisted');
  await new Promise(resolve => server.close(resolve)); server = null;
  await new Promise((resolve, reject) => db.run('VACUUM INTO ?', [process.env.OMNI_DB_PATH],
    error => error ? reject(error) : resolve()));
  await new Promise(resolve => db.close(() => resolve())); dbClosed = true;
  const reopenedDb = new sqlite3.Database(process.env.OMNI_DB_PATH);
  const ownerUser = users.find(item => item.email === 'owner@omniseller.local');
  const reopened = await getArtifactState(reopenedDb, { tenantId: ownerUser.tenantId,
    workspaceId: ownerUser.workspaceId, marketplace: 'AMAZON', actorId: ownerUser.userId }, projectId);
  check(reopened.heads.AMAZON_MASTER_KEYWORDS.artifactHash === latestMasterHash,
    'process restart reopens the identical MKL artifact and hash');
  await new Promise(resolve => reopenedDb.close(() => resolve()));
  console.log(`R4.3 W2 Amazon MKL: ${passed}/${passed} PASS`);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (!dbClosed) await new Promise(resolve => db.close(() => resolve()));
  for (const suffix of ['', '-wal', '-shm']) try { fs.unlinkSync(`${process.env.OMNI_DB_PATH}${suffix}`); } catch (_) {}
});
