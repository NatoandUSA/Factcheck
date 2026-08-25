// Deterministic ranking for *research priority*, not Etsy search ranking and
// not a claim that a listing will sell. It only uses fields supplied by the
// staff export; absent values contribute no score and are reported as unknown.

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function cappedLog(value, ceiling) {
  const known = numberOrNull(value);
  if (known === null) return null;
  return Math.min(1, Math.log1p(known) / Math.log1p(ceiling));
}

function normalizeCountry(country) {
  return String(country || '').trim().toUpperCase().replace(/\./g, '');
}

function countryPreference(country) {
  const normalized = normalizeCountry(country);
  if (['VN', 'VNM', 'VIETNAM', 'VIET NAM', 'VIỆT NAM'].includes(normalized)) return { score: 8, label: 'Vietnam sourcing preference' };
  // This is an operational sourcing filter selected by the workspace owner,
  // never a quality or trust judgment about a seller or its people.
  if (['CN', 'CHN', 'CHINA', 'TRUNG QUOC', 'TRUNG QUỐC'].includes(normalized)) return { score: -8, label: 'Restricted sourcing region preference' };
  return { score: 0, label: null };
}

function recencyScore(ageDays) {
  const age = numberOrNull(ageDays);
  if (age === null) return null;
  if (age <= 30) return 1;
  if (age <= 90) return 0.85;
  if (age <= 180) return 0.65;
  if (age <= 365) return 0.4;
  return 0.15;
}

function averageKnown(values) {
  const known = values.filter(value => value !== null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : null;
}

function rankEtsyResearchListings(sellers, options = {}) {
  const preference = options.countryPreference !== false;
  return (Array.isArray(sellers) ? sellers : []).map((seller, index) => {
    const soldVelocity = cappedLog(seller.sold24h, 50);
    const viewVelocity = cappedLog(seller.views24h, 5000);
    const conversion = numberOrNull(seller.conversionRate) === null ? null : Math.min(1, seller.conversionRate / 10);
    const demand = averageKnown([soldVelocity, viewVelocity, conversion]);
    const lifetime = averageKnown([
      cappedLog(seller.totalSold, 5000), cappedLog(seller.totalViews, 100000),
      cappedLog(seller.favorites, 5000), cappedLog(seller.reviewCount, 5000)
    ]);
    const freshness = recencyScore(seller.ageDays);
    const badges = (seller.isStarSeller === true ? 2 : 0) + (seller.isBestSeller === true ? 2 : 0) + (seller.hasFreeShipping === true ? 1 : 0);
    const location = preference ? countryPreference(seller.country) : { score: 0, label: null };
    const evidenceParts = [soldVelocity, viewVelocity, conversion, lifetime, freshness].filter(value => value !== null).length;
    const baseScore = (demand === null ? 0 : demand * 45) + (lifetime === null ? 0 : lifetime * 30) + (freshness === null ? 0 : freshness * 15) + badges;
    const score = Math.max(0, Math.min(100, Math.round(baseScore + location.score)));
    const reasons = [];
    if (freshness !== null && seller.ageDays <= 90) reasons.push(`New listing (${seller.ageDays} days)`);
    if (numberOrNull(seller.sold24h) !== null && seller.sold24h > 0) reasons.push(`${seller.sold24h} sold in 24h (source-reported)`);
    if (numberOrNull(seller.views24h) !== null && seller.views24h > 0) reasons.push(`${seller.views24h} views in 24h (source-reported)`);
    if (numberOrNull(seller.totalSold) !== null && seller.totalSold > 0) reasons.push(`${seller.totalSold} lifetime sold (source-reported)`);
    if (Array.isArray(seller.tags) && seller.tags.length) reasons.push(`${seller.tags.length} source tags`);
    if (location.label) reasons.push(location.label);
    return {
      ...seller,
      researchPriority: {
        score,
        confidence: Math.round((evidenceParts / 5) * 100),
        reasons,
        unknownSignals: ['sold24h', 'views24h', 'conversionRate', 'totalSold', 'totalViews', 'favorites', 'reviewCount', 'ageDays'].filter(key => numberOrNull(seller[key]) === null),
        isAd: seller.isAd === true,
        countryPreference: location.label || 'No country preference applied'
      },
      _sourceIndex: index
    };
  }).sort((a, b) => b.researchPriority.score - a.researchPriority.score || b.researchPriority.confidence - a.researchPriority.confidence || a._sourceIndex - b._sourceIndex)
    .map(({ _sourceIndex, ...seller }, index) => ({ ...seller, researchPriority: { ...seller.researchPriority, rank: index + 1 } }));
}

module.exports = { rankEtsyResearchListings };
