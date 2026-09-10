'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const ipGuard = require('../ipGuard');
const { evaluateListingGuard } = require('../listingGuard');
const { evaluateText, SURFACES } = require('../claimGuard');
const { scoreKeywords } = require('./keywordEngine');
const { selectAsinBatches } = require('./asinSelector');
const { compose } = require('./amazonComposer');
const { generateImagePromptSuite } = require('../imagePromptGenerator');

const ENGINE_ID = 'amazon-commerce-intelligence-v1';
const SCORE_FIELDS = ['phrase','searchVolume','keywordSales','iq','trend','competingProducts','cpr',
  'titleDensity','bid','minBid','maxBid','positionRank'];

function factsFromSnapshot(snapshot) {
  return Object.freeze(Object.fromEntries(Object.entries(snapshot?.asserted || {})
    .map(([key, assertion]) => [key, assertion?.value])));
}

function text(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(' ');
  return value == null ? '' : String(value).trim();
}

function detectLanguage(keywords) {
  const sample = keywords.slice(0, 100).map(item => item.phrase.toLowerCase()).join(' ');
  const spanish = (sample.match(/\b(?:para|hija|regalo|collar|mujer|madre|cumpleanos|navidad|con|de)\b/g) || []).length;
  const english = (sample.match(/\b(?:for|daughter|gift|necklace|woman|mother|birthday|christmas|with|of)\b/g) || []).length;
  return spanish > english ? 'ES' : 'EN';
}

function engineBindingHash() {
  const hash = crypto.createHash('sha256'); hash.update(`${ENGINE_ID}\0`);
  for (const file of [__filename, require.resolve('./keywordEngine'), require.resolve('./asinSelector'),
    require.resolve('./amazonComposer'), require.resolve('../listingGuard'), require.resolve('../claimGuard')]) {
    hash.update(file.split(/[\\/]/).pop()); hash.update('\0'); hash.update(fs.readFileSync(file)); hash.update('\0');
  }
  return hash.digest('hex');
}

function scoreProjection(keyword) {
  return Object.fromEntries(SCORE_FIELDS.map(field => [field, keyword[field] ?? null]));
}

function truthForComposer(facts) {
  return {
    productType: text(facts.productType), productName: text(facts.productName), recipient: text(facts.recipient || facts.audience),
    occasion: text(facts.occasion), materials: facts.materials || facts.composition,
    sizes: facts.sizes || facts.dimensions, colors: facts.colors, features: facts.features,
    personalization: text(facts.personalization), packaging: text(facts.packaging), care: text(facts.care),
    shipFrom: text(facts.shipFrom || facts.origin)
  };
}

function aPlusPointsFromTruth(facts) {
  const points = [];
  const identity = text(facts.productName || facts.productType);
  if (identity) points.push(identity);
  for (const [label, value] of [
    ['Materials', facts.materials || facts.composition], ['Personalization', facts.personalization],
    ['Size', facts.sizes || facts.dimensions], ['Included', facts.includedItems],
    ['Packaging', facts.packaging], ['Care', facts.care], ['Recipient', facts.recipient || facts.audience],
    ['Occasion', facts.occasion]
  ]) if (text(value)) points.push(`${label}: ${text(value)}`);
  return points;
}

function canonicalContent(composed, facts, extraPpc, truthSnapshot) {
  const ppc = [...composed.ppc.exact, ...composed.ppc.phrase, ...composed.ppc.broad].map(item => item.phrase);
  const identity = text(facts.productName || facts.productType);
  return {
    amazonTitle: composed.title.text || identity,
    itemHighlights: composed.itemHighlights.text || identity,
    amazonBullets: composed.bullets,
    amazonSearchTerms: composed.searchTerms[0]?.text || '',
    amazonDescription: composed.description,
    amazonAPlusPoints: aPlusPointsFromTruth(facts),
    categoryName: text(facts.category),
    ppcKeywords: [...new Set([...ppc, ...extraPpc.map(item => item.phrase)])],
    imagePrompts: generateImagePromptSuite(truthSnapshot, 'AMAZON')
  };
}

async function buildIntelligence({ research, productTruth, configuration = {} }) {
  const observations = research.observations || {};
  if (observations.marketplace !== 'AMAZON') throw Object.assign(new Error('AMAZON_RESEARCH_REQUIRED'), {
    code: 'AMAZON_RESEARCH_REQUIRED'
  });
  const facts = factsFromSnapshot(productTruth.snapshot);
  const keywordRows = (observations.cerebro?.keywords || []).map(scoreProjection);
  if (!keywordRows.length) throw Object.assign(new Error('CEREBRO_KEYWORDS_REQUIRED'), { code: 'CEREBRO_KEYWORDS_REQUIRED' });
  const anchors = [configuration.seedPhrase, facts.productType, facts.productName, facts.recipient, facts.occasion]
    .map(text).filter(Boolean);
  if (!anchors.length) throw Object.assign(new Error('INTELLIGENCE_ANCHOR_REQUIRED'), { code: 'INTELLIGENCE_ANCHOR_REQUIRED' });
  const scored = scoreKeywords(keywordRows, { anchors, library: true,
    screen: value => ipGuard.screenText(value), minSearchVolume: 0, negativeKeywords: [] });
  const copySafe = []; const claimTargeting = [];
  for (const keyword of scored) {
    const claim = evaluateText(keyword.phrase, facts, SURFACES.VISIBLE_COPY);
    if (claim.unverifiedClaims.length) {
      if (keyword.ipVerdict !== 'BLOCK') claimTargeting.push({ phrase: keyword.phrase,
        searchVolume: keyword.searchVolume, bid: keyword.bid, positionRank: keyword.positionRank,
        score: Number(keyword.score.toFixed(4)), relevance: Number(keyword.relevance.toFixed(4)),
        unverifiedClaims: claim.unverifiedClaims });
    } else copySafe.push(keyword);
  }
  Object.defineProperty(copySafe, 'meta', { value: scored.meta, enumerable: false });
  const language = ['EN','ES'].includes(configuration.listingLanguage) ? configuration.listingLanguage : detectLanguage(keywordRows);
  const composed = compose(copySafe, truthForComposer(facts), { labelLanguage: language,
    mustContainAny: anchors, searchTermBytes: 249 });
  const content = canonicalContent(composed, facts, claimTargeting, productTruth.snapshot);
  const guarded = evaluateListingGuard({ listing: content, verifiedFacts: facts });
  const xray = selectAsinBatches(observations.xray || [], { anchors, library: true,
    screen: value => ipGuard.screenText(value), maxPerBrand: 2, batchSize: 10 });
  return Object.freeze({
    output: { marketplace: 'AMAZON', language, anchors, listingDraft: guarded.listing,
      commerce: composed, asinSelection: xray, claimTargeting,
      guardAccounting: { backendExcluded: guarded.backendExcluded, ppcFlagged: guarded.ppcFlagged } },
    accounting: { inputKeywordCount: keywordRows.length, scoredKeywordCount: scored.length,
      copySafeKeywordCount: copySafe.length, claimTargetingCount: claimTargeting.length,
      ipBlockedKeywordCount: scored.filter(item => item.ipVerdict === 'BLOCK').length,
      xrayInputCount: (observations.xray || []).length, asinAcceptedCount: xray.acceptedCount,
      asinRejectedCount: xray.rejectedCount, missingProductFacts: composed.missingFacts },
    engineBindingHash: engineBindingHash()
  });
}

module.exports = Object.freeze({ ENGINE_ID, aPlusPointsFromTruth, buildIntelligence, detectLanguage,
  engineBindingHash, factsFromSnapshot });
