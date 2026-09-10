'use strict';

const { canonicalJson, hashBytes } = require('./revisionStore');
const { normalizeSnapshot } = require('./productTruthAttestation');

const IDEMPOTENCY_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const queues = new WeakMap();

class ProductTruthStoreError extends Error {
  constructor(code, status = 400, details = {}) {
    super(code);
    this.name = 'ProductTruthStoreError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const run = (db, sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function done(error) {
  if (error) reject(error); else resolve({ lastID: this.lastID, changes: this.changes });
}));
const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params,
  (error, row) => error ? reject(error) : resolve(row || null)));
const all = (db, sql, params = []) => new Promise((resolve, reject) => db.all(sql, params,
  (error, rows) => error ? reject(error) : resolve(rows)));

function withWriteLock(db, operation) {
  const previous = queues.get(db) || Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  queues.set(db, current);
  return current.finally(() => { if (queues.get(db) === current) queues.delete(db); });
}

function scopeOf(input) {
  const scope = {
    tenantId: String(input?.tenantId || '').trim(), workspaceId: Number(input?.workspaceId),
    marketplace: input?.marketplace, actorId: Number(input?.actorId), role: input?.role
  };
  if (!scope.tenantId || !Number.isInteger(scope.workspaceId) || scope.workspaceId < 1
    || !['AMAZON', 'ETSY'].includes(scope.marketplace) || !Number.isInteger(scope.actorId) || scope.actorId < 1) {
    throw new ProductTruthStoreError('INVALID_SERVER_SCOPE', 500);
  }
  return Object.freeze(scope);
}

function projectIdOf(value) {
  const projectId = Number(value);
  if (!Number.isInteger(projectId) || projectId < 1) throw new ProductTruthStoreError('PROJECT_CONTEXT_REQUIRED', 400);
  return projectId;
}

function keyOf(value) {
  const key = String(value || '').trim().toLowerCase();
  if (!IDEMPOTENCY_KEY.test(key)) throw new ProductTruthStoreError('INVALID_IDEMPOTENCY_KEY', 400);
  return key;
}

function reasonOf(value) {
  const reason = String(value || '').trim();
  if (!reason || reason.length > 128) throw new ProductTruthStoreError('CHANGE_REASON_REQUIRED', 400);
  return reason;
}

async function rollback(db, error) {
  try { await run(db, 'ROLLBACK'); } catch (_) {}
  throw error;
}

async function replay(db, scope, operation, key, requestHash) {
  const receipt = await get(db, `SELECT request_hash,response_json,created_by FROM product_truth_write_receipts
    WHERE tenant_id=? AND workspace_id=? AND marketplace=? AND operation=? AND idempotency_key=?`,
  [scope.tenantId, scope.workspaceId, scope.marketplace, operation, key]);
  if (!receipt) return null;
  if (receipt.created_by !== scope.actorId) throw new ProductTruthStoreError('IDEMPOTENCY_KEY_ACTOR_MISMATCH', 409);
  if (receipt.request_hash !== requestHash) throw new ProductTruthStoreError('IDEMPOTENCY_KEY_REUSE', 409);
  return JSON.parse(receipt.response_json);
}

async function saveReceipt(db, scope, projectId, operation, key, requestHash, response) {
  await run(db, `INSERT INTO product_truth_write_receipts
    (tenant_id,workspace_id,marketplace,project_id,operation,idempotency_key,request_hash,response_json,created_by)
    VALUES (?,?,?,?,?,?,?,?,?)`, [scope.tenantId, scope.workspaceId, scope.marketplace, projectId,
    operation, key, requestHash, canonicalJson(response), scope.actorId]);
}

async function appendUnlocked(db, rawScope, projectIdInput, input = {}, hooks = {}) {
  const scope = scopeOf(rawScope);
  const projectId = projectIdOf(projectIdInput);
  const idempotencyKey = keyOf(input.idempotencyKey);
  const changeReason = reasonOf(input.changeReason);
  let snapshot;
  try {
    const normalized = normalizeSnapshot(input.facts);
    const notes = input.notes == null ? null : String(input.notes).trim();
    if (notes && notes.length > 4000) throw Object.assign(new Error('PRODUCT_TRUTH_NOTES_TOO_LARGE'), { code: 'PRODUCT_TRUTH_NOTES_TOO_LARGE' });
    snapshot = Object.freeze({ ...normalized, notes: notes || null });
  }
  catch (error) { throw new ProductTruthStoreError(error.code || 'INVALID_PRODUCT_TRUTH', 400, { fact: error.fact, path: error.path }); }
  const snapshotJson = canonicalJson(snapshot);
  const contentHash = hashBytes(snapshotJson);
  const expectedHeadRevisionId = input.expectedHeadRevisionId == null ? null : Number(input.expectedHeadRevisionId);
  if (expectedHeadRevisionId !== null && (!Number.isInteger(expectedHeadRevisionId) || expectedHeadRevisionId < 1)) {
    throw new ProductTruthStoreError('INVALID_REVISION_PARENT', 400);
  }
  const requestHash = hashBytes(canonicalJson({ operation: 'APPEND_PRODUCT_TRUTH',
    scope: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, marketplace: scope.marketplace },
    projectId, idempotencyKey, changeReason, expectedHeadRevisionId, snapshot }));
  const preflight = await replay(db, scope, 'APPEND_PRODUCT_TRUTH', idempotencyKey, requestHash);
  if (preflight) return preflight;
  await run(db, 'BEGIN IMMEDIATE');
  try {
    const inside = await replay(db, scope, 'APPEND_PRODUCT_TRUTH', idempotencyKey, requestHash);
    if (inside) { await run(db, 'COMMIT'); return inside; }
    const project = await get(db, `SELECT id,head_product_truth_revision_id FROM research_projects
      WHERE id=? AND tenant_id=? AND workspace_id=? AND marketplace=?`,
    [projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
    if (!project) throw new ProductTruthStoreError('PROJECT_NOT_FOUND', 404);
    if ((project.head_product_truth_revision_id ?? null) !== expectedHeadRevisionId) {
      throw new ProductTruthStoreError('REVISION_CONFLICT', 409);
    }
    let revisionNumber = 1;
    if (expectedHeadRevisionId !== null) {
      const parent = await get(db, `SELECT revision_number,snapshot_json,content_hash FROM product_truth_revisions
        WHERE id=? AND project_id=? AND tenant_id=? AND workspace_id=? AND marketplace=?`,
      [expectedHeadRevisionId, projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
      if (!parent) throw new ProductTruthStoreError('REVISION_NOT_FOUND', 404);
      if (hashBytes(parent.snapshot_json) !== parent.content_hash) throw new ProductTruthStoreError('REVISION_INTEGRITY_FAILURE', 500);
      revisionNumber = parent.revision_number + 1;
    }
    const inserted = await run(db, `INSERT INTO product_truth_revisions
      (tenant_id,workspace_id,marketplace,project_id,revision_number,parent_revision_id,snapshot_json,
       content_hash,change_reason,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [scope.tenantId, scope.workspaceId, scope.marketplace, projectId, revisionNumber, expectedHeadRevisionId,
      snapshotJson, contentHash, changeReason, scope.actorId]);
    if (hooks.afterRevision) await hooks.afterRevision(inserted.lastID);
    const updated = await run(db, `UPDATE research_projects SET head_product_truth_revision_id=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND tenant_id=? AND workspace_id=? AND marketplace=? AND head_product_truth_revision_id IS ?`,
    [inserted.lastID, projectId, scope.tenantId, scope.workspaceId, scope.marketplace, expectedHeadRevisionId]);
    if (updated.changes !== 1) throw new ProductTruthStoreError('REVISION_CONFLICT', 409);
    const response = Object.freeze({ projectId, productTruthRevisionId: inserted.lastID, revisionNumber,
      parentRevisionId: expectedHeadRevisionId, contentHash, confirmationState: 'STAFF_DRAFT' });
    await saveReceipt(db, scope, projectId, 'APPEND_PRODUCT_TRUTH', idempotencyKey, requestHash, response);
    if (hooks.beforeCommit) await hooks.beforeCommit(response);
    await run(db, 'COMMIT');
    return response;
  } catch (error) { return rollback(db, error); }
}

function appendProductTruthRevision(db, scope, projectId, input, hooks = {}) {
  return withWriteLock(db, () => appendUnlocked(db, scope, projectId, input, hooks));
}

async function confirmUnlocked(db, rawScope, projectIdInput, revisionIdInput, input = {}, hooks = {}) {
  const scope = scopeOf(rawScope);
  if (!['OWNER', 'MANAGER'].includes(scope.role)) throw new ProductTruthStoreError('FORBIDDEN_ROLE', 403);
  const projectId = projectIdOf(projectIdInput);
  const revisionId = Number(revisionIdInput);
  if (!Number.isInteger(revisionId) || revisionId < 1) throw new ProductTruthStoreError('REVISION_NOT_FOUND', 404);
  const idempotencyKey = keyOf(input.idempotencyKey);
  const reason = reasonOf(input.reason);
  const requestHash = hashBytes(canonicalJson({ operation: 'CONFIRM_PRODUCT_TRUTH',
    scope: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, marketplace: scope.marketplace },
    projectId, revisionId, idempotencyKey, reason }));
  const preflight = await replay(db, scope, 'CONFIRM_PRODUCT_TRUTH', idempotencyKey, requestHash);
  if (preflight) return preflight;
  await run(db, 'BEGIN IMMEDIATE');
  try {
    const inside = await replay(db, scope, 'CONFIRM_PRODUCT_TRUTH', idempotencyKey, requestHash);
    if (inside) { await run(db, 'COMMIT'); return inside; }
    const revision = await get(db, `SELECT r.* FROM research_projects p JOIN product_truth_revisions r
      ON r.id=p.head_product_truth_revision_id AND r.project_id=p.id
      WHERE p.id=? AND p.tenant_id=? AND p.workspace_id=? AND p.marketplace=? AND r.id=?
        AND r.tenant_id=p.tenant_id AND r.workspace_id=p.workspace_id AND r.marketplace=p.marketplace`,
    [projectId, scope.tenantId, scope.workspaceId, scope.marketplace, revisionId]);
    if (!revision) throw new ProductTruthStoreError('REVISION_NOT_FOUND', 404);
    if (hashBytes(revision.snapshot_json) !== revision.content_hash) throw new ProductTruthStoreError('REVISION_INTEGRITY_FAILURE', 500);
    const inserted = await run(db, `INSERT INTO product_truth_confirmations
      (tenant_id,workspace_id,marketplace,project_id,product_truth_revision_id,product_truth_hash,confirmed_by,reason)
      VALUES (?,?,?,?,?,?,?,?)`, [scope.tenantId, scope.workspaceId, scope.marketplace, projectId,
      revisionId, revision.content_hash, scope.actorId, reason]);
    if (hooks.afterConfirmation) await hooks.afterConfirmation(inserted.lastID);
    const response = Object.freeze({ projectId, productTruthRevisionId: revisionId,
      productTruthHash: revision.content_hash, confirmationId: inserted.lastID,
      confirmationState: 'MANAGER_CONFIRMED' });
    await saveReceipt(db, scope, projectId, 'CONFIRM_PRODUCT_TRUTH', idempotencyKey, requestHash, response);
    if (hooks.beforeCommit) await hooks.beforeCommit(response);
    await run(db, 'COMMIT');
    return response;
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE constraint failed: product_truth_confirmations.product_truth_revision_id')) {
      return rollback(db, new ProductTruthStoreError('PRODUCT_TRUTH_ALREADY_CONFIRMED', 409));
    }
    return rollback(db, error);
  }
}

function confirmProductTruthRevision(db, scope, projectId, revisionId, input, hooks = {}) {
  return withWriteLock(db, () => confirmUnlocked(db, scope, projectId, revisionId, input, hooks));
}

async function listProductTruthRevisions(db, rawScope, projectIdInput) {
  const scope = scopeOf(rawScope);
  const projectId = projectIdOf(projectIdInput);
  const rows = await all(db, `SELECT r.*,c.id AS confirmation_id,c.product_truth_hash AS confirmation_hash,
      c.confirmed_by,c.confirmed_at
    FROM product_truth_revisions r LEFT JOIN product_truth_confirmations c ON c.product_truth_revision_id=r.id
    WHERE r.project_id=? AND r.tenant_id=? AND r.workspace_id=? AND r.marketplace=? ORDER BY r.revision_number DESC`,
  [projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
  return rows.map(row => {
    if (hashBytes(row.snapshot_json) !== row.content_hash) throw new ProductTruthStoreError('REVISION_INTEGRITY_FAILURE', 500);
    if (row.confirmation_id && row.confirmation_hash !== row.content_hash) {
      throw new ProductTruthStoreError('PRODUCT_TRUTH_CONFIRMATION_INTEGRITY_FAILURE', 500);
    }
    return Object.freeze({ ...row, snapshot: JSON.parse(row.snapshot_json),
      confirmationState: row.confirmation_id ? 'MANAGER_CONFIRMED' : 'STAFF_DRAFT' });
  });
}

async function currentProductTruthRevision(db, rawScope, projectIdInput) {
  const scope = scopeOf(rawScope);
  const projectId = projectIdOf(projectIdInput);
  const row = await get(db, `SELECT r.*,c.id AS confirmation_id,c.product_truth_hash AS confirmation_hash,
      c.confirmed_by,c.confirmed_at
    FROM research_projects p JOIN product_truth_revisions r ON r.id=p.head_product_truth_revision_id
    LEFT JOIN product_truth_confirmations c ON c.product_truth_revision_id=r.id
    WHERE p.id=? AND p.tenant_id=? AND p.workspace_id=? AND p.marketplace=?
      AND r.project_id=p.id AND r.tenant_id=p.tenant_id AND r.workspace_id=p.workspace_id AND r.marketplace=p.marketplace`,
  [projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
  if (!row) throw new ProductTruthStoreError('PRODUCT_TRUTH_REQUIRED', 409);
  if (hashBytes(row.snapshot_json) !== row.content_hash) throw new ProductTruthStoreError('REVISION_INTEGRITY_FAILURE', 500);
  if (row.confirmation_id && row.confirmation_hash !== row.content_hash) {
    throw new ProductTruthStoreError('PRODUCT_TRUTH_CONFIRMATION_INTEGRITY_FAILURE', 500);
  }
  return Object.freeze({ ...row, snapshot: JSON.parse(row.snapshot_json),
    confirmationState: row.confirmation_id ? 'MANAGER_CONFIRMED' : 'STAFF_DRAFT' });
}

module.exports = Object.freeze({
  ProductTruthStoreError,
  appendProductTruthRevision,
  confirmProductTruthRevision,
  currentProductTruthRevision,
  listProductTruthRevisions
});
