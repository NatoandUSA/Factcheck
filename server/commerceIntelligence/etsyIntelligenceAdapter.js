'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const ipGuard = require('../ipGuard');
const { evaluateListingGuard } = require('../listingGuard');
const { evaluateText, SURFACES } = require('../claimGuard');
const { generateImagePromptSuite } = require('../imagePromptGenerator');
const { guardFactsForLanguage } = require('./amazonBuyerLanguage');
const { allowedRecipientFamilies, conflictingRecipient, auditProductFamilyAlignment } = require('./semantic');

const ENGINE_ID = 'etsy-commerce-intelligence-v1';

function factsFromSnapshot(snapshot) {
  return Object.freeze(Object.fromEntries(Object.entries(snapshot?.asserted || {})
    .map(([key, assertion]) => [key, assertion?.value])));
}
function text(value) { return Array.isArray(value) ? value.map(text).filter(Boolean).join(', ') : value == null ? '' : String(value).trim(); }
function fold(value) { return text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function titleCase(value) {
  return text(value).replace(/(^|[\s,])([a-záéíóúñ])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
}
const SOURCE_BOILERPLATE = /(?:no tags? found|\bfrom shop\b|\bsale price\b|\boriginal price\b|\badd to cart\b|\bmore like this\b|\bsold in the last\b|\bviews? in the last\b|\bestimated (?:total|revenue)|\bfavorites?\b|\bfree shipping\b)/i;
const CURRENCY_OR_METRIC = /(?:[$€£¥₫₹₱₩₽฿]|\b\d+(?:[.,]\d+)?\s*(?:usd|eur|gbp|idr|vnd)\b)/i;
const STOP_TOKENS = new Set(['the','and','for','with','from','this','that','para','con','del','las','los','gift','gifts','regalo','custom','option','available']);
const PRODUCT_NOUN_GROUPS = Object.freeze({
  NECKLACE: ['necklace','collar','pendant','cadena'],
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
  TOY: ['puzzle','toy','juguete'], BOTTLE: ['bottle','flask','botella'],
  FRAME: ['frame','marco'], SUNCATCHER: ['suncatcher'], JAR: ['jar'],
  CHIME: ['chime','chimes','windchime'], URN: ['urn'], STONE: ['stone','rock']
});
const APPEARANCE_TOKENS = new Set(['colorful','multicolor','multicolored','red','blue','green','yellow','pink','purple',
  'orange','black','white','brown','gray','grey','rojo','roja','azul','verde','amarillo','amarilla','rosa','morado',
  'morada','negro','negra','blanco','blanca','marron','gris']);
const SAFE_INTENT_TOKENS = new Set(['dad','daddy','father','mom','mommy','mother','mama','family','wife','husband',
  'son','daughter','hija','hijo','sister','brother','abuela','abuelo','birthday','cumpleanos','christmas','navidad',
  'anniversary','wedding','graduation','love','amor','memorial','gift','gifts','regalo','present']);
const PRODUCT_NOUN_TOKENS = new Set(Object.values(PRODUCT_NOUN_GROUPS).flat().map(fold));
const SPANISH_CUES = new Set(['para','hija','regalo','regalos','collar','collares','cadena','cadenas','mujer','madre',
  'mama','cumpleanos','navidad','con','de','del','amor','joyeria','plata','oro','graduacion','espanol']);
const ENGLISH_CUES = new Set(['for','daughter','gift','gifts','necklace','necklaces','woman','women','mother','mom','dad',
  'birthday','christmas','with','of','love','jewelry','silver','gold','graduation','personalized']);

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

function languageOfPhrase(phrase) {
  const original = text(phrase); const phraseTokens = [...tokens(original)];
  let es = /[áéíóúñü¿¡]/i.test(original) ? 2 : 0; let en = 0;
  for (const token of phraseTokens) {
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

function resolveListingLanguage(configuration, corpus) {
  if (configuration.listingLanguage === 'EN' || configuration.listingLanguage === 'ES') {
    return configuration.listingLanguage;
  }
  const seedLanguage = languageOfPhrase(configuration.seedPhrase);
  if (seedLanguage === 'EN' || seedLanguage === 'ES') return seedLanguage;
  const counts = { EN: 0, ES: 0 };
  for (const candidate of corpus) {
    const detected = languageOfPhrase(candidate.phrase);
    if (detected === 'EN' || detected === 'ES') counts[detected] += Math.max(1, Number(candidate.score) || 1);
  }
  return counts.ES > counts.EN ? 'ES' : 'EN';
}

function containsCompetitorShop(phrase, sellers) {
  const normalized = ` ${fold(phrase).replace(/[^a-z0-9]+/g, ' ').trim()} `;
  return sellers.find(seller => {
    const shop = fold(seller.shopName || '').replace(/[^a-z0-9]+/g, ' ').trim();
    return shop && normalized.includes(` ${shop} `);
  }) || null;
}

function tagVariants(value) {
  const segments = text(value).split(/[,;|\n]+/).map(item => item.normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s'-]+/gu, ' ').replace(/(^|\s)['-]+|['-]+(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ').trim()).filter(Boolean);
  const variants = [];
  const badStart = new Set(['and','con','de','del','en','from','of','the','shaped']);
  const badEnd = new Set(['a','and','con','de','del','en','for','from','mi','of','para','to',
    'custom','personalized','personalised','personalizado','personalizada']);
  for (const phrase of segments) {
    const words = phrase.split(' ');
    const meaningful = tokens(phrase).size > 0 && !badStart.has(fold(words[0])) && !badEnd.has(fold(words.at(-1)));
    if (meaningful && Array.from(phrase).length <= 20) variants.push(phrase);
    for (let size = Math.min(4, words.length); size >= 2; size--) {
      for (let start = 0; start + size <= words.length; start++) {
        const part = words.slice(start, start + size);
        if (badStart.has(fold(part[0])) || badEnd.has(fold(part.at(-1)))) continue;
        const candidate = part.join(' ');
        const signals = tokens(candidate);
        if (Array.from(candidate).length <= 20 && [...signals].some(token => PRODUCT_NOUN_TOKENS.has(token)
          || SAFE_INTENT_TOKENS.has(token) || ['custom','personalized','personalised','personalizado','personalizada'].includes(token))) {
          variants.push(candidate);
        }
      }
    }
  }
  return [...new Map(variants.map(item => [fold(item), item])).values()];
}

function productGroups(value) {
  const valueTokens = tokens(value); const groups = new Set();
  for (const [group, nouns] of Object.entries(PRODUCT_NOUN_GROUPS)) {
    if (nouns.some(noun => valueTokens.has(fold(noun)))) groups.add(group);
  }
  return groups;
}

function productTypeConflict(candidate, facts) {
  // Broad categories such as "Jewelry" must not authorize sibling products.
  // Exact product name/type owns the family decision.
  const identityGroups = productGroups([facts.productName, facts.productType].map(text).join(' '));
  const candidateGroups = productGroups(candidate.phrase);
  return identityGroups.size > 0 && candidateGroups.size > 0
    && ![...candidateGroups].some(group => identityGroups.has(group));
}

function unverifiedAppearanceTokens(candidate, facts) {
  const asserted = tokens([facts.colors, facts.finish].map(text).join(' '));
  return [...tokens(candidate.phrase)].filter(token => APPEARANCE_TOKENS.has(token) && !asserted.has(token));
}

function unverifiedProductDescriptors(candidate, facts) {
  const phrase = fold(candidate.phrase);
  const verifiedText = fold(Object.values(facts).map(text).join(' '));
  const explicit = [];
  if (/\bheart[ -]+shaped\b/.test(phrase) && !/\bheart[ -]+shaped\b/.test(verifiedText)) explicit.push('heart shaped');
  if (explicit.length) return explicit;
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
  for (const file of [__filename, require.resolve('./semantic'), require.resolve('../listingGuard'),
    require.resolve('../claimGuard'), require.resolve('../ipGuard'), require.resolve('./amazonBuyerLanguage'),
    require.resolve('../imagePromptGenerator')]) {
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

function corpusFromMasterArtifact(artifact) {
  if (artifact?.kind !== 'ETSY_MASTER_KEYWORDS' || !Array.isArray(artifact.payload?.keywords)) {
    throw Object.assign(new Error('ETSY_MASTER_KEYWORDS_REQUIRED'), { code: 'ETSY_MASTER_KEYWORDS_REQUIRED', status: 409 });
  }
  const eligible = new Set(['PRIMARY', 'SECONDARY', 'LONG_TAIL']);
  const corpus = artifact.payload.keywords.filter(item => eligible.has(item.tier)).map(item => ({
    phrase: item.phrase, occurrences: Math.max(1, Number(item.listingSpread) || 1), score: Number(item.score) || 0,
    sources: item.provenance || [], masterKeywordId: item.keywordId, masterPriorityRank: item.priorityRank,
    masterTier: item.tier, intent: item.intent, semanticCluster: item.semanticCluster
  })).sort((a, b) => a.masterPriorityRank - b.masterPriorityRank);
  Object.defineProperty(corpus, 'sourceRejected', { value: Object.freeze([]), enumerable: false });
  return { corpus, excluded: artifact.payload.keywords.filter(item => item.tier === 'EXCLUDED'),
    review: artifact.payload.keywords.filter(item => ['PATTERN_ONLY', 'REVIEW'].includes(item.tier)),
    total: artifact.payload.keywords.length };
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

function candidateIntent(candidate) {
  if (candidate.intent) return candidate.intent;
  const value = fold(candidate.phrase);
  if (/\b(personalized|personalised|personalizado|personalizada|custom|nombre|name)\b/.test(value)) return 'PERSONALIZATION';
  if (/\b(daughter|hija|mother|madre|mom|mama|dad|papa|wife|esposa|son|hijo)\b/.test(value)) return 'RECIPIENT';
  if (/\b(birthday|cumpleanos|christmas|navidad|graduation|graduacion|wedding|anniversary)\b/.test(value)) return 'OCCASION';
  if (/\b(gift|gifts|regalo|regalos|present)\b/.test(value)) return 'GIFT_INTENT';
  return 'PRODUCT_OR_STYLE';
}

function semanticKey(value) { return [...tokens(value)].sort().join(' '); }

const ETSY_TITLE_LIMIT = 140;

function spanishBuyerValue(value) {
  const clean = text(value).replace(/\s*(?:[-—–]\s*)?theo listing tham chiếu\s*$/iu, '').trim()
    .replace(/\bpapa\b/giu, 'papá').replace(/\bmama\b/giu, 'mamá').replace(/\bespanol\b/giu, 'español');
  const dictionary = new Map([['necklace','collar'],['personalized necklace','collar personalizado'],
    ['custom necklace','collar personalizado'],['blanket','manta'],['throw blanket','manta'],
    ['daughter','hija'],['mother','madre'],['mom','mamá'],['birthday','cumpleaños'],
    ['graduation','graduación'],['christmas','navidad'],['stainless steel','acero inoxidable'],
    ['gift box','caja de regalo'],['gift box / ready-to-gift','caja de regalo']]);
  if (dictionary.has(fold(clean))) return dictionary.get(fold(clean));
  if (clean.includes(',')) {
    const parts = clean.split(',').map(part => part.trim());
    if (parts.every(part => dictionary.has(fold(part)))) return parts.map(part => dictionary.get(fold(part))).join(', ');
  }
  return clean;
}

function spanishCompatible(value) {
  const clean = spanishBuyerValue(value);
  return clean && !/\b(?:theo|listing tham chiếu)\b/i.test(clean)
    && !['EN','MIXED'].includes(languageOfPhrase(clean)) ? clean : '';
}

function composeEtsyTitle(safe, facts, language = 'EN') {
  const verifiedIdentities = [facts.productName, facts.productType]
    .map(value => language === 'ES' ? spanishCompatible(value) : text(value)).filter(Boolean);
  const identity = verifiedIdentities.find(value => Array.from(value).length <= ETSY_TITLE_LIMIT
    && value.split(/\s+/).filter(Boolean).length <= 15);
  if (!identity) throw Object.assign(new Error('ETSY_PRODUCT_TRUTH_IDENTITY_REQUIRES_REVIEW'), {
    code: 'ETSY_PRODUCT_TRUTH_IDENTITY_REQUIRES_REVIEW', status: 409
  });
  const personalized = Boolean(text(facts.personalization));
  const alreadyPersonalized = /\b(custom|personalized|personalised|personalizado|personalizada|nombre)\b/i.test(identity);
  const prefix = language === 'ES' ? 'Personalizado' : 'Personalized';
  const proposed = titleCase((personalized && !alreadyPersonalized
    ? language === 'ES' ? `${identity} ${prefix}` : `${prefix} ${identity}` : identity).trim());
  if (Array.from(proposed).length > ETSY_TITLE_LIMIT || proposed.split(/\s+/).filter(Boolean).length > 15) {
    return titleCase(identity);
  }

  if (language === 'ES') {
    const clauses = [proposed];
    const recipient = spanishCompatible(facts.recipient || facts.audience);
    if (recipient && !fold(proposed).includes(fold(recipient))) clauses.push(`para ${recipient}`);
    for (const candidate of safe) {
      const phrase = spanishBuyerValue(candidate.phrase);
      if (languageOfPhrase(phrase) !== 'ES' || !/\b(?:collar|regalo|hija|cumplea[nñ]os|graduaci[oó]n)\b/i.test(phrase)) continue;
      const existing = fold(clauses.join(' '));
      if ([...tokens(phrase)].every(token => existing.includes(token))) continue;
      const next = `${clauses.join(' ')} · ${phrase}`;
      if (Array.from(next).length > ETSY_TITLE_LIMIT || next.split(/\s+/).length > 15) continue;
      clauses.push(`· ${phrase}`);
      if (clauses.length >= 3) break;
    }
    return titleCase(clauses.join(' ').replace(/\s+·\s+·/g, ' ·'));
  }

  const identityTokens = tokens(proposed);
  const ranked = safe.map(candidate => {
    const phrase = text(candidate.phrase);
    const words = phrase.split(/\s+/).filter(Boolean);
    const intent = candidateIntent(candidate);
    if (!['GIFT_INTENT','RECIPIENT','OCCASION'].includes(intent)
      || !phrase || !languageCompatible(phrase, 'EN') || words.length > 5 || Array.from(phrase).length > 40) return null;
    const phraseTokens = [...tokens(phrase)];
    const missing = phraseTokens.filter(token => !identityTokens.has(token));
    if (!missing.length) return null;
    const overlap = phraseTokens.filter(token => identityTokens.has(token)).length;
    const petAffinity = phraseTokens.includes('pet') ? 1 : 0;
    return { candidate, phrase, affinity: overlap + petAffinity };
  }).filter(Boolean).sort((a, b) => b.affinity - a.affinity
    || (a.candidate.masterPriorityRank || Number.MAX_SAFE_INTEGER)
      - (b.candidate.masterPriorityRank || Number.MAX_SAFE_INTEGER));

  const clauses = [proposed];
  for (const item of ranked) {
    const visible = tokens(clauses.join(' '));
    if ([...tokens(item.phrase)].every(token => visible.has(token))) continue;
    const next = `${clauses.join(' · ')} · ${item.phrase}`;
    if (Array.from(next).length > ETSY_TITLE_LIMIT || next.split(/\s+/).filter(Boolean).length > 15) continue;
    clauses.push(item.phrase);
    if (clauses.length >= 3) break;
  }
  return titleCase(clauses.join(' · '));
}

function renderFactValue(value, language = 'EN') {
  if (Array.isArray(value)) return value.map(item => renderFactValue(item, language)).filter(Boolean).join(', ');
  if (value && typeof value === 'object') {
    const labelsEs = { type:'tipo', dimensions:'dimensiones', width:'ancho', height:'alto', depth:'profundidad',
      color:'color', quantity:'cantidad' };
    return Object.entries(value).map(([key, nested]) => {
      const label = language === 'ES' ? (labelsEs[key] || key) : key.replace(/([a-z])([A-Z])/g, '$1 $2');
      const rendered = renderFactValue(nested, language);
      return rendered ? `${titleCase(label)}: ${rendered}` : '';
    }).filter(Boolean).join('; ');
  }
  const clean = text(value);
  if (!clean) return '';
  return language === 'ES' ? spanishCompatible(clean) : clean;
}

function selectExplainedTags(safe, facts) {
  const pool = [];
  for (const candidate of safe) for (const value of tagVariants(candidate.phrase)) pool.push({ value,
    intent: candidateIntent(candidate), semanticCluster: semanticKey(value), corpusKey: fold(candidate.phrase),
    masterKeywordId: candidate.masterKeywordId || null, masterPriorityRank: candidate.masterPriorityRank || null,
    masterTier: candidate.masterTier || null, sources: candidate.sources || [], reason: 'SAFE_MASTER_KEYWORD_VARIANT' });
  for (const [field, raw] of [['productIdentity', facts.productName || facts.productType], ['recipient', facts.recipient], ['occasion', facts.occasion]]) {
    for (const value of tagVariants(text(raw))) pool.push({ value, intent: field === 'recipient' ? 'RECIPIENT' : field === 'occasion' ? 'OCCASION' : 'PRODUCT_OR_STYLE',
      semanticCluster: semanticKey(value), corpusKey: null, masterKeywordId: null, masterPriorityRank: null,
      masterTier: null, sources: [{ sourceType: 'PRODUCT_TRUTH', field }], reason: `PRODUCT_TRUTH_${field.toUpperCase()}` });
  }
  const chosen = []; const values = new Set(); const clusters = new Set(); const intents = new Set();
  const add = item => {
    const key = fold(item.value); if (!key || values.has(key) || clusters.has(item.semanticCluster) || Array.from(item.value).length > 20) return false;
    chosen.push(item); values.add(key); clusters.add(item.semanticCluster); intents.add(item.intent); return true;
  };
  for (const item of pool) if (!intents.has(item.intent)) add(item);
  for (const item of pool) { if (chosen.length >= 13) break; add(item); }
  return chosen.slice(0, 13);
}

function naturalDescription(facts, title, language) {
  const es = language === 'ES';
  const identity = es ? spanishCompatible(facts.productName || facts.productType) : text(facts.productName || facts.productType);
  const recipient = es ? spanishCompatible(facts.recipient || facts.audience) : text(facts.recipient || facts.audience);
  const occasion = es ? spanishCompatible(facts.occasion) : text(facts.occasion);
  const recipientMissing = recipient && !fold(title).includes(fold(recipient));
  const occasionMissing = occasion && !fold(title).includes(fold(occasion));
  const intro = recipientMissing || occasionMissing ? (es
    ? `${identity}${recipientMissing ? ` para ${recipient}` : ''}${occasionMissing ? `, pensado para ${occasion}` : ''}.`
    : `${identity}${recipientMissing ? ` for ${recipient}` : ''}${occasionMissing ? `, designed for ${occasion}` : ''}.`) : '';
  const details = [];
  const labelsEs = { Materials:'Materiales', Personalization:'Personalización', Size:'Tamaño', Included:'Incluye',
    Format:'Formato', Brand:'Marca', Model:'Modelo', Features:'Características', Specifications:'Especificaciones',
    'Intended use':'Uso previsto', Compatibility:'Compatibilidad', Performance:'Rendimiento', Durability:'Durabilidad',
    Ingredients:'Ingredientes', Allergens:'Alérgenos', Instructions:'Instrucciones', Warranty:'Garantía',
    Safety:'Seguridad', Players:'Jugadores', Age:'Edad', Duration:'Duración', Packaging:'Presentación', Care:'Cuidado' };
  for (const [label, value] of [['Materials', facts.materials || facts.composition], ['Personalization', facts.personalization],
    ['Size', facts.sizes || facts.dimensions], ['Included', facts.includedItems], ['Format', facts.fileFormat],
    ['Brand', facts.brand], ['Model', facts.model], ['Features', facts.features || facts.capabilities],
    ['Specifications', facts.specifications], ['Intended use', facts.intendedUse],
    ['Compatibility', facts.compatibility || facts.softwareCompatibility], ['Performance', facts.performance],
    ['Durability', facts.durability], ['Ingredients', facts.ingredients],
    ['Allergens', facts.allergens], ['Instructions', facts.instructions], ['Warranty', facts.warranty],
    ['Safety', facts.safetyWarnings || facts.safety], ['Players', facts.playerCount], ['Age', facts.minimumAge],
    ['Duration', facts.duration], ['Packaging', facts.packaging], ['Care', facts.care]]) {
    const rendered = renderFactValue(value, language);
    if (rendered && !(label === 'Personalization' && /^(?:yes|true|sí|si)$/i.test(rendered)))
      details.push(`${es ? labelsEs[label] : label}: ${rendered}`);
  }
  return [title, intro, ...details].filter(Boolean).join('\n\n');
}

async function buildIntelligence({ research, productTruth, configuration = {}, masterKeywordArtifact = null }) {
  const observations = research.observations || {};
  if (observations.marketplace !== 'ETSY') throw Object.assign(new Error('ETSY_RESEARCH_REQUIRED'), { code: 'ETSY_RESEARCH_REQUIRED' });
  const facts = factsFromSnapshot(productTruth.snapshot);
  const identity = text(facts.productName || facts.productType);
  if (!identity) throw Object.assign(new Error('PRODUCT_IDENTITY_REQUIRED'), { code: 'PRODUCT_IDENTITY_REQUIRED' });
  const master = corpusFromMasterArtifact(masterKeywordArtifact);
  const corpus = master.corpus;
  const productFamilyAlignment = auditProductFamilyAlignment(corpus.map(item => item.phrase),
    [facts.productType, facts.productName]);
  if (productFamilyAlignment.status !== 'ALIGNED') {
    const code = productFamilyAlignment.status === 'UNRESOLVED'
      ? 'PRODUCT_TRUTH_FAMILY_UNRESOLVED' : 'RESEARCH_PRODUCT_FAMILY_MISMATCH';
    throw Object.assign(new Error(code), {
      code, status: 422, details: productFamilyAlignment
    });
  }
  const language = resolveListingLanguage(configuration, corpus);
  const recipientFamilies = allowedRecipientFamilies([facts.recipient, facts.audience, facts.productName, facts.productType]);
  const safe = []; const claimBlocked = []; const ipBlocked = []; const irrelevant = [];
  const languageTargeting = []; const competitorShopBlocked = [];
  for (const candidate of corpus) {
    const ip = ipGuard.screenText(candidate.phrase);
    if (ip.verdict === 'BLOCK') { ipBlocked.push({ ...candidate, ipHits: ip.hits }); continue; }
    const competitor = containsCompetitorShop(candidate.phrase, observations.sellers || []);
    if (competitor) { competitorShopBlocked.push({ ...candidate, shopName: competitor.shopName,
      listingId: competitor.listingId }); continue; }
    if (productTypeConflict(candidate, facts)) {
      irrelevant.push({ ...candidate, reason: 'PRODUCT_TYPE_CONFLICT' });
      continue;
    }
    if (!languageCompatible(candidate.phrase, language)) {
      languageTargeting.push({ ...candidate, detectedLanguage: languageOfPhrase(candidate.phrase), listingLanguage: language });
      continue;
    }
    const recipientConflict = conflictingRecipient(candidate.phrase, recipientFamilies);
    if (recipientConflict) { irrelevant.push({ ...candidate, reason: 'RECIPIENT_CONFLICT', token: recipientConflict }); continue; }
    const claim = evaluateText(candidate.phrase, facts, SURFACES.VISIBLE_COPY);
    if (claim.unverifiedClaims.length) claimBlocked.push({ ...candidate, unverifiedClaims: claim.unverifiedClaims });
    else if (unverifiedAppearanceTokens(candidate, facts).length) {
      claimBlocked.push({ ...candidate, unverifiedClaims: unverifiedAppearanceTokens(candidate, facts)
        .map(token => ({ claimId: 'COMPOSITION_MATERIAL_PURITY', subtype: 'APPEARANCE_DESCRIPTOR', token })) });
    } else if (unverifiedProductDescriptors(candidate, facts).length) {
      irrelevant.push({ ...candidate, reason: 'UNVERIFIED_PRODUCT_DESCRIPTOR',
        tokens: unverifiedProductDescriptors(candidate, facts) });
    } else if (!isRelevant(candidate, facts, configuration, observations.queryContexts || [])) {
      irrelevant.push({ ...candidate, reason: 'IRRELEVANT_TO_PRODUCT_TRUTH_ANCHORS' });
    } else safe.push(candidate);
  }
  const etsyTitle = composeEtsyTitle(safe, facts, language); const explainedTags = selectExplainedTags(safe, facts);
  const etsyTags = explainedTags.map(item => item.value); const used = new Set(etsyTags.map(fold));
  const usedCorpusKeys = new Set(explainedTags.map(item => item.corpusKey).filter(Boolean));
  const tagCapacityGap = 13 - etsyTags.length;
  const content = { etsyTitle, etsyTags, etsyTagExplanations: explainedTags.map(({ corpusKey, ...item }) => item),
    etsyTagStatus: tagCapacityGap ? { code: 'TAG_SHORTAGE', missingCount: tagCapacityGap } : { code: 'COMPLETE', missingCount: 0 },
    etsyDescription: naturalDescription(facts, etsyTitle, language),
    itemHighlights: language === 'ES' ? etsyTitle : identity,
    categoryName: text(facts.category), ppcKeywords: [],
    imagePrompts: generateImagePromptSuite(productTruth.snapshot, 'ETSY') };
  const guarded = evaluateListingGuard({ listing: content, verifiedFacts: guardFactsForLanguage(facts, language) });
  const visibleCoverageTokens = tokens([guarded.listing.etsyTitle, ...(guarded.listing.etsyTags || [])].join(' '));
  const unallocated = safe.filter(item => !usedCorpusKeys.has(fold(item.phrase))).map(item => {
    const roots = [...tokens(item.phrase)];
    const coveredTokens = roots.filter(token => visibleCoverageTokens.has(token));
    const missingTokens = roots.filter(token => !visibleCoverageTokens.has(token));
    return { ...item, reason: missingTokens.length === 0 ? 'SEMANTIC_ROOTS_ALREADY_COVERED'
      : guarded.listing.etsyTags.length >= 13 ? 'ETSY_TAG_CAPACITY_LIMIT' : 'LOWER_PRIORITY_REDUNDANT_CANDIDATE',
      coveredTokens, missingTokens };
  });
  const allocatedCorpusCount = safe.length + claimBlocked.length + ipBlocked.length + irrelevant.length
    + languageTargeting.length + competitorShopBlocked.length + master.excluded.length + master.review.length;
  const corpusAccountingGap = master.total - allocatedCorpusCount;
  if (corpusAccountingGap !== 0) throw Object.assign(new Error('ETSY_KEYWORD_ACCOUNTING_MISMATCH'), {
    code: 'ETSY_KEYWORD_ACCOUNTING_MISMATCH', corpusCount: corpus.length, allocatedCorpusCount, corpusAccountingGap
  });
  return Object.freeze({
    output: { marketplace: 'ETSY', language, listingDraft: guarded.listing,
      masterKeywordArtifact: { id: masterKeywordArtifact.id, artifactHash: masterKeywordArtifact.artifactHash,
        revisionNumber: masterKeywordArtifact.revisionNumber },
      keywordAllocation: { corpusCount: master.total, titleAndTagUsed: [...used], unallocated,
        claimBlocked, ipBlocked, irrelevant, languageTargeting, competitorShopBlocked,
        masterExcluded: master.excluded, masterReview: master.review, sourceRejected: corpus.sourceRejected,
        reason: 'ETSY_HAS_NO_SELLER-SELECTED_PPC_KEYWORD_SURFACE' },
      competitorSummary: { observations: (observations.sellers || []).length,
        uniqueListingIds: new Set((observations.sellers || []).map(item => item.listingId).filter(Boolean)).size },
      productFamilyAlignment,
      guardAccounting: { backendExcluded: guarded.backendExcluded, ppcFlagged: guarded.ppcFlagged } },
    accounting: { sellerObservationCount: (observations.sellers || []).length, masterKeywordCount: master.total,
      keywordCandidateCount: corpus.length,
      titleAndTagCandidateCount: used.size, unallocatedCount: unallocated.length,
      claimBlockedCount: claimBlocked.length, ipBlockedCount: ipBlocked.length,
      irrelevantCount: irrelevant.length, languageTargetingCount: languageTargeting.length,
      competitorShopBlockedCount: competitorShopBlocked.length, allocatedCorpusCount, corpusAccountingGap,
      masterExcludedCount: master.excluded.length, masterReviewCount: master.review.length,
      sourceRejectedCount: corpus.sourceRejected.length,
      tagCount: guarded.listing.etsyTags.length, tagCapacityGap: 13 - guarded.listing.etsyTags.length },
    engineBindingHash: engineBindingHash()
  });
}

module.exports = Object.freeze({ ENGINE_ID, buildIntelligence, candidateCorpus, engineBindingHash, factsFromSnapshot,
  productTypeConflict, unverifiedAppearanceTokens, unverifiedProductDescriptors, languageOfPhrase,
  languageCompatible, resolveListingLanguage, containsCompetitorShop, tagVariants, composeEtsyTitle, corpusFromMasterArtifact });
