'use strict';

const crypto = require('node:crypto');
const { canonicalJson } = require('./revisionStore');
const { evaluateCandidate } = require('./globalCandidateEvaluation');

const PROMOTION_ARTIFACT_KIND = 'GLOBAL_CANDIDATE_PROMOTION_V1';
const PROJECT_EVIDENCE_SOURCE = 'GLOBAL_CANDIDATE_POOL';

class GlobalCandidatePromotionError extends Error {
  constructor(code, status = 400, details = {}) {
    super(code); this.code = code; this.status = status; this.details = details;
  }
}

const run = (db, sql, params = []) => new Promise((resolve, reject) =>
  db.run(sql, params, function done(error) { error ? reject(error) : resolve({ changes: this.changes, lastID: this.lastID }); }));
const get = (db, sql, params = []) => new Promise((resolve, reject) =>
  db.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null)));
const all = (db, sql, params = []) => new Promise((resolve, reject) =>
  db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));

const hash = value => crypto.createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');

function validateScope(scope) {
  if (!scope?.tenantId || !Number.isInteger(Number(scope.workspaceId))
      || !['AMAZON','ETSY'].includes(scope.marketplace) || !Number.isInteger(Number(scope.actorId))) {
    throw new GlobalCandidatePromotionError('GLOBAL_CANDIDATE_PROMOTION_SCOPE_INVALID', 400);
  }
}

function normalizeRequest(input) {
  const candidateId = Number(input?.candidateId);
  const projectName = String(input?.projectName || '').trim();
  const idempotencyKey = String(input?.idempotencyKey || '').trim().toLowerCase();
  if (!Number.isInteger(candidateId) || candidateId < 1) {
    throw new GlobalCandidatePromotionError('GLOBAL_CANDIDATE_ID_INVALID', 400);
  }
  if (!projectName || projectName.length > 160) {
    throw new GlobalCandidatePromotionError('GLOBAL_CANDIDATE_PROJECT_NAME_REQUIRED', 422);
  }
  if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    throw new GlobalCandidatePromotionError('GLOBAL_CANDIDATE_PROMOTION_IDEMPOTENCY_KEY_INVALID', 422);
  }
  return Object.freeze({ candidateId, projectName, idempotencyKey,
    requestHash: hash({ candidateId, projectName }) });
}

function mapEvidence(row) {
  return Object.freeze({
    id: row.id, evidenceHash: row.evidence_hash, sourceFamily: row.source_family,
    authorityClassification: row.authority_classification, evidenceTier: row.evidence_tier,
    sourceArtifactType: row.source_artifact_type, sourceArtifactId: row.source_artifact_id,
    sourceArtifactHash: row.source_artifact_hash, provenance: JSON.parse(row.provenance_json),
    commercialEvidence: JSON.parse(row.commercial_evidence_json), socialEvidence: JSON.parse(row.social_evidence_json),
    rawEvidence: JSON.parse(row.raw_evidence_json), createdAt: row.created_at
  });
}

async function loadCandidate(db, scope, candidateId) {
  const row = await get(db, `SELECT * FROM global_candidates
    WHERE id=? AND tenant_id=? AND workspace_id=? AND marketplace=?`,
  [candidateId, scope.tenantId, Number(scope.workspaceId), scope.marketplace]);
  if (!row) throw new GlobalCandidatePromotionError('GLOBAL_CANDIDATE_NOT_FOUND', 404);
  const evidenceRows = await all(db, `SELECT * FROM global_candidate_evidence
    WHERE candidate_id=? AND tenant_id=? AND workspace_id=? AND marketplace=? ORDER BY id`,
  [candidateId, scope.tenantId, Number(scope.workspaceId), scope.marketplace]);
  if (!evidenceRows.length) throw new GlobalCandidatePromotionError('GLOBAL_CANDIDATE_EVIDENCE_REQUIRED', 409);
  return Object.freeze({
    id: row.id, candidateKey: row.candidate_key, normalizedPhrase: row.normalized_phrase,
    displayPhrase: row.display_phrase, groupingMethod: row.grouping_method,
    createdAt: row.created_at, evidence: Object.freeze(evidenceRows.map(mapEvidence))
  });
}

function evidenceSnapshot(candidate) {
  const refs = candidate.evidence.map(item => Object.freeze({
    evidenceId: item.id, evidenceHash: item.evidenceHash, sourceFamily: item.sourceFamily,
    authorityClassification: item.authorityClassification, evidenceTier: item.evidenceTier,
    sourceArtifactType: item.sourceArtifactType, sourceArtifactId: item.sourceArtifactId ?? null,
    sourceArtifactHash: item.sourceArtifactHash
  }));
  return Object.freeze({ refs: Object.freeze(refs),
    hash: hash({ candidateKey: candidate.candidateKey, evidenceRefs: refs }) });
}

function evaluationSnapshot(evaluation) {
  return Object.freeze({
    evaluationPolicyVersion: evaluation.evaluationPolicyVersion,
    proofPolicyVersion: evaluation.proofPolicyVersion,
    advisoryDisposition: evaluation.advisoryDisposition,
    commercialProof: Object.freeze({ status: evaluation.commercialProof.status,
      blockerCodes: evaluation.commercialProof.blockerCodes || [] }),
    evidenceSummary: evaluation.evidenceSummary,
    unknowns: evaluation.unknowns
  });
}

async function replayResult(db, row, reason) {
  const project = await get(db, 'SELECT state FROM research_projects WHERE id=?', [row.project_id]);
  return Object.freeze({
    projectId: row.project_id, projectEvidenceId: row.project_evidence_id,
    createdState: 'EVIDENCE_INTAKE', projectState: project?.state || null,
    candidateId: row.candidate_id, candidateKey: row.candidate_key,
    evidenceSnapshotHash: row.evidence_snapshot_hash, replay: true, replayReason: reason
  });
}

async function existingReceiptByIdempotency(db, scope, request) {
  const row = await get(db, `SELECT * FROM global_candidate_promotions
    WHERE tenant_id=? AND workspace_id=? AND marketplace=? AND idempotency_key=?`,
  [scope.tenantId, Number(scope.workspaceId), scope.marketplace, request.idempotencyKey]);
  if (!row) return null;
  if (row.candidate_id !== request.candidateId || row.request_hash !== request.requestHash) {
    throw new GlobalCandidatePromotionError('GLOBAL_CANDIDATE_PROMOTION_IDEMPOTENCY_CONFLICT', 409,
      { projectId: row.project_id });
  }
  return row;
}

async function existingReceiptByCandidate(db, scope, request) {
  const row = await get(db, `SELECT * FROM global_candidate_promotions
    WHERE tenant_id=? AND workspace_id=? AND marketplace=? AND candidate_id=?`,
  [scope.tenantId, Number(scope.workspaceId), scope.marketplace, request.candidateId]);
  if (!row) return null;
  throw new GlobalCandidatePromotionError('GLOBAL_CANDIDATE_ALREADY_PROMOTED', 409,
    { projectId: row.project_id, promotionId: row.id });
}

async function createEvidenceIntakeProject(db, scope, projectName, seedPhrase) {
  const workspace = await run(db, `UPDATE workspaces
    SET seller_account_label=COALESCE(seller_account_label,'workspace:' || id), site=COALESCE(site,'US')
    WHERE id=? AND tenant_id=? AND marketplace=?`,
  [Number(scope.workspaceId), scope.tenantId, scope.marketplace]);
  if (workspace.changes !== 1) throw new GlobalCandidatePromotionError('WORKSPACE_NOT_FOUND', 404);
  const result = await run(db, `INSERT INTO research_projects
    (tenant_id,workspace_id,marketplace,name,seed_phrase,state,reference_asin,actor_id)
    VALUES (?,?,?,?,?,'EVIDENCE_INTAKE',NULL,?)`,
  [scope.tenantId, Number(scope.workspaceId), scope.marketplace, projectName, seedPhrase, Number(scope.actorId)]);
  return result.lastID;
}

async function promoteGlobalCandidateToProject(db, scope, input, now = new Date()) {
  validateScope(scope);
  const request = normalizeRequest(input);
  const replay = await existingReceiptByIdempotency(db, scope, request);
  if (replay) return replayResult(db, replay, 'IDEMPOTENCY_REPLAY');
  await existingReceiptByCandidate(db, scope, request);

  await run(db, 'BEGIN IMMEDIATE');
  try {
    const lockedReplay = await existingReceiptByIdempotency(db, scope, request);
    if (lockedReplay) {
      await run(db, 'COMMIT');
      return replayResult(db, lockedReplay, 'IDEMPOTENCY_REPLAY');
    }
    await existingReceiptByCandidate(db, scope, request);

    const candidate = await loadCandidate(db, scope, request.candidateId);
    const evaluation = evaluateCandidate(candidate, { marketplace: scope.marketplace, now });
    if (evaluation.advisoryDisposition.value !== 'PROMOTE') {
      throw new GlobalCandidatePromotionError('GLOBAL_CANDIDATE_NOT_PROMOTABLE', 409, {
        candidateId: candidate.id, advisoryDisposition: evaluation.advisoryDisposition.value,
        reasonCodes: evaluation.advisoryDisposition.reasonCodes
      });
    }

    const evidence = evidenceSnapshot(candidate);
    const evalSnapshot = evaluationSnapshot(evaluation);
    const projectId = await createEvidenceIntakeProject(db, scope, request.projectName, candidate.displayPhrase);
    const metadata = Object.freeze({
      kind: PROMOTION_ARTIFACT_KIND, authority: 'NONE', allowedUse: 'RESEARCH_ONLY',
      candidate: Object.freeze({ id: candidate.id, candidateKey: candidate.candidateKey,
        normalizedPhrase: candidate.normalizedPhrase, displayPhrase: candidate.displayPhrase,
        groupingMethod: candidate.groupingMethod }),
      evidenceSnapshotHash: evidence.hash, evidenceRefs: evidence.refs, evaluation: evalSnapshot
    });
    const projectEvidence = await run(db, `INSERT INTO research_evidence
      (tenant_id,workspace_id,marketplace,project_id,seed_phrase,source,actor_id,evidence_state,metadata)
      VALUES (?,?,?,?,?,?,?,'OBSERVED',?)`,
    [scope.tenantId, Number(scope.workspaceId), scope.marketplace, projectId, candidate.displayPhrase,
      PROJECT_EVIDENCE_SOURCE, Number(scope.actorId), canonicalJson(metadata)]);

    const timestamp = (now instanceof Date ? now : new Date(now)).toISOString();
    const promotion = await run(db, `INSERT INTO global_candidate_promotions
      (tenant_id,workspace_id,marketplace,candidate_id,candidate_key,project_id,project_evidence_id,
       idempotency_key,request_hash,evidence_snapshot_hash,evidence_refs_json,evaluation_json,created_by,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [scope.tenantId, Number(scope.workspaceId), scope.marketplace, candidate.id, candidate.candidateKey,
      projectId, projectEvidence.lastID, request.idempotencyKey, request.requestHash, evidence.hash,
      canonicalJson(evidence.refs), canonicalJson(evalSnapshot), Number(scope.actorId), timestamp]);

    await run(db, 'COMMIT');
    return Object.freeze({
      promotionId: promotion.lastID, projectId, projectEvidenceId: projectEvidence.lastID,
      createdState: 'EVIDENCE_INTAKE', projectState: 'EVIDENCE_INTAKE',
      candidateId: candidate.id, candidateKey: candidate.candidateKey,
      evidenceSnapshotHash: evidence.hash, advisoryDisposition: 'PROMOTE',
      commercialProofStatus: evaluation.commercialProof.status, replay: false
    });
  } catch (error) {
    try { await run(db, 'ROLLBACK'); } catch (_) {}
    throw error;
  }
}

module.exports = Object.freeze({
  PROMOTION_ARTIFACT_KIND, PROJECT_EVIDENCE_SOURCE, GlobalCandidatePromotionError,
  promoteGlobalCandidateToProject
});
