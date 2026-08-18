/**
 * THE Canonical Publish Gate (Ported from 22etsy-agent/src/publish_gate.py)
 * Single Source of Truth for Listing Publish Readiness.
 * 
 * final_status:
 *   - PUBLISH_READY      : Every gate passed with empirical evidence
 *   - NEEDS_REVIEW       : Non-blocking gaps requiring manual manager review
 *   - BLOCKED            : Hard trademark or policy violation
 *   - INSUFFICIENT_DATA  : Required supplier, cost, or audit evidence missing
 */

const MIN_NET_PROFIT = 6.0;   // $6 net profit floor
const MIN_NET_MARGIN = 30.0;  // 30% net margin floor

function evaluatePublishGate(listing) {
  if (!listing || typeof listing !== 'object') {
    return {
      final_status: 'INSUFFICIENT_DATA',
      reasons: ['No listing data provided']
    };
  }

  const issues = [];
  const blockingHits = [];

  // 1. Hard Trademark / IP Gate Check
  if (listing.ipVerdict === 'BLOCK' || listing.status === 'IP_RISK_BLOCKED') {
    blockingHits.push('BLOCKED: Trademark/IP violation detected. Manager review required.');
  }

  if (Array.isArray(listing.ipHits) && listing.ipHits.length > 0) {
    listing.ipHits.forEach(h => {
      const term = typeof h === 'string' ? h : h.term;
      blockingHits.push(`Trademark hit: "${term}"`);
    });
  }

  if (blockingHits.length > 0) {
    return {
      final_status: 'BLOCKED',
      reasons: blockingHits,
      canExport: false
    };
  }

  // 2. Title & Tags Compliance Check
  const title = listing.amazonTitle || listing.etsyTitle || listing.title || '';
  const tags = listing.etsyTags || listing.tags || [];

  if (title.length > 200) {
    issues.push(`Title exceeds 200 character limit (${title.length} chars)`);
  }

  if (Array.isArray(tags) && tags.length > 0) {
    if (tags.length !== 13) {
      issues.push(`Etsy tags count must be exactly 13 tags (current: ${tags.length})`);
    }
    const longTags = tags.filter(t => t.length > 20);
    if (longTags.length > 0) {
      issues.push(`${longTags.length} tags exceed 20-character Etsy limit`);
    }
  }

  // 2b. Product Truth Check, part 1: a listing cannot reach PUBLISH_READY
  // with no real description content. Upstream fixes leave a missing
  // description empty instead of injecting boilerplate, so an empty
  // description here means nobody has written real product facts yet.
  const description = listing.amazonDescription || listing.etsyDescription || '';
  if (!description || description.trim().length === 0) {
    issues.push('Missing product description -- write real product details before publishing (no auto-generated placeholder is used).');
  }

  // 2c. Product Truth Check, part 2: a non-empty description is necessary
  // but not sufficient -- it could still be entirely AI-generated text that
  // nobody actually verified against the real product. Require an explicit,
  // human-authored attestation of what was checked, bound to this exact
  // listing_version by the caller (server.js clears it on every edit, same
  // as approved_hash). This is what actually distinguishes "a manager
  // clicked approve" from "a manager verified the facts are real"
  // (GPT PR-10 re-audit).
  const truthNotes = typeof listing.productTruthNotes === 'string' ? listing.productTruthNotes.trim() : '';
  if (truthNotes.length < 10) {
    issues.push('Missing Product Truth attestation -- the approver must state what they verified about this product before publishing.');
  }

  // 3. Fail-Closed Status Determination (Ported from 22etsy-agent Truth Discipline)
  let final_status = 'INSUFFICIENT_DATA';
  let canExport = false;

  const hasApprovedStatus = listing.status === 'MANAGER_APPROVED' || listing.status === 'PUBLISH_READY';
  
  if (blockingHits.length > 0) {
    final_status = 'BLOCKED';
    canExport = false;
  } else if (!title || title.trim().length === 0) {
    final_status = 'INSUFFICIENT_DATA';
    issues.push('Missing title content');
    canExport = false;
  } else if (!hasApprovedStatus) {
    final_status = 'NEEDS_REVIEW';
    issues.push('Awaiting explicit Manager Approval');
    canExport = false;
  } else if (issues.length > 0) {
    final_status = 'NEEDS_REVIEW';
    canExport = false;
  } else {
    final_status = 'PUBLISH_READY';
    canExport = true;
  }

  return {
    final_status,
    reasons: issues.length > 0 ? issues : ['Passed all canonical compliance gates'],
    canExport
  };

}

module.exports = {
  evaluatePublishGate,
  MIN_NET_PROFIT,
  MIN_NET_MARGIN
};
