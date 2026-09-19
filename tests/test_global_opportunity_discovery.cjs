const assert = require('assert');
process.env.NODE_ENV = 'test';

const { app, db, databaseReady } = require('../server/server');
const { createSessionRecord } = require('../server/security/session');
const { projectMklCandidates, importCandidates } = require('../server/database/globalOpportunityStore');

function all(sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows || [])));
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null)));
}
function createSession(userId, workspaceId, tenantId) {
  return new Promise((resolve, reject) => createSessionRecord(db, userId, workspaceId, tenantId,
    (error, session) => error ? reject(error) : resolve(session)));
}
async function fixture() {
  const rows = await all(`SELECT u.id AS user_id,w.tenant_id,w.id AS workspace_id,w.marketplace,wm.role
    FROM workspace_memberships wm JOIN users u ON u.id=wm.user_id JOIN workspaces w ON w.id=wm.workspace_id
    WHERE wm.role='OWNER' AND w.marketplace='AMAZON' ORDER BY w.id LIMIT 1`);
  assert(rows[0], 'Amazon OWNER fixture required');
  return rows[0];
}
async function json(res) { return res.json().catch(() => ({})); }

async function run() {
  const harvested = projectMklCandidates({
    id: 77,
    projectId: 55,
    kind: 'AMAZON_MASTER_KEYWORDS',
    artifactHash: 'a'.repeat(64),
    createdAt: '2026-09-19T00:00:00.000Z',
    payload: { keywords: [
      { keywordId: 'AMZ-KW-1', phrase: 'commercial outlier', tier: 'OUTLIER_REVIEW',
        opportunityScore: 0.8, metrics: { searchVolume: 1400, keywordSales: 21, trend: 7 } },
      { keywordId: 'AMZ-KW-2', phrase: 'residue no sales', tier: 'RESIDUE',
        metrics: { searchVolume: 900, keywordSales: null } },
      { keywordId: 'AMZ-KW-3', phrase: 'primary should stay project-bound', tier: 'PRIMARY',
        metrics: { searchVolume: 5000, keywordSales: 80 } }
    ] }
  }, 'AMAZON');
  assert.strictEqual(harvested.length, 1);
  assert.strictEqual(harvested[0].keyword, 'commercial outlier');
  assert.strictEqual(harvested[0].estimatedSales, 21);
  assert.strictEqual(harvested[0].origin.sourceProjectId, 55);
  assert.strictEqual(harvested[0].origin.sourceArtifactId, 77);

  await databaseReady;
  const user = await fixture();
  const session = await createSession(user.user_id, user.workspace_id, user.tenant_id);
  const server = app.listen(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  process.env.ALLOWED_ORIGINS = base;
  const headers = { Origin: base, 'Content-Type': 'application/json', Cookie: `omni_session=${session.rawToken}` };

  try {
    const beforeProjects = await all(`SELECT id,name,seed_phrase,state FROM research_projects
      WHERE tenant_id=? AND workspace_id=? AND marketplace='AMAZON' ORDER BY id`, [user.tenant_id, user.workspace_id]);

    const importRes = await fetch(base + '/api/global-opportunities/import', {
      method: 'POST', headers,
      body: JSON.stringify({
        source: 'CEREBRO_BULK_EXPORT',
        sourceFileId: 'global-opportunity-test-1',
        candidates: [
          {
            keyword: 'dog memorial wind chime',
            clusterKey: 'PET_MEMORIAL_WIND_CHIME',
            clusterLabel: 'Pet Memorial Wind Chime',
            searchVolume: 4800,
            estimatedSales: 120,
            estimatedRevenue: 4200,
            avgPrice: 34.99,
            competition: 7,
            trendVelocity: 8,
            socialMomentum: 6,
            crossSourceCount: 3,
            proofType: 'ESTIMATED_SALES',
            proofTimestamp: new Date().toISOString()
          },
          {
            keyword: 'viral novelty maybe',
            searchVolume: 20000,
            trendVelocity: 10,
            socialMomentum: 10,
            crossSourceCount: 4,
            proofType: 'NONE'
          }
        ]
      })
    });
    assert.strictEqual(importRes.status, 200);
    const imported = await json(importRes);
    assert.strictEqual(imported.success, true);
    assert.strictEqual(imported.projectStateChanged, false);
    assert.strictEqual(imported.importedCount, 2);

    const afterImportProjects = await all(`SELECT id,name,seed_phrase,state FROM research_projects
      WHERE tenant_id=? AND workspace_id=? AND marketplace='AMAZON' ORDER BY id`, [user.tenant_id, user.workspace_id]);
    assert.deepStrictEqual(afterImportProjects, beforeProjects, 'global import must not mutate any project');

    const listRes = await fetch(base + '/api/global-opportunities?limit=20', { headers: { Origin: base, Cookie: headers.Cookie } });
    assert.strictEqual(listRes.status, 200);
    const list = await json(listRes);
    const unverifiedSales = list.candidates.find(row => row.normalized_keyword === 'dog memorial wind chime');
    const watch = list.candidates.find(row => row.normalized_keyword === 'viral novelty maybe');
    assert(unverifiedSales && watch);
    assert.strictEqual(unverifiedSales.proof_gate, 'WATCH_ONLY',
      'client JSON must not self-assert commercial proof');
    assert.strictEqual(unverifiedSales.status, 'WATCH');
    assert.strictEqual(unverifiedSales.estimated_sales, null);
    assert.strictEqual(unverifiedSales.estimated_revenue, null);
    assert.strictEqual(unverifiedSales.source, 'GLOBAL_JSON_UNVERIFIED');
    assert.strictEqual(watch.proof_gate, 'WATCH_ONLY');
    assert.strictEqual(watch.status, 'WATCH');
    assert(Number(watch.opportunity_score) <= 39, 'social/trend-only candidate must remain capped below qualification');

    const deniedPromotion = await fetch(base + `/api/global-opportunities/${watch.id}/promote-to-project`, {
      method: 'POST', headers, body: JSON.stringify({ name: 'Should Not Exist' })
    });
    assert.strictEqual(deniedPromotion.status, 409);
    const deniedBody = await json(deniedPromotion);
    assert.strictEqual(deniedBody.error, 'GLOBAL_PROOF_OF_SALE_REQUIRED');

    const deniedQualification = await fetch(base + `/api/global-opportunities/${watch.id}/status`, {
      method: 'POST', headers, body: JSON.stringify({ status: 'QUALIFIED', reason: 'must not self-qualify' })
    });
    assert.strictEqual(deniedQualification.status, 409);
    assert.strictEqual((await json(deniedQualification)).error, 'GLOBAL_PROOF_OF_SALE_REQUIRED_FOR_STATUS');

    const afterDenied = await all(`SELECT id,name,seed_phrase,state FROM research_projects
      WHERE tenant_id=? AND workspace_id=? AND marketplace='AMAZON' ORDER BY id`, [user.tenant_id, user.workspace_id]);
    assert.deepStrictEqual(afterDenied, beforeProjects, 'failed promotion must not mutate projects');

    const trusted = await importCandidates(db, {
      tenantId: user.tenant_id, workspaceId: user.workspace_id, marketplace: 'AMAZON'
    }, user.user_id, {
      source: 'TEST_TRUSTED_MARKETPLACE_EXPORT',
      sourceFileId: 'trusted-global-opportunity-test-1',
      candidates: [{
        keyword: 'trusted pet memorial wind chime',
        clusterKey: 'PET_MEMORIAL_WIND_CHIME',
        clusterLabel: 'Pet Memorial Wind Chime',
        searchVolume: 4800,
        estimatedSales: 120,
        estimatedRevenue: 4200,
        avgPrice: 34.99,
        competition: 650,
        proofType: 'MARKETPLACE_SALES'
      }]
    }, { allowCommercialMetrics: true, allowProofTimestamp: false });
    const trustedId = trusted[0].candidateId;

    const staleTrusted = await fetch(base + `/api/global-opportunities/${trustedId}/status`, {
      method: 'POST', headers, body: JSON.stringify({ status: 'STALE', reason: 'audit stale persistence' })
    });
    assert.strictEqual(staleTrusted.status, 200);
    const reimportStale = await importCandidates(db, {
      tenantId: user.tenant_id, workspaceId: user.workspace_id, marketplace: 'AMAZON'
    }, user.user_id, {
      source: 'TEST_TRUSTED_MARKETPLACE_EXPORT',
      sourceFileId: 'trusted-global-opportunity-test-1',
      candidates: [{ keyword: 'trusted pet memorial wind chime', estimatedSales: 120, estimatedRevenue: 4200, proofType: 'MARKETPLACE_SALES' }]
    }, { allowCommercialMetrics: true, allowProofTimestamp: false });
    assert.strictEqual(reimportStale[0].status, 'STALE', 're-importing the same source file must not revive a STALE candidate');
    const restoreTrusted = await fetch(base + `/api/global-opportunities/${trustedId}/status`, {
      method: 'POST', headers, body: JSON.stringify({ status: 'QUALIFIED', reason: 'explicit audited restore' })
    });
    assert.strictEqual(restoreTrusted.status, 200);

    const rejectTrusted = await fetch(base + `/api/global-opportunities/${trustedId}/status`, {
      method: 'POST', headers, body: JSON.stringify({ status: 'REJECTED', reason: 'audit status gate' })
    });
    assert.strictEqual(rejectTrusted.status, 200);
    const rejectedPromotion = await fetch(base + `/api/global-opportunities/${trustedId}/promote-to-project`, {
      method: 'POST', headers, body: JSON.stringify({ name: 'Must Not Promote Rejected' })
    });
    assert.strictEqual(rejectedPromotion.status, 409);
    assert.strictEqual((await json(rejectedPromotion)).error, 'GLOBAL_CANDIDATE_STATUS_NOT_PROMOTABLE');

    const requalifyTrusted = await fetch(base + `/api/global-opportunities/${trustedId}/status`, {
      method: 'POST', headers, body: JSON.stringify({ status: 'QUALIFIED', reason: 'audit requalification' })
    });
    assert.strictEqual(requalifyTrusted.status, 200);

    const promotion = await fetch(base + `/api/global-opportunities/${trustedId}/promote-to-project`, {
      method: 'POST', headers, body: JSON.stringify({ name: 'Global Discovery - Pet Memorial Wind Chime' })
    });
    assert.strictEqual(promotion.status, 200);
    const promoted = await json(promotion);
    assert.strictEqual(promoted.existingProjectsChanged, false);
    assert.strictEqual(promoted.projectState, 'EVIDENCE_INTAKE');
    assert(promoted.projectId);

    const created = await get(`SELECT id,name,seed_phrase,state FROM research_projects
      WHERE id=? AND tenant_id=? AND workspace_id=? AND marketplace='AMAZON'`,
    [promoted.projectId, user.tenant_id, user.workspace_id]);
    assert(created);
    assert.strictEqual(created.seed_phrase, 'Pet Memorial Wind Chime');
    assert.strictEqual(created.state, 'EVIDENCE_INTAKE');

    const preserved = await all(`SELECT id,name,seed_phrase,state FROM research_projects
      WHERE tenant_id=? AND workspace_id=? AND marketplace='AMAZON' AND id<>? ORDER BY id`,
    [user.tenant_id, user.workspace_id, promoted.projectId]);
    assert.deepStrictEqual(preserved, beforeProjects, 'promotion may add one project but must not alter existing projects');

    const row = await get('SELECT status,promoted_project_id FROM global_keyword_candidates WHERE id=?', [trustedId]);
    assert.strictEqual(row.status, 'PROMOTED');
    assert.strictEqual(Number(row.promoted_project_id), Number(promoted.projectId));

    const replay = await fetch(base + `/api/global-opportunities/${trustedId}/promote-to-project`, {
      method: 'POST', headers, body: JSON.stringify({})
    });
    assert.strictEqual(replay.status, 200);
    const replayBody = await json(replay);
    assert.strictEqual(replayBody.replay, true);
    assert.strictEqual(Number(replayBody.projectId), Number(promoted.projectId));

    console.log('GLOBAL_OPPORTUNITY_DISCOVERY_V1 PASS');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
