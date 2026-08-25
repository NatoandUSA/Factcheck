const crypto = require('crypto');
const Papa = require('papaparse');
const cheerio = require('cheerio');

const MAX_IMPORTED_LISTINGS = 500;

// Explicitly document every source column that this parser understands. New
// columns never become silent data loss: parseEtsySearchCsv returns them in
// `unmappedColumns` until a canonical, research-only projection is added.
const CSV_HEADER_REGISTRY = Object.freeze({
  listing_id: 'listingId', title: 'title', shop: 'shopName', price: 'price', price_num: 'priceAmount', price_was: 'originalPrice', reviews: 'reviewCount',
  star_seller: 'badges.isStarSeller', ad: 'badges.isAd', bestseller: 'badges.isBestseller', free_shipping: 'badges.hasFreeShipping',
  sold_24h: 'sold24h', views_24h: 'views24h', he_sold: 'totalSold', he_views_avg: 'avgViews', he_views: 'totalViews', he_fav_pct: 'favoriteRate', he_favorites: 'favorites',
  he_created: 'createdRaw/listingCreatedAt', age_days: 'ageDays', he_updated: 'updatedRaw/listingUpdatedAt', he_revenue_usd: 'revenue', conversion_pct: 'conversionRate',
  country: 'country', shop_daily_sold: 'shopDailySold', he_discount_pct: 'discountPercent', he_tags: 'tags', he_categories: 'categories', url: 'url',
  keyword_context: 'sourceHints.keywordContext', proof_scope_hint: 'sourceHints.proofScopeHint', evidence_route_hint: 'sourceHints.evidenceRouteHint', data_use_hint: 'sourceHints.dataUseHint',
  rank_position: 'sourceRank',
  listingid: 'listingId', 'listing id': 'listingId', listing_title: 'title', price_display: 'price', price_amount: 'priceAmount', 'price $': 'priceAmount',
  original_price: 'originalPrice', price_was_display: 'originalPrice', review_count: 'reviewCount', 'review count': 'reviewCount', rating: 'rating', shop_name: 'shopName', avg_view: 'avgViews', discount_pct: 'discountPercent',
  currency: 'priceCurrency', price_currency: 'priceCurrency', is_ad: 'badges.isAd', is_bestseller: 'badges.isBestseller', is_star_seller: 'badges.isStarSeller', has_free_shipping: 'badges.hasFreeShipping',
  he_views_24h: 'views24h', total_views: 'totalViews', he_sold_24h: 'sold24h', total_sold: 'totalSold', revenue_usd: 'revenue', favorites: 'favorites', favorite_rate: 'favoriteRate',
  conversion_rate: 'conversionRate', created: 'createdRaw/listingCreatedAt', updated: 'updatedRaw/listingUpdatedAt', tags: 'tags', categories: 'categories', listing_url: 'url', rank: 'sourceRank', position: 'sourceRank'
});

function normalizeCsvHeader(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeCsvRow(row) {
  return Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [normalizeCsvHeader(key), value]));
}

function canonicalCsvField(header) {
  const normalized = normalizeCsvHeader(header);
  return CSV_HEADER_REGISTRY[normalized] || (/^keyword_match_[a-z0-9_]+$/.test(normalized) ? `sourceHints.keywordMatches.${normalized.slice('keyword_match_'.length)}` : null);
}

function csvHeaderDiagnostics(headers, renamedHeaders = {}) {
  const normalizedHeaders = (headers || []).map(header => String(header || '').trim()).filter(Boolean);
  const recognizedColumns = [];
  const unmappedColumns = [];
  for (const header of normalizedHeaders) {
    const canonicalField = canonicalCsvField(header);
    if (canonicalField) recognizedColumns.push({ sourceColumn: header, canonicalField });
    else unmappedColumns.push(header);
  }
  const grouped = new Map();
  for (const item of recognizedColumns) {
    const existing = grouped.get(item.canonicalField) || [];
    existing.push(item.sourceColumn);
    grouped.set(item.canonicalField, existing);
  }
  const canonicalCollisions = [...grouped.entries()]
    .filter(([, sourceColumns]) => sourceColumns.length > 1)
    .map(([canonicalField, sourceColumns]) => ({ canonicalField, sourceColumns }));
  // PapaParse renames exact duplicate headers (`listing_id` becomes
  // `listing_id_1`) before exposing meta.fields. Preserve its original-header
  // metadata so that duplicate source columns cannot masquerade as separate
  // fields or as an unmapped suffix.
  const duplicateHeaderCollisions = Object.values(renamedHeaders || {}).map(sourceColumn => ({
    canonicalField: canonicalCsvField(sourceColumn) || 'UNMAPPED',
    sourceColumns: [sourceColumn, sourceColumn]
  }));
  return { recognizedColumns, unmappedColumns, canonicalCollisions, duplicateHeaderCollisions, recognizedColumnCount: recognizedColumns.length, unmappedColumnCount: unmappedColumns.length };
}

const METRIC_LABELS = new Set([
  'total views',
  'avg view',
  'views 24h',
  'total sold',
  'revenue',
  'sold 24h',
  'favorites',
  'favor. rate',
  'created',
  'updated',
  'conversion rate'
]);

function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\u200b/g, '');
}

function normalizeLine(value) {
  return decodeEntities(value).replace(/\s+/g, ' ').trim();
}

function isUnknown(value) {
  const normalized = normalizeLine(value).replace(/\\/g, '');
  return !normalized || /^[-–—]+$/.test(normalized) || /^unknown$/i.test(normalized);
}

function parseNumberEvidence(rawValue) {
  const raw = normalizeLine(rawValue);
  if (isUnknown(raw)) return { value: null, approximate: false, raw: raw || null };

  const approximate = /^~/.test(raw) || /\bapprox/i.test(raw);
  const cleaned = raw.replace(/^~/, '').replace(/%/g, '').replace(/,/g, '').trim();
  const match = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*([km])?/i);
  if (!match) return { value: null, approximate, raw };

  const multiplier = match[2]?.toLowerCase() === 'k' ? 1000 : match[2]?.toLowerCase() === 'm' ? 1000000 : 1;
  const value = Number(match[1]) * multiplier;
  return { value: Number.isFinite(value) ? value : null, approximate: approximate || multiplier > 1, raw };
}

function parseMoney(rawValue) {
  const raw = normalizeLine(rawValue);
  if (isUnknown(raw)) return [];

  const matches = [];
  const seen = new Set();
  const patterns = [
    { regex: /([0-9][0-9.,]*)\s*₫/g, currency: 'VND' },
    { regex: /(?:US\s*)?\$\s*([0-9][0-9.,]*)/gi, currency: 'USD' },
    { regex: /([0-9][0-9.,]*\s*[kKmM]?)\s*USD\b/gi, currency: 'USD' }
  ];

  for (const { regex, currency } of patterns) {
    for (const match of raw.matchAll(regex)) {
      const numeric = parseNumberEvidence(match[1]);
      if (numeric.value === null) continue;
      const key = `${currency}:${numeric.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push({
        amount: numeric.value,
        currency,
        approximate: numeric.approximate,
        raw: match[0].trim()
      });
    }
  }

  return matches;
}

function parseDateDdMmYyyy(rawValue) {
  const raw = normalizeLine(rawValue);
  if (isUnknown(raw)) return { value: null, raw: raw || null };
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return { value: null, raw };
  const [, day, month, year] = match;
  return { value: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`, raw };
}

function valueAfterLabel(lines, label) {
  const index = lines.findIndex(line => normalizeLine(line).toLowerCase() === label.toLowerCase());
  return index >= 0 ? normalizeLine(lines[index + 1]) : null;
}

function isLikelyTitle(value) {
  const text = normalizeLine(value);
  if (text.length < 8) return false;
  if (METRIC_LABELS.has(text.toLowerCase())) return false;
  // Browser copy often starts with a HeyEtsy metric card (for example
  // "233+ Sold" or "8.6K USD") before the actual Etsy listing card. Those
  // values are useful only when attached to a real listing, never as titles.
  if (/^[~]?[\d.,]+\s*[kKmM]?\+?\s*(?:sold|views|usd|vnd)$/i.test(text)) return false;
  if (/(?:\$|₫).*\b(?:sold|views)\b/i.test(text)) return false;
  return !/^(by|from shop|tags|tags copy suggestions|categories copy|no tags found|market|add to cart|go to shop|more like this|add to favorites)$/i.test(text);
}

function parseListingBlock(lines, sourceRank) {
  const cleanLines = lines.map(normalizeLine).filter(Boolean);
  if (cleanLines.length === 0) return null;

  let title = null;
  let titleIndex = -1;
  for (let index = 0; index < cleanLines.length - 1; index += 1) {
    if (isLikelyTitle(cleanLines[index]) && cleanLines[index].toLowerCase() === cleanLines[index + 1].toLowerCase()) {
      title = cleanLines[index];
      titleIndex = index;
      break;
    }
  }
  if (!title) {
    titleIndex = cleanLines.findIndex(isLikelyTitle);
    title = titleIndex >= 0 ? cleanLines[titleIndex] : null;
  }
  if (!title) return null;

  let rating = null;
  let reviewCount = null;
  for (let index = Math.max(0, titleIndex + 1); index < cleanLines.length; index += 1) {
    if (/^[0-5](?:\.\d+)?$/.test(cleanLines[index])) {
      rating = Number(cleanLines[index]);
      const reviews = cleanLines[index + 1]?.match(/^\(([0-9,]+)\)$/);
      reviewCount = reviews ? Number(reviews[1].replace(/,/g, '')) : null;
      break;
    }
  }

  let shopName = null;
  const byIndex = cleanLines.findIndex(line => /^by$/i.test(line));
  if (byIndex >= 0) shopName = cleanLines[byIndex + 1] || null;
  const inlineShop = cleanLines.find(line => /^from shop\s+.+/i.test(line));
  if (!shopName && inlineShop) shopName = inlineShop.replace(/^from shop\s+/i, '').trim() || null;
  const shopLabelIndex = cleanLines.findIndex(line => /^from shop$/i.test(line));
  if (!shopName && shopLabelIndex >= 0) shopName = cleanLines[shopLabelIndex + 1] || null;

  const priceLine = cleanLines.find(line => /₫|(?:US\s*)?\$|\bUSD\b/i.test(line) && /[0-9]/.test(line));
  const money = parseMoney(priceLine);
  const currentPrice = money[0] || null;
  const originalPrice = /original price/i.test(priceLine || '') ? money[1] || null : null;
  const discountMatch = normalizeLine(priceLine).match(/\((\d+(?:\.\d+)?)%\s*off\)/i);

  const totalViews = parseNumberEvidence(valueAfterLabel(cleanLines, 'Total Views'));
  const avgViews = parseNumberEvidence(valueAfterLabel(cleanLines, 'AVG View'));
  const views24h = parseNumberEvidence(valueAfterLabel(cleanLines, 'Views 24H'));
  const totalSold = parseNumberEvidence(valueAfterLabel(cleanLines, 'Total Sold'));
  const sold24h = parseNumberEvidence(valueAfterLabel(cleanLines, 'Sold 24H'));
  const favorites = parseNumberEvidence(valueAfterLabel(cleanLines, 'Favorites'));
  const favoriteRate = parseNumberEvidence(valueAfterLabel(cleanLines, 'Favor. Rate'));
  const conversionRate = parseNumberEvidence(valueAfterLabel(cleanLines, 'Conversion Rate'));
  const revenueRaw = valueAfterLabel(cleanLines, 'Revenue');
  const revenue = parseMoney(revenueRaw)[0] || null;
  const created = parseDateDdMmYyyy(valueAfterLabel(cleanLines, 'Created'));
  const updatedRaw = valueAfterLabel(cleanLines, 'Updated');

  const tagsStart = cleanLines.findIndex(line => /^(tags|tags copy suggestions)$/i.test(line));
  const categoriesStart = cleanLines.findIndex(line => /^categories copy$/i.test(line));
  const tags = tagsStart >= 0
    ? cleanLines
      .slice(tagsStart + 1, categoriesStart >= 0 ? categoriesStart : cleanLines.length)
      .filter(line => !/^no tags found$/i.test(line) && line.length >= 2 && line.length <= 40)
    : [];
  const categoryRaw = categoriesStart >= 0 ? cleanLines[categoriesStart + 1] || null : null;
  const categories = categoryRaw ? categoryRaw.split(',').map(item => item.trim()).filter(Boolean) : [];

  return {
    id: `pasted-${sourceRank}`,
    sourceRank,
    title,
    shopName,
    shopNameEvidenceState: shopName ? 'STAFF_PASTED_TEXT' : 'UNKNOWN',
    sourceLabel: 'STAFF_PASTED_HEYETSY_TEXT',
    rating,
    reviewCount,
    price: currentPrice?.raw || null,
    priceAmount: currentPrice?.amount ?? null,
    priceCurrency: currentPrice?.currency || null,
    originalPrice: originalPrice?.raw || null,
    originalPriceAmount: originalPrice?.amount ?? null,
    discountPercent: discountMatch ? Number(discountMatch[1]) : null,
    totalViews: totalViews.value,
    avgViews: avgViews.value,
    views24h: views24h.value,
    totalSold: totalSold.value,
    sold24h: sold24h.value,
    revenue: revenue?.amount ?? null,
    revenueCurrency: revenue?.currency || null,
    revenueApproximate: revenue?.approximate ?? false,
    revenueRaw: normalizeLine(revenueRaw) || null,
    favorites: favorites.value,
    favoriteRate: favoriteRate.value,
    favoriteRateApproximate: favoriteRate.approximate,
    conversionRate: conversionRate.value,
    conversionRateApproximate: conversionRate.approximate,
    createdDate: created.value,
    createdRaw: created.raw,
    updatedRaw: isUnknown(updatedRaw) ? null : normalizeLine(updatedRaw),
    tags,
    tagSource: tags.length > 0 ? 'HEYETSY_COPY_SUGGESTION' : 'NO_TAGS_REPORTED',
    categories,
    country: null,
    shopCountry: null,
    url: null,
    evidenceSource: 'STAFF_MANUAL_ASSERTION',
    evidenceState: 'UNVERIFIED_INPUT',
    evidenceProvider: 'HEYETSY_PASTED_TEXT',
    isSynthetic: false,
    selected: true,
    rawBlock: cleanLines.join('\n')
  };
}

function parseSearchContext(headerLines) {
  const context = {
    appliedFilters: [],
    unappliedFilters: [],
    resultCount: null,
    pageContainsAds: false,
    sortMode: null
  };
  let filterMode = null;

  for (const rawLine of headerLines) {
    const line = normalizeLine(rawLine);
    if (/^applied filters$/i.test(line)) {
      filterMode = 'applied';
      continue;
    }
    if (/^unapplied filters$/i.test(line)) {
      filterMode = 'unapplied';
      continue;
    }
    const resultMatch = line.match(/^([0-9,]+)\s+results(?:,\s*(with ads))?/i);
    if (resultMatch) {
      context.resultCount = Number(resultMatch[1].replace(/,/g, ''));
      context.pageContainsAds = Boolean(resultMatch[2]);
      filterMode = null;
      continue;
    }
    if (/^(most relevant|lowest price|highest price|top customer reviews|most recent)$/i.test(line)) {
      context.sortMode = line;
      filterMode = null;
      continue;
    }
    if (/^show filters$/i.test(line)) continue;
    if (filterMode === 'applied') context.appliedFilters.push(line);
    if (filterMode === 'unapplied') context.unappliedFilters.push(line);
  }
  return context;
}

function aggregateTagSuggestions(sellers) {
  const frequency = new Map();
  let sequence = 0;
  for (const seller of sellers) {
    for (const tag of seller.tags || []) {
      const normalized = normalizeLine(tag).toLowerCase();
      if (!normalized) continue;
      const existing = frequency.get(normalized);
      if (existing) existing.count += 1;
      else frequency.set(normalized, { tag: normalized, count: 1, firstSeen: sequence++ });
    }
  }
  return [...frequency.values()].sort((a, b) => b.count - a.count || a.firstSeen - b.firstSeen);
}

function dedupeAndRank(sellers) {
  const unique = [];
  const seen = new Set();
  let duplicatesRemoved = 0;
  for (const seller of sellers) {
    // An external Etsy listing id is the strongest identity when the source
    // supplies one. Do not derive it from a URL; missing ids use the existing
    // conservative composite fallback instead.
    const identity = seller.listingId
      ? `listing:${String(seller.listingId).trim().toLowerCase()}`
      : [seller.url, seller.title, seller.shopName, seller.priceAmount, seller.priceCurrency]
        .map(value => String(value ?? '').trim().toLowerCase()).join('|');
    if (seen.has(identity)) {
      duplicatesRemoved += 1;
      continue;
    }
    seen.add(identity);
    unique.push({ ...seller, sourceRank: unique.length + 1, id: `pasted-${unique.length + 1}` });
  }
  return { sellers: unique.slice(0, MAX_IMPORTED_LISTINGS), parsedCount: unique.length, duplicatesRemoved };
}

function finalizeParsedInput({ normalizedRaw, parserVersion, searchContext, sellers, inputFormat, headerDiagnostics = null }) {
  const deduped = dedupeAndRank(sellers);
  return {
    parserVersion,
    inputFormat,
    headerDiagnostics,
    contentHash: crypto.createHash('sha256').update(normalizedRaw.trim()).digest('hex'),
    searchContext,
    sellers: deduped.sellers,
    parsedCount: deduped.parsedCount,
    returnedCount: deduped.sellers.length,
    duplicatesRemoved: deduped.duplicatesRemoved,
    truncated: deduped.parsedCount > MAX_IMPORTED_LISTINGS,
    tagSuggestions: aggregateTagSuggestions(deduped.sellers)
  };
}

function parseHeyEtsyPastedText(rawText) {
  const normalizedRaw = decodeEntities(rawText).replace(/\r\n?/g, '\n');
  const lines = normalizedRaw.split('\n').map(normalizeLine).filter(Boolean);
  const searchResultsIndex = lines.findIndex(line => /^search results$/i.test(line));
  const headerLines = searchResultsIndex >= 0 ? lines.slice(0, searchResultsIndex) : [];
  const bodyLines = searchResultsIndex >= 0 ? lines.slice(searchResultsIndex + 1) : lines;

  const blocks = [];
  let current = [];
  for (const line of bodyLines) {
    if (/^heyetsy\.com$/i.test(line)) {
      if (current.length > 0) blocks.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current);

  const parsed = blocks.map((block, index) => parseListingBlock(block, index + 1)).filter(Boolean);
  return finalizeParsedInput({
    normalizedRaw,
    parserVersion: 'HEYETSY_PASTED_TEXT_V1',
    inputFormat: 'HEYETSY_TEXT',
    searchContext: parseSearchContext(headerLines),
    sellers: parsed
  });
}

function csvValue(row, ...names) {
  for (const name of names) {
    const value = row?.[normalizeCsvHeader(name)];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return null;
}

function splitSuggestions(value) {
  if (isUnknown(value)) return [];
  return String(value).split(/[,;|]/).map(normalizeLine).filter(Boolean);
}

// CSV exports use several conventions for a negative badge. Keep the parsed
// value distinct from missing data: `0` is an observation, an empty cell is
// not. These values remain research-only staff input throughout the pipeline.
function parseBooleanEvidence(rawValue) {
  const raw = normalizeLine(rawValue);
  if (isUnknown(raw) || /^n\/?a$/i.test(raw)) return { value: null, state: 'UNKNOWN', raw: raw || null };
  if (/^(?:1|true|yes)$/i.test(raw)) return { value: true, state: 'OBSERVED', raw };
  if (/^(?:0|false|no)$/i.test(raw)) return { value: false, state: 'OBSERVED', raw };
  return { value: null, state: 'UNKNOWN', raw };
}

function observedCsvField(value, raw) {
  return {
    value,
    state: value === null || value === undefined ? 'UNKNOWN' : 'OBSERVED',
    source: 'ETSY_SEARCH_CSV',
    authority: 'NONE',
    allowedUse: 'RESEARCH_ONLY',
    raw: raw ?? null
  };
}

function sourceHint(value) {
  const normalized = isUnknown(value) ? null : normalizeLine(value);
  return {
    value: normalized,
    state: normalized ? 'SOURCE_HINT' : 'UNKNOWN',
    source: 'ETSY_SEARCH_CSV',
    authority: 'NONE'
  };
}

function normalizeIsoTimestamp(rawValue) {
  const raw = normalizeLine(rawValue);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(raw);
  if (isUnknown(raw) || !match) return null;
  const [, year, month, day, hour, minute, second, zone] = match;
  const [y, m, d, h, min, sec] = [year, month, day, hour, minute, second].map(Number);
  const zoneValid = zone === 'Z' || (Number(zone.slice(1, 3)) <= 23 && Number(zone.slice(4, 6)) <= 59);
  if (m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate() || h > 23 || min > 59 || sec > 59 || !zoneValid) return null;
  const timestamp = new Date(raw);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

function parseCsvListing(row, index) {
  row = normalizeCsvRow(row);
  const title = csvValue(row, 'title', 'Title', 'listing_title');
  if (!title) return null;
  const priceRaw = csvValue(row, 'price', 'Price', 'price_display');
  const numericPrice = parseNumberEvidence(csvValue(row, 'price_num', 'price_amount', 'Price $') || priceRaw);
  const originalRaw = csvValue(row, 'price_was', 'original_price', 'price_was_display');
  const originalNumeric = parseNumberEvidence(originalRaw);
  const rating = parseNumberEvidence(csvValue(row, 'rating', 'Rating'));
  const reviews = parseNumberEvidence(csvValue(row, 'reviews', 'review_count', 'Review Count'));
  const sourceRank = parseNumberEvidence(csvValue(row, 'rank_position', 'rank', 'position')).value || index + 1;
  const currency = csvValue(row, 'currency', 'price_currency') || null;
  const listingId = csvValue(row, 'listing_id', 'listingId', 'Listing ID');
  const isAd = parseBooleanEvidence(csvValue(row, 'ad', 'is_ad'));
  const isBestseller = parseBooleanEvidence(csvValue(row, 'bestseller', 'is_bestseller'));
  const isStarSeller = parseBooleanEvidence(csvValue(row, 'star_seller', 'is_star_seller'));
  const hasFreeShipping = parseBooleanEvidence(csvValue(row, 'free_shipping', 'has_free_shipping'));
  const keywordContext = sourceHint(csvValue(row, 'keyword_context'));
  const keywordMatchType = sourceHint(csvValue(row, 'keyword_match_type'));
  const keywordMatchConfidence = sourceHint(csvValue(row, 'keyword_match_confidence'));
  const keywordMatches = Object.fromEntries(Object.entries(row || {})
    .filter(([key]) => /^keyword_match_[a-z0-9_]+$/i.test(key))
    .map(([key, value]) => [key.slice('keyword_match_'.length), sourceHint(value)]));
  const proofScopeHint = sourceHint(csvValue(row, 'proof_scope_hint'));
  const evidenceRouteHint = sourceHint(csvValue(row, 'evidence_route_hint'));
  const dataUseHint = sourceHint(csvValue(row, 'data_use_hint'));
  const shopDailySold = parseNumberEvidence(csvValue(row, 'shop_daily_sold'));
  const createdRaw = csvValue(row, 'he_created', 'created');
  const updatedRaw = csvValue(row, 'he_updated', 'updated');
  const seller = {
    id: `csv-${sourceRank}`,
    sourceRowId: `csv-row-${index + 1}`,
    listingId,
    sourceRank,
    title,
    shopName: csvValue(row, 'shop', 'shop_name', 'Shop'),
    shopNameEvidenceState: csvValue(row, 'shop', 'shop_name', 'Shop') ? 'STAFF_FILE_CSV' : 'UNKNOWN',
    sourceLabel: 'STAFF_FILE_ETSY_CSV',
    rating: rating.value,
    reviewCount: reviews.value,
    price: priceRaw,
    priceAmount: numericPrice.value,
    priceCurrency: currency,
    originalPrice: originalRaw,
    originalPriceAmount: originalNumeric.value,
    discountPercent: parseNumberEvidence(csvValue(row, 'he_discount_pct', 'discount_pct')).value,
    totalViews: parseNumberEvidence(csvValue(row, 'he_views', 'total_views')).value,
    avgViews: parseNumberEvidence(csvValue(row, 'he_views_avg', 'avg_view')).value,
    views24h: parseNumberEvidence(csvValue(row, 'views_24h', 'he_views_24h')).value,
    totalSold: parseNumberEvidence(csvValue(row, 'he_sold', 'total_sold')).value,
    sold24h: parseNumberEvidence(csvValue(row, 'sold_24h', 'he_sold_24h')).value,
    revenue: parseNumberEvidence(csvValue(row, 'he_revenue_usd', 'revenue_usd')).value,
    revenueCurrency: csvValue(row, 'he_revenue_usd', 'revenue_usd') ? 'USD' : null,
    revenueApproximate: false,
    revenueRaw: csvValue(row, 'he_revenue_usd', 'revenue_usd'),
    favorites: parseNumberEvidence(csvValue(row, 'he_favorites', 'favorites')).value,
    favoriteRate: parseNumberEvidence(csvValue(row, 'he_fav_pct', 'favorite_rate')).value,
    favoriteRateApproximate: false,
    conversionRate: parseNumberEvidence(csvValue(row, 'conversion_pct', 'conversion_rate')).value,
    conversionRateApproximate: false,
    createdDate: null,
    createdRaw,
    updatedRaw,
    listingCreatedAt: normalizeIsoTimestamp(createdRaw),
    listingUpdatedAt: normalizeIsoTimestamp(updatedRaw),
    ageDays: parseNumberEvidence(csvValue(row, 'age_days')).value,
    tags: splitSuggestions(csvValue(row, 'he_tags', 'tags')),
    tagSource: csvValue(row, 'he_tags', 'tags') ? 'STAFF_FILE_CSV_SUGGESTION' : 'NO_TAGS_REPORTED',
    categories: splitSuggestions(csvValue(row, 'he_categories', 'categories')),
    country: csvValue(row, 'country'),
    shopCountry: csvValue(row, 'country'),
    url: csvValue(row, 'url', 'listing_url'),
    badges: { isAd, isBestseller, isStarSeller, hasFreeShipping },
    shopDailySold: shopDailySold.value,
    sourceHints: { keywordContext, keywordMatchType, keywordMatchConfidence, keywordMatches, proofScopeHint, evidenceRouteHint, dataUseHint },
    fieldProvenance: {
      listingId: observedCsvField(listingId, listingId),
      priceAmount: observedCsvField(numericPrice.value, priceRaw),
      country: observedCsvField(csvValue(row, 'country'), csvValue(row, 'country')),
      views24h: observedCsvField(parseNumberEvidence(csvValue(row, 'views_24h', 'he_views_24h')).value, csvValue(row, 'views_24h', 'he_views_24h')),
      sold24h: observedCsvField(parseNumberEvidence(csvValue(row, 'sold_24h', 'he_sold_24h')).value, csvValue(row, 'sold_24h', 'he_sold_24h')),
      totalViews: observedCsvField(parseNumberEvidence(csvValue(row, 'he_views', 'total_views')).value, csvValue(row, 'he_views', 'total_views')),
      totalSold: observedCsvField(parseNumberEvidence(csvValue(row, 'he_sold', 'total_sold')).value, csvValue(row, 'he_sold', 'total_sold')),
      conversionRate: observedCsvField(parseNumberEvidence(csvValue(row, 'conversion_pct', 'conversion_rate')).value, csvValue(row, 'conversion_pct', 'conversion_rate')),
      revenue: observedCsvField(parseNumberEvidence(csvValue(row, 'he_revenue_usd', 'revenue_usd')).value, csvValue(row, 'he_revenue_usd', 'revenue_usd')),
      reviewCount: observedCsvField(reviews.value, csvValue(row, 'reviews', 'review_count', 'Review Count')),
      rating: observedCsvField(rating.value, csvValue(row, 'rating', 'Rating')),
      ageDays: observedCsvField(parseNumberEvidence(csvValue(row, 'age_days')).value, csvValue(row, 'age_days')),
      shopDailySold: observedCsvField(shopDailySold.value, csvValue(row, 'shop_daily_sold')),
      isAd: observedCsvField(isAd.value, isAd.raw),
      isBestseller: observedCsvField(isBestseller.value, isBestseller.raw),
      isStarSeller: observedCsvField(isStarSeller.value, isStarSeller.raw),
      hasFreeShipping: observedCsvField(hasFreeShipping.value, hasFreeShipping.raw)
    },
    evidenceSource: 'STAFF_MANUAL_ASSERTION',
    evidenceState: 'UNVERIFIED_INPUT',
    evidenceProvider: 'ETSY_SEARCH_CSV',
    isSynthetic: false,
    selected: true,
    rawBlock: JSON.stringify(row)
  };
  return seller;
}

function parseEtsySearchCsv(rawText) {
  const normalizedRaw = decodeEntities(rawText).replace(/\r\n?/g, '\n');
  const result = Papa.parse(normalizedRaw, { header: true, skipEmptyLines: 'greedy' });
  if (result.errors.some(error => error.code === 'MissingQuotes' || error.code === 'UndetectableDelimiter')) {
    throw new Error('CSV_PARSE_FAILED');
  }
  const headerDiagnostics = csvHeaderDiagnostics(result.meta?.fields, result.meta?.renamedHeaders);
  const allCollisions = [...headerDiagnostics.canonicalCollisions, ...headerDiagnostics.duplicateHeaderCollisions];
  if (allCollisions.length) {
    const error = new Error('AMBIGUOUS_CSV_HEADERS');
    error.canonicalCollisions = allCollisions;
    error.duplicateHeaders = headerDiagnostics.duplicateHeaderCollisions.length > 0;
    throw error;
  }
  return finalizeParsedInput({
    normalizedRaw,
    parserVersion: 'ETSY_SEARCH_CSV_V1',
    inputFormat: 'CSV',
    searchContext: { appliedFilters: [], unappliedFilters: [], resultCount: result.data.length, pageContainsAds: false, sortMode: null },
    sellers: result.data.map(parseCsvListing).filter(Boolean),
    headerDiagnostics
  });
}

function parseEtsySearchHtml(rawText) {
  const normalizedRaw = decodeEntities(rawText).replace(/\r\n?/g, '\n');
  const $ = cheerio.load(normalizedRaw);
  const sellers = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    let payload;
    try { payload = JSON.parse($(element).text()); } catch (_) { return; }
    const list = Array.isArray(payload) ? payload : [payload];
    for (const itemList of list) {
      const entries = itemList?.['@type'] === 'ItemList' ? itemList.itemListElement : [];
      for (const entry of entries || []) {
        const item = entry?.item || {};
        const offers = Array.isArray(item.offers) ? item.offers[0] : (item.offers || {});
        const rank = Number(entry.position);
        if (!item.name) continue;
        sellers.push({
          id: `html-${Number.isFinite(rank) ? rank : sellers.length + 1}`,
          sourceRank: Number.isFinite(rank) ? rank : sellers.length + 1,
          title: normalizeLine(item.name),
          shopName: normalizeLine(item.brand?.name) || null,
          shopNameEvidenceState: item.brand?.name ? 'STAFF_FILE_HTML' : 'UNKNOWN',
          sourceLabel: 'STAFF_FILE_ETSY_HTML',
          rating: null,
          reviewCount: null,
          price: offers.price != null ? String(offers.price) : null,
          priceAmount: parseNumberEvidence(offers.price).value,
          priceCurrency: normalizeLine(offers.priceCurrency) || null,
          originalPrice: offers.priceSpecification?.price != null ? String(offers.priceSpecification.price) : null,
          originalPriceAmount: parseNumberEvidence(offers.priceSpecification?.price).value,
          discountPercent: null,
          totalViews: null, avgViews: null, views24h: null, totalSold: null, sold24h: null,
          revenue: null, revenueCurrency: null, revenueApproximate: false, revenueRaw: null,
          favorites: null, favoriteRate: null, favoriteRateApproximate: false,
          conversionRate: null, conversionRateApproximate: false,
          createdDate: null, createdRaw: null, updatedRaw: null,
          tags: [], tagSource: 'NO_TAGS_REPORTED', categories: [], country: null, shopCountry: null,
          url: normalizeLine(item.url) || null,
          evidenceSource: 'STAFF_MANUAL_ASSERTION',
          evidenceState: 'UNVERIFIED_INPUT',
          evidenceProvider: 'ETSY_SEARCH_HTML',
          isSynthetic: false,
          selected: true,
          rawBlock: JSON.stringify(entry)
        });
      }
    }
  });
  return finalizeParsedInput({
    normalizedRaw,
    parserVersion: 'ETSY_SEARCH_HTML_JSONLD_V1',
    inputFormat: 'HTML',
    searchContext: { appliedFilters: [], unappliedFilters: [], resultCount: null, pageContainsAds: false, sortMode: null },
    sellers
  });
}

function parseEtsySearchInput(rawText, inputFormat = 'AUTO') {
  const requested = String(inputFormat || 'AUTO').trim().toUpperCase();
  const trimmed = String(rawText || '').trim();
  if (requested === 'CSV' || (requested === 'AUTO' && /^[^\n]+,[^\n]+\r?\n/.test(trimmed))) return parseEtsySearchCsv(rawText);
  if (requested === 'HTML' || (requested === 'AUTO' && /^\s*<(?:!doctype|html)/i.test(trimmed))) return parseEtsySearchHtml(rawText);
  return parseHeyEtsyPastedText(rawText);
}

module.exports = {
  decodeEntities,
  isUnknown,
  parseNumberEvidence,
  parseBooleanEvidence,
  normalizeIsoTimestamp,
  parseMoney,
  parseHeyEtsyPastedText,
  parseEtsySearchCsv,
  parseEtsySearchHtml,
  parseEtsySearchInput
};
