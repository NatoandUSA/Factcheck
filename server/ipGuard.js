const fs = require('fs');
const path = require('path');

const libPath = path.resolve(__dirname, 'ip_library.json');
let BLOCK_TERMS = {};
let AMBIGUOUS = {};
let REVIEW_PHRASES = {};
let SAFE_VOCAB = new Set();
let libraryLoadError = null;

function loadLibrary() {
  try {
    if (!fs.existsSync(libPath)) {
      throw new Error(`ip_library.json not found at ${libPath}`);
    }
    const content = fs.readFileSync(libPath, 'utf8');
    const ipLib = JSON.parse(content);

    const newBlockTerms = {};
    if (ipLib.block && typeof ipLib.block === 'object') {
      Object.keys(ipLib.block).forEach(cat => {
        if (!cat.startsWith('_') && Array.isArray(ipLib.block[cat])) {
          ipLib.block[cat].forEach(term => {
            if (term && typeof term === 'string') {
              newBlockTerms[term.toLowerCase().trim()] = cat;
            }
          });
        }
      });
    }

    if (Object.keys(newBlockTerms).length === 0) {
      throw new Error('ip_library.json contains zero valid block terms');
    }

    const newAmbiguous = {};
    if (ipLib.ambiguous_downgrade && typeof ipLib.ambiguous_downgrade === 'object') {
      Object.keys(ipLib.ambiguous_downgrade).forEach(k => {
        if (!k.startsWith('_')) {
          newAmbiguous[k.toLowerCase().trim()] = ipLib.ambiguous_downgrade[k];
        }
      });
    }

    const newReviewPhrases = {};
    if (Array.isArray(ipLib.review_phrases)) {
      ipLib.review_phrases.forEach(item => {
        if (item && item.term) {
          newReviewPhrases[item.term.toLowerCase().trim()] = item.note || 'Reported trademark-enforced phrase.';
        }
      });
    }

    BLOCK_TERMS = newBlockTerms;
    AMBIGUOUS = newAmbiguous;
    REVIEW_PHRASES = newReviewPhrases;
    SAFE_VOCAB = new Set((ipLib.safe_vocab_add || []).map(w => String(w).toLowerCase().trim()));
    libraryLoadError = null;
    return true;
  } catch (e) {
    libraryLoadError = e;
    console.error('CRITICAL: Failed to load ip_library.json:', e.message);
    throw e;
  }
}

// Initial load on boot
try {
  loadLibrary();
} catch (e) {
  // Retain libraryLoadError so screenText fails closed
}

function norm(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function screenText(text) {
  if (libraryLoadError || Object.keys(BLOCK_TERMS).length === 0) {
    throw new Error(`IP_GUARD_UNAVAILABLE: ${libraryLoadError ? libraryLoadError.message : 'No block terms loaded'}`);
  }

  const t = norm(text);
  if (!t) return { verdict: 'OK', hits: [], unknown: [] };

  const hits = [];
  const seen = new Set();

  // 1) Check BLOCK terms (exact word boundary substring search)
  Object.keys(BLOCK_TERMS).forEach(term => {
    if (seen.has(term)) return;
    const regex = new RegExp(`(?<![a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`, 'i');
    if (regex.test(t)) {
      const cat = BLOCK_TERMS[term];
      if (AMBIGUOUS[term]) {
        hits.append ? hits.push({ term, category: 'ambiguous_brand', risk: 'REVIEW', why: AMBIGUOUS[term] }) : hits.push({ term, category: 'ambiguous_brand', risk: 'REVIEW', why: AMBIGUOUS[term] });
      } else {
        hits.push({ term, category: cat, risk: 'BLOCK', why: `Named ${cat.replace('_', ' ')} — trademarked term` });
      }
      seen.add(term);
    }
  });

  // 2) Check reported trademark-enforced phrases
  Object.keys(REVIEW_PHRASES).forEach(phrase => {
    if (seen.has(phrase)) return;
    const regex = new RegExp(`(?<![a-z0-9])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`, 'i');
    if (regex.test(t)) {
      hits.push({ term: phrase, category: 'reported_enforced_phrase', risk: 'REVIEW', why: REVIEW_PHRASES[phrase] });
      seen.add(phrase);
    }
  });

  // Determine overall verdict
  let verdict = 'OK';
  if (hits.some(h => h.risk === 'BLOCK')) {
    verdict = 'BLOCK';
  } else if (hits.some(h => h.risk === 'REVIEW')) {
    verdict = 'REVIEW';
  }

  return { verdict, hits };
}

function screenListing(listing) {
  if (!listing) return { verdict: 'OK', hits: [] };

  const textToScan = [
    listing.amazonTitle || '',
    listing.itemHighlights || '',
    (listing.amazonBullets || []).join(' '),
    listing.amazonSearchTerms || '',
    listing.etsyTitle || '',
    listing.etsyDescription || '',
    (listing.etsyTags || []).join(' ')
  ].join(' ');


  return screenText(textToScan);
}

module.exports = {
  screenText,
  screenListing,
  reloadLibrary: loadLibrary
};
