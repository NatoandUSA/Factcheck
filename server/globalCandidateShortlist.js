'use strict';

const crypto = require('node:crypto');
const { canonicalJson } = require('./revisionStore');
const { evaluateCandidate } = require('./globalCandidateEvaluation');

class GlobalCandidateShortlistError extends Error {
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
    throw new GlobalCandidateShortlistError('GLOBAL_CANDIDATE_SHORTLIST_SCOPE_INVALID', 400);
  }
}

function normalizeRequest(input) {
  const rawIds = Array.isArray(input?.candidateIds) ? input.candidateIds : null;
  if (!rawIds) throw new GlobalCandidateShortlistError('GLOBAL_CANDIDATE_SHORTLIST_IDS_REQUIRED', 422);
  const candidateIds = rawIds.map(Number);
  if (candidateIds.some(id => !Number.isInteger(id) || id < 1)) {
    throw new GlobalCandidateShortlistError('GLOBAL_CANDIDATE_SHORTLIST_ID_INVALID', 422);
  }
  if (new Set(candidateIds).size !== candidateIds.length) {
    throw new GlobalCandidateShortlistError('GLOBAL_CANDIDATE_SHORTLIST_DUPLICATE_ID', 422);
  }
  if (candidateIds.length > 5) throw new GlobalCandidateShortlistError('GLOBAL_CANDIDATE_SHORTLIST_MAX_FIVE', 422);
  const decisionNote = String(input?.decisionNote || '').trim();
  if (decisionNote.length > 2000) throw new GlobalCandidateShortlistError('GLOBAL_CANDIDATE_SHORTLIST_NOTE_TOO_LONG', 422);
  const idempotencyKey = String(input?.idempotencyKey || '').trim().toLowerCase();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    throw new GlobalCandidateShortlistError('GLOBAL_CANDIDATE_SHORTLIST_IDEMPOTENCY_KEY_INVALID', 422);
  }
  return Object.freeze({
    candidateIds: Object.freeze(candidateIds),
    decisionNote,
    idempotencyKey,
    requestHash: hash({ candidateIds, decisionNote })
  });
}

function mapEvidence(row) {
  return Object.freeze({
    id: row.id, evidenceHash: row.evidence_hash, sourceFamily: row.source_family,
    authorityClassification: row.authority_classification, evidenceTier: row.evidence_tier,
    sourceArtifactType: row.source_artifact_type, sourceArtifactId: row.source_artifact_id,
    sourceArtifactHash: row.source_artifact_hash,
    provenance: JSON.parse(row.provenance_json),
    commercialEvidence: JSON.parse(row.commercial_evidence_json),
    socialEvidence: JSON.parse(row.social_evidence_json),
    rawEvidence: JSON.parse(row.raw_evidence_json),
    createdAt: row.created_at
  });
}

async function loadCandidate(db, scope, candidateId) {
  const row = await get(db, 'SELECT * FROM global_candidates WHERE id=? AND tenant_id=? AND workspace_id=? AND marketplace=?',
    [candidateId, scope.tenantId, Number(scope.workspaceId), scope.marketplace]);
  if (!row) throw new GlobalCandidateShortlistError('GLOBAL_CANDIDATE_NOT_FOUND', 404, { candidateId });
  const evidenceRows = await all(db,
    'SELECT * FROM global_candidate_evidence WHERE candidate_id=? AND tenant_id=? AND workspace_id=? AND marketplace=? ORDER BY id',
    [candidateId, scope.tenantId, Number(scope.workspaceId), scope.marketplace]);
  if (!evidenceRows.length) throw new GlobalCandidateShortlistError('GLOBAL_CANDIDATE_EVIDENCE_REQUIRED', 409, { candidateId });
  return Object.freeze({
    id: row.id, candidateKey: row.candidate_key, normalizedPhrase: row.normalized_phrase,
    displayPhrase: row.display_phrase, groupingMethod: row.grouping_method,
    evidence: Object.freeze(evidenceRows.map(mapEvidence))
  });
}

function evidenceSnapshot(candidate) {
  const refs = candidate.evidence.map(item => Object.freeze({
    evidenceId: item.id, evidenceHash: item.evidenceHash, sourceFamily: item.sourceFamily,
    authorityClassification: item.authorityClassification, evidenceTier: item.evidenceTier,
    sourceArtifactType: item.sourceArtifactType, sourceArtifactId: item.sourceArtifactId ?? null,
    sourceArtifactHash: item.sourceArtifactHash
  }));
  return Object.freeze({
    refs: Object.freeze(refs),
    hash: hash({ candidateKey: candidate.candidateKey, evidenceRefs: refs })
  });
}

function evaluationSnapshot(evaluation) {
  return Object.freeze({
    evaluationPolicyVersion: evaluation.evaluationPolicyVersion,
    proofPolicyVersion: evaluation.proofPolicyVersion,
    researchReadiness: evaluation.researchReadiness,
    advisoryDisposition: evaluation.advisoryDisposition,
    commercialProof: Object.freeze({
      status: evaluation.commercialProof.status,
      blockerCodes: evaluation.commercialProof.blockerCodes || []
    }),
    evidenceSummary: evaluation.evidenceSummary,
    unknowns: evaluation.unknowns
  });
}

function mapShortlistRow(row) {
  if (!row) return null;
  return Object.freeze({
    shortlistId: row.id,
    snapshotHash: row.snapshot_hash,
    selectedCount: row.selected_count,
    selections: Object.freeze(JSON.parse(row.selections_json)),
    decisionNote: row.decision_note || '',
    createdBy: row.created_by,
    createdAt: row.created_at,
    replay: false
  });
}

async function createGlobalCandidateShortlist(db, scope, input, now = new Date()) {
  validateScope(scope);
  const request = normalizeRequest(input);
  const existing = await get(db,
    'SELECT * FROM global_candidate_shortlists WHERE tenant_id=? AND workspace_id=? AND marketplace=? AND idempotency_key=?',
    [scope.tenantId, Number(scope.workspaceId), scope.marketplace, request.idempotencyKey]);
  if (existing) {
    if (existing.request_hash !== request.requestHash) {
      throw new GlobalCandidateShortlistError('GLOBAL_CANDIDATE_SHORTLIST_IDEMPOTENCY_CONFLICT', 409,
        { shortlistId: existing.id });
    }
    return Object.freeze({ ...mapShortlistRow(existing), replay: true });
  }

  const selections = [];
  for (let index = 0; index < request.candidateIds.length; index += 1) {
    const candidate = await loadCandidate(db, scope, request.candidateIds[index]);
    const evaluation = evaluateCandidate(candidate, { marketplace: scope.marketplace, now });
    const evidence = evidenceSnapshot(candidate);
    selections.push(Object.freeze({
      ordinal: index + 1,
      candidateId: candidate.id,
      candidateKey: candidate.candidateKey,
      displayPhrase: candidate.displayPhrase,
      normalizedPhrase: candidate.normalizedPhrase,
      evidenceSnapshotHash: evidence.hash,
      evidenceRefs: evidence.refs,
      evaluation: evaluationSnapshot(evaluation)
    }));
  }

  const snapshotHash = hash({
    scope: { tenantId: scope.tenantId, workspaceId: Number(scope.workspaceId), marketplace: scope.marketplace },
    selections,
    decisionNote: request.decisionNote
  });
  const timestamp = (now instanceof Date ? now : new Date(now)).toISOString();
  const inserted = await run(db,
    'INSERT INTO global_candidate_shortlists ' +
    '(tenant_id,workspace_id,marketplace,idempotency_key,request_hash,snapshot_hash,selected_count,selections_json,decision_note,created_by,created_at) ' +
    'VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [scope.tenantId, Number(scope.workspaceId), scope.marketplace, request.idempotencyKey, request.requestHash,
      snapshotHash, selections.length, canonicalJson(selections), request.decisionNote || null,
      Number(scope.actorId), timestamp]);
  return Object.freeze({
    shortlistId: inserted.lastID, snapshotHash, selectedCount: selections.length,
    selections: Object.freeze(selections), decisionNote: request.decisionNote,
    createdBy: Number(scope.actorId), createdAt: timestamp, replay: false
  });
}

async function getGlobalCandidateShortlist(db, scope, shortlistId) {
  validateScope(scope);
  const id = Number(shortlistId);
  if (!Number.isInteger(id) || id < 1) throw new GlobalCandidateShortlistError('GLOBAL_CANDIDATE_SHORTLIST_ID_INVALID', 400);
  const row = await get(db,
    'SELECT * FROM global_candidate_shortlists WHERE id=? AND tenant_id=? AND workspace_id=? AND marketplace=?',
    [id, scope.tenantId, Number(scope.workspaceId), scope.marketplace]);
  if (!row) throw new GlobalCandidateShortlistError('GLOBAL_CANDIDATE_SHORTLIST_NOT_FOUND', 404);
  return mapShortlistRow(row);
}

async function getLatestGlobalCandidateShortlist(db, scope) {
  validateScope(scope);
  const row = await get(db,
    'SELECT * FROM global_candidate_shortlists WHERE tenant_id=? AND workspace_id=? AND marketplace=? ORDER BY id DESC LIMIT 1',
    [scope.tenantId, Number(scope.workspaceId), scope.marketplace]);
  return mapShortlistRow(row);
}

module.exports = Object.freeze({
  GlobalCandidateShortlistError,
  createGlobalCandidateShortlist,
  getGlobalCandidateShortlist,
  getLatestGlobalCandidateShortlist
});
