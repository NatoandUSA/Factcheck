'use strict';

const crypto = require('node:crypto');

const HASH = /^[a-f0-9]{64}$/;
const IDEMPOTENCY_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEPENDENCY_KEYS = Object.freeze([
  'productTruthRevisionId', 'productTruthHash',
  'researchSnapshotId', 'researchSnapshotHash',
  'intelligenceSnapshotId', 'intelligenceSnapshotHash',
  'policyBindingHash', 'claimIpBindingHash', 'validatorHash',
  'listingRevisionId', 'listingRevisionHash',
  'locale', 'productFamilyVersion',
  'bindingState', 'missingBindings'
]);
const RESOLVER_KEYS = Object.freeze(DEPENDENCY_KEYS.filter(key => !['bindingState', 'missingBindings'].includes(key)));
const LISTING_REQUIRED_BINDINGS = Object.freeze([
  'productTruthRevisionId', 'productTruthHash', 'researchSnapshotId', 'researchSnapshotHash',
  'intelligenceSnapshotId', 'intelligenceSnapshotHash', 'policyBindingHash', 'claimIpBindingHash',
  'validatorHash', 'locale', 'productFamilyVersion'
]);
const CREATIVE_REQUIRED_BINDINGS = Object.freeze([
  'productTruthRevisionId', 'productTruthHash', 'policyBindingHash', 'claimIpBindingHash',
  'validatorHash', 'listingRevisionId', 'listingRevisionHash', 'locale', 'productFamilyVersion'
]);
const writeQueues = new WeakMap();

class RevisionStoreError extends Error {
  constructor(code, status = 400, details = {}) {
    super(code);
    this.name = 'RevisionStoreError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const run = (db, sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function onRun(error) {
    if (error) reject(error);
    else resolve({ lastID: this.lastID, changes: this.changes });
  });
});
const get = (db, sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null));
});

function strictClone(value, path = '$', depth = 0) {
  if (depth > 32) throw new RevisionStoreError('REVISION_CONTENT_TOO_DEEP', 413, { path });
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.normalize('NFC');
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RevisionStoreError('REVISION_CONTENT_NONFINITE', 400, { path });
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => strictClone(item, `${path}[${index}]`, depth + 1));
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new RevisionStoreError('REVISION_CONTENT_JSON_REQUIRED', 400, { path });
  }
  const result = {};
  for (const key of Object.keys(value).sort()) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new RevisionStoreError('REVISION_CONTENT_KEY_FORBIDDEN', 400, { path: `${path}.${key}` });
    if (value[key] === undefined || typeof value[key] === 'function' || typeof value[key] === 'symbol') {
      throw new RevisionStoreError('REVISION_CONTENT_JSON_REQUIRED', 400, { path: `${path}.${key}` });
    }
    const normalizedKey = key.normalize('NFC');
    if (Object.hasOwn(result, normalizedKey)) throw new RevisionStoreError('REVISION_CONTENT_KEY_COLLISION', 400, { path: `${path}.${key}` });
    result[normalizedKey] = strictClone(value[key], `${path}.${key}`, depth + 1);
  }
  return result;
}

function canonicalJson(value) {
  const json = JSON.stringify(strictClone(value));
  if (Buffer.byteLength(json, 'utf8') > 2 * 1024 * 1024) throw new RevisionStoreError('REVISION_CONTENT_TOO_LARGE', 413);
  return json;
}

function hashBytes(value) {
  return crypto.createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex');
}

function assertStoredRevisionIntegrity(row) {
  if (!row || hashBytes(row.content_json) !== row.content_hash
    || hashBytes(row.dependency_manifest_json) !== row.dependency_manifest_hash) {
    throw new RevisionStoreError('REVISION_INTEGRITY_FAILURE', 500);
  }
  const hasValidation = row.validation_accounting_json != null;
  const hasValidationHash = row.validation_accounting_hash != null;
  if (hasValidation !== hasValidationHash
    || (hasValidation && hashBytes(row.validation_accounting_json) !== row.validation_accounting_hash)) {
    throw new RevisionStoreError('REVISION_INTEGRITY_FAILURE', 500);
  }
}

function requiredScope(scope) {
  if (!scope || typeof scope !== 'object') throw new RevisionStoreError('SERVER_SCOPE_REQUIRED', 500);
  const normalized = {
    tenantId: String(scope.tenantId || '').trim(),
    workspaceId: Number(scope.workspaceId),
    marketplace: scope.marketplace,
    actorId: Number(scope.actorId)
  };
  if (!normalized.tenantId || !Number.isInteger(normalized.workspaceId) || normalized.workspaceId < 1
    || !['AMAZON', 'ETSY'].includes(normalized.marketplace)
    || !Number.isInteger(normalized.actorId) || normalized.actorId < 1) {
    throw new RevisionStoreError('INVALID_SERVER_SCOPE', 500);
  }
  return Object.freeze(normalized);
}

function requiredProjectId(value) {
  const projectId = Number(value);
  if (!Number.isInteger(projectId) || projectId < 1) throw new RevisionStoreError('PROJECT_CONTEXT_REQUIRED', 400);
  return projectId;
}

function requiredIdempotencyKey(value) {
  const key = String(value || '').trim();
  if (!IDEMPOTENCY_KEY.test(key)) throw new RevisionStoreError('INVALID_IDEMPOTENCY_KEY', 400);
  return key.toLowerCase();
}

function requiredReason(value) {
  const reason = String(value || '').trim();
  if (!reason || reason.length > 128) throw new RevisionStoreError('CHANGE_REASON_REQUIRED', 400);
  return reason;
}

function dependencyManifest(input = {}, overrides = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RevisionStoreError('DEPENDENCY_MANIFEST_REQUIRED', 400);
  for (const key of Object.keys(input)) if (!RESOLVER_KEYS.includes(key)) throw new RevisionStoreError('UNKNOWN_DEPENDENCY_BINDING', 400, { key });
  const manifest = Object.fromEntries(DEPENDENCY_KEYS.map(key => [key, null]));
  Object.assign(manifest, strictClone(input), overrides);
  for (const key of Object.keys(manifest).filter(key => /Hash$/.test(key))) {
    if (manifest[key] !== null && !HASH.test(String(manifest[key]))) throw new RevisionStoreError('INVALID_DEPENDENCY_HASH', 400, { key });
  }
  for (const key of Object.keys(manifest).filter(key => /RevisionId$|SnapshotId$/.test(key))) {
    if (manifest[key] !== null && (!Number.isInteger(Number(manifest[key])) || Number(manifest[key]) < 1)) {
      throw new RevisionStoreError('INVALID_DEPENDENCY_ID', 400, { key });
    }
    if (manifest[key] !== null) manifest[key] = Number(manifest[key]);
  }
  for (const [idKey, hashKey] of [
    ['productTruthRevisionId', 'productTruthHash'],
    ['researchSnapshotId', 'researchSnapshotHash'],
    ['intelligenceSnapshotId', 'intelligenceSnapshotHash'],
    ['listingRevisionId', 'listingRevisionHash']
  ]) {
    if ((manifest[idKey] === null) !== (manifest[hashKey] === null)) {
      throw new RevisionStoreError('INCOMPLETE_DEPENDENCY_BINDING', 400, { idKey, hashKey });
    }
  }
  for (const key of ['locale', 'productFamilyVersion']) {
    if (manifest[key] !== null && (typeof manifest[key] !== 'string' || !manifest[key].trim() || manifest[key].length > 128)) {
      throw new RevisionStoreError('INVALID_DEPENDENCY_VALUE', 400, { key });
    }
  }
  return Object.freeze(manifest);
}

function finalizeDependencies(input, artifact) {
  const base = Object.fromEntries(Object.entries(input).filter(([key]) => RESOLVER_KEYS.includes(key)));
  const initial = dependencyManifest(base);
  const required = artifact === 'CREATIVE' ? CREATIVE_REQUIRED_BINDINGS : LISTING_REQUIRED_BINDINGS;
  const missingBindings = required.filter(key => initial[key] === null);
  return dependencyManifest(base, {
    bindingState: missingBindings.length ? 'INCOMPLETE' : 'BOUND',
    missingBindings
  });
}

function requestEnvelope(operation, input) {
  return canonicalJson({ operation, ...input });
}

function withWriteLock(db, operation) {
  const previous = writeQueues.get(db) || Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  writeQueues.set(db, current);
  return current.finally(() => {
    if (writeQueues.get(db) === current) writeQueues.delete(db);
  });
}

async function resolveDependencies(hooks, context, proposed) {
  if (typeof hooks.resolveDependencies !== 'function') {
    throw new RevisionStoreError('DEPENDENCY_RESOLVER_REQUIRED', 500);
  }
  const resolved = await hooks.resolveDependencies(Object.freeze({
    ...context,
    proposed: strictClone(proposed || {})
  }));
  return dependencyManifest(resolved);
}

async function rollback(db, error) {
  try { await run(db, 'ROLLBACK'); } catch (_) {}
  throw error;
}

async function receiptReplay(db, scope, operation, idempotencyKey, requestHash) {
  const receipt = await get(db, `SELECT request_hash,response_json,created_by FROM listing_write_receipts
    WHERE tenant_id=? AND workspace_id=? AND marketplace=? AND operation=? AND idempotency_key=?`,
  [scope.tenantId, scope.workspaceId, scope.marketplace, operation, idempotencyKey]);
  if (!receipt) return null;
  if (receipt.created_by !== scope.actorId) throw new RevisionStoreError('IDEMPOTENCY_KEY_ACTOR_MISMATCH', 409);
  if (receipt.request_hash !== requestHash) throw new RevisionStoreError('IDEMPOTENCY_KEY_REUSE', 409);
  return JSON.parse(receipt.response_json);
}

async function saveReceipt(db, scope, projectId, listingId, operation, idempotencyKey, requestHash, response) {
  await run(db, `INSERT INTO listing_write_receipts
    (tenant_id,workspace_id,marketplace,project_id,listing_id,operation,idempotency_key,request_hash,response_json,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, [scope.tenantId, scope.workspaceId, scope.marketplace, projectId,
    listingId, operation, idempotencyKey, requestHash, canonicalJson(response), scope.actorId]);
}

async function assertProject(db, scope, projectId) {
  const project = await get(db, `SELECT id FROM research_projects
    WHERE id=? AND tenant_id=? AND workspace_id=? AND marketplace=?`,
  [projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
  if (!project) throw new RevisionStoreError('PROJECT_NOT_FOUND', 404);
}

async function createListingWithRevisionUnlocked(db, rawScope, input, hooks = {}) {
  const scope = requiredScope(rawScope);
  const projectId = requiredProjectId(input?.projectId);
  const idempotencyKey = requiredIdempotencyKey(input?.idempotencyKey);
  const changeReason = requiredReason(input?.changeReason);
  const requestedContent = strictClone(input?.content);
  const requestedContentJson = canonicalJson(requestedContent);
  const requestHash = hashBytes(requestEnvelope('CREATE_LISTING_V1', {
    scope: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, marketplace: scope.marketplace },
    projectId, idempotencyKey, changeReason, content: JSON.parse(requestedContentJson),
    proposedDependencies: input?.dependencies || {}
  }));
  const preflightReplay = await receiptReplay(db, scope, 'CREATE_LISTING_V1', idempotencyKey, requestHash);
  if (preflightReplay) return preflightReplay;
  const prepared = await prepareContent(hooks, { operation: 'CREATE_LISTING_V1', scope, projectId }, requestedContent);
  const contentJson = canonicalJson(prepared.content);
  const contentHash = hashBytes(contentJson);
  const validationJson = prepared.validationAccounting == null ? null : canonicalJson(prepared.validationAccounting);
  const validationHash = validationJson == null ? null : hashBytes(validationJson);
  const dependencies = finalizeDependencies(await resolveDependencies(hooks, {
    operation: 'CREATE_LISTING_V1', scope, projectId
  }, input?.dependencies), 'LISTING');
  const dependencyJson = canonicalJson(dependencies);
  const dependencyHash = hashBytes(dependencyJson);
  await run(db, 'BEGIN IMMEDIATE');
  try {
    const replay = await receiptReplay(db, scope, 'CREATE_LISTING_V1', idempotencyKey, requestHash);
    if (replay) { await run(db, 'COMMIT'); return replay; }
    await assertProject(db, scope, projectId);
    await assertDependenciesCurrent(hooks, { operation: 'CREATE_LISTING_V1', scope, projectId }, dependencies);
    const content = JSON.parse(contentJson);
    const root = await run(db, `INSERT INTO listings
      (tenant_id,workspace_id,marketplace,project_id,amazonTitle,etsyTitle,categoryName,status,authorId,listing_version,payload)
      VALUES (?,?,?,?,?,?,?,?,?,1,?)`, [scope.tenantId, scope.workspaceId, scope.marketplace, projectId,
      String(content.amazonTitle || ''), String(content.etsyTitle || ''), String(content.categoryName || ''),
      'NEEDS_QA', scope.actorId, contentJson]);
    if (hooks.afterRoot) await hooks.afterRoot(root.lastID);
    const revision = await run(db, `INSERT INTO listing_revisions
      (listing_id,tenant_id,workspace_id,marketplace,project_id,revision_number,parent_revision_id,
       content_json,content_hash,dependency_manifest_json,dependency_manifest_hash,validation_accounting_json,
       validation_accounting_hash,change_reason,created_by)
      VALUES (?,?,?,?,?,1,NULL,?,?,?,?,?,?,?,?)`, [root.lastID, scope.tenantId, scope.workspaceId, scope.marketplace,
      projectId, contentJson, contentHash, dependencyJson, dependencyHash, validationJson, validationHash,
      changeReason, scope.actorId]);
    if (hooks.afterRevision) await hooks.afterRevision(revision.lastID);
    const head = await run(db, 'UPDATE listings SET head_revision_id=? WHERE id=? AND head_revision_id IS NULL', [revision.lastID, root.lastID]);
    if (head.changes !== 1) throw new RevisionStoreError('REVISION_CONFLICT', 409);
    const response = Object.freeze({ listingId: root.lastID, revisionId: revision.lastID, revisionNumber: 1, contentHash, dependencyHash });
    await saveReceipt(db, scope, projectId, root.lastID, 'CREATE_LISTING_V1', idempotencyKey, requestHash, response);
    if (hooks.beforeCommit) await hooks.beforeCommit(response);
    await run(db, 'COMMIT');
    return response;
  } catch (error) {
    return rollback(db, error);
  }
}

async function appendListingRevisionUnlocked(db, rawScope, listingIdInput, input, hooks = {}) {
  const scope = requiredScope(rawScope);
  const listingId = Number(listingIdInput);
  const projectId = requiredProjectId(input?.projectId);
  const parentRevisionId = Number(input?.parentRevisionId);
  const expectedHeadRevisionId = Number(input?.expectedHeadRevisionId);
  if (!Number.isInteger(listingId) || listingId < 1 || !Number.isInteger(parentRevisionId) || parentRevisionId < 1
    || expectedHeadRevisionId !== parentRevisionId) throw new RevisionStoreError('INVALID_REVISION_PARENT', 400);
  const idempotencyKey = requiredIdempotencyKey(input?.idempotencyKey);
  const changeReason = requiredReason(input?.changeReason);
  const requestedContent = strictClone(input?.content);
  const requestedContentJson = canonicalJson(requestedContent);
  const requestHash = hashBytes(requestEnvelope('APPEND_LISTING_REVISION', {
    scope: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, marketplace: scope.marketplace },
    listingId, projectId, parentRevisionId, expectedHeadRevisionId, idempotencyKey,
    changeReason, content: JSON.parse(requestedContentJson), proposedDependencies: input?.dependencies || {}
  }));
  const preflightReplay = await receiptReplay(db, scope, 'APPEND_LISTING_REVISION', idempotencyKey, requestHash);
  if (preflightReplay) return preflightReplay;
  const prepared = await prepareContent(hooks, { operation: 'APPEND_LISTING_REVISION', scope, listingId, projectId }, requestedContent);
  const contentJson = canonicalJson(prepared.content);
  const validationJson = prepared.validationAccounting == null ? null : canonicalJson(prepared.validationAccounting);
  const validationHash = validationJson == null ? null : hashBytes(validationJson);
  const dependencies = finalizeDependencies(await resolveDependencies(hooks, {
    operation: 'APPEND_LISTING_REVISION', scope, projectId, listingId
  }, input?.dependencies), 'LISTING');
  const dependencyJson = canonicalJson(dependencies);
  await run(db, 'BEGIN IMMEDIATE');
  try {
    const replay = await receiptReplay(db, scope, 'APPEND_LISTING_REVISION', idempotencyKey, requestHash);
    if (replay) { await run(db, 'COMMIT'); return replay; }
    const root = await get(db, `SELECT * FROM listings WHERE id=? AND tenant_id=? AND workspace_id=? AND marketplace=? AND project_id=?`,
      [listingId, scope.tenantId, scope.workspaceId, scope.marketplace, projectId]);
    if (!root) throw new RevisionStoreError('LISTING_NOT_FOUND', 404);
    await assertDependenciesCurrent(hooks, { operation: 'APPEND_LISTING_REVISION', scope, listingId, projectId }, dependencies);
    if (root.head_revision_id !== expectedHeadRevisionId) throw new RevisionStoreError('REVISION_CONFLICT', 409);
    const parent = await get(db, `SELECT id,revision_number,content_json,content_hash,
      dependency_manifest_json,dependency_manifest_hash,validation_accounting_json,validation_accounting_hash FROM listing_revisions
      WHERE id=? AND listing_id=? AND tenant_id=? AND workspace_id=? AND marketplace=? AND project_id=?`,
      [parentRevisionId, listingId, scope.tenantId, scope.workspaceId, scope.marketplace, projectId]);
    if (!parent) throw new RevisionStoreError('REVISION_NOT_FOUND', 404);
    assertStoredRevisionIntegrity(parent);
    const revisionNumber = parent.revision_number + 1;
    const contentHash = hashBytes(contentJson);
    const dependencyHash = hashBytes(dependencyJson);
    const inserted = await run(db, `INSERT INTO listing_revisions
      (listing_id,tenant_id,workspace_id,marketplace,project_id,revision_number,parent_revision_id,
       content_json,content_hash,dependency_manifest_json,dependency_manifest_hash,validation_accounting_json,
       validation_accounting_hash,change_reason,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [listingId, scope.tenantId, scope.workspaceId, scope.marketplace,
      projectId, revisionNumber, parentRevisionId, contentJson, contentHash, dependencyJson, dependencyHash,
      validationJson, validationHash, changeReason, scope.actorId]);
    if (hooks.afterRevision) await hooks.afterRevision(inserted.lastID);
    const content = JSON.parse(contentJson);
    const update = await run(db, `UPDATE listings SET head_revision_id=?,listing_version=?,payload=?,
      amazonTitle=?,etsyTitle=?,categoryName=?,status='NEEDS_QA',approved_version=NULL,approved_hash=NULL,
      approved_by=NULL,approved_at=NULL
      WHERE id=? AND tenant_id=? AND workspace_id=? AND marketplace=? AND project_id=? AND head_revision_id=?`,
    [inserted.lastID, revisionNumber, contentJson, String(content.amazonTitle || ''), String(content.etsyTitle || ''),
      String(content.categoryName || ''), listingId, scope.tenantId, scope.workspaceId, scope.marketplace, projectId, expectedHeadRevisionId]);
    if (update.changes !== 1) throw new RevisionStoreError('REVISION_CONFLICT', 409);
    const response = Object.freeze({ listingId, revisionId: inserted.lastID, revisionNumber, parentRevisionId, contentHash, dependencyHash });
    await saveReceipt(db, scope, projectId, listingId, 'APPEND_LISTING_REVISION', idempotencyKey, requestHash, response);
    if (hooks.beforeCommit) await hooks.beforeCommit(response);
    await run(db, 'COMMIT');
    return response;
  } catch (error) {
    return rollback(db, error);
  }
}

async function appendCreativeRevisionUnlocked(db, rawScope, listingIdInput, input, hooks = {}) {
  const scope = requiredScope(rawScope);
  const listingId = Number(listingIdInput);
  const projectId = requiredProjectId(input?.projectId);
  const listingRevisionId = Number(input?.listingRevisionId);
  const parentRevisionId = input?.parentRevisionId == null ? null : Number(input.parentRevisionId);
  const expectedHeadRevisionId = input?.expectedHeadRevisionId == null ? null : Number(input.expectedHeadRevisionId);
  if (!Number.isInteger(listingId) || listingId < 1 || !Number.isInteger(listingRevisionId) || listingRevisionId < 1
    || parentRevisionId !== expectedHeadRevisionId) throw new RevisionStoreError('INVALID_REVISION_PARENT', 400);
  if (parentRevisionId !== null && (!Number.isInteger(parentRevisionId) || parentRevisionId < 1)) throw new RevisionStoreError('INVALID_REVISION_PARENT', 400);
  const idempotencyKey = requiredIdempotencyKey(input?.idempotencyKey);
  const changeReason = requiredReason(input?.changeReason);
  const contentJson = canonicalJson(input?.content);
  const requestHash = hashBytes(requestEnvelope('APPEND_CREATIVE_REVISION', {
    scope: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, marketplace: scope.marketplace },
    listingId, projectId, listingRevisionId, parentRevisionId, expectedHeadRevisionId,
    idempotencyKey, changeReason, content: JSON.parse(contentJson),
    proposedDependencies: input?.dependencies || {}
  }));
  const preflightReplay = await receiptReplay(db, scope, 'APPEND_CREATIVE_REVISION', idempotencyKey, requestHash);
  if (preflightReplay) return preflightReplay;
  const resolvedDependencies = await resolveDependencies(hooks, {
    operation: 'APPEND_CREATIVE_REVISION', scope, projectId, listingId, listingRevisionId
  }, input?.dependencies);
  await run(db, 'BEGIN IMMEDIATE');
  try {
    const root = await get(db, `SELECT * FROM listings WHERE id=? AND tenant_id=? AND workspace_id=? AND marketplace=? AND project_id=?`,
      [listingId, scope.tenantId, scope.workspaceId, scope.marketplace, projectId]);
    if (!root) throw new RevisionStoreError('LISTING_NOT_FOUND', 404);
    const listingRevision = await get(db, `SELECT id,content_json,content_hash,
      dependency_manifest_json,dependency_manifest_hash FROM listing_revisions
      WHERE id=? AND listing_id=? AND tenant_id=? AND workspace_id=? AND marketplace=? AND project_id=?`,
      [listingRevisionId, listingId, scope.tenantId, scope.workspaceId, scope.marketplace, projectId]);
    if (!listingRevision) throw new RevisionStoreError('REVISION_NOT_FOUND', 404);
    assertStoredRevisionIntegrity(listingRevision);
    const dependencies = finalizeDependencies({ ...resolvedDependencies,
      listingRevisionId: listingRevision.id,
      listingRevisionHash: listingRevision.content_hash
    }, 'CREATIVE');
    const dependencyJson = canonicalJson(dependencies);
    const replay = await receiptReplay(db, scope, 'APPEND_CREATIVE_REVISION', idempotencyKey, requestHash);
    if (replay) { await run(db, 'COMMIT'); return replay; }
    if ((root.head_creative_revision_id ?? null) !== expectedHeadRevisionId) throw new RevisionStoreError('REVISION_CONFLICT', 409);
    let revisionNumber = 1;
    if (parentRevisionId !== null) {
      const parent = await get(db, `SELECT revision_number,content_json,content_hash,
        dependency_manifest_json,dependency_manifest_hash FROM creative_revisions
        WHERE id=? AND listing_id=? AND tenant_id=? AND workspace_id=? AND marketplace=? AND project_id=?`,
        [parentRevisionId, listingId, scope.tenantId, scope.workspaceId, scope.marketplace, projectId]);
      if (!parent) throw new RevisionStoreError('REVISION_NOT_FOUND', 404);
      assertStoredRevisionIntegrity(parent);
      revisionNumber = parent.revision_number + 1;
    }
    const contentHash = hashBytes(contentJson);
    const dependencyHash = hashBytes(dependencyJson);
    const inserted = await run(db, `INSERT INTO creative_revisions
      (listing_id,listing_revision_id,tenant_id,workspace_id,marketplace,project_id,revision_number,parent_revision_id,
       content_json,content_hash,dependency_manifest_json,dependency_manifest_hash,change_reason,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [listingId, listingRevisionId, scope.tenantId, scope.workspaceId,
      scope.marketplace, projectId, revisionNumber, parentRevisionId, contentJson, contentHash, dependencyJson,
      dependencyHash, changeReason, scope.actorId]);
    if (hooks.afterRevision) await hooks.afterRevision(inserted.lastID);
    const update = await run(db, `UPDATE listings SET head_creative_revision_id=?
      WHERE id=? AND tenant_id=? AND workspace_id=? AND marketplace=? AND project_id=?
      AND head_creative_revision_id IS ?`, [inserted.lastID, listingId, scope.tenantId, scope.workspaceId,
      scope.marketplace, projectId, expectedHeadRevisionId]);
    if (update.changes !== 1) throw new RevisionStoreError('REVISION_CONFLICT', 409);
    const response = Object.freeze({ listingId, creativeRevisionId: inserted.lastID, revisionNumber,
      parentRevisionId, listingRevisionId, contentHash, dependencyHash });
    await saveReceipt(db, scope, projectId, listingId, 'APPEND_CREATIVE_REVISION', idempotencyKey, requestHash, response);
    if (hooks.beforeCommit) await hooks.beforeCommit(response);
    await run(db, 'COMMIT');
    return response;
  } catch (error) {
    return rollback(db, error);
  }
}

async function getListingRevision(db, rawScope, listingIdInput, revisionIdInput, projectIdInput) {
  const scope = requiredScope(rawScope);
  const listingId = Number(listingIdInput);
  const revisionId = Number(revisionIdInput);
  const projectId = requiredProjectId(projectIdInput);
  const row = await get(db, `SELECT * FROM listing_revisions
    WHERE id=? AND listing_id=? AND tenant_id=? AND workspace_id=? AND marketplace=? AND project_id=?`,
  [revisionId, listingId, scope.tenantId, scope.workspaceId, scope.marketplace, projectId]);
  if (!row) throw new RevisionStoreError('REVISION_NOT_FOUND', 404);
  assertStoredRevisionIntegrity(row);
  let content;
  try {
    content = JSON.parse(row.content_json);
  } catch (error) {
    if (!row.migrated_from_legacy) throw new RevisionStoreError('REVISION_INTEGRITY_FAILURE', 500);
    content = null;
  }
  let dependencies;
  try { dependencies = JSON.parse(row.dependency_manifest_json); }
  catch (_) { throw new RevisionStoreError('REVISION_INTEGRITY_FAILURE', 500); }
  let validationAccounting = null;
  try { validationAccounting = row.validation_accounting_json == null ? null : JSON.parse(row.validation_accounting_json); }
  catch (_) { throw new RevisionStoreError('REVISION_INTEGRITY_FAILURE', 500); }
  return Object.freeze({ ...row, content, contentRaw: row.content_json,
    contentParseState: content === null && row.content_json !== 'null' ? 'MALFORMED_LEGACY_JSON' : 'PARSED',
    dependencies, validationAccounting });
}

async function getCreativeRevision(db, rawScope, listingIdInput, revisionIdInput, projectIdInput) {
  const scope = requiredScope(rawScope);
  const listingId = Number(listingIdInput);
  const revisionId = Number(revisionIdInput);
  const projectId = requiredProjectId(projectIdInput);
  const row = await get(db, `SELECT * FROM creative_revisions
    WHERE id=? AND listing_id=? AND tenant_id=? AND workspace_id=? AND marketplace=? AND project_id=?`,
  [revisionId, listingId, scope.tenantId, scope.workspaceId, scope.marketplace, projectId]);
  if (!row) throw new RevisionStoreError('REVISION_NOT_FOUND', 404);
  assertStoredRevisionIntegrity(row);
  try {
    return Object.freeze({ ...row, content: JSON.parse(row.content_json), contentRaw: row.content_json,
      contentParseState: 'PARSED', dependencies: JSON.parse(row.dependency_manifest_json) });
  } catch (_) {
    throw new RevisionStoreError('REVISION_INTEGRITY_FAILURE', 500);
  }
}

async function prepareContent(hooks, context, content) {
  if (typeof hooks.prepareContent !== 'function') {
    return Object.freeze({ content: strictClone(content), validationAccounting: null });
  }
  const prepared = await hooks.prepareContent(Object.freeze({ ...context, content: strictClone(content) }));
  if (prepared && typeof prepared === 'object' && !Array.isArray(prepared)
    && Object.prototype.hasOwnProperty.call(prepared, 'content')) {
    return Object.freeze({ content: strictClone(prepared.content),
      validationAccounting: prepared.validationAccounting == null ? null : strictClone(prepared.validationAccounting) });
  }
  return Object.freeze({ content: strictClone(prepared), validationAccounting: null });
}

async function assertDependenciesCurrent(hooks, context, dependencies) {
  if (typeof hooks.assertDependenciesCurrent !== 'function') return;
  await hooks.assertDependenciesCurrent(Object.freeze({ ...context, dependencies: strictClone(dependencies) }));
}

async function listListingRevisions(db, rawScope, listingIdInput, projectIdInput) {
  const scope = requiredScope(rawScope);
  const listingId = Number(listingIdInput);
  const projectId = requiredProjectId(projectIdInput);
  const rows = await new Promise((resolve, reject) => db.all(`SELECT * FROM listing_revisions
    WHERE listing_id=? AND tenant_id=? AND workspace_id=? AND marketplace=? AND project_id=?
    ORDER BY revision_number DESC`, [listingId, scope.tenantId, scope.workspaceId, scope.marketplace, projectId],
  (error, values) => error ? reject(error) : resolve(values)));
  return rows.map(row => {
    assertStoredRevisionIntegrity(row);
    let content;
    try { content = JSON.parse(row.content_json); }
    catch (_) {
      if (!row.migrated_from_legacy) throw new RevisionStoreError('REVISION_INTEGRITY_FAILURE', 500);
      content = null;
    }
    return Object.freeze({ ...row, content, contentRaw: row.content_json,
      contentParseState: content === null && row.content_json !== 'null' ? 'MALFORMED_LEGACY_JSON' : 'PARSED',
      dependencies: JSON.parse(row.dependency_manifest_json),
      validationAccounting: row.validation_accounting_json == null ? null : JSON.parse(row.validation_accounting_json) });
  });
}

function createListingWithRevision(db, scope, input, hooks = {}) {
  return withWriteLock(db, () => createListingWithRevisionUnlocked(db, scope, input, hooks));
}

function appendListingRevision(db, scope, listingId, input, hooks = {}) {
  return withWriteLock(db, () => appendListingRevisionUnlocked(db, scope, listingId, input, hooks));
}

function appendCreativeRevision(db, scope, listingId, input, hooks = {}) {
  return withWriteLock(db, () => appendCreativeRevisionUnlocked(db, scope, listingId, input, hooks));
}

module.exports = Object.freeze({
  RevisionStoreError,
  appendCreativeRevision,
  appendListingRevision,
  canonicalJson,
  createListingWithRevision,
  dependencyManifest,
  getCreativeRevision,
  getListingRevision,
  listListingRevisions,
  hashBytes
});
