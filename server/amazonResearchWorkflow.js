'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const { canonicalJson, hashBytes } = require('./revisionStore');
const { getResearchImport, getResearchSnapshot } = require('./commerceSnapshotStore');
const { appendArtifact, getArtifact } = require('./commerceWorkflowArtifactStore');
const amazonResearchAdapter = require('./commerceIntelligence/amazonResearchAdapter');
const { selectAsinBatches } = require('./commerceIntelligence/asinSelector');
const { fold, contentTokens } = require('./commerceIntelligence/text');

const ENGINE_ID = 'amazon-research-to-mkl-v2';
const TIERS = new Set(['PRIMARY', 'SECONDARY', 'LONG_TAIL', 'OUTLIER_REVIEW', 'RESIDUE', 'EXCLUDED']);
const ROOT_STOP = new Set(['the', 'and', 'for', 'with', 'from', 'para', 'con', 'del', 'las', 'los', 'una', 'uno', 'de', 'la', 'el', 'a', 'to', 'of']);

class AmazonWorkflowError extends Error {
  constructor(code, status = 400, details = {}) { super(code); this.code = code; this.status = status; this.details = details; }
}

function fileHash(id, files) {
  const hash = crypto.createHash('sha256').update(`${id}\0`);
  for (const file of files) hash.update(file.split(/[\\/]/).pop()).update('\0').update(fs.readFileSync(file)).update('\0');
  return hash.digest('hex');
}

function bindings() {
  return Object.freeze({
    engine: fileHash(ENGINE_ID, [__filename, require.resolve('./commerceWorkflowArtifactStore')]),
    parser: amazonResearchAdapter.parserBindingHash(),
    normalization: fileHash('amazon-research-normalization-v2', [require.resolve('./commerceIntelligence/storedResearch')]),
    scoring: fileHash('amazon-mkl-scoring-v2', [__filename, require.resolve('./commerceIntelligence/asinSelector')]),
    policy: null
  });
}

function uniqueIds(values, code) {
  const ids = [...new Set((Array.isArray(values) ? values : [values]).map(Number).filter(Number.isInteger))];
  if (!ids.length || ids.some(id => id < 1) || ids.length > 100) throw new AmazonWorkflowError(code);
  return ids;
}

async function previewAsinPlan(db, scope, projectId, input, screen) {
  if (scope.marketplace !== 'AMAZON') throw new AmazonWorkflowError('AMAZON_PROJECT_REQUIRED');
  const importIds = uniqueIds(input.xrayImportIds, 'AMAZON_XRAY_IMPORT_REQUIRED');
  const imports = await Promise.all(importIds.map(id => getResearchImport(db, scope, projectId, id, { includeRaw: true })));
  if (imports.some(item => item.kind !== 'AMAZON_XRAY')) throw new AmazonWorkflowError('AMAZON_XRAY_IMPORT_REQUIRED');
  const built = await amazonResearchAdapter.buildSnapshot(imports);
  const byAsin = new Map();
  for (const item of built.observations.xray || []) {
    const previous = byAsin.get(item.asin);
    if (!previous || Number(item.asinSales || -1) > Number(previous.asinSales || -1)) byAsin.set(item.asin, item);
  }
  const candidates = [...byAsin.values()];
  const selectedAsins = [...new Set((input.selectedAsins || []).map(value => String(value).trim().toUpperCase()).filter(Boolean))];
  if (selectedAsins.length > 30 || selectedAsins.some(value => !/^[A-Z0-9]{10}$/.test(value))) {
    throw new AmazonWorkflowError('INVALID_STAFF_ASIN_SELECTION');
  }
  const absentAsins = selectedAsins.filter(asin => !byAsin.has(asin));
  if (absentAsins.length) throw new AmazonWorkflowError('SELECTED_ASIN_NOT_IN_XRAY', 409, { absentAsins });
  const selection = selectAsinBatches(selectedAsins.length ? selectedAsins.map(asin => byAsin.get(asin)) : candidates, {
    anchors: selectedAsins.length ? [] : [input.seedPhrase].filter(Boolean), library: true,
    screen, batchSize: 10, maxPerBrand: selectedAsins.length ? 10 : 2, excludeOwnAsins: false
  });
  const selectedBatches = selectedAsins.length ? selection.batches.slice(0, 3) : [];
  return {
    zeroWrite: true,
    dependencies: { xrayImports: imports.map(item => ({ id: item.id, rawHash: item.raw_hash,
      parserId: item.parser_id, parserHash: item.parser_hash })) },
    payload: {
      seedPhrase: String(input.seedPhrase || ''), selectionMode: selectedAsins.length ? 'STAFF_SELECTED' : 'ENGINE_COHORTS',
      cohorts: selection.cohorts, selectedAsins, selectedBatches,
      candidatePool: candidates.map(item => ({ asin: item.asin, title: item.title, brand: item.brand,
        seller: item.seller, price: item.price, asinSales: item.asinSales, asinRevenue: item.asinRevenue,
        bsr: item.bsr, reviews: item.reviews, reviewVelocity: item.reviewVelocity,
        sellerAgeMonths: item.sellerAgeMonths, creationDate: item.creationDate })),
      rejected: selection.rejected
    },
    accounting: {
      inputRows: built.accounting.xrayObservationCount, uniqueAsinCandidates: candidates.length,
      duplicateAsinRows: built.accounting.xrayObservationCount - candidates.length,
      eligibleCandidateCount: selection.acceptedCount, rejectedCandidateCount: selection.rejectedCount,
      cohortCount: selection.cohorts.length, selectedAsinCount: selectedAsins.length, droppedCandidateCount: 0
    },
    bindings: bindings()
  };
}

async function saveAsinPlan(db, scope, projectId, input, screen) {
  const preview = await previewAsinPlan(db, scope, projectId, input, screen);
  return appendArtifact(db, scope, projectId, {
    kind: 'AMAZON_ASIN_BATCH_PLAN', expectedHeadArtifactId: input.expectedHeadArtifactId,
    idempotencyKey: input.idempotencyKey, changeReason: input.changeReason,
    dependencies: preview.dependencies, payload: preview.payload, accounting: preview.accounting, bindings: preview.bindings
  });
}

function number(value) { return value == null || !Number.isFinite(Number(value)) ? null : Number(value); }
function log(value) { return value == null ? 0 : Math.log10(Math.max(0, value) + 1); }
function normalize(values, transform = value => value) {
  const mapped = values.map(value => value == null ? null : transform(value));
  const finite = mapped.filter(value => Number.isFinite(value)); const max = Math.max(1, ...finite);
  return mapped.map(value => value == null ? 0 : value / max);
}

function buildRoots(keywords) {
  const roots = new Map();
  for (const item of keywords) {
    const seen = new Set(contentTokens(item.phrase).filter(token => token.length > 2 && !ROOT_STOP.has(token)));
    for (const token of seen) {
      const current = roots.get(token) || { root: token, keywordCount: 0, totalSearchVolume: 0 };
      current.keywordCount += 1; current.totalSearchVolume += number(item.searchVolume) || 0; roots.set(token, current);
    }
  }
  return [...roots.values()].sort((a, b) => b.keywordCount - a.keywordCount
    || b.totalSearchVolume - a.totalSearchVolume || a.root.localeCompare(b.root)).slice(0, 100);
}

function masterKeywordPayload(research, seedPhrase, decisions = []) {
  const source = research.observations?.cerebro?.keywords || [];
  if (!source.length) throw new AmazonWorkflowError('CEREBRO_KEYWORDS_REQUIRED', 409);
  if (source.length > 10000) throw new AmazonWorkflowError('MASTER_KEYWORD_ROW_LIMIT', 413, { rowCount: source.length, limit: 10000 });
  const searchVolume = normalize(source.map(item => number(item.searchVolume)), log);
  const keywordSales = normalize(source.map(item => number(item.keywordSales)), log);
  const iq = normalize(source.map(item => number(item.iq)), log);
  const coverage = normalize(source.map(item => number(item.rankingCompetitorsCount)), value => value);
  const rankQuality = source.map(item => {
    const rank = number(item.positionRank ?? item.competitorRankAverage);
    return rank == null ? 0 : 1 / Math.max(1, rank);
  });
  const maxRankQuality = Math.max(1 / 1000, ...rankQuality);
  const decisionMap = new Map(decisions.map(item => [fold(item.phrase || '').trim(), item]));
  const seedTokens = new Set(contentTokens(seedPhrase));
  const scored = source.map((item, index) => {
    const phraseTokens = contentTokens(item.phrase); const seedOverlap = seedTokens.size
      ? phraseTokens.filter(token => seedTokens.has(token)).length / seedTokens.size : 0;
    const metricScore = 0.34 * searchVolume[index] + 0.2 * keywordSales[index] + 0.14 * iq[index]
      + 0.12 * coverage[index] + 0.1 * (rankQuality[index] / maxRankQuality) + 0.1 * seedOverlap;
    const missingCoreMetrics = ['searchVolume', 'keywordSales', 'positionRank', 'rankingCompetitorsCount']
      .filter(field => number(item[field]) == null);
    return { source: item, seedOverlap, score: Number(metricScore.toFixed(6)), missingCoreMetrics };
  }).sort((a, b) => b.score - a.score || (number(b.source.searchVolume) || -1) - (number(a.source.searchVolume) || -1)
    || fold(a.source.phrase).localeCompare(fold(b.source.phrase)));
  const roots = buildRoots(source); const rootSet = new Set(roots.slice(0, 20).map(item => item.root));
  const keywords = scored.map((item, index) => {
    const key = fold(item.source.phrase).trim(); const decision = decisionMap.get(key);
    const rootOverlap = contentTokens(item.source.phrase).filter(token => rootSet.has(token));
    const residue = item.missingCoreMetrics.length >= 3;
    const outlier = !residue && item.seedOverlap === 0 && rootOverlap.length === 0;
    const defaultTier = residue ? 'RESIDUE' : outlier ? 'OUTLIER_REVIEW'
      : index < 15 ? 'PRIMARY' : index < 40 ? 'SECONDARY' : 'LONG_TAIL';
    const tier = TIERS.has(decision?.tier) ? decision.tier : defaultTier;
    return {
      keywordId: `AMZ-KW-${String(index + 1).padStart(5, '0')}`, phrase: item.source.phrase,
      priorityRank: index + 1, score: item.score, tier,
      disposition: tier === 'EXCLUDED' ? 'STAFF_EXCLUDED' : 'AVAILABLE_FOR_TRUTH_GATED_ALLOCATION',
      staffNote: String(decision?.note || '').slice(0, 500), seedOverlap: Number(item.seedOverlap.toFixed(3)),
      roots: rootOverlap, missingCoreMetrics: item.missingCoreMetrics,
      metrics: { searchVolume: item.source.searchVolume, keywordSales: item.source.keywordSales, iq: item.source.iq,
        trend: item.source.trend, competingProducts: item.source.competingProducts, cpr: item.source.cpr,
        titleDensity: item.source.titleDensity, bid: item.source.bid, minBid: item.source.minBid,
        maxBid: item.source.maxBid, positionRank: item.source.positionRank,
        rankingCompetitorsCount: item.source.rankingCompetitorsCount,
        competitorRankAverage: item.source.competitorRankAverage,
        competitorPerformanceScore: item.source.competitorPerformanceScore },
      occurrences: item.source.occurrences, provenance: item.source.provenance
    };
  });
  const known = new Set(source.map(item => fold(item.phrase).trim()));
  const unknownDecisions = [...decisionMap.keys()].filter(key => !known.has(key));
  if (unknownDecisions.length) throw new AmazonWorkflowError('MASTER_KEYWORD_DECISION_NOT_IN_RESEARCH', 409, { unknownDecisions });
  return {
    payload: {
      seedPhrase, keywords, roots,
      outliers: keywords.filter(item => item.tier === 'OUTLIER_REVIEW').map(item => item.keywordId),
      residue: keywords.filter(item => item.tier === 'RESIDUE').map(item => item.keywordId),
      metricProvenance: {
        searchVolume: 'Cerebro Search Volume — scoring', keywordSales: 'Cerebro Keyword Sales — scoring',
        iq: 'Cerebro IQ — scoring', rankingCompetitorsCount: 'Cerebro Ranking Competitors Count — scoring',
        positionRank: 'Cerebro Position/Competitor Rank — scoring', trend: 'Cerebro Search Volume Trend — diagnostic',
        cpr: 'Cerebro CPR — diagnostic', bid: 'H10 PPC suggested bid — later PPC planning only'
      }
    },
    accounting: {
      sourceObservationCount: research.accounting.cerebroObservationCount,
      uniqueKeywordCount: source.length, duplicateObservationCount: Math.max(0,
        Number(research.accounting.cerebroObservationCount || 0) - source.length),
      masterKeywordCount: keywords.length, availableForAllocation: keywords.filter(item => item.tier !== 'EXCLUDED').length,
      staffExcludedCount: keywords.filter(item => item.tier === 'EXCLUDED').length,
      outlierCount: keywords.filter(item => item.tier === 'OUTLIER_REVIEW').length,
      residueCount: keywords.filter(item => item.tier === 'RESIDUE').length,
      rootCount: roots.length, droppedKeywordCount: 0
    }
  };
}

async function previewMasterKeywords(db, scope, projectId, input) {
  if (scope.marketplace !== 'AMAZON') throw new AmazonWorkflowError('AMAZON_PROJECT_REQUIRED');
  const research = await getResearchSnapshot(db, scope, projectId, input.researchSnapshotId);
  const built = masterKeywordPayload(research, String(input.seedPhrase || ''), input.decisions || []);
  const dependencies = { researchSnapshotId: research.id, researchSnapshotHash: research.snapshot_hash,
    imports: research.importManifest.map(item => ({ id: item.id, kind: item.kind, rawHash: item.rawHash,
      parserId: item.parserId, parserHash: item.parserHash })) };
  if (input.asinPlanArtifactId != null) {
    const plan = await getArtifact(db, scope, projectId, input.asinPlanArtifactId, 'AMAZON_ASIN_BATCH_PLAN');
    dependencies.asinPlanArtifactId = plan.id; dependencies.asinPlanArtifactHash = plan.artifactHash;
  }
  return { zeroWrite: true, dependencies, ...built, bindings: bindings(),
    previewHash: hashBytes(canonicalJson({ dependencies, payload: built.payload, accounting: built.accounting, bindings: bindings() })) };
}

async function saveMasterKeywords(db, scope, projectId, input) {
  const preview = await previewMasterKeywords(db, scope, projectId, input);
  return appendArtifact(db, scope, projectId, {
    kind: 'AMAZON_MASTER_KEYWORDS', expectedHeadArtifactId: input.expectedHeadArtifactId,
    idempotencyKey: input.idempotencyKey, changeReason: input.changeReason,
    dependencies: preview.dependencies, payload: preview.payload, accounting: preview.accounting, bindings: preview.bindings
  });
}

module.exports = Object.freeze({ AmazonWorkflowError, bindings, previewAsinPlan, saveAsinPlan,
  masterKeywordPayload, previewMasterKeywords, saveMasterKeywords });
