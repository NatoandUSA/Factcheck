const fs = require('fs');
const path = require('path');

const libPath = path.resolve(__dirname, 'ip_library.json');
let ipLib = { block: {}, ambiguous_downgrade: {}, review_phrases: [], safe_vocab_add: [] };

try {
  ipLib = JSON.parse(fs.readFileSync(libPath, 'utf8'));
} catch (e) {
  console.error('Failed to load ip_library.json:', e.message);
}

// Flatten all BLOCK terms into lookup
const BLOCK_TERMS = {};
if (ipLib.block) {
  Object.keys(ipLib.block).forEach(cat => {
    if (!cat.startsWith('_') && Array.isArray(ipLib.block[cat])) {
      ipLib.block[cat].forEach(term => {
        BLOCK_TERMS[term.toLowerCase()] = cat;
      });
    }
  });
}

const AMBIGUOUS = {};
if (ipLib.ambiguous_downgrade) {
  Object.keys(ipLib.ambiguous_downgrade).forEach(k => {
    if (!k.startsWith('_')) {
      AMBIGUOUS[k.toLowerCase()] = ipLib.ambiguous_downgrade[k];
    }
  });
}

const REVIEW_PHRASES = {};
if (Array.isArray(ipLib.review_phrases)) {
  ipLib.review_phrases.forEach(item => {
    if (item.term) {
      REVIEW_PHRASES[item.term.toLowerCase()] = item.note || 'Reported trademark-enforced phrase.';
    }
  });
}

const SAFE_VOCAB = new Set(
  (ipLib.safe_vocab_add || []).map(w => w.toLowerCase())
);

function norm(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function screenText(text) {
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
  screenListing
};
