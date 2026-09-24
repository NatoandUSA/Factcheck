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
  const manager = await get(`SELECT u.id AS userId FROM users u JOIN workspace_memberships m ON m.user_id=u.id
    WHERE u.email='manager@omniseller.local' AND m.role='MANAGER' AND m.workspace_id=? LIMIT 1`, [owner.workspaceId]);
  const seller = await get(`SELECT u.id AS userId FROM users u JOIN workspace_memberships m ON m.user_id=u.id
    WHERE u.email='seller@omniseller.local' AND m.role='SELLER' AND m.workspace_id=? LIMIT 1`, [owner.workspaceId]);
  const managerSession = await new Promise((resolve, reject) => createSessionRecord(db, manager.userId, owner.workspaceId,
    owner.tenantId, (error, value) => error ? reject(error) : resolve(value)));
  const sellerSession = await new Promise((resolve, reject) => createSessionRecord(db, seller.userId, owner.workspaceId,
    owner.tenantId, (error, value) => error ? reject(error) : resolve(value)));
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`; process.env.ALLOWED_ORIGINS = origin;
  const headers = { Cookie: `omni_session=${session.rawToken}`, Origin: origin };
  const jsonAs = async (rawToken, route, method = 'GET', body) => {
    const response = await fetch(`${origin}${route}`, { method,
      headers: { Cookie: `omni_session=${rawToken}`, Origin: origin, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const json = (route, method = 'GET', body) => jsonAs(session.rawToken, route, method, body);
  const jsonAsManager = (route, method = 'GET', body) => jsonAs(managerSession.rawToken, route, method, body);
  const jsonAsSeller = (route, method = 'GET', body) => jsonAs(sellerSession.rawToken, route, method, body);
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
  const sellerUatAuthorization = await jsonAsSeller(`/api/projects/${projectId}/uat-lifecycle-authorizations`, 'POST', {
    reason: 'forged seller authorization', idempotencyKey: key(39)
  });
  check(sellerUatAuthorization.status === 403, 'Seller cannot create project UAT lifecycle authority');
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
  const winnerPreview = await json(`/api/projects/${projectId}/etsy/winners/preview`, 'POST', {
    researchSnapshotId: research.body.researchSnapshotId
  });
  check(winnerPreview.status === 200 && winnerPreview.body.payload.selectedEntityIds.length === 2,
    JSON.stringify(winnerPreview.body));
  const winners = await json(`/api/projects/${projectId}/etsy/winners`, 'POST', {
    researchSnapshotId: research.body.researchSnapshotId,
    selectedEntityIds: winnerPreview.body.payload.selectedEntityIds,
    expectedHeadArtifactId: null, idempotencyKey: key(20), changeReason: 'STAFF_ETSY_WINNERS'
  });
  check(winners.status === 201, JSON.stringify(winners.body));
  const patterns = await json(`/api/projects/${projectId}/etsy/patterns`, 'POST', {
    winnerArtifactId: winners.body.id, expectedHeadArtifactId: null,
    idempotencyKey: key(21), changeReason: 'FREEZE_ETSY_PATTERNS'
  });
  check(patterns.status === 201, JSON.stringify(patterns.body));
  const master = await json(`/api/projects/${projectId}/etsy/master-keywords`, 'POST', {
    patternArtifactId: patterns.body.id, decisions: [], expectedHeadArtifactId: null,
    idempotencyKey: key(22), changeReason: 'FREEZE_ETSY_MASTER_KEYWORDS'
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
  const truthConfirmation = await jsonAsManager(
    `/api/projects/${projectId}/product-truth/revisions/${truth.body.productTruthRevisionId}/confirm`, 'POST', {
      idempotencyKey: key(41), reason: 'MANAGER_VERIFIED_COMMERCIAL_UAT_PRODUCT_TRUTH'
    });
  check(truthConfirmation.status === 201 && truthConfirmation.body.confirmationState === 'MANAGER_CONFIRMED',
    JSON.stringify(truthConfirmation.body));
  const bypass = await json(`/api/projects/${projectId}/intelligence-snapshots/preview`, 'POST', {
    researchSnapshotId: research.body.researchSnapshotId, productTruthRevisionId: truth.body.productTruthRevisionId,
    listingLanguage: 'AUTO'
  });
  check(bypass.status === 409 && bypass.body.error === 'MASTER_KEYWORD_ARTIFACT_REQUIRED',
    'Etsy cannot bypass Winner/Pattern/MKL and compose directly from CSV');
  const intelligence = await json(`/api/projects/${projectId}/intelligence-snapshots`, 'POST', {
    expectedHeadIntelligenceSnapshotId: null, researchSnapshotId: research.body.researchSnapshotId,
    productTruthRevisionId: truth.body.productTruthRevisionId, listingLanguage: 'AUTO', masterKeywordArtifactId: master.body.id,
    idempotencyKey: key(4), changeReason: 'SAVE_ETSY_INTELLIGENCE'
  });
  check(intelligence.status === 201, JSON.stringify(intelligence.body));
  check(intelligence.body.output.language === 'ES', 'AUTO resolves Spanish from the persisted project seed');
  const draft = intelligence.body.output.listingDraft;
  check(draft.etsyTitle.length <= 140, 'Etsy title cap');
  check(draft.etsyTags.length <= 13 && draft.etsyTags.every(tag => Array.from(tag).length <= 20), 'Etsy tag caps');
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
  // Real operator order: safe draft first, then Owner enables internal QA/export-only UAT.
  const uatAuthorization = await json(`/api/projects/${projectId}/uat-lifecycle-authorizations`, 'POST', {
    reason: 'Full Etsy business UAT: internal approval and exact audit export only; marketplace publishing forbidden.',
    idempotencyKey: key(40)
  });
  check(uatAuthorization.status === 201 && uatAuthorization.body.mode === 'APPROVAL_EXPORT_ONLY'
    && uatAuthorization.body.marketplaceSubmissionAllowed === false
    && /Z$/.test(uatAuthorization.body.authorizedAt), JSON.stringify(uatAuthorization.body));
  const uatReplay = await json(`/api/projects/${projectId}/uat-lifecycle-authorizations`, 'POST', {
    reason: 'Full Etsy business UAT: internal approval and exact audit export only; marketplace publishing forbidden.',
    idempotencyKey: key(40)
  });
  check(uatReplay.status === 200 && uatReplay.body.replay === true
    && uatReplay.body.authorizationHash === uatAuthorization.body.authorizationHash
    && uatReplay.body.authorizedAt === uatAuthorization.body.authorizedAt,
  'UAT authorization replays exact server-owned actor/time evidence');
  check((await get(`SELECT COUNT(*) AS n FROM audit_events WHERE action='project:authorize-uat-approval-export'
    AND resource_id=?`, [String(projectId)])).n === 1,
  'one immutable project authority produces one server audit event; replay does not duplicate it');
  await assert.rejects(new Promise((resolve, reject) => db.run(`UPDATE project_uat_lifecycle_authorizations
    SET authorized_at='2000-01-01T00:00:00.000Z' WHERE id=?`, [uatAuthorization.body.uatLifecycleAuthorizationId],
  error => error ? reject(error) : resolve())), /IMMUTABLE_UAT_LIFECYCLE_AUTHORIZATION/); passed++;
  const reboundRevision = await json(`/api/listings/${listing.body.listingId}/revisions`, 'POST', {
    parentRevisionId: listing.body.revisionId,
    expectedHeadRevisionId: listing.body.revisionId,
    idempotencyKey: key(49),
    changeReason: 'REBIND_UAT_LIFECYCLE',
    productTruthRevisionId: truth.body.productTruthRevisionId,
    intelligenceSnapshotId: intelligence.body.intelligenceSnapshotId,
    content: previewListing.body.content
  });
  check(reboundRevision.status === 200 && reboundRevision.body.revisionNumber === 2
    && reboundRevision.body.parentRevisionId === listing.body.revisionId,
  `UAT lifecycle change must produce an immutable listing successor before review: ${JSON.stringify(reboundRevision.body)}`);
  const preApprovalPublishProbe = await jsonAsSeller(
    `/api/listings/${listing.body.listingId}/operator-submission-reports`, 'POST', {
      submissionAuthorizationId: 1,
      submissionExportId: 1,
      manualSubmissionConfirmed: true,
      externalReference: 'MUST-NOT-WRITE-BEFORE-QA',
      notes: 'UAT lifecycle must prohibit marketplace reporting independently of review state.',
      idempotencyKey: key(48)
    });
  check(preApprovalPublishProbe.status === 409
    && preApprovalPublishProbe.body.error === 'UAT_MARKETPLACE_SUBMISSION_FORBIDDEN',
  `UAT marketplace prohibition dominates missing review/approval state: ${JSON.stringify(preApprovalPublishProbe.body)}`);
  const revision = await get('SELECT dependency_manifest_json FROM listing_revisions WHERE id=?', [listing.body.revisionId]);
  const dependencies = JSON.parse(revision.dependency_manifest_json);
  check(dependencies.bindingState === 'BOUND', 'Etsy listing dependencies fully bound');
  check(dependencies.researchSnapshotId === research.body.researchSnapshotId, 'Etsy research snapshot bound');
  check(dependencies.masterKeywordArtifactId === master.body.id
    && dependencies.masterKeywordArtifactHash === master.body.artifactHash, 'Etsy Master Keyword artifact bound');
  check(dependencies.intelligenceSnapshotHash === intelligence.body.intelligenceSnapshotHash, 'Etsy intelligence hash bound');
  check(intelligence.body.output.keywordAllocation.unallocated.length === intelligence.body.accounting.unallocatedCount,
    'unused Etsy keywords retained with accounting');
  const reviewPackage = await json(`/api/listings/${listing.body.listingId}/review-package`, 'GET');
  check(reviewPackage.status === 200 && reviewPackage.body.qualityEvidence.listingLanguage === 'ES',
    'exact review package carries the listing-level language contract from Intelligence');
  check(reviewPackage.body.lifecycle?.mode === 'UAT_APPROVAL_EXPORT_ONLY'
    && reviewPackage.body.lifecycle?.marketplaceSubmissionAllowed === false
    && reviewPackage.body.lifecycle?.uatLifecycleAuthorizationHash === uatAuthorization.body.authorizationHash,
  'exact review package exposes the immutable UAT authority and absolute marketplace-write prohibition');
  check(reviewPackage.body.content.shopName === '' && reviewPackage.body.content.priceAmount === ''
    && reviewPackage.body.content.priceCurrency === '',
  'exact review package exposes commercial gaps instead of fabricating shop identity or price');
  const incompleteApproval = await jsonAsManager(`/api/listings/${listing.body.listingId}/canonical-review`, 'POST', {
    decision: 'APPROVED', reason: 'negative missing commercial data probe',
    expectedListingRevisionId: reviewPackage.body.listingRevisionId,
    expectedContentHash: reviewPackage.body.contentHash,
    expectedDependencyHash: reviewPackage.body.dependencyHash,
    idempotencyKey: key(47)
  });
  check(incompleteApproval.status === 409 && incompleteApproval.body.error === 'POLICY_APPROVAL_BLOCKED'
    && ['SHOP_IDENTITY_REQUIRED','PRICE_AMOUNT_REQUIRED','PRICE_CURRENCY_REQUIRED']
      .every(code => incompleteApproval.body.details?.blockers?.some(item => item.code === code)),
  `UAT approval fails closed until all commercial fields exist: ${JSON.stringify(incompleteApproval.body)}`);
  check(reviewPackage.body.qualityEvidence.languageExemptions.includes('Custom Necklace')
    && reviewPackage.body.qualityEvidence.languageExemptions.includes('hija'),
  'language exemptions are server-derived from verified Product Truth identity/name evidence');
  const successorContent = { ...reviewPackage.body.content,
    etsyTitle: 'Custom Necklace para Hija',
    shopName: 'Luna Atelier Studio',
    priceAmount: '42.50',
    priceCurrency: 'USD',
    etsyDescription: `${reviewPackage.body.content.etsyDescription}\n\nQA copy revision.` };
  const successor = await json(`/api/listings/${listing.body.listingId}/revisions`, 'POST', {
    parentRevisionId: reviewPackage.body.listingRevisionId,
    expectedHeadRevisionId: reviewPackage.body.listingRevisionId,
    idempotencyKey: key(24), changeReason: 'MANAGER_QA_COPY_EDIT',
    productTruthRevisionId: truth.body.productTruthRevisionId,
    intelligenceSnapshotId: intelligence.body.intelligenceSnapshotId,
    content: successorContent
  });
  check(successor.status === 200 && successor.body.status === 'NEEDS_QA'
    && successor.body.content.etsyTitle === successorContent.etsyTitle,
  'controlled QA edit creates an immutable successor revision through the existing primitive');
  const successorPackage = await json(`/api/listings/${listing.body.listingId}/review-package`, 'GET');
  check(successorPackage.body.listingRevisionId === successor.body.revisionId
    && successorPackage.body.dependencies.productTruthRevisionId === truth.body.productTruthRevisionId
    && successorPackage.body.dependencies.intelligenceSnapshotId === intelligence.body.intelligenceSnapshotId,
  'successor exact package preserves Product Truth and Intelligence dependencies');
  check(successorPackage.body.content.shopName === 'Luna Atelier Studio'
    && successorPackage.body.content.priceAmount === '42.50'
    && successorPackage.body.content.priceCurrency === 'USD',
  'controlled QA edit persists commercial fields in the immutable successor');
  const staleQaEdit = await json(`/api/listings/${listing.body.listingId}/revisions`, 'POST', {
    parentRevisionId: reviewPackage.body.listingRevisionId,
    expectedHeadRevisionId: reviewPackage.body.listingRevisionId,
    idempotencyKey: key(25), changeReason: 'STALE_MANAGER_QA_COPY_EDIT',
    productTruthRevisionId: truth.body.productTruthRevisionId,
    intelligenceSnapshotId: intelligence.body.intelligenceSnapshotId,
    content: successorContent
  });
  check(staleQaEdit.status === 409 && ['REVISION_CONFLICT','LISTING_HEAD_CONFLICT','PARENT_REVISION_CONFLICT'].includes(staleQaEdit.body.error),
    `controlled QA edit fails closed when the exact head changed: ${JSON.stringify(staleQaEdit)}`);
  const dependencyDriftCases = [
    { label: 'Product Truth', productTruthRevisionId: truth.body.productTruthRevisionId + 1,
      intelligenceSnapshotId: intelligence.body.intelligenceSnapshotId },
    { label: 'Intelligence', productTruthRevisionId: truth.body.productTruthRevisionId,
      intelligenceSnapshotId: intelligence.body.intelligenceSnapshotId + 1 },
    { label: 'Product Truth and Intelligence', productTruthRevisionId: truth.body.productTruthRevisionId + 1,
      intelligenceSnapshotId: intelligence.body.intelligenceSnapshotId + 1 }
  ];
  for (const [index, drift] of dependencyDriftCases.entries()) {
    const rejected = await json(`/api/listings/${listing.body.listingId}/revisions`, 'POST', {
      parentRevisionId: successor.body.revisionId,
      expectedHeadRevisionId: successor.body.revisionId,
      idempotencyKey: key(26 + index), changeReason: `REJECT_${drift.label.toUpperCase().replaceAll(' ', '_')}_DRIFT`,
      productTruthRevisionId: drift.productTruthRevisionId,
      intelligenceSnapshotId: drift.intelligenceSnapshotId,
      content: successorContent
    });
    check(rejected.status === 409 && rejected.body.error === 'QA_EDIT_DEPENDENCY_DRIFT',
      `${drift.label} rebind attempt must fail against parent-bound dependencies: ${JSON.stringify(rejected)}`);
  }
  const approval = await jsonAsManager(`/api/listings/${listing.body.listingId}/canonical-review`, 'POST', {
    decision: 'APPROVED', reason: 'Manager verified exact content, commercial fields and UAT-only boundary',
    expectedListingRevisionId: successorPackage.body.listingRevisionId,
    expectedContentHash: successorPackage.body.contentHash,
    expectedDependencyHash: successorPackage.body.dependencyHash,
    idempotencyKey: key(42)
  });
  check(approval.status === 201 && approval.body.status === 'MANAGER_APPROVED', JSON.stringify(approval.body));
  const requested = await jsonAsSeller(`/api/listings/${listing.body.listingId}/submission-requests`, 'POST', {
    notes: 'Request exact UAT audit export only; no marketplace submission.', idempotencyKey: key(43)
  });
  check(requested.status === 201 && requested.body.status === 'UAT_EXPORT_REQUESTED'
    && requested.body.marketplaceSubmissionAllowed === false, JSON.stringify(requested.body));
  const authorized = await json(`/api/listings/${listing.body.listingId}/submission-authorizations`, 'POST', {
    submissionRequestId: requested.body.submissionRequestId,
    notes: 'Owner authorizes only the exact UAT audit export.', idempotencyKey: key(44)
  });
  check(authorized.status === 201 && authorized.body.status === 'UAT_EXPORT_AUTHORIZED'
    && authorized.body.marketplaceSubmissionAllowed === false, JSON.stringify(authorized.body));
  const exported = await jsonAsSeller(`/api/listings/${listing.body.listingId}/submission-exports`, 'POST', {
    submissionAuthorizationId: authorized.body.submissionAuthorizationId, idempotencyKey: key(45)
  });
  const exportPacket = JSON.parse(exported.body.exportJson || '{}');
  check(exported.status === 201 && exported.body.status === 'UAT_EXACT_EXPORT_READY'
    && exportPacket.event === 'UAT_EXACT_AUDIT_EXPORT' && exportPacket.uatOnly === true
    && exportPacket.marketplaceSubmissionAllowed === false,
  `UAT export is explicit audit evidence and never submission authority: ${JSON.stringify(exported.body)}`);
  check(exportPacket.content.shopName === 'Luna Atelier Studio' && exportPacket.content.priceAmount === '42.50'
    && exportPacket.content.priceCurrency === 'USD', 'exact UAT export preserves immutable commercial fields');
  check(exportPacket.lifecycleAuthorization?.hash === uatAuthorization.body.authorizationHash
    && exportPacket.lifecycleAuthorization?.authorizedAt === uatAuthorization.body.authorizedAt,
  'exact UAT export binds the server-owned authorization hash and timestamp');
  const forbiddenReport = await jsonAsSeller(`/api/listings/${listing.body.listingId}/operator-submission-reports`, 'POST', {
    submissionAuthorizationId: authorized.body.submissionAuthorizationId,
    submissionExportId: exported.body.submissionExportId, manualSubmissionConfirmed: true,
    externalReference: 'MUST-NOT-WRITE', notes: 'negative UAT marketplace report probe', idempotencyKey: key(46)
  });
  check(forbiddenReport.status === 409 && forbiddenReport.body.error === 'UAT_MARKETPLACE_SUBMISSION_FORBIDDEN',
    `UAT policy must block marketplace report server-side: ${JSON.stringify(forbiddenReport.body)}`);
  check((await get('SELECT COUNT(*) AS n FROM canonical_operator_submission_reports WHERE listing_id=?',
    [listing.body.listingId])).n === 0, 'blocked UAT submission path writes no marketplace event');
  const phrase = master.body.payload.keywords.find(item => item.tier !== 'EXCLUDED').phrase;
  const newerMaster = await json(`/api/projects/${projectId}/etsy/master-keywords`, 'POST', {
    patternArtifactId: patterns.body.id, decisions: [{ phrase, tier: 'REVIEW' }], expectedHeadArtifactId: master.body.id,
    idempotencyKey: key(23), changeReason: 'REVISE_ETSY_MASTER_KEYWORDS'
  });
  check(newerMaster.status === 201, JSON.stringify(newerMaster.body));
  const staleDraft = await json(`/api/projects/${projectId}/listings/commerce-preview`, 'POST', {
    intelligenceSnapshotId: intelligence.body.intelligenceSnapshotId
  });
  check(staleDraft.status === 409 && staleDraft.body.error === 'STALE_MASTER_KEYWORD_ARTIFACT',
    'old Etsy intelligence is stale after Master Keyword revision advances');
  console.log(`G4 Etsy canonical HTTP: ${passed}/${passed} PASS`);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await new Promise(resolve => db.close(() => resolve()));
});
