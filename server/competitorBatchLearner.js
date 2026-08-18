const cheerio = require('cheerio');
const { callLLM } = require('./llmService');

const ACCEPTED_EVIDENCE_SOURCES = new Set([
  'HEYETSY_HTML',
  'ETSY_CARD_HTML',
  'CSV_UPLOAD',
  'STAFF_MANUAL_ASSERTION'
]);

function nullableText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function nullableInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const cleaned = String(value).replace(/[^0-9-]/g, '');
  if (!cleaned) return null;
  const parsed = Number.parseInt(cleaned, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeUrl(rawUrl) {
  const url = nullableText(rawUrl);
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return `https://www.etsy.com${url}`;
  return url;
}

function makeSeller({
  id,
  title,
  shopName,
  country,
  listingAge,
  views24h,
  favorites,
  sold24h,
  price,
  rating,
  url,
  evidenceSource,
  assertedBy = null,
  assertedAt = null,
  selected
}) {
  return {
    id,
    title: nullableText(title),
    shopName: nullableText(shopName),
    country: nullableText(country),
    listingAge: nullableText(listingAge),
    views24h: nullableInteger(views24h),
    favorites: nullableInteger(favorites),
    sold24h: nullableInteger(sold24h),
    price: nullableText(price),
    rating: nullableText(rating),
    url: normalizeUrl(url),
    evidenceSource,
    assertedBy: assertedBy ?? null,
    assertedAt: assertedAt ?? null,
    isSynthetic: false,
    selected: Boolean(selected)
  };
}

/**
 * Parse seller/listing evidence from uploaded HTML/CSV only.
 *
 * Truth rules:
 * - No plausible defaults for missing shop/country/age/rating/price/metrics.
 * - Missing numeric evidence stays null (UNKNOWN), never 0 unless the source
 *   explicitly reported zero.
 * - No random engagement metrics.
 * - Every row carries the evidence source that produced it.
 */
function parseEtsySearchResults({ htmlContent = '', csvRows = [] }) {
  const sellers = [];

  if (htmlContent && htmlContent.trim()) {
    const $ = cheerio.load(htmlContent);

    // HeyEtsy/export-style table rows.
    $('tr').each((idx, el) => {
      const tds = $(el).find('td');
      if (tds.length < 6) return;

      const titleAnchor = $(tds[1]).find('a').first();
      const title = nullableText(titleAnchor.text()) || nullableText($(tds[1]).text());
      if (!title || title.length <= 5 || /rank|title|shop/i.test(title)) return;

      sellers.push(makeSeller({
        id: `etsy-${idx}`,
        title,
        shopName: $(tds[2]).text(),
        price: $(tds[3]).text(),
        views24h: $(tds[4]).text(),
        sold24h: $(tds[5]).text(),
        favorites: tds.length > 6 ? $(tds[6]).text() : null,
        country: tds.length > 7 ? $(tds[7]).text() : null,
        listingAge: tds.length > 8 ? $(tds[8]).text() : null,
        rating: null,
        url: titleAnchor.attr('href'),
        evidenceSource: 'HEYETSY_HTML',
        selected: sellers.length < 10
      }));
    });

    // Etsy listing-card HTML contains far fewer metrics than export tables.
    // Preserve what is actually present and leave everything else UNKNOWN.
    if (sellers.length < 3) {
      $('div[data-search-results-container] div.v2-listing-card, div.listing-link, div.wt-card').each((idx, el) => {
        const title = nullableText($(el).find('h3, h2, .v2-listing-card__title').text());
        if (!title || title.length <= 5) return;

        sellers.push(makeSeller({
          id: `etsy-card-${idx}`,
          title,
          shopName: $(el).find('.wt-text-caption, .v2-listing-card__shop').text(),
          country: null,
          listingAge: null,
          views24h: null,
          sold24h: null,
          favorites: null,
          price: $(el).find('.currency-value, span.money, p.wt-text-title-01').first().text(),
          rating: null,
          url: $(el).find('a').first().attr('href'),
          evidenceSource: 'ETSY_CARD_HTML',
          selected: sellers.length < 10
        }));
      });
    }
  }

  if (Array.isArray(csvRows) && csvRows.length > 0) {
    csvRows.forEach((row, idx) => {
      const title = nullableText(row.Title ?? row.title ?? row['Item Title'] ?? row.Keyword);
      if (!title || title.length <= 5) return;

      sellers.push(makeSeller({
        id: `etsy-csv-${idx}`,
        title,
        shopName: row.Shop ?? row.ShopName ?? row['Shop Name'],
        views24h: row.Views ?? row['Views 24h'] ?? row.views,
        sold24h: row.Sold ?? row['Sold 24h'] ?? row.sales,
        favorites: row.Favorites ?? row.favorites,
        price: row.Price ?? row.price,
        country: row.Country ?? row.country,
        listingAge: row.Age ?? row['Listing Age'],
        rating: row.Rating ?? row.rating ?? row['Shop Rating'],
        url: row.URL ?? row.url ?? row.Link,
        evidenceSource: 'CSV_UPLOAD',
        selected: sellers.length < 10
      }));
    });
  }

  return sellers;
}

function displayEvidence(value) {
  return value === undefined || value === null || value === '' ? 'UNKNOWN' : String(value);
}

/**
 * Client seller objects are never allowed to self-assert an observed source.
 * The authenticated server converts them into explicit Staff assertions and
 * binds actor + timestamp. Raw HTML/CSV can retain observed provenance only
 * when the server parses that raw source itself.
 */
function sanitizeStaffManualAssertions(sellers, actorId, assertedAt = new Date().toISOString()) {
  return (Array.isArray(sellers) ? sellers : [])
    .filter(s => s && s.selected !== false)
    .slice(0, 30)
    .map((seller, index) => makeSeller({
      id: seller.id || `staff-assertion-${index + 1}`,
      title: seller.title,
      shopName: seller.shopName,
      country: seller.country,
      listingAge: seller.listingAge,
      views24h: seller.views24h,
      favorites: seller.favorites,
      sold24h: seller.sold24h,
      price: seller.price,
      rating: seller.rating,
      url: seller.url,
      evidenceSource: 'STAFF_MANUAL_ASSERTION',
      assertedBy: actorId,
      assertedAt,
      selected: true
    }))
    .filter(s => s.title && s.title.length > 5);
}

function normalizeSelectedSeller(seller, index) {
  return makeSeller({
    id: seller.id || `seller-evidence-${index + 1}`,
    title: seller.title,
    shopName: seller.shopName,
    country: seller.country,
    listingAge: seller.listingAge,
    views24h: seller.views24h,
    favorites: seller.favorites,
    sold24h: seller.sold24h,
    price: seller.price,
    rating: seller.rating,
    url: seller.url,
    evidenceSource: seller.evidenceSource,
    assertedBy: seller.assertedBy,
    assertedAt: seller.assertedAt,
    selected: true
  });
}

/**
 * Build an Etsy SEO recommendation from seller/listing evidence.
 *
 * This is a recommendation/modeling step, not Product Truth. It may derive
 * title/tag patterns from observed listing titles, but it may not invent
 * materials, shipping/processing promises, personalization limits, supplier
 * facts, or missing seller metrics.
 */
async function synthesizeEtsyBatchLearnings({ seedPhrase, sellers = [], category = 'Apparel: Sweatshirt', llmConfig = {} }) {
  const requested = sellers.filter(s => s && s.selected !== false).slice(0, 30);
  const invalidEvidence = requested.filter(s => !ACCEPTED_EVIDENCE_SOURCES.has(s.evidenceSource));
  if (invalidEvidence.length > 0) {
    const error = new Error('UNVERIFIED_SELLER_EVIDENCE: seller evidence must come from an uploaded source or an explicit Staff manual assertion.');
    error.code = 'UNVERIFIED_SELLER_EVIDENCE';
    throw error;
  }

  const selectedSellers = requested
    .map((seller, index) => normalizeSelectedSeller(seller, index))
    .filter(s => s.title && s.title.length > 5);

  if (selectedSellers.length < 3) {
    const error = new Error('INSUFFICIENT_EVIDENCE: select at least 3 seller/listing evidence rows.');
    error.code = 'INSUFFICIENT_EVIDENCE';
    throw error;
  }

  const tagFrequency = {};
  selectedSellers.forEach(s => {
    const cleanTitle = s.title.toLowerCase().replace(/[^a-z0-9\s,|-]/g, ' ');
    const parts = cleanTitle
      .split(/[,|-]/)
      .map(p => p.trim())
      .filter(p => p.length >= 3 && p.length <= 20);
    parts.forEach(tag => {
      tagFrequency[tag] = (tagFrequency[tag] || 0) + 1;
    });
  });

  const sortedTags = Object.keys(tagFrequency)
    .sort((a, b) => tagFrequency[b] - tagFrequency[a])
    .slice(0, 13);

  const sellerSummaries = selectedSellers.map((s, i) =>
    `Evidence #${i + 1} [${s.evidenceSource}]: "${s.title}" | Shop: ${displayEvidence(s.shopName)} | Country: ${displayEvidence(s.country)} | Views24h: ${displayEvidence(s.views24h)} | Sold24h: ${displayEvidence(s.sold24h)} | Favorites: ${displayEvidence(s.favorites)} | Price: ${displayEvidence(s.price)} | Rating: ${displayEvidence(s.rating)}`
  ).join('\n');

  const observedPriceCount = selectedSellers.filter(s => s.price !== null).length;
  const observedSoldCount = selectedSellers.filter(s => s.sold24h !== null).length;
  const observedViewsCount = selectedSellers.filter(s => s.views24h !== null).length;

  const prompt = `You are an Etsy SEO analyst. Analyze only the seller/listing evidence below for the seed phrase "${seedPhrase}" (${category}).

IMPORTANT EVIDENCE RULES:
- UNKNOWN means the source did not provide that fact. UNKNOWN is NOT zero.
- Do not infer shop status, country, listing age, views, sales, favorites, rating, price, revenue, or conversion when absent.
- Do not call these rows "best sellers", "top sellers", "revenue leaders", or "winners" unless the supplied evidence itself proves that claim.
- You MAY derive title hooks, recipient/occasion language, and tag patterns from the supplied titles.
- This step has NO Product Truth. Do NOT invent materials, dimensions, garment/fabric facts, supplier facts, processing/shipping times, personalization limits, compliance facts, or publish approval.

SELLER/LISTING EVIDENCE:
${sellerSummaries}

DERIVED TITLE/TAG CANDIDATES FROM OBSERVED TITLES:
${sortedTags.join(', ')}

Return ONLY raw JSON without markdown fences:
{
  "etsyTitle": "SEO title recommendation under 140 characters",
  "etsyTags": ["up to 13 title-derived tags, each <=20 chars"],
  "learnedInsights": {
    "titleFormula": "derived title-pattern observation only",
    "priceRecommendation": "modeled recommendation only when enough observed price evidence exists; otherwise INSUFFICIENT_EVIDENCE",
    "secretSauce": "modeled inference clearly labeled as inference"
  }
}

Never return materials, shipping promises, product specifications, care instructions, or personalization limits from this evidence-only task.`;

  const llmOutput = await callLLM({
    provider: llmConfig.provider || 'GEMINI',
    keys: llmConfig.keys || {},
    prompt,
    systemInstruction: 'You are an Etsy SEO evidence analyst. Missing facts stay UNKNOWN. Return only raw JSON and never invent Product Truth.'
  });

  let text = llmOutput;
  if (text.includes('```json')) {
    text = text.split('```json')[1].split('```')[0].trim();
  } else if (text.includes('```')) {
    text = text.split('```')[1].split('```')[0].trim();
  }

  const parsed = JSON.parse(text);
  const learnedInsights = parsed.learnedInsights || {};
  const priceRecommendation = observedPriceCount >= 3
    ? `MODELED RECOMMENDATION: ${nullableText(learnedInsights.priceRecommendation) || 'No recommendation returned.'}`
    : 'INSUFFICIENT_EVIDENCE';

  const synthesized = {
    etsyTitle: String(parsed.etsyTitle || '').slice(0, 140),
    etsyTags: Array.isArray(parsed.etsyTags)
      ? parsed.etsyTags.slice(0, 13).map(t => String(t).trim().slice(0, 20)).filter(Boolean)
      : [],
    // Hard Product Truth gates stay empty until Owner/Product Truth supplies them.
    etsyMaterials: [],
    etsyPersonalizationInstructions: '',
    etsyDescription: '',
    learnedInsights: {
      titleFormula: `DERIVED FROM OBSERVED TITLES: ${nullableText(learnedInsights.titleFormula) || 'No formula returned.'}`,
      priceRecommendation,
      secretSauce: `MODELED INFERENCE: ${nullableText(learnedInsights.secretSauce) || 'No inference returned.'}`
    },
    truthWarnings: [
      'PRODUCT_TRUTH_REQUIRED_FOR_MATERIALS',
      'PRODUCT_TRUTH_REQUIRED_FOR_DESCRIPTION',
      'OWNER_ASSERTION_REQUIRED_FOR_PERSONALIZATION',
      'OWNER_ASSERTION_REQUIRED_FOR_PROCESSING_AND_SHIPPING'
    ]
  };

  return {
    success: true,
    seedPhrase,
    category,
    sellerCount: selectedSellers.length,
    sellers: selectedSellers,
    evidenceSummary: {
      sellerCount: selectedSellers.length,
      observedPriceCount,
      observedSoldCount,
      observedViewsCount,
      sources: [...new Set(selectedSellers.map(s => s.evidenceSource))],
      manualAssertions: selectedSellers
        .filter(s => s.evidenceSource === 'STAFF_MANUAL_ASSERTION')
        .map(s => ({
          title: s.title,
          url: s.url,
          assertedBy: s.assertedBy,
          assertedAt: s.assertedAt
        }))
    },
    synthesizedListing: synthesized
  };
}

module.exports = {
  ACCEPTED_EVIDENCE_SOURCES,
  nullableInteger,
  parseEtsySearchResults,
  sanitizeStaffManualAssertions,
  synthesizeEtsyBatchLearnings
};
