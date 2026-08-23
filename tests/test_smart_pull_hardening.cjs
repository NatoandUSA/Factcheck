const assert = require('assert');
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'test';

const analytics = require('../server/analyticsEngine');
const { app, db, databaseReady, ytrendsMcp } = require('../server/server');
const { createSessionRecord } = require('../server/security/session');

const dbAll = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
const createSession = (userId, workspaceId, tenantId) => new Promise((resolve, reject) => {
  createSessionRecord(db, userId, workspaceId, tenantId, (err, session) => err ? reject(err) : resolve(session));
});

async function waitForFixtures() {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const rows = await dbAll(`SELECT u.id user_id, w.tenant_id, wm.workspace_id, wm.role, w.marketplace
      FROM workspace_memberships wm JOIN users u ON u.id = wm.user_id JOIN workspaces w ON w.id = wm.workspace_id`);
    if (rows.some(row => row.role === 'OWNER' && row.marketplace === 'ETSY') && rows.some(row => row.role === 'OWNER' && row.marketplace === 'AMAZON')) return rows;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for fixtures');
}

(async () => {
  const smartPullUi = fs.readFileSync(path.join(__dirname, '../src/components/SmartPullAnalyticsBar.jsx'), 'utf8');
  const amazonPreview = fs.readFileSync(path.join(__dirname, '../src/components/AmazonPreview.jsx'), 'utf8');
  assert(smartPullUi.includes('activeProjectIdRef.current !== requestedProjectId'), 'Stale project responses must be ignored');
  assert(smartPullUi.includes('/api/evidence?projectId='), 'Reload must request only the active project evidence');
  assert(smartPullUi.includes("SMART_PULL_ARTIFACT_V1"), 'Reload must restore only explicitly typed Smart Pull artifacts');
  assert(smartPullUi.includes('No live Amazon connector') || smartPullUi.includes('Chưa có Amazon live connector'));
  assert(!smartPullUi.includes('100% Live'));
  assert(!amazonPreview.includes('4,892 ratings'));
  assert(!amazonPreview.includes('$29.99'));
  assert(!amazonPreview.includes('Prime</span>'));
  assert(amazonPreview.includes('Simulation Preview — Not Live — Not Submission Ready'));
  assert(amazonPreview.includes('[A+ Brand Story: Unset]'));
  assert(!amazonPreview.includes('USA Handcrafted Precision'));
  assert(!amazonPreview.includes('luxury keepsake unboxing'));

  const tags = analytics.analyzeTagFrequency([
    { title: 'Personalized Nurse Sweatshirt', shop: 'A', tags: ['nurse gift', 'Disney'] },
    { title: 'Nurse Birthday Top', shop: 'B', tags: ['nurse gift'] }
  ]);
  assert.deepStrictEqual(tags.selected13Tags, ['nurse gift'], 'Only provider tags may be ranked; IP terms and title phrases must be excluded');
  const derived = analytics.deriveTitlePhrases([{ title: 'Personalized Nurse Sweatshirt | Disney Gift' }]);
  assert(derived.some(item => item.phrase === 'personalized nurse sweatshirt' && item.evidenceState === 'DERIVED_FROM_TITLE'));
  assert(!derived.some(item => item.phrase.includes('disney')));
  const heuristic = analytics.synthesizeNicheIntelligence({
    seedPhrase: 'nurse gift', listings: [{ title: 'Nurse Gift', sold24h: 6 }]
  }).derivedHighActivityPatterns;
  assert.deepStrictEqual(heuristic, [{ title: 'Nurse Gift', evidenceState: 'DERIVED_HEURISTIC', rule: 'source_flag_or_sold24h_gt_5' }]);

  const unknownEconomics = analytics.computePriceAndNicheAnalytics([{ price: 30 }], null).economics;
  assert.strictEqual(unknownEconomics.enteredUnitCost, null);
  assert.strictEqual(unknownEconomics.estimatedPriceMinusUnitCost, null);
  assert.strictEqual(unknownEconomics.publishGateEligible, false);
  assert.strictEqual(Object.hasOwn(unknownEconomics, 'estNetProfit'), false);

  await databaseReady;
  const fixtures = await waitForFixtures();
  const etsy = fixtures.find(row => row.role === 'OWNER' && row.marketplace === 'ETSY');
  const amazon = fixtures.find(row => row.role === 'OWNER' && row.marketplace === 'AMAZON');
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  process.env.ALLOWED_ORIGINS = base;

  const makeClient = async fixture => {
    const session = await createSession(fixture.user_id, fixture.workspace_id, fixture.tenant_id);
    const headers = { Origin: base, Cookie: `omni_session=${session.rawToken}`, 'Content-Type': 'application/json' };
    const request = async (path, body) => {
      const response = await fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    };
    request.get = async path => {
      const response = await fetch(base + path, { method: 'GET', headers: { Origin: base, Cookie: headers.Cookie } });
      return { status: response.status, body: await response.json() };
    };
    return request;
  };

  const callEtsy = await makeClient(etsy);
  const callAmazon = await makeClient(amazon);
  const etsyProjectResponse = await callEtsy('/api/projects', { name: 'Smart Pull Etsy', seedPhrase: 'nurse gift' });
  const amazonProjectResponse = await callAmazon('/api/projects', { name: 'Smart Pull Amazon', seedPhrase: 'mug' });
  const etsyProjectId = etsyProjectResponse.body.projectId ?? etsyProjectResponse.body.project?.id;
  const amazonProjectId = amazonProjectResponse.body.projectId ?? amazonProjectResponse.body.project?.id;
  assert(etsyProjectId && amazonProjectId);

  try {
    const evidenceCountBeforeFailure = (await dbAll('SELECT id FROM research_evidence')).length;
    const missingProject = await callEtsy('/api/research/smart-pull', { query: 'nurse gift' });
    assert.strictEqual(missingProject.status, 400);
    assert.strictEqual(missingProject.body.error, 'MISSING_PROJECT_ID');

    const crossMarketplace = await callEtsy('/api/research/smart-pull', { projectId: amazonProjectId, query: 'nurse gift' });
    assert.strictEqual(crossMarketplace.status, 404);
    assert.strictEqual(crossMarketplace.body.error, 'PROJECT_NOT_FOUND');

    const originalCallTool = ytrendsMcp.callTool;
    ytrendsMcp.callTool = async () => { throw new Error('provider down'); };
    const unavailable = await callEtsy('/api/research/smart-pull', { projectId: etsyProjectId, query: 'nurse gift' });
    assert.strictEqual(unavailable.status, 503);
    assert.strictEqual(unavailable.body.error, 'ETSY_MCP_UNAVAILABLE');
    assert.strictEqual((await dbAll('SELECT id FROM research_evidence')).length, evidenceCountBeforeFailure, 'Provider failure must make zero evidence writes');

    ytrendsMcp.callTool = async name => {
      if (name === 'ytrends_search') return { data: { results: [{ id: 'lst:1', title: 'Nurse Gift Top', snippet: '$24.00' }] } };
      throw new Error('hot listings down');
    };
    const partial = await callEtsy('/api/research/smart-pull', { projectId: etsyProjectId, query: 'nurse gift', unitCost: 10 });
    assert.strictEqual(partial.status, 200);
    assert.strictEqual(partial.body.projectId, etsyProjectId);
    assert.strictEqual(partial.body.evidenceState, 'PARTIAL_EVIDENCE');
    assert.strictEqual(partial.body.observedAt, null);
    assert.deepStrictEqual(partial.body.tagAnalytics.selected13Tags, [], 'Search titles must not masquerade as observed tags');
    assert.strictEqual(partial.body.providerResults.hotListings, 'FAILED');
    assert.strictEqual(partial.body.priceAnalytics.economics.publishGateEligible, false);
    assert(partial.body.evidenceId, 'Successful Smart Pull must return an immutable evidenceId');
    const etsyArtifacts = await dbAll('SELECT * FROM research_evidence WHERE id = ? AND project_id = ?', [partial.body.evidenceId, etsyProjectId]);
    assert.strictEqual(etsyArtifacts.length, 1, 'Artifact must be bound to the requested Etsy project');
    const etsyMetadata = JSON.parse(etsyArtifacts[0].metadata);
    assert.strictEqual(etsyMetadata.kind, 'SMART_PULL_ARTIFACT_V1');
    assert.strictEqual(etsyMetadata.response.projectId, etsyProjectId);
    const reloadSameProject = await callEtsy.get(`/api/evidence?projectId=${etsyProjectId}`);
    assert.strictEqual(reloadSameProject.status, 200);
    assert.strictEqual(reloadSameProject.body.projectId, etsyProjectId);
    assert(reloadSameProject.body.evidence.some(row => row.id === partial.body.evidenceId), 'Reload must return the exact project artifact');
    const crossProjectRead = await callEtsy.get(`/api/evidence?projectId=${amazonProjectId}`);
    assert.strictEqual(crossProjectRead.status, 404, 'Cross-marketplace project evidence read must be IDOR-safe');

    ytrendsMcp.callTool = async () => ({ data: {} });
    const empty = await callEtsy('/api/research/smart-pull', { projectId: etsyProjectId, query: 'nurse gift' });
    assert.strictEqual(empty.status, 422);
    assert.strictEqual(empty.body.error, 'INSUFFICIENT_EVIDENCE');
    assert.strictEqual((await dbAll('SELECT id FROM research_evidence')).length, evidenceCountBeforeFailure + 1, 'Empty provider result must make zero additional evidence writes');
    ytrendsMcp.callTool = originalCallTool;

    const inputOnly = await callAmazon('/api/research/smart-pull', { projectId: amazonProjectId, query: 'B012345678' });
    assert.strictEqual(inputOnly.status, 200);
    assert.strictEqual(inputOnly.body.evidenceState, 'INPUT_ONLY_UNVERIFIED');
    assert.strictEqual(inputOnly.body.providerResults.amazonLiveConnector, 'NOT_INVOKED');
    assert.strictEqual(inputOnly.body.listings[0].price, null);
    assert.strictEqual(inputOnly.body.summary.avgMarketPrice, null);
    assert(inputOnly.body.evidenceId, 'Amazon input-only artifact must be persisted and explicitly labeled');
    const amazonArtifacts = await dbAll('SELECT * FROM research_evidence WHERE id = ? AND project_id = ?', [inputOnly.body.evidenceId, amazonProjectId]);
    assert.strictEqual(amazonArtifacts.length, 1);
    assert.strictEqual(amazonArtifacts[0].source, 'STAFF_MANUAL_ASSERTION');
  } finally {
    server.close();
  }

  console.log('🟢 SMART PULL HARDENING CONTRACTS PASSED');
})().catch(err => {
  console.error('🔴 SMART PULL HARDENING CONTRACT FAILED:', err);
  process.exit(1);
});
