'use strict';

const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
process.env.NODE_ENV = 'test';
process.env.OMNI_MASTER_KEY ||= Buffer.alloc(32, 71).toString('base64');

const { app, db, databaseReady } = require('../server/server');
const { createSessionRecord } = require('../server/security/session');
const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params,
  (error, row) => error ? reject(error) : resolve(row || null)));
const key = value => `71000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
let server; let passed = 0;
function check(value, message) { assert.ok(value, message); passed++; }

async function main() {
  await databaseReady;
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`; process.env.ALLOWED_ORIGINS = origin;
  async function client(marketplace) {
    const user = await get(`SELECT u.id AS userId,w.id AS workspaceId,w.tenant_id AS tenantId
      FROM users u JOIN workspace_memberships m ON m.user_id=u.id JOIN workspaces w ON w.id=m.workspace_id
      WHERE u.email='owner@omniseller.local' AND m.role='OWNER' AND w.marketplace=? LIMIT 1`, [marketplace]);
    const session = await new Promise((resolve, reject) => createSessionRecord(db, user.userId, user.workspaceId,
      user.tenantId, (error, value) => error ? reject(error) : resolve(value)));
    const headers = { Cookie: `omni_session=${session.rawToken}`, Origin: origin };
    const json = async (route, method = 'GET', body) => {
      const response = await fetch(`${origin}${route}`, { method, headers: { ...headers, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: await response.json() };
    };
    const upload = async (projectId, kind, name, bytes, n) => {
      const form = new FormData(); form.append('kind', kind); form.append('idempotencyKey', key(n));
      form.append('researchFile', new Blob([bytes]), name);
      const response = await fetch(`${origin}/api/projects/${projectId}/research-imports`, { method: 'POST', headers, body: form });
      const body = await response.json(); check(response.status === 201, JSON.stringify(body)); return body.researchImportId;
    };
    return { json, upload };
  }

  const amazon = await client('AMAZON');
  const amazonProject = await amazon.json('/api/projects', 'POST', { name: `AMZ workflow ${Date.now()}`,
    seedPhrase: 'para mi hija', locale: 'es-US', mediaClass: 'NON_MEDIA', productTypeId: 'CUSTOM_NECKLACE',
    categoryId: 'JEWELRY_NECKLACE', productFamilyVersion: 'custom-necklace-v1' });
  check(amazonProject.status === 200, JSON.stringify(amazonProject.body)); const amazonId = amazonProject.body.projectId;
  const xrayBook = new ExcelJS.Workbook(); xrayBook.addWorksheet('Xray').addRows([
    ['ASIN','Product Details','Brand','Price $','ASIN Sales','Review Count'],
    ['B0ABC12345','Para Mi Hija Necklace','Brand A',29,500,100],
    ['B0ABC12346','Collar Para Mi Hija','Brand B',31,400,80],
    ['B0ABC12347','Regalo Para Mi Hija Collar','Brand C',35,300,60]
  ]);
  const xrayId = await amazon.upload(amazonId, 'AMAZON_XRAY', 'xray.xlsx', Buffer.from(await xrayBook.xlsx.writeBuffer()), 1);
  const planPreview = await amazon.json(`/api/projects/${amazonId}/amazon/asin-batches/preview`, 'POST', { xrayImportId: xrayId, maxBatches: 2 });
  check(planPreview.status === 200 && planPreview.body.zeroWrite, JSON.stringify(planPreview.body));
  check(planPreview.body.payload.batches[0].asins.length === 3, 'Xray creates a visible ASIN batch');
  const plan = await amazon.json(`/api/projects/${amazonId}/amazon/asin-batches`, 'POST', { xrayImportId: xrayId,
    maxBatches: 2, expectedHeadArtifactId: null, idempotencyKey: key(2), changeReason: 'CONFIRM_ASIN_BATCHES' });
  check(plan.status === 201 && plan.body.kind === 'AMAZON_ASIN_BATCH_PLAN', JSON.stringify(plan.body));
  const cerebroBook = new ExcelJS.Workbook(); cerebroBook.addWorksheet('Cerebro').addRows([
    ['Keyword Phrase','Search Volume','Keyword Sales','Position (Rank)','B0ABC12345','B0ABC12346'],
    ['para mi hija',1200,40,3,1,5], ['regalo para hija',500,20,8,4,9]
  ]);
  const cerebroId = await amazon.upload(amazonId, 'AMAZON_CEREBRO', 'cerebro.xlsx', Buffer.from(await cerebroBook.xlsx.writeBuffer()), 3);
  const binding = await amazon.json(`/api/projects/${amazonId}/amazon/cerebro-bindings`, 'POST', {
    asinBatchArtifactId: plan.body.id, batchNumber: 1, cerebroImportId: cerebroId,
    expectedHeadArtifactId: null, idempotencyKey: key(4), changeReason: 'BIND_CEREBRO_BATCH_1' });
  check(binding.status === 201 && binding.body.accounting.matchedAsinCount === 2, JSON.stringify(binding.body));
  const research = await amazon.json(`/api/projects/${amazonId}/research-snapshots`, 'POST', {
    expectedHeadResearchSnapshotId: null, importIds: [xrayId,cerebroId], idempotencyKey: key(5), changeReason: 'LOCK_AMAZON_RESEARCH' });
  check(research.status === 201, JSON.stringify(research.body));
  const amzMaster = await amazon.json(`/api/projects/${amazonId}/amazon/master-keywords`, 'POST', {
    researchSnapshotId: research.body.researchSnapshotId, asinBatchArtifactId: plan.body.id,
    cerebroBindingArtifactIds: [binding.body.id], expectedHeadArtifactId: null,
    idempotencyKey: key(6), changeReason: 'LOCK_AMAZON_MASTER_KW' });
  check(amzMaster.status === 201 && amzMaster.body.accounting.masterKeywordCount === 2, JSON.stringify(amzMaster.body));
  check(amzMaster.body.accounting.droppedKeywordCount === 0, 'Amazon Master KW loses no parsed keyword');

  const etsy = await client('ETSY');
  const etsyProject = await etsy.json('/api/projects', 'POST', { name: `Etsy workflow ${Date.now()}`,
    seedPhrase: 'para mi hija', locale: 'es-US', mediaClass: 'NON_MEDIA', productTypeId: 'CUSTOM_NECKLACE',
    categoryId: 'JEWELRY_NECKLACE', productFamilyVersion: 'custom-necklace-v1' });
  check(etsyProject.status === 200, JSON.stringify(etsyProject.body)); const etsyId = etsyProject.body.projectId;
  const rows = ['listing_id,title,shop,he_tags,keyword_context,rank_position,he_sold,he_revenue_usd,reviews'];
  for (let index = 1; index <= 8; index++) rows.push(`${index},"Para Mi Hija Necklace ${index}",Shop${index},"regalo hija|collar hija",para mi hija,${index},${900-index*50},${5000-index*100},${200-index}`);
  const etsyImportId = await etsy.upload(etsyId, 'ETSY_SEARCH', 'etsy.csv', Buffer.from(rows.join('\n')), 7);
  const etsyResearch = await etsy.json(`/api/projects/${etsyId}/research-snapshots`, 'POST', {
    expectedHeadResearchSnapshotId: null, importIds: [etsyImportId], idempotencyKey: key(8), changeReason: 'LOCK_ETSY_RESEARCH' });
  check(etsyResearch.status === 201, JSON.stringify(etsyResearch.body));
  const winnersPreview = await etsy.json(`/api/projects/${etsyId}/etsy/winners/preview`, 'POST', {
    researchSnapshotId: etsyResearch.body.researchSnapshotId, winnerCount: 5 });
  check(winnersPreview.status === 200 && winnersPreview.body.zeroWrite && winnersPreview.body.payload.winners.length === 5,
    JSON.stringify(winnersPreview.body));
  const staffWinnerKeys = [...winnersPreview.body.payload.winners.slice(0, 4), winnersPreview.body.payload.nonWinners.at(-1)]
    .map(item => item.entityKey);
  const winners = await etsy.json(`/api/projects/${etsyId}/etsy/winners`, 'POST', {
    researchSnapshotId: etsyResearch.body.researchSnapshotId, winnerCount: 5, selectedEntityKeys: staffWinnerKeys,
    expectedHeadArtifactId: null, idempotencyKey: key(9), changeReason: 'CONFIRM_ETSY_WINNERS' });
  check(winners.status === 201 && winners.body.accounting.entityCount === 8, JSON.stringify(winners.body));
  check(winners.body.accounting.selectionMode === 'STAFF_SELECTED_FROM_SEARCH_EVIDENCE'
    && winners.body.payload.winners.map(item => item.entityKey).join('|') === staffWinnerKeys.join('|'),
  'staff-selected Etsy winners are preserved exactly');
  const patterns = await etsy.json(`/api/projects/${etsyId}/etsy/patterns`, 'POST', {
    winnerSetArtifactId: winners.body.id, expectedHeadArtifactId: null,
    idempotencyKey: key(10), changeReason: 'LOCK_ETSY_PATTERNS' });
  check(patterns.status === 201 && patterns.body.accounting.winnerCount === 5, JSON.stringify(patterns.body));
  const etsyMaster = await etsy.json(`/api/projects/${etsyId}/etsy/master-keywords`, 'POST', {
    researchSnapshotId: etsyResearch.body.researchSnapshotId, winnerSetArtifactId: winners.body.id,
    patternArtifactId: patterns.body.id, expectedHeadArtifactId: null,
    idempotencyKey: key(11), changeReason: 'LOCK_ETSY_MASTER_KW' });
  check(etsyMaster.status === 201 && etsyMaster.body.accounting.masterKeywordCount > 0, JSON.stringify(etsyMaster.body));
  check(etsyMaster.body.accounting.droppedKeywordCount === 0, 'Etsy Master KW loses no candidate');
  const state = await etsy.json(`/api/projects/${etsyId}/marketplace-workflow`);
  check(state.status === 200 && state.body.heads.ETSY_WINNER_SET && state.body.heads.ETSY_PATTERN_SNAPSHOT
    && state.body.heads.ETSY_MASTER_KEYWORDS, JSON.stringify(state.body));
  const before = (await get('SELECT COUNT(*) AS n FROM commerce_workflow_artifacts')).n;
  const immutable = await new Promise(resolve => db.run('UPDATE commerce_workflow_artifacts SET change_reason=? WHERE id=?',
    ['tampered', etsyMaster.body.id], error => resolve(error)));
  check(Boolean(immutable), 'workflow artifacts are immutable');
  check((await get('SELECT COUNT(*) AS n FROM commerce_workflow_artifacts')).n === before, 'immutability does not add rows');
  console.log(`Marketplace research workflows: ${passed}/${passed} PASS`);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await new Promise(resolve => db.close(() => resolve()));
});
