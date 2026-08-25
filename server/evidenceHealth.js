// Read-only research health projection. It describes provenance and missing
// fields only; it never produces a market score or a workflow decision.

const LAYERS = [
  { key: 'search_capture', label: 'Search capture (CSV / HTML / TXT)', kinds: new Set(['ETSY_SEARCH_PASTE_V1']), sources: new Set(['STAFF_MANUAL_ASSERTION']), allowedUse: 'Pattern and keyword research only.' },
  { key: 'mcp', label: 'MCP retrieval', kinds: new Set(['SMART_PULL_ARTIFACT_V1']), sources: new Set(['MCP_RETRIEVAL', 'ETSY_MCP_LIVE']), allowedUse: 'Observed research; inspect capture completeness and freshness separately.' },
  { key: 'listing_detail', label: 'Opened listing detail', kinds: new Set(['ETSY_LISTING_DETAIL_V1', 'ETSY_LISTING_PAGE_V1']), sources: new Set(['ETSY_LISTING_DETAIL']), allowedUse: 'Competitor-structure research only.' },
  { key: 'review_voice', label: 'Review / buyer voice', kinds: new Set(['ETSY_REVIEW_V1', 'ETSY_REVIEW_IMPORT_V1']), sources: new Set(['ETSY_REVIEW_IMPORT']), allowedUse: 'Buyer-language research only; never demand proof.' },
  { key: 'generated', label: 'Generated candidates', kinds: new Set(['GENERATED_KEYWORD_CANDIDATES_V1']), sources: new Set(['GENERATED_CANDIDATE']), allowedUse: 'Suggestions require independent checking.' }
];

function parseMetadata(value) {
  try { return { metadata: JSON.parse(value || '{}'), malformed: false }; } catch (_) { return { metadata: {}, malformed: true }; }
}

function isKnown(value) {
  if (typeof value === 'number') return Number.isFinite(value); // zero is known
  if (typeof value !== 'string') return value !== null && value !== undefined;
  const normalized = value.trim();
  return Boolean(normalized) && !/^(unknown|n\/a|[-–—]+)$/i.test(normalized);
}

function semanticState(metadata) {
  return typeof metadata.evidenceState === 'string' && metadata.evidenceState.trim()
    ? metadata.evidenceState.trim()
    : 'UNKNOWN';
}

function coverage(rows, selector) {
  const total = rows.length;
  const known = rows.filter(selector).length;
  return { known, total, coveragePercent: total ? Number(((known / total) * 100).toFixed(2)) : 0, status: known === 0 ? 'UNKNOWN' : known === total ? 'KNOWN' : 'PARTIAL' };
}

function coverageGroup(rows, fields) {
  const perField = Object.fromEntries(Object.entries(fields).map(([key, selector]) => [key, coverage(rows, selector)]));
  const totals = Object.values(perField).reduce((acc, item) => ({ known: acc.known + item.known, total: acc.total + item.total }), { known: 0, total: 0 });
  return {
    ...totals,
    coveragePercent: totals.total ? Number(((totals.known / totals.total) * 100).toFixed(2)) : 0,
    status: totals.known === 0 ? 'UNKNOWN' : totals.known === totals.total ? 'KNOWN' : 'PARTIAL',
    fields: perField
  };
}

function normalizeTimestamp(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute, second, , zone] = match;
  const numeric = [year, month, day, hour, minute, second].map(Number);
  const [y, m, d, h, min, sec] = numeric;
  const zoneValid = zone === 'Z' || (Number(zone.slice(1, 3)) <= 23 && Number(zone.slice(4, 6)) <= 59);
  if (m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate() || h > 23 || min > 59 || sec > 59 || !zoneValid) return null;
  const timestamp = new Date(value.trim());
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

function dateBounds(values) {
  const valid = values.map(normalizeTimestamp).filter(Boolean).sort();
  return { oldest: valid[0] || 'UNKNOWN', newest: valid[valid.length - 1] || 'UNKNOWN' };
}

function matchesLayer(artifact, config) {
  if (config.kinds.has(artifact.metadata.kind)) return true;
  // STAFF_MANUAL_ASSERTION is intentionally too broad to classify an artifact.
  // It needs an explicit kind, otherwise it remains UNMAPPED rather than being
  // silently mistaken for a CSV/HTML search capture.
  return artifact.row.source !== 'STAFF_MANUAL_ASSERTION' && config.sources.has(artifact.row.source);
}

function mapLayer(artifacts, config) {
  const matched = artifacts.filter(artifact => matchesLayer(artifact, config));
  const observed = dateBounds(matched.map(({ metadata }) => metadata.observedAt));
  const imported = dateBounds(matched.map(({ metadata }) => metadata.importedAt));
  const capture = dateBounds(matched.map(({ metadata }) => metadata.observedAt || metadata.importedAt));
  return {
    key: config.key, label: config.label, count: matched.length,
    state: matched.length ? 'MAPPED' : artifacts.length ? 'NOT_CAPTURED' : 'MISSING',
    provenance: matched.length ? [...new Set(matched.map(({ row, metadata }) => metadata.provider || row.source || 'UNKNOWN'))].sort() : 'UNKNOWN',
    dbStates: matched.length ? [...new Set(matched.map(({ row }) => row.evidence_state || 'UNKNOWN'))].sort() : ['UNKNOWN'],
    semanticStates: matched.length ? [...new Set(matched.map(({ metadata }) => semanticState(metadata)))].sort() : ['UNKNOWN'],
    observedAt: observed.newest, importedAt: imported.newest, oldestCaptureAt: capture.oldest, newestCaptureAt: capture.newest,
    allowedUse: config.allowedUse
  };
}

function buildEvidenceHealth(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const artifacts = safeRows.map(row => ({ row, ...parseMetadata(row.metadata) }));
  const layers = LAYERS.map(config => mapLayer(artifacts, config));
  const mapped = new Set();
  LAYERS.forEach(config => artifacts.forEach((artifact, index) => {
    if (matchesLayer(artifact, config)) mapped.add(index);
  }));
  const unmapped = artifacts.filter((_, index) => !mapped.has(index));
  if (unmapped.length) {
    const observed = dateBounds(unmapped.map(({ metadata }) => metadata.observedAt));
    const imported = dateBounds(unmapped.map(({ metadata }) => metadata.importedAt));
    const capture = dateBounds(unmapped.map(({ metadata }) => metadata.observedAt || metadata.importedAt));
    layers.push({ key: 'unmapped', label: 'Unmapped artifact', count: unmapped.length, state: 'UNMAPPED', provenance: [...new Set(unmapped.map(({ row, metadata }) => metadata.kind || metadata.provider || row.source || 'UNKNOWN'))].sort(), dbStates: [...new Set(unmapped.map(({ row }) => row.evidence_state || 'UNKNOWN'))].sort(), semanticStates: [...new Set(unmapped.map(({ metadata }) => semanticState(metadata)))].sort(), observedAt: observed.newest, importedAt: imported.newest, oldestCaptureAt: capture.oldest, newestCaptureAt: capture.newest, allowedUse: 'Artifact exists but has no Evidence Health adapter; no capability is inferred.' });
  }
  const searchArtifacts = artifacts.filter(({ metadata }) => metadata.kind === 'ETSY_SEARCH_PASTE_V1');
  const searchListings = searchArtifacts.flatMap(({ metadata }) => Array.isArray(metadata.sellers) ? metadata.sellers : []);
  const fieldCoverage = {
    listingId: coverage(searchListings, row => isKnown(row.listingId)), reportedRank: coverage(searchListings, row => isKnown(row.reportedRank?.value)), title: coverage(searchListings, row => isKnown(row.title)), shop: coverage(searchListings, row => isKnown(row.shopName)), price: coverage(searchListings, row => isKnown(row.priceAmount)),
    tags: coverage(searchListings, row => Array.isArray(row.tags) && row.tags.length > 0), categories: coverage(searchListings, row => Array.isArray(row.categories) && row.categories.length > 0), country: coverage(searchListings, row => isKnown(row.country)), ageDays: coverage(searchListings, row => isKnown(row.ageDays)),
    views24h: coverage(searchListings, row => isKnown(row.views24h)), sold24h: coverage(searchListings, row => isKnown(row.sold24h)), totalViews: coverage(searchListings, row => isKnown(row.totalViews)), totalSold: coverage(searchListings, row => isKnown(row.totalSold)), conversion: coverage(searchListings, row => isKnown(row.conversionRate)),
    revenue: coverage(searchListings, row => isKnown(row.revenue)), reviewCount: coverage(searchListings, row => isKnown(row.reviewCount)), rating: coverage(searchListings, row => isKnown(row.rating)), shopDailySold: coverage(searchListings, row => isKnown(row.shopDailySold)),
    isAd: coverage(searchListings, row => isKnown(row.badges?.isAd?.value)), isBestseller: coverage(searchListings, row => isKnown(row.badges?.isBestseller?.value)), isStarSeller: coverage(searchListings, row => isKnown(row.badges?.isStarSeller?.value)), hasFreeShipping: coverage(searchListings, row => isKnown(row.badges?.hasFreeShipping?.value)),
    listingCreatedAt: coverage(searchListings, row => isKnown(row.listingCreatedAt)), listingUpdatedAt: coverage(searchListings, row => isKnown(row.listingUpdatedAt)),
    keywordContext: coverage(searchListings, row => isKnown(row.sourceHints?.keywordContext?.value)), keywordMatchType: coverage(searchListings, row => isKnown(row.sourceHints?.keywordMatchType?.value)), keywordMatchConfidence: coverage(searchListings, row => isKnown(row.sourceHints?.keywordMatchConfidence?.value)), keywordMatch: coverage(searchListings, row => Object.values(row.sourceHints?.keywordMatches || {}).some(item => isKnown(item?.value))), proofScopeHint: coverage(searchListings, row => isKnown(row.sourceHints?.proofScopeHint?.value)), evidenceRouteHint: coverage(searchListings, row => isKnown(row.sourceHints?.evidenceRouteHint?.value)), dataUseHint: coverage(searchListings, row => isKnown(row.sourceHints?.dataUseHint?.value))
  };
  const fieldGroups = {
    identity: coverageGroup(searchListings, { listingId: row => isKnown(row.listingId), reportedRank: row => isKnown(row.reportedRank?.value), title: row => isKnown(row.title), shop: row => isKnown(row.shopName), country: row => isKnown(row.country) }),
    commercialMetrics: coverageGroup(searchListings, { price: row => isKnown(row.priceAmount), reviews: row => isKnown(row.reviewCount), rating: row => isKnown(row.rating), revenue: row => isKnown(row.revenue), conversion: row => isKnown(row.conversionRate) }),
    trafficSales: coverageGroup(searchListings, { views24h: row => isKnown(row.views24h), sold24h: row => isKnown(row.sold24h), totalViews: row => isKnown(row.totalViews), totalSold: row => isKnown(row.totalSold), shopDailySold: row => isKnown(row.shopDailySold) }),
    badgeOffer: coverageGroup(searchListings, { isAd: row => isKnown(row.badges?.isAd?.value), isBestseller: row => isKnown(row.badges?.isBestseller?.value), isStarSeller: row => isKnown(row.badges?.isStarSeller?.value), hasFreeShipping: row => isKnown(row.badges?.hasFreeShipping?.value) }),
    keywordContext: coverageGroup(searchListings, { tags: row => Array.isArray(row.tags) && row.tags.length > 0, categories: row => Array.isArray(row.categories) && row.categories.length > 0, keywordContext: row => isKnown(row.sourceHints?.keywordContext?.value) }),
    listingFreshness: coverageGroup(searchListings, { listingCreatedAt: row => isKnown(row.listingCreatedAt), listingUpdatedAt: row => isKnown(row.listingUpdatedAt) }),
    sourceHints: coverageGroup(searchListings, { keywordMatchType: row => isKnown(row.sourceHints?.keywordMatchType?.value), keywordMatchConfidence: row => isKnown(row.sourceHints?.keywordMatchConfidence?.value), keywordMatch: row => Object.values(row.sourceHints?.keywordMatches || {}).some(item => isKnown(item?.value)), proofScopeHint: row => isKnown(row.sourceHints?.proofScopeHint?.value), evidenceRouteHint: row => isKnown(row.sourceHints?.evidenceRouteHint?.value), dataUseHint: row => isKnown(row.sourceHints?.dataUseHint?.value) })
  };
  const observed = dateBounds(artifacts.map(({ metadata }) => metadata.observedAt));
  const imported = dateBounds(artifacts.map(({ metadata }) => metadata.importedAt));
  const capture = dateBounds(artifacts.map(({ metadata }) => metadata.observedAt || metadata.importedAt));
  const actions = [];
  const unmappedColumns = [...new Set(searchArtifacts.flatMap(({ metadata }) => metadata.headerDiagnostics?.unmappedColumns || []))].sort();
  if (!safeRows.length) actions.push('Nạp CSV, HTML, MCP artifact hoặc staff input vào Active Project trước khi phân tích.');
  if (searchArtifacts.length) actions.push('Search imports support pattern and keyword research only; inspect their source and field coverage before using them.');
  if (searchListings.length && fieldCoverage.tags.status === 'UNKNOWN') actions.push('Nạp tag từ nguồn hoặc kiểm tra listing; không tạo tag từ khoảng trống.');
  if (searchListings.length && (fieldCoverage.views24h.status === 'UNKNOWN' || fieldCoverage.sold24h.status === 'UNKNOWN')) actions.push('Bổ sung views_24h/sold_24h hoặc snapshot lần hai để đánh giá traction theo thời gian.');
  if (unmapped.length) actions.push('Map artifact kind/source to an Evidence Health adapter before relying on its fields.');
  if (unmappedColumns.length) actions.push('Map or explicitly document source columns reported as UNMAPPED before relying on a complete projection.');
  return { contractVersion: 'EVIDENCE_HEALTH_V1', scope: 'READ_ONLY_RESEARCH_STATUS', summary: { evidenceRecords: safeRows.length, searchArtifacts: searchArtifacts.length, searchListings: searchListings.length, malformedMetadata: artifacts.filter(item => item.malformed).length, unmappedSourceColumns: unmappedColumns }, freshness: { observedAt: observed.newest, importedAt: imported.newest, oldestCaptureAt: capture.oldest, newestCaptureAt: capture.newest }, layers, fieldCoverage, fieldGroups, actions };
}

module.exports = { buildEvidenceHealth, isKnown, matchesLayer, normalizeTimestamp };
