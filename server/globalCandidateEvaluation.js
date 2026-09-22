'use strict';

const EVALUATION_POLICY_VERSION = 'GLOBAL_CANDIDATE_EVALUATION_V1';
const PROOF_POLICY_VERSION = 'GLOBAL_CANDIDATE_PROOF_V1';
const RANKING_MODE = 'SECONDARY_LEXICOGRAPHIC_V1';
const DISPOSITION_ORDER = Object.freeze({ PROMOTE: 0, WATCH: 1, NEEDS_EVIDENCE: 2, KILL: 3 });
const PROOF_ORDER = Object.freeze({ ESTABLISHED: 0, NOT_ESTABLISHED: 1, NOT_PRESENT: 2 });

const asObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const finite = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const unique = values => [...new Set(values.filter(Boolean))];
const hasKeys = value => Object.keys(asObject(value)).length > 0;

function evidenceRef(evidence) {
  return Object.freeze({ evidenceHash: evidence.evidenceHash, sourceFamily: evidence.sourceFamily,
    authorityClassification: evidence.authorityClassification, evidenceTier: evidence.evidenceTier,
    sourceArtifactType: evidence.sourceArtifactType, sourceArtifactId: evidence.sourceArtifactId ?? null,
    sourceArtifactHash: evidence.sourceArtifactHash });
}

function metric(evidence, path, value, kind, provenance = null) {
  const number = finite(value); if (number == null) return null;
  return Object.freeze({ path, value: number, kind, evidenceRef: evidenceRef(evidence),
    fieldProvenance: provenance ? Object.freeze({ ...provenance }) : null });
}

function extractMetrics(evidence) {
  const commercial = asObject(evidence.commercialEvidence); const out = [];
  const add = (path, value, kind, provenance = null) => { const item = metric(evidence, path, value, kind, provenance); if (item) out.push(item); };
  if (evidence.sourceFamily === 'AMAZON_CEREBRO') {
    add('searchVolume', commercial.searchVolume, 'DEMAND_SIGNAL'); add('keywordSales', commercial.keywordSales, 'SALES_SIGNAL');
    add('competingProducts', commercial.competingProducts, 'COMPETITION_SIGNAL'); add('titleDensity', commercial.titleDensity, 'COMPETITION_SIGNAL');
    add('bid', commercial.bid, 'PRICE_SIGNAL'); add('rank', commercial.rank, 'RANK_SIGNAL');
  } else if (evidence.sourceFamily === 'AMAZON_PROJECT_MKL_OUTLIER') {
    const values = asObject(commercial.metrics);
    add('metrics.searchVolume', values.searchVolume, 'DEMAND_SIGNAL'); add('metrics.keywordSales', values.keywordSales, 'SALES_SIGNAL');
    add('metrics.competingProducts', values.competingProducts, 'COMPETITION_SIGNAL'); add('metrics.titleDensity', values.titleDensity, 'COMPETITION_SIGNAL');
    add('metrics.bid', values.bid, 'PRICE_SIGNAL'); add('metrics.trend', values.trend, 'TIMING_SIGNAL');
  } else if (evidence.sourceFamily === 'ETSY_PUBLIC_SEARCH') {
    add('listingCount', commercial.listingCount, 'COMPETITION_SIGNAL');
    for (const [index, raw] of (Array.isArray(commercial.listings) ? commercial.listings : []).entries()) {
      const listing = asObject(raw); const provenance = asObject(listing.fieldProvenance); const prefix = 'listings[' + index + '].';
      add(prefix + 'sold24h', listing.sold24h, 'SALES_SIGNAL', provenance.sold24h); add(prefix + 'totalSold', listing.totalSold, 'SALES_SIGNAL', provenance.totalSold);
      add(prefix + 'revenue', listing.revenue, 'SALES_SIGNAL', provenance.revenue); add(prefix + 'priceAmount', listing.priceAmount, 'PRICE_SIGNAL', provenance.priceAmount);
      add(prefix + 'reviewCount', listing.reviewCount, 'DEMAND_SIGNAL', provenance.reviewCount);
    }
  } else if (evidence.sourceFamily === 'ETSY_PROJECT_MKL_OUTLIER') {
    add('demandProxy', commercial.demandProxy, 'DEMAND_SIGNAL'); add('competitionProxy', commercial.competitionProxy, 'COMPETITION_SIGNAL');
    add('listingSpread', commercial.listingSpread, 'COMPETITION_SIGNAL'); add('shopSpread', commercial.shopSpread, 'COMPETITION_SIGNAL');
  }
  return Object.freeze(out);
}

function canEstablishProof(item) {
  if (item.kind !== 'SALES_SIGNAL' || item.value <= 0 || item.evidenceRef.authorityClassification !== 'OBSERVED_PUBLIC') return false;
  const provenance = asObject(item.fieldProvenance); const state = String(provenance.state || '').toUpperCase();
  const authority = String(provenance.authority || '').toUpperCase(); const allowedUse = String(provenance.allowedUse || '').toUpperCase();
  return state === 'OBSERVED'
    && item.evidenceRef.evidenceTier === 'E1_OBSERVED_PUBLIC'
    && authority === 'SERVER_PROVIDER'
    && allowedUse === 'COMMERCIAL_DECISION';
}

function evaluateProof(evidence, metrics) {
  const commercial = evidence.filter(item => hasKeys(item.commercialEvidence));
  if (!commercial.length) return Object.freeze({ status: 'NOT_PRESENT', policyVersion: PROOF_POLICY_VERSION,
    evidenceRefs: [], blockerCodes: ['COMMERCIAL_SIGNAL_NOT_PRESENT'] });
  const proofMetrics = metrics.filter(canEstablishProof);
  if (proofMetrics.length) return Object.freeze({ status: 'ESTABLISHED', policyVersion: PROOF_POLICY_VERSION,
    evidenceRefs: unique(proofMetrics.map(item => item.evidenceRef.evidenceHash)).map(hash => proofMetrics.find(item => item.evidenceRef.evidenceHash === hash).evidenceRef),
    proofMetrics, blockerCodes: [] });
  const blockers = [];
  if (commercial.some(item => item.authorityClassification === 'MODELED_THIRD_PARTY')) blockers.push('MODELED_THIRD_PARTY_NOT_COMMERCIAL_PROOF');
  if (commercial.some(item => item.authorityClassification === 'PROJECT_RESEARCH')) blockers.push('PROJECT_RESEARCH_NOT_COMMERCIAL_PROOF');
  const publicSales = metrics.filter(item => item.kind === 'SALES_SIGNAL' && item.value > 0 && item.evidenceRef.authorityClassification === 'OBSERVED_PUBLIC');
  if (publicSales.some(item => { const p = asObject(item.fieldProvenance); return String(p.authority || '').toUpperCase() === 'NONE' || String(p.allowedUse || '').toUpperCase() === 'RESEARCH_ONLY'; })) {
    blockers.push('OBSERVED_PUBLIC_FIELD_PROVENANCE_NOT_PROOF_AUTHORITY');
  }
  if (!blockers.length) blockers.push('COMMERCIAL_PROOF_POLICY_NOT_SATISFIED');
  return Object.freeze({ status: 'NOT_ESTABLISHED', policyVersion: PROOF_POLICY_VERSION, evidenceRefs: [], blockerCodes: unique(blockers) });
}

function evaluateWhyNow(evidence, metrics, now = new Date()) {
  const nowMs = new Date(now).getTime(); const reasons = [];
  for (const item of evidence) {
    const issued = Date.parse(String(asObject(item.provenance).artifactIssuedAt || '')); const age = (nowMs - issued) / 86400000;
    if (Number.isFinite(issued) && age >= 0 && age <= 30 && hasKeys(item.socialEvidence)) reasons.push({ code: 'RECENT_SOCIAL_RESEARCH_SIGNAL', evidenceRef: evidenceRef(item) });
  }
  for (const item of metrics) {
    if (item.kind === 'TIMING_SIGNAL' && item.value > 0) reasons.push({ code: 'TREND_SIGNAL_PRESENT', evidenceRef: item.evidenceRef });
    if (item.path.endsWith('.sold24h') && item.value > 0) reasons.push({ code: 'RECENT_MARKETPLACE_ACTIVITY_SIGNAL_RESEARCH_ONLY', evidenceRef: item.evidenceRef });
  }
  const seen = new Set(); const deduped = reasons.filter(item => { const key = item.code + ':' + item.evidenceRef.evidenceHash; if (seen.has(key)) return false; seen.add(key); return true; });
  return Object.freeze({ status: deduped.length ? 'SUPPORTED_BY_SIGNALS' : 'NOT_ESTABLISHED', reasons: Object.freeze(deduped),
    unknowns: Object.freeze(deduped.length ? [] : ['WHY_NOW_NOT_ESTABLISHED']) });
}

function evaluateCandidate(candidate, context = {}) {
  const evidence = Array.isArray(candidate?.evidence) ? candidate.evidence : []; const metrics = Object.freeze(evidence.flatMap(extractMetrics));
  const commercial = evidence.filter(item => hasKeys(item.commercialEvidence)); const social = evidence.filter(item => hasKeys(item.socialEvidence));
  const sourceFamilies = unique(evidence.map(item => item.sourceFamily)); const authorityCounts = Object.freeze(evidence.reduce((acc, item) => {
    const key = String(item.authorityClassification || 'UNKNOWN'); acc[key] = (acc[key] || 0) + 1; return acc;
  }, {}));
  const proof = evaluateProof(evidence, metrics); const positiveMarket = metrics.filter(item => ['DEMAND_SIGNAL','SALES_SIGNAL'].includes(item.kind) && item.value > 0);
  const positiveObservedPublicMarket = positiveMarket.filter(item => item.evidenceRef.authorityClassification === 'OBSERVED_PUBLIC');
  const selling = metrics.filter(item => item.kind === 'SALES_SIGNAL' && item.value > 0); const demand = metrics.filter(item => item.kind === 'DEMAND_SIGNAL' && item.value > 0);
  const competitionSignals = metrics.filter(item => item.kind === 'COMPETITION_SIGNAL'); const competitionPresent = competitionSignals.length > 0;
  const observedPublic = Number(authorityCounts.OBSERVED_PUBLIC || 0); const crossSource = sourceFamilies.length >= 2; const whyNow = evaluateWhyNow(evidence, metrics, context.now || new Date());
  const amazonResearchReady = context.marketplace === 'AMAZON'
    && evidence.some(item => item.sourceFamily === 'AMAZON_CEREBRO')
    && positiveMarket.length > 0 && competitionPresent;
  const etsyResearchReady = context.marketplace === 'ETSY'
    && evidence.some(item => item.sourceFamily === 'ETSY_PUBLIC_SEARCH'
      && Number(item.commercialEvidence?.listingCount || 0) > 0)
    && competitionPresent;
  const researchReady = amazonResearchReady || etsyResearchReady;
  const researchReadiness = Object.freeze({
    value: researchReady ? 'READY' : 'NOT_READY',
    reasonCodes: Object.freeze(researchReady
      ? [amazonResearchReady ? 'AMAZON_CEREBRO_RESEARCH_READY' : 'ETSY_PUBLIC_SEARCH_RESEARCH_READY']
      : [context.marketplace === 'AMAZON' ? 'AMAZON_MARKETPLACE_EVIDENCE_REQUIRED' : 'ETSY_MARKETPLACE_EVIDENCE_REQUIRED'])
  });
  const unknowns = [];
  if (proof.status !== 'ESTABLISHED') unknowns.push(proof.status === 'NOT_PRESENT' ? 'COMMERCIAL_PROOF_NOT_PRESENT' : 'COMMERCIAL_PROOF_NOT_ESTABLISHED');
  if (!competitionPresent) unknowns.push('COMPETITION_CONTEXT_NOT_PRESENT'); if (!crossSource) unknowns.push('CROSS_SOURCE_CORROBORATION_NOT_PRESENT');
  if (whyNow.status === 'NOT_ESTABLISHED') unknowns.push('WHY_NOW_NOT_ESTABLISHED'); if (!observedPublic) unknowns.push('OBSERVED_PUBLIC_MARKETPLACE_EVIDENCE_NOT_PRESENT');
  let disposition; const reasonCodes = [];
  if (!commercial.length || !positiveMarket.length) {
    disposition = 'NEEDS_EVIDENCE'; reasonCodes.push(!commercial.length ? 'COMMERCIAL_SIGNALS_NOT_PRESENT' : 'POSITIVE_DEMAND_OR_SALES_SIGNAL_NOT_PRESENT');
    if (social.length) reasonCodes.push('SOCIAL_RESEARCH_CANNOT_REPLACE_MARKETPLACE_EVIDENCE');
  } else if (proof.status === 'ESTABLISHED' && competitionPresent) {
    disposition = 'PROMOTE'; reasonCodes.push('COMMERCIAL_PROOF_ESTABLISHED', 'COMPETITION_CONTEXT_PRESENT');
  } else if (positiveObservedPublicMarket.length > 0 && competitionPresent && crossSource) {
    disposition = 'PROMOTE'; reasonCodes.push('OBSERVED_PUBLIC_SIGNAL_PRESENT', 'COMPETITION_CONTEXT_PRESENT', 'CROSS_SOURCE_CORROBORATION_PRESENT');
    if (proof.status !== 'ESTABLISHED') reasonCodes.push('PROMOTE_FOR_PROJECT_RESEARCH_NOT_AS_COMMERCIAL_PROOF');
  } else {
    disposition = 'WATCH'; reasonCodes.push('POSITIVE_MARKET_SIGNAL_PRESENT');
    if (!competitionPresent) reasonCodes.push('COMPETITION_CONTEXT_REQUIRED_FOR_PROMOTE'); if (!crossSource) reasonCodes.push('MORE_SOURCE_CORROBORATION_REQUIRED_FOR_PROMOTE');
    if (!observedPublic) reasonCodes.push('OBSERVED_PUBLIC_MARKETPLACE_EVIDENCE_REQUIRED_FOR_PROMOTE');
    else if (!positiveObservedPublicMarket.length) reasonCodes.push('POSITIVE_OBSERVED_PUBLIC_MARKET_SIGNAL_REQUIRED_FOR_PROMOTE');
  }
  const summary = Object.freeze({ evidenceCount: evidence.length, sourceFamilyCount: sourceFamilies.length, sourceFamilies: Object.freeze(sourceFamilies), authorityCounts,
    commercialEvidenceCount: commercial.length, socialEvidenceCount: social.length, observedPublicEvidenceCount: observedPublic });
  const rankingBasis = Object.freeze({ researchReadiness: researchReadiness.value, disposition,
    commercialProofStatus: proof.status, observedPublicEvidenceCount: observedPublic,
    sourceFamilyCount: sourceFamilies.length, positiveDemandOrSalesSignalCount: positiveMarket.length, evidenceCount: evidence.length });
  return Object.freeze({ candidateId: candidate.id, candidateKey: candidate.candidateKey, normalizedPhrase: candidate.normalizedPhrase, displayPhrase: candidate.displayPhrase,
    marketplace: context.marketplace || null, evaluationPolicyVersion: EVALUATION_POLICY_VERSION, proofPolicyVersion: PROOF_POLICY_VERSION, advisoryOnly: true,
    commercialProof: proof, sellingSignals: Object.freeze(selling), demandSignals: Object.freeze(demand),
    competition: Object.freeze({ status: competitionPresent ? 'PRESENT' : 'NOT_PRESENT', signals: Object.freeze(competitionSignals) }),
    socialSupport: Object.freeze({ status: social.length ? 'PRESENT_RESEARCH_ONLY' : 'NOT_PRESENT', evidenceRefs: Object.freeze(social.map(evidenceRef)) }), whyNow,
    researchReadiness,
    evidenceSummary: summary, unknowns: Object.freeze(unique(unknowns)), advisoryDisposition: Object.freeze({ value: disposition,
      reasonCodes: Object.freeze(unique(reasonCodes)), acceptedUnknowns: Object.freeze(disposition === 'PROMOTE' ? unique(unknowns) : []),
      blockers: Object.freeze(disposition === 'PROMOTE' ? [] : unique(unknowns)) }),
    priorityAid: Object.freeze({ secondaryOnly: true, rankingMode: RANKING_MODE, rankingBasis }), killPolicy: 'NO_KILL_FROM_ABSENCE_ZERO_OR_WEAK_SIGNAL_ONLY' });
}

function compareEvaluations(left, right) {
  const a = left.priorityAid.rankingBasis; const b = right.priorityAid.rankingBasis;
  return (a.researchReadiness === 'READY' ? 0 : 1) - (b.researchReadiness === 'READY' ? 0 : 1)
    || (DISPOSITION_ORDER[a.disposition] ?? 99) - (DISPOSITION_ORDER[b.disposition] ?? 99)
    || (PROOF_ORDER[a.commercialProofStatus] ?? 99) - (PROOF_ORDER[b.commercialProofStatus] ?? 99)
    || b.observedPublicEvidenceCount - a.observedPublicEvidenceCount || b.sourceFamilyCount - a.sourceFamilyCount
    || b.positiveDemandOrSalesSignalCount - a.positiveDemandOrSalesSignalCount || b.evidenceCount - a.evidenceCount
    || String(left.normalizedPhrase || '').localeCompare(String(right.normalizedPhrase || ''));
}

function evaluateAndPrioritizeGlobalCandidates(candidates, context = {}) {
  const evaluated = (Array.isArray(candidates) ? candidates : []).map(item => evaluateCandidate(item, context)); evaluated.sort(compareEvaluations);
  return Object.freeze(evaluated.map((item, index) => Object.freeze({ ...item, priorityRank: index + 1 })));
}

module.exports = Object.freeze({ EVALUATION_POLICY_VERSION, PROOF_POLICY_VERSION, RANKING_MODE, evaluateCandidate, evaluateAndPrioritizeGlobalCandidates });
