'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const { canonicalJson, hashBytes } = require('./revisionStore');
const { getResearchSnapshot } = require('./commerceSnapshotStore');
const { appendArtifact, getArtifact, getArtifactState } = require('./commerceWorkflowArtifactStore');
const etsyResearchAdapter = require('./commerceIntelligence/etsyResearchAdapter');
const ipGuard = require('./ipGuard');
const { fold, contentTokens } = require('./commerceIntelligence/text');

const ENGINE_ID = 'etsy-research-to-mkl-v1';
const WINNER_LIMIT = 60;
const MASTER_LIMIT = 1000;
const TIERS = new Set(['PRIMARY', 'SECONDARY', 'LONG_TAIL', 'PATTERN_ONLY', 'REVIEW', 'EXCLUDED']);
const MODELED_FIELDS = new Set(['totalSold', 'sold24h', 'totalViews', 'avgViews', 'views24h', 'revenue',
  'conversionRate', 'favorites', 'favoriteRate', 'shopDailySold', 'ageDays']);
const PUBLIC_FIELDS = new Set(['title', 'shopName', 'priceAmount', 'originalPriceAmount', 'reviewCount', 'rating',
  'tags', 'tagDiagnostics', 'categories', 'country', 'url', 'reportedRank', 'badges']);
const STOP = new Set(['gift', 'gifts', 'regalo', 'regalos', 'custom', 'personalized', 'personalised', 'personalizado',
  'personalizada', 'etsy', 'sale', 'new', 'best', 'para', 'with', 'from']);
const PERSONALIZATION = new Set(['custom', 'personalized', 'personalised', 'personalizado', 'personalizada', 'name', 'nombre']);
const GIFT = new Set(['gift', 'gifts', 'regalo', 'regalos', 'present']);
const CONCEPT_GROUPS = Object.freeze([
  ['daughter', 'hija', 'girl'], ['mother', 'madre', 'mom', 'mama'], ['father', 'padre', 'dad', 'papa'],
  ['gift', 'gifts', 'regalo', 'regalos', 'present'], ['necklace', 'collar', 'pendant'],
  ['hat', 'cap', 'gorra'], ['blanket', 'manta'], ['shirt', 'tshirt', 'tee', 'camiseta'],
  ['custom', 'personalized', 'personalised', 'personalizado', 'personalizada'],
  ['birthday', 'cumpleanos'], ['graduation', 'graduacion'], ['christmas', 'navidad']
].map(group => Object.freeze(group)));

class EtsyWorkflowError extends Error {
  constructor(code, status = 400, details = {}) { super(code); this.code = code; this.status = status; this.details = details; }
}

function fileHash(id, files) {
  const hash = crypto.createHash('sha256').update(`${id}\0`);
  for (const file of files) hash.update(file.split(/[\\/]/).pop()).update('\0').update(fs.readFileSync(file)).update('\0');
  return hash.digest('hex');
}

function bindings() {
  return Object.freeze({
    engine: fileHash(ENGINE_ID, [__filename, require.resolve('./commerceWorkflowArtifactStore')]),
    parser: etsyResearchAdapter.parserBindingHash(),
    normalization: fileHash('etsy-entity-normalization-v1', [__filename, require.resolve('./commerceIntelligence/etsyResearchAdapter')]),
    scoring: fileHash('etsy-winner-pattern-mkl-v1', [__filename]), policy: null
  });
}

function number(value) { return value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value); }
function bool(value) { return typeof value === 'object' && value !== null && 'value' in value ? value.value : value; }
function text(value) { return value == null ? '' : String(value).replace(/\s+/g, ' ').trim(); }
function tokens(value) { return contentTokens(value).filter(token => token.length > 1); }
function percentile(values, value) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length || !Number.isFinite(value)) return null;
  const below = sorted.filter(item => item < value).length; const equal = sorted.filter(item => item === value).length;
  return (below + Math.max(0, equal - 1) / 2) / Math.max(1, sorted.length - 1);
}
function entityKey(item) {
  if (text(item.listingId)) return `listing:${text(item.listingId)}`;
  if (text(item.url)) return `url:${fold(item.url).replace(/[?#].*$/, '')}`;
  return `title:${fold(item.title)}|shop:${fold(item.shopName)}`;
}
function entityId(key) { return `ETSY-${crypto.createHash('sha256').update(key).digest('hex').slice(0, 16).toUpperCase()}`; }
function isPresent(value) { return Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== ''; }
function semanticTokens(value) {
  const base = new Set(tokens(value));
  for (const group of CONCEPT_GROUPS) if (group.some(token => base.has(token))) for (const token of group) base.add(token);
  return base;
}

function evidenceTier(field, observation) {
  const provider = text(observation.evidenceProvider || observation.sourceLabel).toUpperCase();
  if (provider.includes('YTREND')) return 'E3_SUPPLEMENTAL_INDEX';
  if (MODELED_FIELDS.has(field) || provider.includes('HEYETSY')) return 'E2_MODELED_THIRD_PARTY';
  if (PUBLIC_FIELDS.has(field)) return 'E1_OBSERVED_PUBLIC';
  return 'E4_STAFF_ASSERTED_UNVERIFIED';
}

function mergeEntities(observations) {
  const groups = new Map();
  for (const item of observations) {
    const key = entityKey(item); const group = groups.get(key) || [];
    group.push(item); groups.set(key, group);
  }
  const fields = [...PUBLIC_FIELDS, ...MODELED_FIELDS];
  return [...groups.entries()].map(([key, rows]) => {
    const ordered = [...rows].sort((a, b) => Number(b.provenance?.importId || 0) - Number(a.provenance?.importId || 0)
      || Number(a.sourceRank || 9999) - Number(b.sourceRank || 9999));
    const entity = { entityId: entityId(key), listingId: text(ordered.find(item => text(item.listingId))?.listingId) || null,
      observationCount: rows.length, observations: rows.map(item => ({ importId: item.provenance?.importId,
        sourceRow: item.provenance?.sourceRow, rawHash: item.provenance?.rawHash, provider: item.evidenceProvider,
        sourceRank: item.sourceRank })) };
    entity.fieldProvenance = {};
    for (const field of fields) {
      const candidates = ordered.filter(item => isPresent(item[field])).map(item => ({ value: item[field],
        tier: evidenceTier(field, item), importId: item.provenance?.importId, sourceRow: item.provenance?.sourceRow,
        rawHash: item.provenance?.rawHash, provider: item.evidenceProvider }));
      if (!candidates.length) { entity[field] = null; continue; }
      entity[field] = candidates[0].value;
      const references = candidates.map(({ tier, importId, sourceRow, rawHash, provider }) => ({ tier, importId, sourceRow, rawHash, provider }));
      entity.fieldProvenance[field] = { selected: references[0], observationRefs: references,
        conflict: new Set(candidates.map(item => canonicalJson(item.value))).size > 1 };
    }
    entity.queryContexts = [...new Set(rows.map(item => text(item.sourceHints?.keywordContext?.value)).filter(Boolean))];
    entity.sourceRanks = rows.map(item => number(item.reportedRank?.value ?? item.sourceRank)).filter(value => value !== null);
    entity.bestObservedRank = entity.sourceRanks.length ? Math.min(...entity.sourceRanks) : null;
    return entity;
  });
}

function relevance(entity, seedPhrase) {
  const seed = semanticTokens(seedPhrase);
  const haystack = semanticTokens([entity.title, ...(entity.tags || [])].join(' '));
  const shared = [...seed].filter(token => haystack.has(token));
  const exactContext = entity.queryContexts.some(value => fold(value) === fold(seedPhrase));
  const titleShared = [...semanticTokens(entity.title)].filter(token => seed.has(token));
  const relevant = seed.size === 0 || shared.length > 0;
  return { relevant, sharedTokens: shared, titleSharedTokens: titleShared, exactContext,
    reason: relevant ? (titleShared.length ? 'TITLE_SEMANTIC_SEED_OVERLAP' : 'TAG_SEMANTIC_SEED_OVERLAP')
      : exactContext ? 'CAPTURED_FOR_SEED_BUT_LISTING_NOT_RELEVANT' : 'NO_SEED_RELEVANCE' };
}

function rankEntities(entities, seedPhrase) {
  const annotated = entities.map(entity => ({ ...entity, relevance: relevance(entity, seedPhrase) }));
  const relevant = annotated.filter(item => item.relevance.relevant);
  const metric = field => relevant.map(item => number(item[field])).filter(value => value !== null);
  const metricValues = Object.fromEntries(['totalSold','sold24h','totalViews','views24h','favorites','conversionRate',
    'reviewCount','ageDays','bestObservedRank'].map(field => [field, metric(field)]));
  for (const item of relevant) {
    const components = [];
    const add = (name, raw, weight, transform = value => value) => {
      const value = number(raw); if (value === null) return;
      const score = percentile(metricValues[name], transform(value));
      if (score !== null) components.push({ name, value, score: Number(score.toFixed(4)), weight,
        tier: MODELED_FIELDS.has(name) ? 'E2_MODELED_THIRD_PARTY' : 'E1_OBSERVED_PUBLIC' });
    };
    add('totalSold', item.totalSold, 0.22, value => Math.log10(value + 1));
    add('sold24h', item.sold24h, 0.13, value => Math.log10(value + 1));
    add('totalViews', item.totalViews, 0.12, value => Math.log10(value + 1));
    add('views24h', item.views24h, 0.1, value => Math.log10(value + 1));
    add('favorites', item.favorites, 0.08, value => Math.log10(value + 1));
    add('conversionRate', item.conversionRate, 0.1);
    add('reviewCount', item.reviewCount, 0.08, value => Math.log10(value + 1));
    const rank = number(item.bestObservedRank);
    if (rank !== null) components.push({ name: 'bestObservedRank', value: rank,
      score: Number((1 - percentile(metricValues.bestObservedRank, rank)).toFixed(4)), weight: 0.12,
      tier: 'E1_OBSERVED_PUBLIC' });
    const age = number(item.ageDays);
    if (age !== null) components.push({ name: 'ageDays', value: age,
      score: Number((1 - percentile(metricValues.ageDays, age)).toFixed(4)), weight: 0.05,
      tier: 'E2_MODELED_THIRD_PARTY' });
    const totalWeight = components.reduce((sum, component) => sum + component.weight, 0);
    item.winnerScore = totalWeight ? Number((components.reduce((sum, component) => sum + component.score * component.weight, 0)
      / totalWeight * 100).toFixed(2)) : null;
    item.scoreComponents = components;
  }
  const take = (name, sort, predicate = () => true) => ({ name,
    members: relevant.filter(predicate).sort(sort).slice(0, 10).map(item => item.entityId) });
  const desc = field => (a, b) => (number(b[field]) ?? -1) - (number(a[field]) ?? -1) || a.entityId.localeCompare(b.entityId);
  const asc = field => (a, b) => (number(a[field]) ?? Infinity) - (number(b[field]) ?? Infinity) || a.entityId.localeCompare(b.entityId);
  const cohorts = [
    take('CURRENT_ORGANIC_LEADERS', asc('bestObservedRank'), item => !bool(item.badges?.isAd)),
    take('TRACTION_LEADERS', desc('totalSold'), item => number(item.totalSold) !== null),
    take('LIVE_VELOCITY', desc('sold24h'), item => number(item.sold24h) !== null),
    take('ENGAGEMENT_LEADERS', desc('favorites'), item => number(item.favorites) !== null),
    take('CONVERSION_CANDIDATES', desc('conversionRate'), item => number(item.conversionRate) !== null),
    take('EMERGING_WINNERS', (a, b) => asc('ageDays')(a, b) || desc('views24h')(a, b), item => number(item.ageDays) !== null)
  ].filter(cohort => cohort.members.length);
  return { entities: annotated, relevant: relevant.sort((a, b) => (b.winnerScore ?? -1) - (a.winnerScore ?? -1)), cohorts };
}

function defaultWinnerIds(ranked) {
  const chosen = []; const shops = new Map();
  for (const cohort of ranked.cohorts) for (const id of cohort.members) {
    const entity = ranked.relevant.find(item => item.entityId === id); const shop = fold(entity?.shopName || 'unknown');
    if (chosen.includes(id) || (shops.get(shop) || 0) >= 3) continue;
    chosen.push(id); shops.set(shop, (shops.get(shop) || 0) + 1);
    if (chosen.length >= 30) return chosen;
  }
  return chosen;
}

async function currentArtifact(db, scope, projectId, id, kind) {
  const artifact = await getArtifact(db, scope, projectId, id, kind); const state = await getArtifactState(db, scope, projectId);
  if (state.heads[kind]?.id !== artifact.id) throw new EtsyWorkflowError('STALE_ETSY_WORKFLOW_ARTIFACT', 409,
    { kind, selectedId: artifact.id, currentId: state.heads[kind]?.id || null });
  return artifact;
}

async function previewWinners(db, scope, projectId, input) {
  if (scope.marketplace !== 'ETSY') throw new EtsyWorkflowError('ETSY_PROJECT_REQUIRED');
  const research = await getResearchSnapshot(db, scope, projectId, input.researchSnapshotId);
  const observations = research.observations?.sellers || [];
  if (!observations.length) throw new EtsyWorkflowError('ETSY_SEARCH_OBSERVATIONS_REQUIRED', 409);
  const ranked = rankEntities(mergeEntities(observations), text(input.seedPhrase));
  const requested = [...new Set((input.selectedEntityIds || []).map(text).filter(Boolean))];
  const known = new Set(ranked.entities.map(item => item.entityId)); const unknown = requested.filter(id => !known.has(id));
  if (unknown.length) throw new EtsyWorkflowError('ETSY_WINNER_NOT_IN_RESEARCH', 409, { unknown });
  const selectedEntityIds = requested.length ? requested : defaultWinnerIds(ranked);
  if (!selectedEntityIds.length || selectedEntityIds.length > WINNER_LIMIT) throw new EtsyWorkflowError('ETSY_WINNER_SELECTION_INVALID');
  const payload = { seedPhrase: text(input.seedPhrase), entities: ranked.entities,
    relevantEntityIds: ranked.relevant.map(item => item.entityId), rejectedIrrelevant: ranked.entities.filter(item => !item.relevance.relevant)
      .map(item => ({ entityId: item.entityId, listingId: item.listingId, title: item.title, reason: item.relevance.reason })),
    cohorts: ranked.cohorts, selectedEntityIds, selectionMode: requested.length ? 'STAFF_SELECTED' : 'ENGINE_SUGGESTED' };
  const dependencies = { researchSnapshotId: research.id, researchSnapshotHash: research.snapshot_hash,
    imports: research.importManifest.map(item => ({ id: item.id, rawHash: item.rawHash, parserId: item.parserId, parserHash: item.parserHash })) };
  const accounting = { sourceObservationCount: observations.length, normalizedEntityCount: ranked.entities.length,
    duplicateObservationCount: observations.length - ranked.entities.length, relevantEntityCount: ranked.relevant.length,
    irrelevantEntityCount: ranked.entities.length - ranked.relevant.length, selectedWinnerCount: selectedEntityIds.length,
    cohortCount: ranked.cohorts.length, droppedObservationCount: 0 };
  return { zeroWrite: true, dependencies, payload, accounting, bindings: bindings(),
    previewHash: hashBytes(canonicalJson({ dependencies, payload, accounting, bindings: bindings() })) };
}

async function saveWinners(db, scope, projectId, input) {
  const preview = await previewWinners(db, scope, projectId, input);
  return appendArtifact(db, scope, projectId, { kind: 'ETSY_WINNER_SET', expectedHeadArtifactId: input.expectedHeadArtifactId,
    idempotencyKey: input.idempotencyKey, changeReason: input.changeReason, dependencies: preview.dependencies,
    payload: preview.payload, accounting: preview.accounting, bindings: preview.bindings });
}

function phraseCounts(values, size, excluded = new Set()) {
  const counts = new Map();
  for (const value of values) {
    const words = tokens(value); const seen = new Set();
    for (let index = 0; index + size <= words.length; index++) {
      const phrase = words.slice(index, index + size).join(' ');
      if (words.slice(index, index + size).every(word => excluded.has(word))) continue;
      seen.add(phrase);
    }
    for (const phrase of seen) counts.set(phrase, (counts.get(phrase) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function minePatterns(winner) {
  const selected = new Set(winner.payload.selectedEntityIds || []);
  const entities = (winner.payload.entities || []).filter(item => selected.has(item.entityId));
  if (!entities.length) throw new EtsyWorkflowError('ETSY_WINNERS_REQUIRED', 409);
  const queryTokens = new Set(tokens(winner.payload.seedPhrase)); const titles = entities.map(item => text(item.title)).filter(Boolean);
  const tagMap = new Map();
  for (const entity of entities) for (const tag of entity.tags || []) {
    const clean = text(tag); if (!clean || /^no tags? found$/i.test(clean)) continue;
    const key = fold(clean); const current = tagMap.get(key) || { phrase: clean, listingIds: new Set(), shops: new Set() };
    current.listingIds.add(entity.listingId || entity.entityId); current.shops.add(fold(entity.shopName)); tagMap.set(key, current);
  }
  const wordCounts = phraseCounts(titles, 1, queryTokens).filter(([word]) => !STOP.has(word)).slice(0, 30);
  const leadingCounts = phraseCounts(titles.map(title => Array.from(title).slice(0, 40).join('')), 1, queryTokens)
    .filter(([word]) => !STOP.has(word)).slice(0, 20);
  const repeatedPhrases = [...phraseCounts(titles, 3, queryTokens), ...phraseCounts(titles, 2, queryTokens)]
    .filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1] || b[0].split(' ').length - a[0].split(' ').length).slice(0, 40);
  const titleHeads = titles.map(title => text(title.split(/[,|:–—-]/)[0])).filter(Boolean);
  const prices = entities.map(item => number(item.priceAmount)).filter(value => value !== null && value > 0).sort((a, b) => a - b);
  const percent = set => Math.round(100 * titles.filter(title => tokens(title).some(token => set.has(token))).length / titles.length);
  const shops = new Map(); for (const entity of entities) shops.set(fold(entity.shopName), (shops.get(fold(entity.shopName)) || 0) + 1);
  return {
    seedPhrase: winner.payload.seedPhrase, winnerArtifactId: winner.id, selectedEntityIds: [...selected], sampleSize: entities.length,
    titleHeads, topWords: wordCounts.map(([phrase, count]) => ({ phrase, count, share: Number((count / titles.length).toFixed(3)) })),
    leadingWords: leadingCounts.map(([phrase, count]) => ({ phrase, count, share: Number((count / titles.length).toFixed(3)) })),
    repeatedPhrases: repeatedPhrases.map(([phrase, count]) => ({ phrase, count, share: Number((count / titles.length).toFixed(3)) })),
    observedTags: [...tagMap.values()].map(item => ({ phrase: item.phrase, listingSpread: item.listingIds.size,
      shopSpread: item.shops.size, evidenceTier: 'E1_OBSERVED_PUBLIC' })).sort((a, b) => b.shopSpread - a.shopSpread
        || b.listingSpread - a.listingSpread || a.phrase.localeCompare(b.phrase)),
    structure: { personalizationRate: percent(PERSONALIZATION), giftRate: percent(GIFT),
      averageWords: Number((titles.reduce((sum, title) => sum + tokens(title).length, 0) / titles.length).toFixed(1)),
      averageCharacters: Math.round(titles.reduce((sum, title) => sum + Array.from(title).length, 0) / titles.length) },
    marketContext: { price: prices.length ? { median: prices[Math.floor(prices.length / 2)], low: prices[Math.floor(prices.length * .2)],
      high: prices[Math.min(prices.length - 1, Math.floor(prices.length * .8))], unit: 'SOURCE_DISPLAY_UNIT' } : null,
      uniqueShopCount: shops.size, largestShopShare: Number((Math.max(0, ...shops.values()) / entities.length).toFixed(3)) },
    tagDiagnostics: { unparseableCellCount: entities.filter(item => item.tagDiagnostics?.status === 'UNPARSEABLE_CONCATENATED_SUGGESTIONS').length },
    evidenceTiers: { publicPattern: 'E1_OBSERVED_PUBLIC', modeledRanking: 'E2_MODELED_THIRD_PARTY',
      ytrendsSupplement: 'E3_SUPPLEMENTAL_INDEX', staffOverride: 'E4_STAFF_ASSERTED_UNVERIFIED' }
  };
}

async function previewPatterns(db, scope, projectId, input) {
  const winner = await currentArtifact(db, scope, projectId, input.winnerArtifactId, 'ETSY_WINNER_SET');
  const payload = minePatterns(winner); const dependencies = { winnerArtifactId: winner.id, winnerArtifactHash: winner.artifactHash,
    researchSnapshotId: winner.dependencies.researchSnapshotId, researchSnapshotHash: winner.dependencies.researchSnapshotHash };
  const accounting = { selectedWinnerCount: payload.sampleSize, titleHeadCount: payload.titleHeads.length,
    observedTagCount: payload.observedTags.length, repeatedPhraseCount: payload.repeatedPhrases.length,
    topWordCount: payload.topWords.length, unparseableTagCellCount: payload.tagDiagnostics.unparseableCellCount,
    droppedWinnerCount: 0 };
  return { zeroWrite: true, dependencies, payload, accounting, bindings: bindings(),
    previewHash: hashBytes(canonicalJson({ dependencies, payload, accounting, bindings: bindings() })) };
}

async function savePatterns(db, scope, projectId, input) {
  const preview = await previewPatterns(db, scope, projectId, input);
  return appendArtifact(db, scope, projectId, { kind: 'ETSY_PATTERN_SNAPSHOT', expectedHeadArtifactId: input.expectedHeadArtifactId,
    idempotencyKey: input.idempotencyKey, changeReason: input.changeReason, dependencies: preview.dependencies,
    payload: preview.payload, accounting: preview.accounting, bindings: preview.bindings });
}

function normalizeYtrendsSupplement(raw, seedPhrase, fetchedAt = new Date().toISOString()) {
  const data = raw?.data && typeof raw.data === 'object' ? raw.data : (raw && typeof raw === 'object' ? raw : {});
  const phrases = new Map();
  const add = (value, sourceField) => {
    const phrase = text(typeof value === 'string' ? value : value?.keyword || value?.tag || value?.name);
    if (!phrase || phrase.length > 140) return;
    const key = fold(phrase); const current = phrases.get(key) || { phrase, sourceFields: [] };
    if (!current.sourceFields.includes(sourceField)) current.sourceFields.push(sourceField); phrases.set(key, current);
  };
  for (const item of Array.isArray(data.adjacent_tags) ? data.adjacent_tags : []) add(item, 'adjacent_tags');
  for (const item of Array.isArray(data.related_keywords) ? data.related_keywords : []) add(item, 'related_keywords');
  for (const listing of Array.isArray(data.top_listings) ? data.top_listings : []) {
    for (const tag of Array.isArray(listing.tags) ? listing.tags : []) add(tag, 'top_listings.tags');
  }
  return { provider: 'YTRENDS_MCP', evidenceTier: 'E3_SUPPLEMENTAL_INDEX', seedPhrase: text(seedPhrase), fetchedAt,
    phrases: [...phrases.values()], overview: data.overview && typeof data.overview === 'object' ? data.overview : null,
    responseHash: hashBytes(canonicalJson(raw == null ? null : raw)) };
}

async function supplementPatternsWithYtrends(db, scope, projectId, input, fetcher) {
  const pattern = await currentArtifact(db, scope, projectId, input.patternArtifactId, 'ETSY_PATTERN_SNAPSHOT');
  let raw;
  try { raw = await fetcher(pattern.payload.seedPhrase); }
  catch (error) { throw new EtsyWorkflowError('ETSY_YTRENDS_UNAVAILABLE', 503, { providerMessage: text(error?.message).slice(0, 300) }); }
  const supplement = normalizeYtrendsSupplement(raw, pattern.payload.seedPhrase);
  if (!supplement.phrases.length) throw new EtsyWorkflowError('ETSY_YTRENDS_NO_USABLE_PHRASES', 422);
  const payload = { ...pattern.payload, ytrendsSupplement: supplement };
  const dependencies = { ...pattern.dependencies, basePatternArtifactId: pattern.id, basePatternArtifactHash: pattern.artifactHash };
  const accounting = { ...pattern.accounting, ytrendsSupplementPhraseCount: supplement.phrases.length };
  return appendArtifact(db, scope, projectId, { kind: 'ETSY_PATTERN_SNAPSHOT', expectedHeadArtifactId: pattern.id,
    idempotencyKey: input.idempotencyKey, changeReason: input.changeReason, dependencies, payload, accounting,
    bindings: bindings() });
}

function intentOf(phrase) {
  const set = new Set(tokens(phrase));
  if ([...set].some(token => PERSONALIZATION.has(token))) return 'PERSONALIZATION';
  if ([...set].some(token => GIFT.has(token))) return 'GIFT_INTENT';
  if ([...set].some(token => ['daughter','hija','mother','madre','mom','mama','dad','papa','wife','esposa'].includes(token))) return 'RECIPIENT';
  if ([...set].some(token => ['birthday','cumpleanos','christmas','navidad','graduation','graduacion','wedding','anniversary'].includes(token))) return 'OCCASION';
  return set.size >= 3 ? 'LONG_TAIL' : 'PRODUCT_OR_MODIFIER';
}

function buildMaster(pattern, decisions = []) {
  const candidates = new Map();
  const add = (raw, sourceType, confidence, provenance = {}) => {
    const phrase = text(raw); if (!phrase || phrase.length > 140) return;
    const key = fold(phrase); const current = candidates.get(key) || { phrase, sourceTypes: new Set(), provenance: [],
      listingSpread: 0, shopSpread: 0, confidence: 0 };
    current.sourceTypes.add(sourceType); current.provenance.push({ sourceType, confidence, ...provenance });
    current.confidence = Math.max(current.confidence, confidence); current.listingSpread = Math.max(current.listingSpread, provenance.listingSpread || 0);
    current.shopSpread = Math.max(current.shopSpread, provenance.shopSpread || 0); candidates.set(key, current);
  };
  add(pattern.payload.seedPhrase, 'PROJECT_SEED', .75, { evidenceTier: 'E4_STAFF_ASSERTED_UNVERIFIED' });
  for (const item of pattern.payload.observedTags || []) add(item.phrase, 'OBSERVED_TAG', .95, item);
  for (const phrase of pattern.payload.titleHeads || []) add(phrase, 'TITLE_HEAD', .85, { evidenceTier: 'E1_OBSERVED_PUBLIC' });
  for (const item of pattern.payload.repeatedPhrases || []) add(item.phrase, 'REPEATED_TITLE_PHRASE', Math.min(.9, .55 + item.share),
    { evidenceTier: 'E1_OBSERVED_PUBLIC', listingSpread: item.count });
  for (const item of pattern.payload.leadingWords || []) add(item.phrase, 'LEADING_WORD', Math.min(.7, .35 + item.share),
    { evidenceTier: 'E1_OBSERVED_PUBLIC', listingSpread: item.count });
  for (const item of pattern.payload.ytrendsSupplement?.phrases || []) add(item.phrase, 'YTRENDS_SUPPLEMENT', .4,
    { evidenceTier: 'E3_SUPPLEMENTAL_INDEX', sourceFields: item.sourceFields,
      responseHash: pattern.payload.ytrendsSupplement.responseHash });
  const decisionMap = new Map((decisions || []).map(item => [fold(item.phrase), item]));
  const seedVocabulary = semanticTokens(pattern.payload.seedPhrase);
  const sampleSize = Math.max(1, Number(pattern.payload.sampleSize) || 1);
  const scored = [...candidates.values()].map(item => {
    const phraseVocabulary = semanticTokens(item.phrase);
    const seedOverlap = seedVocabulary.size ? [...seedVocabulary].filter(token => phraseVocabulary.has(token)).length / seedVocabulary.size : 0;
    const specificity = Math.min(1, tokens(item.phrase).length / 5);
    const evidenceSpread = Math.min(1, item.listingSpread / sampleSize);
    const competitionProxy = Math.min(1, item.shopSpread / sampleSize);
    const demandProxy = .65 * item.confidence + .35 * evidenceSpread;
    const opportunityScore = demandProxy * (1 - .45 * competitionProxy);
    return { ...item, seedOverlap, evidenceSpread, competitionProxy, demandProxy, opportunityScore,
      score: Number((100 * (.5 * demandProxy + .2 * specificity + .2 * seedOverlap + .1 * (1 - competitionProxy))).toFixed(2)) };
  }).sort((a, b) => b.score - a.score || b.shopSpread - a.shopSpread || a.phrase.localeCompare(b.phrase));
  if (scored.length > MASTER_LIMIT) throw new EtsyWorkflowError('ETSY_MASTER_KEYWORD_LIMIT', 413, { count: scored.length, limit: MASTER_LIMIT });
  const keywords = scored.map((item, index) => {
    const decision = decisionMap.get(fold(item.phrase)); const ip = ipGuard.screenText(item.phrase);
    const primaryEvidence = item.sourceTypes.has('PROJECT_SEED')
      || (item.seedOverlap > 0 && item.sourceTypes.has('OBSERVED_TAG'))
      || (item.seedOverlap > 0 && item.sourceTypes.has('REPEATED_TITLE_PHRASE') && item.listingSpread >= 2);
    const defaultTier = ip.verdict === 'BLOCK' ? 'EXCLUDED' : primaryEvidence ? 'PRIMARY'
      : item.seedOverlap === 0 && item.sourceTypes.has('TITLE_HEAD') ? 'REVIEW'
        : item.sourceTypes.has('OBSERVED_TAG') || item.sourceTypes.has('TITLE_HEAD') || item.score >= 70 ? 'SECONDARY'
          : tokens(item.phrase).length >= 3 ? 'LONG_TAIL' : 'PATTERN_ONLY';
    const tier = TIERS.has(decision?.tier) ? decision.tier : defaultTier;
    return { keywordId: `ETSY-KW-${String(index + 1).padStart(5, '0')}`, phrase: item.phrase, priorityRank: index + 1,
      score: item.score, tier, disposition: tier === 'EXCLUDED' ? (ip.verdict === 'BLOCK' ? 'IP_BLOCKED' : 'STAFF_EXCLUDED') : 'RESEARCH_CANDIDATE_REQUIRES_TRUTH_GATE',
      intent: intentOf(item.phrase), semanticCluster: [...new Set(tokens(item.phrase))].sort().join(' '),
      sourceTypes: [...item.sourceTypes], listingSpread: item.listingSpread, shopSpread: item.shopSpread,
      confidence: item.confidence, seedOverlap: Number(item.seedOverlap.toFixed(3)),
      demandProxy: Number(item.demandProxy.toFixed(3)), competitionProxy: Number(item.competitionProxy.toFixed(3)),
      opportunityScore: Number((item.opportunityScore * 100).toFixed(2)),
      tierReason: ip.verdict === 'BLOCK' ? 'IP_BLOCKED' : primaryEvidence ? 'PRIMARY_SEED_OR_CROSS_LISTING_EVIDENCE'
        : item.seedOverlap === 0 && item.sourceTypes.has('TITLE_HEAD') ? 'REVIEW_NO_SEED_RELEVANCE' : 'SECONDARY_PATTERN_EVIDENCE',
      provenance: item.provenance, ipHits: ip.verdict === 'BLOCK' ? ip.hits : [],
      staffNote: text(decision?.note).slice(0, 500) };
  });
  const known = new Set(keywords.map(item => fold(item.phrase))); const unknown = [...decisionMap.keys()].filter(key => !known.has(key));
  if (unknown.length) throw new EtsyWorkflowError('ETSY_MASTER_DECISION_NOT_IN_PATTERN', 409, { unknown });
  return { payload: { seedPhrase: pattern.payload.seedPhrase, keywords,
    semanticClusters: [...new Set(keywords.map(item => item.semanticCluster))].length,
    evidenceTierPolicy: pattern.payload.evidenceTiers }, accounting: { sourcePhraseCount: scored.length,
    masterKeywordCount: keywords.length, availableForAllocation: keywords.filter(item => item.tier !== 'EXCLUDED').length,
    ipBlockedCount: keywords.filter(item => item.disposition === 'IP_BLOCKED').length,
    staffExcludedCount: keywords.filter(item => item.disposition === 'STAFF_EXCLUDED').length,
    primaryCount: keywords.filter(item => item.tier === 'PRIMARY').length,
    reviewCount: keywords.filter(item => item.tier === 'REVIEW').length,
    semanticClusterCount: new Set(keywords.map(item => item.semanticCluster)).size, droppedKeywordCount: 0 } };
}

async function previewMasterKeywords(db, scope, projectId, input) {
  const pattern = await currentArtifact(db, scope, projectId, input.patternArtifactId, 'ETSY_PATTERN_SNAPSHOT');
  const built = buildMaster(pattern, input.decisions || []); const dependencies = { patternArtifactId: pattern.id,
    patternArtifactHash: pattern.artifactHash, winnerArtifactId: pattern.dependencies.winnerArtifactId,
    winnerArtifactHash: pattern.dependencies.winnerArtifactHash, researchSnapshotId: pattern.dependencies.researchSnapshotId,
    researchSnapshotHash: pattern.dependencies.researchSnapshotHash };
  return { zeroWrite: true, dependencies, ...built, bindings: bindings(),
    previewHash: hashBytes(canonicalJson({ dependencies, payload: built.payload, accounting: built.accounting, bindings: bindings() })) };
}

async function saveMasterKeywords(db, scope, projectId, input) {
  const preview = await previewMasterKeywords(db, scope, projectId, input);
  return appendArtifact(db, scope, projectId, { kind: 'ETSY_MASTER_KEYWORDS', expectedHeadArtifactId: input.expectedHeadArtifactId,
    idempotencyKey: input.idempotencyKey, changeReason: input.changeReason, dependencies: preview.dependencies,
    payload: preview.payload, accounting: preview.accounting, bindings: preview.bindings });
}

module.exports = Object.freeze({ EtsyWorkflowError, bindings, evidenceTier, mergeEntities, relevance, rankEntities,
  previewWinners, saveWinners, minePatterns, previewPatterns, savePatterns, buildMaster, previewMasterKeywords,
  saveMasterKeywords, normalizeYtrendsSupplement, supplementPatternsWithYtrends });
