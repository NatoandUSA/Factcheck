'use strict';
// Priority ladder: place EVERY usable keyword somewhere, best slot first.
//
// The ladder mirrors how much each surface is actually worth on Amazon:
//
//   1 Title            highest weight, hardest character limit
//   2 Item Highlights  second-highest, still visible copy
//   3 Bullets          visible copy, generous length
//   4 Description      visible copy, lowest ranking weight
//   5 Search Terms     invisible, byte-capped, tokens only, no repeats
//   6 PPC Exact        no limit — proven demand, tight relevance
//   7 PPC Phrase       no limit — mid relevance
//   8 PPC Broad        no limit — everything else usable
//   -  Rejected        never used, each with a stated reason
//
// A keyword lands at the highest tier it qualifies for and is not repeated
// lower down; its unused TOKENS still flow into search terms. Nothing usable
// is silently dropped: the coverage report accounts for every input row.
const { contentTokens } = require('./text');
const { classify, isGarbage, bannedClaim, isGeneric, conflictingRecipient } = require('./semantic');

function rejectionReason(keyword) {
  if (keyword.ipVerdict === 'BLOCK') return { code: 'IP_BLOCK', detail: keyword.ipHits.map(h => h.term || h).join(', ') };
  if (isGarbage(keyword.phrase)) return { code: 'GARBAGE', detail: 'Mã ASIN / số / ký tự rác' };
  const banned = bannedClaim(keyword.phrase);
  if (banned) return { code: 'POLICY_CLAIM', detail: `Hứa hẹn giao hàng / xếp hạng: "${banned}"` };
  if (keyword.suspectedBrand) return { code: 'RIVAL_BRAND', detail: `Nghi tên shop đối thủ: "${keyword.suspectedBrand}"` };
  if (keyword.negativeHit) return { code: 'NEGATIVE', detail: `Trùng từ loại trừ: "${keyword.negativeHit}"` };
  return null;
}

function partition(scoredKeywords, { minRelevance = 0.15, excludeReview = false, allowedRecipients = null } = {}) {
  const usable = [];
  const rejected = [...(scoredKeywords.meta?.preRejected || [])];
  for (const keyword of scoredKeywords) {
    const reason = rejectionReason(keyword);
    if (reason) { rejected.push({ phrase: keyword.phrase, searchVolume: keyword.searchVolume, ...reason }); continue; }
    if (excludeReview && keyword.ipVerdict === 'REVIEW') {
      rejected.push({ phrase: keyword.phrase, searchVolume: keyword.searchVolume, code: 'IP_REVIEW', detail: 'Bị loại theo lựa chọn "loại luôn mức REVIEW"' });
      continue;
    }
    const wrongAudience = conflictingRecipient(keyword.phrase, allowedRecipients);
    if (wrongAudience) {
      rejected.push({ phrase: keyword.phrase, searchVolume: keyword.searchVolume, code: 'WRONG_AUDIENCE', detail: `Nhắm đối tượng khác: "${wrongAudience}"` });
      continue;
    }
    if (keyword.relevance < minRelevance) {
      rejected.push({ phrase: keyword.phrase, searchVolume: keyword.searchVolume, code: 'OFF_NICHE', detail: `Độ liên quan ${keyword.relevance.toFixed(2)} dưới ngưỡng ${minRelevance}` });
      continue;
    }
    usable.push({ ...keyword, ...classify(keyword.phrase), generic: isGeneric(keyword.phrase) });
  }
  return { usable, rejected };
}

// PPC match types split by how safely the phrase can be bid on:
// exact for proven, tightly-relevant demand; phrase for mid; broad for the
// long tail that is still on-niche.
function splitPpc(remaining) {
  const exact = [];
  const phrase = [];
  const broad = [];
  for (const keyword of remaining) {
    const volume = keyword.searchVolume || 0;
    if (keyword.relevance >= 0.5 && volume >= 100 && !keyword.generic) exact.push(keyword);
    else if (keyword.relevance >= 0.3 || volume >= 50) phrase.push(keyword);
    else broad.push(keyword);
  }
  const wire = list => list.map(k => ({
    phrase: k.phrase, searchVolume: k.searchVolume, titleDensity: k.titleDensity,
    competingProducts: k.competingProducts, bid: k.bid,
    score: Number(k.score.toFixed(4)), cluster: k.primary
  }));
  return { exact: wire(exact), phrase: wire(phrase), broad: wire(broad) };
}

// Counts every cluster a phrase belongs to, not just its primary label:
// "mothers day gift for mom sweatshirt" is occasion AND recipient AND core,
// and a title needs to know all three.
function clusterTally(list) {
  const tally = {};
  for (const keyword of list) {
    for (const name of (keyword.clusters && keyword.clusters.length ? keyword.clusters : ['longtail'])) {
      tally[name] = (tally[name] || 0) + 1;
    }
  }
  return tally;
}

// `placedPhrases` are the phrases the copy builder actually consumed;
// `indexedTokens` is every token already visible in copy or search terms.
function buildLadder({ usable, rejected, placedPhrases, indexedTokens, searchTermSets }) {
  const placed = new Set(placedPhrases.map(p => String(p).toLowerCase()));
  const remaining = usable.filter(k => !placed.has(k.phrase.toLowerCase()));
  const ppc = splitPpc(remaining);

  const allTokens = new Set();
  for (const keyword of usable) for (const token of contentTokens(keyword.phrase)) allTokens.add(token);
  // Coverage is the share of CORPUS vocabulary that reached the listing.
  // Counting raw indexed tokens would include words from the Product Truth
  // form ("cotton", "vietnam") and push the figure past 100%.
  let corpusTokensIndexed = 0;
  for (const token of allTokens) if (indexedTokens.has(token)) corpusTokensIndexed++;

  const searchTokenCount = searchTermSets.reduce((sum, set) => sum + set.tokenCount, 0);

  return {
    ppc,
    coverage: {
      corpusPhrases: usable.length + rejected.length,
      usablePhrases: usable.length,
      rejectedPhrases: rejected.length,
      placedInCopy: placed.size,
      placedInSearchTerms: searchTokenCount,
      placedInPpc: ppc.exact.length + ppc.phrase.length + ppc.broad.length,
      distinctTokensInCorpus: allTokens.size,
      distinctTokensIndexed: corpusTokensIndexed,
      tokenCoveragePercent: allTokens.size ? Math.round((corpusTokensIndexed / allTokens.size) * 100) : 0,
      usedSomewhere: placed.size + ppc.exact.length + ppc.phrase.length + ppc.broad.length,
      clustersUsable: clusterTally(usable),
      clustersRemaining: clusterTally(remaining)
    },
    rejected
  };
}

module.exports = { partition, buildLadder, splitPpc, rejectionReason };
