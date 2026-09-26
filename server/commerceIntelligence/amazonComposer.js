'use strict';
// Listing composition.
//
// Two hard rules, both deliberate:
//   1. Every FACTUAL statement comes from the Product Truth form. A field the
//      operator left empty stays UNKNOWN in QA/accounting and is omitted from
//      buyer-facing copy; it never produces invented filler.
//   2. Every KEYWORD comes from the operator's own Cerebro export. Nothing is
//      generated from a hard-coded phrase list.
const { fold, contentTokens, tokens, bytes, titleCase, packTokens } = require('./text');
const { partition, buildLadder } = require('./allocation');
const { allowedProductFamilies, allowedRecipientFamilies, matchesProductFamily, PRODUCT_FAMILIES } = require('./semantic');
const { renderBuyerValue } = require('./amazonBuyerLanguage');

function cleanBuyerValue(value) {
  return String(value || '').trim()
    .replace(/\s*(?:[-—–]\s*)?theo listing tham chiếu\s*$/iu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Bullet labels are the only fixed English in the output. The Spanish-market
// listings in this catalogue need Spanish ones, so the set is switchable.
const LABEL_SETS = Object.freeze({
  EN: Object.freeze({ code: 'EN', gift: 'GIFT FOR', product: 'PRODUCT', material: 'MATERIAL', care: 'Care',
    sizeColor: 'SIZE & COLOR', sizes: 'Sizes', colors: 'Colors', personalized: 'PERSONALIZED',
    details: 'DETAILS', packaging: 'PACKAGING & SHIPPING', shipsFrom: 'Ships from', forWord: 'for',
    personalizationWord: 'Personalization', packagingWord: 'Packaging', weight: 'Weight', quantity: 'Quantity',
    purity: 'Purity / plating', finish: 'Finish', gemstones: 'Gemstones', components: 'Components', dimensions: 'Dimensions', origin: 'Origin',
    style: 'Style', design: 'Design', theme: 'Theme' }),
  ES: Object.freeze({ code: 'ES', gift: 'REGALO PARA', product: 'PRODUCTO', material: 'MATERIAL', care: 'Cuidado',
    sizeColor: 'TALLA Y COLOR', sizes: 'Tallas', colors: 'Colores', personalized: 'PERSONALIZADO',
    details: 'DETALLES', packaging: 'EMPAQUE Y ENVIO', shipsFrom: 'Enviado desde', forWord: 'para',
    personalizationWord: 'Personalizacion', packagingWord: 'Empaque', weight: 'Peso', quantity: 'Cantidad',
    purity: 'Pureza / chapado', finish: 'Acabado', gemstones: 'Gemas', components: 'Componentes', dimensions: 'Dimensiones', origin: 'Origen',
    style: 'Estilo', design: 'Diseño', theme: 'Tema' })
});

function normalizeList(value) {
  if (Array.isArray(value)) return value.map(cleanBuyerValue).filter(Boolean);
  return String(value || '').split(/[,;\n]/).map(cleanBuyerValue).filter(Boolean);
}

function normalizeTruth(input = {}) {
  const universalFeatures = [
    ...normalizeList(input.features),
    String(input.specifications || '').trim(), String(input.capabilities || '').trim(),
    String(input.intendedUse || '').trim(), String(input.compatibility || input.softwareCompatibility || '').trim(),
    String(input.performance || '').trim(), String(input.durability || '').trim(),
    String(input.instructions || '').trim(), String(input.warranty || '').trim(),
    String(input.safetyWarnings || input.safety || '').trim()
  ].filter(Boolean);
  return {
    productType: cleanBuyerValue(input.productType),
    productName: cleanBuyerValue(input.productName),
    recipient: cleanBuyerValue(input.recipient),
    occasion: cleanBuyerValue(input.occasion),
    materials: normalizeList(input.materials || input.composition || input.ingredients),
    purity: cleanBuyerValue(input.purity),
    finish: cleanBuyerValue(input.finish),
    gemstones: normalizeList(input.gemstones),
    components: normalizeList(input.components),
    colors: normalizeList(input.colors),
    sizes: normalizeList(input.sizes),
    dimensions: normalizeList(input.dimensions),
    weight: cleanBuyerValue(input.weight),
    quantity: cleanBuyerValue(input.quantity),
    features: [...new Set(universalFeatures.map(cleanBuyerValue).filter(Boolean))],
    personalization: cleanBuyerValue(input.personalization),
    packaging: cleanBuyerValue(input.packaging),
    care: cleanBuyerValue(input.care),
    shipFrom: cleanBuyerValue(input.shipFrom),
    origin: cleanBuyerValue(input.origin),
    style: cleanBuyerValue(input.style),
    design: cleanBuyerValue(input.design),
    theme: cleanBuyerValue(input.theme)
  };
}

function renderTruthForBuyer(truth, language = 'EN') {
  if (String(language).toUpperCase() !== 'ES') return truth;
  const one = value => renderBuyerValue(value, 'ES');
  const many = values => (values || []).map(one).filter(Boolean);
  return Object.freeze({
    ...truth,
    productType: one(truth.productType), productName: one(truth.productName), recipient: one(truth.recipient), occasion: one(truth.occasion),
    materials: many(truth.materials), purity: one(truth.purity), finish: one(truth.finish), gemstones: many(truth.gemstones),
    components: many(truth.components), colors: many(truth.colors), sizes: many(truth.sizes), dimensions: many(truth.dimensions),
    weight: one(truth.weight), quantity: one(truth.quantity), features: many(truth.features), personalization: one(truth.personalization),
    packaging: one(truth.packaging), care: one(truth.care), shipFrom: one(truth.shipFrom), origin: one(truth.origin),
    style: one(truth.style), design: one(truth.design), theme: one(truth.theme)
  });
}

// Greedy set-cover over keyword tokens: each phrase is worth its score plus
// the new vocabulary it brings, so the title indexes for as many distinct
// searches as the character budget allows instead of repeating one theme.
function pickPhrases(candidates, { charLimit, joiner, used = new Set(), maxPhrases = 6, minNewTokens = 1, seedBest = false }) {
  const picked = [];
  let text = '';
  if (seedBest) {
    const seed = candidates.find(c => titleCase(c.phrase).length <= charLimit);
    if (seed) {
      picked.push(seed);
      text = titleCase(seed.phrase);
      for (const token of contentTokens(seed.phrase)) used.add(token);
    }
  }
  for (let round = picked.length; round < maxPhrases; round++) {
    let best = null;
    let bestGain = 0;
    for (const candidate of candidates) {
      if (picked.includes(candidate)) continue;
      const candidateTokens = contentTokens(candidate.phrase);
      const fresh = candidateTokens.filter(t => !used.has(t));
      if (fresh.length < minNewTokens) continue;
      const next = text ? text + joiner + titleCase(candidate.phrase) : titleCase(candidate.phrase);
      if (next.length > charLimit) continue;
      const gain = candidate.score * (0.5 + fresh.length / Math.max(1, candidateTokens.length));
      if (gain > bestGain) { bestGain = gain; best = { candidate, next, fresh }; }
    }
    if (!best) break;
    picked.push(best.candidate);
    text = best.next;
    for (const token of contentTokens(best.candidate.phrase)) used.add(token);
  }
  return { text, picked, used };
}

function clipAtWord(value, limit) {
  const text = String(value || '').trim();
  if (text.length <= limit) return text;
  const boundary = text.slice(0, limit + 1).lastIndexOf(' ');
  return text.slice(0, boundary > Math.floor(limit * 0.60) ? boundary : limit).replace(/[\s,;:.|]+$/, '');
}

function composeTitle(truth, candidates, limit, labelLanguage = 'EN') {
  const productNameLead = cleanBuyerValue(truth.productName).split(/\s*(?:[,;|]|—|–)\s*/u)[0];
  const identitySource = labelLanguage === 'ES' && productNameLead
    ? productNameLead
    : (truth.productType || truth.productName || '');
  const identity = titleCase(identitySource);
  if (!identity) return pickPhrases(candidates, { charLimit: limit, joiner: ' | ', maxPhrases: 3, seedBest: true });

  const used = new Set(contentTokens(identity));
  const picked = [];
  let text = clipAtWord(identity, limit);
  for (const candidate of candidates) {
    const visiblePhrase = labelLanguage === 'ES' ? renderBuyerValue(candidate.phrase, 'ES') : candidate.phrase;
    const phrase = titleCase(visiblePhrase);
    const fresh = contentTokens(candidate.phrase).filter(token => !used.has(token));
    if (!fresh.length) continue;
    const next = `${text} | ${phrase}`;
    if (next.length > limit) continue;
    text = next;
    picked.push(candidate);
    contentTokens(candidate.phrase).forEach(token => used.add(token));
    if (picked.length >= 2) break;
  }
  return { text, picked, used };
}

function buildItemHighlights(truth, limit = 125, L = LABEL_SETS.EN, preferredSubject = '') {
  const subject = preferredSubject || truth.productType || truth.productName || '';
  const pieces = [];
  if (subject) pieces.push(titleCase(subject));
  if (truth.recipient) pieces.push(`${L.forWord} ${truth.recipient}`);
  if (truth.occasion) pieces.push(`— ${truth.occasion}`);

  const details = [];
  if (truth.materials.length) details.push(`${L.material.charAt(0) + L.material.slice(1).toLowerCase()}: ${truth.materials.join(', ')}`);
  else if (truth.personalization) details.push(`${L.personalizationWord}: ${truth.personalization}`);
  else if (truth.sizes.length) details.push(`${L.sizes}: ${truth.sizes.join(', ')}`);
  else if (truth.quantity) details.push(`Quantity: ${truth.quantity}`);
  else if (truth.features.length) details.push(truth.features[0]);

  const base = pieces.join(' ').replace(/\s+—\s+/g, ' — ');
  const text = details.length ? `${base}${base ? '. ' : ''}${details[0]}` : base;
  return clipAtWord(text, limit);
}

function buildBullets(truth, keywords, limit = 230, L = LABEL_SETS.EN, consumed = []) {
  const clip = value => {
    if (value.length <= limit) return value;
    const boundary = value.slice(0, limit + 1).lastIndexOf(' ');
    return value.slice(0, boundary > Math.floor(limit * 0.70) ? boundary : limit).replace(/[\s,;:.]+$/, '');
  };
  const bullets = [];
  const add = (label, text) => {
    const value = cleanBuyerValue(text);
    if (!value || value.includes('[THIẾU DỮ LIỆU:')) return;
    const sentence = /[.!?]$/.test(value) ? value : `${value}.`;
    bullets.push(clip(`${label} — ${sentence}`));
  };

  const subject = cleanBuyerValue(truth.productName || truth.productType);
  const forWhom = truth.recipient ? ` ${L.forWord} ${truth.recipient}` : '';
  const giftLabel = truth.recipient ? `${L.gift} ${truth.recipient.toUpperCase()}` : L.product;
  if (subject) add(giftLabel, `${subject}${forWhom}.${truth.occasion ? ` ${truth.occasion}.` : ''}`);

  const materialFacts = [
    ...truth.materials, truth.purity, truth.finish, ...truth.gemstones, ...truth.components
  ].filter(Boolean).join(', ');
  if (materialFacts) add(L.material, `${materialFacts}${truth.care ? `. ${L.care}: ${truth.care}` : ''}`);

  const sizeColor = [];
  if (truth.sizes.length) sizeColor.push(`${L.sizes} ${truth.sizes.join(', ')}`);
  if (truth.dimensions.length) sizeColor.push(truth.dimensions.join(', '));
  if (truth.colors.length) sizeColor.push(`${L.colors} ${truth.colors.join(', ')}`);
  const productDetails = [];
  if (truth.weight) productDetails.push(`${L.weight} ${truth.weight}`);
  if (truth.quantity) productDetails.push(`${L.quantity} ${truth.quantity}`);
  if (sizeColor.length) add(L.sizeColor, [...sizeColor, ...productDetails].join('. '));
  else if (productDetails.length) add(L.details, productDetails.join('. '));

  if (truth.personalization) add(L.personalized, truth.personalization);
  else if (truth.features.length) add(L.details, truth.features.join('. '));
  else {
    const secondary = [truth.style && `${L.style}: ${truth.style}`, truth.design && `${L.design}: ${truth.design}`,
      truth.theme && `${L.theme}: ${truth.theme}`, truth.origin && `${L.origin}: ${truth.origin}`].filter(Boolean);
    if (secondary.length) add(L.details, secondary.join('. '));
  }

  const closing = [];
  if (truth.features.length && truth.personalization) closing.push(truth.features.join('. '));
  if (truth.packaging) closing.push(truth.packaging);
  if (truth.shipFrom) closing.push(`${L.shipsFrom} ${truth.shipFrom}`);
  if (closing.length) add(L.packaging, closing.join('. '));
  else if (truth.origin && !bullets.some(item => item.includes(`${L.origin}: ${truth.origin}`))) add(L.details, `${L.origin}: ${truth.origin}`);

  // Unknown facts stay in missingFacts()/QA accounting and never leak into buyer-facing copy.
  // Keyword coverage is handled by title/highlight/backend fields rather than capacity stuffing.
  return bullets;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function buildDescription(truth, keywords, L = LABEL_SETS.EN, consumed = [], extraPhraseCount = 4) {
  const subject = cleanBuyerValue(truth.productName || truth.productType);
  const parts = [];
  const opening = [
    subject,
    truth.recipient ? `${L.forWord} ${truth.recipient}` : '',
    truth.occasion ? `— ${truth.occasion}` : ''
  ].filter(Boolean).join(' ').replace(/\s+—\s+/g, ' — ');
  if (opening) parts.push(`<p>${escapeHtml(opening)}.</p>`);

  const details = [];
  if (truth.materials.length) details.push(`${L.material.charAt(0) + L.material.slice(1).toLowerCase()}: ${truth.materials.join(', ')}`);
  if (truth.purity) details.push(`${L.purity}: ${truth.purity}`);
  if (truth.finish) details.push(`${L.finish}: ${truth.finish}`);
  if (truth.gemstones.length) details.push(`${L.gemstones}: ${truth.gemstones.join(', ')}`);
  if (truth.components.length) details.push(`${L.components}: ${truth.components.join(', ')}`);
  if (truth.sizes.length) details.push(`${L.sizes}: ${truth.sizes.join(', ')}`);
  if (truth.dimensions.length) details.push(`${L.dimensions}: ${truth.dimensions.join(', ')}`);
  if (truth.weight) details.push(`${L.weight}: ${truth.weight}`);
  if (truth.quantity) details.push(`${L.quantity}: ${truth.quantity}`);
  if (truth.colors.length) details.push(`${L.colors}: ${truth.colors.join(', ')}`);
  if (truth.personalization) details.push(`${L.personalizationWord}: ${truth.personalization}`);
  if (truth.packaging) details.push(`${L.packagingWord}: ${truth.packaging}`);
  if (truth.care) details.push(`${L.care}: ${truth.care}`);
  if (truth.shipFrom) details.push(`${L.shipsFrom}: ${truth.shipFrom}`);
  if (truth.origin) details.push(`${L.origin}: ${truth.origin}`);
  if (truth.style) details.push(`${L.style}: ${truth.style}`);
  if (truth.design) details.push(`${L.design}: ${truth.design}`);
  if (truth.theme) details.push(`${L.theme}: ${truth.theme}`);
  if (details.length) parts.push(`<p>${escapeHtml(details.join('. '))}.</p>`);

  if (truth.features.length) {
    const featureText = truth.features.map(value => /[.!?]$/.test(value) ? value : value + '.').join(' ');
    parts.push(`<p>${escapeHtml(featureText)}</p>`);
  }
  return parts.join('\n');
}

function missingFacts(truth) {
  const missing = [];
  if (!truth.productType) missing.push('Loại sản phẩm (productType)');
  if (!truth.materials.length) missing.push('Chất liệu / thành phần');
  if (!truth.sizes.length && !truth.dimensions.length) missing.push('Size / dimensions');
  if (!truth.colors.length) missing.push('Màu');
  if (!truth.features.length) missing.push('Điểm bán đã xác minh (features)');
  if (!truth.packaging) missing.push('Đóng gói');
  if (!truth.shipFrom) missing.push('Nơi gửi hàng');
  return missing;
}

function compose(scoredKeywords, truthInput, options = {}) {
  const opt = {
    titlePolicyLimit: options.titleLimit ?? 75,
    highlightPolicyLimit: options.highlightLimit ?? 125,
    searchTermPolicyBytes: Math.min(249, options.searchTermBytes ?? 249),
    titleLimit: Math.floor((options.titleLimit ?? 75) * 0.99),
    highlightLimit: Math.floor((options.highlightLimit ?? 125) * 0.99),
    // Amazon generic keywords are a TOTAL budget, not N independent 249-byte buckets.
    searchTermBytes: Math.floor(Math.min(249, options.searchTermBytes ?? 249) * 0.99),
    bulletLimit: options.bulletLimit ?? 230,
    dropStopwordsInSearchTerms: options.dropStopwordsInSearchTerms !== false,
    excludeReviewKeywords: options.excludeReviewKeywords === true,
    labelLanguage: LABEL_SETS[String(options.labelLanguage || 'EN').toUpperCase()] ? String(options.labelLanguage).toUpperCase() : 'EN',
    minRelevanceCopy: options.minRelevanceCopy ?? 0.3,
    minRelevanceSearch: options.minRelevanceSearch ?? 0.15,
    mustContainAny: options.mustContainAny
  };
  const truth = normalizeTruth(truthInput);
  const buyerTruth = renderTruthForBuyer(truth, opt.labelLanguage);

  const allowedRecipients = allowedRecipientFamilies([
    truth.recipient, truth.productName, truth.productType, truth.occasion,
    ...(Array.isArray(opt.mustContainAny) ? opt.mustContainAny : [opt.mustContainAny || ''])
  ].filter(Boolean));
  const { usable, rejected } = partition(scoredKeywords, {
    minRelevance: opt.minRelevanceSearch,
    excludeReview: opt.excludeReviewKeywords,
    allowedRecipients
  });

  // A recipient or occasion match does not name the product. Without this
  // separation, a high-volume phrase such as "gift for daughter" can occupy
  // the whole title while never saying necklace, blanket, mug, etc.
  const contextTokens = new Set(contentTokens(`${truth.recipient} ${truth.occasion}`));
  const identityTokens = new Set(contentTokens(`${truth.productType} ${truth.productName}`)
    .filter(token => !contextTokens.has(token)));
  const productFamilies = allowedProductFamilies([truth.productType, truth.productName]);
  const fallbackTokens = opt.mustContainAny
    ? contentTokens(Array.isArray(opt.mustContainAny) ? opt.mustContainAny.join(' ') : opt.mustContainAny)
    : [];
  const anchorNouns = identityTokens.size ? identityTokens : new Set(fallbackTokens);
  const namesProduct = phrase => productFamilies.size
    ? matchesProductFamily(phrase, productFamilies)
    : (!anchorNouns.size || contentTokens(phrase).some(token => anchorNouns.has(token)));
  const phraseProductFamilies = phrase => {
    const phraseTokens = new Set(contentTokens(phrase));
    return new Set(PRODUCT_FAMILIES.map((family, index) => family.some(token => phraseTokens.has(token)) ? index : -1)
      .filter(index => index >= 0));
  };
  const hasConflictingProduct = phrase => {
    if (!productFamilies.size) return false;
    const observed = phraseProductFamilies(phrase);
    return observed.size > 0 && [...observed].some(index => !productFamilies.has(index));
  };
  const truthTokens = new Set(contentTokens(Object.values(truth).flat().join(' ')));
  const variantTerms = new Set(['book','libro','coin','moneda','cross','cruz','dogtag','dogtags','paw','angel','crown','sunshine']);
  const hasUnverifiedVariant = phrase => contentTokens(phrase).some(token => variantTerms.has(token) && !truthTokens.has(token));
  const disallowedProductTokens = new Set(PRODUCT_FAMILIES
    .filter((_, index) => productFamilies.size && !productFamilies.has(index)).flat());
  // Visible customer copy uses the curated MKL tiers only. Rare-token and
  // outlier rows remain fully accounted and may contribute non-redundant
  // generic-keyword roots after the safety screens, but cannot silently write
  // phrases such as a different product subtype or an OCR/typing anomaly.
  const forCopy = usable.filter(k => !k.suspectedBrand
    && !k.backendOnly
    && k.masterTier !== 'OUTLIER_REVIEW'
    && !k.rareReviewToken
    && !hasConflictingProduct(k.phrase)
    && !hasUnverifiedVariant(k.phrase)
    && k.relevance >= opt.minRelevanceCopy
    && k.tokenCount >= 2 && k.tokenCount <= 7);
  const productCopy = forCopy.filter(k => namesProduct(k.phrase));
  const orderedCopy = [...productCopy, ...forCopy.filter(k => !productCopy.includes(k))];

  // Product Truth supplies the identity anchor; research can enrich the title
  // but never replace that identity or cause productName to become final copy
  // merely because the operator entered a long value.
  const title = composeTitle(buyerTruth, orderedCopy, opt.titleLimit, opt.labelLanguage);
  const highlightSubject = opt.labelLanguage === 'ES' ? title.text.split(' | ')[0] : '';
  const highlightText = buildItemHighlights(buyerTruth, opt.highlightLimit, LABEL_SETS[opt.labelLanguage], highlightSubject);
  const highlights = { text: highlightText, picked: [], used: new Set(contentTokens(highlightText)) };

  // Finalize all visible copy BEFORE backend terms, so Generic Keywords can
  // exclude every token already indexed visibly.
  const L = LABEL_SETS[opt.labelLanguage];
  const consumed = [...title.picked.map(p => p.phrase), ...highlights.picked.map(p => p.phrase)];
  const bulletKeywords = forCopy.filter(k => !consumed.some(p => p.toLowerCase() === k.phrase.toLowerCase()));
  const bullets = buildBullets(buyerTruth, bulletKeywords, opt.bulletLimit, L, consumed);
  const descriptionKeywords = forCopy.filter(k => !consumed.some(p => p.toLowerCase() === k.phrase.toLowerCase()));
  const description = buildDescription(buyerTruth, descriptionKeywords, L, consumed);

  const visibleIndexed = new Set([
    ...contentTokens(title.text), ...contentTokens(highlights.text),
    ...contentTokens(bullets.join(' ')), ...contentTokens(description)
  ]);

  const searchTokenPool = [];
  const rareTokens = new Set([...(scoredKeywords.meta?.rareReviewTokens || [])].map(fold));
  for (const keyword of usable) {
    // High-confidence rival-brand phrases contribute nothing to backend terms.
    // Rare frequency alone is REVIEW metadata and is not an automatic exclusion.
    if (keyword.suspectedBrand) continue;
    // A rare token is useful as an audit signal but is not safe enough for an
    // automatic backend field. Other verified roots from the same phrase still
    // remain eligible, which maximizes the byte budget without importing typos.
    const list = (opt.dropStopwordsInSearchTerms ? contentTokens(keyword.phrase) : tokens(keyword.phrase))
      .filter(token => !rareTokens.has(fold(token)))
      .filter(token => !disallowedProductTokens.has(token))
      .filter(token => !variantTerms.has(token) || truthTokens.has(token));
    searchTokenPool.push(...list);
  }
  const seen = new Set();
  const orderedPool = searchTokenPool.filter(t => seen.has(t) ? false : (seen.add(t), true));
  const backendEligibleTokens = orderedPool.filter(token => !visibleIndexed.has(token));
  const packed = packTokens(orderedPool, opt.searchTermBytes, new Set(visibleIndexed));
  const searchTermSets = packed.text ? [packed] : [];
  const packedTokens = new Set(packed.tokens);
  const unusedEligibleTokens = backendEligibleTokens.filter(token => !packedTokens.has(token));

  const indexedTokens = new Set([...visibleIndexed, ...packed.tokens]);
  const ladder = buildLadder({
    usable, rejected, placedPhrases: consumed, indexedTokens,
    searchTermSets: searchTermSets.map(set => ({ tokenCount: set.tokens.length }))
  });

  return {
    ppc: ladder.ppc,
    coverage: ladder.coverage,
    rejectedKeywords: ladder.rejected,
    keywordPlacement: consumed,
    title: { text: title.text, chars: title.text.length, limit: opt.titlePolicyLimit, phrases: title.picked.map(p => p.phrase) },
    itemHighlights: { text: highlights.text, chars: highlights.text.length, limit: opt.highlightPolicyLimit, phrases: highlights.picked.map(p => p.phrase) },
    bullets,
    searchTerms: searchTermSets.map(set => ({
      label: 'GENERIC KEYWORDS', text: set.text, bytes: set.bytes,
      limit: opt.searchTermPolicyBytes, tokenCount: set.tokens.length
    })),
    searchTermTotalBytes: searchTermSets.reduce((sum, set) => sum + set.bytes, 0),
    description,
    truth,
    missingFacts: missingFacts(truth),
    analysisMeta: {
      metricAvailability: scoredKeywords.meta?.metricAvailability || {},
      rareReviewTokens: [...(scoredKeywords.meta?.rareReviewTokens || [])].sort(),
      suspectedBrandTokens: [...(scoredKeywords.meta?.brandTokens || [])].sort(),
      inputUniquePhrases: scoredKeywords.meta?.inputUniquePhrases ?? scoredKeywords.length,
      searchDiagnostics: {
        eligibleSafeRoots: orderedPool.length,
        visibleRoots: orderedPool.filter(token => visibleIndexed.has(token)).length,
        backendEligibleRoots: backendEligibleTokens.length,
        backendRoots: packed.tokens.length,
        unusedEligibleRoots: unusedEligibleTokens.length,
        blockedKeywords: rejected.length,
        searchTermsBytes: packed.bytes
      }
    },
    keywordsUsed: {
      title: title.picked.length,
      highlights: highlights.picked.length,
      searchTermTokens: searchTermSets.reduce((sum, set) => sum + set.tokens.length, 0),
      corpus: scoredKeywords.meta?.inputUniquePhrases ?? scoredKeywords.length,
      blocked: scoredKeywords.filter(k => k.ipVerdict === 'BLOCK').length,
      review: scoredKeywords.filter(k => k.ipVerdict === 'REVIEW').length
    },
    capacityTargets: {
      title: { policyLimit: opt.titlePolicyLimit, actual: title.text.length,
        qualityBasis: 'IDENTITY_PLUS_SAFE_CONTEXT' },
      itemHighlights: { policyLimit: opt.highlightPolicyLimit, actual: highlights.text.length,
        qualityBasis: 'VERIFIED_BUYER_DETAIL' },
      bullets: bullets.map(value => ({ workingLimit: opt.bulletLimit, actual: value.length,
        qualityBasis: 'ONE_VERIFIED_BUYER_IDEA_NO_CAPACITY_FILL' })),
      genericKeywords: { policyLimit: opt.searchTermPolicyBytes, actual: packed.bytes,
        unusedEligibleRoots: unusedEligibleTokens.length,
        gapReason: unusedEligibleTokens.length ? 'BYTE_BUDGET_EXHAUSTED_WITH_ELIGIBLE_ROOTS_REMAINING'
          : 'NO_ADDITIONAL_UNIQUE_RELEVANT_NON_REDUNDANT_ROOTS' }
    }
  };
}

module.exports = { compose, normalizeTruth, pickPhrases, buildBullets, buildDescription, missingFacts, LABEL_SETS };
