/**
 * ASIN Batching & Filtering Engine for Helium 10 Xray Reports and manually
 * pasted ASIN lists. Groups ASINs into Cerebro-ready batches of up to 10.
 *
 * Fail-closed truth rules:
 *  - Never invents ASINs. Output identifiers are exactly the ones supplied.
 *  - Never pads a short/empty input with static catalog data.
 *  - Never defaults price/sales for a field the source didn't provide;
 *    those stay `null` (UNKNOWN) instead.
 *  - Empty or fully-filtered-out input returns success:false with an
 *    INSUFFICIENT_EVIDENCE code instead of a synthetic batch.
 */

const OUTLIER_NEGATIVE_KEYWORDS = [
  'toy', 'toys', 'plastic', 'dog', 'cat', 'pet', 'costume', 'baby bib', 'watch',
  'cheap', 'dress', 'shoes', 'phone case', 'keychain', 'sticker', 'mug cup'
];

const ASIN_FORMAT = /^[A-Z0-9]{10}$/;
const MANUAL_PASTE_MIN = 10;
const MANUAL_PASTE_MAX = 30;

function firstDefined(row, keys) {
  for (const key of keys) {
    const val = row[key];
    if (val !== undefined && val !== null && val !== '') return val;
  }
  return undefined;
}

function parseNumericField(row, keys) {
  const raw = firstDefined(row, keys);
  if (raw === undefined) return null;
  const parsed = parseFloat(String(raw).replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function filterAndBatchXrayAsins(xrayData, seedKeyword = 'Custom Gift') {
  let rawRows = [];

  if (Array.isArray(xrayData) && xrayData.length > 0) {
    rawRows = xrayData;
  } else if (typeof xrayData === 'string' && xrayData.trim().length > 0) {
    // Manual-paste contract: 10-30 unique, well-formed ASINs, proven only as
    // the identifiers Staff supplied — reject rather than silently coerce.
    const tokens = xrayData.split(/[\s,;\n]+/).map(a => a.trim()).filter(Boolean).map(a => a.toUpperCase());

    const invalid = tokens.filter(t => !ASIN_FORMAT.test(t));
    if (invalid.length > 0) {
      return {
        success: false,
        code: 'INVALID_ASIN_FORMAT',
        error: `${invalid.length} supplied entr${invalid.length === 1 ? 'y is' : 'ies are'} not a valid 10-character ASIN (e.g. "${invalid[0]}").`,
        cleanAsinsCount: 0
      };
    }

    const uniqueTokens = [...new Set(tokens)];
    if (uniqueTokens.length !== tokens.length) {
      return {
        success: false,
        code: 'DUPLICATE_ASINS',
        error: `Duplicate ASINs supplied (${tokens.length} entries, only ${uniqueTokens.length} unique). Please paste ${MANUAL_PASTE_MIN}-${MANUAL_PASTE_MAX} unique ASINs.`,
        cleanAsinsCount: 0
      };
    }

    if (uniqueTokens.length < MANUAL_PASTE_MIN || uniqueTokens.length > MANUAL_PASTE_MAX) {
      return {
        success: false,
        code: 'ASIN_COUNT_OUT_OF_RANGE',
        error: `Please paste between ${MANUAL_PASTE_MIN} and ${MANUAL_PASTE_MAX} unique ASINs (received ${uniqueTokens.length}).`,
        cleanAsinsCount: 0
      };
    }

    rawRows = uniqueTokens.map(asin => ({ ASIN: asin }));
  }

  if (rawRows.length === 0) {
    return {
      success: false,
      code: 'INSUFFICIENT_EVIDENCE',
      error: 'No ASIN or Xray row evidence was supplied.',
      cleanAsinsCount: 0
    };
  }

  const seedLower = seedKeyword.toLowerCase();
  const seedWords = seedLower.split(/\s+/).filter(w => w.length > 2);

  const cleanAsins = [];
  const rejectedAsins = [];
  const seenAsins = new Set();

  rawRows.forEach((row, idx) => {
    const asin = String(row.ASIN || row.asin || row['ASIN'] || row['Asin'] || '').trim().toUpperCase();
    if (!asin || asin.length < 8 || seenAsins.has(asin)) return;

    const rawTitle = firstDefined(row, ['Title', 'title', 'Product Details', 'Product Title']);
    const title = rawTitle !== undefined ? String(rawTitle).trim() : null;
    const titleLower = (title || '').toLowerCase();

    const price = parseNumericField(row, ['Price', 'price', 'Price  $', 'Price $']);
    const sales = parseNumericField(row, ['Sales', 'sales', 'Parent Level Sales', 'ASIN Sales']);

    // 1. Filter by configured price floor/ceiling. Only applies when a real
    // price was supplied — never invent one to filter on. The reason text
    // states only the observed price vs. the configured threshold; it makes
    // no origin/quality/nationality claim the price alone can't support.
    if (price !== null && price < 9.99) {
      rejectedAsins.push({ asin, title, reason: `Below configured price floor (Price $${price} < $9.99)` });
      return;
    }
    if (price !== null && price > 99.99) {
      rejectedAsins.push({ asin, title, reason: `Above configured price ceiling (Price $${price} > $99.99)` });
      return;
    }

    // 2. Filter out negative outlier keywords (only meaningful when a title exists).
    if (title && OUTLIER_NEGATIVE_KEYWORDS.some(bad => titleLower.includes(bad))) {
      rejectedAsins.push({ asin, title, reason: 'Contains negative outlier keyword (Unrelated category)' });
      return;
    }

    // 3. Score niche relevance for sort ordering only — never presented as verified data.
    let relevanceScore = 0;
    if (title) {
      relevanceScore = 50;
      seedWords.forEach(word => {
        if (titleLower.includes(word)) relevanceScore += 25;
      });
      if (/necklace|collar|gift|regalo|sweatshirt/.test(titleLower)) relevanceScore += 20;
    }

    seenAsins.add(asin);
    cleanAsins.push({
      asin,
      title,
      price,
      sales,
      relevanceScore,
      hasMetadata: Boolean(title || price !== null || sales !== null)
    });
  });

  if (cleanAsins.length === 0) {
    return {
      success: false,
      code: 'INSUFFICIENT_EVIDENCE',
      error: 'All supplied ASINs were invalid, duplicate, or filtered out — no clean ASINs remain.',
      cleanAsinsCount: 0,
      rejectedSample: rejectedAsins.slice(0, 5)
    };
  }

  // Stable sort: relevance first, then sales — but ONLY when both sides have
  // a known sales figure. Unknown sales never competes as if it were 0; an
  // unknown-vs-known (or unknown-vs-unknown) comparison falls through to the
  // stable sort's input-order preservation instead of asserting a rank.
  cleanAsins.sort((a, b) => {
    if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
    if (typeof a.sales === 'number' && typeof b.sales === 'number' && a.sales !== b.sales) {
      return b.sales - a.sales;
    }
    return 0;
  });

  const hasAnySourceMetadata = cleanAsins.some(i => i.hasMetadata);

  const batches = [];
  for (let start = 0; start < cleanAsins.length; start += 10) {
    const pool = cleanAsins.slice(start, start + 10);
    const batchNumber = batches.length + 1;
    const rationale = hasAnySourceMetadata
      ? `${pool.length} ASINs for "${seedKeyword}", sorted by source-reported relevance/sales where available. Fields not present in the source are unknown.`
      : `${pool.length} manually supplied ASIN identifiers only. No price, sales, or ranking data was provided — order reflects input order, not verified performance.`;

    batches.push({
      batchNumber,
      batchName: `Batch ${batchNumber}: ${pool.length} ASINs${pool.length < 10 ? ' (partial)' : ''}`,
      rationale,
      asinCount: pool.length,
      asins: pool.map(i => i.asin),
      items: pool.map(i => ({ asin: i.asin, title: i.title, price: i.price, sales: i.sales })),
      cerebroCommand: pool.map(i => i.asin).join(' ')
    });
  }

  return {
    success: true,
    seedKeyword,
    totalInputAsins: rawRows.length,
    totalCleanAsins: cleanAsins.length,
    rejectedCount: rejectedAsins.length,
    batchCount: batches.length,
    rejectedSample: rejectedAsins.slice(0, 5),
    hasSourceMetadata: hasAnySourceMetadata,
    batches
  };
}

module.exports = {
  filterAndBatchXrayAsins,
  batchAsins: filterAndBatchXrayAsins
};
