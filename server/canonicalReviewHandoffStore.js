'use strict';

const { canonicalJson, hashBytes } = require('./revisionStore');

const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const queues = new WeakMap();

class CanonicalHandoffError extends Error {
  constructor(code, status = 400, details = {}) { super(code); this.code = code; this.status = status; this.details = details; }
}

const run = (db, sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function done(error) {
  if (error) reject(error); else resolve({ lastID: this.lastID, changes: this.changes });
}));
const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params,
  (error, row) => error ? reject(error) : resolve(row || null)));

function lock(db, operation) {
  const previous = queues.get(db) || Promise.resolve();
  const current = previous.catch(() => {}).then(operation); queues.set(db, current);
  return current.finally(() => { if (queues.get(db) === current) queues.delete(db); });
}

function scopeOf(input) {
  const scope = { tenantId: String(input?.tenantId || ''), workspaceId: Number(input?.workspaceId),
    marketplace: input?.marketplace, actorId: Number(input?.actorId), role: input?.role };
  if (!scope.tenantId || !Number.isInteger(scope.workspaceId) || scope.workspaceId < 1
    || !['AMAZON','ETSY'].includes(scope.marketplace) || !Number.isInteger(scope.actorId) || scope.actorId < 1) {
    throw new CanonicalHandoffError('INVALID_SERVER_SCOPE', 500);
  }
  return Object.freeze(scope);
}

function positive(value, code) {
  const number = Number(value); if (!Number.isInteger(number) || number < 1) throw new CanonicalHandoffError(code, 400);
  return number;
}

function keyOf(value) {
  const valueKey = String(value || '').toLowerCase();
  if (!KEY.test(valueKey)) throw new CanonicalHandoffError('INVALID_IDEMPOTENCY_KEY', 400);
  return valueKey;
}

function sha256(value, code) {
  const result = String(value || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(result)) throw new CanonicalHandoffError(code, 400);
  return result;
}

function bounded(value, code, maximum, required = true) {
  const result = value == null ? '' : String(value).trim();
  if ((required && !result) || result.length > maximum) throw new CanonicalHandoffError(code, 400);
  return result || null;
}

async function rollback(db, error) { try { await run(db, 'ROLLBACK'); } catch (_) {} throw error; }

async function replay(db, scope, operation, key, requestHash) {
  const row = await get(db, `SELECT request_hash,response_json,created_by FROM canonical_handoff_write_receipts
    WHERE tenant_id=? AND workspace_id=? AND marketplace=? AND operation=? AND idempotency_key=?`,
  [scope.tenantId, scope.workspaceId, scope.marketplace, operation, key]);
  if (!row) return null;
  if (row.created_by !== scope.actorId) throw new CanonicalHandoffError('IDEMPOTENCY_KEY_ACTOR_MISMATCH', 409);
  if (row.request_hash !== requestHash) throw new CanonicalHandoffError('IDEMPOTENCY_KEY_REUSE', 409);
  return JSON.parse(row.response_json);
}

async function receipt(db, scope, projectId, listingId, operation, key, requestHash, response) {
  await run(db, `INSERT INTO canonical_handoff_write_receipts
    (tenant_id,workspace_id,marketplace,project_id,listing_id,operation,idempotency_key,request_hash,response_json,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, [scope.tenantId, scope.workspaceId, scope.marketplace, projectId, listingId,
    operation, key, requestHash, canonicalJson(response), scope.actorId]);
}

async function currentListing(db, scope, listingId) {
  const row = await get(db, `SELECT l.id,l.project_id,l.status,l.head_revision_id,r.revision_number,r.content_json,
      r.content_hash,r.dependency_manifest_json,r.dependency_manifest_hash
    FROM listings l JOIN listing_revisions r ON r.id=l.head_revision_id AND r.listing_id=l.id
    WHERE l.id=? AND l.tenant_id=? AND l.workspace_id=? AND l.marketplace=?
      AND r.tenant_id=l.tenant_id AND r.workspace_id=l.workspace_id AND r.marketplace=l.marketplace`,
  [listingId, scope.tenantId, scope.workspaceId, scope.marketplace]);
  if (!row) throw new CanonicalHandoffError('LISTING_NOT_FOUND', 404);
  if (hashBytes(row.content_json) !== row.content_hash
    || hashBytes(row.dependency_manifest_json) !== row.dependency_manifest_hash) {
    throw new CanonicalHandoffError('REVISION_INTEGRITY_FAILURE', 500);
  }
  try { row.content = JSON.parse(row.content_json); row.dependencies = JSON.parse(row.dependency_manifest_json); }
  catch (_) { throw new CanonicalHandoffError('REVISION_INTEGRITY_FAILURE', 500); }
  return row;
}

async function reviewUnlocked(db, rawScope, listingIdInput, input = {}, hooks = {}) {
  const scope = scopeOf(rawScope);
  if (!['OWNER','MANAGER'].includes(scope.role)) throw new CanonicalHandoffError('FORBIDDEN_ROLE', 403);
  const listingId = positive(listingIdInput, 'LISTING_NOT_FOUND');
  const decision = String(input.decision || '').toUpperCase();
  if (!['APPROVED','CHANGES_REQUESTED'].includes(decision)) throw new CanonicalHandoffError('REVIEW_DECISION_REQUIRED', 400);
  const reason = bounded(input.reason, 'REVIEW_REASON_REQUIRED', 1000);
  const expectedListingRevisionId = positive(input.expectedListingRevisionId, 'EXPECTED_REVIEW_REVISION_REQUIRED');
  const expectedContentHash = sha256(input.expectedContentHash, 'EXPECTED_CONTENT_HASH_REQUIRED');
  const expectedDependencyHash = sha256(input.expectedDependencyHash, 'EXPECTED_DEPENDENCY_HASH_REQUIRED');
  const idempotencyKey = keyOf(input.idempotencyKey);
  const requestHash = hashBytes(canonicalJson({ operation: 'CANONICAL_LISTING_REVIEW', listingId, decision, reason,
    expectedListingRevisionId, expectedContentHash, expectedDependencyHash }));
  const existing = await replay(db, scope, 'CANONICAL_LISTING_REVIEW', idempotencyKey, requestHash);
  if (existing) return existing;
  await run(db, 'BEGIN IMMEDIATE');
  try {
    const inside = await replay(db, scope, 'CANONICAL_LISTING_REVIEW', idempotencyKey, requestHash);
    if (inside) { await run(db, 'COMMIT'); return inside; }
    const listing = await currentListing(db, scope, listingId);
    if (listing.status === 'SUBMITTED') throw new CanonicalHandoffError('SUBMITTED_LISTING_TERMINAL', 409);
    if (listing.head_revision_id !== expectedListingRevisionId || listing.content_hash !== expectedContentHash
      || listing.dependency_manifest_hash !== expectedDependencyHash) {
      throw new CanonicalHandoffError('REVIEW_PACKAGE_STALE', 409, { currentListingRevisionId: listing.head_revision_id });
    }
    if (typeof hooks.assertDependenciesCurrent === 'function') await hooks.assertDependenciesCurrent(listing);
    const truthId = positive(listing.dependencies.productTruthRevisionId, 'PRODUCT_TRUTH_BINDING_REQUIRED');
    const confirmation = await get(db, `SELECT id,product_truth_hash FROM product_truth_confirmations
      WHERE product_truth_revision_id=? AND project_id=? AND tenant_id=? AND workspace_id=? AND marketplace=?`,
    [truthId, listing.project_id, scope.tenantId, scope.workspaceId, scope.marketplace]);
    if (decision === 'APPROVED' && (!confirmation || confirmation.product_truth_hash !== listing.dependencies.productTruthHash)) {
      throw new CanonicalHandoffError('MANAGER_CONFIRMED_PRODUCT_TRUTH_REQUIRED', 409);
    }
    if (typeof hooks.validateRevision === 'function') await hooks.validateRevision(listing);
    const inserted = await run(db, `INSERT INTO canonical_listing_reviews
      (tenant_id,workspace_id,marketplace,project_id,listing_id,listing_revision_id,decision,reason,content_hash,
       dependency_manifest_hash,product_truth_revision_id,product_truth_confirmation_id,reviewed_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [scope.tenantId, scope.workspaceId, scope.marketplace, listing.project_id,
      listingId, listing.head_revision_id, decision, reason, listing.content_hash, listing.dependency_manifest_hash,
      truthId, confirmation?.id || null, scope.actorId]);
    const nextStatus = decision === 'APPROVED' ? 'MANAGER_APPROVED' : 'NEEDS_QA';
    const updated = await run(db, `UPDATE listings SET status=?,approved_version=?,approved_hash=?,approved_context_hash=?,
      approved_by=?,approved_at=CASE WHEN ?='MANAGER_APPROVED' THEN CURRENT_TIMESTAMP ELSE NULL END
      WHERE id=? AND tenant_id=? AND workspace_id=? AND marketplace=? AND head_revision_id=?`,
    [nextStatus, decision === 'APPROVED' ? listing.revision_number : null,
      decision === 'APPROVED' ? listing.content_hash : null,
      decision === 'APPROVED' ? hashBytes(canonicalJson({ reviewId: inserted.lastID, contentHash: listing.content_hash,
        dependencyHash: listing.dependency_manifest_hash })) : null,
      decision === 'APPROVED' ? scope.actorId : null, nextStatus, listingId, scope.tenantId, scope.workspaceId,
      scope.marketplace, listing.head_revision_id]);
    if (updated.changes !== 1) throw new CanonicalHandoffError('REVISION_CONFLICT', 409);
    const response = Object.freeze({ listingId, projectId: listing.project_id, listingRevisionId: listing.head_revision_id,
      reviewId: inserted.lastID, decision, status: nextStatus, contentHash: listing.content_hash,
      dependencyHash: listing.dependency_manifest_hash, productTruthConfirmationId: confirmation?.id || null });
    await receipt(db, scope, listing.project_id, listingId, 'CANONICAL_LISTING_REVIEW', idempotencyKey, requestHash, response);
    await run(db, 'COMMIT'); return response;
  } catch (error) { return rollback(db, error); }
}

function submissionPackageHash(listing, review) {
  return hashBytes(canonicalJson({ listingId: listing.id, listingRevisionId: listing.head_revision_id,
    contentHash: listing.content_hash, dependencyHash: listing.dependency_manifest_hash, reviewId: review.id }));
}

async function approvedReview(db, scope, listing) {
  const review = await get(db, `SELECT * FROM canonical_listing_reviews WHERE listing_id=? AND listing_revision_id=?
    AND tenant_id=? AND workspace_id=? AND marketplace=? AND decision='APPROVED' ORDER BY id DESC LIMIT 1`,
  [listing.id, listing.head_revision_id, scope.tenantId, scope.workspaceId, scope.marketplace]);
  if (!review || review.content_hash !== listing.content_hash
    || review.dependency_manifest_hash !== listing.dependency_manifest_hash) {
    throw new CanonicalHandoffError('CURRENT_MANAGER_APPROVAL_REQUIRED', 409);
  }
  return review;
}

async function requestSubmissionUnlocked(db, rawScope, listingIdInput, input = {}, hooks = {}) {
  const scope = scopeOf(rawScope); const listingId = positive(listingIdInput, 'LISTING_NOT_FOUND');
  if (scope.role !== 'SELLER') throw new CanonicalHandoffError('SELLER_SUBMISSION_REQUEST_REQUIRED', 403);
  const notes = bounded(input.notes, 'SUBMISSION_REQUEST_NOTES_REQUIRED', 2000);
  const idempotencyKey = keyOf(input.idempotencyKey);
  const requestHash = hashBytes(canonicalJson({ operation: 'CANONICAL_SUBMISSION_REQUEST', listingId, notes }));
  const existing = await replay(db, scope, 'CANONICAL_SUBMISSION_REQUEST', idempotencyKey, requestHash);
  if (existing) return existing;
  await run(db, 'BEGIN IMMEDIATE');
  try {
    const inside = await replay(db, scope, 'CANONICAL_SUBMISSION_REQUEST', idempotencyKey, requestHash);
    if (inside) { await run(db, 'COMMIT'); return inside; }
    const listing = await currentListing(db, scope, listingId);
    if (listing.status !== 'MANAGER_APPROVED') throw new CanonicalHandoffError('MANAGER_APPROVAL_REQUIRED', 409);
    if (typeof hooks.assertDependenciesCurrent === 'function') await hooks.assertDependenciesCurrent(listing);
    if (typeof hooks.assertApprovalEligible !== 'function') {
      throw new CanonicalHandoffError('SERVER_APPROVAL_POLICY_HOOK_REQUIRED', 500);
    }
    await hooks.assertApprovalEligible(listing);
    const review = await approvedReview(db, scope, listing);
    const packageHash = submissionPackageHash(listing, review);
    const inserted = await run(db, `INSERT INTO canonical_submission_requests
      (tenant_id,workspace_id,marketplace,project_id,listing_id,listing_revision_id,review_id,package_hash,notes,requested_by)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, [scope.tenantId, scope.workspaceId, scope.marketplace, listing.project_id,
      listingId, listing.head_revision_id, review.id, packageHash, notes, scope.actorId]);
    const response = Object.freeze({ listingId, projectId: listing.project_id, listingRevisionId: listing.head_revision_id,
      submissionRequestId: inserted.lastID, reviewId: review.id, packageHash, status: 'SUBMISSION_REQUESTED' });
    await receipt(db, scope, listing.project_id, listingId, 'CANONICAL_SUBMISSION_REQUEST', idempotencyKey, requestHash, response);
    await run(db, 'COMMIT'); return response;
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE constraint failed: canonical_submission_requests.listing_revision_id')) {
      return rollback(db, new CanonicalHandoffError('REVISION_ALREADY_REQUESTED_FOR_SUBMISSION', 409));
    }
    return rollback(db, error);
  }
}

async function submitUnlocked(db, rawScope, listingIdInput, input = {}, hooks = {}) {
  const scope = scopeOf(rawScope); const listingId = positive(listingIdInput, 'LISTING_NOT_FOUND');
  if (scope.role !== 'OWNER') throw new CanonicalHandoffError('OWNER_SUBMISSION_AUTHORIZATION_REQUIRED', 403);
  if (input.confirmedExternalSubmission !== true) throw new CanonicalHandoffError('EXTERNAL_SUBMISSION_CONFIRMATION_REQUIRED', 400);
  const notes = bounded(input.notes, 'SUBMISSION_NOTES_REQUIRED', 2000);
  const externalReference = bounded(input.externalReference, 'EXTERNAL_SUBMISSION_EVIDENCE_REQUIRED', 500);
  const submissionRequestId = positive(input.submissionRequestId, 'SUBMISSION_REQUEST_REQUIRED');
  const idempotencyKey = keyOf(input.idempotencyKey);
  const requestHash = hashBytes(canonicalJson({ operation: 'CANONICAL_SUBMISSION_HANDOFF', listingId,
    submissionRequestId, confirmedExternalSubmission: true, notes, externalReference }));
  const existing = await replay(db, scope, 'CANONICAL_SUBMISSION_HANDOFF', idempotencyKey, requestHash);
  if (existing) return existing;
  await run(db, 'BEGIN IMMEDIATE');
  try {
    const inside = await replay(db, scope, 'CANONICAL_SUBMISSION_HANDOFF', idempotencyKey, requestHash);
    if (inside) { await run(db, 'COMMIT'); return inside; }
    const listing = await currentListing(db, scope, listingId);
    if (listing.status !== 'MANAGER_APPROVED') throw new CanonicalHandoffError('MANAGER_APPROVAL_REQUIRED', 409);
    if (typeof hooks.assertDependenciesCurrent === 'function') await hooks.assertDependenciesCurrent(listing);
    if (typeof hooks.assertApprovalEligible !== 'function') {
      throw new CanonicalHandoffError('SERVER_APPROVAL_POLICY_HOOK_REQUIRED', 500);
    }
    await hooks.assertApprovalEligible(listing);
    const review = await approvedReview(db, scope, listing);
    const request = await get(db, `SELECT * FROM canonical_submission_requests WHERE id=? AND listing_id=?
      AND listing_revision_id=? AND review_id=? AND tenant_id=? AND workspace_id=? AND marketplace=?`,
    [submissionRequestId, listingId, listing.head_revision_id, review.id, scope.tenantId, scope.workspaceId, scope.marketplace]);
    if (!request || request.package_hash !== submissionPackageHash(listing, review)) {
      throw new CanonicalHandoffError('CURRENT_SUBMISSION_REQUEST_REQUIRED', 409);
    }
    const inserted = await run(db, `INSERT INTO canonical_submission_handoffs
      (tenant_id,workspace_id,marketplace,project_id,listing_id,listing_revision_id,review_id,submission_request_id,
       external_reference,notes,submitted_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [scope.tenantId, scope.workspaceId, scope.marketplace, listing.project_id, listingId, listing.head_revision_id,
      review.id, request.id, externalReference, notes, scope.actorId]);
    const updated = await run(db, `UPDATE listings SET status='SUBMITTED' WHERE id=? AND tenant_id=? AND workspace_id=?
      AND marketplace=? AND head_revision_id=? AND status='MANAGER_APPROVED'`,
    [listingId, scope.tenantId, scope.workspaceId, scope.marketplace, listing.head_revision_id]);
    if (updated.changes !== 1) throw new CanonicalHandoffError('SUBMISSION_STATE_CONFLICT', 409);
    const response = Object.freeze({ listingId, projectId: listing.project_id, listingRevisionId: listing.head_revision_id,
      submissionHandoffId: inserted.lastID, reviewId: review.id, status: 'SUBMITTED',
      submissionRequestId: request.id, packageHash: request.package_hash,
      externalReference, marketplacePublishingPerformed: false });
    await receipt(db, scope, listing.project_id, listingId, 'CANONICAL_SUBMISSION_HANDOFF', idempotencyKey, requestHash, response);
    await run(db, 'COMMIT'); return response;
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE constraint failed: canonical_submission_handoffs.listing_revision_id')) {
      return rollback(db, new CanonicalHandoffError('REVISION_ALREADY_SUBMITTED', 409));
    }
    return rollback(db, error);
  }
}

const reviewCanonicalListing = (db, scope, listingId, input, hooks) => lock(db,
  () => reviewUnlocked(db, scope, listingId, input, hooks));
const requestCanonicalSubmission = (db, scope, listingId, input, hooks) => lock(db,
  () => requestSubmissionUnlocked(db, scope, listingId, input, hooks));
const recordCanonicalSubmission = (db, scope, listingId, input, hooks) => lock(db,
  () => submitUnlocked(db, scope, listingId, input, hooks));

module.exports = Object.freeze({ CanonicalHandoffError, recordCanonicalSubmission, requestCanonicalSubmission,
  reviewCanonicalListing });
