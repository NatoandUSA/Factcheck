'use strict';

const { canonicalJson, hashBytes } = require('./revisionStore');
const { normalizeSnapshot } = require('./productTruthAttestation');
const { ProductTruthStoreError } = require('./productTruthStore');

const IDEMPOTENCY_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROJECT_ONLY_FACT_KEYS = Object.freeze(new Set(['sku', 'identifiers']));
const queues = new WeakMap();
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
  const scope = { tenantId: String(input?.tenantId || '').trim(), workspaceId: Number(input?.workspaceId),
    marketplace: input?.marketplace, actorId: Number(input?.actorId) };
  if (!scope.tenantId || !Number.isInteger(scope.workspaceId) || scope.workspaceId < 1
    || !['AMAZON', 'ETSY'].includes(scope.marketplace) || !Number.isInteger(scope.actorId) || scope.actorId < 1) {
    throw new ProductTruthStoreError('INVALID_SERVER_SCOPE', 500);
  }
  return Object.freeze(scope);
}

function positiveId(value, code = 'PRODUCT_TRUTH_FAMILY_NOT_FOUND') {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new ProductTruthStoreError(code, code.endsWith('NOT_FOUND') ? 404 : 400);
  return id;
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

function nameOf(value) {
  const displayName = String(value || '').trim().replace(/\s+/g, ' ');
  if (displayName.length < 2 || displayName.length > 120) throw new ProductTruthStoreError('PRODUCT_TRUTH_FAMILY_NAME_REQUIRED', 400);
  return { displayName, normalizedName: displayName.toLocaleLowerCase('en-US') };
}

function snapshotOf(input) {
  try {
    const reusableFacts = Object.fromEntries(Object.entries(input.facts || {})
      .filter(([key]) => !PROJECT_ONLY_FACT_KEYS.has(key)));
    const normalized = normalizeSnapshot(reusableFacts);
    const notes = input.notes == null ? null : String(input.notes).trim();
    if (notes && notes.length > 4000) throw Object.assign(new Error('PRODUCT_TRUTH_NOTES_TOO_LARGE'), { code: 'PRODUCT_TRUTH_NOTES_TOO_LARGE' });
    return Object.freeze({ ...normalized, notes: notes || null });
  } catch (error) {
    throw new ProductTruthStoreError(error.code || 'INVALID_PRODUCT_TRUTH', 400, { fact: error.fact, path: error.path });
  }
}

async function replay(db, scope, operation, key, requestHash) {
  const row = await get(db, `SELECT request_hash,response_json,created_by FROM product_truth_family_write_receipts
    WHERE tenant_id=? AND workspace_id=? AND marketplace=? AND operation=? AND idempotency_key=?`,
  [scope.tenantId, scope.workspaceId, scope.marketplace, operation, key]);
  if (!row) return null;
  if (row.created_by !== scope.actorId) throw new ProductTruthStoreError('IDEMPOTENCY_KEY_ACTOR_MISMATCH', 409);
  if (row.request_hash !== requestHash) throw new ProductTruthStoreError('IDEMPOTENCY_KEY_REUSE', 409);
  return JSON.parse(row.response_json);
}

async function saveReceipt(db, scope, operation, key, requestHash, response) {
  await run(db, `INSERT INTO product_truth_family_write_receipts
    (tenant_id,workspace_id,marketplace,operation,idempotency_key,request_hash,response_json,created_by)
    VALUES (?,?,?,?,?,?,?,?)`, [scope.tenantId, scope.workspaceId, scope.marketplace, operation, key,
    requestHash, canonicalJson(response), scope.actorId]);
}

async function rollback(db, error) {
  try { await run(db, 'ROLLBACK'); } catch (_) {}
  throw error;
}

async function createUnlocked(db, rawScope, input = {}) {
  const scope = scopeOf(rawScope);
  const { displayName, normalizedName } = nameOf(input.name);
  const idempotencyKey = keyOf(input.idempotencyKey);
  const changeReason = reasonOf(input.changeReason);
  const snapshot = snapshotOf(input);
  const snapshotJson = canonicalJson(snapshot);
  const contentHash = hashBytes(snapshotJson);
  const requestHash = hashBytes(canonicalJson({ operation: 'CREATE_PRODUCT_TRUTH_FAMILY', scope, displayName,
    normalizedName, idempotencyKey, changeReason, snapshot }));
  const existing = await replay(db, scope, 'CREATE_PRODUCT_TRUTH_FAMILY', idempotencyKey, requestHash);
  if (existing) return existing;
  await run(db, 'BEGIN IMMEDIATE');
  try {
    const replayed = await replay(db, scope, 'CREATE_PRODUCT_TRUTH_FAMILY', idempotencyKey, requestHash);
    if (replayed) { await run(db, 'COMMIT'); return replayed; }
    const family = await run(db, `INSERT INTO product_truth_families
      (tenant_id,workspace_id,marketplace,normalized_name,display_name,created_by) VALUES (?,?,?,?,?,?)`,
    [scope.tenantId, scope.workspaceId, scope.marketplace, normalizedName, displayName, scope.actorId]);
    const revision = await run(db, `INSERT INTO product_truth_family_revisions
      (family_id,tenant_id,workspace_id,marketplace,revision_number,parent_revision_id,snapshot_json,content_hash,change_reason,created_by)
      VALUES (?,?,?,?,1,NULL,?,?,?,?)`, [family.lastID, scope.tenantId, scope.workspaceId, scope.marketplace,
      snapshotJson, contentHash, changeReason, scope.actorId]);
    await run(db, 'UPDATE product_truth_families SET head_revision_id=? WHERE id=?', [revision.lastID, family.lastID]);
    const response = Object.freeze({ familyId: family.lastID, familyRevisionId: revision.lastID,
      revisionNumber: 1, displayName, contentHash });
    await saveReceipt(db, scope, 'CREATE_PRODUCT_TRUTH_FAMILY', idempotencyKey, requestHash, response);
    await run(db, 'COMMIT');
    return response;
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE constraint failed: product_truth_families')) {
      return rollback(db, new ProductTruthStoreError('PRODUCT_TRUTH_FAMILY_NAME_CONFLICT', 409));
    }
    return rollback(db, error);
  }
}

async function appendUnlocked(db, rawScope, familyIdInput, input = {}) {
  const scope = scopeOf(rawScope);
  const familyId = positiveId(familyIdInput);
  const expectedHeadRevisionId = positiveId(input.expectedHeadRevisionId, 'INVALID_REVISION_PARENT');
  const idempotencyKey = keyOf(input.idempotencyKey);
  const changeReason = reasonOf(input.changeReason);
  const snapshot = snapshotOf(input);
  const snapshotJson = canonicalJson(snapshot);
  const contentHash = hashBytes(snapshotJson);
  const requestHash = hashBytes(canonicalJson({ operation: 'APPEND_PRODUCT_TRUTH_FAMILY', scope, familyId,
    expectedHeadRevisionId, idempotencyKey, changeReason, snapshot }));
  const existing = await replay(db, scope, 'APPEND_PRODUCT_TRUTH_FAMILY', idempotencyKey, requestHash);
  if (existing) return existing;
  await run(db, 'BEGIN IMMEDIATE');
  try {
    const replayed = await replay(db, scope, 'APPEND_PRODUCT_TRUTH_FAMILY', idempotencyKey, requestHash);
    if (replayed) { await run(db, 'COMMIT'); return replayed; }
    const family = await get(db, `SELECT * FROM product_truth_families WHERE id=? AND tenant_id=? AND workspace_id=? AND marketplace=?`,
      [familyId, scope.tenantId, scope.workspaceId, scope.marketplace]);
    if (!family) throw new ProductTruthStoreError('PRODUCT_TRUTH_FAMILY_NOT_FOUND', 404);
    if (family.head_revision_id !== expectedHeadRevisionId) throw new ProductTruthStoreError('REVISION_CONFLICT', 409);
    const parent = await get(db, `SELECT revision_number,snapshot_json,content_hash FROM product_truth_family_revisions
      WHERE id=? AND family_id=? AND tenant_id=? AND workspace_id=? AND marketplace=?`,
      [expectedHeadRevisionId, familyId, scope.tenantId, scope.workspaceId, scope.marketplace]);
    if (!parent || hashBytes(parent.snapshot_json) !== parent.content_hash) throw new ProductTruthStoreError('REVISION_INTEGRITY_FAILURE', 500);
    const revisionNumber = parent.revision_number + 1;
    const revision = await run(db, `INSERT INTO product_truth_family_revisions
      (family_id,tenant_id,workspace_id,marketplace,revision_number,parent_revision_id,snapshot_json,content_hash,change_reason,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, [familyId, scope.tenantId, scope.workspaceId, scope.marketplace, revisionNumber,
      expectedHeadRevisionId, snapshotJson, contentHash, changeReason, scope.actorId]);
    const updated = await run(db, `UPDATE product_truth_families SET head_revision_id=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND head_revision_id=?`, [revision.lastID, familyId, expectedHeadRevisionId]);
    if (updated.changes !== 1) throw new ProductTruthStoreError('REVISION_CONFLICT', 409);
    const response = Object.freeze({ familyId, familyRevisionId: revision.lastID, revisionNumber,
      displayName: family.display_name, contentHash });
    await saveReceipt(db, scope, 'APPEND_PRODUCT_TRUTH_FAMILY', idempotencyKey, requestHash, response);
    await run(db, 'COMMIT');
    return response;
  } catch (error) { return rollback(db, error); }
}

async function listProductTruthFamilies(db, rawScope) {
  const scope = scopeOf(rawScope);
  const rows = await all(db, `SELECT f.*,r.revision_number,r.snapshot_json,r.content_hash,r.created_at AS revision_created_at
    FROM product_truth_families f JOIN product_truth_family_revisions r ON r.id=f.head_revision_id
    WHERE f.tenant_id=? AND f.workspace_id=? AND f.marketplace=? ORDER BY f.display_name COLLATE NOCASE`,
    [scope.tenantId, scope.workspaceId, scope.marketplace]);
  return rows.map(row => {
    if (hashBytes(row.snapshot_json) !== row.content_hash) throw new ProductTruthStoreError('REVISION_INTEGRITY_FAILURE', 500);
    return Object.freeze({ id: row.id, displayName: row.display_name, headRevisionId: row.head_revision_id,
      revisionNumber: row.revision_number, contentHash: row.content_hash, snapshot: JSON.parse(row.snapshot_json),
      updatedAt: row.updated_at, revisionCreatedAt: row.revision_created_at });
  });
}

async function getFamilyRevision(db, rawScope, revisionIdInput) {
  const scope = scopeOf(rawScope);
  const revisionId = positiveId(revisionIdInput, 'PRODUCT_TRUTH_FAMILY_REVISION_NOT_FOUND');
  const row = await get(db, `SELECT r.*,f.display_name FROM product_truth_family_revisions r
    JOIN product_truth_families f ON f.id=r.family_id
    WHERE r.id=? AND r.tenant_id=? AND r.workspace_id=? AND r.marketplace=?
      AND f.tenant_id=r.tenant_id AND f.workspace_id=r.workspace_id AND f.marketplace=r.marketplace`,
    [revisionId, scope.tenantId, scope.workspaceId, scope.marketplace]);
  if (!row) throw new ProductTruthStoreError('PRODUCT_TRUTH_FAMILY_REVISION_NOT_FOUND', 404);
  if (hashBytes(row.snapshot_json) !== row.content_hash) throw new ProductTruthStoreError('REVISION_INTEGRITY_FAILURE', 500);
  return Object.freeze({ ...row, snapshot: JSON.parse(row.snapshot_json) });
}

module.exports = Object.freeze({
  PROJECT_ONLY_FACT_KEYS,
  appendProductTruthFamilyRevision: (db, scope, familyId, input) => withWriteLock(db, () => appendUnlocked(db, scope, familyId, input)),
  createProductTruthFamily: (db, scope, input) => withWriteLock(db, () => createUnlocked(db, scope, input)),
  getProductTruthFamilyRevision: getFamilyRevision,
  listProductTruthFamilies
});
