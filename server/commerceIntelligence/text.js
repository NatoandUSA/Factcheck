'use strict';
// Text primitives shared by ranking, IP screening and composition.

const STOPWORDS_EN = new Set(['a','an','the','and','or','of','for','to','in','on','with','by','from','at','is','are','be','my','your','his','her','their','our','it','this','that','you','me','i']);
const STOPWORDS_ES = new Set(['el','la','los','las','un','una','unos','unas','de','del','y','o','para','por','con','en','a','al','que','su','sus','mi','mis','tu','tus','lo','se','es','son','como','mas','más']);

// Fold accents ONLY for matching. Display always keeps the original text --
// "cumpleaños" must never be shown as "cumpleanos" in a live listing.
function fold(value) {
  return String(value == null ? '' : value)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function tokens(value) {
  return fold(value).split(/[^a-z0-9]+/).filter(Boolean);
}

function contentTokens(value) {
  return tokens(value).filter(t => t.length > 1 && !STOPWORDS_EN.has(t) && !STOPWORDS_ES.has(t));
}

function bytes(value) {
  return Buffer.byteLength(String(value == null ? '' : value), 'utf8');
}

const LOWER_IN_TITLE = new Set(['de','del','la','el','los','las','y','en','para','por','con','un','una','a','the','and','or','of','for','to','in','on','with','by','from','at']);

// Amazon-style Title Case: first and last word always capitalised, short
// connectors stay lower. Words already SHOUTING (2 caps in a row) are left
// alone so "14K" or "925" style tokens survive.
function titleCase(value) {
  const words = String(value || '').trim().split(/\s+/);
  return words.map((word, index) => {
    if (/[A-Z]{2,}/.test(word) || /\d/.test(word)) return word;
    const lower = word.toLowerCase();
    if (index > 0 && index < words.length - 1 && LOWER_IN_TITLE.has(fold(lower))) return lower;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join(' ');
}

// Greedy byte-budgeted token packer. Returns the packed string plus the
// tokens actually consumed, so the caller can start the next set where this
// one stopped (non-overlapping backend search-term sets).
function packTokens(candidateTokens, byteLimit, used = new Set()) {
  const picked = [];
  let size = 0;
  for (const token of candidateTokens) {
    if (used.has(token)) continue;
    const cost = bytes(token) + (picked.length ? 1 : 0);
    if (size + cost > byteLimit) continue;
    picked.push(token);
    used.add(token);
    size += cost;
  }
  return { text: picked.join(' '), tokens: picked, bytes: size };
}

module.exports = { fold, tokens, contentTokens, bytes, titleCase, packTokens, STOPWORDS_EN, STOPWORDS_ES };
