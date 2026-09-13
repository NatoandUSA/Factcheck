'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');

process.env.NODE_ENV = 'test';
process.env.OMNI_MASTER_KEY ||= Buffer.alloc(32, 87).toString('base64');
process.env.OMNI_DB_PATH = path.join(__dirname, `.tmp-r43-w3-${process.pid}.sqlite`);
for (const suffix of ['', '-wal', '-shm']) try { fs.unlinkSync(`${process.env.OMNI_DB_PATH}${suffix}`); } catch (_) {}

const { app, db, databaseReady } = require('../server/server');
const { createSessionRecord } = require('../server/security/session');
const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params,
  (error, row) => error ? reject(error) : resolve(row || null)));
const key = value => `83000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
let server; let passed = 0;
function check(value, message) { assert.ok(value, message); passed++; }

async function cerebroFixture() {
  const book = new ExcelJS.Workbook();
  book.addWorksheet('Cerebro').addRows([
    ['Keyword Phrase', 'Search Volume', 'Keyword Sales', 'Cerebro IQ Score', 'Position (Rank)',
      'Ranking Competitors (Count)', 'Search Volume Trend', 'CPR', 'H10 PPC Sugg. Bid'],
    ['para mi hija collar', 2400, 90, 3200, 2, 8, 12, 17, 1.25],
    ['regalo para hija', 1900, 70, 2800, 3, 9, 10, 15, 1.1],
    ['collar de plata 925 para mujer', 689, 30, 1800, 8, 7, 5, 12, .95],
    ['collar de oro para mujer 18k', 180, 9, 900, 18, 12, 1, 8, .7],
    ['regalo graduacion hija', 800, 32, 1500, 6, 7, 4, 11, .85],
    ['collar personalizado hija', 750, 31, 1400, 7, 7, 4, 10, .8]
  ]);
  return Buffer.from(await book.xlsx.writeBuffer());
}

async function main() {
  await databaseReady;
  const owner = await get(`SELECT u.id AS userId,w.id AS workspaceId,w.tenant_id AS tenantId
    FROM users u JOIN workspace_memberships m ON m.user_id=u.id JOIN workspaces w ON w.id=m.workspace_id
    WHERE u.email='owner@omniseller.local' AND m.role='OWNER' AND w.marketplace='AMAZON' LIMIT 1`);
  const session = await new Promise((resolve, reject) => createSessionRecord(db, owner.userId, owner.workspaceId,
    owner.tenantId, (error, value) => error ? reject(error) : resolve(value)));
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`; process.env.ALLOWED_ORIGINS = origin;
  const headers = { Cookie: `omni_session=${session.rawToken}`, Origin: origin };
  const json = async (route, method = 'GET', body) => {
    const response = await fetch(`${origin}${route}`, { method, headers: { ...headers, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  const upload = async (projectId, bytes) => {
    const form = new FormData(); form.append('kind', 'AMAZON_CEREBRO'); form.append('idempotencyKey', key(1));
    form.append('researchFile', new Blob([bytes]), 'Cerebro_W3.xlsx');
    const response = await fetch(`${origin}/api/projects/${projectId}/research-imports`, { method: 'POST', headers, body: form });
    return { status: response.status, body: await response.json() };
  };

  const project = await json('/api/projects', 'POST', { name: `W3 Safe Amazon ${Date.now()}`,
    seedPhrase: 'para mi hija', locale: 'es-US', mediaClass: 'NON_MEDIA', productTypeId: 'CUSTOM_NECKLACE',
    categoryId: 'JEWELRY_NECKLACE', productFamilyVersion: 'custom-necklace-v1' });
  check(project.status === 200, JSON.stringify(project.body)); const projectId = project.body.projectId;
  const imported = await upload(projectId, await cerebroFixture());
  check(imported.status === 201, JSON.stringify(imported.body));
  const research = await json(`/api/projects/${projectId}/research-snapshots`, 'POST', {
    expectedHeadResearchSnapshotId: null, importIds: [imported.body.researchImportId], idempotencyKey: key(2),
    changeReason: 'W3_CEREBRO_RESEARCH'
  });
  check(research.status === 201, JSON.stringify(research.body));
  const truth = await json(`/api/projects/${projectId}/product-truth/revisions`, 'POST', {
    expectedHeadRevisionId: null, idempotencyKey: key(3), changeReason: 'W3_VERIFIED_SUPPLIER_FACTS', facts: {
      productName: { disposition: 'ASSERTED', value: 'Collar Para Mi Hija', basis: 'SUPPLIER_SPEC' },
      productType: { disposition: 'ASSERTED', value: 'Custom Necklace', basis: 'SUPPLIER_SPEC' },
      materials: { disposition: 'ASSERTED', value: 'Stainless steel, 14k gold plated', basis: 'SUPPLIER_SPEC' },
      sizes: { disposition: 'ASSERTED', value: '18 inch chain', basis: 'SUPPLIER_SPEC' },
      colors: { disposition: 'ASSERTED', value: 'Yellow gold', basis: 'SUPPLIER_SPEC' },
      personalization: { disposition: 'ASSERTED', value: 'Custom name personalization', basis: 'PRODUCTION_WORKFLOW' },
      packaging: { disposition: 'ASSERTED', value: 'Gift box and message card', basis: 'SUPPLIER_SPEC' },
      recipient: { disposition: 'ASSERTED', value: 'daughter', basis: 'OTHER' },
      occasion: { disposition: 'ASSERTED', value: 'graduation', basis: 'OTHER' },
      care: { disposition: 'ASSERTED', value: 'Keep dry and store in the gift box', basis: 'SUPPLIER_SPEC' }
    }
  });
  check(truth.status === 201, JSON.stringify(truth.body));
  const truthId = truth.body.productTruthRevisionId;
  const missingMaster = await json(`/api/projects/${projectId}/intelligence-snapshots/preview`, 'POST', {
    researchSnapshotId: research.body.researchSnapshotId, productTruthRevisionId: truthId, listingLanguage: 'ES'
  });
  check(missingMaster.status === 409 && missingMaster.body.error === 'MASTER_KEYWORD_ARTIFACT_REQUIRED',
    'Amazon composition cannot bypass Master Keyword artifact');
  const master = await json(`/api/projects/${projectId}/amazon/master-keywords`, 'POST', {
    researchSnapshotId: research.body.researchSnapshotId, decisions: [], expectedHeadArtifactId: null,
    idempotencyKey: key(4), changeReason: 'W3_FREEZE_MASTER_KEYWORDS'
  });
  check(master.status === 201, JSON.stringify(master.body));
  const preview = await json(`/api/projects/${projectId}/intelligence-snapshots/preview`, 'POST', {
    researchSnapshotId: research.body.researchSnapshotId, productTruthRevisionId: truthId,
    masterKeywordArtifactId: master.body.id, listingLanguage: 'ES'
  });
  check(preview.status === 200 && preview.body.zeroWrite, JSON.stringify(preview.body));
  check(preview.body.output.masterKeywordArtifact.id === master.body.id
    && preview.body.output.masterKeywordArtifact.artifactHash === master.body.artifactHash,
  'intelligence binds exact immutable MKL');
  const draft = preview.body.output.listingDraft;
  const visibleCopy = JSON.stringify({ title: draft.amazonTitle, bullets: draft.amazonBullets,
    description: draft.amazonDescription, highlights: draft.itemHighlights, aPlus: draft.amazonAPlusPoints });
  check(!/\b(?:925|18k)\b/i.test(visibleCopy), 'unverified 925 and 18k are absent from visible copy');
  check(preview.body.output.claimTargeting.some(item => /925/.test(item.phrase))
    && preview.body.output.claimTargeting.some(item => /18k/i.test(item.phrase)),
  'unverified research claims remain available only as flagged targeting');
  check(draft.amazonTitle.length > 0 && draft.amazonBullets.length === 5
    && Buffer.byteLength(draft.amazonSearchTerms, 'utf8') <= 249 && draft.amazonDescription.length > 0,
  'complete Amazon title, five bullets, byte-safe search terms and description generated');
  check(draft.amazonBullets.every((bullet, index) => bullet.length <= 230
    && preview.body.output.commerce.capacityTargets.bullets[index].actual === bullet.length
    && !bullet.endsWith('…')), 'bullet counters are exact and composition never ends with a truncation ellipsis');
  check(draft.amazonAPlusPoints.length >= 5, 'A+ factual content points generated');
  check(draft.imagePrompts.prompts.length === 8 && draft.imagePrompts.readyCount === 8
    && draft.imagePrompts.blockedCount === 0, 'complete eight-prompt physical image suite generated from Product Truth');
  check(preview.body.accounting.masterKeywordCount
    === preview.body.accounting.allocatedKeywordCount + preview.body.accounting.staffExcludedCount,
  'every Master Keyword row is fully accounted');

  const intelligence = await json(`/api/projects/${projectId}/intelligence-snapshots`, 'POST', {
    expectedHeadIntelligenceSnapshotId: null, researchSnapshotId: research.body.researchSnapshotId,
    productTruthRevisionId: truthId, masterKeywordArtifactId: master.body.id, listingLanguage: 'ES',
    idempotencyKey: key(5), changeReason: 'W3_SAVE_SAFE_INTELLIGENCE'
  });
  check(intelligence.status === 201, JSON.stringify(intelligence.body));
  const commerce = await json(`/api/projects/${projectId}/listings/commerce-preview`, 'POST', {
    intelligenceSnapshotId: intelligence.body.intelligenceSnapshotId
  });
  check(commerce.status === 200 && commerce.body.dependencies.masterKeywordArtifactId === master.body.id
    && commerce.body.dependencies.masterKeywordArtifactHash === master.body.artifactHash,
  'draft dependency graph includes exact MKL id and hash');
  const listing = await json(`/api/projects/${projectId}/listings`, 'POST', {
    idempotencyKey: key(6), changeReason: 'W3_SAVE_NEEDS_QA', productTruthRevisionId: truthId,
    intelligenceSnapshotId: intelligence.body.intelligenceSnapshotId, content: commerce.body.content
  });
  check(listing.status === 201 && listing.body.status === 'NEEDS_QA', JSON.stringify(listing.body));
  const reopened = await json(`/api/listings/${listing.body.listingId}/revisions/${listing.body.revisionId}`);
  check(reopened.status === 200
    && reopened.body.revision.dependencies.masterKeywordArtifactHash === master.body.artifactHash,
  'saved NEEDS_QA revision reopens with identical MKL dependency');

  const changed = await json(`/api/projects/${projectId}/amazon/master-keywords`, 'POST', {
    researchSnapshotId: research.body.researchSnapshotId,
    decisions: [{ phrase: master.body.payload.keywords[0].phrase, tier: 'SECONDARY', note: 'W3 stale dependency probe' }],
    expectedHeadArtifactId: master.body.id, idempotencyKey: key(7), changeReason: 'W3_REVISE_MASTER_KEYWORDS'
  });
  check(changed.status === 201 && changed.body.id !== master.body.id, JSON.stringify(changed.body));
  const stale = await json(`/api/projects/${projectId}/listings/commerce-preview`, 'POST', {
    intelligenceSnapshotId: intelligence.body.intelligenceSnapshotId
  });
  check(stale.status === 409 && stale.body.error === 'STALE_MASTER_KEYWORD_ARTIFACT',
    'changing MKL invalidates old intelligence and draft');
  const persisted = await get('SELECT dependency_manifest_json FROM listing_revisions WHERE id=?', [listing.body.revisionId]);
  check(JSON.parse(persisted.dependency_manifest_json).masterKeywordArtifactId === master.body.id,
    'historical listing revision remains immutable after MKL advances');
  console.log(`R4.3 W3 Amazon safe output: ${passed}/${passed} PASS`);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await new Promise(resolve => db.close(() => resolve()));
  for (const suffix of ['', '-wal', '-shm']) try { fs.unlinkSync(`${process.env.OMNI_DB_PATH}${suffix}`); } catch (_) {}
});
