'use strict';
// Semantic clustering, ported from Factcheck `server/analyticsEngine.js`.
//
// Two deliberate changes from the original:
//   1. Matching is token-boundary, not `norm.includes(pattern)`. The original
//      would classify "education gift" as a recipient because "dad" is not in
//      it but "cat mom" style substrings do collide; the same substring habit
//      is what made the IP guard reject "Dedication".
//   2. A keyword can belong to SEVERAL clusters ("mothers day gift for mom"
//      is occasion + recipient). The original kept only the first match, which
//      loses exactly the signal needed to balance a title.
const { fold, contentTokens } = require('./text');

const PATTERNS = Object.freeze({
  recipient: ['daughter', 'hija', 'son', 'hijo', 'mom', 'mama', 'momma', 'mommy', 'mother', 'madre', 'dad', 'papa', 'father', 'padre',
    'sister', 'hermana', 'brother', 'hermano', 'wife', 'esposa', 'husband', 'esposo',
    'girlfriend', 'novia', 'boyfriend', 'novio', 'grandma', 'abuela', 'grandpa', 'abuelo', 'nana', 'gigi', 'mimi', 'memaw', 'mamaw', 'granny', 'grandmother',
    'aunt', 'tia', 'uncle', 'tio', 'niece', 'sobrina', 'nephew', 'sobrino', 'suegra', 'nuera', 'cunada',
    'teacher', 'profesora', 'nurse', 'enfermera', 'bestie', 'friend', 'amiga', 'amigo',
    'bride', 'groom', 'bridesmaid', 'family', 'familia', 'baby', 'bebe', 'kids', 'women', 'her', 'mujer', 'mujeres', 'pareja'],
  occasion: ['birthday', 'cumpleanos', 'christmas', 'navidad', 'halloween', 'mothers day', 'mothersday', 'fathers day',
    'wedding', 'boda', 'anniversary', 'aniversario', 'quinceanera', 'graduation', 'graduacion',
    'valentine', 'valentines', 'san valentin', 'baby shower', 'retirement', 'holiday', 'thanksgiving', 'easter', 'new year', 'dia de la madre'],
  style: ['embroidered', 'embroidery', 'bordado', 'custom', 'customized', 'personalized', 'personalizado', 'personalizados', 'engraved', 'grabado',
    'vintage', 'retro', 'minimalist', 'minimalista', 'aesthetic', 'handmade', 'hecho a mano',
    'floral', 'oversized', 'gothic', 'boho', 'y2k', 'trendy', 'cute', 'funny', 'classic', 'elegante', 'elegant'],
  core: ['sweatshirt', 'sweatshirts', 'sudadera', 'sudaderas', 'hoodie', 'hoodies', 'shirt', 'shirts', 'camisa', 'tshirt', 'camiseta', 'sweater', 'sweaters',
    'jacket', 'jewelry', 'joyeria', 'joyas', 'necklace', 'necklaces', 'collar', 'collares', 'ring', 'anillo', 'bracelet', 'pulsera',
    'earrings', 'pendientes', 'aretes', 'cadena', 'cadenas', 'mug', 'taza', 'tumbler', 'vaso', 'tote', 'bolso', 'hat', 'cap',
    'poster', 'print', 'blanket', 'manta', 'pillow', 'candle', 'keychain', 'llavero', 'card', 'tarjeta', 'crewneck', 'pullover'],
  intent: ['gift', 'gifts', 'regalo', 'regalos', 'detalle', 'detalles', 'ideas', 'idea', 'present']
});

const COMPILED = Object.freeze(Object.fromEntries(
  Object.entries(PATTERNS).map(([name, list]) => [name, list.map(p => fold(p).split(/\s+/))])
));

function containsSequence(tokens, sequence) {
  if (sequence.length === 1) return tokens.includes(sequence[0]);
  for (let i = 0; i + sequence.length <= tokens.length; i++) {
    let ok = true;
    for (let j = 0; j < sequence.length; j++) if (tokens[i + j] !== sequence[j]) { ok = false; break; }
    if (ok) return true;
  }
  return false;
}

// Returns every cluster the phrase belongs to, plus a primary label for
// display. A phrase matching nothing is longtail.
function classify(phrase) {
  const tokens = fold(phrase).split(/[^a-z0-9]+/).filter(Boolean);
  const matched = [];
  for (const [name, sequences] of Object.entries(COMPILED)) {
    if (sequences.some(sequence => containsSequence(tokens, sequence))) matched.push(name);
  }
  if (!matched.length) return { clusters: ['longtail'], primary: 'longtail' };
  // Primary follows buying intent: what it is, then who for, then when.
  const order = ['core', 'recipient', 'occasion', 'style', 'intent'];
  const primary = order.find(name => matched.includes(name)) || matched[0];
  return { clusters: matched, primary };
}

// Garbage that should never be treated as a shopper keyword. Ported from
// keywordRanker.GARBAGE_PATTERNS.
const GARBAGE = [/^b0[a-z0-9]{8}$/i, /^[a-z0-9]{10}$/i, /^\d+[.)]?$/, /^\d+$/, /^[\W_]+$/];

// Delivery-speed claims are an Amazon policy risk in a listing, whatever the
// search volume. Ported from keywordRanker.BANNED_DELIVERY_TERMS, but matched
// on token boundaries rather than substrings.
const BANNED_PHRASES = [
  'same day', 'sameday', 'overnight', 'overnight delivery', 'delivery gifts', 'delivery items',
  'express delivery', 'express shipping', '24h shipping', 'fast shipping', 'next day', 'free shipping',
  'best seller', 'amazon choice', 'top rated', 'number one', 'cheapest', 'guaranteed'
].map(p => fold(p).split(/\s+/));

// Phrases so generic they win nothing and waste a title slot.
const GENERIC_PHRASES = new Set([
  'gift for women', 'gifts for women', 'gifts for her', 'gift for her', 'gifts for him',
  'gift ideas', 'gifts', 'gift', 'regalos', 'regalo', 'birthday gifts', 'christmas gifts'
].map(fold));

function isGarbage(phrase) {
  const value = String(phrase || '').trim();
  if (value.length < 4) return true;
  return GARBAGE.some(pattern => pattern.test(value));
}

function bannedClaim(phrase) {
  const tokens = fold(phrase).split(/[^a-z0-9]+/).filter(Boolean);
  const hit = BANNED_PHRASES.find(sequence => containsSequence(tokens, sequence));
  return hit ? hit.join(' ') : null;
}

function isGeneric(phrase) {
  return GENERIC_PHRASES.has(fold(phrase).replace(/\s+/g, ' ').trim());
}

// Language of the operator's own anchors decides which vocabulary is on-market.
// A Spanish listing gains nothing from an English long-tail and vice versa.
const SPANISH_MARKERS = new Set(['para', 'regalo', 'regalos', 'mi', 'de', 'esposa', 'novia', 'madre', 'mama', 'collar',
  'cadena', 'mujer', 'mujeres', 'cumpleanos', 'navidad', 'aniversario', 'amor', 'vida', 'detalles', 'personalizado', 'joyeria']);

function spanishRatio(text) {
  const tokens = contentTokens(text);
  if (!tokens.length) return 0;
  return tokens.filter(t => SPANISH_MARKERS.has(t)).length / tokens.length;
}

// Recipient synonym families. A listing for "moms" must not absorb keywords
// aimed at grandmas, nurses or sisters just because both say "sweatshirt" —
// that is a different shopper and a different product.
const RECIPIENT_FAMILIES = [
  ['mom', 'moms', 'mama', 'mamas', 'momma', 'mommy', 'mother', 'mothers', 'madre', 'mami'],
  ['grandma', 'grandmother', 'granny', 'nana', 'gigi', 'mimi', 'memaw', 'mamaw', 'abuela', 'grandmas'],
  ['dad', 'dads', 'papa', 'father', 'fathers', 'padre'],
  ['grandpa', 'grandfather', 'abuelo', 'papaw'],
  ['wife', 'wives', 'esposa', 'spouse'],
  ['husband', 'esposo'],
  ['girlfriend', 'novia'],
  ['boyfriend', 'novio'],
  ['daughter', 'daughters', 'hija'],
  ['son', 'sons', 'hijo'],
  ['sister', 'sisters', 'hermana'],
  ['brother', 'brothers', 'hermano'],
  ['aunt', 'auntie', 'tia'],
  ['uncle', 'tio'],
  ['niece', 'sobrina'],
  ['nephew', 'sobrino'],
  ['teacher', 'teachers', 'profesora'],
  ['nurse', 'nurses', 'enfermera'],
  ['bride', 'bridesmaid', 'novia'],
  ['friend', 'bestie', 'amiga', 'amigo'],
  ['baby', 'bebe', 'newborn'],
  ['suegra', 'motherinlaw']
];
const RECIPIENT_TOKENS = new Set(PATTERNS.recipient.flatMap(p => fold(p).split(/\s+/)));

function recipientFamily(token) {
  const value = fold(token);
  return RECIPIENT_FAMILIES.findIndex(family => family.includes(value));
}

// Families named anywhere in the operator's own product description/anchors.
function allowedRecipientFamilies(texts) {
  const allowed = new Set();
  for (const text of texts) {
    for (const token of fold(text).split(/[^a-z0-9]+/).filter(Boolean)) {
      const index = recipientFamily(token);
      if (index >= 0) allowed.add(index);
    }
  }
  return allowed;
}

// Returns the offending token when the phrase targets a recipient family the
// product is not for. Generic audience words (women, her, kids) never conflict.
const NEUTRAL_RECIPIENTS = new Set(['women', 'her', 'him', 'mujer', 'mujeres', 'family', 'familia', 'kids', 'pareja', 'friend', 'amiga', 'amigo', 'bestie']);

function conflictingRecipient(phrase, allowedFamilies) {
  if (!allowedFamilies || !allowedFamilies.size) return null;
  const tokens = fold(phrase).split(/[^a-z0-9]+/).filter(Boolean);
  // A second family is only a conflict when the product's OWN audience is
  // absent. "mothers day sweatshirt for mom from daughter" names the daughter
  // as the BUYER, not the wearer, and is a legitimate keyword for a mom's
  // sweatshirt. "nana sweatshirt for women" names no allowed family at all.
  const namesAllowed = tokens.some(token => {
    const index = recipientFamily(token);
    return index >= 0 && allowedFamilies.has(index);
  });
  if (namesAllowed) return null;
  for (const token of tokens) {
    if (!RECIPIENT_TOKENS.has(token) || NEUTRAL_RECIPIENTS.has(token)) continue;
    const index = recipientFamily(token);
    if (index >= 0 && !allowedFamilies.has(index)) return token;
  }
  return null;
}

module.exports = { classify, isGarbage, bannedClaim, isGeneric, spanishRatio,
  allowedRecipientFamilies, conflictingRecipient, recipientFamily, PATTERNS };
