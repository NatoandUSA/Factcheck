'use strict';
// X-Ray -> Cerebro. Picks the batch of ASINs to reverse-engineer.
//
// Truth rules carried over from Factcheck `server/asinBatcher.js`:
//   - never invent an ASIN, never pad a short list;
//   - a field the export did not supply stays null (UNKNOWN), never 0;
//   - parent-level sales/revenue are never substituted for ASIN-level ones;
//   - every rejection states its reason.
const { fold, contentTokens } = require('./text');
const { classify } = require('./semantic');

const ASIN_FORMAT = /^[A-Z0-9]{10}$/;
const BATCH_SIZE = 10;

const COLUMNS = {
  title: ['product details', 'title', 'product name'],
  asin: ['asin'],
  brand: ['brand'],
  price: ['price $', 'price'],
  asinSales: ['asin sales'],
  parentSales: ['parent level sales', 'parent sales'],
  asinRevenue: ['asin revenue'],
  parentRevenue: ['parent level revenue', 'parent revenue'],
  titleChars: ['title char. count', 'title char count', 'title length'],
  bsr: ['bsr', 'rank'],
  reviews: ['review count', 'reviews'],
  rating: ['ratings', 'rating'],
  reviewVelocity: ['review velocity'],
  fulfillment: ['fulfillment'],
  seller: ['seller', 'sold by'],
  sellerCountry: ['seller country/region', 'seller country'],
  activeSellers: ['active sellers', 'sellers'],
  sponsored: ['sponsored'],
  bestSeller: ['best seller'],
  category: ['category'],
  creationDate: ['creation date', 'date first available'],
  sellerAgeMonths: ['seller age (mo)', 'seller age months'],
  images: ['images']
};

function num(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/[, ]/g, '').replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildMap(header) {
  const normalized = header.map(h => fold(h).trim());
  const map = {};
  for (const [key, labels] of Object.entries(COLUMNS)) {
    for (const label of labels) {
      const index = normalized.indexOf(fold(label));
      if (index >= 0) { map[key] = index; break; }
    }
  }
  return map;
}

function extractXray(sheets) {
  for (const sheet of sheets) {
    const header = sheet.rows[0] || [];
    const map = buildMap(header);
    if (map.asin === undefined || map.title === undefined) continue;
    const rows = [];
    for (let r = 1; r < sheet.rows.length; r++) {
      const row = sheet.rows[r] || [];
      const asin = String(row[map.asin] ?? '').trim().toUpperCase();
      const title = String(row[map.title] ?? '').trim();
      if (!asin && !title) continue;
      const pick = key => (map[key] !== undefined ? row[map[key]] : undefined);
      const text = key => {
        const value = pick(key);
        return value === undefined || value === null || value === '' ? null : String(value).trim();
      };
      rows.push({
        asin, title,
        brand: text('brand'),
        price: num(pick('price')),
        asinSales: num(pick('asinSales')),
        parentSales: num(pick('parentSales')),
        asinRevenue: num(pick('asinRevenue')),
        parentRevenue: num(pick('parentRevenue')),
        titleChars: num(pick('titleChars')),
        bsr: num(pick('bsr')),
        reviews: num(pick('reviews')),
        rating: num(pick('rating')),
        reviewVelocity: num(pick('reviewVelocity')),
        fulfillment: text('fulfillment'),
        seller: text('seller'),
        sellerCountry: text('sellerCountry'),
        activeSellers: num(pick('activeSellers')),
        category: text('category'),
        creationDate: text('creationDate'),
        sellerAgeMonths: num(pick('sellerAgeMonths')),
        images: num(pick('images'))
      });
    }
    if (rows.length) return { sheet: sheet.name, rows };
  }
  return { sheet: null, rows: [] };
}

// A "Save ASIN" style sheet (SKU columns next to an ASIN column) lists the
// operator's OWN listings. Feeding your own ASIN into a competitor batch
// wastes one of ten slots, so those are detected and flagged.
const OWN_SHEET_MARKERS = ['sku cha', 'sku con', 'sku', 'title cu', 'title (75)', 'search term new'];

function extractOwnAsins(sheets) {
  const own = new Map();
  for (const sheet of sheets) {
    const header = (sheet.rows[0] || []).map(h => fold(h).trim());
    const asinIndex = header.indexOf('asin');
    if (asinIndex < 0) continue;
    const looksOwned = OWN_SHEET_MARKERS.some(marker => header.includes(fold(marker)));
    if (!looksOwned) continue;
    for (let r = 1; r < sheet.rows.length; r++) {
      const value = String((sheet.rows[r] || [])[asinIndex] ?? '').trim().toUpperCase();
      if (ASIN_FORMAT.test(value)) own.set(value, sheet.name);
    }
  }
  return own;
}

function median(values) {
  const sorted = values.filter(v => v !== null && Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function finite(value) { return value !== null && value !== undefined && Number.isFinite(Number(value)); }

function diverseTop(rows, compare, limit, maxPerBrand) {
  const counts = new Map(); const picked = [];
  for (const row of [...rows].sort(compare)) {
    const sellerKey = fold(row.brand || row.seller || row.asin);
    const used = counts.get(sellerKey) || 0;
    if (used >= maxPerBrand) continue;
    counts.set(sellerKey, used + 1); picked.push(row);
    if (picked.length >= limit) break;
  }
  return picked;
}

function cohortItem(row) {
  return {
    asin: row.asin, title: row.title, brand: row.brand, seller: row.seller, price: row.price,
    asinSales: row.asinSales, asinRevenue: row.asinRevenue, bsr: row.bsr, reviews: row.reviews,
    reviewVelocity: row.reviewVelocity, sellerAgeMonths: row.sellerAgeMonths, creationDate: row.creationDate,
    relevance: Number(row.relevance.toFixed(3)), compositeScore: Number(row.score.toFixed(4)),
    opportunityScore: finite(row.asinSales) ? Number((row.asinSales / Math.max(25, Number(row.reviews || 0) + 25)).toFixed(4)) : null
  };
}

function buildCohorts(rows, batchSize, maxPerBrand) {
  const desc = field => (a, b) => finite(b[field]) - finite(a[field]) || Number(b[field] || 0) - Number(a[field] || 0) || b.score - a.score;
  const asc = field => (a, b) => finite(b[field]) - finite(a[field]) || Number(a[field] || Infinity) - Number(b[field] || Infinity) || b.score - a.score;
  const newest = (a, b) => {
    const left = Date.parse(a.creationDate || '') || 0; const right = Date.parse(b.creationDate || '') || 0;
    return Boolean(right) - Boolean(left) || right - left || b.score - a.score;
  };
  const opportunity = (a, b) => {
    const left = finite(a.asinSales) ? a.asinSales / Math.max(25, Number(a.reviews || 0) + 25) : -1;
    const right = finite(b.asinSales) ? b.asinSales / Math.max(25, Number(b.reviews || 0) + 25) : -1;
    return right - left || b.score - a.score;
  };
  const definitions = [
    ['COMPOSITE_RELEVANCE', 'Phù hợp seed + hiệu suất tổng hợp', (a, b) => b.score - a.score],
    ['TOP_ASIN_SALES', 'ASIN Sales cao nhất', desc('asinSales')],
    ['TOP_ASIN_REVENUE', 'ASIN Revenue cao nhất', desc('asinRevenue')],
    ['BEST_BSR', 'BSR tốt nhất (số nhỏ hơn)', asc('bsr')],
    ['REVIEW_VELOCITY', 'Review Velocity cao nhất', desc('reviewVelocity')],
    ['YOUNGEST_SELLERS', 'Seller trẻ nhất theo Seller Age (mo)', asc('sellerAgeMonths')],
    ['NEWEST_LISTINGS', 'Listing mới nhất theo Creation Date', newest],
    ['LOW_REVIEW_OPPORTUNITY', 'Sales tốt so với lượng review', opportunity]
  ];
  return definitions.map(([id, label, compare]) => {
    const items = diverseTop(rows, compare, batchSize, maxPerBrand).map(cohortItem);
    return { id, label, size: items.length, partial: items.length < batchSize,
      asins: items.map(item => item.asin), cerebroInput: items.map(item => item.asin).join(', '), items };
  });
}

// Reverse-ASIN research is only as good as the ASINs fed into it. Ten ASINs
// that are all the same seller return one seller's vocabulary; ten that are
// off-niche return noise. Selection therefore balances relevance, proven
// sales, price band and seller diversity.
function selectAsinBatches(xrayRows, {
  anchors = [], library = null, screen = null,
  priceFloor = null, priceCeiling = null, targetPrice = null,
  batchSize = BATCH_SIZE, maxPerBrand = 2, requireSales = false,
  ownAsins = new Map(), excludeOwnAsins = true
} = {}) {
  const anchorTokenSets = anchors.map(a => new Set(contentTokens(a))).filter(s => s.size);
  const prices = xrayRows.map(r => r.price);
  const medianPrice = median(prices);
  const floor = priceFloor === null || priceFloor === undefined ? null : Number(priceFloor);
  const ceiling = priceCeiling === null || priceCeiling === undefined ? null : Number(priceCeiling);
  const anchorPrice = targetPrice !== null && targetPrice !== undefined && targetPrice !== ''
    ? Number(targetPrice) : medianPrice;

  const accepted = [];
  const rejected = [];
  const seen = new Set();

  for (const row of xrayRows) {
    if (!ASIN_FORMAT.test(row.asin)) {
      rejected.push({ ...row, reason: 'ASIN không đúng định dạng 10 ký tự' });
      continue;
    }
    if (seen.has(row.asin)) {
      rejected.push({ ...row, reason: 'Trùng ASIN đã có trong danh sách' });
      continue;
    }
    seen.add(row.asin);

    if (excludeOwnAsins && ownAsins.has(row.asin)) {
      rejected.push({ ...row, reason: `ASIN của chính mình (thấy ở sheet "${ownAsins.get(row.asin)}")` });
      continue;
    }
    if (!row.title) {
      rejected.push({ ...row, reason: 'Không có title — Cerebro cần sản phẩm có nội dung để đối chiếu' });
      continue;
    }
    const ip = library && screen ? screen(row.title, library) : { verdict: 'OK', hits: [] };
    if (ip.verdict === 'BLOCK') {
      rejected.push({ ...row, reason: `Title chứa brand có bản quyền: ${ip.hits.map(h => h.term).join(', ')}` });
      continue;
    }
    if (floor !== null && row.price !== null && row.price < floor) {
      rejected.push({ ...row, reason: `Giá $${row.price} dưới sàn $${floor}` });
      continue;
    }
    if (ceiling !== null && row.price !== null && row.price > ceiling) {
      rejected.push({ ...row, reason: `Giá $${row.price} trên trần $${ceiling}` });
      continue;
    }
    if (requireSales && row.asinSales === null) {
      rejected.push({ ...row, reason: 'Không có số liệu ASIN Sales trong export' });
      continue;
    }

    const titleTokens = new Set(contentTokens(row.title));
    let relevance = 0;
    for (const anchor of anchorTokenSets) {
      let shared = 0;
      for (const token of anchor) if (titleTokens.has(token)) shared++;
      relevance = Math.max(relevance, shared / anchor.size);
    }
    if (anchorTokenSets.length && relevance === 0) {
      rejected.push({ ...row, reason: 'Title không trùng từ nào với từ khoá neo — khác ngách' });
      continue;
    }
    accepted.push({ ...row, relevance, ipVerdict: ip.verdict, ipHits: ip.hits.map(h => h.term),
      isOwn: ownAsins.has(row.asin), clusters: classify(row.title).clusters });
  }

  const maxSales = Math.max(1, ...accepted.map(r => r.asinSales || 0));
  const maxReviews = Math.max(1, ...accepted.map(r => r.reviews || 0));

  for (const row of accepted) {
    const salesScore = row.asinSales === null ? 0.35 : Math.log10(row.asinSales + 1) / Math.log10(maxSales + 1);
    const reviewScore = row.reviews === null ? 0.35 : Math.log10(row.reviews + 1) / Math.log10(maxReviews + 1);
    // A listing whose title is very short carries little keyword vocabulary;
    // one at the 200-char cap is usually keyword-stuffed and still useful.
    const titleScore = row.titleChars === null ? 0.5 : Math.min(1, row.titleChars / 150);
    // Closeness to the price the operator actually intends to sell at.
    const priceScore = anchorPrice && row.price
      ? Math.max(0, 1 - Math.abs(row.price - anchorPrice) / Math.max(anchorPrice, 1))
      : 0.5;
    row.score = 0.34 * row.relevance + 0.26 * salesScore + 0.16 * reviewScore
      + 0.12 * titleScore + 0.12 * priceScore;
    row.scoreParts = {
      relevance: Number(row.relevance.toFixed(3)), sales: Number(salesScore.toFixed(3)),
      reviews: Number(reviewScore.toFixed(3)), title: Number(titleScore.toFixed(3)),
      price: Number(priceScore.toFixed(3))
    };
  }
  accepted.sort((a, b) => b.score - a.score);

  // Seller diversity is enforced PER BATCH. A short batch is allowed; the
  // selector never violates maxPerBrand merely to fill ten slots.
  const remaining = [...accepted];
  const batches = [];
  while (remaining.length) {
    const current = [];
    const brandCount = new Map();
    for (let i = 0; i < remaining.length && current.length < batchSize;) {
      const row = remaining[i];
      const key = fold(row.brand || row.seller || row.asin);
      const used = brandCount.get(key) || 0;
      if (row.brand && used >= maxPerBrand) { i++; continue; }
      remaining.splice(i, 1);
      brandCount.set(key, used + 1);
      current.push(row);
    }
    // Progress is guaranteed because a fresh batch has an empty brandCount.
    if (!current.length) current.push(remaining.shift());
    batches.push(current);
  }

  return {
    medianPrice, anchorPrice,
    ownAsinCount: ownAsins.size,
    totalRows: xrayRows.length,
    acceptedCount: accepted.length,
    rejectedCount: rejected.length,
    rejected,
    rejectedPreview: rejected.slice(0, 40),
    cohorts: buildCohorts(accepted, batchSize, maxPerBrand),
    batches: batches.map((rows, index) => ({
      batchNumber: index + 1,
      size: rows.length,
      partial: rows.length < batchSize,
      cerebroInput: rows.map(r => r.asin).join(', '),
      asins: rows.map(r => r.asin),
      seedAsin: rows[0]?.asin || null,
      items: rows.map((r, itemIndex) => ({
        asin: r.asin, seed: itemIndex === 0, title: r.title, brand: r.brand, price: r.price,
        asinSales: r.asinSales, parentSales: r.parentSales,
        asinRevenue: r.asinRevenue, parentRevenue: r.parentRevenue,
        reviews: r.reviews, rating: r.rating, reviewVelocity: r.reviewVelocity,
        bsr: r.bsr, titleChars: r.titleChars,
        fulfillment: r.fulfillment, seller: r.seller, sellerCountry: r.sellerCountry,
        activeSellers: r.activeSellers, creationDate: r.creationDate, sellerAgeMonths: r.sellerAgeMonths,
        relevance: Number(r.relevance.toFixed(3)), score: Number(r.score.toFixed(4)),
        scoreParts: r.scoreParts, clusters: r.clusters,
        url: `https://www.amazon.com/dp/${r.asin}`
      }))
    }))
  };
}

module.exports = { extractXray, extractOwnAsins, selectAsinBatches, median, BATCH_SIZE };
