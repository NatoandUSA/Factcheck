'use strict';

const crypto = require('node:crypto');
const { canonicalJson } = require('./revisionStore');
const { fold } = require('./commerceIntelligence/text');

const GROUPING_METHOD = 'EXACT_NORMALIZED_V1';

class GlobalCandidatePoolError extends Error {
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

function hash(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : canonicalJson(value), 'utf8').digest('hex');
}

function normalizePhrase(value) {
  return fold(String(value || '').normalize('NFKC')).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function scopeKey(scope, normalizedPhrase) {
  return hash({ domain: 'GLOBAL_CANDIDATE_EXACT_V1', tenantId: scope.tenantId,
    workspaceId: Number(scope.workspaceId), marketplace: scope.marketplace, normalizedPhrase });
}

function validateScope(scope) {
  if (!scope?.tenantId || !Number.isInteger(Number(scope.workspaceId)) || !['AMAZON','ETSY'].includes(scope.marketplace)
      || !Number.isInteger(Number(scope.actorId))) {
    throw new GlobalCandidatePoolError('GLOBAL_CANDIDATE_SCOPE_INVALID', 400);
  }
}

function validateProjection(projection) {
  const normalizedPhrase = normalizePhrase(projection?.phrase);
  if (!normalizedPhrase || normalizedPhrase.length > 240) {
    throw new GlobalCandidatePoolError('GLOBAL_CANDIDATE_PHRASE_INVALID', 422);
  }
  if (!['OBSERVED_PUBLIC','MODELED_THIRD_PARTY','RESEARCH_ONLY','PROJECT_RESEARCH'].includes(projection.authorityClassification)) {
    throw new GlobalCandidatePoolError('GLOBAL_CANDIDATE_AUTHORITY_INVALID', 422);
  }
  if (!/^[a-f0-9]{64}$/.test(String(projection.sourceArtifactHash || ''))) {
    throw new GlobalCandidatePoolError('GLOBAL_CANDIDATE_SOURCE_HASH_INVALID', 422);
  }
  return normalizedPhrase;
}

function evidenceIdentity(scope, candidateKey, projection) {
  return hash({ domain: 'GLOBAL_CANDIDATE_EVIDENCE_V1', candidateKey,
    sourceFamily: projection.sourceFamily, authorityClassification: projection.authorityClassification,
    evidenceTier: projection.evidenceTier, sourceArtifactType: projection.sourceArtifactType,
    sourceArtifactId: projection.sourceArtifactId || null, sourceArtifactHash: projection.sourceArtifactHash,
    provenance: projection.provenance || {}, commercialEvidence: projection.commercialEvidence || {},
    socialEvidence: projection.socialEvidence || {}, rawEvidence: projection.rawEvidence || {} });
}

async function ingestCandidateProjections(db, scope, projections, now = new Date()) {
  validateScope(scope);
  if (!Array.isArray(projections) || projections.length === 0) {
    throw new GlobalCandidatePoolError('GLOBAL_CANDIDATE_PROJECTIONS_REQUIRED', 422);
  }
  const timestamp = (now instanceof Date ? now : new Date(now)).toISOString();
  const candidatesByKey = new Map();
  const evidenceByHash = new Map();
  for (const projection of projections) {
    const normalizedPhrase = validateProjection(projection);
    const candidateKey = scopeKey(scope, normalizedPhrase);
    if (!candidatesByKey.has(candidateKey)) candidatesByKey.set(candidateKey, { candidateKey, normalizedPhrase });
    const evidenceHash = evidenceIdentity(scope, candidateKey, projection);
    if (!evidenceByHash.has(evidenceHash)) evidenceByHash.set(evidenceHash, { candidateKey, evidenceHash, projection });
  }
  const candidateRecords = [...candidatesByKey.values()];
  const evidenceRecords = [...evidenceByHash.values()];
  const chunks = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size));
  await run(db, 'BEGIN IMMEDIATE');
  try {
    let candidateCreated = 0;
    for (const batch of chunks(candidateRecords, 80)) {
      const values = batch.map(() => '(?,?,?,?,?,?,?,?,?)').join(',');
      const params = batch.flatMap(item => [scope.tenantId, Number(scope.workspaceId), scope.marketplace,
        item.candidateKey, item.normalizedPhrase, item.normalizedPhrase, GROUPING_METHOD, Number(scope.actorId), timestamp]);
      candidateCreated += (await run(db, `INSERT OR IGNORE INTO global_candidates
        (tenant_id,workspace_id,marketplace,candidate_key,normalized_phrase,display_phrase,grouping_method,created_by,created_at)
        VALUES ${values}`, params)).changes;
    }
    const persistedCandidates = [];
    for (const batch of chunks(candidateRecords, 500)) {
      const keys = batch.map(item => item.candidateKey);
      persistedCandidates.push(...await all(db, `SELECT id,candidate_key,normalized_phrase,display_phrase,grouping_method
        FROM global_candidates WHERE tenant_id=? AND workspace_id=? AND marketplace=?
        AND candidate_key IN (${keys.map(() => '?').join(',')})`,
      [scope.tenantId, Number(scope.workspaceId), scope.marketplace, ...keys]));
    }
    const candidateByKey = new Map(persistedCandidates.map(row => [row.candidate_key, row]));
    if (candidateByKey.size !== candidateRecords.length) throw new GlobalCandidatePoolError('GLOBAL_CANDIDATE_PERSIST_FAILED', 500);
    let evidenceCreated = 0;
    for (const batch of chunks(evidenceRecords, 40)) {
      const values = batch.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
      const params = batch.flatMap(item => {
        const projection = item.projection;
        return [candidateByKey.get(item.candidateKey).id, scope.tenantId, Number(scope.workspaceId), scope.marketplace,
          item.evidenceHash, projection.sourceFamily, projection.authorityClassification, projection.evidenceTier,
          projection.sourceArtifactType, projection.sourceArtifactId == null ? null : String(projection.sourceArtifactId),
          projection.sourceArtifactHash, canonicalJson(projection.provenance || {}),
          canonicalJson(projection.commercialEvidence || {}), canonicalJson(projection.socialEvidence || {}),
          canonicalJson(projection.rawEvidence || {}), Number(scope.actorId), timestamp];
      });
      evidenceCreated += (await run(db, `INSERT OR IGNORE INTO global_candidate_evidence
        (candidate_id,tenant_id,workspace_id,marketplace,evidence_hash,source_family,authority_classification,
         evidence_tier,source_artifact_type,source_artifact_id,source_artifact_hash,provenance_json,
         commercial_evidence_json,social_evidence_json,raw_evidence_json,created_by,created_at)
        VALUES ${values}`, params)).changes;
    }
    await run(db, 'COMMIT');
    const candidateSample = evidenceRecords.slice(0, 20).map(item => ({ ...candidateByKey.get(item.candidateKey),
      evidenceHash: item.evidenceHash, sourceFamily: item.projection.sourceFamily,
      authorityClassification: item.projection.authorityClassification }));
    return { candidateCreated, candidateReused: candidateRecords.length - candidateCreated,
      evidenceCreated, evidenceReused: evidenceRecords.length - evidenceCreated,
      candidateCount: candidateRecords.length, candidateSample };
  } catch (error) {
    try { await run(db, 'ROLLBACK'); } catch (_) {}
    throw error;
  }
}

async function listGlobalCandidates(db, scope, options = {}) {
  validateScope(scope);
  const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 500);
  const rows = await all(db, `SELECT * FROM global_candidates
    WHERE tenant_id=? AND workspace_id=? AND marketplace=? ORDER BY normalized_phrase,id LIMIT ?`,
  [scope.tenantId, Number(scope.workspaceId), scope.marketplace, limit]);
  if (!rows.length) return [];
  const ids = rows.map(row => row.id);
  const placeholders = ids.map(() => '?').join(',');
  const evidence = await all(db, `SELECT * FROM global_candidate_evidence
    WHERE candidate_id IN (${placeholders}) ORDER BY candidate_id,id`, ids);
  const byCandidate = new Map();
  for (const row of evidence) {
    const mapped = { id: row.id, evidenceHash: row.evidence_hash, sourceFamily: row.source_family,
      authorityClassification: row.authority_classification, evidenceTier: row.evidence_tier,
      sourceArtifactType: row.source_artifact_type, sourceArtifactId: row.source_artifact_id,
      sourceArtifactHash: row.source_artifact_hash, provenance: JSON.parse(row.provenance_json),
      commercialEvidence: JSON.parse(row.commercial_evidence_json), socialEvidence: JSON.parse(row.social_evidence_json),
      rawEvidence: JSON.parse(row.raw_evidence_json), createdAt: row.created_at };
    if (!byCandidate.has(row.candidate_id)) byCandidate.set(row.candidate_id, []);
    byCandidate.get(row.candidate_id).push(mapped);
  }
  return rows.map(row => {
    const candidateEvidence = byCandidate.get(row.id) || [];
    const sourceFamilies = [...new Set(candidateEvidence.map(item => item.sourceFamily))];
    const hasCommercialEvidence = candidateEvidence.some(item => Object.keys(item.commercialEvidence).length > 0
      && item.authorityClassification !== 'RESEARCH_ONLY');
    const hasSocialEvidence = candidateEvidence.some(item => Object.keys(item.socialEvidence).length > 0);
    return { id: row.id, candidateKey: row.candidate_key, normalizedPhrase: row.normalized_phrase,
      displayPhrase: row.display_phrase, groupingMethod: row.grouping_method, createdAt: row.created_at,
      sourceFamilies, completeness: { evidenceCount: candidateEvidence.length,
        sourceFamilyCount: sourceFamilies.length, hasCommercialEvidence, hasSocialEvidence,
        unknowns: hasCommercialEvidence ? [] : ['COMMERCIAL_PROOF_NOT_PRESENT'] }, evidence: candidateEvidence };
  });
}

module.exports = Object.freeze({ GROUPING_METHOD, GlobalCandidatePoolError, normalizePhrase,
  ingestCandidateProjections, listGlobalCandidates });
