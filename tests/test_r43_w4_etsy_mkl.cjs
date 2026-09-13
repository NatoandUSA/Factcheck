'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.NODE_ENV = 'test';
process.env.OMNI_MASTER_KEY ||= Buffer.alloc(32, 87).toString('base64');
process.env.OMNI_DB_PATH = path.join(__dirname, `.tmp-r43-w4-${process.pid}.sqlite`);
try { fs.unlinkSync(process.env.OMNI_DB_PATH); } catch (_) {}

const { app, db, databaseReady } = require('../server/server');
const { createSessionRecord } = require('../server/security/session');
const { normalizeYtrendsSupplement } = require('../server/etsyResearchWorkflow');
const { buildCsv } = require('./fixtures/etsy_search_rich_67_sanitized.cjs');
const key = value => `84000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params,
  (error, row) => error ? reject(error) : resolve(row || null)));
let server; let passed = 0;
function check(value, message) { assert.ok(value, message); passed++; }

async function main() {
  const supplemental = normalizeYtrendsSupplement({ data: { adjacent_tags: [{ tag: 'regalo para hija' }],
    related_keywords: [{ keyword: 'collar personalizado' }], top_listings: [{ tags: ['hija necklace'] }] } },
  'para mi hija', '2026-09-12T00:00:00.000Z');
  check(supplemental.evidenceTier === 'E3_SUPPLEMENTAL_INDEX' && supplemental.phrases.length === 3,
    'YTrends phrases normalize only as optional E3 evidence');
  check(/^[a-f0-9]{64}$/.test(supplemental.responseHash) && supplemental.overview === null,
    'YTrends supplement is hash-bound and does not invent overview metrics');
  await databaseReady;
  const owner = await get(`SELECT u.id AS userId,w.id AS workspaceId,w.tenant_id AS tenantId,w.marketplace
    FROM users u JOIN workspace_memberships m ON m.user_id=u.id JOIN workspaces w ON w.id=m.workspace_id
    WHERE u.email='owner@omniseller.local' AND m.role='OWNER' AND w.marketplace='ETSY' LIMIT 1`);
  check(owner?.marketplace === 'ETSY', 'Etsy owner scope exists');
  const session = await new Promise((resolve, reject) => createSessionRecord(db, owner.userId, owner.workspaceId,
    owner.tenantId, (error, value) => error ? reject(error) : resolve(value)));
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`; process.env.ALLOWED_ORIGINS = origin;
  const headers = { Cookie: `omni_session=${session.rawToken}`, Origin: origin };
  const json = async (route, method = 'GET', body) => {
    const response = await fetch(`${origin}${route}`, { method,
      headers: { ...headers, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  const upload = async (projectId, name, bytes, idempotencyKey) => {
    const form = new FormData(); form.append('kind', 'ETSY_SEARCH'); form.append('idempotencyKey', idempotencyKey);
    form.append('researchFile', new Blob([bytes]), name);
    const response = await fetch(`${origin}/api/projects/${projectId}/research-imports`, { method: 'POST', headers, body: form });
    return { status: response.status, body: await response.json() };
  };

  const project = await json('/api/projects', 'POST', { name: `W4 Etsy Hija ${Date.now()}`, seedPhrase: 'para mi hija',
    locale: 'es-US', mediaClass: 'NON_MEDIA', productTypeId: 'CUSTOM_NECKLACE', categoryId: 'JEWELRY_NECKLACE',
    productFamilyVersion: 'custom-necklace-v1' });
  check(project.status === 200, JSON.stringify(project.body)); const projectId = project.body.projectId;
  // Three repository-owned, sanitized exports preserve the real multi-file
  // accounting shape without coupling canonical CI to an operator Downloads
  // directory: 195 observations, 176 entities and 19 repeated observations.
  const fixtures = [
    { name: 'etsy_search_page_1.csv', indexes: Array.from({ length: 65 }, (_, index) => index + 1) },
    { name: 'etsy_search_page_2.csv', indexes: Array.from({ length: 65 }, (_, index) => index + 66) },
    { name: 'etsy_search_page_3.csv', indexes: [
      ...Array.from({ length: 46 }, (_, index) => index + 131),
      ...Array.from({ length: 19 }, (_, index) => index + 1)
    ] }
  ];
  check(fixtures.length === 3 && fixtures.every(item => item.indexes.length === 65),
    'three deterministic Etsy CSV fixtures exist');
  const imports = [];
  for (let index = 0; index < fixtures.length; index++) {
    const fixture = fixtures[index];
    const result = await upload(projectId, fixture.name, Buffer.from(buildCsv(fixture.indexes)), key(index + 1));
    check(result.status === 201, JSON.stringify(result.body)); imports.push(result.body.researchImportId);
  }
  const research = await json(`/api/projects/${projectId}/research-snapshots`, 'POST', {
    expectedHeadResearchSnapshotId: null, importIds: imports, idempotencyKey: key(10),
    changeReason: 'MULTI_FILE_LIVE_ETSY_RESEARCH'
  });
  check(research.status === 201, JSON.stringify(research.body));

  const winnerPreview = await json(`/api/projects/${projectId}/etsy/winners/preview`, 'POST', {
    researchSnapshotId: research.body.researchSnapshotId
  });
  check(winnerPreview.status === 200 && winnerPreview.body.zeroWrite, JSON.stringify(winnerPreview.body));
  check(winnerPreview.body.accounting.sourceObservationCount === 195, 'all 195 observations retained');
  check(winnerPreview.body.accounting.normalizedEntityCount === 176, '195 observations normalize to 176 entities');
  check(winnerPreview.body.accounting.duplicateObservationCount === 19, '19 repeats remain accounted observations');
  check(winnerPreview.body.accounting.droppedObservationCount === 0, 'winner normalization drops nothing');
  check(winnerPreview.body.payload.cohorts.length >= 3, 'multiple transparent winner views exist');
  check(winnerPreview.body.payload.cohorts.every(item => item.members.length <= 10), 'winner views cap at ten listings');
  check(winnerPreview.body.payload.entities.every(item => item.fieldProvenance && item.observations.length),
    'every entity retains field and row provenance');
  check(winnerPreview.body.payload.entities.some(item => item.observationCount > 1), 'repeated listings preserve multiple observations');
  check(winnerPreview.body.payload.entities.some(item => item.scoreComponents.some(component => component.tier === 'E2_MODELED_THIRD_PARTY')),
    'HeyEtsy modeled metrics remain explicitly E2');
  check(winnerPreview.body.payload.selectedEntityIds.length > 0, 'engine proposes editable winners');
  const staffSelection = winnerPreview.body.payload.selectedEntityIds.slice(0, 12).reverse();
  const winners = await json(`/api/projects/${projectId}/etsy/winners`, 'POST', {
    researchSnapshotId: research.body.researchSnapshotId, selectedEntityIds: staffSelection,
    expectedHeadArtifactId: null, idempotencyKey: key(11), changeReason: 'STAFF_EDITED_ETSY_WINNERS'
  });
  check(winners.status === 201 && winners.body.payload.selectedEntityIds.join('|') === staffSelection.join('|'), JSON.stringify(winners.body));
  check(winners.body.payload.selectionMode === 'STAFF_SELECTED', 'staff winner choice is authoritative for mining');

  const patternPreview = await json(`/api/projects/${projectId}/etsy/patterns/preview`, 'POST', {
    winnerArtifactId: winners.body.id
  });
  check(patternPreview.status === 200 && patternPreview.body.zeroWrite, JSON.stringify(patternPreview.body));
  check(patternPreview.body.accounting.selectedWinnerCount === staffSelection.length, 'pattern miner consumes exact winner set');
  check(patternPreview.body.payload.topWords.length > 0 && patternPreview.body.payload.repeatedPhrases.length > 0,
    'title vocabulary and repeated phrases mined');
  check(patternPreview.body.payload.evidenceTiers.modeledRanking === 'E2_MODELED_THIRD_PARTY'
    && patternPreview.body.payload.evidenceTiers.ytrendsSupplement === 'E3_SUPPLEMENTAL_INDEX',
  'evidence tiers remain separate');
  check(!patternPreview.body.payload.observedTags.some(item => /^no tags? found$/i.test(item.phrase)),
    'No tags found boilerplate never becomes a keyword');
  const patterns = await json(`/api/projects/${projectId}/etsy/patterns`, 'POST', {
    winnerArtifactId: winners.body.id, expectedHeadArtifactId: null, idempotencyKey: key(12),
    changeReason: 'FREEZE_ETSY_PATTERN_SNAPSHOT'
  });
  check(patterns.status === 201 && patterns.body.dependencies.winnerArtifactHash === winners.body.artifactHash,
    JSON.stringify(patterns.body));

  const masterPreview = await json(`/api/projects/${projectId}/etsy/master-keywords/preview`, 'POST', {
    patternArtifactId: patterns.body.id, decisions: []
  });
  check(masterPreview.status === 200 && masterPreview.body.zeroWrite, JSON.stringify(masterPreview.body));
  check(masterPreview.body.accounting.masterKeywordCount > 0 && masterPreview.body.accounting.droppedKeywordCount === 0,
    'Etsy MKL retains every source phrase');
  check(masterPreview.body.payload.keywords.every(item => item.provenance.length && item.semanticCluster && item.intent),
    'every Etsy keyword has provenance, semantic cluster and intent');
  check(masterPreview.body.payload.keywords.some(item => item.sourceTypes.includes('PROJECT_SEED')),
    'project seed retained with explicit provenance');
  check(masterPreview.body.payload.keywords.some(item => item.sourceTypes.includes('PROJECT_SEED') && item.tier === 'PRIMARY'),
    'project seed is a PRIMARY keyword rather than leaving the Etsy MKL without a primary tier');
  check(masterPreview.body.accounting.primaryCount > 0
    && masterPreview.body.payload.keywords.every(item => Number.isFinite(item.opportunityScore)),
  'Etsy MKL exposes primary accounting and explicit demand-versus-competition opportunity proxies');
  const changed = masterPreview.body.payload.keywords.find(item => item.tier !== 'EXCLUDED');
  const master = await json(`/api/projects/${projectId}/etsy/master-keywords`, 'POST', {
    patternArtifactId: patterns.body.id, decisions: [{ phrase: changed.phrase, tier: 'REVIEW', note: 'Staff kiểm lại' }],
    expectedHeadArtifactId: null, idempotencyKey: key(13), changeReason: 'FREEZE_ETSY_MASTER_KEYWORDS'
  });
  check(master.status === 201 && master.body.payload.keywords.find(item => item.phrase === changed.phrase).tier === 'REVIEW',
    JSON.stringify(master.body));
  const replay = await json(`/api/projects/${projectId}/etsy/master-keywords`, 'POST', {
    patternArtifactId: patterns.body.id, decisions: [{ phrase: changed.phrase, tier: 'REVIEW', note: 'Staff kiểm lại' }],
    expectedHeadArtifactId: null, idempotencyKey: key(13), changeReason: 'FREEZE_ETSY_MASTER_KEYWORDS'
  });
  check(replay.status === 200 && replay.body.duplicate && replay.body.id === master.body.id, 'exact Etsy MKL replay is idempotent');
  const state = await json(`/api/projects/${projectId}/marketplace-workflow`);
  check(state.status === 200 && state.body.heads.ETSY_WINNER_SET.id === winners.body.id
    && state.body.heads.ETSY_PATTERN_SNAPSHOT.id === patterns.body.id
    && state.body.heads.ETSY_MASTER_KEYWORDS.id === master.body.id, 'all W4 heads reopen in project scope');

  const revisedWinners = await json(`/api/projects/${projectId}/etsy/winners`, 'POST', {
    researchSnapshotId: research.body.researchSnapshotId, selectedEntityIds: staffSelection.slice(0, 8),
    expectedHeadArtifactId: winners.body.id, idempotencyKey: key(14), changeReason: 'REVISE_ETSY_WINNERS'
  });
  check(revisedWinners.status === 201, JSON.stringify(revisedWinners.body));
  const stale = await json(`/api/projects/${projectId}/etsy/patterns/preview`, 'POST', { winnerArtifactId: winners.body.id });
  check(stale.status === 409 && stale.body.error === 'STALE_ETSY_WORKFLOW_ARTIFACT', 'stale winner artifact is rejected');
  console.log(`R4.3 W4 Etsy MKL: ${passed}/${passed} PASS`);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await new Promise(resolve => db.close(() => resolve()));
  for (const suffix of ['', '-wal', '-shm']) try { fs.unlinkSync(`${process.env.OMNI_DB_PATH}${suffix}`); } catch (_) {}
});
