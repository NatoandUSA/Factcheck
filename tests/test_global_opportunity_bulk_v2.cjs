'use strict';

const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');

process.env.NODE_ENV = 'test';

const { app, db, databaseReady } = require('../server/server');
const { createSessionRecord } = require('../server/security/session');
const { clusterDescriptor, parseGlobalOpportunityFile } = require('../server/globalOpportunityBulkParser');
const { projectMklCandidates, proofGate, freshnessScore, competitionScore } = require('../server/database/globalOpportunityStore');

function all(sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows || [])));
}
function session(userId, workspaceId, tenantId) {
  return new Promise((resolve, reject) => createSessionRecord(db, userId, workspaceId, tenantId,
    (error, value) => error ? reject(error) : resolve(value)));
}
async function ownerAmazon() {
  const rows = await all(`SELECT u.id user_id,w.id workspace_id,w.tenant_id
    FROM workspace_memberships wm JOIN users u ON u.id=wm.user_id JOIN workspaces w ON w.id=wm.workspace_id
    WHERE wm.role='OWNER' AND w.marketplace='AMAZON' ORDER BY w.id LIMIT 1`);
  assert(rows[0]); return rows[0];
}
async function workbookBytes() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Cerebro Export');
  ws.addRow(['Keyword Phrase','Search Volume','Keyword Sales','Competing Products','Trend']);
  ws.addRow(['dog memorial wind chime',4800,120,650,8]);
  ws.addRow(['personalized pet loss wind chime',2600,72,420,9]);
  ws.addRow(['pet memorial necklace',5100,95,900,7]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function run() {
  assert.equal(proofGate({ proofType: 'ORDER_EVIDENCE', estimatedSales: null, estimatedRevenue: null }), 'WATCH_ONLY',
    'proofType metadata alone must never unlock PASS');
  assert.equal(proofGate({ proofType: 'NONE', estimatedSales: 1, estimatedRevenue: null }), 'PASS');
  assert.equal(freshnessScore('2999-01-01T00:00:00.000Z'), 0, 'future timestamps must not receive freshness credit');
  assert(freshnessScore(new Date().toISOString()) > 0);
  assert(competitionScore(1000) > 0 && competitionScore(1000) < 15);
  assert.equal(competitionScore(null), 5, 'missing competition must remain UNKNOWN/default, never become zero-competition');
  assert.equal(competitionScore(''), 5, 'blank competition must remain UNKNOWN/default');

  const a = clusterDescriptor('dog memorial wind chime');
  const b = clusterDescriptor('personalized pet loss wind chime');
  const c = clusterDescriptor('pet memorial necklace');
  assert.equal(a.clusterKey, b.clusterKey, 'memorial wind-chime variants should cluster together');
  assert.notEqual(a.clusterKey, c.clusterKey, 'different product families must not collapse into one cluster');

  const bytes = await workbookBytes();
  const parsed = await parseGlobalOpportunityFile(bytes, { fileName: 'cerebro.xlsx', sourceType: 'CEREBRO' });
  assert.equal(parsed.candidateCount, 3);
  assert.equal(parsed.candidates[0].proofType, 'MARKETPLACE_SALES');
  assert.equal(parsed.candidates[0].clusterKey, parsed.candidates[1].clusterKey);
  assert.notEqual(parsed.candidates[0].clusterKey, parsed.candidates[2].clusterKey);
  assert.equal(parsed.diagnostics[0].status, 'CONSUMED');

  const etsyWatch = projectMklCandidates({
    id: 10, projectId: 20, kind: 'ETSY_MASTER_KEYWORDS', artifactHash: 'e'.repeat(64),
    createdAt: '2026-09-19T00:00:00.000Z',
    payload: { keywords: [
      { keywordId: 'ETSY-KW-1', phrase: 'pet remembrance wind chime', tier: 'REVIEW',
        demandProxy: .82, competitionProxy: .31, listingSpread: 4, shopSpread: 3, opportunityScore: 78 },
      { keywordId: 'ETSY-KW-2', phrase: 'primary seed', tier: 'PRIMARY',
        demandProxy: .9, competitionProxy: .2, listingSpread: 8 }
    ] }
  }, 'ETSY');
  assert.equal(etsyWatch.length, 1);
  assert.equal(etsyWatch[0].proofType, 'NONE', 'Etsy proxy evidence must remain WATCH-only, never sales proof');
  assert.equal(etsyWatch[0].estimatedSales, null);

  await databaseReady;
  const user = await ownerAmazon();
  const auth = await session(user.user_id, user.workspace_id, user.tenant_id);
  const server = app.listen(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  process.env.ALLOWED_ORIGINS = base;
  const cookie = `omni_session=${auth.rawToken}`;

  try {
    const before = await all(`SELECT id,state,seed_phrase FROM research_projects
      WHERE tenant_id=? AND workspace_id=? AND marketplace='AMAZON' ORDER BY id`,
    [user.tenant_id, user.workspace_id]);

    const form = new FormData();
    form.set('sourceType', 'CEREBRO');
    form.set('proofTimestamp', '2026-09-19T00:00:00.000Z');
    form.set('file', new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'cerebro.xlsx');
    const invalidForm = new FormData();
    invalidForm.set('sourceType', 'MALICIOUS_SOURCE');
    invalidForm.set('file', new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'cerebro.xlsx');
    const invalidSourceRes = await fetch(base + '/api/global-opportunities/import-file', {
      method: 'POST', headers: { Origin: base, Cookie: cookie }, body: invalidForm
    });
    assert.equal(invalidSourceRes.status, 400);
    assert.equal((await invalidSourceRes.json()).error, 'GLOBAL_IMPORT_SOURCE_TYPE_INVALID');

    const importRes = await fetch(base + '/api/global-opportunities/import-file', {
      method: 'POST', headers: { Origin: base, Cookie: cookie }, body: form
    });
    assert.equal(importRes.status, 200);
    const imported = await importRes.json();
    assert.equal(imported.success, true);
    assert.equal(imported.projectStateChanged, false);
    assert.equal(imported.parsedCount, 3);
    assert.equal(imported.importedCount, 3);

    const freshnessRows = await all(`SELECT c.proof_timestamp,s.freshness
      FROM global_keyword_candidates c
      JOIN global_opportunity_scores s ON s.candidate_id=c.id AND s.score_version='GLOBAL_OPPORTUNITY_V1'
      WHERE c.tenant_id=? AND c.workspace_id=? AND c.marketplace='AMAZON' AND c.source_file_id=?`,
    [user.tenant_id, user.workspace_id, imported.sourceFileId]);
    assert(freshnessRows.length >= 3);
    assert(freshnessRows.every(row => row.proof_timestamp === null),
      'upload time must not be stored as marketplace proof timestamp');
    assert(freshnessRows.every(row => Number(row.freshness) === 0),
      'old/undated exports must not receive synthetic freshness credit');

    const renamedForm = new FormData();
    renamedForm.set('sourceType', 'AUTO');
    renamedForm.set('file', new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'same-content-renamed.xlsx');
    const renamedRes = await fetch(base + '/api/global-opportunities/import-file', {
      method: 'POST', headers: { Origin: base, Cookie: cookie }, body: renamedForm
    });
    assert.equal(renamedRes.status, 200);
    const renamed = await renamedRes.json();
    assert.equal(renamed.sourceFileId, imported.sourceFileId, 'file identity must be content-addressed, not filename-addressed');

    const dedupRows = await all(`SELECT normalized_keyword,COUNT(*) AS count FROM global_keyword_candidates
      WHERE tenant_id=? AND workspace_id=? AND marketplace='AMAZON' AND source_file_id=?
      GROUP BY normalized_keyword`, [user.tenant_id, user.workspace_id, imported.sourceFileId]);
    assert(dedupRows.every(row => Number(row.count) === 1), 'same content re-uploaded under a new filename/source hint must not duplicate candidates');

    const after = await all(`SELECT id,state,seed_phrase FROM research_projects
      WHERE tenant_id=? AND workspace_id=? AND marketplace='AMAZON' ORDER BY id`,
    [user.tenant_id, user.workspace_id]);
    assert.deepEqual(after, before, 'bulk global import must not mutate any existing project');

    const secondSourceRes = await fetch(base + '/api/global-opportunities/import', {
      method: 'POST',
      headers: { Origin: base, Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'YTREND_VALIDATION',
        sourceFileId: 'ytrend-cross-source-1',
        candidates: [{
          keyword: 'dog memorial wind chime',
          clusterKey: clusterDescriptor('dog memorial wind chime').clusterKey,
          clusterLabel: clusterDescriptor('dog memorial wind chime').clusterLabel,
          trendVelocity: 9,
          socialMomentum: 7,
          proofType: 'NONE'
        }]
      })
    });
    assert.equal(secondSourceRes.status, 200);

    const crossListRes = await fetch(base + '/api/global-opportunities?limit=100', {
      headers: { Origin: base, Cookie: cookie }
    });
    assert.equal(crossListRes.status, 200);
    const crossList = await crossListRes.json();
    const sameKeyword = crossList.candidates.filter(item => item.normalized_keyword === 'dog memorial wind chime');
    assert(sameKeyword.length >= 2);
    assert(sameKeyword.every(item => Number(item.cross_source_count) >= 2),
      'server must reconcile distinct sources instead of trusting client crossSourceCount');
    assert(sameKeyword.some(item => Number(item.cross_source_validation) > 0));

    const summaryRes = await fetch(base + '/api/global-opportunities/summary', {
      headers: { Origin: base, Cookie: cookie }
    });
    assert.equal(summaryRes.status, 200);
    const summary = await summaryRes.json();
    assert(summary.summary.candidateCount >= 3);
    assert(summary.summary.clusterCount >= 2);
    assert(summary.summary.qualifiedCount >= 3);

    const watchRes = await fetch(base + '/api/global-opportunities/watchlist?limit=2', {
      headers: { Origin: base, Cookie: cookie }
    });
    assert.equal(watchRes.status, 200);
    const watch = await watchRes.json();
    assert.equal(watch.bridgeMode, 'BOUNDED_PULL_FEED');
    assert(watch.count <= 2);
    assert(watch.candidates.every(item => ['PASS','WATCH_ONLY'].includes(item.proof_gate)));

    console.log('GLOBAL_OPPORTUNITY_BULK_V2 PASS');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
