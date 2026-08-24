const crypto = require('crypto');

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
  const sellers = [];
  const seen = new Set();
  let duplicatesRemoved = 0;
  for (const seller of parsed) {
    const identity = [seller.title, seller.shopName, seller.priceAmount, seller.priceCurrency]
      .map(value => String(value ?? '').trim().toLowerCase()).join('|');
    if (seen.has(identity)) {
      duplicatesRemoved += 1;
      continue;
    }
    seen.add(identity);
    sellers.push({ ...seller, sourceRank: sellers.length + 1, id: `pasted-${sellers.length + 1}` });
  }

  const contentHash = crypto.createHash('sha256').update(normalizedRaw.trim()).digest('hex');
  return {
    parserVersion: 'HEYETSY_PASTED_TEXT_V1',
    contentHash,
    searchContext: parseSearchContext(headerLines),
    sellers: sellers.slice(0, 30),
    parsedCount: sellers.length,
    returnedCount: Math.min(sellers.length, 30),
    duplicatesRemoved,
    truncated: sellers.length > 30,
    tagSuggestions: aggregateTagSuggestions(sellers)
  };
}

module.exports = {
  decodeEntities,
  isUnknown,
  parseNumberEvidence,
  parseMoney,
  parseHeyEtsyPastedText
};
