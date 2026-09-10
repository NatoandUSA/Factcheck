'use strict';
// IP screen over the owner's curated library.
//
// Design constraints, in order:
//   1. Never reproduce the production bug where `titleLower.includes('cat')`
//      rejected "Dedication". Matching is token-based, never raw substring.
//   2. Still catch the evasions a real listing hits: casing, accents,
//      possessives, plurals, leetspeak, doubled letters and glued words
//      ("nikesweatshirt", "disneyland", "taylorswift").
//   3. Confidence is graded. A term found intact is BLOCK. A term found only
//      through a fuzzy route, or a term the library itself marks ambiguous,
//      is REVIEW — a human decides.
//
// This is risk reduction, not legal clearance, and it screens TEXT only.
// Artwork and design similarity are outside what any keyword list can see.
const fs = require('node:fs');
const path = require('node:path');
const { fold } = require('./text');

const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's' };

// Glue-match needs the remainder to be substantial, or ordinary vocabulary
// gets caught: "audi" sits inside "audio" (+1), but "nike" inside
// "nikesweatshirt" is +10.
const GLUE_MIN_EXTRA_CHARS = 3;
const GLUE_MIN_TERM_LENGTH = 4;
const GLUE_BLOCK_TERM_LENGTH = 6;

function normalizeToken(token) {
  let value = fold(token).replace(/[0134578@$]/g, ch => LEET[ch] || ch);
  value = value.replace(/'s$/, '').replace(/’s$/, '');
  // Collapse doubled letters: "nikee" and "adiddas" normalize onto the brand.
  value = value.replace(/(.)\1+/g, '$1');
  return value;
}

// Both plural strips are produced, never just one: "nikes" ends in "es", so
// stripping "es" first yields "nik" and the brand is missed entirely.
function singularForms(token) {
  const forms = [token];
  if (token.length > 3 && token.endsWith('s')) forms.push(token.slice(0, -1));
  if (token.length > 4 && token.endsWith('es')) forms.push(token.slice(0, -2));
  return forms;
}

function singularize(token) {
  return singularForms(token)[1] || token;
}

function variantsOf(token) {
  return new Set(singularForms(normalizeToken(token)));
}

function loadLibrary(file = path.join(__dirname, '..', 'ip_library.json'),
                     customFile = path.join(__dirname, '..', 'ip_custom.json')) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ambiguous = new Map();
  for (const term of Object.keys(raw.ambiguous_downgrade || {})) {
    ambiguous.set(fold(term), String(raw.ambiguous_downgrade[term]));
  }
  const block = [];
  const push = (term, group) => {
    const folded = fold(term).trim();
    if (!folded) return;
    const tokens = folded.split(/[^a-z0-9]+/).filter(Boolean);
    block.push({
      term: folded, group, tokens,
      normalized: tokens.map(normalizeToken),
      glued: tokens.map(normalizeToken).join(''),
      ambiguous: ambiguous.has(folded)
    });
  };
  for (const group of Object.keys(raw.block || {})) for (const term of raw.block[group]) push(term, group);

  let custom = { block: [], allow: [] };
  if (fs.existsSync(customFile)) {
    try { custom = JSON.parse(fs.readFileSync(customFile, 'utf8')); } catch (_) { custom = { block: [], allow: [] }; }
  }
  for (const term of custom.block || []) push(term, 'owner_custom');

  const review = [];
  for (const entry of raw.review_phrases || []) {
    const folded = fold(entry.term);
    const tokens = folded.split(/[^a-z0-9]+/).filter(Boolean);
    review.push({ term: folded, note: entry.note || '', tokens, normalized: tokens.map(normalizeToken) });
  }
  const allow = new Set((custom.allow || []).map(t => fold(t)));

  return {
    block, review, ambiguous, allow,
    version: raw.meta?.version || 'unknown',
    count: block.length,
    customBlock: (custom.block || []).length,
    customAllow: (custom.allow || []).length
  };
}

function textTokens(text) {
  return fold(text).split(/[^a-z0-9]+/).filter(Boolean);
}

// Exact contiguous sequence over raw tokens.
function matchesTokens(haystack, needle) {
  const h = textTokens(haystack);
  const n = textTokens(needle);
  return sequenceAt(h, n) >= 0;
}

function sequenceAt(haystack, needle) {
  if (!needle.length || needle.length > haystack.length) return -1;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) { ok = false; break; }
    if (ok) return i;
  }
  return -1;
}

// Sequence match where each position may match any normalized variant.
function fuzzySequenceAt(haystackVariants, needleNormalized) {
  if (!needleNormalized.length || needleNormalized.length > haystackVariants.length) return -1;
  for (let i = 0; i + needleNormalized.length <= haystackVariants.length; i++) {
    let ok = true;
    for (let j = 0; j < needleNormalized.length; j++) {
      const want = needleNormalized[j];
      const have = haystackVariants[i + j];
      if (!singularForms(want).some(form => have.has(form))) { ok = false; break; }
    }
    if (ok) return i;
  }
  return -1;
}

function screen(text, library) {
  const raw = textTokens(text);
  const variants = raw.map(variantsOf);
  const hits = [];
  const seen = new Set();

  const add = (term, group, level, how, note) => {
    const key = term + '|' + level;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({ term, group, level, how, ...(note ? { note } : {}) });
  };

  for (const entry of library.block) {
    if (library.allow.has(entry.term)) continue;
    const level = entry.ambiguous ? 'REVIEW' : 'BLOCK';
    const note = entry.ambiguous ? library.ambiguous.get(entry.term) : undefined;

    if (sequenceAt(raw, entry.tokens) >= 0) { add(entry.term, entry.group, level, 'EXACT', note); continue; }
    if (fuzzySequenceAt(variants, entry.normalized) >= 0) {
      // Reached only through casing/accents/plural/leet/doubled letters.
      add(entry.term, entry.group, level, 'VARIANT', note);
      continue;
    }
    // Glued into one word: "nikesweatshirt", "disneyland", "taylorswift".
    const glued = entry.glued;
    if (glued.length < GLUE_MIN_TERM_LENGTH) continue;
    for (const token of variants) {
      let matched = null;
      let matchedLength = 0;
      for (const candidate of token) {
        if (candidate === glued) { matched = 'GLUED_EXACT'; matchedLength = candidate.length; break; }
        if (candidate.length >= glued.length + GLUE_MIN_EXTRA_CHARS
          && (candidate.startsWith(glued) || candidate.endsWith(glued))) {
          matched = 'GLUED_AFFIX'; matchedLength = candidate.length; break;
        }
      }
      if (!matched) continue;
      // A short brand glued into a much longer word ("nikesweatshirt") is as
      // deliberate as a long one; a short brand with a one-letter tail
      // ("audio" over "audi") is not.
      const extra = matchedLength - glued.length;
      const confident = matched === 'GLUED_EXACT'
        || glued.length >= GLUE_BLOCK_TERM_LENGTH
        || extra >= GLUE_BLOCK_TERM_LENGTH;
      const glueLevel = confident ? level : 'REVIEW';
      add(entry.term, entry.group, entry.ambiguous ? 'REVIEW' : glueLevel, matched, note);
      break;
    }
  }

  for (const entry of library.review) {
    if (library.allow.has(entry.term)) continue;
    if (sequenceAt(raw, entry.tokens) >= 0 || fuzzySequenceAt(variants, entry.normalized) >= 0) {
      add(entry.term, 'review_phrases', 'REVIEW', 'EXACT', entry.note);
    }
  }

  const verdict = hits.some(h => h.level === 'BLOCK') ? 'BLOCK' : (hits.length ? 'REVIEW' : 'OK');
  return {
    verdict,
    hits,
    // "OK" means "no term in this library was found". It is never a clearance.
    meaning: verdict === 'OK' ? 'KHONG_TIM_THAY_TRONG_THU_VIEN' : verdict
  };
}

module.exports = { loadLibrary, screen, matchesTokens, normalizeToken, singularize, singularForms, variantsOf };
