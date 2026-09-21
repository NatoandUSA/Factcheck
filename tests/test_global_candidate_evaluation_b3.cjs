const assert = require('node:assert/strict');
const { EVALUATION_POLICY_VERSION, PROOF_POLICY_VERSION, RANKING_MODE,
  evaluateCandidate, evaluateAndPrioritizeGlobalCandidates } = require('../server/globalCandidateEvaluation');

const hash = char => char.repeat(64);
const evidence = (overrides = {}) => ({
  evidenceHash: hash('a'),
  sourceFamily: 'AMAZON_CEREBRO',
  authorityClassification: 'MODELED_THIRD_PARTY',
  evidenceTier: 'E2_MODELED_THIRD_PARTY',
  sourceArtifactType: 'RESEARCH_FILE',
  sourceArtifactId: 'source-1',
  sourceArtifactHash: hash('b'),
  provenance: {},
  commercialEvidence: {},
  socialEvidence: {},
  rawEvidence: {},
  ...overrides
});
const candidate = (id, phrase, rows) => ({
  id,
  candidateKey: hash(String((id % 9) + 1)),
  normalizedPhrase: phrase,
  displayPhrase: phrase,
  evidence: rows
});
const researchOnlyField = value => ({ value, state: 'OBSERVED', source: 'ETSY_SEARCH_CSV',
  authority: 'NONE', allowedUse: 'RESEARCH_ONLY', raw: String(value) });
const proofField = value => ({ value, state: 'OBSERVED', source: 'CANONICAL_MARKETPLACE_SOURCE',
  authority: 'SERVER_PROVIDER', allowedUse: 'COMMERCIAL_DECISION', raw: String(value) });

const modeled = candidate(1, 'modeled demand', [evidence({
  commercialEvidence: { searchVolume: 2400, keywordSales: 18, competingProducts: 700, modeled: true }
})]);
const modeledEval = evaluateCandidate(modeled, { marketplace: 'AMAZON', now: '2026-09-22T00:00:00.000Z' });
assert.equal(modeledEval.evaluationPolicyVersion, EVALUATION_POLICY_VERSION);
assert.equal(modeledEval.proofPolicyVersion, PROOF_POLICY_VERSION);
assert.equal(modeledEval.commercialProof.status, 'NOT_ESTABLISHED');
assert.ok(modeledEval.commercialProof.blockerCodes.includes('MODELED_THIRD_PARTY_NOT_COMMERCIAL_PROOF'));
assert.equal(modeledEval.advisoryDisposition.value, 'WATCH');
assert.ok(modeledEval.advisoryDisposition.reasonCodes.includes('OBSERVED_PUBLIC_MARKETPLACE_EVIDENCE_REQUIRED_FOR_PROMOTE'));
assert.equal(modeledEval.priorityAid.secondaryOnly, true);
assert.equal(modeledEval.priorityAid.rankingMode, RANKING_MODE);
assert.equal(Object.hasOwn(modeledEval, 'score'), false);
assert.equal(Object.hasOwn(modeledEval.priorityAid, 'score'), false);

const socialOnly = candidate(2, 'social only', [evidence({
  evidenceHash: hash('c'), sourceFamily: 'SOCIAL_LISTENING', authorityClassification: 'RESEARCH_ONLY',
  evidenceTier: 'RESEARCH_ONLY', sourceArtifactType: 'SOCIAL_HANDOFF_V3', sourceArtifactHash: hash('d'),
  provenance: { artifactIssuedAt: '2026-09-20T00:00:00.000Z' }, commercialEvidence: {},
  socialEvidence: { momentum: 'rising' }
})]);
const socialEval = evaluateCandidate(socialOnly, { marketplace: 'ETSY', now: '2026-09-22T00:00:00.000Z' });
assert.equal(socialEval.commercialProof.status, 'NOT_PRESENT');
assert.equal(socialEval.advisoryDisposition.value, 'NEEDS_EVIDENCE');
assert.ok(socialEval.advisoryDisposition.reasonCodes.includes('SOCIAL_RESEARCH_CANNOT_REPLACE_MARKETPLACE_EVIDENCE'));
assert.equal(socialEval.socialSupport.status, 'PRESENT_RESEARCH_ONLY');

const etsyPublic = evidence({
  evidenceHash: hash('e'), sourceFamily: 'ETSY_PUBLIC_SEARCH', authorityClassification: 'OBSERVED_PUBLIC',
  evidenceTier: 'E1_OBSERVED_PUBLIC', sourceArtifactHash: hash('f'),
  commercialEvidence: { listingCount: 8, listings: [{ listingId: 'L1', sold24h: 3, totalSold: 80, revenue: 1000,
    priceAmount: 25, reviewCount: 12, fieldProvenance: {
      sold24h: researchOnlyField(3), totalSold: researchOnlyField(80), revenue: researchOnlyField(1000),
      priceAmount: researchOnlyField(25), reviewCount: researchOnlyField(12)
    } }] }
});
const projectProxy = evidence({
  evidenceHash: hash('g'), sourceFamily: 'ETSY_PROJECT_MKL_OUTLIER', authorityClassification: 'PROJECT_RESEARCH',
  evidenceTier: 'PROJECT_RESEARCH_PROXY', sourceArtifactType: 'ETSY_MASTER_KEYWORDS', sourceArtifactHash: hash('h'),
  commercialEvidence: { demandProxy: 0.8, competitionProxy: 0.25, listingSpread: 5, shopSpread: 4, proxyOnly: true }
});
const social = evidence({
  evidenceHash: hash('i'), sourceFamily: 'SOCIAL_LISTENING', authorityClassification: 'RESEARCH_ONLY',
  evidenceTier: 'RESEARCH_ONLY', sourceArtifactType: 'SOCIAL_HANDOFF_V3', sourceArtifactHash: hash('j'),
  provenance: { artifactIssuedAt: '2026-09-18T00:00:00.000Z' }, commercialEvidence: {},
  socialEvidence: { sourceFamilies: ['REDDIT', 'TIKTOK_CC'] }
});
const crossCandidate = candidate(3, 'cross source opportunity', [etsyPublic, projectProxy, social]);
const crossEval = evaluateCandidate(crossCandidate, { marketplace: 'ETSY', now: '2026-09-22T00:00:00.000Z' });
assert.equal(crossEval.commercialProof.status, 'NOT_ESTABLISHED');
assert.ok(crossEval.commercialProof.blockerCodes.includes('OBSERVED_PUBLIC_FIELD_PROVENANCE_NOT_PROOF_AUTHORITY'));
assert.equal(crossEval.advisoryDisposition.value, 'PROMOTE');
assert.ok(crossEval.advisoryDisposition.reasonCodes.includes('PROMOTE_FOR_PROJECT_RESEARCH_NOT_AS_COMMERCIAL_PROOF'));
assert.ok(crossEval.advisoryDisposition.acceptedUnknowns.includes('COMMERCIAL_PROOF_NOT_ESTABLISHED'));
assert.equal(crossEval.whyNow.status, 'SUPPORTED_BY_SIGNALS');
assert.ok(crossEval.whyNow.reasons.some(item => item.code === 'RECENT_SOCIAL_RESEARCH_SIGNAL'));
assert.ok(crossEval.whyNow.reasons.some(item => item.code === 'RECENT_MARKETPLACE_ACTIVITY_SIGNAL_RESEARCH_ONLY'));

const establishedPublic = evidence({
  evidenceHash: hash('k'), sourceFamily: 'ETSY_PUBLIC_SEARCH', authorityClassification: 'OBSERVED_PUBLIC',
  evidenceTier: 'E1_OBSERVED_PUBLIC', sourceArtifactHash: hash('l'),
  commercialEvidence: { listingCount: 3, listings: [{ listingId: 'L2', sold24h: 2, totalSold: 22, revenue: 400,
    fieldProvenance: { sold24h: proofField(2), totalSold: proofField(22), revenue: proofField(400) } }] }
});
const establishedCandidate = candidate(4, 'proof established', [establishedPublic]);
const establishedEval = evaluateCandidate(establishedCandidate, { marketplace: 'ETSY', now: '2026-09-22T00:00:00.000Z' });
assert.equal(establishedEval.commercialProof.status, 'ESTABLISHED');
assert.ok(establishedEval.commercialProof.proofMetrics.length >= 1);
assert.equal(establishedEval.advisoryDisposition.value, 'PROMOTE');
assert.ok(establishedEval.advisoryDisposition.reasonCodes.includes('COMMERCIAL_PROOF_ESTABLISHED'));

const zeroPublic = evidence({
  evidenceHash: hash('m'), sourceFamily: 'ETSY_PUBLIC_SEARCH', authorityClassification: 'OBSERVED_PUBLIC',
  evidenceTier: 'E1_OBSERVED_PUBLIC', sourceArtifactHash: hash('n'),
  commercialEvidence: { listingCount: 5, listings: [{ listingId: 'L3', sold24h: 0, totalSold: 0, revenue: 0,
    reviewCount: 0, fieldProvenance: { sold24h: researchOnlyField(0), totalSold: researchOnlyField(0),
      revenue: researchOnlyField(0), reviewCount: researchOnlyField(0) } }] }
});
const zeroEval = evaluateCandidate(candidate(5, 'zero is not kill', [zeroPublic]), { marketplace: 'ETSY' });
assert.equal(zeroEval.advisoryDisposition.value, 'NEEDS_EVIDENCE');
assert.notEqual(zeroEval.advisoryDisposition.value, 'KILL');
assert.equal(zeroEval.killPolicy, 'NO_KILL_FROM_ABSENCE_ZERO_OR_WEAK_SIGNAL_ONLY');

const ranked = evaluateAndPrioritizeGlobalCandidates([modeled, socialOnly, crossCandidate, establishedCandidate],
  { marketplace: 'ETSY', now: '2026-09-22T00:00:00.000Z' });
assert.deepEqual(ranked.map(item => item.normalizedPhrase),
  ['proof established', 'cross source opportunity', 'modeled demand', 'social only']);
assert.deepEqual(ranked.map(item => item.priorityRank), [1, 2, 3, 4]);
assert.ok(ranked.every(item => item.priorityAid.secondaryOnly === true));

console.log('GLOBAL_CANDIDATE_EVALUATION_B3_PASSED');
