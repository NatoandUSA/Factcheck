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
const { PATTERNS } = require('./semantic');

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
    purity: text(facts.purity), finish: text(facts.finish), gemstones: facts.gemstones,
    components: facts.components, sizes: facts.sizes, dimensions: facts.dimensions,
    weight: text(facts.weight), quantity: text(facts.quantity), colors, features: facts.features,
    personalization: text(facts.personalization), packaging: text(facts.packaging), care: text(facts.care),
    shipFrom: text(facts.shipFrom), origin: text(facts.origin), style: text(facts.style),
    design: text(facts.design), theme: text(facts.theme), factClaimReview
  };
}

function aPlusPointsFromTruth(facts) {
  const points = [];
  const identity = text(facts.productName || facts.productType);
  if (identity) points.push(identity);
  for (const [label, value] of [
    ['Materials', facts.materials || facts.composition], ['Purity / plating', facts.purity], ['Finish', facts.finish],
    ['Gemstones', facts.gemstones], ['Components', facts.components], ['Personalization', facts.personalization],
    ['Size', facts.sizes || facts.dimensions], ['Weight', facts.weight], ['Quantity', facts.quantity], ['Included', facts.includedItems],
    ['Packaging', facts.packaging], ['Care', facts.care], ['Recipient', facts.recipient || facts.audience],
    ['Occasion', facts.occasion], ['Style', facts.style], ['Design', facts.design], ['Theme', facts.theme],
    ['Origin', facts.origin], ['Ships from', facts.shipFrom]
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
  // Cerebro commonly surfaces competitor brand queries that are absent from
  // the selected Xray batch. Detect a conservative recurring leading-token
  // signature instead of requiring staff to maintain a hard-coded brand list.
  const semanticVocabulary = new Set(Object.values(PATTERNS).flatMap(values => values.flatMap(contentTokens)));
  for (const value of [...anchors, ...Object.values(facts).map(text)]) {
    for (const token of contentTokens(value)) semanticVocabulary.add(token);
  }
  const leadingCounts = new Map(); const documentCounts = new Map();
  for (const item of scored) {
    const phraseTokens = contentTokens(item.phrase);
    const token = phraseTokens[0];
    if (token) leadingCounts.set(token, (leadingCounts.get(token) || 0) + 1);
    for (const observed of new Set(phraseTokens)) documentCounts.set(observed, (documentCounts.get(observed) || 0) + 1);
  }
  const corpusBrandTokens = new Set([...leadingCounts]
    .filter(([token, count]) => count >= 3 && token.length >= 4
      && count / Math.max(1, documentCounts.get(token) || 0) >= 0.70
      && !semanticVocabulary.has(token))
    .map(([token]) => token));
  const language = ['EN','ES'].includes(configuration.listingLanguage) ? configuration.listingLanguage
    : detectLanguage(keywordRows, configuration.seedPhrase);
  const bilingualIdentity = languageOfPhrase(facts.productName) === 'MIXED'
    || languageOfPhrase(configuration.seedPhrase) === 'MIXED';
  const xrayRows = observations.xray || [];
  const copySafe = []; const backendLanguageCandidates = []; const claimTargeting = []; const languageTargeting = [];
  const competitorBrandBlocked = []; const lexicalReviewQueue = []; const rareTokenSignals = [];
  const masterOutlierSignals = [];
  for (const keyword of scored) {
    if (keyword.ipVerdict === 'BLOCK') continue;
    if (keyword.masterTier === 'RESIDUE') {
      lexicalReviewQueue.push({ phrase: keyword.phrase, masterTier: keyword.masterTier,
        reason: 'MASTER_KEYWORD_REVIEW_TIER' });
      continue;
    }
    // OUTLIER_REVIEW means "needs semantic validation", not "must disappear".
    // The downstream language, recipient, product-family, claim and relevance
    // screens decide whether it can be used. Keeping the signal separately
    // preserves auditability without starving the listing of valid long tails.
    if (keyword.masterTier === 'OUTLIER_REVIEW') masterOutlierSignals.push({ phrase: keyword.phrase,
      masterPriorityRank: keyword.masterPriorityRank, reason: 'MASTER_OUTLIER_REVALIDATED_DOWNSTREAM' });
    const competitor = containsCompetitorBrand(keyword.phrase, xrayRows);
    if (competitor) {
      competitorBrandBlocked.push({ phrase: keyword.phrase, brand: competitor.brand, sourceAsin: competitor.asin });
      continue;
    }
    // Low document frequency is useful review metadata, but it is not proof of
    // a competitor brand. The former behavior quarantined most real long-tail
    // Cerebro phrases and starved every listing surface. Only an actual brand
    // signal is dispositioned to review; rare roots continue through the
    // relevance, language and Product Truth screens below.
    if (keyword.rareReviewToken) rareTokenSignals.push({ phrase: keyword.phrase, token: keyword.rareReviewToken });
    if (keyword.suspectedBrand) {
      lexicalReviewQueue.push({ phrase: keyword.phrase, suspectedBrand: keyword.suspectedBrand,
        rareReviewToken: keyword.rareReviewToken });
      continue;
    }
    const claim = evaluateText(keyword.phrase, facts, SURFACES.VISIBLE_COPY);
    if (claim.unverifiedClaims.length) {
      if (keyword.ipVerdict !== 'BLOCK') claimTargeting.push({ phrase: keyword.phrase,
        searchVolume: keyword.searchVolume, bid: keyword.bid, positionRank: keyword.positionRank,
        score: Number(keyword.score.toFixed(4)), relevance: Number(keyword.relevance.toFixed(4)),
        unverifiedClaims: claim.unverifiedClaims });
      continue;
    }
    const leadingToken = contentTokens(keyword.phrase)[0];
    if (corpusBrandTokens.has(leadingToken)) {
      lexicalReviewQueue.push({ phrase: keyword.phrase, suspectedBrand: leadingToken,
        reason: 'RECURRING_LEADING_TOKEN_BRAND_SIGNAL' });
      continue;
    }
    if (!languageCompatible(keyword.phrase, language)) {
      languageTargeting.push({ phrase: keyword.phrase, detectedLanguage: languageOfPhrase(keyword.phrase), listingLanguage: language,
        disposition: bilingualIdentity ? 'BILINGUAL_US_COPY_CANDIDATE_AFTER_SEMANTIC_SCREEN' : 'BACKEND_OR_PPC_ONLY_AFTER_SEMANTIC_SCREEN' });
      backendLanguageCandidates.push({ ...keyword, backendOnly: !bilingualIdentity, alternateLanguage: true });
      continue;
    }
    copySafe.push(keyword);
  }
  const compositionCorpus = [...copySafe, ...backendLanguageCandidates];
  Object.defineProperty(compositionCorpus, 'meta', { value: scored.meta, enumerable: false });
  const composerTruth = truthForComposer(facts);
  const factClaimReview = composerTruth.factClaimReview;
  const composed = compose(compositionCorpus, composerTruth, { labelLanguage: language,
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
      competitorBrandBlocked, lexicalReviewQueue, rareTokenSignals, masterOutlierSignals,
      corpusBrandTokens: [...corpusBrandTokens].sort(), factClaimReview,
      guardAccounting: { backendExcluded: guarded.backendExcluded, ppcFlagged: guarded.ppcFlagged } },
    accounting: { inputKeywordCount: sourceRows.length, scoredKeywordCount: scored.length,
      masterKeywordCount: masterRows?.length ?? null,
      staffExcludedCount,
      copySafeKeywordCount: copySafe.length, backendLanguageCandidateCount: backendLanguageCandidates.length,
      claimTargetingCount: claimTargeting.length,
      languageTargetingCount: languageTargeting.length, competitorBrandBlockedCount: competitorBrandBlocked.length,
      lexicalReviewCount: lexicalReviewQueue.length, rareTokenSignalCount: rareTokenSignals.length,
      masterOutlierSignalCount: masterOutlierSignals.length,
      factClaimReviewCount: factClaimReview.length,
      ipBlockedKeywordCount, allocatedKeywordCount, unallocatedCount,
      xrayInputCount: (observations.xray || []).length, asinAcceptedCount: xray.acceptedCount,
      asinRejectedCount: xray.rejectedCount, missingProductFacts: composed.missingFacts },
    engineBindingHash: engineBindingHash()
  });
}

module.exports = Object.freeze({ ENGINE_ID, aPlusPointsFromTruth, buildIntelligence, detectLanguage,
  languageOfPhrase, languageCompatible, containsCompetitorBrand,
  engineBindingHash, factsFromSnapshot, keywordsFromMasterArtifact });
