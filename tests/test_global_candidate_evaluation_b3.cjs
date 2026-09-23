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
  provenance: { integrityOutcome: 'VALID', sourceCapturedAt: '2026-09-22T00:00:00.000Z',
    sourceCapturedAtAuthority: 'STAFF_ASSERTED', sourceCapturedAtBasis: 'OPERATOR_EXPLICIT_INPUT' },
  commercialEvidence: {},
  socialEvidence: {},
  rawEvidence: { supportScope: 'QUERY_RESULT_SET' },
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
const freshSource = Object.freeze({ sourceCapturedAt: '2026-09-22T00:00:00.000Z',
  sourceCapturedAtAuthority: 'STAFF_ASSERTED', sourceCapturedAtBasis: 'OPERATOR_EXPLICIT_INPUT' });
const trustedQueryBinding = value => ({
  value, state: 'OBSERVED', source: 'CANONICAL_CAPTURE_RECEIPT',
  authority: 'SERVER_CAPTURE_RECEIPT', captureId: 'capture-' + value.replace(/\s+/g, '-').toLowerCase(),
  receiptId: null
});

const modeled = candidate(1, 'modeled demand', [evidence({
  commercialEvidence: { searchVolume: 2400, keywordSales: 18, competingProducts: 700, modeled: true }
})]);
const modeledEval = evaluateCandidate(modeled, { marketplace: 'AMAZON', now: '2026-09-22T00:00:00.000Z' });
assert.equal(modeledEval.evaluationPolicyVersion, EVALUATION_POLICY_VERSION);
assert.equal(modeledEval.proofPolicyVersion, PROOF_POLICY_VERSION);
assert.equal(modeledEval.commercialProof.status, 'NOT_ESTABLISHED');
assert.ok(modeledEval.commercialProof.blockerCodes.includes('MODELED_THIRD_PARTY_NOT_COMMERCIAL_PROOF'));
assert.equal(modeledEval.advisoryDisposition.value, 'WATCH');
assert.equal(modeledEval.researchReadiness.value, 'READY');
assert.ok(modeledEval.researchReadiness.reasonCodes.includes('AMAZON_CEREBRO_RESEARCH_READY'));
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
assert.equal(socialEval.researchReadiness.value, 'NOT_READY');
assert.ok(socialEval.researchReadiness.reasonCodes.includes('ETSY_MARKETPLACE_EVIDENCE_REQUIRED'));
assert.ok(socialEval.advisoryDisposition.reasonCodes.includes('SOCIAL_RESEARCH_CANNOT_REPLACE_MARKETPLACE_EVIDENCE'));
assert.equal(socialEval.socialSupport.status, 'PRESENT_RESEARCH_ONLY');

const etsyPublic = evidence({
  provenance: { integrityOutcome: 'VALID', ...freshSource, queryBinding: trustedQueryBinding('cross source opportunity') },
  rawEvidence: { supportScope: 'QUERY_RESULT_SET', phrase: 'cross source opportunity' },
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
  provenance: { integrityOutcome: 'VALID', ...freshSource, queryBinding: trustedQueryBinding('proof established') },
  rawEvidence: { supportScope: 'QUERY_RESULT_SET', phrase: 'proof established' },
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
assert.equal(establishedEval.researchReadiness.value, 'READY');
assert.ok(establishedEval.researchReadiness.reasonCodes.includes('ETSY_PUBLIC_SEARCH_RESEARCH_READY'));
assert.ok(establishedEval.advisoryDisposition.reasonCodes.includes('COMMERCIAL_PROOF_ESTABLISHED'));

const zeroPublic = evidence({
  provenance: { integrityOutcome: 'VALID', ...freshSource, queryBinding: trustedQueryBinding('zero is not kill') },
  rawEvidence: { supportScope: 'QUERY_RESULT_SET', phrase: 'zero is not kill' },
  evidenceHash: hash('m'), sourceFamily: 'ETSY_PUBLIC_SEARCH', authorityClassification: 'OBSERVED_PUBLIC',
  evidenceTier: 'E1_OBSERVED_PUBLIC', sourceArtifactHash: hash('n'),
  commercialEvidence: { listingCount: 5, listings: [{ listingId: 'L3', sold24h: 0, totalSold: 0, revenue: 0,
    reviewCount: 0, fieldProvenance: { sold24h: researchOnlyField(0), totalSold: researchOnlyField(0),
      revenue: researchOnlyField(0), reviewCount: researchOnlyField(0) } }] }
});
const zeroEval = evaluateCandidate(candidate(5, 'zero is not kill', [zeroPublic]), { marketplace: 'ETSY' });
assert.equal(zeroEval.advisoryDisposition.value, 'NEEDS_EVIDENCE');
assert.equal(zeroEval.researchReadiness.value, 'READY');
assert.notEqual(zeroEval.advisoryDisposition.value, 'KILL');
assert.equal(zeroEval.killPolicy, 'NO_KILL_FROM_ABSENCE_ZERO_OR_WEAK_SIGNAL_ONLY');

const adversarialModeled = evidence({
  evidenceHash: hash('o'), sourceFamily: 'AMAZON_CEREBRO', authorityClassification: 'MODELED_THIRD_PARTY',
  evidenceTier: 'E2_MODELED_THIRD_PARTY', sourceArtifactHash: hash('p'),
  commercialEvidence: { searchVolume: 5000, keywordSales: 0, competingProducts: 300, modeled: true }
});
const adversarialPublic = evidence({
  provenance: { integrityOutcome: 'VALID', ...freshSource, queryBinding: trustedQueryBinding('modeled positive public zero') },
  rawEvidence: { supportScope: 'QUERY_RESULT_SET', phrase: 'modeled positive public zero' },
  evidenceHash: hash('q'), sourceFamily: 'ETSY_PUBLIC_SEARCH', authorityClassification: 'OBSERVED_PUBLIC',
  evidenceTier: 'E1_OBSERVED_PUBLIC', sourceArtifactHash: hash('r'),
  commercialEvidence: { listingCount: 5, listings: [{ listingId: 'L4', sold24h: 0, totalSold: 0, revenue: 0,
    reviewCount: 0, fieldProvenance: { sold24h: researchOnlyField(0), totalSold: researchOnlyField(0),
      revenue: researchOnlyField(0), reviewCount: researchOnlyField(0) } }] }
});
const adversarialCandidate = candidate(6, 'modeled positive public zero', [adversarialModeled, adversarialPublic, social]);
const adversarialEval = evaluateCandidate(adversarialCandidate, { marketplace: 'ETSY', now: '2026-09-22T00:00:00.000Z' });
assert.equal(adversarialEval.commercialProof.status, 'NOT_ESTABLISHED');
assert.equal(adversarialEval.advisoryDisposition.value, 'WATCH');
assert.ok(!adversarialEval.advisoryDisposition.reasonCodes.includes('OBSERVED_PUBLIC_SIGNAL_PRESENT'));
assert.ok(adversarialEval.advisoryDisposition.reasonCodes.includes('POSITIVE_OBSERVED_PUBLIC_MARKET_SIGNAL_REQUIRED_FOR_PROMOTE'));
assert.ok(!adversarialEval.advisoryDisposition.reasonCodes.includes('PROMOTE_FOR_PROJECT_RESEARCH_NOT_AS_COMMERCIAL_PROOF'));

const weakCerebro = evidence({
  evidenceHash: hash('s'), sourceArtifactHash: hash('t'),
  commercialEvidence: { searchVolume: 0, keywordSales: 0, competingProducts: null, modeled: true }
});
const positiveProjectProxy = evidence({
  evidenceHash: hash('u'), sourceFamily: 'AMAZON_PROJECT_MKL_OUTLIER', authorityClassification: 'PROJECT_RESEARCH',
  evidenceTier: 'E2_MODELED_THIRD_PARTY', sourceArtifactType: 'AMAZON_MASTER_KEYWORDS', sourceArtifactHash: hash('v'),
  commercialEvidence: { metrics: { searchVolume: 9000, keywordSales: 50, competingProducts: 100 } }
});
const scopedEval = evaluateCandidate(candidate(7, 'qualifying scope only', [weakCerebro, positiveProjectProxy]), { marketplace: 'AMAZON' });
assert.equal(scopedEval.researchReadiness.value, 'NOT_READY',
  'project-research proxy metrics must not make weak Cerebro research-ready');

const tagOnly = evidence({
  evidenceHash: hash('w'), sourceFamily: 'ETSY_PUBLIC_SEARCH', authorityClassification: 'OBSERVED_PUBLIC',
  evidenceTier: 'E1_OBSERVED_PUBLIC', sourceArtifactHash: hash('x'),
  commercialEvidence: { listingCount: 4, listings: [{ listingId: 'TAG-1', reviewCount: 10,
    fieldProvenance: { reviewCount: researchOnlyField(10) } }] },
  rawEvidence: { supportScope: 'TAG_SUPPORT' }
});
assert.equal(evaluateCandidate(candidate(8, 'tag needs own query capture', [tagOnly]), { marketplace: 'ETSY' })
  .researchReadiness.value, 'NOT_READY');

const untrustedQuery = evidence({
  evidenceHash: hash('1'), sourceFamily: 'ETSY_PUBLIC_SEARCH', authorityClassification: 'OBSERVED_PUBLIC',
  evidenceTier: 'E1_OBSERVED_PUBLIC', sourceArtifactHash: hash('2'),
  provenance: { integrityOutcome: 'VALID', ...freshSource, queryBinding: {
    value: 'fabricated phrase x', state: 'SOURCE_HINT', source: 'ETSY_SEARCH_CSV',
    authority: 'NONE', captureId: null, receiptId: null
  } },
  commercialEvidence: { listingCount: 4, listings: [{ listingId: 'U1', reviewCount: 25,
    fieldProvenance: { reviewCount: researchOnlyField(25) } }] },
  rawEvidence: { supportScope: 'QUERY_RESULT_SET', phrase: 'fabricated phrase x' }
});
assert.equal(evaluateCandidate(candidate(10, 'fabricated phrase x', [untrustedQuery]), { marketplace: 'ETSY' })
  .researchReadiness.value, 'NOT_READY',
  'SOURCE_HINT / authority NONE must never establish Etsy query-result-set readiness');

const trustedQuery = evidence({
  evidenceHash: hash('3'), sourceFamily: 'ETSY_PUBLIC_SEARCH', authorityClassification: 'OBSERVED_PUBLIC',
  evidenceTier: 'E1_OBSERVED_PUBLIC', sourceArtifactHash: hash('4'),
  provenance: { integrityOutcome: 'VALID', ...freshSource, queryBinding: trustedQueryBinding('trusted query') },
  commercialEvidence: { listingCount: 4, listings: [{ listingId: 'T1', reviewCount: 25,
    fieldProvenance: { reviewCount: researchOnlyField(25) } }] },
  rawEvidence: { supportScope: 'QUERY_RESULT_SET', phrase: 'trusted query' }
});
assert.equal(evaluateCandidate(candidate(11, 'trusted query', [trustedQuery]), { marketplace: 'ETSY' })
  .researchReadiness.value, 'READY',
  'valid marketplace evidence with an authoritative capture binding remains research-ready');

const degradedEtsy = evidence({
  evidenceHash: hash('y'), sourceFamily: 'ETSY_PUBLIC_SEARCH', authorityClassification: 'OBSERVED_PUBLIC',
  evidenceTier: 'E1_OBSERVED_PUBLIC', sourceArtifactHash: hash('z'),
  provenance: { integrityOutcome: 'DEGRADED_PARSE', ...freshSource, queryBinding: trustedQueryBinding('degraded capture') },
  commercialEvidence: { listingCount: 6, listings: [] },
  rawEvidence: { supportScope: 'QUERY_RESULT_SET', phrase: 'degraded capture' }
});
assert.equal(evaluateCandidate(candidate(9, 'degraded capture', [degradedEtsy]), { marketplace: 'ETSY' })
  .researchReadiness.value, 'NOT_READY');

const staleAmazon = evidence({
  evidenceHash: hash('5'),
  provenance: { integrityOutcome: 'VALID', sourceCapturedAt: '2026-08-01T00:00:00.000Z',
    sourceCapturedAtAuthority: 'STAFF_ASSERTED', sourceCapturedAtBasis: 'OPERATOR_EXPLICIT_INPUT' },
  commercialEvidence: { searchVolume: 2400, keywordSales: 18, competingProducts: 700, modeled: true }
});
const staleEval = evaluateCandidate(candidate(12, 'stale amazon', [staleAmazon]),
  { marketplace: 'AMAZON', now: '2026-09-22T00:00:00.000Z' });
assert.equal(staleEval.researchReadiness.value, 'NOT_READY');
assert.ok(staleEval.researchReadiness.reasonCodes.includes('AMAZON_SOURCE_STALE_OVER_30_DAYS'));

const unknownFreshness = evidence({
  evidenceHash: hash('6'), provenance: { integrityOutcome: 'VALID' },
  commercialEvidence: { searchVolume: 2400, keywordSales: 18, competingProducts: 700, modeled: true }
});
const unknownFreshnessEval = evaluateCandidate(candidate(13, 'unknown freshness', [unknownFreshness]),
  { marketplace: 'AMAZON', now: '2026-09-22T00:00:00.000Z' });
assert.equal(unknownFreshnessEval.researchReadiness.value, 'NOT_READY');
assert.ok(unknownFreshnessEval.researchReadiness.reasonCodes.includes('SOURCE_CAPTURE_DATE_REQUIRED'));

const futureFreshness = evidence({
  evidenceHash: hash('7'),
  provenance: { integrityOutcome: 'VALID', sourceCapturedAt: '2026-09-23T00:00:00.000Z',
    sourceCapturedAtAuthority: 'STAFF_ASSERTED', sourceCapturedAtBasis: 'OPERATOR_EXPLICIT_INPUT' },
  commercialEvidence: { searchVolume: 2400, keywordSales: 18, competingProducts: 700, modeled: true }
});
const futureFreshnessEval = evaluateCandidate(candidate(14, 'future freshness', [futureFreshness]),
  { marketplace: 'AMAZON', now: '2026-09-22T00:00:00.000Z' });
assert.equal(futureFreshnessEval.researchReadiness.value, 'NOT_READY');
assert.ok(futureFreshnessEval.researchReadiness.reasonCodes.includes('SOURCE_CAPTURE_DATE_IN_FUTURE'));

const etsyStale = evidence({
  evidenceHash: hash('8'), sourceFamily: 'ETSY_PUBLIC_SEARCH', authorityClassification: 'OBSERVED_PUBLIC',
  evidenceTier: 'E1_OBSERVED_PUBLIC', sourceArtifactHash: hash('9'),
  provenance: { integrityOutcome: 'VALID', sourceCapturedAt: '2026-09-01T00:00:00.000Z',
    sourceCapturedAtAuthority: 'STAFF_ASSERTED', sourceCapturedAtBasis: 'OPERATOR_EXPLICIT_INPUT',
    queryBinding: trustedQueryBinding('etsy stale') },
  commercialEvidence: { listingCount: 2, listings: [{ listingId: 'ES1', reviewCount: 5,
    fieldProvenance: { reviewCount: researchOnlyField(5) } }] },
  rawEvidence: { supportScope: 'QUERY_RESULT_SET', phrase: 'etsy stale' }
});
const etsyStaleEval = evaluateCandidate(candidate(15, 'etsy stale', [etsyStale]),
  { marketplace: 'ETSY', now: '2026-09-22T00:00:00.000Z' });
assert.equal(etsyStaleEval.researchReadiness.value, 'NOT_READY');
assert.ok(etsyStaleEval.researchReadiness.reasonCodes.includes('ETSY_SOURCE_STALE_OVER_14_DAYS'));

const ranked = evaluateAndPrioritizeGlobalCandidates([modeled, socialOnly, crossCandidate, establishedCandidate],
  { marketplace: 'ETSY', now: '2026-09-22T00:00:00.000Z' });
assert.deepEqual(ranked.map(item => item.normalizedPhrase),
  ['proof established', 'cross source opportunity', 'modeled demand', 'social only']);
assert.deepEqual(ranked.map(item => item.priorityRank), [1, 2, 3, 4]);
assert.ok(ranked.every(item => item.priorityAid.secondaryOnly === true));

console.log('GLOBAL_CANDIDATE_EVALUATION_B3_PASSED');
