'use strict';

// Deterministic text-only IP screening. The caller owns and injects the
// library: this module deliberately performs no filesystem or global-library
// access. It is a risk screen, not a legal-clearance decision.

const LEET = Object.freeze({
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b',
  '@': 'a', '$': 's'
});

const GLUE_MIN_TERM_LENGTH = 4;
const GLUE_MIN_EXTRA_CHARS = 3;

function fold(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .trim();
}

function tokenize(value) {
  return fold(value).match(/[a-z0-9]+/g) || [];
}

function normalizeVariantToken(token) {
  return fold(token)
    .replace(/[0134578@$]/g, character => LEET[character] || character)
    .replace(/(.)\1+/g, '$1');
}

function singularForms(token) {
  const forms = [token];
  if (token.length > 3 && token.endsWith('s')) forms.push(token.slice(0, -1));
  if (token.length > 4 && token.endsWith('es')) forms.push(token.slice(0, -2));
  return [...new Set(forms)];
}

function variantsOf(token) {
  return new Set(singularForms(normalizeVariantToken(token)));
}

function sequenceAt(haystack, needle) {
  return sequenceIndexes(haystack, needle)[0] ?? -1;
}

function sequenceIndexes(haystack, needle) {
  const indexes = [];
  if (!needle.length || needle.length > haystack.length) return indexes;
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    if (needle.every((token, offset) => haystack[start + offset] === token)) indexes.push(start);
  }
  return indexes;
}

function fuzzySequenceAt(haystackVariants, needle) {
  if (!needle.length || needle.length > haystackVariants.length) return -1;
  for (let start = 0; start + needle.length <= haystackVariants.length; start += 1) {
    const matches = needle.every((wanted, offset) => {
      const wantedForms = singularForms(wanted);
      return wantedForms.some(form => haystackVariants[start + offset].has(form));
    });
    if (matches) return start;
  }
  return -1;
}

function rawEntries(library) {
  const entries = [];
  const rejected = [];
  let ordinal = 0;

  const accept = (term, category, disposition, note, source) => {
    ordinal += 1;
    if (typeof term !== 'string' || tokenize(term).length === 0) {
      rejected.push({ ordinal, source, reason: 'INVALID_OR_EMPTY_TERM' });
      return;
    }
    entries.push({ ordinal, term, category, disposition, note, source });
  };

  if (library?.block && typeof library.block === 'object' && !Array.isArray(library.block)) {
    for (const category of Object.keys(library.block).sort()) {
      const terms = library.block[category];
      if (!Array.isArray(terms)) {
        ordinal += 1;
        rejected.push({ ordinal, source: `block.${category}`, reason: 'CATEGORY_MUST_BE_ARRAY' });
        continue;
      }
      terms.forEach(term => accept(term, category, 'BLOCK', '', `block.${category}`));
    }
  }

  if (Array.isArray(library?.blockTerms)) {
    library.blockTerms.forEach(term => accept(term, 'injected_block', 'BLOCK', '', 'blockTerms'));
  }

  if (Array.isArray(library?.review_phrases)) {
    library.review_phrases.forEach(item => {
      if (typeof item === 'string') accept(item, 'review_phrases', 'REVIEW', '', 'review_phrases');
      else accept(item?.term, 'review_phrases', 'REVIEW', String(item?.note || ''), 'review_phrases');
    });
  }

  if (Array.isArray(library?.reviewTerms)) {
    library.reviewTerms.forEach(term => accept(term, 'injected_review', 'REVIEW', '', 'reviewTerms'));
  }

  return { entries, rejected, inputEntries: ordinal };
}

function compileIpLibrary(library) {
  if (!library || typeof library !== 'object' || Array.isArray(library)) {
    throw new TypeError('IP_LIBRARY_REQUIRED: inject a library object');
  }

  const ambiguous = new Map();
  if (library.ambiguous_downgrade && typeof library.ambiguous_downgrade === 'object') {
    for (const [term, note] of Object.entries(library.ambiguous_downgrade)) {
      ambiguous.set(tokenize(term).join(' '), String(note || 'Ambiguous term requires review.'));
    }
  }

  const contextual = new Map();
  if (library.contextual_downgrade && typeof library.contextual_downgrade === 'object') {
    for (const [term, rule] of Object.entries(library.contextual_downgrade)) {
      const canonical = tokenize(term).join(' ');
      const previousTokens = new Set((Array.isArray(rule?.previous_tokens) ? rule.previous_tokens : [])
        .flatMap(value => tokenize(value)));
      const disqualifyingTokens = new Set((Array.isArray(rule?.disqualifying_tokens) ? rule.disqualifying_tokens : [])
        .flatMap(value => tokenize(value)));
      const contextWindow = Number.isInteger(rule?.context_window) && rule.context_window > 0
        ? Math.min(rule.context_window, 10) : 3;
      if (canonical && previousTokens.size) contextual.set(canonical, {
        previousTokens, disqualifyingTokens, contextWindow,
        note: String(rule?.note || 'Context indicates a common-name use; manual review required.')
      });
    }
  }

  const allow = new Set(
    [...(Array.isArray(library.allow) ? library.allow : []),
      ...(Array.isArray(library.allowTerms) ? library.allowTerms : [])]
      .map(term => tokenize(term).join(' '))
      .filter(Boolean)
  );

  const { entries, rejected, inputEntries } = rawEntries(library);
  const compiled = [];
  const seen = new Set();
  const duplicates = [];

  for (const entry of entries) {
    const tokens = tokenize(entry.term);
    const canonical = tokens.join(' ');
    const key = `${entry.disposition}|${canonical}`;
    if (seen.has(key)) {
      duplicates.push({ ordinal: entry.ordinal, term: canonical, reason: 'DUPLICATE_TERM' });
      continue;
    }
    seen.add(key);
    if (allow.has(canonical)) continue;

    const isAmbiguous = entry.disposition === 'BLOCK' && ambiguous.has(canonical);
    compiled.push({
      term: canonical,
      category: entry.category,
      disposition: isAmbiguous ? 'REVIEW' : entry.disposition,
      note: isAmbiguous ? ambiguous.get(canonical) : entry.note,
      tokens,
      variantTokens: tokens.map(normalizeVariantToken),
      glued: tokens.map(normalizeVariantToken).join(''),
      contextualDowngrade: entry.disposition === 'BLOCK' ? contextual.get(canonical) || null : null
    });
  }

  if (compiled.length === 0) throw new Error('IP_LIBRARY_EMPTY: no usable injected terms');

  return Object.freeze({
    entries: Object.freeze(compiled),
    accounting: Object.freeze({
      inputEntries,
      acceptedUniqueEntries: compiled.length,
      duplicateEntries: duplicates.length,
      allowedEntries: entries.length - compiled.length - duplicates.length,
      rejectedEntries: rejected.length,
      duplicates: Object.freeze(duplicates),
      rejected: Object.freeze(rejected)
    }),
    version: String(library.meta?.version || library.version || 'injected-unversioned')
  });
}

function makeHit(entry, matchMode, tokenIndex, enforcement) {
  return {
    term: entry.term,
    category: entry.category,
    disposition: enforcement === 'SHADOW' ? 'REVIEW' : entry.disposition,
    matchMode,
    enforcement,
    tokenIndex,
    ...(entry.note ? { note: entry.note } : {})
  };
}

function screenCompiled(text, compiledLibrary) {
  if (!compiledLibrary?.entries || !compiledLibrary?.accounting) {
    throw new TypeError('COMPILED_IP_LIBRARY_REQUIRED');
  }

  const tokens = tokenize(text);
  const variants = tokens.map(variantsOf);
  const enforcementHits = [];
  const shadowHits = [];

  for (const entry of compiledLibrary.entries) {
    const exactIndexes = sequenceIndexes(tokens, entry.tokens);
    if (exactIndexes.length) {
      if (!entry.contextualDowngrade) {
        enforcementHits.push(makeHit(entry, 'BOUNDARY', exactIndexes[0], 'ENFORCE'));
        continue;
      }
      for (const exactIndex of exactIndexes) {
        const previousToken = exactIndex > 0 ? tokens[exactIndex - 1] : '';
        const start = Math.max(0, exactIndex - entry.contextualDowngrade.contextWindow);
        const end = Math.min(tokens.length, exactIndex + entry.tokens.length + entry.contextualDowngrade.contextWindow);
        const nearby = tokens.slice(start, end);
        const disqualified = nearby.some(token => entry.contextualDowngrade.disqualifyingTokens.has(token));
        const contextualReview = entry.contextualDowngrade.previousTokens.has(previousToken) && !disqualified;
        const matchedEntry = contextualReview ? {
          ...entry,
          disposition: 'REVIEW',
          note: entry.contextualDowngrade.note
        } : entry;
        enforcementHits.push(makeHit(matchedEntry, contextualReview ? 'CONTEXTUAL_BOUNDARY' : 'BOUNDARY', exactIndex, 'ENFORCE'));
      }
      continue;
    }

    const variantIndex = fuzzySequenceAt(variants, entry.variantTokens);
    if (variantIndex >= 0) {
      shadowHits.push(makeHit(entry, 'FUZZY_VARIANT', variantIndex, 'SHADOW'));
      continue;
    }

    if (entry.glued.length < GLUE_MIN_TERM_LENGTH) continue;
    for (let index = 0; index < variants.length; index += 1) {
      const glued = [...variants[index]].some(candidate => (
        candidate === entry.glued ||
        (candidate.length >= entry.glued.length + GLUE_MIN_EXTRA_CHARS &&
          (candidate.startsWith(entry.glued) || candidate.endsWith(entry.glued)))
      ));
      if (glued) {
        shadowHits.push(makeHit(entry, 'FUZZY_GLUE', index, 'SHADOW'));
        break;
      }
    }
  }

  const hits = [...enforcementHits, ...shadowHits];
  const verdict = enforcementHits.some(hit => hit.disposition === 'BLOCK')
    ? 'BLOCKED'
    : (hits.length ? 'REVIEW' : 'NO_KNOWN_HIT');

  return {
    verdict,
    hits,
    enforcementHits,
    shadowHits,
    legalClearance: false,
    accounting: {
      textTokens: tokens.length,
      libraryEntriesEvaluated: compiledLibrary.entries.length,
      enforcementHits: enforcementHits.length,
      shadowHits: shadowHits.length,
      totalHits: hits.length
    },
    library: {
      version: compiledLibrary.version,
      accounting: compiledLibrary.accounting
    }
  };
}

function createIpMatcher(injectedLibrary) {
  const compiledLibrary = compileIpLibrary(injectedLibrary);
  return Object.freeze({
    screen: text => screenCompiled(text, compiledLibrary),
    libraryVersion: compiledLibrary.version,
    libraryAccounting: compiledLibrary.accounting
  });
}

function screenIpText(text, injectedLibrary) {
  return screenCompiled(text, compileIpLibrary(injectedLibrary));
}

module.exports = {
  compileIpLibrary,
  createIpMatcher,
  fold,
  normalizeVariantToken,
  screenCompiled,
  screenIpText,
  sequenceAt,
  sequenceIndexes,
  singularForms,
  tokenize,
  variantsOf
};
