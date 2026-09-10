'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const ipGuard = require('../ipGuard');
const { evaluateListingGuard } = require('../listingGuard');
const { evaluateText, SURFACES } = require('../claimGuard');
const { generateImagePromptSuite } = require('../imagePromptGenerator');

const ENGINE_ID = 'etsy-commerce-intelligence-v1';

function factsFromSnapshot(snapshot) {
  return Object.freeze(Object.fromEntries(Object.entries(snapshot?.asserted || {})
    .map(([key, assertion]) => [key, assertion?.value])));
}
function text(value) { return Array.isArray(value) ? value.map(text).filter(Boolean).join(', ') : value == null ? '' : String(value).trim(); }
function fold(value) { return text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function titleCase(value) { return text(value).replace(/\b([a-záéíóúñ])/gi, letter => letter.toUpperCase()); }
const SOURCE_BOILERPLATE = /(?:no tags? found|\bfrom shop\b|\bsale price\b|\boriginal price\b|\badd to cart\b|\bmore like this\b|\bsold in the last\b|\bviews? in the last\b|\bestimated (?:total|revenue)|\bfavorites?\b|\bfree shipping\b)/i;
const CURRENCY_OR_METRIC = /(?:[$€£¥₫₹₱₩₽฿]|\b\d+(?:[.,]\d+)?\s*(?:usd|eur|gbp|idr|vnd)\b)/i;
const STOP_TOKENS = new Set(['the','and','for','with','from','this','that','para','con','del','las','los','gift','gifts','regalo','custom','option','available']);
const PRODUCT_NOUN_GROUPS = Object.freeze({
  NECKLACE: ['necklace','collar','pendant','jewelry','jewellery','cadena'],
  BRACELET: ['bracelet','bangle','pulsera'], RING: ['ring','anillo'], EARRING: ['earring','earrings','pendientes'],
  APPAREL: ['sweatshirt','sweater','hoodie','shirt','camisa','jacket'], BLANKET: ['blanket','manta'],
  HAT: ['hat','cap','gorra'], LAMP: ['lamp','light','lampara'], DRINKWARE: ['mug','cup','tumbler','vaso'],
  GAME: ['game','printable','pdf','mystery'], BAG: ['bag','backpack','mochila'],
  PLUSH: ['plush','bunny','rabbit'], SIGN: ['sign','plaque','acrylic','letrero'],
  PILLOW: ['pillow','cushion','almohada','cojin'], WALL_ART: ['canvas','poster','print','wallart'],
  ORNAMENT: ['ornament','decoration'], KEYCHAIN: ['keychain','keyring','llavero'],
  WALLET: ['wallet','bifold','cartera'], WATCH: ['watch','reloj'], PHONE_CASE: ['phonecase','case'],
  CANDLE: ['candle','vela'], FOOTWEAR: ['sock','socks','shoe','shoes','slipper','slippers'],
  HOME_TEXTILE: ['towel','apron'], PAPER: ['journal','notebook','card','tarjeta'],
  TOY: ['puzzle','toy','juguete'], BOTTLE: ['bottle','flask','botella']
});
const APPEARANCE_TOKENS = new Set(['colorful','multicolor','multicolored','red','blue','green','yellow','pink','purple',
  'orange','black','white','brown','gray','grey','rojo','roja','azul','verde','amarillo','amarilla','rosa','morado',
  'morada','negro','negra','blanco','blanca','marron','gris']);
const SAFE_INTENT_TOKENS = new Set(['dad','daddy','father','mom','mommy','mother','mama','family','wife','husband',
  'son','daughter','hija','hijo','sister','brother','abuela','abuelo','birthday','cumpleanos','christmas','navidad',
  'anniversary','wedding','graduation','love','amor','memorial','gift','gifts','regalo','present']);
const PRODUCT_NOUN_TOKENS = new Set(Object.values(PRODUCT_NOUN_GROUPS).flat().map(fold));

function sourceCandidateRejection(raw) {
  const phrase = text(raw).replace(/\s+/g, ' ');
  if (!phrase) return 'EMPTY';
  if (SOURCE_BOILERPLATE.test(phrase)) return 'SOURCE_UI_BOILERPLATE';
  if (CURRENCY_OR_METRIC.test(phrase)) return 'PRICE_OR_METRIC_TEXT';
  if (!/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(phrase)) return 'NON_LEXICAL';
  if (Array.from(phrase).length > 60) return 'TOO_LONG_FOR_KEYWORD_PHRASE';
  return null;
}

function tokens(value) {
  return new Set(fold(value).match(/[a-z0-9]+/g)?.filter(token => token.length >= 3 && !STOP_TOKENS.has(token)) || []);
}

function productGroups(value) {
  const valueTokens = tokens(value); const groups = new Set();
  for (const [group, nouns] of Object.entries(PRODUCT_NOUN_GROUPS)) {
    if (nouns.some(noun => valueTokens.has(fold(noun)))) groups.add(group);
  }
  return groups;
}

function productTypeConflict(candidate, facts) {
  const identityGroups = productGroups([facts.productName, facts.productType, facts.category].map(text).join(' '));
  const candidateGroups = productGroups(candidate.phrase);
  return identityGroups.size > 0 && candidateGroups.size > 0
    && ![...candidateGroups].some(group => identityGroups.has(group));
}

function unverifiedAppearanceTokens(candidate, facts) {
  const asserted = tokens([facts.colors, facts.finish].map(text).join(' '));
  return [...tokens(candidate.phrase)].filter(token => APPEARANCE_TOKENS.has(token) && !asserted.has(token));
}

function unverifiedProductDescriptors(candidate, facts) {
  const candidateGroups = productGroups(candidate.phrase);
  if (!candidateGroups.size) return [];
  const verified = tokens(Object.values(facts).map(text).join(' '));
  return [...tokens(candidate.phrase)].filter(token => !verified.has(token)
    && !PRODUCT_NOUN_TOKENS.has(token) && !SAFE_INTENT_TOKENS.has(token));
}

function isRelevant(candidate, facts, configuration, queryContexts) {
  if (queryContexts.some(context => fold(context) === fold(candidate.phrase))) return true;
  const anchorTokens = tokens([configuration.seedPhrase, facts.productName, facts.productType,
    facts.recipient, facts.audience, facts.occasion].map(text).join(' '));
  if ([...tokens(candidate.phrase)].some(token => anchorTokens.has(token))) return true;
  const normalized = fold(candidate.phrase);
  return Boolean(text(facts.personalization)) && new Set([
    'personalized', 'personalised', 'personalizado', 'personalizada', 'personalized gift',
    'personalised gift', 'regalo personalizado', 'custom name'
  ]).has(normalized);
}

function engineBindingHash() {
  const hash = crypto.createHash('sha256'); hash.update(`${ENGINE_ID}\0`);
  for (const file of [__filename, require.resolve('../listingGuard'), require.resolve('../claimGuard'), require.resolve('../ipGuard')]) {
    hash.update(file.split(/[\\/]/).pop()); hash.update('\0'); hash.update(fs.readFileSync(file)); hash.update('\0');
  }
  return hash.digest('hex');
}

function candidateCorpus(observations) {
  const byPhrase = new Map(); const rejected = [];
  const add = (raw, source, weight) => {
    const phrase = text(raw).replace(/\s+/g, ' ');
    if (!phrase) return;
    const rejectionReason = sourceCandidateRejection(phrase);
    if (rejectionReason) { rejected.push({ phrase, source, reason: rejectionReason }); return; }
    const key = fold(phrase); const prior = byPhrase.get(key) || { phrase, occurrences: 0, score: 0, sources: [] };
    prior.occurrences++; prior.score += weight; prior.sources.push(source); byPhrase.set(key, prior);
  };
  for (const context of observations.queryContexts || []) add(context, 'QUERY_CONTEXT', 100);
  for (const seller of observations.sellers || []) {
    for (const tag of seller.tags || []) add(tag, `TAG:${seller.provenance?.importId}:${seller.sourceRank}`, 8);
    for (const segment of text(seller.title).split(/[|,–—-]/).map(item => item.trim()).filter(item => item.length >= 3 && item.length <= 60)) {
      add(segment, `TITLE_SEGMENT:${seller.provenance?.importId}:${seller.sourceRank}`, 1);
    }
  }
  const candidates = [...byPhrase.values()].sort((a, b) => b.score - a.score || b.occurrences - a.occurrences || a.phrase.localeCompare(b.phrase));
  Object.defineProperty(candidates, 'sourceRejected', { value: Object.freeze(rejected), enumerable: false });
  return candidates;
}

function descriptionFromTruth(facts, title) {
  const lines = [title];
  for (const [label, value] of [
    ['Materials', facts.materials || facts.composition], ['Personalization', facts.personalization],
    ['Size', facts.sizes || facts.dimensions], ['Included', facts.includedItems],
    ['Format', facts.fileFormat], ['Players', facts.playerCount], ['Age', facts.minimumAge],
    ['Duration', facts.duration], ['Packaging', facts.packaging], ['Care', facts.care]
  ]) if (text(value)) lines.push(`${label}: ${text(value)}`);
  return lines.join('\n\n');
}

async function buildIntelligence({ research, productTruth, configuration = {} }) {
  const observations = research.observations || {};
  if (observations.marketplace !== 'ETSY') throw Object.assign(new Error('ETSY_RESEARCH_REQUIRED'), { code: 'ETSY_RESEARCH_REQUIRED' });
  const facts = factsFromSnapshot(productTruth.snapshot);
  const identity = text(facts.productName || facts.productType);
  if (!identity) throw Object.assign(new Error('PRODUCT_IDENTITY_REQUIRED'), { code: 'PRODUCT_IDENTITY_REQUIRED' });
  const corpus = candidateCorpus(observations);
  const safe = []; const claimBlocked = []; const ipBlocked = []; const irrelevant = [];
  for (const candidate of corpus) {
    const ip = ipGuard.screenText(candidate.phrase);
    if (ip.verdict === 'BLOCK') { ipBlocked.push({ ...candidate, ipHits: ip.hits }); continue; }
    const claim = evaluateText(candidate.phrase, facts, SURFACES.VISIBLE_COPY);
    if (claim.unverifiedClaims.length) claimBlocked.push({ ...candidate, unverifiedClaims: claim.unverifiedClaims });
    else if (unverifiedAppearanceTokens(candidate, facts).length) {
      claimBlocked.push({ ...candidate, unverifiedClaims: unverifiedAppearanceTokens(candidate, facts)
        .map(token => ({ claimId: 'COMPOSITION_MATERIAL_PURITY', subtype: 'APPEARANCE_DESCRIPTOR', token })) });
    } else if (productTypeConflict(candidate, facts)) {
      irrelevant.push({ ...candidate, reason: 'PRODUCT_TYPE_CONFLICT' });
    } else if (unverifiedProductDescriptors(candidate, facts).length) {
      irrelevant.push({ ...candidate, reason: 'UNVERIFIED_PRODUCT_DESCRIPTOR',
        tokens: unverifiedProductDescriptors(candidate, facts) });
    } else if (!isRelevant(candidate, facts, configuration, observations.queryContexts || [])) {
      irrelevant.push({ ...candidate, reason: 'IRRELEVANT_TO_PRODUCT_TRUTH_ANCHORS' });
    } else safe.push(candidate);
  }
  const titleParts = [identity]; const used = new Set();
  for (const candidate of safe) {
    const next = [...titleParts, titleCase(candidate.phrase)].join(', ');
    if (Array.from(next).length > 140 || fold(next).includes(fold(candidate.phrase)) && titleParts.some(part => fold(part).includes(fold(candidate.phrase)))) continue;
    titleParts.push(titleCase(candidate.phrase)); used.add(fold(candidate.phrase));
    if (titleParts.length >= 4) break;
  }
  const etsyTitle = titleParts.join(', ').slice(0, 140).trim();
  const tagPool = [...safe.map(item => item.phrase), identity, text(facts.recipient), text(facts.occasion)]
    .map(value => value.trim()).filter(value => value && Array.from(value).length <= 20);
  const etsyTags = [];
  for (const tag of tagPool) {
    const key = fold(tag); if (etsyTags.some(existing => fold(existing) === key)) continue;
    etsyTags.push(tag); used.add(key); if (etsyTags.length === 13) break;
  }
  const content = { etsyTitle, etsyTags, etsyDescription: descriptionFromTruth(facts, etsyTitle),
    itemHighlights: identity, categoryName: text(facts.category), ppcKeywords: [],
    imagePrompts: generateImagePromptSuite(productTruth.snapshot, 'ETSY') };
  const guarded = evaluateListingGuard({ listing: content, verifiedFacts: facts });
  const unallocated = safe.filter(item => !used.has(fold(item.phrase)));
  return Object.freeze({
    output: { marketplace: 'ETSY', listingDraft: guarded.listing,
      keywordAllocation: { corpusCount: corpus.length, titleAndTagUsed: [...used], unallocated,
        claimBlocked, ipBlocked, irrelevant, sourceRejected: corpus.sourceRejected,
        reason: 'ETSY_HAS_NO_SELLER-SELECTED_PPC_KEYWORD_SURFACE' },
      competitorSummary: { observations: (observations.sellers || []).length,
        uniqueListingIds: new Set((observations.sellers || []).map(item => item.listingId).filter(Boolean)).size },
      guardAccounting: { backendExcluded: guarded.backendExcluded, ppcFlagged: guarded.ppcFlagged } },
    accounting: { sellerObservationCount: (observations.sellers || []).length, keywordCandidateCount: corpus.length,
      titleAndTagCandidateCount: used.size, unallocatedCount: unallocated.length,
      claimBlockedCount: claimBlocked.length, ipBlockedCount: ipBlocked.length,
      irrelevantCount: irrelevant.length, sourceRejectedCount: corpus.sourceRejected.length,
      tagCount: guarded.listing.etsyTags.length, tagCapacityGap: 13 - guarded.listing.etsyTags.length },
    engineBindingHash: engineBindingHash()
  });
}

module.exports = Object.freeze({ ENGINE_ID, buildIntelligence, candidateCorpus, engineBindingHash, factsFromSnapshot,
  productTypeConflict, unverifiedAppearanceTokens, unverifiedProductDescriptors });
