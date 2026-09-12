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
const { fold, contentTokens } = require('./text');

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

function detectLanguage(keywords, seedPhrase = '') {
  const seedLanguage = languageOfPhrase(seedPhrase);
  if (seedLanguage === 'ES' || seedLanguage === 'EN') return seedLanguage;
  const sample = keywords.slice(0, 100).map(item => item.phrase.toLowerCase()).join(' ');
  const spanish = (sample.match(/\b(?:para|hija|regalo|collar|mujer|madre|cumpleanos|navidad|con|de)\b/g) || []).length;
  const english = (sample.match(/\b(?:for|daughter|gift|necklace|woman|mother|birthday|christmas|with|of)\b/g) || []).length;
  return spanish > english ? 'ES' : 'EN';
}

const SPANISH_CUES = new Set(['para','hija','regalo','regalos','collar','collares','cadena','cadenas','mujer','madre',
  'mama','cumpleanos','navidad','con','de','del','amor','joyeria','plata','oro','graduacion']);
const ENGLISH_CUES = new Set(['for','daughter','gift','gifts','necklace','necklaces','woman','women','mother','mom','dad',
  'birthday','christmas','with','of','love','jewelry','silver','gold','graduation']);

function languageOfPhrase(phrase) {
  const original = String(phrase || '');
  const tokens = contentTokens(original);
  let es = /[áéíóúñü¿¡]/i.test(original) ? 2 : 0;
  let en = 0;
  for (const token of tokens) {
    if (SPANISH_CUES.has(token)) es++;
    if (ENGLISH_CUES.has(token)) en++;
  }
  if (es && en) return 'MIXED';
  if (es) return 'ES';
  if (en) return 'EN';
  return 'NEUTRAL';
}

function languageCompatible(phrase, language) {
  const detected = languageOfPhrase(phrase);
  return detected === 'NEUTRAL' || detected === language;
}

function containsCompetitorBrand(phrase, xrayRows) {
  const normalized = ` ${fold(phrase).replace(/[^a-z0-9]+/g, ' ').trim()} `;
  return xrayRows.find(row => {
    const brand = fold(row.brand || '').replace(/[^a-z0-9]+/g, ' ').trim();
    return brand && normalized.includes(` ${brand} `);
  }) || null;
}

function engineBindingHash() {
  const hash = crypto.createHash('sha256'); hash.update(`${ENGINE_ID}\0`);
  for (const file of [__filename, require.resolve('./keywordEngine'), require.resolve('./asinSelector'),
    require.resolve('./amazonComposer'), require.resolve('./semantic'), require.resolve('../listingGuard'),
    require.resolve('../claimGuard')]) {
    hash.update(file.split(/[\\/]/).pop()); hash.update('\0'); hash.update(fs.readFileSync(file)); hash.update('\0');
  }
  return hash.digest('hex');
}

function scoreProjection(keyword) {
  return Object.fromEntries(SCORE_FIELDS.map(field => [field, keyword[field] ?? null]));
}

function truthForComposer(facts) {
  const colorValues = (Array.isArray(facts.colors) ? facts.colors : String(facts.colors || '').split(/[,;/\n]/))
    .map(value => text(value)).filter(Boolean);
  const colors = [];
  const factClaimReview = [];
  for (const value of colorValues) {
    const audit = evaluateText(value, facts, SURFACES.VISIBLE_COPY);
    if (audit.unverifiedClaims.length) factClaimReview.push({ field: 'colors', value,
      reason: 'AMBIGUOUS_ATTRIBUTE_TOKEN', unverifiedClaims: audit.unverifiedClaims });
    else colors.push(value);
  }
  return {
    productType: text(facts.productType), productName: text(facts.productName), recipient: text(facts.recipient || facts.audience),
    occasion: text(facts.occasion), materials: facts.materials || facts.composition,
    sizes: facts.sizes || facts.dimensions, colors, features: facts.features,
    personalization: text(facts.personalization), packaging: text(facts.packaging), care: text(facts.care),
    shipFrom: text(facts.shipFrom || facts.origin), factClaimReview
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

function keywordsFromMasterArtifact(artifact) {
  if (!artifact) return null;
  if (artifact.kind !== 'AMAZON_MASTER_KEYWORDS' || !Array.isArray(artifact.payload?.keywords)) {
    throw Object.assign(new Error('AMAZON_MASTER_KEYWORDS_REQUIRED'), {
      code: 'AMAZON_MASTER_KEYWORDS_REQUIRED', status: 409
    });
  }
  return artifact.payload.keywords.map(item => ({
    phrase: item.phrase, ...item.metrics, masterTier: item.tier,
    masterPriorityRank: item.priorityRank, masterKeywordId: item.keywordId
  }));
}

async function buildIntelligence({ research, productTruth, configuration = {}, masterKeywordArtifact = null }) {
  const observations = research.observations || {};
  if (observations.marketplace !== 'AMAZON') throw Object.assign(new Error('AMAZON_RESEARCH_REQUIRED'), {
    code: 'AMAZON_RESEARCH_REQUIRED', status: 409
  });
  const facts = factsFromSnapshot(productTruth.snapshot);
  const masterRows = keywordsFromMasterArtifact(masterKeywordArtifact);
  const sourceRows = masterRows || observations.cerebro?.keywords || [];
  const keywordRows = sourceRows.filter(item => item.masterTier !== 'EXCLUDED').map(item => ({
    ...scoreProjection(item), masterTier: item.masterTier || null,
    masterPriorityRank: item.masterPriorityRank || null, masterKeywordId: item.masterKeywordId || null
  }));
  if (!keywordRows.length) throw Object.assign(new Error('CEREBRO_KEYWORDS_REQUIRED'), {
    code: 'CEREBRO_KEYWORDS_REQUIRED', status: 409
  });
  const anchors = [configuration.seedPhrase, facts.productType, facts.productName, facts.recipient, facts.occasion]
    .map(text).filter(Boolean);
  if (!anchors.length) throw Object.assign(new Error('INTELLIGENCE_ANCHOR_REQUIRED'), {
    code: 'INTELLIGENCE_ANCHOR_REQUIRED', status: 409
  });
  const rawScored = scoreKeywords(keywordRows, { anchors, library: true,
    screen: value => ipGuard.screenText(value), minSearchVolume: 0, negativeKeywords: [] });
  const masterByPhrase = new Map(keywordRows.map(item => [fold(item.phrase), item]));
  const tierPriority = Object.freeze({ PRIMARY: 0, SECONDARY: 1, LONG_TAIL: 2, OUTLIER_REVIEW: 3, RESIDUE: 4 });
  const scored = [...rawScored].map(item => ({ ...item, ...Object.fromEntries(Object.entries(
    masterByPhrase.get(fold(item.phrase)) || {}).filter(([key]) => key.startsWith('master')))
  })).sort((a, b) => (tierPriority[a.masterTier] ?? 2) - (tierPriority[b.masterTier] ?? 2)
    || (a.masterPriorityRank ?? Number.MAX_SAFE_INTEGER) - (b.masterPriorityRank ?? Number.MAX_SAFE_INTEGER)
    || b.score - a.score);
  Object.defineProperty(scored, 'meta', { value: rawScored.meta, enumerable: false });
  const language = ['EN','ES'].includes(configuration.listingLanguage) ? configuration.listingLanguage
    : detectLanguage(keywordRows, configuration.seedPhrase);
  const xrayRows = observations.xray || [];
  const copySafe = []; const claimTargeting = []; const languageTargeting = [];
  const competitorBrandBlocked = []; const lexicalReviewQueue = [];
  for (const keyword of scored) {
    if (keyword.ipVerdict === 'BLOCK') continue;
    if (['OUTLIER_REVIEW', 'RESIDUE'].includes(keyword.masterTier)) {
      lexicalReviewQueue.push({ phrase: keyword.phrase, masterTier: keyword.masterTier,
        reason: 'MASTER_KEYWORD_REVIEW_TIER' });
      continue;
    }
    const competitor = containsCompetitorBrand(keyword.phrase, xrayRows);
    if (competitor) {
      competitorBrandBlocked.push({ phrase: keyword.phrase, brand: competitor.brand, sourceAsin: competitor.asin });
      continue;
    }
    if (keyword.suspectedBrand || keyword.rareReviewToken) {
      lexicalReviewQueue.push({ phrase: keyword.phrase, suspectedBrand: keyword.suspectedBrand,
        rareReviewToken: keyword.rareReviewToken });
      continue;
    }
    if (!languageCompatible(keyword.phrase, language)) {
      languageTargeting.push({ phrase: keyword.phrase, detectedLanguage: languageOfPhrase(keyword.phrase), listingLanguage: language });
      continue;
    }
    const claim = evaluateText(keyword.phrase, facts, SURFACES.VISIBLE_COPY);
    if (claim.unverifiedClaims.length) {
      if (keyword.ipVerdict !== 'BLOCK') claimTargeting.push({ phrase: keyword.phrase,
        searchVolume: keyword.searchVolume, bid: keyword.bid, positionRank: keyword.positionRank,
        score: Number(keyword.score.toFixed(4)), relevance: Number(keyword.relevance.toFixed(4)),
        unverifiedClaims: claim.unverifiedClaims });
    } else copySafe.push(keyword);
  }
  Object.defineProperty(copySafe, 'meta', { value: scored.meta, enumerable: false });
  const composerTruth = truthForComposer(facts);
  const factClaimReview = composerTruth.factClaimReview;
  const composed = compose(copySafe, composerTruth, { labelLanguage: language,
    mustContainAny: anchors, searchTermBytes: 249 });
  const content = canonicalContent(composed, facts, [...claimTargeting, ...languageTargeting], productTruth.snapshot);
  let guarded;
  try { guarded = evaluateListingGuard({ listing: content, verifiedFacts: facts }); }
  catch (error) {
    if (error?.code === 'UNVERIFIED_OUTPUT_CLAIM') error.status = 422;
    throw error;
  }
  const xray = selectAsinBatches(xrayRows, { anchors, library: true,
    screen: value => ipGuard.screenText(value), maxPerBrand: 2, batchSize: 10 });
  const ipBlockedKeywordCount = scored.filter(item => item.ipVerdict === 'BLOCK').length;
  const allocatedKeywordCount = copySafe.length + claimTargeting.length + languageTargeting.length
    + competitorBrandBlocked.length + lexicalReviewQueue.length + ipBlockedKeywordCount;
  const unallocatedCount = scored.length - allocatedKeywordCount;
  if (unallocatedCount !== 0) throw Object.assign(new Error('INTELLIGENCE_KEYWORD_ACCOUNTING_MISMATCH'), {
    code: 'INTELLIGENCE_KEYWORD_ACCOUNTING_MISMATCH', scoredKeywordCount: scored.length,
    allocatedKeywordCount, unallocatedCount
  });
  const staffExcludedCount = masterRows?.filter(item => item.masterTier === 'EXCLUDED').length ?? 0;
  if (masterRows && allocatedKeywordCount + staffExcludedCount !== masterRows.length) {
    throw Object.assign(new Error('MASTER_KEYWORD_ACCOUNTING_MISMATCH'), {
      code: 'MASTER_KEYWORD_ACCOUNTING_MISMATCH', masterKeywordCount: masterRows.length,
      allocatedKeywordCount, staffExcludedCount
    });
  }
  return Object.freeze({
    output: { marketplace: 'AMAZON', language, anchors, listingDraft: guarded.listing,
      masterKeywordArtifact: masterKeywordArtifact ? { id: masterKeywordArtifact.id,
        artifactHash: masterKeywordArtifact.artifactHash, revisionNumber: masterKeywordArtifact.revisionNumber } : null,
      commerce: composed, asinSelection: xray, claimTargeting, languageTargeting,
      competitorBrandBlocked, lexicalReviewQueue, factClaimReview,
      guardAccounting: { backendExcluded: guarded.backendExcluded, ppcFlagged: guarded.ppcFlagged } },
    accounting: { inputKeywordCount: sourceRows.length, scoredKeywordCount: scored.length,
      masterKeywordCount: masterRows?.length ?? null,
      staffExcludedCount,
      copySafeKeywordCount: copySafe.length, claimTargetingCount: claimTargeting.length,
      languageTargetingCount: languageTargeting.length, competitorBrandBlockedCount: competitorBrandBlocked.length,
      lexicalReviewCount: lexicalReviewQueue.length, factClaimReviewCount: factClaimReview.length,
      ipBlockedKeywordCount, allocatedKeywordCount, unallocatedCount,
      xrayInputCount: (observations.xray || []).length, asinAcceptedCount: xray.acceptedCount,
      asinRejectedCount: xray.rejectedCount, missingProductFacts: composed.missingFacts },
    engineBindingHash: engineBindingHash()
  });
}

module.exports = Object.freeze({ ENGINE_ID, aPlusPointsFromTruth, buildIntelligence, detectLanguage,
  languageOfPhrase, languageCompatible, containsCompetitorBrand,
  engineBindingHash, factsFromSnapshot, keywordsFromMasterArtifact });
