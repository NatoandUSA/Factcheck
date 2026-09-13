'use strict';
// Listing composition.
//
// Two hard rules, both deliberate:
//   1. Every FACTUAL statement comes from the Product Truth form. A field the
//      operator left empty is UNKNOWN and produces a visible gap marker, never
//      invented filler.
//   2. Every KEYWORD comes from the operator's own Cerebro export. Nothing is
//      generated from a hard-coded phrase list.
const { fold, contentTokens, tokens, bytes, titleCase, packTokens } = require('./text');
const { partition, buildLadder } = require('./allocation');
const { allowedProductFamilies, allowedRecipientFamilies, matchesProductFamily, PRODUCT_FAMILIES } = require('./semantic');

const GAP = label => `[THIẾU DỮ LIỆU: ${label}]`;

// Bullet labels are the only fixed English in the output. The Spanish-market
// listings in this catalogue need Spanish ones, so the set is switchable.
const LABEL_SETS = Object.freeze({
  EN: Object.freeze({ gift: 'GIFT FOR', product: 'PRODUCT', material: 'MATERIAL', care: 'Care',
    sizeColor: 'SIZE & COLOR', sizes: 'Sizes', colors: 'Colors', personalized: 'PERSONALIZED',
    details: 'DETAILS', packaging: 'PACKAGING & SHIPPING', shipsFrom: 'Ships from', forWord: 'for',
    personalizationWord: 'Personalization', packagingWord: 'Packaging' }),
  ES: Object.freeze({ gift: 'REGALO PARA', product: 'PRODUCTO', material: 'MATERIAL', care: 'Cuidado',
    sizeColor: 'TALLA Y COLOR', sizes: 'Tallas', colors: 'Colores', personalized: 'PERSONALIZADO',
    details: 'DETALLES', packaging: 'EMPAQUE Y ENVIO', shipsFrom: 'Enviado desde', forWord: 'para',
    personalizationWord: 'Personalizacion', packagingWord: 'Empaque' })
});

function normalizeList(value) {
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
  return String(value || '').split(/[,;\n]/).map(v => v.trim()).filter(Boolean);
}

function normalizeTruth(input = {}) {
  return {
    productType: String(input.productType || '').trim(),
    productName: String(input.productName || '').trim(),
    recipient: String(input.recipient || '').trim(),
    occasion: String(input.occasion || '').trim(),
    materials: normalizeList(input.materials),
    purity: String(input.purity || '').trim(),
    finish: String(input.finish || '').trim(),
    gemstones: normalizeList(input.gemstones),
    components: normalizeList(input.components),
    colors: normalizeList(input.colors),
    sizes: normalizeList(input.sizes),
    dimensions: normalizeList(input.dimensions),
    weight: String(input.weight || '').trim(),
    quantity: String(input.quantity || '').trim(),
    features: normalizeList(input.features),
    personalization: String(input.personalization || '').trim(),
    packaging: String(input.packaging || '').trim(),
    care: String(input.care || '').trim(),
    shipFrom: String(input.shipFrom || '').trim(),
    origin: String(input.origin || '').trim(),
    style: String(input.style || '').trim(),
    design: String(input.design || '').trim(),
    theme: String(input.theme || '').trim()
  };
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

function buildBullets(truth, keywords, limit = 230, L = LABEL_SETS.EN, consumed = []) {
  const clip = value => {
    if (value.length <= limit) return value;
    const boundary = value.slice(0, limit + 1).lastIndexOf(' ');
    return value.slice(0, boundary > Math.floor(limit * 0.70) ? boundary : limit).replace(/[\s,;:.]+$/, '');
  };
  const bullets = [];

  const subject = truth.productName || truth.productType || GAP('loại sản phẩm');
  const forWhom = truth.recipient ? ` ${L.forWord} ${truth.recipient}` : '';
  const giftLabel = truth.recipient ? `${L.gift} ${truth.recipient.toUpperCase()}` : L.product;
  bullets.push(clip(`${giftLabel} — ${subject}${forWhom}.${truth.occasion ? ` ${truth.occasion}.` : ''}`));

  bullets.push(clip(truth.materials.length
    ? `${L.material} — ${[
      ...truth.materials,
      truth.purity,
      truth.finish,
      ...truth.gemstones,
      ...truth.components
    ].filter(Boolean).join(', ')}.${truth.care ? ` ${L.care}: ${truth.care}.` : ''}`
    : `${L.material} — ${GAP('chất liệu / thành phần vải')}`));

  const sizeColor = [];
  if (truth.sizes.length) sizeColor.push(`${L.sizes} ${truth.sizes.join(', ')}`);
  if (truth.dimensions.length) sizeColor.push(truth.dimensions.join(', '));
  if (truth.weight) sizeColor.push(truth.weight);
  if (truth.quantity) sizeColor.push(`Quantity ${truth.quantity}`);
  if (truth.colors.length) sizeColor.push(`${L.colors} ${truth.colors.join(', ')}`);
  bullets.push(clip(sizeColor.length
    ? `${L.sizeColor} — ${sizeColor.join('. ')}.`
    : `${L.sizeColor} — ${GAP('size / màu đã xác nhận')}`));

  const endSentence = value => (/[.!?]$/.test(String(value).trim()) ? String(value).trim() : String(value).trim() + '.');
  bullets.push(clip(truth.personalization
    ? `${L.personalized} — ${endSentence(truth.personalization)}`
    : (truth.features.length
      ? `${L.details} — ${truth.features.join('. ')}.`
      : `${L.details} — ${GAP('điểm bán đã xác minh (features)')}`)));

  const closing = [];
  if (truth.features.length && truth.personalization) closing.push(truth.features.join('. '));
  if (truth.packaging) closing.push(truth.packaging);
  if (truth.shipFrom) closing.push(`${L.shipsFrom} ${truth.shipFrom}`);
  bullets.push(clip(closing.length
    ? `${L.packaging} — ${closing.join('. ')}.`
    : `${L.packaging} — ${GAP('đóng gói / nơi gửi hàng đã xác nhận')}`));

  // Use the researched phrase bank to make each bullet commercially useful,
  // while keeping every appended phrase inside the adapter's relevance,
  // language, IP and Product Truth screens. 90–99% is a composition target,
  // not permission to invent facts or repeat roots.
  const targetMin = Math.ceil(limit * 0.90);
  const targetMax = Math.floor(limit * 0.99);
  const globallyUsed = new Set(contentTokens(bullets.join(' ')));
  const remaining = [...keywords];
  return bullets.map(base => {
    let output = clip(base);
    let keywordAdds = 0;
    for (let index = 0; index < remaining.length && output.length < targetMin && keywordAdds < 2;) {
      const candidate = remaining[index];
      const fresh = contentTokens(candidate.phrase).filter(token => !globallyUsed.has(token));
      const phrase = titleCase(candidate.phrase);
      const next = `${output.replace(/[.!?]+$/, '')}; ${phrase}`;
      if (!fresh.length || next.length > targetMax) { index++; continue; }
      output = next;
      consumed.push(candidate.phrase);
      fresh.forEach(token => globallyUsed.add(token));
      remaining.splice(index, 1);
      keywordAdds++;
    }
    // Prefer verified Product Truth prose over a third/fourth keyword phrase.
    // This keeps bullets useful to shoppers and preserves additional distinct
    // roots for the byte-capped Generic Keywords field.
    const truthFillers = [
      subject && `${subject}${forWhom}`,
      truth.occasion && `Occasion: ${truth.occasion}`,
      truth.materials.length && `${L.material}: ${truth.materials.join(', ')}`,
      truth.sizes.length && `${L.sizes}: ${truth.sizes.join(', ')}`,
      truth.colors.length && `${L.colors}: ${truth.colors.join(', ')}`,
      truth.personalization && `${L.personalizationWord}: ${truth.personalization}`,
      truth.packaging && `${L.packagingWord}: ${truth.packaging}`,
      truth.shipFrom && `${L.shipsFrom}: ${truth.shipFrom}`
    ].filter(Boolean);
    const outputTokens = new Set(contentTokens(output));
    for (const filler of truthFillers) {
      if (output.length >= targetMin) break;
      const fresh = contentTokens(filler).filter(token => !outputTokens.has(token));
      if (!fresh.length) continue;
      let addition = String(filler);
      const room = targetMax - output.length - 2;
      if (room < 4) break;
      if (addition.length > room) continue;
      if (!addition) continue;
      output = `${output.replace(/[.!?]+$/, '')}; ${addition}`;
      contentTokens(addition).forEach(token => outputTokens.add(token));
    }
    return output;
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function buildDescription(truth, keywords, L = LABEL_SETS.EN, consumed = [], extraPhraseCount = 4) {
  const lead = titleCase(keywords[0]?.phrase || truth.productType || '');
  if (keywords[0]) consumed.push(keywords[0].phrase);
  const subject = truth.productName || truth.productType;
  const parts = [];
  parts.push(`<p><b>${escapeHtml(lead)}</b></p>`);
  parts.push(`<p>${escapeHtml(subject || GAP('tên/loại sản phẩm'))}${truth.recipient ? escapeHtml(' ' + L.forWord + ' ' + truth.recipient) : ''}.${truth.occasion ? escapeHtml(' ' + truth.occasion + '.') : ''}</p>`);
  const spec = [];
  if (truth.materials.length) spec.push(`<li>${L.material.charAt(0) + L.material.slice(1).toLowerCase()}: ${escapeHtml(truth.materials.join(', '))}</li>`);
  if (truth.purity) spec.push(`<li>Purity / plating: ${escapeHtml(truth.purity)}</li>`);
  if (truth.finish) spec.push(`<li>Finish: ${escapeHtml(truth.finish)}</li>`);
  if (truth.gemstones.length) spec.push(`<li>Gemstones: ${escapeHtml(truth.gemstones.join(', '))}</li>`);
  if (truth.components.length) spec.push(`<li>Components: ${escapeHtml(truth.components.join(', '))}</li>`);
  if (truth.sizes.length) spec.push(`<li>${L.sizes}: ${escapeHtml(truth.sizes.join(', '))}</li>`);
  if (truth.dimensions.length) spec.push(`<li>Dimensions: ${escapeHtml(truth.dimensions.join(', '))}</li>`);
  if (truth.weight) spec.push(`<li>Weight: ${escapeHtml(truth.weight)}</li>`);
  if (truth.quantity) spec.push(`<li>Quantity: ${escapeHtml(truth.quantity)}</li>`);
  if (truth.colors.length) spec.push(`<li>${L.colors}: ${escapeHtml(truth.colors.join(', '))}</li>`);
  if (truth.personalization) spec.push(`<li>${L.personalizationWord}: ${escapeHtml(truth.personalization)}</li>`);
  if (truth.packaging) spec.push(`<li>${L.packagingWord}: ${escapeHtml(truth.packaging)}</li>`);
  if (truth.care) spec.push(`<li>${L.care}: ${escapeHtml(truth.care)}</li>`);
  if (truth.shipFrom) spec.push(`<li>${L.shipsFrom}: ${escapeHtml(truth.shipFrom)}</li>`);
  if (truth.origin) spec.push(`<li>Origin: ${escapeHtml(truth.origin)}</li>`);
  if (truth.style) spec.push(`<li>Style: ${escapeHtml(truth.style)}</li>`);
  if (truth.design) spec.push(`<li>Design: ${escapeHtml(truth.design)}</li>`);
  if (truth.theme) spec.push(`<li>Theme: ${escapeHtml(truth.theme)}</li>`);
  parts.push(spec.length ? `<ul>${spec.join('')}</ul>` : `<p>${escapeHtml(GAP('thông số sản phẩm đã xác minh'))}</p>`);
  for (const feature of truth.features) parts.push(`<p>${escapeHtml(feature)}</p>`);
  // A closing line built from real occasion/recipient phrases the copy has not
  // used yet. It is descriptive, not a claim, so it carries no truth risk while
  // still putting more of the researched vocabulary on the page.
  const used = new Set(consumed.map(p => String(p).toLowerCase()));
  const extra = keywords
    .filter(k => !used.has(k.phrase.toLowerCase()))
    .filter(k => (k.clusters || []).some(c => c === 'occasion' || c === 'recipient'))
    .slice(0, extraPhraseCount);
  if (extra.length) {
    for (const keyword of extra) consumed.push(keyword.phrase);
    parts.push(`<p>${escapeHtml(extra.map(k => titleCase(k.phrase)).join(' · '))}</p>`);
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

  const usedTitleTokens = new Set();
  // Product Truth owns product identity. A supplier/own-listing name that
  // already fills the title target should not be displaced by a higher-volume
  // but less exact competitor phrase.
  const truthTitle = titleCase(truth.productName || '');
  const title = truthTitle && truthTitle.length >= Math.ceil(opt.titlePolicyLimit * 0.90)
    ? { text: truthTitle.length <= opt.titleLimit
      ? truthTitle
      : truthTitle.slice(0, truthTitle.slice(0, opt.titleLimit + 1).lastIndexOf(' ')).trim(),
      picked: [], used: new Set(contentTokens(truthTitle)) }
    : pickPhrases(orderedCopy, { charLimit: opt.titleLimit, joiner: ' | ', used: usedTitleTokens, maxPhrases: 4, seedBest: true });
  // A title must still name the product. If no safe research phrase does,
  // seed it from Product Truth before adding relevant researched context.
  if (!namesProduct(title.text) && (truth.productName || truth.productType)) {
    const identity = titleCase(truth.productName || truth.productType).slice(0, opt.titleLimit);
    title.text = identity; title.picked = []; title.used = new Set(contentTokens(identity));
  }
  const highlights = pickPhrases(forCopy, { charLimit: opt.highlightLimit, joiner: ', ', used: new Set(title.used), maxPhrases: 8 });

  // Finalize all visible copy BEFORE backend terms, so Generic Keywords can
  // exclude every token already indexed visibly.
  const L = LABEL_SETS[opt.labelLanguage];
  const consumed = [...title.picked.map(p => p.phrase), ...highlights.picked.map(p => p.phrase)];
  const bulletKeywords = forCopy.filter(k => !consumed.some(p => p.toLowerCase() === k.phrase.toLowerCase()));
  const bullets = buildBullets(truth, bulletKeywords, opt.bulletLimit, L, consumed);
  const descriptionKeywords = forCopy.filter(k => !consumed.some(p => p.toLowerCase() === k.phrase.toLowerCase()));
  const description = buildDescription(truth, descriptionKeywords, L, consumed);

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
  const packed = packTokens(orderedPool, opt.searchTermBytes, new Set(visibleIndexed));
  const searchTermSets = packed.text ? [packed] : [];

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
      inputUniquePhrases: scoredKeywords.meta?.inputUniquePhrases ?? scoredKeywords.length
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
      title: { policyLimit: opt.titlePolicyLimit, minimum: Math.ceil(opt.titlePolicyLimit * 0.90),
        targetMaximum: Math.floor(opt.titlePolicyLimit * 0.99), actual: title.text.length },
      itemHighlights: { policyLimit: opt.highlightPolicyLimit, minimum: Math.ceil(opt.highlightPolicyLimit * 0.90),
        targetMaximum: Math.floor(opt.highlightPolicyLimit * 0.99), actual: highlights.text.length },
      bullets: bullets.map(value => ({ minimum: Math.ceil(opt.bulletLimit * 0.90),
        targetMaximum: Math.floor(opt.bulletLimit * 0.99), workingLimit: opt.bulletLimit, actual: value.length,
        authority: 'COMPOSITION_TARGET_PENDING_PRODUCT_TYPE_DEFINITION' })),
      genericKeywords: { policyLimit: opt.searchTermPolicyBytes, minimum: Math.ceil(opt.searchTermPolicyBytes * 0.90),
        targetMaximum: Math.floor(opt.searchTermPolicyBytes * 0.99), actual: packed.bytes,
        gapReason: packed.bytes < Math.ceil(249 * 0.90) ? 'NO_ADDITIONAL_UNIQUE_RELEVANT_NON_REDUNDANT_ROOTS' : null }
    }
  };
}

module.exports = { compose, normalizeTruth, pickPhrases, buildBullets, buildDescription, missingFacts, LABEL_SETS };
