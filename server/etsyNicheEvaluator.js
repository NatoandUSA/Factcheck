// A transparent, source-data-only decision aid for a seed phrase.  It is not
// Etsy's ranking algorithm and it does not predict sales or grant authority.

function nonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function median(values) {
  const known = values.filter(value => value !== null).sort((a, b) => a - b);
  if (!known.length) return null;
  const mid = Math.floor(known.length / 2);
  return known.length % 2 ? known[mid] : (known[mid - 1] + known[mid]) / 2;
}

function percent(numerator, denominator) {
  return denominator ? Math.round((numerator / denominator) * 100) : null;
}

function tokenize(value) {
  return String(value || '').toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) || [];
}

function topTerms(values, limit = 8) {
  const counts = new Map();
  values.forEach(value => {
    tokenize(value).forEach(term => {
      if (term.length < 3) return;
      counts.set(term, (counts.get(term) || 0) + 1);
    });
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }));
}

function topTags(sellers, limit = 13) {
  const counts = new Map();
  sellers.forEach(seller => (Array.isArray(seller.tags) ? seller.tags : []).forEach(tag => {
    const cleaned = String(tag || '').trim().toLowerCase();
    if (cleaned) counts.set(cleaned, (counts.get(cleaned) || 0) + 1);
  }));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));
}

function countryKey(value) {
  return String(value || '').trim().toUpperCase();
}

function coverage(sellers, selector) {
  return percent(sellers.filter(selector).length, sellers.length);
}

function evaluateEtsyNiche({ seedPhrase, sellers }) {
  const rows = Array.isArray(sellers) ? sellers : [];
  const ageKnown = rows.filter(row => nonNegative(row.ageDays) !== null);
  const velocityKnown = rows.filter(row => nonNegative(row.sold24h) !== null || nonNegative(row.views24h) !== null);
  const freshVelocity = rows.filter(row => nonNegative(row.ageDays) !== null && row.ageDays <= 90 && (nonNegative(row.sold24h) || 0) > 0);
  const countryKnown = rows.filter(row => countryKey(row.country));
  const vietnamRows = rows.filter(row => ['VN', 'VNM', 'VIETNAM', 'VIET NAM', 'VIỆT NAM'].includes(countryKey(row.country)));
  const chinaRows = rows.filter(row => ['CN', 'CHN', 'CHINA', 'TRUNG QUOC', 'TRUNG QUỐC'].includes(countryKey(row.country)));
  const prices = rows.map(row => nonNegative(row.priceAmount)).filter(value => value !== null);
  const explicitCurrencies = [...new Set(rows.map(row => String(row.priceCurrency || '').trim().toUpperCase()).filter(Boolean))];
  const comparablePrice = explicitCurrencies.length === 1 && prices.length ? median(prices) : null;
  const knownConversion = rows.map(row => nonNegative(row.conversionRate)).filter(value => value !== null);
  const titleCoverage = coverage(rows, row => Boolean(String(row.title || '').trim()));
  const tagCoverage = coverage(rows, row => Array.isArray(row.tags) && row.tags.length > 0);
  const metricsCoverage = coverage(rows, row => nonNegative(row.totalViews) !== null || nonNegative(row.totalSold) !== null || nonNegative(row.views24h) !== null || nonNegative(row.sold24h) !== null);
  const countryCoverage = coverage(rows, row => Boolean(countryKey(row.country)));
  const velocityCoverage = coverage(rows, row => nonNegative(row.views24h) !== null || nonNegative(row.sold24h) !== null);
  const adKnown = rows.filter(row => typeof row.isAd === 'boolean');
  const indicatorCount = [titleCoverage, tagCoverage, metricsCoverage, countryCoverage, velocityCoverage].filter(value => value !== null && value >= 60).length;
  const confidence = rows.length ? Math.round((indicatorCount / 5) * 100) : 0;
  const demandSignal = velocityKnown.length
    ? (freshVelocity.length ? 'FRESH_VELOCITY_PRESENT' : 'VELOCITY_REPORTED_NO_FRESH_SALES_SIGNAL')
    : 'VELOCITY_UNKNOWN';
  const decision = rows.length < 10 || confidence < 40
    ? 'NEEDS_MORE_DATA'
    : freshVelocity.length || (median(knownConversion) || 0) >= 2
      ? 'PROCEED_TO_PATTERN_RESEARCH'
      : 'RESEARCH_BEFORE_COMMITTING';
  const nextDataRequest = [];
  if (velocityCoverage === null || velocityCoverage < 50) nextDataRequest.push('Add views_24h and sold_24h for more listings or capture a second snapshot 7 days later.');
  if (tagCoverage === null || tagCoverage < 50) nextDataRequest.push('Capture real listing tags/categories from listing pages for the candidates you may learn from.');
  if (countryCoverage === null || countryCoverage < 50) nextDataRequest.push('Add country for sourcing-fit analysis; unknown country is not treated as China or Vietnam.');
  if (rows.length < 10) nextDataRequest.push('Capture at least 10 matching listings across search pages before making a niche decision.');
  return {
    seedPhrase: String(seedPhrase || '').trim() || 'UNKNOWN',
    decision,
    confidence,
    disclaimer: 'Research decision aid based only on staff-imported source fields. It is not Etsy ranking, a seller-quality judgment, a sales forecast, or publish authority.',
    scorecard: [
      { key: 'demand', label: 'Demand & velocity', value: demandSignal, detail: velocityKnown.length ? `${velocityKnown.length}/${rows.length} rows report 24h views or sold; median 24h sold: ${median(rows.map(row => nonNegative(row.sold24h))) ?? 'UNKNOWN'}.` : 'No 24h velocity reported.' },
      { key: 'freshness', label: 'New listings selling', value: freshVelocity.length ? `${freshVelocity.length} signal(s)` : 'UNKNOWN / none reported', detail: ageKnown.length ? `${freshVelocity.length}/${ageKnown.length} known-age rows are ≤90 days with source-reported 24h sales.` : 'Listing age is UNKNOWN.' },
      { key: 'competition', label: 'Competition structure', value: `${rows.length} captured listings`, detail: adKnown.length ? `${percent(adKnown.filter(row => row.isAd).length, adKnown.length)}% of rows with a reported ad flag are ads.` : 'Ad flag is UNKNOWN.' },
      { key: 'seo', label: 'SEO pattern coverage', value: `${tagCoverage ?? 0}% tags`, detail: `${titleCoverage ?? 0}% titles; top title words and tags are shown below only when supplied by the file.` },
      { key: 'sourcing', label: 'Operational sourcing fit', value: countryKnown.length ? `${vietnamRows.length} Vietnam · ${chinaRows.length} China` : 'Country UNKNOWN', detail: countryKnown.length ? `${countryCoverage}% country coverage. Country is an operational preference filter, not a quality or trust judgment.` : 'No country data supplied.' },
      { key: 'economics', label: 'Price & conversion', value: comparablePrice !== null ? `Median price: ${comparablePrice} ${explicitCurrencies[0]}` : prices.length ? 'Price currency UNKNOWN / mixed' : 'Price UNKNOWN', detail: `${knownConversion.length ? `Median conversion: ${median(knownConversion)}%.` : 'Conversion UNKNOWN.'} ${comparablePrice === null && prices.length ? 'Price values are retained but no price band is calculated until the export states one currency.' : 'Values are compared only within the reported currency; no conversion is inferred.'}` },
      { key: 'data', label: 'Data confidence', value: `${confidence}/100`, detail: `${metricsCoverage ?? 0}% metric coverage · ${velocityCoverage ?? 0}% velocity coverage · ${tagCoverage ?? 0}% tag coverage.` }
    ],
    patterns: { titleTerms: topTerms(rows.map(row => row.title)), tags: topTags(rows) },
    nextDataRequest
  };
}

module.exports = { evaluateEtsyNiche };
