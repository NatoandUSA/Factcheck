'use strict';

const fs = require('fs');
const path = require('path');
const { createIpMatcher } = require('./claimGuard/ipMatcher');

const libPath = path.resolve(__dirname, 'ip_library.json');
let matcher = null;
let libraryLoadError = null;

function loadLibrary() {
  try {
    if (!fs.existsSync(libPath)) throw new Error(`ip_library.json not found at ${libPath}`);
    const bytes = fs.readFileSync(libPath);
    const library = JSON.parse(bytes.toString('utf8'));
    // The canonical matcher owns normalization, boundary matching, ambiguous
    // downgrades, fuzzy shadow signals, and complete library accounting.
    matcher = createIpMatcher(library);
    libraryLoadError = null;
    return true;
  } catch (error) {
    matcher = null;
    libraryLoadError = error;
    console.error('CRITICAL: Failed to load ip_library.json:', error.message);
    throw error;
  }
}

try {
  loadLibrary();
} catch (_) {
  // screenText remains fail-closed until a valid Owner reload succeeds.
}

function screenText(text) {
  if (!matcher || libraryLoadError) {
    throw new Error(`IP_GUARD_UNAVAILABLE: ${libraryLoadError ? libraryLoadError.message : 'No compiled matcher loaded'}`);
  }
  const result = matcher.screen(text);
  const hits = result.hits.map(hit => ({
    term: hit.term,
    category: hit.category,
    risk: hit.disposition,
    why: hit.note || `${hit.matchMode} ${hit.enforcement.toLowerCase()} match`,
    matchMode: hit.matchMode,
    enforcement: hit.enforcement
  }));
  return {
    verdict: result.verdict === 'BLOCKED' ? 'BLOCK' : result.verdict === 'REVIEW' ? 'REVIEW' : 'OK',
    hits,
    legalClearance: false,
    accounting: result.accounting,
    library: result.library
  };
}

function screenListing(listing) {
  if (!listing) return screenText('');
  return screenText([
    listing.amazonTitle || '',
    listing.itemHighlights || '',
    ...(Array.isArray(listing.amazonBullets) ? listing.amazonBullets : []),
    listing.amazonSearchTerms || '',
    listing.amazonDescription || '',
    ...(Array.isArray(listing.amazonAPlusPoints) ? listing.amazonAPlusPoints : []),
    listing.etsyTitle || '',
    listing.etsyDescription || '',
    ...(Array.isArray(listing.etsyTags) ? listing.etsyTags : [])
  ].join(' '));
}

module.exports = Object.freeze({
  screenText,
  screenListing,
  reloadLibrary: loadLibrary
});
