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

/**
 * Single Contract Resolver for Marketplace & Product Type Authority
 */
function resolvePublishContract({ marketplace, productType, listing }) {
  const hasEtsyTags = Array.isArray(listing?.etsyTags) && listing?.etsyTags.length > 0;
  const hasAmzBullets = Array.isArray(listing?.amazonBullets) && listing?.amazonBullets.length > 0;
  const resolvedMarketplace = marketplace || listing?.marketplace || (hasEtsyTags && !hasAmzBullets ? 'ETSY' : 'AMAZON');
  const rawProductType = (productType || listing?.productType || listing?.categoryName || 'STANDARD_PRINT_ON_DEMAND').trim();
  const normalizedType = rawProductType.toUpperCase();

  const SUPPORTED_PRODUCT_TYPES = [
    'STANDARD_PRINT_ON_DEMAND', 'APPAREL', 'JEWELRY', 'HOME_DECOR', 
    'STICKER_PACK', 'EMBROIDERY', 'SWEATSHIRT', 'APPAREL: SWEATSHIRT', 
    'T-SHIRT', 'MUG', 'POSTER', 'CANVAS'
  ];

  if (resolvedMarketplace === 'AMAZON') {
    if (!SUPPORTED_PRODUCT_TYPES.includes(normalizedType)) {
      return {
        marketplace: 'AMAZON',
        productType: rawProductType,
        contractStatus: 'UNKNOWN_CONTRACT',
        reasons: [`Unrecognized product type contract: "${rawProductType}". Manager review required.`]
      };
    }

    return {
      marketplace: 'AMAZON',
      productType: rawProductType,
      contractStatus: 'VALID_CONTRACT',
      requiredBulletsCount: 5,
      maxSearchTermsBytes: 249,
      allowSearchTermsCommas: false,
      maxTitleChars: 200,
      reasons: []
    };
  }

  if (resolvedMarketplace === 'ETSY') {
    if (!SUPPORTED_PRODUCT_TYPES.includes(normalizedType)) {
      return {
        marketplace: 'ETSY',
        productType: rawProductType,
        contractStatus: 'UNKNOWN_CONTRACT',
        reasons: [`Unrecognized product type contract: "${rawProductType}". Manager review required.`]
      };
    }

    return {
      marketplace: 'ETSY',
      productType: rawProductType,
      contractStatus: 'VALID_CONTRACT',
      requiredTagsCount: 13,
      maxTagChars: 20,
      maxTitleChars: 200,
      reasons: []
    };
  }

  return {
    marketplace: resolvedMarketplace,
    productType: rawProductType,
    contractStatus: 'UNKNOWN_CONTRACT',
    reasons: [`Unsupported marketplace authority: "${resolvedMarketplace}".`]
  };
}

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

  // 2. Resolve Contract via Canonical Authority
  const contract = resolvePublishContract({
    marketplace: listing.marketplace,
    productType: listing.productType || listing.categoryName,
    listing
  });

  if (contract.contractStatus === 'UNKNOWN_CONTRACT') {
    contract.reasons.forEach(r => issues.push(r));
  }

  // Marketplace-authoritative title selection (Etsy uses etsyTitle first; Amazon uses amazonTitle first)
  const title = contract.marketplace === 'ETSY'
    ? (listing.etsyTitle || listing.title || listing.amazonTitle || '')
    : (listing.amazonTitle || listing.title || listing.etsyTitle || '');
  if (title.length > contract.maxTitleChars) {
    issues.push(`Title exceeds ${contract.maxTitleChars} character limit (${title.length} chars)`);
  }

  // 2a-1. Etsy Tags Contract Check
  if (contract.marketplace === 'ETSY') {
    const tags = listing.etsyTags || listing.tags || [];
    if (!Array.isArray(tags) || tags.length === 0) {
      issues.push('Missing Etsy tags -- exactly 13 tags required for Etsy listings');
    } else {
      if (tags.length !== contract.requiredTagsCount) {
        issues.push(`Etsy tags count must be exactly ${contract.requiredTagsCount} tags (current: ${tags.length})`);
      }
      const longTags = tags.filter(t => typeof t !== 'string' || t.length > contract.maxTagChars);
      if (longTags.length > 0) {
        issues.push(`${longTags.length} tags exceed ${contract.maxTagChars}-character Etsy limit`);
      }
    }
  }

  // 2a-2. Amazon Bullets & Search Terms Contract Check
  if (contract.marketplace === 'AMAZON') {
    const bullets = listing.amazonBullets || [];
    if (!Array.isArray(bullets) || bullets.length === 0) {
      issues.push('Missing Amazon bullet points -- exactly 5 bullet points required for Amazon listings');
    } else {
      if (bullets.length !== contract.requiredBulletsCount) {
        issues.push(`Amazon bullets count must be exactly ${contract.requiredBulletsCount} bullet points (current: ${bullets.length})`);
      }
      const emptyBullets = bullets.filter(b => typeof b !== 'string' || b.trim().length === 0);
      if (emptyBullets.length > 0) {
        issues.push('Amazon bullet points must not contain empty lines');
      }
    }

    const searchTerms = typeof listing.amazonSearchTerms === 'string' ? listing.amazonSearchTerms.trim() : '';
    if (!searchTerms) {
      issues.push('Missing Amazon search terms -- generic search terms required for Amazon listings');
    } else {
      const byteLen = Buffer.byteLength(searchTerms, 'utf8');
      if (byteLen > contract.maxSearchTermsBytes) {
        issues.push(`Amazon search terms exceed ${contract.maxSearchTermsBytes} UTF-8 bytes limit (${byteLen} bytes)`);
      }
      if (!contract.allowSearchTermsCommas && searchTerms.includes(',')) {
        issues.push('Amazon search terms must not contain commas (use spaces only)');
      }
    }
  }

  // 2a-3. Financial Profit & Margin Floor Enforcement (Safe Finite Number Validation)
  if (listing.netProfit !== undefined && listing.netProfit !== null) {
    const profitNum = Number(listing.netProfit);
    if (!Number.isFinite(profitNum)) {
      issues.push('Invalid net profit value (must be a valid numeric figure)');
    } else if (profitNum < MIN_NET_PROFIT) {
      issues.push(`Net profit ($${profitNum.toFixed(2)}) is below the required $${MIN_NET_PROFIT.toFixed(2)} floor`);
    }
  }

  if (listing.netMargin !== undefined && listing.netMargin !== null) {
    const marginNum = Number(listing.netMargin);
    if (!Number.isFinite(marginNum)) {
      issues.push('Invalid net margin value (must be a valid numeric figure)');
    } else if (marginNum < MIN_NET_MARGIN) {
      issues.push(`Net margin (${marginNum.toFixed(1)}%) is below the required ${MIN_NET_MARGIN.toFixed(1)}% floor`);
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
  resolvePublishContract,
  MIN_NET_PROFIT,
  MIN_NET_MARGIN
};
