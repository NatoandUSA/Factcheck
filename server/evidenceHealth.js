// Read-only research health projection. It deliberately describes provenance
// and missing fields; it never produces a market score or an authority verdict.

function parseMetadata(value) {
  try { return JSON.parse(value || '{}'); } catch (_) { return {}; }
}

function nonEmpty(value) {
  return value !== null && value !== undefined && value !== '';
}

function semanticState(row, metadata) {
  return metadata.evidenceState || row.evidence_state || 'UNKNOWN';
}

function countFields(rows, field) {
  return rows.filter(row => nonEmpty(row[field])).length;
}

function buildEvidenceHealth(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const artifacts = safeRows.map(row => ({ row, metadata: parseMetadata(row.metadata) }));
  const etsySearch = artifacts.filter(({ metadata }) => metadata.kind === 'ETSY_SEARCH_PASTE_V1');
  const searchListings = etsySearch.flatMap(({ metadata }) => Array.isArray(metadata.sellers) ? metadata.sellers : []);
  const inputFormats = [...new Set(etsySearch.map(({ metadata }) => metadata.inputFormat || 'UNKNOWN'))].sort();
  const states = {};
  artifacts.forEach(({ row, metadata }) => {
    const state = semanticState(row, metadata);
    states[state] = (states[state] || 0) + 1;
  });
  const providerCounts = {};
  artifacts.forEach(({ row, metadata }) => {
    const provider = metadata.provider || row.source || 'UNKNOWN';
    providerCounts[provider] = (providerCounts[provider] || 0) + 1;
  });
  const coverage = {
    listingId: countFields(searchListings, 'listingId'), title: countFields(searchListings, 'title'),
    shop: countFields(searchListings, 'shopName'), price: countFields(searchListings, 'priceAmount'),
    tags: searchListings.filter(row => Array.isArray(row.tags) && row.tags.length > 0).length,
    categories: searchListings.filter(row => Array.isArray(row.categories) && row.categories.length > 0).length,
    country: countFields(searchListings, 'country'), ageDays: countFields(searchListings, 'ageDays'),
    views24h: countFields(searchListings, 'views24h'), sold24h: countFields(searchListings, 'sold24h'),
    totalViews: countFields(searchListings, 'totalViews'), totalSold: countFields(searchListings, 'totalSold'),
    conversion: countFields(searchListings, 'conversionRate')
  };
  const actions = [];
  if (!safeRows.length) actions.push('Nạp CSV, HTML, MCP artifact hoặc staff input vào Active Project trước khi phân tích.');
  if (etsySearch.length) actions.push('CSV/HTML/TXT search import dùng cho pattern và shortlist; không thể accept hoặc mở Research Accepted.');
  if (searchListings.length && !coverage.tags) actions.push('Nạp dữ liệu tag hoặc mở một số listing để kiểm tra tag thật; không tạo tag từ khoảng trống.');
  if (searchListings.length && (!coverage.views24h || !coverage.sold24h)) actions.push('Bổ sung views_24h/sold_24h hoặc snapshot lần hai để đánh giá traction theo thời gian.');
  actions.push('Mở 3–5 listing đa dạng nếu cần kiểm tra ảnh, variation hoặc processing; dữ liệu đó vẫn là competitor research, không phải Product Truth.');
  return {
    contractVersion: 'EVIDENCE_HEALTH_V1',
    authority: 'RESEARCH_STATUS_ONLY',
    summary: { evidenceRecords: safeRows.length, searchArtifacts: etsySearch.length, searchListings: searchListings.length, inputFormats, states, providerCounts },
    layers: [
      { key: 'search_capture', label: 'Search capture (CSV / HTML / TXT)', count: searchListings.length, state: searchListings.length ? 'CAPTURED' : 'MISSING', provenance: 'STAFF_MANUAL_ASSERTION / UNVERIFIED_INPUT', allowedUse: 'Pattern, keyword and shortlist research only.' },
      { key: 'mcp', label: 'MCP retrieval', count: artifacts.filter(({ row }) => row.source === 'MCP_RETRIEVAL').length, state: artifacts.some(({ row }) => row.source === 'MCP_RETRIEVAL') ? 'PRESENT' : 'NOT_CAPTURED', provenance: 'MCP_RETRIEVAL (eligibility is separately recomputed by server)', allowedUse: 'Observed research; acceptance still depends on exact server-side eligibility.' },
      { key: 'listing_detail', label: 'Opened listing detail', count: 0, state: 'NOT_CAPTURED', provenance: 'No listing-detail artifact in this project projection.', allowedUse: 'Verify competitor structure only.' },
      { key: 'review_voice', label: 'Review / buyer voice', count: 0, state: 'NOT_CAPTURED', provenance: 'No review artifact in this project projection.', allowedUse: 'Buyer-language research only; never demand proof.' },
      { key: 'generated', label: 'Generated candidates', count: 0, state: 'NOT_GENERATED', provenance: 'No generated candidates in this projection.', allowedUse: 'Suggestions require independent checking.' }
    ],
    fieldCoverage: coverage,
    actions
  };
}

module.exports = { buildEvidenceHealth };
