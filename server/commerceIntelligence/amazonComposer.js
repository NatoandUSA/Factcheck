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
const { allowedRecipientFamilies } = require('./semantic');

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
    colors: normalizeList(input.colors),
    sizes: normalizeList(input.sizes),
    features: normalizeList(input.features),
    personalization: String(input.personalization || '').trim(),
    packaging: String(input.packaging || '').trim(),
    care: String(input.care || '').trim(),
    shipFrom: String(input.shipFrom || '').trim()
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
  const themeOf = index => {
    const keyword = keywords[index];
    if (!keyword) return '';
    consumed.push(keyword.phrase);
    return titleCase(keyword.phrase);
  };
  const clip = value => value.length > limit ? value.slice(0, limit - 1).trimEnd() + '…' : value;
  const bullets = [];

  const subject = truth.productName || truth.productType || GAP('loại sản phẩm');
  const forWhom = truth.recipient ? ` ${L.forWord} ${truth.recipient}` : '';
  const giftLabel = truth.recipient ? `${L.gift} ${truth.recipient.toUpperCase()}` : L.product;
  const leadPhrase = themeOf(0);
  bullets.push(clip(`${giftLabel} — ${subject}${forWhom}.${truth.occasion ? ` ${truth.occasion}.` : ''}${leadPhrase ? ` ${leadPhrase}.` : ''}`));

  bullets.push(clip(truth.materials.length
    ? `${L.material} — ${truth.materials.join(', ')}.${truth.care ? ` ${L.care}: ${truth.care}.` : ''}`
    : `${L.material} — ${GAP('chất liệu / thành phần vải')}`));

  const sizeColor = [];
  if (truth.sizes.length) sizeColor.push(`${L.sizes} ${truth.sizes.join(', ')}`);
  if (truth.colors.length) sizeColor.push(`${L.colors} ${truth.colors.join(', ')}`);
  bullets.push(clip(sizeColor.length
    ? `${L.sizeColor} — ${sizeColor.join('. ')}.`
    : `${L.sizeColor} — ${GAP('size / màu đã xác nhận')}`));

  const secondTheme = themeOf(1);
  const endSentence = value => (/[.!?]$/.test(String(value).trim()) ? String(value).trim() : String(value).trim() + '.');
  bullets.push(clip(truth.personalization
    ? `${L.personalized} — ${endSentence(truth.personalization)}${secondTheme ? ` ${secondTheme}.` : ''}`
    : (truth.features.length
      ? `${L.details} — ${truth.features.join('. ')}.${secondTheme ? ` ${secondTheme}.` : ''}`
      : `${L.details} — ${GAP('điểm bán đã xác minh (features)')}`)));

  const closing = [];
  if (truth.features.length && truth.personalization) closing.push(truth.features.join('. '));
  if (truth.packaging) closing.push(truth.packaging);
  if (truth.shipFrom) closing.push(`${L.shipsFrom} ${truth.shipFrom}`);
  bullets.push(clip(closing.length
    ? `${L.packaging} — ${closing.join('. ')}.`
    : `${L.packaging} — ${GAP('đóng gói / nơi gửi hàng đã xác nhận')}`));

  return bullets;
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
  if (truth.sizes.length) spec.push(`<li>${L.sizes}: ${escapeHtml(truth.sizes.join(', '))}</li>`);
  if (truth.colors.length) spec.push(`<li>${L.colors}: ${escapeHtml(truth.colors.join(', '))}</li>`);
  if (truth.personalization) spec.push(`<li>${L.personalizationWord}: ${escapeHtml(truth.personalization)}</li>`);
  if (truth.packaging) spec.push(`<li>${L.packagingWord}: ${escapeHtml(truth.packaging)}</li>`);
  if (truth.care) spec.push(`<li>${L.care}: ${escapeHtml(truth.care)}</li>`);
  if (truth.shipFrom) spec.push(`<li>${L.shipsFrom}: ${escapeHtml(truth.shipFrom)}</li>`);
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
  if (!truth.sizes.length) missing.push('Size');
  if (!truth.colors.length) missing.push('Màu');
  if (!truth.features.length) missing.push('Điểm bán đã xác minh (features)');
  if (!truth.packaging) missing.push('Đóng gói');
  if (!truth.shipFrom) missing.push('Nơi gửi hàng');
  return missing;
}

function compose(scoredKeywords, truthInput, options = {}) {
  const opt = {
    titleLimit: options.titleLimit ?? 75,
    highlightLimit: options.highlightLimit ?? 125,
    // Amazon generic keywords are a TOTAL budget, not N independent 249-byte buckets.
    searchTermBytes: Math.min(249, options.searchTermBytes ?? 249),
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

  const anchorNouns = new Set(opt.mustContainAny
    ? contentTokens(Array.isArray(opt.mustContainAny) ? opt.mustContainAny.join(' ') : opt.mustContainAny)
    : contentTokens(`${truth.productType} ${truth.productName} ${truth.recipient}`));
  const namesProduct = phrase => !anchorNouns.size || contentTokens(phrase).some(token => anchorNouns.has(token));
  const forCopy = usable.filter(k => !k.suspectedBrand
    && k.relevance >= opt.minRelevanceCopy
    && namesProduct(k.phrase)
    && k.tokenCount >= 2 && k.tokenCount <= 7);

  const usedTitleTokens = new Set();
  const title = pickPhrases(forCopy, { charLimit: opt.titleLimit, joiner: ' | ', used: usedTitleTokens, maxPhrases: 3, seedBest: true });
  const highlights = pickPhrases(forCopy, { charLimit: opt.highlightLimit, joiner: ', ', used: new Set(usedTitleTokens), maxPhrases: 5 });

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
  for (const keyword of usable) {
    // High-confidence rival-brand phrases contribute nothing to backend terms.
    // Rare frequency alone is REVIEW metadata and is not an automatic exclusion.
    if (keyword.suspectedBrand) continue;
    const list = opt.dropStopwordsInSearchTerms ? contentTokens(keyword.phrase) : tokens(keyword.phrase);
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
    title: { text: title.text, chars: title.text.length, limit: opt.titleLimit, phrases: title.picked.map(p => p.phrase) },
    itemHighlights: { text: highlights.text, chars: highlights.text.length, limit: opt.highlightLimit, phrases: highlights.picked.map(p => p.phrase) },
    bullets,
    searchTerms: searchTermSets.map(set => ({
      label: 'GENERIC KEYWORDS', text: set.text, bytes: set.bytes,
      limit: opt.searchTermBytes, tokenCount: set.tokens.length
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
    }
  };
}

module.exports = { compose, normalizeTruth, pickPhrases, buildBullets, buildDescription, missingFacts, LABEL_SETS };
