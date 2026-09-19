export function toCanonicalPreviewListing(reviewPackage, fallbackListingId = null) {
  const listingId = reviewPackage?.listingId ?? fallbackListingId;
  if (!listingId || !reviewPackage?.content || !reviewPackage?.qualityEvidence
    || !Number.isInteger(Number(reviewPackage?.listingRevisionId))
    || !/^[a-f0-9]{64}$/i.test(String(reviewPackage?.contentHash || ''))
    || !/^[a-f0-9]{64}$/i.test(String(reviewPackage?.dependencyHash || ''))) {
    throw new Error('CANONICAL_REVIEW_PACKAGE_INVALID');
  }
  return Object.freeze({
    ...reviewPackage.content,
    dbId: Number(listingId),
    status: reviewPackage.status,
    listingVersion: Number(reviewPackage.revisionNumber),
    canonicalQualityEvidence: reviewPackage.qualityEvidence,
    simulationSource: 'CANONICAL_REVIEW_PACKAGE',
    canonicalReviewIdentity: Object.freeze({
      listingId: Number(listingId),
      listingRevisionId: Number(reviewPackage.listingRevisionId),
      contentHash: reviewPackage.contentHash,
      dependencyHash: reviewPackage.dependencyHash
    })
  });
}

export function isCanonicalPreviewListing(listing) {
  return listing?.simulationSource === 'CANONICAL_REVIEW_PACKAGE'
    && Boolean(listing?.canonicalQualityEvidence)
    && Number.isInteger(Number(listing?.canonicalReviewIdentity?.listingRevisionId));
}

export async function resolveCanonicalReviewListing(item, fetchImpl = globalThis.fetch) {
  if (!item) throw new Error('LISTING_REQUIRED');
  if (isCanonicalPreviewListing(item)) return item;
  const listingId = item.dbId ?? item.id;
  if (!listingId) throw new Error('CANONICAL_LISTING_ID_REQUIRED');
  if (typeof fetchImpl !== 'function') throw new Error('CANONICAL_REVIEW_PACKAGE_FETCH_UNAVAILABLE');
  const response = await fetchImpl(`/api/listings/${listingId}/review-package`, { credentials: 'include' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || payload.message || 'CANONICAL_REVIEW_PACKAGE_UNAVAILABLE');
  }
  return toCanonicalPreviewListing(payload, listingId);
}

export default { isCanonicalPreviewListing, resolveCanonicalReviewListing, toCanonicalPreviewListing };
