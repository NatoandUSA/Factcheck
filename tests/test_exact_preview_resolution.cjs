'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../src/utils/canonicalReviewPackage.js')).href;
  const { isCanonicalPreviewListing, resolveCanonicalReviewListing, toCanonicalPreviewListing } = await import(moduleUrl);
  const reviewPackage = {
    listingId: 5,
    status: 'NEEDS_QA',
    listingRevisionId: 9,
    revisionNumber: 3,
    contentHash: 'a'.repeat(64),
    dependencyHash: 'b'.repeat(64),
    content: { etsyTitle: 'Manta Personalizada para Hermana', etsyTags: ['regalo hermana'], etsyDescription: 'Copy' },
    qualityEvidence: { marketplace: 'ETSY', listingLanguage: 'ES', productTruthBound: true,
      productTruthRevisionId: 10, productTruthHash: 'c'.repeat(64), verifiedFactCount: 8,
      imagePlan: { ready: 7, expected: 8 } }
  };
  const exact = toCanonicalPreviewListing(reviewPackage);
  assert.equal(exact.dbId, 5);
  assert.equal(exact.listingVersion, 3);
  assert.equal(exact.simulationSource, 'CANONICAL_REVIEW_PACKAGE');
  assert.equal(exact.canonicalReviewIdentity.listingRevisionId, 9);
  assert.equal(exact.canonicalReviewIdentity.contentHash, 'a'.repeat(64));
  assert.equal(exact.canonicalQualityEvidence.listingLanguage, 'ES');
  assert.equal(isCanonicalPreviewListing(exact), true);
  assert.throws(() => toCanonicalPreviewListing({ ...reviewPackage, dependencyHash: null }),
    /CANONICAL_REVIEW_PACKAGE_INVALID/);
  let requestedUrl = null;
  const resolved = await resolveCanonicalReviewListing({ dbId: 5, etsyTitle: 'thin row' }, async (url, options) => {
    requestedUrl = url;
    assert.deepEqual(options, { credentials: 'include' });
    return { ok: true, json: async () => reviewPackage };
  });
  assert.equal(requestedUrl, '/api/listings/5/review-package');
  assert.equal(isCanonicalPreviewListing(resolved), true,
    'thin history rows must resolve through the authoritative exact package');
  await assert.rejects(() => resolveCanonicalReviewListing({ id: 5 }, async () => ({
    ok: false, json: async () => ({ error: 'PRODUCT_TRUTH_CARD_REQUIRED' })
  })), /PRODUCT_TRUTH_CARD_REQUIRED/,
  'generic Preview must fail closed when the exact package is unavailable');
  let fetchCount = 0;
  assert.equal(await resolveCanonicalReviewListing(exact, async () => { fetchCount += 1; }), exact);
  assert.equal(fetchCount, 0, 'already-canonical packages must not be replaced by a thin history lookup');
  console.log('EXACT_PREVIEW_RESOLUTION_TESTS_PASSED');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
