import { validateAmazonListing, validateEtsyListing, getUtf8Bytes } from './complianceValidator.js';
import { validateProductTruthCard } from '../../shared/productTruth.js';

const clamp = value => Math.max(0, Math.min(100, Math.round(value)));
const words = value => String(value || '').trim().split(/\s+/).filter(Boolean);
const uniqueRatio = value => {
  const tokens = words(value).map(token => token.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
  return tokens.length ? new Set(tokens).size / tokens.length : 0;
};

const LANGUAGE_MARKERS = Object.freeze({
  EN: new Set(['blanket','gift','gifts','sister','friend','best','birthday','christmas','personalized','custom','keepsake','throw','for','with','from']),
  ES: new Set(['regalo','regalos','hermana','amiga','mejor','cumpleanos','cumpleaños','navidad','personalizado','personalizada','para','con','desde']),
  VI: new Set(['có','không','theo','thông','tin','trên','sản','phẩm','và','hoặc','được','với','cho'])
});

const visibleTokens = value => String(value || '').normalize('NFKC').toLowerCase()
  .match(/[\p{L}\p{N}]+/gu) || [];

export function assessLanguageConsistency(listing, marketplace) {
  const target = String(listing?.listingLanguage || listing?.canonicalQualityEvidence?.listingLanguage || '').toUpperCase();
  if (!['EN', 'ES'].includes(target)) return { target: target || null, mixed: false, foreignMarkers: [] };
  const text = String(marketplace || '').toUpperCase() === 'AMAZON'
    ? [listing?.amazonTitle, ...(listing?.amazonBullets || []), listing?.amazonDescription]
    : [listing?.etsyTitle, ...(listing?.etsyTags || []), listing?.etsyDescription];
  const tokens = visibleTokens(text.filter(Boolean).join(' '));
  const foreignLanguages = target === 'EN' ? ['ES', 'VI'] : ['EN', 'VI'];
  const hits = foreignLanguages.flatMap(language => tokens
    .filter(token => LANGUAGE_MARKERS[language].has(token))
    .map(token => ({ language, token })));
  const distinct = [...new Map(hits.map(hit => [`${hit.language}:${hit.token}`, hit])).values()];
  // One isolated foreign word may be a brand, proper name, or canonical product
  // token. Two distinct high-signal markers are required before copy is flagged.
  return { target, mixed: distinct.length >= 2, foreignMarkers: distinct };
}

function truthAssessment(listing) {
  const canonical = listing?.canonicalQualityEvidence;
  if (canonical) {
    const valid = canonical.productTruthBound === true
      && Number.isInteger(Number(canonical.productTruthRevisionId))
      && /^[a-f0-9]{64}$/i.test(String(canonical.productTruthHash || ''));
    return { valid, errors: valid ? [] : ['CANONICAL_PRODUCT_TRUTH_BINDING_INVALID'],
      verifiedFacts: Array.from({ length: Math.max(0, Number(canonical.verifiedFactCount) || 0) }),
      context: { productTruthRevisionId: canonical.productTruthRevisionId, source: 'CANONICAL_REVIEW_PACKAGE' } };
  }
  const context = {
    productId: listing?.productId ?? listing?.dbId ?? listing?.id,
    listingVersion: Number(listing?.listingVersion ?? listing?.listing_version)
  };
  const result = validateProductTruthCard(listing?.productTruthCard, context);
  return { ...result, context };
}

function amazonAssessment(listing) {
  const validation = validateAmazonListing(listing);
  const title = String(listing?.amazonTitle || '').trim();
  const highlights = String(listing?.itemHighlights || '').trim();
  const bullets = Array.isArray(listing?.amazonBullets) ? listing.amazonBullets.filter(Boolean) : [];
  const description = String(listing?.amazonDescription || '').trim();
  const searchTerms = String(listing?.amazonSearchTerms || '').trim();
  const mediaClass = String(listing?.mediaClass || listing?.media_class || '').toUpperCase();
  const blockers = [...validation.issues];
  const warnings = [...validation.warnings];

  if (!title) blockers.push('Amazon title is required.');
  if (mediaClass !== 'MEDIA' && title.length > 75) blockers.push(`Amazon title exceeds the 75-character non-media policy (${title.length}/75).`);
  if (mediaClass === 'MEDIA') warnings.push('Media title limit must be resolved from the exact category policy before upload.');
  if (highlights.length > 125) blockers.push(`Item Highlights exceed 125 characters (${highlights.length}/125).`);
  if (!description) warnings.push('Product description is empty.');

  const searchScore = clamp(
    (title.length >= 45 && title.length <= 75 ? 45 : title ? 25 : 0)
    + (searchTerms ? 35 : 0)
    + (searchTerms && getUtf8Bytes(searchTerms) >= 150 && getUtf8Bytes(searchTerms) <= 249 ? 20 : 0)
  );
  const language = assessLanguageConsistency(listing, 'AMAZON');
  if (language.mixed) warnings.push(`MIXED_LANGUAGE_COPY: ${language.target} listing contains material ${[...new Set(language.foreignMarkers.map(item => item.language))].join('/')} copy.`);
  const readabilityScore = clamp((uniqueRatio(title) * 55) + (bullets.length === 5 ? 25 : bullets.length * 5)
    + (description.length >= 300 ? 20 : description.length / 15) - (language.mixed ? 25 : 0));
  return { validation, blockers, warnings, searchScore, readabilityScore };
}

function etsyAssessment(listing) {
  const validation = validateEtsyListing(listing);
  const title = String(listing?.etsyTitle || '').trim();
  const tags = Array.isArray(listing?.etsyTags) ? listing.etsyTags.map(tag => String(tag).trim()).filter(Boolean) : [];
  const description = String(listing?.etsyDescription || '').trim();
  const blockers = [...validation.issues];
  const warnings = [...validation.warnings];
  if (!title) blockers.push('Etsy title is required.');
  if (words(title).length > 15) warnings.push(`Etsy title has ${words(title).length} words; keep it clear and buyer-readable (target: 15 or fewer).`);
  if (new Set(tags.map(tag => tag.toLowerCase())).size !== tags.length) warnings.push('Etsy tags contain duplicates.');
  if (!description) warnings.push('Etsy description is empty.');

  const diverseTags = new Set(tags.flatMap(tag => words(tag).map(token => token.toLowerCase()))).size;
  const keywordChain = (title.match(/,/g) || []).length >= 2;
  const searchScore = clamp((title ? 30 : 0) + (Math.min(tags.length, 13) / 13 * 50) + Math.min(20, diverseTags));
  const language = assessLanguageConsistency(listing, 'ETSY');
  if (language.mixed) warnings.push(`MIXED_LANGUAGE_COPY: ${language.target} listing contains material ${[...new Set(language.foreignMarkers.map(item => item.language))].join('/')} copy.`);
  const readabilityScore = clamp((uniqueRatio(title) * 45)
    + (words(title).length > 0 && words(title).length <= 15 ? 30 : 5)
    + (keywordChain ? 0 : 10)
    + (description.length >= 300 ? 15 : description.length / 20)
    - (language.mixed ? 25 : 0));
  return { validation, blockers, warnings, searchScore, readabilityScore };
}

export function evaluateDraftQuality(listing, marketplace, assetPlan = {}) {
  const normalizedMarketplace = String(marketplace || '').toUpperCase();
  if (!listing || !['AMAZON', 'ETSY'].includes(normalizedMarketplace)) {
    return { marketplace: normalizedMarketplace, score: 0, verdict: 'BLOCKED', blockers: ['A listing and marketplace are required.'], warnings: [], metrics: [] };
  }

  const truth = truthAssessment(listing);
  const surface = normalizedMarketplace === 'AMAZON' ? amazonAssessment(listing) : etsyAssessment(listing);
  const blockers = [...surface.blockers];
  const warnings = [...surface.warnings];
  if (!truth.valid) blockers.push(...truth.errors.map(code => `Product Truth: ${code}`));
  if (listing.status === 'NOT_PERSISTED') blockers.push('Draft is not persisted to the authoritative database.');

  const expectedAssets = Math.max(0, Number(assetPlan.expected) || 0);
  const readyAssets = Math.max(0, Math.min(expectedAssets, Number(assetPlan.ready) || 0));
  const assetScore = expectedAssets ? clamp(readyAssets / expectedAssets * 100) : 0;
  if (!expectedAssets) warnings.push('Image-plan readiness was not measured.');
  else if (readyAssets < expectedAssets) warnings.push(`Image plan is incomplete (${readyAssets}/${expectedAssets} prompts ready).`);

  const complianceScore = clamp(100 - (surface.validation.issues.length * 35) - (surface.validation.warnings.length * 8) - (surface.blockers.length * 25));
  const truthScore = truth.valid ? 100 : clamp((truth.verifiedFacts?.length || 0) * 10);
  const metrics = [
    { key: 'truth', label: 'Truth & evidence', score: truthScore, weight: 30 },
    { key: 'compliance', label: 'Policy compliance', score: complianceScore, weight: 25 },
    { key: 'search', label: 'Search coverage', score: surface.searchScore, weight: 20 },
    { key: 'readability', label: 'Clarity & conversion', score: surface.readabilityScore, weight: 15 },
    { key: 'assets', label: 'Image plan', score: assetScore, weight: 10 }
  ];
  const score = clamp(metrics.reduce((sum, metric) => sum + metric.score * metric.weight / 100, 0));
  const verdict = blockers.length ? 'BLOCKED' : score >= 85 && warnings.length <= 2 ? 'REVIEW_READY' : 'NEEDS_QA';
  return {
    marketplace: normalizedMarketplace,
    score,
    verdict,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    metrics,
    verifiedFactCount: truth.verifiedFacts?.length || 0,
    note: 'Quality heuristic for review prioritization; it does not predict sales or authorize marketplace submission.'
  };
}

export function compareDraftEvaluations(left, right) {
  const rank = evaluation => [
    evaluation.blockers?.length ? 0 : 1,
    -(evaluation.blockers?.length || 0),
    -(evaluation.warnings?.length || 0),
    evaluation.metrics?.find(metric => metric.key === 'truth')?.score || 0,
    evaluation.score || 0
  ];
  const a = rank(left); const b = rank(right);
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return b[index] - a[index];
  return 0;
}

export function selectPreviewListing(currentListing, history = [], activeListingId = null) {
  const currentId = currentListing?.dbId ?? currentListing?.id;
  const activeId = activeListingId ?? currentId;
  // The exact canonical review package is deliberately ephemeral and may have
  // the same DB id as a thinner history row. Never let that history row erase
  // its server-derived dependency/quality evidence.
  if (currentListing && String(currentId) === String(activeId)) return currentListing;
  return history.find(item => String(item?.dbId ?? item?.id) === String(activeId))
    || currentListing || history[0] || null;
}

export default { assessLanguageConsistency, evaluateDraftQuality, compareDraftEvaluations, selectPreviewListing };
