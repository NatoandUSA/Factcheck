'use strict';

const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
process.env.OMNI_MASTER_KEY ||= Buffer.alloc(32, 91).toString('base64');

const { app, db, databaseReady } = require('../server/server');
const { createSessionRecord } = require('../server/security/session');

const all = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params,
  (error, rows) => error ? reject(error) : resolve(rows)));
const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params,
  (error, row) => error ? reject(error) : resolve(row || null)));
const key = value => `20000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
let server;

async function main() {
  await databaseReady;
  const owner = await get(`SELECT u.id AS userId,w.id AS workspaceId,w.tenant_id AS tenantId,w.marketplace
    FROM users u JOIN workspace_memberships m ON m.user_id=u.id JOIN workspaces w ON w.id=m.workspace_id
    WHERE u.email='owner@omniseller.local' AND m.role='OWNER' AND w.marketplace='AMAZON' LIMIT 1`);
  assert(owner);
  const session = await new Promise((resolve, reject) => createSessionRecord(db, owner.userId, owner.workspaceId,
    owner.tenantId, (error, value) => error ? reject(error) : resolve(value)));
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  process.env.ALLOWED_ORIGINS = origin;
  const headers = { Cookie: `omni_session=${session.rawToken}`, Origin: origin, 'Content-Type': 'application/json' };
  const request = async (route, method = 'GET', body) => {
    const response = await fetch(`${origin}${route}`, { method, headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };

  const project = await request('/api/projects', 'POST', {
    name: `G3 Hija ${Date.now()}`, seedPhrase: 'para mi hija', locale: 'en-US', mediaClass: 'NON_MEDIA',
    productTypeId: 'CUSTOM_NECKLACE', categoryId: 'JEWELRY_NECKLACE', productFamilyVersion: 'custom-necklace-v1'
  });
  assert.equal(project.status, 200, JSON.stringify(project.body));
  assert.equal(project.body.policyContextState, 'COMPLETE');

  const truth = await request(`/api/projects/${project.body.projectId}/product-truth/revisions`, 'POST', {
    expectedHeadRevisionId: null, idempotencyKey: key(1), changeReason: 'STAFF_DRAFT',
    facts: {
      productType: { disposition: 'ASSERTED', value: 'Custom Necklace', basis: 'SUPPLIER_SPEC' },
      materials: { disposition: 'ASSERTED', value: 'stainless steel', basis: 'SUPPLIER_SPEC' },
      personalization: { disposition: 'ASSERTED', value: 'Custom name personalization', basis: 'PRODUCTION_WORKFLOW' },
      recipient: { disposition: 'ASSERTED', value: 'daughter', basis: 'OTHER' },
      occasion: { disposition: 'ASSERTED', value: 'Birthday', basis: 'OTHER' },
      packaging: { disposition: 'UNKNOWN', reason: 'Not confirmed' }
    }, notes: 'Staff-entered facts; Manager confirmation pending.'
  });
  assert.equal(truth.status, 201, JSON.stringify(truth.body));
  assert.equal(truth.body.confirmationState, 'STAFF_DRAFT');

  const confirmedTruth = await request(
    `/api/projects/${project.body.projectId}/product-truth/revisions/${truth.body.productTruthRevisionId}/confirm`,
    'POST',
    { idempotencyKey: key(5), reason: 'Owner verified supplier specification' }
  );
  assert.equal(confirmedTruth.status, 201, JSON.stringify(confirmedTruth.body));
  assert.equal(confirmedTruth.body.confirmationState, 'MANAGER_CONFIRMED');

  const beforePreview = {
    listings: (await get('SELECT COUNT(*) AS n FROM listings')).n,
    revisions: (await get('SELECT COUNT(*) AS n FROM listing_revisions')).n,
    receipts: (await get('SELECT COUNT(*) AS n FROM listing_write_receipts')).n
  };
  const preview = await request(`/api/projects/${project.body.projectId}/listings/compose-preview`, 'POST', {
    productTruthRevisionId: truth.body.productTruthRevisionId
  });
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.equal(preview.body.zeroWrite, true);
  assert.equal(preview.body.provider, 'DETERMINISTIC_TRUTH_ONLY');
  assert.deepEqual({
    listings: (await get('SELECT COUNT(*) AS n FROM listings')).n,
    revisions: (await get('SELECT COUNT(*) AS n FROM listing_revisions')).n,
    receipts: (await get('SELECT COUNT(*) AS n FROM listing_write_receipts')).n
  }, beforePreview);

  const createInput = {
    idempotencyKey: key(2), changeReason: 'SAVE_SAFE_PREVIEW',
    productTruthRevisionId: truth.body.productTruthRevisionId, content: preview.body.content
  };
  const created = await request(`/api/projects/${project.body.projectId}/listings`, 'POST', createInput);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.status, 'NEEDS_QA');
  const savedDependency = await get('SELECT dependency_manifest_json FROM listing_revisions WHERE id=?', [created.body.revisionId]);
  assert.equal(JSON.parse(savedDependency.dependency_manifest_json).bindingState, 'INCOMPLETE');
  assert.ok(JSON.parse(savedDependency.dependency_manifest_json).missingBindings.includes('intelligenceSnapshotId'));

  const editedContent = { ...created.body.content,
    amazonDescription: `${created.body.content.amazonDescription}. Custom name personalization.` };
  const edited = await request(`/api/listings/${created.body.listingId}/revisions`, 'POST', {
    parentRevisionId: created.body.revisionId, expectedHeadRevisionId: created.body.revisionId,
    idempotencyKey: key(3), changeReason: 'SELLER_EDIT',
    productTruthRevisionId: truth.body.productTruthRevisionId, content: editedContent
  });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.equal(edited.body.revisionNumber, 2);

  const history = await request(`/api/listings/${created.body.listingId}/revisions`);
  assert.equal(history.status, 200, JSON.stringify(history.body));
  assert.deepEqual(history.body.revisions.map(row => row.revision_number), [2, 1]);
  assert.deepEqual(history.body.revisions[0].content, editedContent);
  assert.deepEqual(history.body.revisions[1].content, preview.body.content);
  const reopenedV1 = await request(`/api/listings/${created.body.listingId}/revisions/${created.body.revisionId}`);
  assert.equal(reopenedV1.status, 200, JSON.stringify(reopenedV1.body));
  assert.deepEqual(reopenedV1.body.revision.content, preview.body.content);

  const truthV2 = await request(`/api/projects/${project.body.projectId}/product-truth/revisions`, 'POST', {
    expectedHeadRevisionId: truth.body.productTruthRevisionId, idempotencyKey: key(6),
    changeReason: 'ADD_PACKAGING_TRUTH', facts: {
      productType: { disposition: 'ASSERTED', value: 'Custom Necklace', basis: 'SUPPLIER_SPEC' },
      materials: { disposition: 'ASSERTED', value: 'stainless steel', basis: 'SUPPLIER_SPEC' },
      personalization: { disposition: 'ASSERTED', value: 'Custom name personalization', basis: 'PRODUCTION_WORKFLOW' },
      recipient: { disposition: 'ASSERTED', value: 'daughter', basis: 'OTHER' },
      occasion: { disposition: 'ASSERTED', value: 'Birthday', basis: 'OTHER' },
      packaging: { disposition: 'ASSERTED', value: 'gift box', basis: 'SUPPLIER_SPEC' }
    }
  });
  assert.equal(truthV2.status, 200, JSON.stringify(truthV2.body));
  const beforeReplay = {
    listings: (await get('SELECT COUNT(*) AS n FROM listings')).n,
    revisions: (await get('SELECT COUNT(*) AS n FROM listing_revisions')).n,
    receipts: (await get('SELECT COUNT(*) AS n FROM listing_write_receipts')).n
  };
  const replayAfterTruthAdvance = await request(`/api/projects/${project.body.projectId}/listings`, 'POST', createInput);
  assert.equal(replayAfterTruthAdvance.status, 201, JSON.stringify(replayAfterTruthAdvance.body));
  assert.equal(replayAfterTruthAdvance.body.listingId, created.body.listingId);
  assert.equal(replayAfterTruthAdvance.body.revisionId, created.body.revisionId);
  assert.deepEqual({
    listings: (await get('SELECT COUNT(*) AS n FROM listings')).n,
    revisions: (await get('SELECT COUNT(*) AS n FROM listing_revisions')).n,
    receipts: (await get('SELECT COUNT(*) AS n FROM listing_write_receipts')).n
  }, beforeReplay);
  const staleNewWrite = await request(`/api/projects/${project.body.projectId}/listings`, 'POST', {
    ...createInput, idempotencyKey: key(7)
  });
  assert.equal(staleNewWrite.status, 409, JSON.stringify(staleNewWrite.body));
  assert.equal(staleNewWrite.body.error, 'STALE_PRODUCT_TRUTH_REVISION');

  const beforeLegacy = await get('SELECT head_revision_id,listing_version,payload FROM listings WHERE id=?', [created.body.listingId]);
  const legacyEdit = await request(`/api/listings/${created.body.listingId}`, 'PATCH', {
    expectedVersion: 2, amazonTitle: 'Legacy bypass', etsyTitle: '', categoryName: '', payload: editedContent
  });
  assert.equal(legacyEdit.status, 409, JSON.stringify(legacyEdit.body));
  assert.equal(legacyEdit.body.error, 'CANONICAL_REVISION_ROUTE_REQUIRED');
  assert.deepEqual(await get('SELECT head_revision_id,listing_version,payload FROM listings WHERE id=?', [created.body.listingId]), beforeLegacy);

  const legacyApproval = await request(`/api/listings/${created.body.listingId}/approve`, 'PATCH', {
    expectedVersion: edited.body.revisionNumber
  });
  assert.equal(legacyApproval.status, 409, JSON.stringify(legacyApproval.body));
  assert.equal(legacyApproval.body.error, 'CANONICAL_APPROVAL_ROUTE_REQUIRED');
  const legacyExport = await request(`/api/listings/${created.body.listingId}/export`);
  assert.equal(legacyExport.status, 409, JSON.stringify(legacyExport.body));
  assert.equal(legacyExport.body.error, 'CANONICAL_EXPORT_PACKAGE_ROUTE_REQUIRED');
  assert.deepEqual(await get('SELECT head_revision_id,listing_version,payload FROM listings WHERE id=?', [created.body.listingId]), beforeLegacy);

  const forbidden = await request(`/api/projects/${project.body.projectId}/listings`, 'POST', {
    idempotencyKey: key(4), changeReason: 'FORGED', productTruthRevisionId: truth.body.productTruthRevisionId,
    content: preview.body.content, dependencies: preview.body.dependencies
  });
  assert.equal(forbidden.status, 400);
  assert.equal(forbidden.body.error, 'UNEXPECTED_REQUEST_FIELD');
  console.log('G3 canonical HTTP bootstrap: 33/33 PASS');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await new Promise(resolve => db.close(resolve));
});
