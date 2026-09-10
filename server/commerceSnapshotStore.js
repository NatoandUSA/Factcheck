'use strict';

const crypto = require('node:crypto');
const { canonicalJson, hashBytes } = require('./revisionStore');

const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS = new Set(['AMAZON_XRAY','AMAZON_CEREBRO','AMAZON_REFERENCE','ETSY_SEARCH']);
const queues = new WeakMap();

class CommerceSnapshotError extends Error {
  constructor(code, status = 400, details = {}) {
    super(code); this.name = 'CommerceSnapshotError'; this.code = code; this.status = status; this.details = details;
  }
}

const run = (db, sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function done(error) {
  if (error) reject(error); else resolve({ lastID: this.lastID, changes: this.changes });
}));
const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params,
  (error, row) => error ? reject(error) : resolve(row || null)));
const all = (db, sql, params = []) => new Promise((resolve, reject) => db.all(sql, params,
  (error, rows) => error ? reject(error) : resolve(rows)));

function stableValue(value, depth = 0) {
  if (depth > 40) throw new CommerceSnapshotError('SNAPSHOT_TOO_DEEP', 413);
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new CommerceSnapshotError('SNAPSHOT_NONFINITE');
    return value;
  }
  if (Array.isArray(value)) return value.map(item => stableValue(item, depth + 1));
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new CommerceSnapshotError('SNAPSHOT_JSON_REQUIRED');
  }
  const output = {};
  for (const key of Object.keys(value).sort()) {
    const normalized = key.normalize('NFC');
    if (Object.prototype.hasOwnProperty.call(output, normalized)) throw new CommerceSnapshotError('SNAPSHOT_KEY_COLLISION');
    // defineProperty treats "__proto__" as ordinary data while keeping an
    // Object.prototype object compatible with the revision canonicalizer.
    Object.defineProperty(output, normalized, { value: stableValue(value[key], depth + 1),
      enumerable: true, configurable: true, writable: true });
  }
  return output;
}

function snapshotJson(value) {
  const json = JSON.stringify(stableValue(value));
  if (Buffer.byteLength(json, 'utf8') > 64 * 1024 * 1024) throw new CommerceSnapshotError('SNAPSHOT_TOO_LARGE', 413);
  return json;
}

function assertResearchIntegrity(row) {
  const components = {
    importManifestHash: hashBytes(row.import_manifest_json),
    observationsHash: hashBytes(row.observations_json),
    accountingHash: hashBytes(row.accounting_json),
    adapterBindingHash: row.adapter_binding_hash
  };
  if (components.importManifestHash !== row.import_manifest_hash || components.observationsHash !== row.observations_hash
    || components.accountingHash !== row.accounting_hash || hashBytes(snapshotJson(components)) !== row.snapshot_hash) {
    throw new CommerceSnapshotError('RESEARCH_SNAPSHOT_INTEGRITY_FAILURE', 500);
  }
}

function assertIntelligenceIntegrity(row) {
  const components = {
    researchSnapshotId: row.research_snapshot_id, researchSnapshotHash: row.research_snapshot_hash,
    productTruthRevisionId: row.product_truth_revision_id, productTruthHash: row.product_truth_hash,
    configurationHash: hashBytes(row.configuration_json), outputHash: hashBytes(row.output_json),
    accountingHash: hashBytes(row.accounting_json), engineBindingHash: row.engine_binding_hash
  };
  if (components.configurationHash !== row.configuration_hash || components.outputHash !== row.output_hash
    || components.accountingHash !== row.accounting_hash || hashBytes(snapshotJson(components)) !== row.snapshot_hash) {
    throw new CommerceSnapshotError('INTELLIGENCE_SNAPSHOT_INTEGRITY_FAILURE', 500);
  }
}

function scopeOf(input) {
  const scope = { tenantId: String(input?.tenantId || '').trim(), workspaceId: Number(input?.workspaceId),
    marketplace: input?.marketplace, actorId: Number(input?.actorId) };
  if (!scope.tenantId || !Number.isInteger(scope.workspaceId) || scope.workspaceId < 1
    || !['AMAZON','ETSY'].includes(scope.marketplace) || !Number.isInteger(scope.actorId) || scope.actorId < 1) {
    throw new CommerceSnapshotError('INVALID_SERVER_SCOPE', 500);
  }
  return Object.freeze(scope);
}

function withLock(db, operation) {
  const previous = queues.get(db) || Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  queues.set(db, current);
  return current.finally(() => { if (queues.get(db) === current) queues.delete(db); });
}

async function rollback(db, error) {
  try { await run(db, 'ROLLBACK'); } catch (_) {}
  throw error;
}

async function replay(db, scope, operation, key, requestHash) {
  const receipt = await get(db, `SELECT request_hash,response_json,created_by FROM commerce_write_receipts
    WHERE tenant_id=? AND workspace_id=? AND marketplace=? AND operation=? AND idempotency_key=?`,
  [scope.tenantId, scope.workspaceId, scope.marketplace, operation, key]);
  if (!receipt) return null;
  if (receipt.created_by !== scope.actorId) throw new CommerceSnapshotError('IDEMPOTENCY_KEY_ACTOR_MISMATCH', 409);
  if (receipt.request_hash !== requestHash) throw new CommerceSnapshotError('IDEMPOTENCY_KEY_REUSE', 409);
  return JSON.parse(receipt.response_json);
}

async function appendResearchImportUnlocked(db, rawScope, projectIdInput, input = {}, hooks = {}) {
  const scope = scopeOf(rawScope);
  const projectId = Number(projectIdInput);
  if (!Number.isInteger(projectId) || projectId < 1) throw new CommerceSnapshotError('PROJECT_CONTEXT_REQUIRED');
  const key = String(input.idempotencyKey || '').trim().toLowerCase();
  if (!KEY.test(key)) throw new CommerceSnapshotError('INVALID_IDEMPOTENCY_KEY');
  const kind = String(input.kind || '').trim().toUpperCase();
  if (!KINDS.has(kind) || (scope.marketplace === 'AMAZON') !== kind.startsWith('AMAZON_')) {
    throw new CommerceSnapshotError('IMPORT_KIND_MARKETPLACE_MISMATCH');
  }
  const bytes = Buffer.isBuffer(input.rawBytes) ? input.rawBytes : null;
  if (!bytes?.length) throw new CommerceSnapshotError('RAW_IMPORT_REQUIRED');
  if (bytes.length > 20 * 1024 * 1024) throw new CommerceSnapshotError('RAW_IMPORT_TOO_LARGE', 413);
  const fileName = String(input.fileName || '').trim();
  const mediaType = String(input.mediaType || '').trim();
  const parserId = String(input.parserId || '').trim();
  const parserHash = String(input.parserHash || '').trim().toLowerCase();
  if (!fileName || fileName.length > 255 || !mediaType || mediaType.length > 128 || !parserId || parserId.length > 128
    || !/^[0-9a-f]{64}$/.test(parserHash)) throw new CommerceSnapshotError('INVALID_IMPORT_METADATA');
  const selectedSheet = input.selectedSheet == null ? null : String(input.selectedSheet).trim();
  const headers = Array.isArray(input.headerSignature) ? input.headerSignature.map(value => String(value)) : null;
  if (!headers || headers.length > 512) throw new CommerceSnapshotError('INVALID_HEADER_SIGNATURE');
  const rawHash = crypto.createHash('sha256').update(bytes).digest('hex');
  const envelope = { operation: 'APPEND_RESEARCH_IMPORT', scope: { tenantId: scope.tenantId,
    workspaceId: scope.workspaceId, marketplace: scope.marketplace }, projectId, key, kind, fileName,
    mediaType, rawHash, selectedSheet, headerSignature: headers, parserId, parserHash };
  const requestHash = hashBytes(canonicalJson(envelope));
  const preflight = await replay(db, scope, envelope.operation, key, requestHash);
  if (preflight) return preflight;
  await run(db, 'BEGIN IMMEDIATE');
  try {
    const inside = await replay(db, scope, envelope.operation, key, requestHash);
    if (inside) { await run(db, 'COMMIT'); return inside; }
    const project = await get(db, `SELECT id FROM research_projects
      WHERE id=? AND tenant_id=? AND workspace_id=? AND marketplace=?`,
    [projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
    if (!project) throw new CommerceSnapshotError('PROJECT_NOT_FOUND', 404);
    let row = await get(db, `SELECT id,raw_hash FROM research_imports WHERE tenant_id=? AND workspace_id=?
      AND marketplace=? AND project_id=? AND kind=? AND raw_hash=?`,
    [scope.tenantId, scope.workspaceId, scope.marketplace, projectId, kind, rawHash]);
    let duplicate = true;
    if (!row) {
      duplicate = false;
      const inserted = await run(db, `INSERT INTO research_imports
        (tenant_id,workspace_id,marketplace,project_id,kind,file_name,media_type,raw_bytes,raw_hash,selected_sheet,
         header_signature_json,parser_id,parser_hash,imported_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [scope.tenantId, scope.workspaceId, scope.marketplace, projectId, kind, fileName, mediaType, bytes, rawHash,
        selectedSheet, canonicalJson(headers), parserId, parserHash, scope.actorId]);
      row = { id: inserted.lastID, raw_hash: rawHash };
      if (hooks.afterImport) await hooks.afterImport(row.id);
    }
    const response = Object.freeze({ projectId, researchImportId: row.id, kind, rawHash, byteLength: bytes.length, duplicate });
    await run(db, `INSERT INTO commerce_write_receipts
      (tenant_id,workspace_id,marketplace,project_id,operation,idempotency_key,request_hash,response_json,created_by)
      VALUES (?,?,?,?,?,?,?,?,?)`, [scope.tenantId, scope.workspaceId, scope.marketplace, projectId,
      envelope.operation, key, requestHash, canonicalJson(response), scope.actorId]);
    if (hooks.beforeCommit) await hooks.beforeCommit(response);
    await run(db, 'COMMIT');
    return response;
  } catch (error) { return rollback(db, error); }
}

function appendResearchImport(db, scope, projectId, input, hooks = {}) {
  return withLock(db, () => appendResearchImportUnlocked(db, scope, projectId, input, hooks));
}

async function appendResearchSnapshotUnlocked(db, rawScope, projectIdInput, input = {}, hooks = {}) {
  const scope = scopeOf(rawScope); const projectId = Number(projectIdInput);
  const key = String(input.idempotencyKey || '').trim().toLowerCase();
  if (!Number.isInteger(projectId) || projectId < 1) throw new CommerceSnapshotError('PROJECT_CONTEXT_REQUIRED');
  if (!KEY.test(key)) throw new CommerceSnapshotError('INVALID_IDEMPOTENCY_KEY');
  const reason = String(input.changeReason || '').trim();
  if (!reason || reason.length > 128) throw new CommerceSnapshotError('CHANGE_REASON_REQUIRED');
  const expectedHead = input.expectedHeadResearchSnapshotId == null ? null : Number(input.expectedHeadResearchSnapshotId);
  if (expectedHead !== null && (!Number.isInteger(expectedHead) || expectedHead < 1)) {
    throw new CommerceSnapshotError('INVALID_REVISION_PARENT');
  }
  const importIds = [...new Set((Array.isArray(input.importIds) ? input.importIds : []).map(Number))];
  if (!importIds.length || importIds.length > 100 || importIds.some(id => !Number.isInteger(id) || id < 1)) {
    throw new CommerceSnapshotError('IMPORT_IDS_REQUIRED');
  }
  const operation = 'APPEND_RESEARCH_SNAPSHOT';
  const requestHash = hashBytes(canonicalJson({ operation, scope: { tenantId: scope.tenantId,
    workspaceId: scope.workspaceId, marketplace: scope.marketplace }, projectId, key, reason, expectedHead, importIds }));
  const preflight = await replay(db, scope, operation, key, requestHash);
  if (preflight) return preflight;
  const placeholders = importIds.map(() => '?').join(',');
  const imports = await all(db, `SELECT * FROM research_imports WHERE tenant_id=? AND workspace_id=? AND marketplace=?
    AND project_id=? AND id IN (${placeholders})`, [scope.tenantId, scope.workspaceId, scope.marketplace, projectId, ...importIds]);
  if (imports.length !== importIds.length) throw new CommerceSnapshotError('RESEARCH_IMPORT_NOT_FOUND', 404);
  const byId = new Map(imports.map(row => [row.id, row]));
  const ordered = importIds.map(id => byId.get(id));
  for (const row of ordered) {
    if (crypto.createHash('sha256').update(Buffer.from(row.raw_bytes)).digest('hex') !== row.raw_hash) {
      throw new CommerceSnapshotError('RESEARCH_IMPORT_INTEGRITY_FAILURE', 500);
    }
  }
  if (typeof hooks.buildSnapshot !== 'function') throw new CommerceSnapshotError('RESEARCH_ADAPTER_REQUIRED', 500);
  const built = await hooks.buildSnapshot(Object.freeze(ordered.map(row => Object.freeze({ ...row }))));
  if (!built || typeof built !== 'object' || !/^[0-9a-f]{64}$/.test(String(built.adapterBindingHash || ''))) {
    throw new CommerceSnapshotError('INVALID_RESEARCH_ADAPTER_OUTPUT', 500);
  }
  const manifest = ordered.map(row => ({ id: row.id, kind: row.kind, rawHash: row.raw_hash,
    parserId: row.parser_id, parserHash: row.parser_hash, selectedSheet: row.selected_sheet }));
  const manifestJson = snapshotJson(manifest); const observationsJson = snapshotJson(built.observations);
  const accountingJson = snapshotJson(built.accounting);
  const componentHashes = { importManifestHash: hashBytes(manifestJson), observationsHash: hashBytes(observationsJson),
    accountingHash: hashBytes(accountingJson), adapterBindingHash: built.adapterBindingHash };
  const snapshotHash = hashBytes(snapshotJson(componentHashes));
  await run(db, 'BEGIN IMMEDIATE');
  try {
    const inside = await replay(db, scope, operation, key, requestHash);
    if (inside) { await run(db, 'COMMIT'); return inside; }
    const project = await get(db, `SELECT head_research_snapshot_id FROM research_projects
      WHERE id=? AND tenant_id=? AND workspace_id=? AND marketplace=?`,
    [projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
    if (!project) throw new CommerceSnapshotError('PROJECT_NOT_FOUND', 404);
    if ((project.head_research_snapshot_id ?? null) !== expectedHead) throw new CommerceSnapshotError('RESEARCH_SNAPSHOT_CONFLICT', 409);
    let revisionNumber = 1;
    if (expectedHead !== null) {
      const parent = await get(db, `SELECT revision_number,observations_json,observations_hash FROM research_snapshots
        WHERE id=? AND project_id=? AND tenant_id=? AND workspace_id=? AND marketplace=?`,
      [expectedHead, projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
      if (!parent) throw new CommerceSnapshotError('RESEARCH_SNAPSHOT_NOT_FOUND', 404);
      const completeParent = await get(db, `SELECT * FROM research_snapshots WHERE id=? AND project_id=?
        AND tenant_id=? AND workspace_id=? AND marketplace=?`,
      [expectedHead, projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
      assertResearchIntegrity(completeParent);
      revisionNumber = parent.revision_number + 1;
    }
    const inserted = await run(db, `INSERT INTO research_snapshots
      (tenant_id,workspace_id,marketplace,project_id,revision_number,parent_revision_id,import_manifest_json,
       import_manifest_hash,observations_json,observations_hash,accounting_json,accounting_hash,adapter_binding_hash,
       snapshot_hash,change_reason,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [scope.tenantId, scope.workspaceId, scope.marketplace, projectId, revisionNumber, expectedHead,
      manifestJson, componentHashes.importManifestHash, observationsJson, componentHashes.observationsHash, accountingJson,
      componentHashes.accountingHash, built.adapterBindingHash, snapshotHash, reason, scope.actorId]);
    if (hooks.afterSnapshot) await hooks.afterSnapshot(inserted.lastID);
    const update = await run(db, `UPDATE research_projects SET head_research_snapshot_id=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND tenant_id=? AND workspace_id=? AND marketplace=? AND head_research_snapshot_id IS ?`,
    [inserted.lastID, projectId, scope.tenantId, scope.workspaceId, scope.marketplace, expectedHead]);
    if (update.changes !== 1) throw new CommerceSnapshotError('RESEARCH_SNAPSHOT_CONFLICT', 409);
    const response = Object.freeze({ projectId, researchSnapshotId: inserted.lastID, revisionNumber,
      parentRevisionId: expectedHead, researchSnapshotHash: snapshotHash, importCount: ordered.length });
    await run(db, `INSERT INTO commerce_write_receipts
      (tenant_id,workspace_id,marketplace,project_id,operation,idempotency_key,request_hash,response_json,created_by)
      VALUES (?,?,?,?,?,?,?,?,?)`, [scope.tenantId, scope.workspaceId, scope.marketplace, projectId,
      operation, key, requestHash, canonicalJson(response), scope.actorId]);
    if (hooks.beforeCommit) await hooks.beforeCommit(response);
    await run(db, 'COMMIT'); return response;
  } catch (error) { return rollback(db, error); }
}

function appendResearchSnapshot(db, scope, projectId, input, hooks = {}) {
  return withLock(db, () => appendResearchSnapshotUnlocked(db, scope, projectId, input, hooks));
}

async function appendIntelligenceSnapshotUnlocked(db, rawScope, projectIdInput, input = {}, hooks = {}) {
  const scope = scopeOf(rawScope); const projectId = Number(projectIdInput);
  const key = String(input.idempotencyKey || '').trim().toLowerCase();
  const reason = String(input.changeReason || '').trim();
  if (!Number.isInteger(projectId) || projectId < 1) throw new CommerceSnapshotError('PROJECT_CONTEXT_REQUIRED');
  if (!KEY.test(key)) throw new CommerceSnapshotError('INVALID_IDEMPOTENCY_KEY');
  if (!reason || reason.length > 128) throw new CommerceSnapshotError('CHANGE_REASON_REQUIRED');
  const expectedHead = input.expectedHeadIntelligenceSnapshotId == null ? null : Number(input.expectedHeadIntelligenceSnapshotId);
  const researchSnapshotId = Number(input.researchSnapshotId);
  const productTruthRevisionId = Number(input.productTruthRevisionId);
  if (expectedHead !== null && (!Number.isInteger(expectedHead) || expectedHead < 1)) throw new CommerceSnapshotError('INVALID_REVISION_PARENT');
  if (!Number.isInteger(researchSnapshotId) || researchSnapshotId < 1
    || !Number.isInteger(productTruthRevisionId) || productTruthRevisionId < 1) {
    throw new CommerceSnapshotError('INTELLIGENCE_DEPENDENCIES_REQUIRED');
  }
  const configuration = stableValue(input.configuration || {});
  const operation = 'APPEND_INTELLIGENCE_SNAPSHOT';
  const requestHash = hashBytes(canonicalJson({ operation, scope: { tenantId: scope.tenantId,
    workspaceId: scope.workspaceId, marketplace: scope.marketplace }, projectId, key, reason, expectedHead,
    researchSnapshotId, productTruthRevisionId, configuration }));
  const preflight = await replay(db, scope, operation, key, requestHash);
  if (preflight) return preflight;
  const research = await get(db, `SELECT * FROM research_snapshots WHERE id=? AND project_id=?
    AND tenant_id=? AND workspace_id=? AND marketplace=?`,
  [researchSnapshotId, projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
  const truth = await get(db, `SELECT * FROM product_truth_revisions WHERE id=? AND project_id=?
    AND tenant_id=? AND workspace_id=? AND marketplace=?`,
  [productTruthRevisionId, projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
  if (!research) throw new CommerceSnapshotError('RESEARCH_SNAPSHOT_NOT_FOUND', 404);
  if (!truth) throw new CommerceSnapshotError('PRODUCT_TRUTH_REVISION_NOT_FOUND', 404);
  assertResearchIntegrity(research);
  if (hashBytes(truth.snapshot_json) !== truth.content_hash) throw new CommerceSnapshotError('PRODUCT_TRUTH_INTEGRITY_FAILURE', 500);
  if (typeof hooks.buildIntelligence !== 'function') throw new CommerceSnapshotError('INTELLIGENCE_ENGINE_REQUIRED', 500);
  const built = await hooks.buildIntelligence(Object.freeze({
    research: Object.freeze({ ...research, observations: JSON.parse(research.observations_json),
      accounting: JSON.parse(research.accounting_json) }),
    productTruth: Object.freeze({ ...truth, snapshot: JSON.parse(truth.snapshot_json) }), configuration
  }));
  if (!built || typeof built !== 'object' || !/^[0-9a-f]{64}$/.test(String(built.engineBindingHash || ''))) {
    throw new CommerceSnapshotError('INVALID_INTELLIGENCE_ENGINE_OUTPUT', 500);
  }
  const configurationJson = snapshotJson(configuration); const outputJson = snapshotJson(built.output);
  const accountingJson = snapshotJson(built.accounting);
  const components = { researchSnapshotId, researchSnapshotHash: research.snapshot_hash,
    productTruthRevisionId, productTruthHash: truth.content_hash, configurationHash: hashBytes(configurationJson),
    outputHash: hashBytes(outputJson), accountingHash: hashBytes(accountingJson), engineBindingHash: built.engineBindingHash };
  const snapshotHash = hashBytes(snapshotJson(components));
  await run(db, 'BEGIN IMMEDIATE');
  try {
    const inside = await replay(db, scope, operation, key, requestHash);
    if (inside) { await run(db, 'COMMIT'); return inside; }
    const project = await get(db, `SELECT head_research_snapshot_id,head_product_truth_revision_id,head_intelligence_snapshot_id
      FROM research_projects WHERE id=? AND tenant_id=? AND workspace_id=? AND marketplace=?`,
    [projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
    if (!project) throw new CommerceSnapshotError('PROJECT_NOT_FOUND', 404);
    if (project.head_research_snapshot_id !== researchSnapshotId) throw new CommerceSnapshotError('STALE_RESEARCH_SNAPSHOT', 409);
    if (project.head_product_truth_revision_id !== productTruthRevisionId) throw new CommerceSnapshotError('STALE_PRODUCT_TRUTH_REVISION', 409);
    if ((project.head_intelligence_snapshot_id ?? null) !== expectedHead) throw new CommerceSnapshotError('INTELLIGENCE_SNAPSHOT_CONFLICT', 409);
    let revisionNumber = 1;
    if (expectedHead !== null) {
      const parent = await get(db, `SELECT revision_number,output_json,output_hash FROM intelligence_snapshots
        WHERE id=? AND project_id=? AND tenant_id=? AND workspace_id=? AND marketplace=?`,
      [expectedHead, projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
      if (!parent) throw new CommerceSnapshotError('INTELLIGENCE_SNAPSHOT_NOT_FOUND', 404);
      const completeParent = await get(db, `SELECT * FROM intelligence_snapshots WHERE id=? AND project_id=?
        AND tenant_id=? AND workspace_id=? AND marketplace=?`,
      [expectedHead, projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
      assertIntelligenceIntegrity(completeParent);
      revisionNumber = parent.revision_number + 1;
    }
    const inserted = await run(db, `INSERT INTO intelligence_snapshots
      (tenant_id,workspace_id,marketplace,project_id,revision_number,parent_revision_id,research_snapshot_id,
       research_snapshot_hash,product_truth_revision_id,product_truth_hash,configuration_json,configuration_hash,
       output_json,output_hash,accounting_json,accounting_hash,engine_binding_hash,snapshot_hash,change_reason,created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [scope.tenantId, scope.workspaceId, scope.marketplace, projectId, revisionNumber, expectedHead,
      researchSnapshotId, research.snapshot_hash, productTruthRevisionId, truth.content_hash,
      configurationJson, components.configurationHash, outputJson, components.outputHash, accountingJson,
      components.accountingHash, built.engineBindingHash, snapshotHash, reason, scope.actorId]);
    const update = await run(db, `UPDATE research_projects SET head_intelligence_snapshot_id=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND tenant_id=? AND workspace_id=? AND marketplace=? AND head_intelligence_snapshot_id IS ?
        AND head_research_snapshot_id=? AND head_product_truth_revision_id=?`,
    [inserted.lastID, projectId, scope.tenantId, scope.workspaceId, scope.marketplace, expectedHead,
      researchSnapshotId, productTruthRevisionId]);
    if (update.changes !== 1) throw new CommerceSnapshotError('INTELLIGENCE_DEPENDENCY_CONFLICT', 409);
    const response = Object.freeze({ projectId, intelligenceSnapshotId: inserted.lastID, revisionNumber,
      parentRevisionId: expectedHead, intelligenceSnapshotHash: snapshotHash, researchSnapshotId,
      researchSnapshotHash: research.snapshot_hash, productTruthRevisionId, productTruthHash: truth.content_hash });
    await run(db, `INSERT INTO commerce_write_receipts
      (tenant_id,workspace_id,marketplace,project_id,operation,idempotency_key,request_hash,response_json,created_by)
      VALUES (?,?,?,?,?,?,?,?,?)`, [scope.tenantId, scope.workspaceId, scope.marketplace, projectId,
      operation, key, requestHash, canonicalJson(response), scope.actorId]);
    if (hooks.beforeCommit) await hooks.beforeCommit(response);
    await run(db, 'COMMIT'); return response;
  } catch (error) { return rollback(db, error); }
}

function appendIntelligenceSnapshot(db, scope, projectId, input, hooks = {}) {
  return withLock(db, () => appendIntelligenceSnapshotUnlocked(db, scope, projectId, input, hooks));
}

async function previewIntelligence(db, rawScope, projectIdInput, input = {}, hooks = {}) {
  const scope = scopeOf(rawScope); const projectId = Number(projectIdInput);
  const researchSnapshotId = Number(input.researchSnapshotId);
  const productTruthRevisionId = Number(input.productTruthRevisionId);
  if (!Number.isInteger(projectId) || projectId < 1 || !Number.isInteger(researchSnapshotId) || researchSnapshotId < 1
    || !Number.isInteger(productTruthRevisionId) || productTruthRevisionId < 1) {
    throw new CommerceSnapshotError('INTELLIGENCE_DEPENDENCIES_REQUIRED');
  }
  if (typeof hooks.buildIntelligence !== 'function') throw new CommerceSnapshotError('INTELLIGENCE_ENGINE_REQUIRED', 500);
  const configuration = stableValue(input.configuration || {});
  const project = await get(db, `SELECT head_research_snapshot_id,head_product_truth_revision_id,head_intelligence_snapshot_id
    FROM research_projects WHERE id=? AND tenant_id=? AND workspace_id=? AND marketplace=?`,
  [projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
  if (!project) throw new CommerceSnapshotError('PROJECT_NOT_FOUND', 404);
  if (project.head_research_snapshot_id !== researchSnapshotId) throw new CommerceSnapshotError('STALE_RESEARCH_SNAPSHOT', 409);
  if (project.head_product_truth_revision_id !== productTruthRevisionId) throw new CommerceSnapshotError('STALE_PRODUCT_TRUTH_REVISION', 409);
  const research = await get(db, `SELECT * FROM research_snapshots WHERE id=? AND project_id=?
    AND tenant_id=? AND workspace_id=? AND marketplace=?`,
  [researchSnapshotId, projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
  const truth = await get(db, `SELECT * FROM product_truth_revisions WHERE id=? AND project_id=?
    AND tenant_id=? AND workspace_id=? AND marketplace=?`,
  [productTruthRevisionId, projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
  if (!research) throw new CommerceSnapshotError('RESEARCH_SNAPSHOT_NOT_FOUND', 404);
  if (!truth) throw new CommerceSnapshotError('PRODUCT_TRUTH_REVISION_NOT_FOUND', 404);
  assertResearchIntegrity(research);
  if (hashBytes(truth.snapshot_json) !== truth.content_hash) throw new CommerceSnapshotError('PRODUCT_TRUTH_INTEGRITY_FAILURE', 500);
  const built = await hooks.buildIntelligence(Object.freeze({
    research: Object.freeze({ ...research, observations: JSON.parse(research.observations_json),
      accounting: JSON.parse(research.accounting_json) }),
    productTruth: Object.freeze({ ...truth, snapshot: JSON.parse(truth.snapshot_json) }), configuration
  }));
  if (!built || typeof built !== 'object' || !/^[0-9a-f]{64}$/.test(String(built.engineBindingHash || ''))) {
    throw new CommerceSnapshotError('INVALID_INTELLIGENCE_ENGINE_OUTPUT', 500);
  }
  const configurationJson = snapshotJson(configuration); const outputJson = snapshotJson(built.output);
  const accountingJson = snapshotJson(built.accounting);
  const dependency = {
    researchSnapshotId, researchSnapshotHash: research.snapshot_hash,
    productTruthRevisionId, productTruthHash: truth.content_hash,
    configurationHash: hashBytes(configurationJson), outputHash: hashBytes(outputJson),
    accountingHash: hashBytes(accountingJson), engineBindingHash: built.engineBindingHash
  };
  const after = await get(db, `SELECT head_research_snapshot_id,head_product_truth_revision_id,head_intelligence_snapshot_id
    FROM research_projects WHERE id=? AND tenant_id=? AND workspace_id=? AND marketplace=?`,
  [projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
  if (!after || after.head_research_snapshot_id !== researchSnapshotId
    || after.head_product_truth_revision_id !== productTruthRevisionId
    || after.head_intelligence_snapshot_id !== project.head_intelligence_snapshot_id) {
    throw new CommerceSnapshotError('INTELLIGENCE_DEPENDENCY_CONFLICT', 409);
  }
  return Object.freeze({ projectId, zeroWrite: true, currentIntelligenceSnapshotId: project.head_intelligence_snapshot_id,
    intelligenceSnapshotHash: hashBytes(snapshotJson(dependency)), dependencies: dependency,
    configuration, output: built.output, accounting: built.accounting });
}

async function getIntelligenceSnapshot(db, rawScope, projectIdInput, snapshotIdInput) {
  const scope = scopeOf(rawScope); const projectId = Number(projectIdInput); const snapshotId = Number(snapshotIdInput);
  const row = await get(db, `SELECT * FROM intelligence_snapshots WHERE id=? AND project_id=?
    AND tenant_id=? AND workspace_id=? AND marketplace=?`,
  [snapshotId, projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
  if (!row) throw new CommerceSnapshotError('INTELLIGENCE_SNAPSHOT_NOT_FOUND', 404);
  assertIntelligenceIntegrity(row);
  return Object.freeze({ ...row, configuration: JSON.parse(row.configuration_json), output: JSON.parse(row.output_json),
    accounting: JSON.parse(row.accounting_json) });
}

async function getCommerceState(db, rawScope, projectIdInput) {
  const scope = scopeOf(rawScope); const projectId = Number(projectIdInput);
  const project = await get(db, `SELECT id,head_product_truth_revision_id,head_research_snapshot_id,head_intelligence_snapshot_id
    FROM research_projects WHERE id=? AND tenant_id=? AND workspace_id=? AND marketplace=?`,
  [projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
  if (!project) throw new CommerceSnapshotError('PROJECT_NOT_FOUND', 404);
  const imports = await all(db, `SELECT id,kind,file_name,media_type,raw_hash,selected_sheet,header_signature_json,
    parser_id,parser_hash,imported_by,imported_at,length(raw_bytes) AS byte_length FROM research_imports
    WHERE project_id=? AND tenant_id=? AND workspace_id=? AND marketplace=? ORDER BY id DESC`,
  [projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
  const researchRows = await all(db, `SELECT * FROM research_snapshots WHERE project_id=? AND tenant_id=?
    AND workspace_id=? AND marketplace=? ORDER BY revision_number DESC`,
  [projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
  const intelligenceRows = await all(db, `SELECT * FROM intelligence_snapshots WHERE project_id=? AND tenant_id=?
    AND workspace_id=? AND marketplace=? ORDER BY revision_number DESC`,
  [projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
  researchRows.forEach(assertResearchIntegrity); intelligenceRows.forEach(assertIntelligenceIntegrity);
  return Object.freeze({ projectId, heads: {
    productTruthRevisionId: project.head_product_truth_revision_id,
    researchSnapshotId: project.head_research_snapshot_id,
    intelligenceSnapshotId: project.head_intelligence_snapshot_id
  }, imports: imports.map(row => { const { header_signature_json: rawHeaders, ...rest } = row;
    return { ...rest, headerSignature: JSON.parse(rawHeaders) }; }),
  researchSnapshots: researchRows.map(row => ({ id: row.id, revisionNumber: row.revision_number,
    parentRevisionId: row.parent_revision_id, snapshotHash: row.snapshot_hash, changeReason: row.change_reason,
    createdBy: row.created_by, createdAt: row.created_at })),
  intelligenceSnapshots: intelligenceRows.map(row => ({ id: row.id, revisionNumber: row.revision_number,
    parentRevisionId: row.parent_revision_id, researchSnapshotId: row.research_snapshot_id,
    productTruthRevisionId: row.product_truth_revision_id, snapshotHash: row.snapshot_hash,
    changeReason: row.change_reason, createdBy: row.created_by, createdAt: row.created_at })) });
}

async function getResearchImport(db, rawScope, projectIdInput, importIdInput, { includeRaw = false } = {}) {
  const scope = scopeOf(rawScope); const projectId = Number(projectIdInput); const importId = Number(importIdInput);
  const fields = includeRaw ? '*' : `id,tenant_id,workspace_id,marketplace,project_id,kind,file_name,media_type,
    raw_hash,selected_sheet,header_signature_json,parser_id,parser_hash,imported_by,imported_at,length(raw_bytes) AS byte_length`;
  const row = await get(db, `SELECT ${fields} FROM research_imports WHERE id=? AND project_id=?
    AND tenant_id=? AND workspace_id=? AND marketplace=?`,
  [importId, projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
  if (!row) throw new CommerceSnapshotError('RESEARCH_IMPORT_NOT_FOUND', 404);
  if (includeRaw && crypto.createHash('sha256').update(Buffer.from(row.raw_bytes)).digest('hex') !== row.raw_hash) {
    throw new CommerceSnapshotError('RESEARCH_IMPORT_INTEGRITY_FAILURE', 500);
  }
  return Object.freeze({ ...row, headerSignature: JSON.parse(row.header_signature_json) });
}

module.exports = Object.freeze({ CommerceSnapshotError, appendIntelligenceSnapshot, appendResearchImport,
  appendResearchSnapshot, previewIntelligence, getCommerceState, getIntelligenceSnapshot, getResearchImport, snapshotJson });
