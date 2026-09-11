'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const { canonicalJson, hashBytes } = require('./revisionStore');
const { getResearchImport } = require('./commerceSnapshotStore');
const amazonResearchAdapter = require('./commerceIntelligence/amazonResearchAdapter');
const etsyIntelligenceAdapter = require('./commerceIntelligence/etsyIntelligenceAdapter');
const { selectAsinBatches } = require('./commerceIntelligence/asinSelector');
const { fold } = require('./commerceIntelligence/text');

const ENGINE_ID = 'marketplace-research-workflow-v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS = new Set(['AMAZON_ASIN_BATCH_PLAN','AMAZON_CEREBRO_BINDING','AMAZON_MASTER_KEYWORDS',
  'ETSY_WINNER_SET','ETSY_PATTERN_SNAPSHOT','ETSY_MASTER_KEYWORDS']);
const queues = new WeakMap();

class MarketplaceWorkflowError extends Error {
  constructor(code, status = 400, details = {}) { super(code); this.code = code; this.status = status; this.details = details; }
}

const run = (db, sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function done(error) {
  if (error) reject(error); else resolve({ lastID: this.lastID, changes: this.changes });
}));
const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params,
  (error, row) => error ? reject(error) : resolve(row || null)));
const all = (db, sql, params = []) => new Promise((resolve, reject) => db.all(sql, params,
  (error, rows) => error ? reject(error) : resolve(rows)));

function withLock(db, operation) {
  const previous = queues.get(db) || Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  queues.set(db, current);
  return current.finally(() => { if (queues.get(db) === current) queues.delete(db); });
}

function scopeOf(input) {
  const scope = { tenantId: String(input?.tenantId || '').trim(), workspaceId: Number(input?.workspaceId),
    marketplace: input?.marketplace, actorId: Number(input?.actorId) };
  if (!scope.tenantId || !Number.isInteger(scope.workspaceId) || !['AMAZON','ETSY'].includes(scope.marketplace)
    || !Number.isInteger(scope.actorId)) throw new MarketplaceWorkflowError('INVALID_SERVER_SCOPE', 500);
  return scope;
}

function engineBindingHash() {
  const hash = crypto.createHash('sha256').update(`${ENGINE_ID}\0`);
  for (const file of [__filename, require.resolve('./commerceIntelligence/asinSelector'),
    require.resolve('./commerceIntelligence/amazonResearchAdapter'), require.resolve('./etsyPastedSearchParser')]) {
    hash.update(file.split(/[\\/]/).pop()).update('\0').update(fs.readFileSync(file)).update('\0');
  }
  return hash.digest('hex');
}

function artifactIntegrity(row) {
  const components = { dependencyManifestHash: hashBytes(row.dependency_manifest_json),
    payloadHash: hashBytes(row.payload_json), accountingHash: hashBytes(row.accounting_json),
    engineBindingHash: row.engine_binding_hash };
  if (components.dependencyManifestHash !== row.dependency_manifest_hash || components.payloadHash !== row.payload_hash
    || components.accountingHash !== row.accounting_hash || hashBytes(canonicalJson(components)) !== row.artifact_hash) {
    throw new MarketplaceWorkflowError('WORKFLOW_ARTIFACT_INTEGRITY_FAILURE', 500, { artifactId: row.id });
  }
}

function present(row) {
  artifactIntegrity(row);
  return { id: row.id, kind: row.kind, revisionNumber: row.revision_number, parentRevisionId: row.parent_revision_id,
    artifactHash: row.artifact_hash, dependencies: JSON.parse(row.dependency_manifest_json),
    payload: JSON.parse(row.payload_json), accounting: JSON.parse(row.accounting_json),
    changeReason: row.change_reason, createdBy: row.created_by, createdAt: row.created_at };
}

async function appendArtifactUnlocked(db, rawScope, projectIdInput, input) {
  const scope = scopeOf(rawScope); const projectId = Number(projectIdInput);
  const kind = String(input.kind || '').toUpperCase(); const key = String(input.idempotencyKey || '').toLowerCase();
  const reason = String(input.changeReason || '').trim();
  if (!KINDS.has(kind)) throw new MarketplaceWorkflowError('WORKFLOW_ARTIFACT_KIND_INVALID');
  if ((scope.marketplace === 'AMAZON') !== kind.startsWith('AMAZON_')) throw new MarketplaceWorkflowError('WORKFLOW_ARTIFACT_MARKETPLACE_MISMATCH');
  if (!UUID.test(key)) throw new MarketplaceWorkflowError('INVALID_IDEMPOTENCY_KEY');
  if (!reason || reason.length > 128) throw new MarketplaceWorkflowError('CHANGE_REASON_REQUIRED');
  const duplicate = await get(db, `SELECT * FROM commerce_workflow_artifacts WHERE tenant_id=? AND workspace_id=?
    AND marketplace=? AND kind=? AND idempotency_key=?`, [scope.tenantId, scope.workspaceId, scope.marketplace, kind, key]);
  if (duplicate) return { ...present(duplicate), duplicate: true };
  const project = await get(db, `SELECT id FROM research_projects WHERE id=? AND tenant_id=? AND workspace_id=? AND marketplace=?`,
    [projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
  if (!project) throw new MarketplaceWorkflowError('PROJECT_NOT_FOUND', 404);
  const parent = await get(db, `SELECT * FROM commerce_workflow_artifacts WHERE project_id=? AND tenant_id=?
    AND workspace_id=? AND marketplace=? AND kind=? ORDER BY revision_number DESC LIMIT 1`,
  [projectId, scope.tenantId, scope.workspaceId, scope.marketplace, kind]);
  const expected = input.expectedHeadArtifactId == null ? null : Number(input.expectedHeadArtifactId);
  if ((parent?.id ?? null) !== expected) throw new MarketplaceWorkflowError('WORKFLOW_ARTIFACT_CONFLICT', 409,
    { expectedHeadArtifactId: expected, currentHeadArtifactId: parent?.id ?? null, kind });
  const dependencyJson = canonicalJson(input.dependencies || {}); const payloadJson = canonicalJson(input.payload || {});
  const accountingJson = canonicalJson(input.accounting || {}); const binding = engineBindingHash();
  const components = { dependencyManifestHash: hashBytes(dependencyJson), payloadHash: hashBytes(payloadJson),
    accountingHash: hashBytes(accountingJson), engineBindingHash: binding };
  const artifactHash = hashBytes(canonicalJson(components));
  const inserted = await run(db, `INSERT INTO commerce_workflow_artifacts
    (tenant_id,workspace_id,marketplace,project_id,kind,revision_number,parent_revision_id,
     dependency_manifest_json,dependency_manifest_hash,payload_json,payload_hash,accounting_json,accounting_hash,
     engine_binding_hash,artifact_hash,change_reason,idempotency_key,created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [scope.tenantId, scope.workspaceId, scope.marketplace, projectId,
    kind, (parent?.revision_number || 0) + 1, parent?.id ?? null, dependencyJson, components.dependencyManifestHash,
    payloadJson, components.payloadHash, accountingJson, components.accountingHash, binding, artifactHash, reason, key, scope.actorId]);
  return { id: inserted.lastID, kind, revisionNumber: (parent?.revision_number || 0) + 1,
    parentRevisionId: parent?.id ?? null, artifactHash, dependencies: input.dependencies || {}, payload: input.payload || {},
    accounting: input.accounting || {}, changeReason: reason, duplicate: false };
}

function appendArtifact(db, rawScope, projectIdInput, input) {
  return withLock(db, () => appendArtifactUnlocked(db, rawScope, projectIdInput, input));
}

async function getArtifact(db, rawScope, projectId, artifactId, kind = null) {
  const scope = scopeOf(rawScope);
  const row = await get(db, `SELECT * FROM commerce_workflow_artifacts WHERE id=? AND project_id=? AND tenant_id=?
    AND workspace_id=? AND marketplace=?`, [Number(artifactId), Number(projectId), scope.tenantId, scope.workspaceId, scope.marketplace]);
  if (!row || (kind && row.kind !== kind)) throw new MarketplaceWorkflowError('WORKFLOW_ARTIFACT_NOT_FOUND', 404);
  return present(row);
}

async function getWorkflowState(db, rawScope, projectIdInput) {
  const scope = scopeOf(rawScope); const projectId = Number(projectIdInput);
  const rows = await all(db, `SELECT * FROM commerce_workflow_artifacts WHERE project_id=? AND tenant_id=?
    AND workspace_id=? AND marketplace=? ORDER BY id DESC`, [projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
  const artifacts = rows.map(present); const heads = {};
  for (const artifact of artifacts) if (!heads[artifact.kind]) heads[artifact.kind] = artifact;
  return { projectId, artifacts, heads };
}

async function researchSnapshot(db, rawScope, projectId, snapshotId) {
  const scope = scopeOf(rawScope);
  const row = await get(db, `SELECT * FROM research_snapshots WHERE id=? AND project_id=? AND tenant_id=?
    AND workspace_id=? AND marketplace=?`, [Number(snapshotId), Number(projectId), scope.tenantId, scope.workspaceId, scope.marketplace]);
  if (!row) throw new MarketplaceWorkflowError('RESEARCH_SNAPSHOT_NOT_FOUND', 404);
  if (hashBytes(row.import_manifest_json) !== row.import_manifest_hash
    || hashBytes(row.observations_json) !== row.observations_hash || hashBytes(row.accounting_json) !== row.accounting_hash) {
    throw new MarketplaceWorkflowError('RESEARCH_SNAPSHOT_INTEGRITY_FAILURE', 500);
  }
  return { id: row.id, snapshotHash: row.snapshot_hash, importManifest: JSON.parse(row.import_manifest_json),
    observations: JSON.parse(row.observations_json), accounting: JSON.parse(row.accounting_json) };
}

async function previewAmazonBatches(db, scope, projectId, xrayImportIds, seedPhrase, options = {}) {
  if (scope.marketplace !== 'AMAZON') throw new MarketplaceWorkflowError('AMAZON_PROJECT_REQUIRED');
  const ids = [...new Set((Array.isArray(xrayImportIds) ? xrayImportIds : [xrayImportIds])
    .map(Number).filter(Number.isInteger))];
  if (!ids.length) throw new MarketplaceWorkflowError('AMAZON_XRAY_IMPORT_REQUIRED');
  const sources = await Promise.all(ids.map(id => getResearchImport(db, scope, projectId, id, { includeRaw: true })));
  if (sources.some(source => source.kind !== 'AMAZON_XRAY')) throw new MarketplaceWorkflowError('AMAZON_XRAY_IMPORT_REQUIRED');
  const built = await amazonResearchAdapter.buildSnapshot(sources);
  const requestedAsins = Array.isArray(options.selectedAsins)
    ? [...new Set(options.selectedAsins.map(value => String(value).trim().toUpperCase()).filter(Boolean))] : [];
  const maxBatches = Math.min(3, Math.max(1, Number(options.maxBatches) || 2));
  if (requestedAsins.length > 30 || requestedAsins.some(value => !/^[A-Z0-9]{10}$/.test(value))) {
    throw new MarketplaceWorkflowError('INVALID_STAFF_ASIN_SELECTION');
  }
  if (requestedAsins.length > maxBatches * 10) throw new MarketplaceWorkflowError(
    'STAFF_ASIN_SELECTION_EXCEEDS_BATCH_CAPACITY', 409,
    { selectedAsinCount: requestedAsins.length, maxBatches, capacity: maxBatches * 10 });
  const xrayByAsin = new Map();
  for (const item of built.observations.xray) {
    const existing = xrayByAsin.get(item.asin);
    if (!existing || Number(item.asinSales || 0) > Number(existing.asinSales || 0)) xrayByAsin.set(item.asin, item);
  }
  const uniqueXray = [...xrayByAsin.values()];
  const absentAsins = requestedAsins.filter(asin => !xrayByAsin.has(asin));
  if (absentAsins.length) throw new MarketplaceWorkflowError('SELECTED_ASIN_NOT_IN_XRAY', 409, { absentAsins });
  const staffSelected = requestedAsins.length > 0;
  const selected = selectAsinBatches(staffSelected ? requestedAsins.map(asin => xrayByAsin.get(asin)) : uniqueXray,
    staffSelected ? { anchors: [], batchSize: 10, maxPerBrand: 30, excludeOwnAsins: false }
      : { anchors: [seedPhrase].filter(Boolean), library: true, screen: options.screen, batchSize: 10, maxPerBrand: 2 });
  const batches = selected.batches.slice(0, maxBatches);
  return { zeroWrite: true, dependencies: {
      xrayImports: sources.map(source => ({ id: source.id, rawHash: source.raw_hash })),
      ...(sources.length === 1 ? { xrayImportId: sources[0].id, xrayRawHash: sources[0].raw_hash } : {})
    },
    payload: { seedPhrase, selectionMode: staffSelected ? 'STAFF_SELECTED_FROM_XRAY' : 'ENGINE_RECOMMENDED',
      selectedAsins: requestedAsins, batchSize: 10, maxBatches, batches, rejected: selected.rejected,
      candidatePool: uniqueXray.map(item => ({ asin: item.asin, title: item.title, brand: item.brand,
        price: item.price, asinSales: item.asinSales, reviews: item.reviews })) },
    accounting: { inputRows: built.observations.xray.length, uniqueAsinCandidates: uniqueXray.length,
      duplicateAsinRows: built.observations.xray.length - uniqueXray.length, acceptedCandidates: selected.acceptedCount,
      rejectedCandidates: selected.rejectedCount, selectedBatchCount: batches.length,
      selectedAsinCount: batches.reduce((sum, batch) => sum + batch.size, 0), unselectedEligibleCount:
        Math.max(0, selected.acceptedCount - batches.reduce((sum, batch) => sum + batch.size, 0)) } };
}

function asinHeaders(headers = []) { return headers.map(value => String(value).trim().toUpperCase()).filter(value => /^[A-Z0-9]{10}$/.test(value)); }

async function buildCerebroBinding(db, scope, projectId, input) {
  const plan = await getArtifact(db, scope, projectId, input.asinBatchArtifactId, 'AMAZON_ASIN_BATCH_PLAN');
  const batch = plan.payload.batches.find(item => item.batchNumber === Number(input.batchNumber));
  if (!batch) throw new MarketplaceWorkflowError('AMAZON_ASIN_BATCH_NOT_FOUND');
  const source = await getResearchImport(db, scope, projectId, input.cerebroImportId);
  if (source.kind !== 'AMAZON_CEREBRO') throw new MarketplaceWorkflowError('AMAZON_CEREBRO_IMPORT_REQUIRED');
  const observed = asinHeaders(source.headerSignature); const expected = new Set(batch.asins);
  const matched = observed.filter(asin => expected.has(asin)); const unexpected = observed.filter(asin => !expected.has(asin));
  if (!matched.length) throw new MarketplaceWorkflowError('CEREBRO_BATCH_ASIN_MISMATCH', 409,
    { expectedAsins: batch.asins, observedAsinHeaders: observed });
  if (unexpected.length) throw new MarketplaceWorkflowError('CEREBRO_CONTAINS_ASINS_OUTSIDE_BATCH', 409,
    { expectedAsins: batch.asins, observedAsinHeaders: observed, unexpectedAsins: unexpected });
  return { dependencies: { asinBatchArtifactId: plan.id, asinBatchArtifactHash: plan.artifactHash,
    cerebroImportId: source.id, cerebroRawHash: source.raw_hash }, payload: { batchNumber: batch.batchNumber,
    expectedAsins: batch.asins, observedAsinHeaders: observed, matchedAsins: matched, unexpectedAsins: unexpected,
    missingExpectedAsins: batch.asins.filter(asin => !observed.includes(asin)) }, accounting: {
    expectedAsinCount: batch.asins.length, observedAsinHeaderCount: observed.length, matchedAsinCount: matched.length,
    unexpectedAsinCount: unexpected.length, missingExpectedAsinCount: batch.asins.filter(asin => !observed.includes(asin)).length } };
}

function amazonMasterKeywords(research) {
  const keywords = (research.observations.cerebro?.keywords || []).map((item, index) => ({ keywordId: `AMZ-KW-${index + 1}`,
    phrase: item.phrase, searchVolume: item.searchVolume, keywordSales: item.keywordSales, iq: item.iq,
    trend: item.trend, competingProducts: item.competingProducts, cpr: item.cpr, titleDensity: item.titleDensity,
    bid: item.bid, positionRank: item.positionRank, occurrences: item.occurrences,
    provenance: item.provenance, disposition: 'AVAILABLE_FOR_TRUTH_GATED_ALLOCATION' }));
  return { payload: { keywords }, accounting: { sourceObservationCount: research.accounting.cerebroObservationCount,
    masterKeywordCount: keywords.length, availableForAllocation: keywords.length, droppedKeywordCount: 0 } };
}

function entityKey(item) { return item.listingId ? `listing:${String(item.listingId).toLowerCase()}`
  : `fallback:${fold([item.url,item.title,item.shopName].filter(Boolean).join('|'))}`; }
function metric(value) { return Number.isFinite(Number(value)) ? Number(value) : null; }
function logScore(value) { return value == null ? 0 : Math.log10(Math.max(0, Number(value)) + 1); }

function etsyEntities(research) {
  const byId = new Map();
  for (const item of research.observations.sellers || []) {
    const key = entityKey(item); const prior = byId.get(key);
    if (!prior) { byId.set(key, { ...item, entityKey: key, provenance: [item.provenance] }); continue; }
    prior.provenance.push(item.provenance);
    for (const [field, value] of Object.entries(item)) if ((prior[field] == null || prior[field] === '') && value != null && value !== '') prior[field] = value;
  }
  return [...byId.values()];
}

function scoreEtsyWinner(item) {
  const rank = metric(item.reportedRank?.value ?? item.reportedRank);
  const scoreParts = { rank: rank ? 10 / Math.max(1, rank) : 0, bestseller: item.badges?.isBestseller?.value === true ? 2 : 0,
    sales: logScore(item.totalSold), revenue: logScore(item.revenue), reviews: logScore(item.reviewCount),
    conversion: metric(item.conversionRate) == null ? 0 : Math.min(2, metric(item.conversionRate) / 5) };
  return { score: Object.values(scoreParts).reduce((sum, value) => sum + value, 0), scoreParts };
}

function buildEtsyWinners(research, winnerCount = 8, selectedEntityKeys = []) {
  const entities = etsyEntities(research).map(item => ({ ...item, ...scoreEtsyWinner(item) }))
    .sort((a, b) => b.score - a.score || a.sourceRank - b.sourceRank);
  const requested = Array.isArray(selectedEntityKeys)
    ? [...new Set(selectedEntityKeys.map(value => String(value).trim()).filter(Boolean))] : [];
  if (requested.length && (requested.length < 5 || requested.length > 10)) {
    throw new MarketplaceWorkflowError('ETSY_WINNER_SELECTION_MUST_HAVE_5_TO_10', 409,
      { selectedEntityCount: requested.length });
  }
  const entityByKey = new Map(entities.map(item => [item.entityKey, item]));
  const absentEntityKeys = requested.filter(key => !entityByKey.has(key));
  if (absentEntityKeys.length) throw new MarketplaceWorkflowError('ETSY_WINNER_NOT_IN_SEARCH_EVIDENCE', 409,
    { absentEntityKeys });
  const count = Math.min(10, Math.max(5, Number(winnerCount) || 8));
  const winners = requested.length ? requested.map(key => entityByKey.get(key)) : entities.slice(0, count);
  const winnerKeys = new Set(winners.map(item => item.entityKey));
  return { payload: { winners, nonWinners: entities.filter(item => !winnerKeys.has(item.entityKey)) }, accounting: { observationCount: (research.observations.sellers || []).length,
    entityCount: entities.length, duplicateObservationCount: (research.observations.sellers || []).length - entities.length,
    winnerCount: winners.length, nonWinnerCount: Math.max(0, entities.length - winners.length),
    selectionMode: requested.length ? 'STAFF_SELECTED_FROM_SEARCH_EVIDENCE' : 'ENGINE_RECOMMENDED' } };
}

const WORD_STOP = new Set(['the','and','for','with','from','this','that','para','con','del','las','los','de','a','to','of']);
function words(value) { return fold(value).match(/[a-z0-9]+/g)?.filter(word => word.length > 2 && !WORD_STOP.has(word)) || []; }
function frequency(items) { const map = new Map(); for (const item of items) map.set(item, (map.get(item) || 0) + 1);
  return [...map.entries()].map(([value,count]) => ({ value,count })).sort((a,b) => b.count-a.count || a.value.localeCompare(b.value)); }

function buildEtsyPatterns(winnerArtifact) {
  const winners = winnerArtifact.payload.winners || []; const titleTokens = frequency(winners.flatMap(item => words(item.title)));
  const tags = frequency(winners.flatMap(item => (item.tags || []).map(value => fold(value).trim()).filter(Boolean)));
  const categories = frequency(winners.flatMap(item => item.categories || []));
  const shops = new Set(winners.map(item => fold(item.shopName)).filter(Boolean));
  return { dependencies: { winnerSetArtifactId: winnerArtifact.id, winnerSetArtifactHash: winnerArtifact.artifactHash },
    payload: { titleTokens, repeatedTags: tags, categories, structuralPatterns: {
      titleSeparatorUsage: winners.filter(item => /[|–—]/.test(item.title || '')).length,
      personalizedUsage: winners.filter(item => /personal|custom/i.test(item.title || '')).length,
      averageTitleLength: winners.length ? Math.round(winners.reduce((sum,item) => sum + Array.from(item.title || '').length,0) / winners.length) : 0 } },
    accounting: { winnerCount: winners.length, uniqueShopCount: shops.size, titleTokenCount: titleTokens.length,
      repeatedTagCount: tags.length, categoryCount: categories.length } };
}

function buildEtsyMaster(research, winners, patterns) {
  const corpus = etsyIntelligenceAdapter.candidateCorpus(research.observations);
  const keywords = corpus.map((item,index) => ({ keywordId: `ETSY-KW-${index+1}`, ...item,
    disposition: 'AVAILABLE_FOR_TRUTH_GATED_ALLOCATION' }));
  const rejectedKeywords = (corpus.sourceRejected || []).map((item,index) => ({ keywordId: `ETSY-REJECT-${index+1}`,
    ...item, disposition: 'REJECTED_SOURCE_NOISE' }));
  return { dependencies: { researchSnapshotId: research.id, researchSnapshotHash: research.snapshotHash,
    winnerSetArtifactId: winners.id, winnerSetArtifactHash: winners.artifactHash,
    patternArtifactId: patterns.id, patternArtifactHash: patterns.artifactHash }, payload: { keywords, rejectedKeywords }, accounting: {
    entityCount: etsyEntities(research).length, masterKeywordCount: keywords.length,
    availableForAllocation: keywords.length, rejectedSourceNoiseCount: rejectedKeywords.length,
    accountedCandidateCount: keywords.length + rejectedKeywords.length, droppedKeywordCount: 0 } };
}

module.exports = Object.freeze({ MarketplaceWorkflowError, appendArtifact, getArtifact, getWorkflowState, researchSnapshot,
  previewAmazonBatches, buildCerebroBinding, amazonMasterKeywords, buildEtsyWinners, buildEtsyPatterns, buildEtsyMaster,
  engineBindingHash, asinHeaders, etsyEntities, scoreEtsyWinner });
