'use strict';

const crypto = require('node:crypto');
const { normalizePhrase } = require('./globalCandidatePool');

const PROVIDER = 'HEYETSY_EXTENSION_EXPORT';
const BINDING_AUTHORITY = 'THIRD_PARTY_RESEARCH_CAPTURE';

const REQUIRED_HEADERS = Object.freeze([
  'listing_id', 'title', 'shop', 'price', 'price_num', 'price_was', 'reviews',
  'star_seller', 'ad', 'bestseller', 'free_shipping',
  'sold_24h', 'views_24h', 'he_sold', 'he_views_avg', 'he_views', 'he_fav_pct', 'he_favorites',
  'he_created', 'age_days', 'he_updated', 'he_revenue_usd', 'conversion_pct',
  'country', 'shop_daily_sold', 'he_discount_pct', 'he_tags', 'he_categories', 'url',
  'keyword_context', 'keyword_match_type', 'keyword_match_confidence',
  'proof_scope_hint', 'evidence_route_hint', 'data_use_hint', 'rank_position'
]);

const sha256 = value => crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');

function normalizedHeaderSet(source) {
  return new Set((source?.headerDiagnostics?.recognizedColumns || [])
    .map(item => String(item?.sourceColumn || '').trim().toLowerCase())
    .filter(Boolean));
}

function listingUrlMatchesId(url, listingId) {
  const id = String(listingId || '').trim();
  const raw = String(url || '').trim();
  if (!id || !/^\d+$/.test(id) || !raw) return false;
  let parsed;
  try { parsed = new URL(raw); } catch (_) { return false; }
  const host = parsed.hostname.toLowerCase();
  if (host !== 'www.etsy.com' && host !== 'etsy.com') return false;
  const match = parsed.pathname.match(/^\/listing\/(\d+)(?:\/|$)/);
  return Boolean(match && match[1] === id);
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function fail(code, details = {}) {
  return Object.freeze({
    verified: false,
    code,
    provider: PROVIDER,
    bindingAuthority: BINDING_AUTHORITY,
    details: Object.freeze({ ...details })
  });
}

function verifyHeyEtsyCaptureArtifact(inspected) {
  const built = inspected?.built || {};
  const accounting = built.accounting || {};
  const observations = built.observations || {};
  const sources = Array.isArray(observations.sources) ? observations.sources : [];
  const sellers = Array.isArray(observations.sellers) ? observations.sellers : [];

  if (sources.length !== 1) return fail('HEYETSY_SINGLE_SOURCE_REQUIRED', { sourceCount: sources.length });
  const source = sources[0];
  if (String(source.inputFormat || '').toUpperCase() !== 'CSV') {
    return fail('HEYETSY_CSV_REQUIRED', { inputFormat: source.inputFormat || null });
  }

  const headers = normalizedHeaderSet(source);
  const missingHeaders = REQUIRED_HEADERS.filter(header => !headers.has(header));
  if (missingHeaders.length) return fail('HEYETSY_REQUIRED_HEADERS_MISSING', { missingHeaders });

  const rowAccounting = source.rowAccounting || {};
  const inputRows = Number(rowAccounting.inputRows);
  const uniqueRows = Number(rowAccounting.uniqueRows);
  const returnedRows = Number(rowAccounting.returnedRows);
  const duplicateRowsRemoved = Number(rowAccounting.duplicateRowsRemoved);
  const truncatedRows = Number(rowAccounting.truncatedRows);
  if (!Number.isSafeInteger(inputRows) || inputRows <= 0
    || inputRows !== uniqueRows
    || returnedRows !== uniqueRows
    || duplicateRowsRemoved !== 0
    || truncatedRows !== 0
    || sellers.length !== returnedRows
    || Number(accounting.observationCount) !== returnedRows) {
    return fail('HEYETSY_ROW_ACCOUNTING_INVALID', {
      inputRows, uniqueRows, returnedRows, duplicateRowsRemoved, truncatedRows,
      observationCount: Number(accounting.observationCount), sellerCount: sellers.length
    });
  }

  const contexts = sellers.map(seller => normalizePhrase(seller?.sourceHints?.keywordContext?.value)).filter(Boolean);
  const uniqueContexts = [...new Set(contexts)];
  if (contexts.length !== sellers.length || uniqueContexts.length !== 1) {
    return fail('HEYETSY_QUERY_CONTEXT_NOT_UNIFORM', {
      sellerCount: sellers.length,
      contextCount: contexts.length,
      uniqueContexts
    });
  }
  const normalizedQuery = uniqueContexts[0];

  const ids = sellers.map(seller => String(seller?.listingId || '').trim());
  if (ids.some(id => !/^\d+$/.test(id)) || new Set(ids).size !== sellers.length) {
    return fail('HEYETSY_LISTING_ID_SET_INVALID', {
      sellerCount: sellers.length,
      uniqueListingIds: new Set(ids.filter(Boolean)).size
    });
  }

  const urlMismatches = sellers
    .filter(seller => !listingUrlMatchesId(seller?.url, seller?.listingId))
    .map(seller => String(seller?.listingId || 'UNKNOWN'));
  if (urlMismatches.length) {
    return fail('HEYETSY_LISTING_URL_BINDING_INVALID', { listingIds: urlMismatches.slice(0, 20) });
  }

  const ranks = sellers.map(seller => positiveInteger(seller?.reportedRank?.value));
  if (ranks.some(value => value == null) || new Set(ranks).size !== sellers.length) {
    return fail('HEYETSY_RANK_SET_INVALID', {
      sellerCount: sellers.length,
      validRankCount: ranks.filter(value => value != null).length,
      uniqueRankCount: new Set(ranks.filter(value => value != null)).size
    });
  }
  const orderedRanks = [...ranks].sort((a, b) => a - b);
  for (let index = 0; index < orderedRanks.length; index += 1) {
    if (orderedRanks[index] !== index + 1) {
      return fail('HEYETSY_RANK_SEQUENCE_INVALID', {
        expectedMaxRank: sellers.length,
        observedMinRank: orderedRanks[0],
        observedMaxRank: orderedRanks[orderedRanks.length - 1]
      });
    }
  }

  const routeHints = sellers.map(seller => String(seller?.sourceHints?.evidenceRouteHint?.value || '').trim().toLowerCase());
  if (routeHints.some(value => value !== 'etsy_search_results')) {
    return fail('HEYETSY_EVIDENCE_ROUTE_INVALID', {
      uniqueRouteHints: [...new Set(routeHints)]
    });
  }

  const dataUseHints = sellers.map(seller => String(seller?.sourceHints?.dataUseHint?.value || '').trim().toLowerCase());
  if (dataUseHints.some(value => value !== 'rank_pattern_batch_candidates')) {
    return fail('HEYETSY_DATA_USE_HINT_INVALID', {
      uniqueDataUseHints: [...new Set(dataUseHints)]
    });
  }

  const matchTypes = sellers.map(seller => String(seller?.sourceHints?.keywordMatchType?.value || '').trim());
  const matchConfidenceTexts = sellers.map(seller => {
    const value = seller?.sourceHints?.keywordMatchConfidence?.value;
    return value === null || value === undefined ? '' : String(value).trim();
  });
  const matchConfidences = matchConfidenceTexts.map(value => value ? Number(value) : null);
  if (matchTypes.some(value => !value)
    || matchConfidences.some(value => value == null || !Number.isFinite(value) || value < 0 || value > 1)) {
    return fail('HEYETSY_KEYWORD_MATCH_METADATA_INVALID', {
      missingMatchTypes: matchTypes.filter(value => !value).length,
      invalidMatchConfidences: matchConfidences.filter(value => value == null || !Number.isFinite(value) || value < 0 || value > 1).length
    });
  }

  const rawHash = String(inspected?.rawHash || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(rawHash)) return fail('HEYETSY_RAW_HASH_INVALID');

  const captureId = 'heyetsy-capture-' + sha256(JSON.stringify({
    provider: PROVIDER,
    rawHash,
    query: normalizedQuery,
    listingIds: ids,
    ranks
  }));

  return Object.freeze({
    verified: true,
    code: 'HEYETSY_CAPTURE_ARTIFACT_VERIFIED',
    provider: PROVIDER,
    bindingAuthority: BINDING_AUTHORITY,
    normalizedQuery,
    captureId,
    rawHash,
    rowCount: sellers.length,
    listingCount: ids.length,
    rankMin: orderedRanks[0],
    rankMax: orderedRanks[orderedRanks.length - 1],
    requiredHeaders: REQUIRED_HEADERS
  });
}

module.exports = Object.freeze({
  PROVIDER,
  BINDING_AUTHORITY,
  REQUIRED_HEADERS,
  listingUrlMatchesId,
  verifyHeyEtsyCaptureArtifact
});
