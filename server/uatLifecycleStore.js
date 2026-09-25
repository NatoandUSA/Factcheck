'use strict';

const { canonicalJson, hashBytes } = require('./revisionStore');

const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class UatLifecycleError extends Error {
  constructor(code, status = 400, details = {}) { super(code); this.code = code; this.status = status; this.details = details; }
}

const run = (db, sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function done(error) {
  if (error) reject(error); else resolve({ lastID: this.lastID, changes: this.changes });
}));
const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params,
  (error, row) => error ? reject(error) : resolve(row || null)));
const all = (db, sql, params = []) => new Promise((resolve, reject) => db.all(sql, params,
  (error, rows) => error ? reject(error) : resolve(rows || [])));

function scopeOf(input) {
  const scope = { tenantId: String(input?.tenantId || ''), workspaceId: Number(input?.workspaceId),
    marketplace: input?.marketplace, actorId: Number(input?.actorId), role: input?.role };
  if (!scope.tenantId || !Number.isInteger(scope.workspaceId) || scope.workspaceId < 1
    || scope.marketplace !== 'ETSY' || !Number.isInteger(scope.actorId) || scope.actorId < 1) {
    throw new UatLifecycleError('INVALID_SERVER_SCOPE', 500);
  }
  return Object.freeze(scope);
}

function positive(value, code) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new UatLifecycleError(code, 400);
  return number;
}

function idempotencyKey(value) {
  const key = String(value || '').toLowerCase();
  if (!KEY.test(key)) throw new UatLifecycleError('INVALID_IDEMPOTENCY_KEY', 400);
  return key;
}

function boundedReason(value) {
  const reason = String(value || '').trim();
  if (!reason || reason.length > 1000) throw new UatLifecycleError('UAT_COMPLETION_REASON_REQUIRED', 400);
  return reason;
}

function verifyExportPacket(row, listing, authorization) {
  if (!row) {
    throw new UatLifecycleError('UAT_COMPLETION_REQUIRES_CURRENT_EXACT_EXPORT', 409, {
      listingId: listing.id, listingRevisionId: listing.head_revision_id
    });
  }
  if (hashBytes(row.export_json) !== row.export_hash) {
    throw new UatLifecycleError('UAT_COMPLETION_EXPORT_INTEGRITY_FAILURE', 409, { listingId: listing.id });
  }
  let packet;
  try { packet = JSON.parse(row.export_json); }
  catch (_) { throw new UatLifecycleError('UAT_COMPLETION_EXPORT_INTEGRITY_FAILURE', 409, { listingId: listing.id }); }
  if (row.listing_revision_id !== listing.head_revision_id || listing.status !== 'MANAGER_APPROVED'
    || packet.event !== 'UAT_EXACT_AUDIT_EXPORT' || packet.uatOnly !== true
    || packet.marketplaceSubmissionAllowed !== false || packet.projectId !== listing.project_id
    || packet.listingId !== listing.id || packet.listingRevisionId !== listing.head_revision_id
    || Number(packet.lifecycleAuthorization?.id) !== authorization.id
    || packet.lifecycleAuthorization?.hash !== authorization.authorization_hash) {
    throw new UatLifecycleError('UAT_COMPLETION_REQUIRES_CURRENT_EXACT_EXPORT', 409, {
      listingId: listing.id, listingRevisionId: listing.head_revision_id
    });
  }
  return Object.freeze({ listingId: listing.id, listingRevisionId: listing.head_revision_id,
    exportId: row.id, exportHash: row.export_hash, packageHash: row.package_hash });
}

async function completeUatLifecycle(db, rawScope, projectIdInput, input = {}) {
  const scope = scopeOf(rawScope);
  if (scope.role !== 'OWNER') throw new UatLifecycleError('OWNER_UAT_COMPLETION_REQUIRED', 403);
  const projectId = positive(projectIdInput, 'PROJECT_CONTEXT_REQUIRED');
  const requestedExportId = positive(input.uatExportId, 'UAT_EXPORT_REQUIRED');
  const reason = boundedReason(input.reason);
  const key = idempotencyKey(input.idempotencyKey);
  const requestHash = hashBytes(canonicalJson({ operation: 'COMPLETE_UAT_APPROVAL_EXPORT', scope: {
    tenantId: scope.tenantId, workspaceId: scope.workspaceId, marketplace: scope.marketplace
  }, projectId, requestedExportId, reason }));

  const existing = await get(db, `SELECT * FROM project_uat_lifecycle_completions
    WHERE tenant_id=? AND workspace_id=? AND marketplace=? AND (project_id=? OR idempotency_key=?)`,
  [scope.tenantId, scope.workspaceId, scope.marketplace, projectId, key]);
  if (existing) {
    if (existing.project_id !== projectId || existing.completed_by !== scope.actorId || existing.request_hash !== requestHash) {
      throw new UatLifecycleError('UAT_COMPLETION_CONFLICT', 409);
    }
    return Object.freeze({ ...JSON.parse(existing.response_json), uatLifecycleCompletionId: existing.id, replay: true });
  }

  await run(db, 'BEGIN IMMEDIATE');
  try {
    const project = await get(db, `SELECT id FROM research_projects
      WHERE id=? AND tenant_id=? AND workspace_id=? AND marketplace=?`,
    [projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
    if (!project) throw new UatLifecycleError('PROJECT_NOT_FOUND', 404);
    const authorization = await get(db, `SELECT * FROM project_uat_lifecycle_authorizations
      WHERE project_id=? AND tenant_id=? AND workspace_id=? AND marketplace=?`,
    [projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
    if (!authorization) throw new UatLifecycleError('UAT_AUTHORIZATION_REQUIRED', 409);
    const inside = await get(db, `SELECT * FROM project_uat_lifecycle_completions
      WHERE tenant_id=? AND workspace_id=? AND marketplace=? AND (project_id=? OR idempotency_key=?)`,
    [scope.tenantId, scope.workspaceId, scope.marketplace, projectId, key]);
    if (inside) {
      if (inside.completed_by !== scope.actorId || inside.request_hash !== requestHash) {
        throw new UatLifecycleError('UAT_COMPLETION_CONFLICT', 409);
      }
      await run(db, 'COMMIT');
      return Object.freeze({ ...JSON.parse(inside.response_json), uatLifecycleCompletionId: inside.id, replay: true });
    }
    const listings = await all(db, `SELECT id,project_id,status,head_revision_id FROM listings
      WHERE project_id=? AND tenant_id=? AND workspace_id=? AND marketplace=? AND head_revision_id IS NOT NULL
      ORDER BY id`, [projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
    if (!listings.length) throw new UatLifecycleError('UAT_COMPLETION_LISTING_REQUIRED', 409);
    const certifiedExports = [];
    for (const listing of listings) {
      const exported = await get(db, `SELECT * FROM canonical_submission_exports
        WHERE project_id=? AND listing_id=? AND listing_revision_id=?
          AND tenant_id=? AND workspace_id=? AND marketplace=?
        ORDER BY id DESC LIMIT 1`, [projectId, listing.id, listing.head_revision_id,
        scope.tenantId, scope.workspaceId, scope.marketplace]);
      certifiedExports.push(verifyExportPacket(exported, listing, authorization));
    }
    if (!certifiedExports.some(item => item.exportId === requestedExportId)) {
      throw new UatLifecycleError('UAT_EXPORT_NOT_CURRENT_PROJECT_EVIDENCE', 409);
    }
    const evidenceJson = canonicalJson({ authorizationId: authorization.id,
      authorizationHash: authorization.authorization_hash, certifiedExports });
    const evidenceHash = hashBytes(evidenceJson);
    const completedAt = new Date().toISOString();
    const completionHash = hashBytes(canonicalJson({ tenantId: scope.tenantId, workspaceId: scope.workspaceId,
      marketplace: scope.marketplace, projectId, authorizationId: authorization.id,
      authorizationHash: authorization.authorization_hash, evidenceHash, reason,
      completedBy: scope.actorId, completedAt }));
    const response = Object.freeze({ projectId, uatLifecycleAuthorizationId: authorization.id,
      uatLifecycleCompletionHash: completionHash, evidenceHash, certifiedExports,
      completedAt, completedBy: scope.actorId, mode: 'MARKETPLACE_POLICY',
      uatActive: false, marketplacePolicyReevaluationRequired: true });
    const inserted = await run(db, `INSERT INTO project_uat_lifecycle_completions
      (tenant_id,workspace_id,marketplace,project_id,uat_lifecycle_authorization_id,
       uat_lifecycle_authorization_hash,evidence_json,evidence_hash,reason,completion_hash,
       idempotency_key,request_hash,response_json,completed_by,completed_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [scope.tenantId, scope.workspaceId, scope.marketplace,
      projectId, authorization.id, authorization.authorization_hash, evidenceJson, evidenceHash, reason,
      completionHash, key, requestHash, canonicalJson(response), scope.actorId, completedAt]);
    await run(db, `INSERT INTO audit_events
      (tenant_id,actor_id,workspace_id,marketplace,action,resource_type,resource_id,outcome,metadata)
      VALUES (?,?,?,?,?,?,?,?,?)`, [scope.tenantId, scope.actorId, scope.workspaceId, scope.marketplace,
      'project:complete-uat-approval-export', 'research_project', String(projectId), 'SUCCESS',
      JSON.stringify({ uatLifecycleCompletionId: inserted.lastID, completionHash, evidenceHash, completedAt })]);
    await run(db, 'COMMIT');
    return Object.freeze({ ...response, uatLifecycleCompletionId: inserted.lastID, replay: false });
  } catch (error) {
    try { await run(db, 'ROLLBACK'); } catch (_) {}
    throw error;
  }
}

module.exports = Object.freeze({ UatLifecycleError, completeUatLifecycle });
