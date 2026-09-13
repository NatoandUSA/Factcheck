'use strict';

const { canonicalJson, hashBytes } = require('./revisionStore');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/i;
const KINDS = new Set([
  'AMAZON_ASIN_BATCH_PLAN', 'AMAZON_MASTER_KEYWORDS',
  'ETSY_WINNER_SET', 'ETSY_PATTERN_SNAPSHOT', 'ETSY_MASTER_KEYWORDS'
]);
const JSON_LIMITS = Object.freeze({ dependencies: 256 * 1024, payload: 2 * 1024 * 1024, accounting: 256 * 1024 });
const queues = new WeakMap();

class WorkflowArtifactError extends Error {
  constructor(code, status = 400, details = {}) {
    super(code); this.code = code; this.status = status; this.details = details;
  }
}

const run = (db, sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function done(error) {
  if (error) reject(error); else resolve({ lastID: this.lastID, changes: this.changes });
}));
const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params,
  (error, row) => error ? reject(error) : resolve(row || null)));
const all = (db, sql, params = []) => new Promise((resolve, reject) => db.all(sql, params,
  (error, rows) => error ? reject(error) : resolve(rows)));

function withProcessLock(db, operation) {
  const previous = queues.get(db) || Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  queues.set(db, current);
  return current.finally(() => { if (queues.get(db) === current) queues.delete(db); });
}

function scopeOf(raw) {
  const scope = {
    tenantId: String(raw?.tenantId || '').trim(), workspaceId: Number(raw?.workspaceId),
    marketplace: String(raw?.marketplace || '').toUpperCase(), actorId: Number(raw?.actorId)
  };
  if (!scope.tenantId || !Number.isInteger(scope.workspaceId) || !['AMAZON', 'ETSY'].includes(scope.marketplace)
    || !Number.isInteger(scope.actorId)) throw new WorkflowArtifactError('INVALID_SERVER_SCOPE', 500);
  return scope;
}

function normalizeInput(rawScope, projectIdInput, input) {
  const scope = scopeOf(rawScope); const projectId = Number(projectIdInput);
  const kind = String(input?.kind || '').trim().toUpperCase();
  const idempotencyKey = String(input?.idempotencyKey || '').trim().toLowerCase();
  const changeReason = String(input?.changeReason || '').trim();
  const expectedHeadArtifactId = input?.expectedHeadArtifactId == null ? null : Number(input.expectedHeadArtifactId);
  if (!Number.isInteger(projectId) || projectId < 1) throw new WorkflowArtifactError('PROJECT_CONTEXT_REQUIRED');
  if (!KINDS.has(kind)) throw new WorkflowArtifactError('WORKFLOW_ARTIFACT_KIND_INVALID');
  if ((scope.marketplace === 'AMAZON') !== kind.startsWith('AMAZON_')) {
    throw new WorkflowArtifactError('WORKFLOW_ARTIFACT_MARKETPLACE_MISMATCH');
  }
  if (!UUID.test(idempotencyKey)) throw new WorkflowArtifactError('INVALID_IDEMPOTENCY_KEY');
  if (!changeReason || changeReason.length > 128) throw new WorkflowArtifactError('CHANGE_REASON_REQUIRED');
  if (expectedHeadArtifactId !== null && (!Number.isInteger(expectedHeadArtifactId) || expectedHeadArtifactId < 1)) {
    throw new WorkflowArtifactError('EXPECTED_HEAD_INVALID');
  }
  const bindings = input.bindings || {};
  if (!HASH.test(bindings.engine || '') || !HASH.test(bindings.parser || '')
    || !HASH.test(bindings.normalization || '') || !HASH.test(bindings.scoring || '')
    || (bindings.policy != null && !HASH.test(bindings.policy))) {
    throw new WorkflowArtifactError('WORKFLOW_ARTIFACT_BINDING_INVALID', 500);
  }
  const dependenciesJson = canonicalJson(input.dependencies || {});
  const payloadJson = canonicalJson(input.payload || {});
  const accountingJson = canonicalJson(input.accounting || {});
  for (const [name, value] of Object.entries({ dependencies: dependenciesJson, payload: payloadJson, accounting: accountingJson })) {
    const byteLength = Buffer.byteLength(value, 'utf8');
    if (byteLength > JSON_LIMITS[name]) throw new WorkflowArtifactError('WORKFLOW_ARTIFACT_JSON_TOO_LARGE', 413,
      { field: name, byteLength, limit: JSON_LIMITS[name] });
  }
  const request = {
    operation: 'APPEND_COMMERCE_WORKFLOW_ARTIFACT', scope: { tenantId: scope.tenantId, workspaceId: scope.workspaceId,
      marketplace: scope.marketplace, actorId: scope.actorId }, projectId, kind, idempotencyKey,
    expectedHeadArtifactId, changeReason,
    dependencies: JSON.parse(dependenciesJson), payload: JSON.parse(payloadJson), accounting: JSON.parse(accountingJson),
    bindings: { engine: bindings.engine, parser: bindings.parser, normalization: bindings.normalization,
      scoring: bindings.scoring, policy: bindings.policy ?? null }
  };
  return { scope, projectId, kind, idempotencyKey, changeReason, expectedHeadArtifactId,
    dependenciesJson, payloadJson, accountingJson, bindings: request.bindings, requestHash: hashBytes(canonicalJson(request)) };
}

function immutableEnvelope(row) {
  return {
    tenantId: row.tenant_id, workspaceId: row.workspace_id, marketplace: row.marketplace,
    projectId: row.project_id, kind: row.kind, revisionNumber: row.revision_number,
    parentRevisionId: row.parent_revision_id, requestHash: row.request_hash,
    dependencyManifestHash: row.dependency_manifest_hash, payloadHash: row.payload_hash,
    accountingHash: row.accounting_hash, engineBindingHash: row.engine_binding_hash,
    parserBindingHash: row.parser_binding_hash, normalizationBindingHash: row.normalization_binding_hash,
    scoringBindingHash: row.scoring_binding_hash, policyBindingHash: row.policy_binding_hash,
    changeReason: row.change_reason, createdBy: row.created_by, createdAt: row.created_at,
    integrityVersion: row.integrity_version
  };
}

function assertIntegrity(row) {
  const actual = {
    dependencyManifestHash: hashBytes(row.dependency_manifest_json), payloadHash: hashBytes(row.payload_json),
    accountingHash: hashBytes(row.accounting_json)
  };
  const envelopeHash = Number(row.integrity_version) === 1
    ? hashBytes(canonicalJson({ accountingHash: row.accounting_hash,
      dependencyManifestHash: row.dependency_manifest_hash, engineBindingHash: row.engine_binding_hash,
      payloadHash: row.payload_hash }))
    : hashBytes(canonicalJson(immutableEnvelope(row)));
  if (![1, 2].includes(Number(row.integrity_version)) || actual.dependencyManifestHash !== row.dependency_manifest_hash
    || actual.payloadHash !== row.payload_hash || actual.accountingHash !== row.accounting_hash
    || envelopeHash !== row.artifact_hash) {
    throw new WorkflowArtifactError('WORKFLOW_ARTIFACT_INTEGRITY_FAILURE', 500, { artifactId: row.id });
  }
}

function present(row) {
  assertIntegrity(row);
  return {
    id: row.id, projectId: row.project_id, kind: row.kind, revisionNumber: row.revision_number,
    parentRevisionId: row.parent_revision_id, requestHash: row.request_hash, artifactHash: row.artifact_hash,
    dependencies: JSON.parse(row.dependency_manifest_json), payload: JSON.parse(row.payload_json),
    accounting: JSON.parse(row.accounting_json), bindings: { engine: row.engine_binding_hash,
      parser: row.parser_binding_hash, normalization: row.normalization_binding_hash,
      scoring: row.scoring_binding_hash, policy: row.policy_binding_hash }, changeReason: row.change_reason,
    createdBy: row.created_by, createdAt: row.created_at, integrityVersion: Number(row.integrity_version),
    canonicalDependencyEligible: Number(row.integrity_version) === 2
  };
}

async function appendUnlocked(db, rawScope, projectIdInput, input) {
  const normalized = normalizeInput(rawScope, projectIdInput, input);
  const { scope, projectId, kind, idempotencyKey } = normalized;
  let transactionOpen = false;
  try {
    await run(db, 'BEGIN IMMEDIATE'); transactionOpen = true;
    const duplicate = await get(db, `SELECT * FROM commerce_workflow_artifacts WHERE tenant_id=? AND workspace_id=?
      AND marketplace=? AND project_id=? AND kind=? AND idempotency_key=?`,
    [scope.tenantId, scope.workspaceId, scope.marketplace, projectId, kind, idempotencyKey]);
    if (duplicate) {
      if (Number(duplicate.created_by) !== scope.actorId) throw new WorkflowArtifactError('IDEMPOTENCY_ACTOR_MISMATCH', 409);
      if (duplicate.request_hash !== normalized.requestHash) throw new WorkflowArtifactError('IDEMPOTENCY_KEY_REUSE', 409);
      await run(db, 'COMMIT'); transactionOpen = false;
      return { ...present(duplicate), duplicate: true };
    }
    const project = await get(db, `SELECT id FROM research_projects WHERE id=? AND tenant_id=? AND workspace_id=? AND marketplace=?`,
      [projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
    if (!project) throw new WorkflowArtifactError('PROJECT_NOT_FOUND', 404);
    const parent = await get(db, `SELECT * FROM commerce_workflow_artifacts WHERE tenant_id=? AND workspace_id=?
      AND marketplace=? AND project_id=? AND kind=? ORDER BY revision_number DESC LIMIT 1`,
    [scope.tenantId, scope.workspaceId, scope.marketplace, projectId, kind]);
    if (parent) assertIntegrity(parent);
    if ((parent?.id ?? null) !== normalized.expectedHeadArtifactId) throw new WorkflowArtifactError(
      'WORKFLOW_ARTIFACT_CONFLICT', 409, { expectedHeadArtifactId: normalized.expectedHeadArtifactId,
        currentHeadArtifactId: parent?.id ?? null, kind });
    const row = {
      tenant_id: scope.tenantId, workspace_id: scope.workspaceId, marketplace: scope.marketplace,
      project_id: projectId, kind, revision_number: (parent?.revision_number || 0) + 1,
      parent_revision_id: parent?.id ?? null, request_hash: normalized.requestHash,
      dependency_manifest_hash: hashBytes(normalized.dependenciesJson), payload_hash: hashBytes(normalized.payloadJson),
      accounting_hash: hashBytes(normalized.accountingJson), engine_binding_hash: normalized.bindings.engine,
      parser_binding_hash: normalized.bindings.parser, normalization_binding_hash: normalized.bindings.normalization,
      scoring_binding_hash: normalized.bindings.scoring, policy_binding_hash: normalized.bindings.policy,
      change_reason: normalized.changeReason, created_by: scope.actorId, created_at: new Date().toISOString(),
      integrity_version: 2
    };
    const artifactHash = hashBytes(canonicalJson(immutableEnvelope(row)));
    const inserted = await run(db, `INSERT INTO commerce_workflow_artifacts
      (tenant_id,workspace_id,marketplace,project_id,kind,revision_number,parent_revision_id,integrity_version,request_hash,idempotency_key,
       dependency_manifest_json,dependency_manifest_hash,payload_json,payload_hash,accounting_json,accounting_hash,
       engine_binding_hash,parser_binding_hash,normalization_binding_hash,scoring_binding_hash,policy_binding_hash,
       artifact_hash,change_reason,created_by,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [scope.tenantId, scope.workspaceId, scope.marketplace,
      projectId, kind, row.revision_number, row.parent_revision_id, row.integrity_version, normalized.requestHash, idempotencyKey,
      normalized.dependenciesJson, row.dependency_manifest_hash, normalized.payloadJson, row.payload_hash,
      normalized.accountingJson, row.accounting_hash, row.engine_binding_hash, row.parser_binding_hash,
      row.normalization_binding_hash, row.scoring_binding_hash, row.policy_binding_hash, artifactHash,
      row.change_reason, row.created_by, row.created_at]);
    const persisted = await get(db, 'SELECT * FROM commerce_workflow_artifacts WHERE id=?', [inserted.lastID]);
    await run(db, 'COMMIT'); transactionOpen = false;
    return { ...present(persisted), duplicate: false };
  } catch (error) {
    if (transactionOpen) try { await run(db, 'ROLLBACK'); } catch (_) {}
    if (error instanceof WorkflowArtifactError) throw error;
    if (['SQLITE_BUSY', 'SQLITE_CONSTRAINT'].includes(error?.code)) {
      throw new WorkflowArtifactError('WORKFLOW_ARTIFACT_WRITE_CONFLICT', 409);
    }
    throw error;
  }
}

function appendArtifact(db, scope, projectId, input) {
  return withProcessLock(db, () => appendUnlocked(db, scope, projectId, input));
}

async function getArtifact(db, rawScope, projectIdInput, artifactIdInput, kind = null) {
  const scope = scopeOf(rawScope); const projectId = Number(projectIdInput); const artifactId = Number(artifactIdInput);
  const row = await get(db, `SELECT * FROM commerce_workflow_artifacts WHERE id=? AND tenant_id=? AND workspace_id=?
    AND marketplace=? AND project_id=?`, [artifactId, scope.tenantId, scope.workspaceId, scope.marketplace, projectId]);
  if (!row || (kind && row.kind !== kind)) throw new WorkflowArtifactError('WORKFLOW_ARTIFACT_NOT_FOUND', 404);
  if (Number(row.integrity_version) !== 2) throw new WorkflowArtifactError('LEGACY_WORKFLOW_ARTIFACT_REFREEZE_REQUIRED', 409,
    { artifactId: row.id, integrityVersion: Number(row.integrity_version), kind: row.kind });
  return present(row);
}

async function getArtifactState(db, rawScope, projectIdInput) {
  const scope = scopeOf(rawScope); const projectId = Number(projectIdInput);
  const project = await get(db, `SELECT id FROM research_projects WHERE id=? AND tenant_id=? AND workspace_id=? AND marketplace=?`,
    [projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
  if (!project) throw new WorkflowArtifactError('PROJECT_NOT_FOUND', 404);
  const rows = await all(db, `SELECT * FROM commerce_workflow_artifacts WHERE tenant_id=? AND workspace_id=?
    AND marketplace=? AND project_id=? ORDER BY id DESC`, [scope.tenantId, scope.workspaceId, scope.marketplace, projectId]);
  const artifacts = rows.map(present); const heads = {};
  for (const artifact of artifacts) if (!heads[artifact.kind]) heads[artifact.kind] = artifact;
  return { projectId, artifacts, heads };
}

module.exports = Object.freeze({ WorkflowArtifactError, JSON_LIMITS, appendArtifact, getArtifact, getArtifactState,
  assertIntegrity, immutableEnvelope });
