'use strict';

const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
process.env.NODE_ENV = 'test';
process.env.OMNI_MASTER_KEY ||= Buffer.alloc(32, 84).toString('base64');

const { app, db, databaseReady } = require('../server/server');
const { createSessionRecord } = require('../server/security/session');
const { appendListingRevision } = require('../server/revisionStore');

const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params,
  (error, row) => error ? reject(error) : resolve(row || null)));
const runSql = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function done(error) {
  if (error) reject(error); else resolve({ lastID: this.lastID, changes: this.changes });
}));
const key = value => `40000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
let server; let passed = 0;
function check(value, message) { assert.ok(value, message); passed++; }

async function main() {
  await databaseReady;
  const owner = await get(`SELECT u.id AS userId,w.id AS workspaceId,w.tenant_id AS tenantId,w.marketplace
    FROM users u JOIN workspace_memberships m ON m.user_id=u.id JOIN workspaces w ON w.id=m.workspace_id
    WHERE u.email='owner@omniseller.local' AND m.role='OWNER' AND w.marketplace='AMAZON' LIMIT 1`);
  const session = await new Promise((resolve, reject) => createSessionRecord(db, owner.userId, owner.workspaceId,
    owner.tenantId, (error, value) => error ? reject(error) : resolve(value)));
  const seller = await get(`SELECT u.id AS userId,w.id AS workspaceId,w.tenant_id AS tenantId,w.marketplace
    FROM users u JOIN workspace_memberships m ON m.user_id=u.id JOIN workspaces w ON w.id=m.workspace_id
    WHERE u.email='seller@omniseller.local' AND m.role='SELLER' AND w.id=? LIMIT 1`, [owner.workspaceId]);
  const sellerSession = await new Promise((resolve, reject) => createSessionRecord(db, seller.userId, seller.workspaceId,
    seller.tenantId, (error, value) => error ? reject(error) : resolve(value)));
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  process.env.ALLOWED_ORIGINS = origin;
  const baseHeaders = { Cookie: `omni_session=${session.rawToken}`, Origin: origin };
  const json = async (route, method = 'GET', body) => {
    const response = await fetch(`${origin}${route}`, { method, headers: { ...baseHeaders, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  const jsonAsSeller = async (route, method = 'GET', body) => {
    const response = await fetch(`${origin}${route}`, { method, headers: {
      Cookie: `omni_session=${sellerSession.rawToken}`, Origin: origin, 'Content-Type': 'application/json'
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  const upload = async (route, fields) => {
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) {
      if (name === 'researchFile') form.append(name, new Blob([value.bytes]), value.name);
      else form.append(name, value);
    }
    const response = await fetch(`${origin}${route}`, { method: 'POST', headers: baseHeaders, body: form });
    return { status: response.status, body: await response.json() };
  };
  const project = await json('/api/projects', 'POST', { name: `G4 Research ${Date.now()}`, seedPhrase: 'para mi hija',
    locale: 'en-US', mediaClass: 'NON_MEDIA', productTypeId: 'CUSTOM_NECKLACE',
    categoryId: 'JEWELRY_NECKLACE', productFamilyVersion: 'custom-necklace-v1' });
  check(project.status === 200, 'project created');
  const projectId = project.body.projectId;
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Cerebro').addRows([
    ['Keyword Phrase','Search Volume','Keyword Sales','Position (Rank)'],
    ['para mi hija',1200,40,3], ['regalo para hija',500,null,8]
  ]);
  const fixture = { name: 'sample_cerebro.xlsx', bytes: Buffer.from(await workbook.xlsx.writeBuffer()) };
  const before = { imports: (await get('SELECT COUNT(*) AS n FROM research_imports')).n,
    snapshots: (await get('SELECT COUNT(*) AS n FROM research_snapshots')).n,
    receipts: (await get('SELECT COUNT(*) AS n FROM commerce_write_receipts')).n };
  const preview = await upload(`/api/projects/${projectId}/research-imports/preview`, {
    kind: 'AMAZON_CEREBRO', researchFile: fixture
  });
  check(preview.status === 200, JSON.stringify(preview.body));
  check(preview.body.zeroWrite === true, 'preview is zero write');
  check(preview.body.accounting.cerebroObservationCount > 0, 'preview parses keyword rows');
  check(preview.body.headerSignature.includes('Keyword Phrase'), 'preview reports source headers');
  check((await get('SELECT COUNT(*) AS n FROM research_imports')).n === before.imports, 'preview creates no import');
  check((await get('SELECT COUNT(*) AS n FROM research_snapshots')).n === before.snapshots, 'preview creates no snapshot');
  check((await get('SELECT COUNT(*) AS n FROM commerce_write_receipts')).n === before.receipts, 'preview creates no receipt');
  const xrayWorkbook = new ExcelJS.Workbook();
  xrayWorkbook.addWorksheet('Xray').addRows([
    ['ASIN', 'Product Details', 'Brand', 'Price $', 'ASIN Sales'],
    ['B0ABC12345', 'Para Mi Hija Necklace', 'Brand One', 29.99, 400],
    ['B0ABC12346', 'Collar Para Mi Hija', 'Brand Two', 31.99, 300]
  ]);
  const xrayPreview = await upload(`/api/projects/${projectId}/research-imports/preview`, {
    kind: 'AMAZON_XRAY', researchFile: { name: 'sample_xray.xlsx', bytes: Buffer.from(await xrayWorkbook.xlsx.writeBuffer()) }
  });
  check(xrayPreview.status === 200, JSON.stringify(xrayPreview.body));
  check(xrayPreview.body.asinSelection.batches.length === 1
    && xrayPreview.body.asinSelection.batches[0].asins.length === 2
    && xrayPreview.body.asinSelection.batches[0].asins.length <= 10,
  'Xray preview returns copy-ready Cerebro batches of at most ten ASINs before any Cerebro import');
  check((await get('SELECT COUNT(*) AS n FROM research_imports')).n === before.imports,
    'Xray ASIN batch preview remains zero write');
  const unsupported = await upload(`/api/projects/${projectId}/research-imports/preview`, {
    kind: 'AMAZON_CEREBRO', researchFile: { name: 'research.txt', bytes: Buffer.from('not a workbook') }
  });
  check(unsupported.status === 415 && unsupported.body.error === 'UNSUPPORTED_RESEARCH_FILE',
    'unsupported research extension rejected explicitly');
  check((await get('SELECT COUNT(*) AS n FROM research_imports')).n === before.imports,
    'rejected research file creates no import');

  const committed = await upload(`/api/projects/${projectId}/research-imports`, {
    kind: 'AMAZON_CEREBRO', idempotencyKey: key(1), researchFile: fixture
  });
  check(committed.status === 201, JSON.stringify(committed.body));
  check(committed.body.rawHash === preview.body.rawHash, 'commit binds previewed raw bytes');
  check(committed.body.researchImportId > 0, 'immutable import id returned');
  const importRow = await get('SELECT raw_hash,length(raw_bytes) AS bytes,parser_hash FROM research_imports WHERE id=?',
    [committed.body.researchImportId]);
  check(importRow.raw_hash === preview.body.rawHash && importRow.bytes === fixture.bytes.length, 'exact bytes persisted');
  check(importRow.parser_hash === preview.body.parserHash, 'server parser binding persisted');

  const replay = await upload(`/api/projects/${projectId}/research-imports`, {
    kind: 'AMAZON_CEREBRO', idempotencyKey: key(1), researchFile: fixture
  });
  check(replay.status === 201 || replay.status === 200, JSON.stringify(replay.body));
  check(replay.body.researchImportId === committed.body.researchImportId, 'idempotent replay returns same import');

  const snapshot = await json(`/api/projects/${projectId}/research-snapshots`, 'POST', {
    expectedHeadResearchSnapshotId: null, importIds: [committed.body.researchImportId],
    idempotencyKey: key(2), changeReason: 'STAFF_CONFIRMED_RESEARCH'
  });
  check(snapshot.status === 201, JSON.stringify(snapshot.body));
  check(snapshot.body.researchSnapshotId > 0 && snapshot.body.revisionNumber === 1, 'snapshot head created');
  const snapshotRow = await get('SELECT observations_json,accounting_json,snapshot_hash FROM research_snapshots WHERE id=?',
    [snapshot.body.researchSnapshotId]);
  check(JSON.parse(snapshotRow.observations_json).cerebro.observations.length > 0, 'full observations persisted');
  check(JSON.parse(snapshotRow.accounting_json).unconsumedSheetCount === 0, 'snapshot accounting persisted');
  check(snapshotRow.snapshot_hash === snapshot.body.researchSnapshotHash, 'snapshot hash returned exactly');

  const truth = await json(`/api/projects/${projectId}/product-truth/revisions`, 'POST', {
    expectedHeadRevisionId: null, idempotencyKey: key(3), changeReason: 'STAFF_DRAFT', facts: {
      productType: { disposition: 'ASSERTED', value: 'Custom Necklace', basis: 'SUPPLIER_SPEC' },
      materials: { disposition: 'ASSERTED', value: 'stainless steel', basis: 'SUPPLIER_SPEC' },
      personalization: { disposition: 'ASSERTED', value: 'Custom name personalization', basis: 'PRODUCTION_WORKFLOW' },
      recipient: { disposition: 'ASSERTED', value: 'daughter', basis: 'OTHER' }
    }
  });
  check(truth.status === 201, JSON.stringify(truth.body));
  const truthId = truth.body.productTruthRevisionId;
  const beforeIntelligence = (await get('SELECT COUNT(*) AS n FROM intelligence_snapshots')).n;
  const intelligencePreview = await json(`/api/projects/${projectId}/intelligence-snapshots/preview`, 'POST', {
    researchSnapshotId: snapshot.body.researchSnapshotId, productTruthRevisionId: truthId, listingLanguage: 'EN'
  });
  check(intelligencePreview.status === 200, JSON.stringify(intelligencePreview.body));
  check(intelligencePreview.body.zeroWrite === true, 'intelligence preview is zero write');
  check(intelligencePreview.body.output.listingDraft.amazonTitle.length > 0, 'intelligence preview contains draft');
  check((await get('SELECT COUNT(*) AS n FROM intelligence_snapshots')).n === beforeIntelligence, 'preview creates no intelligence snapshot');
  const intelligence = await json(`/api/projects/${projectId}/intelligence-snapshots`, 'POST', {
    expectedHeadIntelligenceSnapshotId: null, researchSnapshotId: snapshot.body.researchSnapshotId,
    productTruthRevisionId: truthId, listingLanguage: 'EN', idempotencyKey: key(4),
    changeReason: 'SAVE_COMMERCE_INTELLIGENCE'
  });
  check(intelligence.status === 201, JSON.stringify(intelligence.body));
  check(intelligence.body.intelligenceSnapshotId > 0, 'intelligence snapshot id returned');
  check(intelligence.body.output.listingDraft.amazonSearchTerms.length <= 249, 'persisted draft follows keyword cap');
  const intelligenceRow = await get('SELECT research_snapshot_id,product_truth_revision_id,output_hash FROM intelligence_snapshots WHERE id=?',
    [intelligence.body.intelligenceSnapshotId]);
  check(intelligenceRow.research_snapshot_id === snapshot.body.researchSnapshotId
    && intelligenceRow.product_truth_revision_id === truthId, 'exact research and truth revisions bound');
  check(/^[0-9a-f]{64}$/.test(intelligenceRow.output_hash), 'intelligence output hash persisted');

  const listingsBefore = (await get('SELECT COUNT(*) AS n FROM listings')).n;
  const commercePreview = await json(`/api/projects/${projectId}/listings/commerce-preview`, 'POST', {
    intelligenceSnapshotId: intelligence.body.intelligenceSnapshotId
  });
  check(commercePreview.status === 200, JSON.stringify(commercePreview.body));
  check(commercePreview.body.zeroWrite === true && commercePreview.body.degraded === false,
    'commerce listing preview is zero-write and non-degraded');
  check(commercePreview.body.dependencies.researchSnapshotId === snapshot.body.researchSnapshotId
    && commercePreview.body.dependencies.intelligenceSnapshotId === intelligence.body.intelligenceSnapshotId,
  'preview carries exact commerce dependencies');
  check((await get('SELECT COUNT(*) AS n FROM listings')).n === listingsBefore, 'commerce preview creates no listing');
  const listing = await json(`/api/projects/${projectId}/listings`, 'POST', {
    idempotencyKey: key(5), changeReason: 'SAVE_INTELLIGENCE_DRAFT', productTruthRevisionId: truthId,
    intelligenceSnapshotId: intelligence.body.intelligenceSnapshotId, content: commercePreview.body.content
  });
  check(listing.status === 201, JSON.stringify(listing.body));
  const listingRevision = await get('SELECT dependency_manifest_json FROM listing_revisions WHERE id=?', [listing.body.revisionId]);
  const dependencies = JSON.parse(listingRevision.dependency_manifest_json);
  const { bindingState: _bindingState, missingBindings: _missingBindings, ...resolverDependencies } = dependencies;
  check(dependencies.bindingState === 'BOUND' && dependencies.missingBindings.length === 0,
    'listing dependency manifest is fully bound');
  check(dependencies.researchSnapshotHash === snapshot.body.researchSnapshotHash
    && dependencies.intelligenceSnapshotHash === intelligence.body.intelligenceSnapshotHash,
  'listing binds exact research and intelligence hashes');
  check(Boolean(dependencies.policyContractId) && /^[0-9a-f]{64}$/.test(dependencies.policyContractArtifactHash)
    && /^[0-9a-f]{64}$/.test(dependencies.policyContextHash)
    && /^[0-9a-f]{64}$/.test(dependencies.policyLifecycleSnapshotDigest)
    && /^[0-9a-f]{64}$/.test(dependencies.validatorHash),
  'listing binds exact policy contract, context, lifecycle and validator artifacts');
  check(listing.body.status === 'NEEDS_QA', 'saved commerce draft stops at staff QA');
  const stateResponse = await json(`/api/projects/${projectId}/commerce-state`);
  check(stateResponse.status === 200, JSON.stringify(stateResponse.body));
  check(stateResponse.body.heads.researchSnapshotId === snapshot.body.researchSnapshotId
    && stateResponse.body.heads.intelligenceSnapshotId === intelligence.body.intelligenceSnapshotId,
  'commerce state returns exact heads');
  check(stateResponse.body.imports.some(item => item.id === committed.body.researchImportId
    && item.raw_hash === committed.body.rawHash), 'commerce state returns immutable import metadata');
  check(stateResponse.body.researchSnapshots.length === 1 && stateResponse.body.intelligenceSnapshots.length === 1,
    'commerce state returns snapshot history');

  const sellerApproval = await jsonAsSeller(`/api/listings/${listing.body.listingId}/canonical-review`, 'POST', {
    decision: 'APPROVED', reason: 'forged Seller approval', idempotencyKey: key(13)
  });
  check(sellerApproval.status === 403, 'Seller cannot perform canonical Manager review');

  const approvalBeforeTruthConfirmation = await json(`/api/listings/${listing.body.listingId}/canonical-review`, 'POST', {
    decision: 'APPROVED', reason: 'Manager review', expectedListingRevisionId: listing.body.revisionId,
    expectedContentHash: listing.body.contentHash, expectedDependencyHash: listing.body.dependencyHash,
    idempotencyKey: key(7)
  });
  check(approvalBeforeTruthConfirmation.status === 409
    && approvalBeforeTruthConfirmation.body.error === 'MANAGER_CONFIRMED_PRODUCT_TRUTH_REQUIRED',
  'listing approval requires Manager-confirmed Product Truth');
  const truthConfirmation = await json(`/api/projects/${projectId}/product-truth/revisions/${truthId}/confirm`, 'POST', {
    idempotencyKey: key(8), reason: 'MANAGER_VERIFIED_SUPPLIER_FACTS'
  });
  check(truthConfirmation.status === 201 && truthConfirmation.body.confirmationState === 'MANAGER_CONFIRMED',
    JSON.stringify(truthConfirmation.body));
  const stalePackageReview = await json(`/api/listings/${listing.body.listingId}/canonical-review`, 'POST', {
    decision: 'CHANGES_REQUESTED', reason: 'stale package probe', expectedListingRevisionId: listing.body.revisionId + 1,
    expectedContentHash: listing.body.contentHash, expectedDependencyHash: listing.body.dependencyHash,
    idempotencyKey: key(18)
  });
  check(stalePackageReview.status === 409 && stalePackageReview.body.error === 'REVIEW_PACKAGE_STALE',
    'Manager cannot act on a package other than the exact head revision read');
  const changesRequested = await json(`/api/listings/${listing.body.listingId}/canonical-review`, 'POST', {
    decision: 'CHANGES_REQUESTED', reason: 'Improve first bullet readability',
    expectedListingRevisionId: listing.body.revisionId, expectedContentHash: listing.body.contentHash,
    expectedDependencyHash: listing.body.dependencyHash, idempotencyKey: key(9)
  });
  check(changesRequested.status === 201 && changesRequested.body.status === 'NEEDS_QA',
    'Manager can request changes without approving');
  const reviewPackage = await json(`/api/listings/${listing.body.listingId}/review-package`);
  check(reviewPackage.status === 200 && reviewPackage.body.contentHash === listing.body.contentHash
    && reviewPackage.body.dependencyHash === listing.body.dependencyHash,
  'review package exposes the exact immutable content and dependency hashes');
  check(reviewPackage.body.approvalReadiness.ready === false
    && ['INCOMPLETE_POLICY_LIFECYCLE_SNAPSHOT','POLICY_APPROVAL_BLOCKED','POLICY_CONTRACT_NOT_FOUND']
      .includes(reviewPackage.body.approvalReadiness.error),
  'review package surfaces the authoritative policy blocker instead of failing open');
  const approval = await json(`/api/listings/${listing.body.listingId}/canonical-review`, 'POST', {
    decision: 'APPROVED', reason: 'Copy, Product Truth, claims and keyword allocation checked',
    expectedListingRevisionId: listing.body.revisionId, expectedContentHash: listing.body.contentHash,
    expectedDependencyHash: listing.body.dependencyHash, idempotencyKey: key(10)
  });
  check(approval.status === 409 && ['INCOMPLETE_POLICY_LIFECYCLE_SNAPSHOT','POLICY_APPROVAL_BLOCKED','POLICY_CONTRACT_NOT_FOUND']
    .includes(approval.body.error), `draft-only/incomplete policy cannot approve: ${JSON.stringify(approval.body)}`);
  const approvalRow = await get("SELECT * FROM canonical_listing_reviews WHERE listing_id=? AND decision='APPROVED'", [listing.body.listingId]);
  check(approvalRow == null, 'blocked approval writes no approval record');
  const listingAfterApproval = await get('SELECT status,approved_version,approved_hash FROM listings WHERE id=?', [listing.body.listingId]);
  check(listingAfterApproval.status === 'NEEDS_QA' && listingAfterApproval.approved_hash == null,
    'blocked approval cannot promote canonical listing state');
  const projectListings = await json(`/api/projects/${projectId}/listings`);
  check(projectListings.status === 200 && projectListings.body.listings[0].latestReviewDecision === 'CHANGES_REQUESTED',
    'project listing queue exposes the last valid review decision');
  const prematureRequest = await jsonAsSeller(`/api/listings/${listing.body.listingId}/submission-requests`, 'POST', {
    notes: 'request before approval', idempotencyKey: key(11)
  });
  check(prematureRequest.status === 409 && prematureRequest.body.error === 'MANAGER_APPROVAL_REQUIRED',
    'Seller cannot request submission before an approval-eligible exact package exists');
  const sellerSelfAttestation = await jsonAsSeller(`/api/listings/${listing.body.listingId}/submission-handoffs`, 'POST', {
    submissionRequestId: 1, confirmedExternalSubmission: true, externalReference: 'AMZ-US-MANUAL-123',
    notes: 'Seller tries to self-attest', idempotencyKey: key(12)
  });
  check(sellerSelfAttestation.status === 403, 'Seller cannot self-attest SUBMITTED; Owner authorization is mandatory');
  const ownerSelfRequest = await json(`/api/listings/${listing.body.listingId}/submission-requests`, 'POST', {
    notes: 'Owner tries to bypass Seller decision', idempotencyKey: key(19)
  });
  check(ownerSelfRequest.status === 403, 'Owner cannot self-create the Seller submission request');
  check((await get('SELECT COUNT(*) AS n FROM canonical_submission_requests')).n === 0
    && (await get('SELECT COUNT(*) AS n FROM canonical_submission_handoffs')).n === 0,
  'blocked policy path creates neither submission request nor handoff');
  // Seed an approval-shaped legacy row directly and prove that current policy is still re-evaluated;
  // a historical fail-open state cannot be used to advance the listing.
  const truthConfirmationRow = await get('SELECT id FROM product_truth_confirmations WHERE product_truth_revision_id=?', [truthId]);
  const seededReview = await runSql(`INSERT INTO canonical_listing_reviews
    (tenant_id,workspace_id,marketplace,project_id,listing_id,listing_revision_id,decision,reason,content_hash,
     dependency_manifest_hash,product_truth_revision_id,product_truth_confirmation_id,reviewed_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [owner.tenantId, owner.workspaceId, 'AMAZON', projectId,
    listing.body.listingId, listing.body.revisionId, 'APPROVED', 'TEST_ONLY_ISOLATED_HANDOFF_FIXTURE',
    listing.body.contentHash, listing.body.dependencyHash, truthId, truthConfirmationRow.id, owner.userId]);
  await runSql(`UPDATE listings SET status='MANAGER_APPROVED',approved_version=1,approved_hash=?,approved_context_hash=?,
    approved_by=?,approved_at=CURRENT_TIMESTAMP WHERE id=?`, [listing.body.contentHash, listing.body.dependencyHash,
    owner.userId, listing.body.listingId]);
  const submissionRequest = await jsonAsSeller(`/api/listings/${listing.body.listingId}/submission-requests`, 'POST', {
    notes: 'Seller requests Owner submit exact package', idempotencyKey: key(16)
  });
  check(submissionRequest.status === 409
    && ['INCOMPLETE_POLICY_LIFECYCLE_SNAPSHOT','POLICY_APPROVAL_BLOCKED','POLICY_CONTRACT_NOT_FOUND']
      .includes(submissionRequest.body.error),
  'submission request revalidates policy and blocks a legacy approval-shaped fail-open row');
  const ownerSubmission = await json(`/api/listings/${listing.body.listingId}/submission-handoffs`, 'POST', {
    submissionRequestId: 1, confirmedExternalSubmission: true,
    externalReference: 'AMZ-US-MANUAL-123', notes: 'Owner verified marketplace submission evidence',
    idempotencyKey: key(17)
  });
  check(ownerSubmission.status === 409
    && ['INCOMPLETE_POLICY_LIFECYCLE_SNAPSHOT','POLICY_APPROVAL_BLOCKED','POLICY_CONTRACT_NOT_FOUND']
      .includes(ownerSubmission.body.error),
  'Owner handoff independently revalidates policy before reading any historical request');
  check((await get('SELECT COUNT(*) AS n FROM canonical_submission_requests')).n === 0
    && (await get('SELECT COUNT(*) AS n FROM canonical_submission_handoffs')).n === 0,
  'legacy fail-open state cannot create a submission request or handoff');
  await runSql("UPDATE listings SET status='SUBMITTED' WHERE id=?", [listing.body.listingId]);
  const terminalReview = await json(`/api/listings/${listing.body.listingId}/canonical-review`, 'POST', {
    decision: 'CHANGES_REQUESTED', reason: 'attempt to reopen terminal listing',
    expectedListingRevisionId: listing.body.revisionId, expectedContentHash: listing.body.contentHash,
    expectedDependencyHash: listing.body.dependencyHash, idempotencyKey: key(20)
  });
  check(terminalReview.status === 409 && terminalReview.body.error === 'SUBMITTED_LISTING_TERMINAL',
    'review API cannot reopen a terminal SUBMITTED listing');
  const terminalRevision = await json(`/api/listings/${listing.body.listingId}/revisions`, 'POST', {
    parentRevisionId: listing.body.revisionId, expectedHeadRevisionId: listing.body.revisionId,
    idempotencyKey: key(21), changeReason: 'ATTEMPT_TO_REOPEN_SUBMITTED', productTruthRevisionId: truthId,
    intelligenceSnapshotId: intelligence.body.intelligenceSnapshotId, content: commercePreview.body.content
  });
  check(terminalRevision.status === 409 && terminalRevision.body.error === 'SUBMITTED_LISTING_TERMINAL',
    'revision API cannot reopen a terminal SUBMITTED listing in phase 1');
  await runSql("UPDATE listings SET status='MANAGER_APPROVED' WHERE id=?", [listing.body.listingId]);
  const revisionsBeforeRace = (await get('SELECT COUNT(*) AS n FROM listing_revisions WHERE listing_id=?', [listing.body.listingId])).n;
  await assert.rejects(() => appendListingRevision(db, {
    tenantId: owner.tenantId, workspaceId: owner.workspaceId, marketplace: 'AMAZON', actorId: owner.userId
  }, listing.body.listingId, {
    projectId, parentRevisionId: listing.body.revisionId, expectedHeadRevisionId: listing.body.revisionId,
    idempotencyKey: key(22), changeReason: 'SIMULATED_STATUS_RACE', content: commercePreview.body.content,
    dependencies: resolverDependencies
  }, {
    prepareContent: async ({ content }) => {
      await runSql("UPDATE listings SET status='SUBMITTED' WHERE id=?", [listing.body.listingId]);
      return { content, validationAccounting: null };
    }, resolveDependencies: async () => resolverDependencies, assertDependenciesCurrent: async () => {}
  }), error => error?.code === 'SUBMITTED_LISTING_TERMINAL');
  check((await get('SELECT status FROM listings WHERE id=?', [listing.body.listingId])).status === 'SUBMITTED'
    && (await get('SELECT COUNT(*) AS n FROM listing_revisions WHERE listing_id=?', [listing.body.listingId])).n === revisionsBeforeRace,
  'append transaction closes the MANAGER_APPROVED-to-SUBMITTED TOCTOU window with zero revision write');
  await runSql("UPDATE listings SET status='MANAGER_APPROVED' WHERE id=?", [listing.body.listingId]);
  const revisedAfterSubmission = await json(`/api/listings/${listing.body.listingId}/revisions`, 'POST', {
    parentRevisionId: listing.body.revisionId, expectedHeadRevisionId: listing.body.revisionId,
    idempotencyKey: key(14), changeReason: 'POST_SUBMISSION_COPY_REVISION', productTruthRevisionId: truthId,
    intelligenceSnapshotId: intelligence.body.intelligenceSnapshotId, content: commercePreview.body.content
  });
  check(revisedAfterSubmission.status === 200 && revisedAfterSubmission.body.status === 'NEEDS_QA',
    'new listing revision remains in NEEDS_QA');
  const staleApprovalSubmission = await jsonAsSeller(`/api/listings/${listing.body.listingId}/submission-handoffs`, 'POST', {
    confirmedExternalSubmission: true, notes: 'attempt against unapproved new revision', idempotencyKey: key(15)
  });
  check(staleApprovalSubmission.status === 403,
    'Seller cannot invoke Owner-only submission handoff even after a new revision');
  const revisedQueue = await json(`/api/projects/${projectId}/listings`);
  check(revisedQueue.body.listings[0].status === 'NEEDS_QA' && revisedQueue.body.listings[0].submittedAt == null,
    'queue reports submission only for the exact current revision');

  const truthV2 = await json(`/api/projects/${projectId}/product-truth/revisions`, 'POST', {
    expectedHeadRevisionId: truthId, idempotencyKey: key(6), changeReason: 'TRUTH_CHANGED_AFTER_DRAFT', facts: {
      productType: { disposition: 'ASSERTED', value: 'Custom Necklace', basis: 'SUPPLIER_SPEC' },
      materials: { disposition: 'ASSERTED', value: 'stainless steel', basis: 'SUPPLIER_SPEC' },
      personalization: { disposition: 'ASSERTED', value: 'Custom name personalization', basis: 'PRODUCTION_WORKFLOW' },
      recipient: { disposition: 'ASSERTED', value: 'daughter', basis: 'OTHER' },
      packaging: { disposition: 'ASSERTED', value: 'gift box', basis: 'SUPPLIER_SPEC' }
    }
  });
  check(truthV2.status === 200, JSON.stringify(truthV2.body));
  const stalePreview = await json(`/api/projects/${projectId}/listings/commerce-preview`, 'POST', {
    intelligenceSnapshotId: intelligence.body.intelligenceSnapshotId
  });
  check(stalePreview.status === 409 && ['STALE_INTELLIGENCE_SNAPSHOT','STALE_PRODUCT_TRUTH_REVISION'].includes(stalePreview.body.error),
    `truth head change invalidates old intelligence preview: ${JSON.stringify(stalePreview)}`);
  check((await get('SELECT COUNT(*) AS n FROM listings')).n === listingsBefore + 1, 'stale preview creates no listing');

  const unexpected = await upload(`/api/projects/${projectId}/research-imports/preview`, {
    kind: 'AMAZON_CEREBRO', facts: '{}', researchFile: fixture
  });
  check(unexpected.status === 400 && unexpected.body.error === 'UNEXPECTED_REQUEST_FIELD', 'client authority field rejected');
  console.log(`G4 canonical research HTTP: ${passed}/${passed} PASS`);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await new Promise(resolve => db.close(() => resolve()));
});
