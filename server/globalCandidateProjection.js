'use strict';

const crypto = require('node:crypto');
const amazonResearchAdapter = require('./commerceIntelligence/amazonResearchAdapter');
const etsyResearchAdapter = require('./commerceIntelligence/etsyResearchAdapter');
const { normalizePhrase } = require('./globalCandidatePool');

const clean = value => JSON.parse(JSON.stringify(value));
const sha256 = value => crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : String(value), 'utf8').digest('hex');

async function inspectResearchFile(file, marketplace) {
  const adapter = marketplace === 'AMAZON' ? amazonResearchAdapter : etsyResearchAdapter;
  const rawHash = sha256(file.rawBytes);
  const parserHash = adapter.parserBindingHash();
  const built = await adapter.buildSnapshot([{ id: 0, kind: file.kind, file_name: file.fileName,
    media_type: file.mediaType, raw_bytes: file.rawBytes, raw_hash: rawHash, selected_sheet: null,
    parser_id: adapter.PARSER_ID, parser_hash: parserHash }]);
  return { adapter, rawHash, parserHash, built };
}

function amazonProjections(inspected, file) {
  if (file.kind !== 'AMAZON_CEREBRO') return [];
  const source = inspected.built.observations.sources[0];
  return inspected.built.observations.cerebro.keywords.map(keyword => ({
    phrase: keyword.phrase,
    sourceFamily: 'AMAZON_CEREBRO',
    authorityClassification: 'MODELED_THIRD_PARTY',
    evidenceTier: 'E2_MODELED_THIRD_PARTY',
    sourceArtifactType: 'RESEARCH_FILE',
    sourceArtifactId: file.fileName,
    sourceArtifactHash: inspected.rawHash,
    provenance: { fileName: file.fileName, parserId: inspected.adapter.PARSER_ID,
      parserHash: inspected.parserHash, adapterBindingHash: inspected.built.adapterBindingHash,
      rows: clean(keyword.provenance || []), source: clean(source) },
    commercialEvidence: clean({ searchVolume: keyword.searchVolume, keywordSales: keyword.keywordSales,
      competingProducts: keyword.competingProducts, titleDensity: keyword.titleDensity, cpr: keyword.cpr,
      iq: keyword.iq, bid: keyword.bid, rank: keyword.positionRank, modeled: true }),
    socialEvidence: {},
    rawEvidence: clean(keyword)
  }));
}

function etsyProjections(inspected, file) {
  const groups = new Map();
  for (const seller of inspected.built.observations.sellers) {
    for (const tag of seller.tags || []) {
      const key = normalizePhrase(tag);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, { phrase: tag, observations: [] });
      groups.get(key).observations.push(seller);
    }
  }
  for (const context of inspected.built.observations.queryContexts || []) {
    const key = normalizePhrase(context);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, { phrase: context, observations: [] });
  }
  return [...groups.values()].map(group => {
    const listings = group.observations.map(seller => ({ listingId: seller.listingId, title: seller.title,
      shopName: seller.shopName, priceAmount: seller.priceAmount, priceCurrency: seller.priceCurrency,
      totalSold: seller.totalSold, sold24h: seller.sold24h, views24h: seller.views24h,
      revenue: seller.revenue, reviewCount: seller.reviewCount, evidenceTiers: seller.evidenceTiers,
      fieldProvenance: seller.fieldProvenance, provenance: seller.provenance }));
    return {
      phrase: group.phrase,
      sourceFamily: 'ETSY_PUBLIC_SEARCH',
      authorityClassification: 'OBSERVED_PUBLIC',
      evidenceTier: 'E1_OBSERVED_PUBLIC',
      sourceArtifactType: 'RESEARCH_FILE',
      sourceArtifactId: file.fileName,
      sourceArtifactHash: inspected.rawHash,
      provenance: clean({ fileName: file.fileName, parserId: inspected.adapter.PARSER_ID,
        parserHash: inspected.parserHash, adapterBindingHash: inspected.built.adapterBindingHash,
        listingRefs: listings.map(item => ({ listingId: item.listingId, provenance: item.provenance })) }),
      commercialEvidence: clean({ listingCount: listings.length, listings, modeledFieldsRemainLabeled: true }),
      socialEvidence: {}, rawEvidence: clean({ phrase: group.phrase, listingCount: listings.length })
    };
  });
}

async function projectResearchFile(file, marketplace) {
  const inspected = await inspectResearchFile(file, marketplace);
  const projections = marketplace === 'AMAZON' ? amazonProjections(inspected, file) : etsyProjections(inspected, file);
  return { projections, accounting: inspected.built.accounting, sourceCoverage: inspected.built.observations.sources,
    rawHash: inspected.rawHash, parserId: inspected.adapter.PARSER_ID, parserHash: inspected.parserHash,
    adapterBindingHash: inspected.built.adapterBindingHash };
}

function projectSocialHandoff(row) {
  const payload = JSON.parse(row.payload_json);
  const candidates = [];
  for (const item of payload.reviewedPromotionQueue || []) {
    if (item.phrase) candidates.push({ phrase: item.phrase, source: 'reviewedPromotionQueue', raw: item });
  }
  for (const item of payload.watchedOpportunities || []) {
    if (item.keyword) candidates.push({ phrase: item.keyword, source: 'watchedOpportunities', raw: item });
  }
  for (const item of payload.discoveryCandidates || []) {
    if (item.keyword) candidates.push({ phrase: item.keyword, source: 'discoveryCandidates', raw: item });
  }
  return candidates.map(item => ({ phrase: item.phrase, sourceFamily: 'SOCIAL_LISTENING',
    authorityClassification: 'RESEARCH_ONLY', evidenceTier: 'RESEARCH_ONLY',
    sourceArtifactType: 'SOCIAL_HANDOFF_V3', sourceArtifactId: row.id,
    sourceArtifactHash: row.source_artifact_hash,
    provenance: { handoffId: row.id, sourceSystem: row.source_system, sourceGitSha: row.source_git_sha,
      sourceDeploymentId: row.source_deployment_id, artifactIssuedAt: row.artifact_issued_at,
      sourceCollection: item.source }, commercialEvidence: {}, socialEvidence: clean(item.raw),
    rawEvidence: clean(item.raw) }));
}

function projectWorkflowArtifact(artifact) {
  const allowed = artifact.kind === 'AMAZON_MASTER_KEYWORDS'
    ? new Set(['OUTLIER_REVIEW','RESIDUE'])
    : artifact.kind === 'ETSY_MASTER_KEYWORDS' ? new Set(['REVIEW','PATTERN_ONLY']) : null;
  if (!allowed) return [];
  return (artifact.payload?.keywords || []).filter(keyword => allowed.has(keyword.tier)).map(keyword => ({
    phrase: keyword.phrase,
    sourceFamily: artifact.kind === 'AMAZON_MASTER_KEYWORDS' ? 'AMAZON_PROJECT_MKL_OUTLIER' : 'ETSY_PROJECT_MKL_OUTLIER',
    authorityClassification: 'PROJECT_RESEARCH',
    evidenceTier: artifact.kind === 'AMAZON_MASTER_KEYWORDS' ? 'E2_MODELED_THIRD_PARTY' : 'PROJECT_RESEARCH_PROXY',
    sourceArtifactType: artifact.kind,
    sourceArtifactId: artifact.id,
    sourceArtifactHash: artifact.artifactHash,
    provenance: clean({ projectId: artifact.projectId, artifactId: artifact.id, artifactHash: artifact.artifactHash,
      revisionNumber: artifact.revisionNumber, dependencies: artifact.dependencies, keywordProvenance: keyword.provenance || [] }),
    commercialEvidence: clean(artifact.kind === 'AMAZON_MASTER_KEYWORDS'
      ? { metrics: keyword.metrics || {}, tier: keyword.tier, tierReason: keyword.tierReason,
        opportunityComponents: keyword.opportunityComponents || {}, modeled: true }
      : { listingSpread: keyword.listingSpread, shopSpread: keyword.shopSpread,
        demandProxy: keyword.demandProxy, competitionProxy: keyword.competitionProxy,
        tier: keyword.tier, tierReason: keyword.tierReason, proxyOnly: true }),
    socialEvidence: {}, rawEvidence: clean(keyword)
  }));
}

module.exports = Object.freeze({ projectResearchFile, projectSocialHandoff, projectWorkflowArtifact });
