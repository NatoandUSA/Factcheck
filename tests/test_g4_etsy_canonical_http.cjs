'use strict';

const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
process.env.OMNI_MASTER_KEY ||= Buffer.alloc(32, 83).toString('base64');
const { app, db, databaseReady } = require('../server/server');
const { createSessionRecord } = require('../server/security/session');

const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params,
  (error, row) => error ? reject(error) : resolve(row || null)));
const key = value => `50000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
let server; let passed = 0;
function check(value, message) { assert.ok(value, message); passed++; }

async function main() {
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
  const json = async (route, method, body) => {
    const response = await fetch(`${origin}${route}`, { method, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const upload = async (route, fields) => {
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) value?.bytes
      ? form.append(name, new Blob([value.bytes]), value.name) : form.append(name, value);
    const response = await fetch(`${origin}${route}`, { method: 'POST', headers, body: form });
    return { status: response.status, body: await response.json() };
  };
  const project = await json('/api/projects', 'POST', { name: `G4 Etsy ${Date.now()}`, seedPhrase: 'para mi hija',
    locale: 'es-US', mediaClass: 'NON_MEDIA', productTypeId: 'CUSTOM_NECKLACE', categoryId: 'JEWELRY_NECKLACE',
    productFamilyVersion: 'custom-necklace-v1' });
  check(project.status === 200, JSON.stringify(project.body)); const projectId = project.body.projectId;
  const csv = Buffer.from('listing_id,title,shop,he_tags,keyword_context,rank_position\n1,"Regalo para hija, collar de oro 18k",Shop A,"regalo hija|collar 18k",para mi hija,1\n2,"Collar para hija",Shop B,"cumpleanos hija|regalo especial",para mi hija,2\n');
  const file = { name: 'etsy-search.csv', bytes: csv };
  const before = (await get('SELECT COUNT(*) AS n FROM research_imports')).n;
  const preview = await upload(`/api/projects/${projectId}/research-imports/preview`, { kind: 'ETSY_SEARCH', researchFile: file });
  check(preview.status === 200 && preview.body.zeroWrite === true, JSON.stringify(preview.body));
  check(preview.body.accounting.observationCount === 2, 'all Etsy rows previewed');
  check(preview.body.accounting.unmappedColumns.length === 0, 'all Etsy columns mapped');
  check((await get('SELECT COUNT(*) AS n FROM research_imports')).n === before, 'Etsy preview writes nothing');
  const imported = await upload(`/api/projects/${projectId}/research-imports`, {
    kind: 'ETSY_SEARCH', idempotencyKey: key(1), researchFile: file
  });
  check(imported.status === 201, JSON.stringify(imported.body));
  const research = await json(`/api/projects/${projectId}/research-snapshots`, 'POST', {
    expectedHeadResearchSnapshotId: null, importIds: [imported.body.researchImportId],
    idempotencyKey: key(2), changeReason: 'CONFIRM_ETSY_RESEARCH'
  });
  check(research.status === 201, JSON.stringify(research.body));
  const winners = await json(`/api/projects/${projectId}/etsy/winners`, 'POST', {
    researchSnapshotId: research.body.researchSnapshotId, winnerCount: 5, expectedHeadArtifactId: null,
    idempotencyKey: key(101), changeReason: 'CONFIRM_ETSY_WINNERS'
  });
  check(winners.status === 201, JSON.stringify(winners.body));
  const patterns = await json(`/api/projects/${projectId}/etsy/patterns`, 'POST', {
    winnerSetArtifactId: winners.body.id, expectedHeadArtifactId: null,
    idempotencyKey: key(102), changeReason: 'LOCK_ETSY_PATTERNS'
  });
  check(patterns.status === 201, JSON.stringify(patterns.body));
  const master = await json(`/api/projects/${projectId}/etsy/master-keywords`, 'POST', {
    researchSnapshotId: research.body.researchSnapshotId, winnerSetArtifactId: winners.body.id,
    patternArtifactId: patterns.body.id, expectedHeadArtifactId: null,
    idempotencyKey: key(103), changeReason: 'LOCK_ETSY_MASTER_KW'
  });
  check(master.status === 201 && master.body.accounting.droppedKeywordCount === 0, JSON.stringify(master.body));
  const truth = await json(`/api/projects/${projectId}/product-truth/revisions`, 'POST', {
    expectedHeadRevisionId: null, idempotencyKey: key(3), changeReason: 'STAFF_DRAFT', facts: {
      productType: { disposition: 'ASSERTED', value: 'Custom Necklace', basis: 'SUPPLIER_SPEC' },
      materials: { disposition: 'ASSERTED', value: 'stainless steel', basis: 'SUPPLIER_SPEC' },
      personalization: { disposition: 'ASSERTED', value: 'Custom name personalization', basis: 'PRODUCTION_WORKFLOW' },
      recipient: { disposition: 'ASSERTED', value: 'hija', basis: 'OTHER' }
    }
  });
  check(truth.status === 201, JSON.stringify(truth.body));
  const intelligence = await json(`/api/projects/${projectId}/intelligence-snapshots`, 'POST', {
    expectedHeadIntelligenceSnapshotId: null, researchSnapshotId: research.body.researchSnapshotId,
    productTruthRevisionId: truth.body.productTruthRevisionId, masterKeywordArtifactId: master.body.id, listingLanguage: 'AUTO',
    idempotencyKey: key(4), changeReason: 'SAVE_ETSY_INTELLIGENCE'
  });
  check(intelligence.status === 201, JSON.stringify(intelligence.body));
  check(intelligence.body.output.language === 'ES', 'AUTO resolves Spanish from the persisted project seed');
  const draft = intelligence.body.output.listingDraft;
  check(draft.etsyTitle.length <= 140, 'Etsy title cap');
  check(draft.etsyTags.length <= 13 && draft.etsyTags.every(tag => Array.from(tag).length <= 20), 'Etsy tag caps');
  check(draft.etsyTagExplanations.length === draft.etsyTags.length, 'every Etsy tag has an explanation');
  check(!JSON.stringify(draft).toLowerCase().includes('18k'), 'unverified claim excluded');
  check(intelligence.body.accounting.claimBlockedCount >= 1, 'claim exclusion accounted');
  const previewListing = await json(`/api/projects/${projectId}/listings/commerce-preview`, 'POST', {
    intelligenceSnapshotId: intelligence.body.intelligenceSnapshotId
  });
  check(previewListing.status === 200 && previewListing.body.zeroWrite === true, JSON.stringify(previewListing.body));
  check(previewListing.body.dependencies.intelligenceSnapshotId === intelligence.body.intelligenceSnapshotId,
    'Etsy listing preview binds intelligence');
  const listing = await json(`/api/projects/${projectId}/listings`, 'POST', {
    idempotencyKey: key(5), changeReason: 'SAVE_ETSY_DRAFT', productTruthRevisionId: truth.body.productTruthRevisionId,
    intelligenceSnapshotId: intelligence.body.intelligenceSnapshotId, content: previewListing.body.content
  });
  check(listing.status === 201 && listing.body.status === 'NEEDS_QA', JSON.stringify(listing.body));
  const revision = await get('SELECT dependency_manifest_json FROM listing_revisions WHERE id=?', [listing.body.revisionId]);
  const dependencies = JSON.parse(revision.dependency_manifest_json);
  check(dependencies.bindingState === 'BOUND', 'Etsy listing dependencies fully bound');
  check(dependencies.researchSnapshotId === research.body.researchSnapshotId, 'Etsy research snapshot bound');
  check(dependencies.intelligenceSnapshotHash === intelligence.body.intelligenceSnapshotHash, 'Etsy intelligence hash bound');
  check(intelligence.body.output.keywordAllocation.unallocated.length === intelligence.body.accounting.unallocatedCount,
    'unused Etsy keywords retained with accounting');
  console.log(`G4 Etsy canonical HTTP: ${passed}/${passed} PASS`);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await new Promise(resolve => db.close(() => resolve()));
});
