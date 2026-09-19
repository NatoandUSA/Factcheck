const crypto = require('node:crypto');
const { clusterDescriptor } = require('../globalOpportunityBulkParser');

const ALLOWED_STATUSES = new Set(['DISCOVERED','QUALIFIED','WATCH','PROMOTE_TO_PROJECT','REJECTED','STALE','PROMOTED']);
const PROOF_TYPES = new Set(['MARKETPLACE_SALES','ESTIMATED_SALES','ESTIMATED_REVENUE','LISTING_SALES_PROXY','ORDER_EVIDENCE','NONE']);

function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function normalizeKeyword(value) {
  return text(value).normalize('NFKC').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}\s'-]+/gu, ' ')
    .replace(/\s+/g, ' ').trim();
}
function normalizeClusterKey(value) {
  const normalized = normalizeKeyword(value);
  return normalized ? normalized.replace(/\s+/g, '_').toUpperCase().slice(0, 160) : '';
}
function nowIso() { return new Date().toISOString(); }
function hash(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function onRun(error) {
    if (error) reject(error); else resolve({ lastID: this.lastID, changes: this.changes });
  }));
}
function get(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null)));
}
function all(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows || [])));
}

async function migrateGlobalOpportunityDiscovery(db) {
  await run(db, `CREATE TABLE IF NOT EXISTS keyword_clusters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    workspace_id INTEGER NOT NULL,
    marketplace TEXT NOT NULL CHECK(marketplace IN ('AMAZON','ETSY')),
    cluster_key TEXT NOT NULL,
    display_name TEXT NOT NULL,
    head_keyword TEXT NOT NULL,
    cluster_method TEXT NOT NULL CHECK(cluster_method IN ('PROVIDED','EXACT_NORMALIZED')),
    keyword_count INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id,workspace_id,marketplace,cluster_key)
  )`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_keyword_clusters_scope
    ON keyword_clusters(tenant_id,workspace_id,marketplace,updated_at DESC)`);

  await run(db, `CREATE TABLE IF NOT EXISTS global_keyword_candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_uid TEXT NOT NULL UNIQUE,
    tenant_id TEXT NOT NULL,
    workspace_id INTEGER NOT NULL,
    marketplace TEXT NOT NULL CHECK(marketplace IN ('AMAZON','ETSY')),
    keyword TEXT NOT NULL,
    normalized_keyword TEXT NOT NULL,
    cluster_id INTEGER NULL REFERENCES keyword_clusters(id),
    source TEXT NOT NULL,
    source_file_id TEXT NOT NULL DEFAULT '',
    search_volume REAL NULL,
    estimated_sales REAL NULL,
    estimated_revenue REAL NULL,
    avg_price REAL NULL,
    competition REAL NULL,
    reviews REAL NULL,
    rank_proxy REAL NULL,
    trend_velocity REAL NULL,
    social_momentum REAL NULL,
    cross_source_count INTEGER NOT NULL DEFAULT 1,
    proof_type TEXT NOT NULL DEFAULT 'NONE',
    proof_timestamp DATETIME NULL,
    raw_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'DISCOVERED'
      CHECK(status IN ('DISCOVERED','QUALIFIED','WATCH','PROMOTE_TO_PROJECT','REJECTED','STALE','PROMOTED')),
    promoted_project_id INTEGER NULL REFERENCES research_projects(id),
    created_by INTEGER NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id,workspace_id,marketplace,normalized_keyword,source,source_file_id)
  )`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_global_candidates_scope_status
    ON global_keyword_candidates(tenant_id,workspace_id,marketplace,status,updated_at DESC)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_global_candidates_cluster
    ON global_keyword_candidates(tenant_id,workspace_id,marketplace,cluster_id)`);

  await run(db, `CREATE TABLE IF NOT EXISTS global_opportunity_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_id INTEGER NOT NULL REFERENCES global_keyword_candidates(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL,
    workspace_id INTEGER NOT NULL,
    marketplace TEXT NOT NULL CHECK(marketplace IN ('AMAZON','ETSY')),
    marketplace_proof REAL NOT NULL DEFAULT 0,
    demand REAL NOT NULL DEFAULT 0,
    competition REAL NOT NULL DEFAULT 0,
    price_margin_potential REAL NOT NULL DEFAULT 0,
    trend_velocity REAL NOT NULL DEFAULT 0,
    cross_source_validation REAL NOT NULL DEFAULT 0,
    social_momentum REAL NOT NULL DEFAULT 0,
    freshness REAL NOT NULL DEFAULT 0,
    risk_penalty REAL NOT NULL DEFAULT 0,
    opportunity_score REAL NOT NULL DEFAULT 0,
    proof_gate TEXT NOT NULL CHECK(proof_gate IN ('PASS','WATCH_ONLY')),
    score_version TEXT NOT NULL DEFAULT 'GLOBAL_OPPORTUNITY_V1',
    explanation_json TEXT NOT NULL DEFAULT '{}',
    scored_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(candidate_id,score_version)
  )`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_global_scores_scope_rank
    ON global_opportunity_scores(tenant_id,workspace_id,marketplace,opportunity_score DESC)`);

  await run(db, `CREATE TABLE IF NOT EXISTS global_opportunity_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    workspace_id INTEGER NOT NULL,
    marketplace TEXT NOT NULL CHECK(marketplace IN ('AMAZON','ETSY')),
    candidate_id INTEGER NOT NULL REFERENCES global_keyword_candidates(id),
    actor_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    previous_status TEXT NULL,
    next_status TEXT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_global_events_candidate
    ON global_opportunity_events(tenant_id,workspace_id,marketplace,candidate_id,id DESC)`);
}

function proofGate(candidate) {
  const estimatedSales = finite(candidate.estimatedSales);
  const estimatedRevenue = finite(candidate.estimatedRevenue);
  // proofType is provenance metadata, never authority by itself.
  // Global qualification requires an observed positive commercial metric.
  const hasCommercialProof = (estimatedSales != null && estimatedSales > 0) ||
    (estimatedRevenue != null && estimatedRevenue > 0);
  return hasCommercialProof ? 'PASS' : 'WATCH_ONLY';
}

function freshnessScore(rawTimestamp, nowMs = Date.now()) {
  const value = Date.parse(String(rawTimestamp || ''));
  if (!Number.isFinite(value)) return 0;
  const ageMs = nowMs - value;
  if (ageMs < -5 * 60 * 1000) return 0;
  const ageDays = Math.max(0, ageMs) / 86400000;
  if (ageDays <= 7) return 5;
  if (ageDays <= 30) return 3;
  if (ageDays <= 90) return 1;
  return 0;
}

function competitionScore(raw) {
  const value = finite(raw);
  if (value == null || value < 0) return 5;
  if (value <= 1) return clamp(15 * (1 - value), 0, 15);
  if (value <= 100) return clamp(15 * (1 - (value / 100)), 0, 15);
  return clamp(15 / (1 + Math.log10(value)), 0, 15);
}

function scoreCandidate(candidate) {
  const gate = proofGate(candidate);
  const volume = finite(candidate.searchVolume);
  const sales = finite(candidate.estimatedSales);
  const revenue = finite(candidate.estimatedRevenue);
  const competitionRaw = finite(candidate.competition);
  const price = finite(candidate.avgPrice);
  const trend = finite(candidate.trendVelocity);
  const social = finite(candidate.socialMomentum);
  const cross = finite(candidate.crossSourceCount) ?? 1;
  const proof = gate === 'PASS'
    ? clamp(8 + (sales > 0 ? Math.log10(1 + sales) * 5 : 0) + (revenue > 0 ? Math.log10(1 + revenue) * 2 : 0), 0, 25)
    : 0;
  const demand = volume == null ? 0 : clamp(Math.log10(1 + Math.max(0, volume)) * 4, 0, 15);
  const competition = competitionScore(competitionRaw);
  const priceMargin = price == null ? 0 : clamp(price / 10, 0, 10);
  const trendScore = trend == null ? 0 : clamp(trend, 0, 10);
  const crossScore = clamp((cross - 1) * 2.5, 0, 10);
  const socialScore = social == null ? 0 : clamp(social, 0, 10);
  const freshness = freshnessScore(candidate.proofTimestamp);
  const riskPenalty = clamp(finite(candidate.riskPenalty) || 0, 0, 30);
  const raw = proof + demand + competition + priceMargin + trendScore + crossScore + socialScore + freshness - riskPenalty;
  const opportunityScore = gate === 'PASS' ? clamp(Math.round(raw * 10) / 10, 0, 100) : clamp(Math.min(39, raw), 0, 39);
  return Object.freeze({
    marketplaceProof: proof, demand, competition, priceMarginPotential: priceMargin,
    trendVelocity: trendScore, crossSourceValidation: crossScore, socialMomentum: socialScore,
    freshness, riskPenalty, opportunityScore, proofGate: gate,
    explanation: {
      rule: gate === 'PASS' ? 'commercial proof present; rank by corroborating signals' : 'no commercial proof; capped at WATCH_ONLY',
      socialIsNotSalesProof: true
    }
  });
}

function scopeParams(scope) {
  return [scope.tenantId, scope.workspaceId, scope.marketplace];
}

function projectMklCandidates(artifact, marketplace) {
  if (!artifact || typeof artifact !== 'object') return [];
  const expectedKind = marketplace === 'AMAZON' ? 'AMAZON_MASTER_KEYWORDS' : 'ETSY_MASTER_KEYWORDS';
  if (artifact.kind !== expectedKind || !Array.isArray(artifact.payload?.keywords)) return [];

  if (marketplace === 'AMAZON') {
    return artifact.payload.keywords
      .filter(item => ['OUTLIER_REVIEW', 'RESIDUE'].includes(String(item?.tier || '').toUpperCase()))
      .filter(item => finite(item?.metrics?.keywordSales) != null && finite(item.metrics.keywordSales) > 0)
      .map(item => {
        const cluster = clusterDescriptor(item.phrase);
        return {
          keyword: text(item.phrase),
          clusterKey: cluster.clusterKey || text(item.phrase),
          clusterLabel: cluster.clusterLabel || text(item.phrase),
          searchVolume: finite(item.metrics.searchVolume),
          estimatedSales: finite(item.metrics.keywordSales),
          competition: finite(item.metrics.competingProducts),
          trendVelocity: finite(item.metrics.trend),
          crossSourceCount: 1,
          proofType: 'MARKETPLACE_SALES',
          proofTimestamp: artifact.createdAt || null,
          origin: {
            kind: 'PROJECT_MKL_HARVEST',
            sourceProjectId: artifact.projectId,
            sourceArtifactId: artifact.id,
            sourceArtifactHash: artifact.artifactHash,
            sourceTier: item.tier,
            keywordId: item.keywordId,
            originalOpportunityScore: item.opportunityScore ?? null
          }
        };
      })
      .filter(item => item.keyword);
  }

  // Etsy REVIEW / PATTERN_ONLY can be globally interesting, but current Etsy
  // MKL metrics are demand/competition proxies rather than verified sales.
  // Harvest them as WATCH_ONLY candidates; never relabel proxy evidence as sales proof.
  return artifact.payload.keywords
    .filter(item => ['REVIEW', 'PATTERN_ONLY'].includes(String(item?.tier || '').toUpperCase()))
    .map(item => {
      const cluster = clusterDescriptor(item.phrase);
      return {
        keyword: text(item.phrase),
        clusterKey: cluster.clusterKey || text(item.phrase),
        clusterLabel: cluster.clusterLabel || text(item.phrase),
        searchVolume: null,
        estimatedSales: null,
        estimatedRevenue: null,
        competition: finite(item.competitionProxy),
        trendVelocity: null,
        crossSourceCount: Math.max(1, Math.trunc(finite(item.listingSpread) || 1)),
        proofType: 'NONE',
        proofTimestamp: artifact.createdAt || null,
        origin: {
          kind: 'PROJECT_MKL_HARVEST',
          sourceProjectId: artifact.projectId,
          sourceArtifactId: artifact.id,
          sourceArtifactHash: artifact.artifactHash,
          sourceTier: item.tier,
          keywordId: item.keywordId,
          demandProxy: finite(item.demandProxy),
          competitionProxy: finite(item.competitionProxy),
          listingSpread: finite(item.listingSpread),
          shopSpread: finite(item.shopSpread),
          originalOpportunityScore: item.opportunityScore ?? null
        }
      };
    })
    .filter(item => item.keyword);
}

async function ensureCluster(db, scope, candidate) {
  const provided = text(candidate.clusterKey || candidate.cluster);
  const clusterKey = normalizeClusterKey(provided || candidate.keyword);
  const method = provided ? 'PROVIDED' : 'EXACT_NORMALIZED';
  const displayName = text(candidate.clusterLabel) || provided || text(candidate.keyword);
  await run(db, `INSERT INTO keyword_clusters
    (tenant_id,workspace_id,marketplace,cluster_key,display_name,head_keyword,cluster_method,keyword_count)
    VALUES (?,?,?,?,?,?,?,0)
    ON CONFLICT(tenant_id,workspace_id,marketplace,cluster_key) DO UPDATE SET
      display_name=excluded.display_name, updated_at=CURRENT_TIMESTAMP`,
  [...scopeParams(scope), clusterKey, displayName, text(candidate.keyword), method]);
  return get(db, `SELECT * FROM keyword_clusters
    WHERE tenant_id=? AND workspace_id=? AND marketplace=? AND cluster_key=?`,
  [...scopeParams(scope), clusterKey]);
}

async function upsertScore(db, scope, candidateId, score) {
  await run(db, `INSERT INTO global_opportunity_scores
    (candidate_id,tenant_id,workspace_id,marketplace,marketplace_proof,demand,competition,
     price_margin_potential,trend_velocity,cross_source_validation,social_momentum,freshness,
     risk_penalty,opportunity_score,proof_gate,explanation_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(candidate_id,score_version) DO UPDATE SET
      marketplace_proof=excluded.marketplace_proof,demand=excluded.demand,competition=excluded.competition,
      price_margin_potential=excluded.price_margin_potential,trend_velocity=excluded.trend_velocity,
      cross_source_validation=excluded.cross_source_validation,social_momentum=excluded.social_momentum,
      freshness=excluded.freshness,risk_penalty=excluded.risk_penalty,
      opportunity_score=excluded.opportunity_score,proof_gate=excluded.proof_gate,
      explanation_json=excluded.explanation_json,scored_at=CURRENT_TIMESTAMP`,
  [candidateId, ...scopeParams(scope), score.marketplaceProof, score.demand, score.competition,
    score.priceMarginPotential, score.trendVelocity, score.crossSourceValidation, score.socialMomentum,
    score.freshness, score.riskPenalty, score.opportunityScore, score.proofGate, JSON.stringify(score.explanation)]);
}

async function reconcileCrossSourceScores(db, scope) {
  const rows = await all(db, `SELECT c.*,
      (SELECT COUNT(DISTINCT c2.source) FROM global_keyword_candidates c2
       WHERE c2.tenant_id=c.tenant_id AND c2.workspace_id=c.workspace_id AND c2.marketplace=c.marketplace
         AND c2.normalized_keyword=c.normalized_keyword) AS observed_source_count
    FROM global_keyword_candidates c
    WHERE c.tenant_id=? AND c.workspace_id=? AND c.marketplace=?`, scopeParams(scope));
  for (const row of rows) {
    const observed = Math.max(1, Number(row.observed_source_count || 1));
    if (Number(row.cross_source_count || 1) !== observed) {
      await run(db, `UPDATE global_keyword_candidates SET cross_source_count=?,updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND tenant_id=? AND workspace_id=? AND marketplace=?`,
      [observed, row.id, ...scopeParams(scope)]);
    }
    const score = scoreCandidate({
      searchVolume: row.search_volume,
      estimatedSales: row.estimated_sales,
      estimatedRevenue: row.estimated_revenue,
      avgPrice: row.avg_price,
      competition: row.competition,
      trendVelocity: row.trend_velocity,
      socialMomentum: row.social_momentum,
      crossSourceCount: observed,
      proofType: row.proof_type,
      proofTimestamp: row.proof_timestamp
    });
    await upsertScore(db, scope, row.id, score);
  }
}

async function importCandidates(db, scope, actorId, payload) {
  const source = text(payload.source);
  const sourceFileId = text(payload.sourceFileId);
  const input = Array.isArray(payload.candidates) ? payload.candidates : [];
  if (!source || input.length === 0 || input.length > 50000) {
    throw Object.assign(new Error('INVALID_GLOBAL_CANDIDATE_IMPORT'), { code: 'INVALID_GLOBAL_CANDIDATE_IMPORT', status: 400 });
  }
  const results = [];
  await run(db, 'BEGIN IMMEDIATE');
  try {
    for (const candidate of input) {
      const keyword = text(candidate?.keyword);
      const normalized = normalizeKeyword(keyword);
      if (!normalized) continue;
      const cluster = await ensureCluster(db, scope, candidate);
      const proofType = PROOF_TYPES.has(text(candidate.proofType).toUpperCase()) ? text(candidate.proofType).toUpperCase() : 'NONE';
      const uid = hash([scope.tenantId, scope.workspaceId, scope.marketplace, normalized, source, sourceFileId].join('|'));
      const score = scoreCandidate({ ...candidate, proofType });
      const status = score.proofGate === 'PASS' ? 'QUALIFIED' : 'WATCH';
      await run(db, `INSERT INTO global_keyword_candidates
        (candidate_uid,tenant_id,workspace_id,marketplace,keyword,normalized_keyword,cluster_id,source,source_file_id,
         search_volume,estimated_sales,estimated_revenue,avg_price,competition,reviews,rank_proxy,trend_velocity,
         social_momentum,cross_source_count,proof_type,proof_timestamp,raw_json,status,created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(tenant_id,workspace_id,marketplace,normalized_keyword,source,source_file_id) DO UPDATE SET
          keyword=excluded.keyword,cluster_id=excluded.cluster_id,search_volume=excluded.search_volume,
          estimated_sales=excluded.estimated_sales,estimated_revenue=excluded.estimated_revenue,
          avg_price=excluded.avg_price,competition=excluded.competition,reviews=excluded.reviews,
          rank_proxy=excluded.rank_proxy,trend_velocity=excluded.trend_velocity,
          social_momentum=excluded.social_momentum,cross_source_count=excluded.cross_source_count,
          proof_type=excluded.proof_type,proof_timestamp=excluded.proof_timestamp,raw_json=excluded.raw_json,
          status=CASE WHEN global_keyword_candidates.status IN ('PROMOTED','REJECTED') THEN global_keyword_candidates.status ELSE excluded.status END,
          updated_at=CURRENT_TIMESTAMP`,
      [uid, ...scopeParams(scope), keyword, normalized, cluster.id, source, sourceFileId,
        finite(candidate.searchVolume), finite(candidate.estimatedSales), finite(candidate.estimatedRevenue),
        finite(candidate.avgPrice), finite(candidate.competition), finite(candidate.reviews), finite(candidate.rankProxy),
        finite(candidate.trendVelocity), finite(candidate.socialMomentum), Math.max(1, Math.trunc(finite(candidate.crossSourceCount) || 1)),
        proofType, text(candidate.proofTimestamp) || null, JSON.stringify(candidate), status, actorId]);
      const row = await get(db, `SELECT id,status FROM global_keyword_candidates
        WHERE tenant_id=? AND workspace_id=? AND marketplace=? AND normalized_keyword=? AND source=? AND source_file_id=?`,
      [...scopeParams(scope), normalized, source, sourceFileId]);
      await upsertScore(db, scope, row.id, score);
      results.push({ candidateId: row.id, keyword, status: row.status, opportunityScore: score.opportunityScore, proofGate: score.proofGate });
    }
    await run(db, `UPDATE keyword_clusters SET keyword_count=(
      SELECT COUNT(*) FROM global_keyword_candidates c WHERE c.cluster_id=keyword_clusters.id
    ), updated_at=CURRENT_TIMESTAMP
    WHERE tenant_id=? AND workspace_id=? AND marketplace=?`, scopeParams(scope));
    await reconcileCrossSourceScores(db, scope);
    await run(db, 'COMMIT');
  } catch (error) {
    try { await run(db, 'ROLLBACK'); } catch (_) {}
    throw error;
  }
  return results;
}

async function listCandidates(db, scope, filters = {}) {
  const statuses = text(filters.status) && ALLOWED_STATUSES.has(text(filters.status).toUpperCase())
    ? [text(filters.status).toUpperCase()] : [];
  const limit = clamp(Math.trunc(finite(filters.limit) || 100), 1, 500);
  const params = scopeParams(scope);
  const whereStatus = statuses.length ? ' AND c.status=?' : '';
  if (statuses.length) params.push(statuses[0]);
  params.push(limit);
  return all(db, `SELECT c.*, k.cluster_key,k.display_name AS cluster_name,k.cluster_method,
      s.marketplace_proof,s.demand,s.competition AS competition_score,s.price_margin_potential,
      s.trend_velocity AS trend_score,s.cross_source_validation,s.social_momentum AS social_score,
      s.freshness,s.risk_penalty,s.opportunity_score,s.proof_gate,s.score_version,s.scored_at
    FROM global_keyword_candidates c
    LEFT JOIN keyword_clusters k ON k.id=c.cluster_id
    LEFT JOIN global_opportunity_scores s ON s.candidate_id=c.id AND s.score_version='GLOBAL_OPPORTUNITY_V1'
    WHERE c.tenant_id=? AND c.workspace_id=? AND c.marketplace=?${whereStatus}
    ORDER BY COALESCE(s.opportunity_score,0) DESC,c.updated_at DESC LIMIT ?`, params);
}


async function opportunitySummary(db, scope) {
  const rows = await all(db, `SELECT c.status,s.proof_gate,COUNT(*) AS count
    FROM global_keyword_candidates c
    LEFT JOIN global_opportunity_scores s ON s.candidate_id=c.id AND s.score_version='GLOBAL_OPPORTUNITY_V1'
    WHERE c.tenant_id=? AND c.workspace_id=? AND c.marketplace=?
    GROUP BY c.status,s.proof_gate`, scopeParams(scope));
  const clusters = await get(db, `SELECT COUNT(*) AS count FROM keyword_clusters
    WHERE tenant_id=? AND workspace_id=? AND marketplace=?`, scopeParams(scope));
  const candidates = await get(db, `SELECT COUNT(*) AS count FROM global_keyword_candidates
    WHERE tenant_id=? AND workspace_id=? AND marketplace=?`, scopeParams(scope));
  const byStatus = {}; const byProofGate = {};
  for (const row of rows) {
    byStatus[row.status || 'UNKNOWN'] = (byStatus[row.status || 'UNKNOWN'] || 0) + Number(row.count || 0);
    byProofGate[row.proof_gate || 'UNSCORED'] = (byProofGate[row.proof_gate || 'UNSCORED'] || 0) + Number(row.count || 0);
  }
  return {
    candidateCount: Number(candidates?.count || 0),
    clusterCount: Number(clusters?.count || 0),
    byStatus,
    byProofGate,
    qualifiedCount: Number(byStatus.QUALIFIED || 0),
    watchCount: Number(byStatus.WATCH || 0),
    promotedCount: Number(byStatus.PROMOTED || 0)
  };
}

async function watchlist(db, scope, filters = {}) {
  const limit = clamp(Math.trunc(finite(filters.limit) || 30), 1, 100);
  return all(db, `SELECT c.id,c.keyword,c.normalized_keyword,c.source,c.source_file_id,c.proof_type,
      c.search_volume,c.estimated_sales,c.estimated_revenue,c.avg_price,c.competition,c.trend_velocity,
      c.social_momentum,c.updated_at,k.cluster_key,k.display_name AS cluster_name,
      s.opportunity_score,s.proof_gate,s.marketplace_proof,s.demand,s.competition AS competition_score,
      s.trend_velocity AS trend_score,s.cross_source_validation,s.social_momentum AS social_score,s.freshness
    FROM global_keyword_candidates c
    LEFT JOIN keyword_clusters k ON k.id=c.cluster_id
    LEFT JOIN global_opportunity_scores s ON s.candidate_id=c.id AND s.score_version='GLOBAL_OPPORTUNITY_V1'
    WHERE c.tenant_id=? AND c.workspace_id=? AND c.marketplace=?
      AND c.status IN ('QUALIFIED','WATCH') AND c.status<>'REJECTED'
    ORDER BY CASE WHEN s.proof_gate='PASS' THEN 0 ELSE 1 END,
      COALESCE(s.opportunity_score,0) DESC,c.updated_at DESC LIMIT ?`,
    [...scopeParams(scope), limit]);
}

async function setCandidateStatus(db, scope, actorId, candidateId, nextStatus, metadata = {}) {
  const status = text(nextStatus).toUpperCase();
  if (!ALLOWED_STATUSES.has(status) || status === 'PROMOTED') {
    throw Object.assign(new Error('INVALID_GLOBAL_CANDIDATE_STATUS'), { code: 'INVALID_GLOBAL_CANDIDATE_STATUS', status: 400 });
  }
  const row = await get(db, `SELECT * FROM global_keyword_candidates WHERE id=? AND tenant_id=? AND workspace_id=? AND marketplace=?`,
    [candidateId, ...scopeParams(scope)]);
  if (!row) throw Object.assign(new Error('GLOBAL_CANDIDATE_NOT_FOUND'), { code: 'GLOBAL_CANDIDATE_NOT_FOUND', status: 404 });
  if (row.status === 'PROMOTED') throw Object.assign(new Error('GLOBAL_CANDIDATE_ALREADY_PROMOTED'), { code: 'GLOBAL_CANDIDATE_ALREADY_PROMOTED', status: 409 });
  await run(db, 'BEGIN IMMEDIATE');
  try {
    await run(db, `UPDATE global_keyword_candidates SET status=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND tenant_id=? AND workspace_id=? AND marketplace=?`,
    [status, candidateId, ...scopeParams(scope)]);
    await run(db, `INSERT INTO global_opportunity_events
      (tenant_id,workspace_id,marketplace,candidate_id,actor_id,action,previous_status,next_status,metadata_json)
      VALUES (?,?,?,?,?,'STATUS_CHANGE',?,?,?)`,
    [...scopeParams(scope), candidateId, actorId, row.status, status, JSON.stringify(metadata || {})]);
    await run(db, 'COMMIT');
  } catch (error) {
    try { await run(db, 'ROLLBACK'); } catch (_) {}
    throw error;
  }
  return { candidateId, previousStatus: row.status, status };
}

async function promoteToProject(db, scope, actorId, candidateId, payload = {}) {
  const candidate = await get(db, `SELECT c.*,k.display_name AS cluster_name FROM global_keyword_candidates c
    LEFT JOIN keyword_clusters k ON k.id=c.cluster_id
    WHERE c.id=? AND c.tenant_id=? AND c.workspace_id=? AND c.marketplace=?`,
  [candidateId, ...scopeParams(scope)]);
  if (!candidate) throw Object.assign(new Error('GLOBAL_CANDIDATE_NOT_FOUND'), { code: 'GLOBAL_CANDIDATE_NOT_FOUND', status: 404 });
  if (candidate.status === 'PROMOTED') return { candidateId, projectId: candidate.promoted_project_id, status: 'PROMOTED', replay: true };
  const score = await get(db, `SELECT * FROM global_opportunity_scores WHERE candidate_id=? AND score_version='GLOBAL_OPPORTUNITY_V1'`, [candidateId]);
  if (!score || score.proof_gate !== 'PASS') {
    throw Object.assign(new Error('GLOBAL_PROOF_OF_SALE_REQUIRED'), { code: 'GLOBAL_PROOF_OF_SALE_REQUIRED', status: 409 });
  }
  const projectName = text(payload.name) || candidate.cluster_name || candidate.keyword;
  const seedPhrase = candidate.cluster_name || candidate.keyword;
  if (!projectName || !seedPhrase) throw Object.assign(new Error('GLOBAL_PROMOTION_CONTEXT_INVALID'), { code: 'GLOBAL_PROMOTION_CONTEXT_INVALID', status: 409 });
  await run(db, 'BEGIN IMMEDIATE');
  try {
    const inserted = await run(db, `INSERT INTO research_projects
      (tenant_id,workspace_id,marketplace,name,seed_phrase,state,reference_asin,actor_id)
      VALUES (?,?,?,?,?,'EVIDENCE_INTAKE',?,?)`,
    [...scopeParams(scope), projectName, seedPhrase, text(payload.referenceAsin) || null, actorId]);
    await run(db, `UPDATE global_keyword_candidates SET status='PROMOTED',promoted_project_id=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND tenant_id=? AND workspace_id=? AND marketplace=? AND status<>'PROMOTED'`,
    [inserted.lastID, candidateId, ...scopeParams(scope)]);
    await run(db, `INSERT INTO global_opportunity_events
      (tenant_id,workspace_id,marketplace,candidate_id,actor_id,action,previous_status,next_status,metadata_json)
      VALUES (?,?,?,?,?,'CREATE_PROJECT',?,'PROMOTED',?)`,
    [...scopeParams(scope), candidateId, actorId, candidate.status, JSON.stringify({ projectId: inserted.lastID, seedPhrase, score: score.opportunity_score })]);
    await run(db, 'COMMIT');
    return { candidateId, projectId: inserted.lastID, status: 'PROMOTED', projectState: 'EVIDENCE_INTAKE', seedPhrase };
  } catch (error) {
    try { await run(db, 'ROLLBACK'); } catch (_) {}
    throw error;
  }
}

module.exports = Object.freeze({
  ALLOWED_STATUSES, normalizeKeyword, normalizeClusterKey, migrateGlobalOpportunityDiscovery,
  proofGate, freshnessScore, competitionScore, scoreCandidate, projectMklCandidates, reconcileCrossSourceScores, importCandidates, listCandidates, opportunitySummary, watchlist, setCandidateStatus, promoteToProject
});
