'use strict';
const crypto = require('node:crypto');
const { evaluateCandidate, EVALUATION_POLICY_VERSION, PROOF_POLICY_VERSION } =
  require('../server/globalCandidateEvaluation');

const NOW = '2026-09-24T00:45:00+07:00';
const INTEL_HASH = '4e7c4c024edfb28e42e76faafe578b8b0101f3b6854effd52b9470397e8efa6c';
const MOM_HASH = '2114755df532e7eac1ffcc69af8335c34a63e306190db78e2a365171b8a277d5';
const ESPOSA_HASH = 'fe7005269b588c2193302f3d56b5c3016a736ca99a6924b39717ac404417ae92';
const ETSY_HASH = 'e5c977852b5110ed16bba95044e574624378cfcd5e7f273dc8d3abeaeede5fb3';

const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const baseEvidence = (id, overrides={}) => ({
  evidenceHash: hash('pilot20-evidence-'+id),
  sourceFamily: 'INTEL_RESEARCH',
  authorityClassification: 'RESEARCH_ONLY',
  evidenceTier: 'RESEARCH_ONLY',
  sourceArtifactType: 'VERIFIED_PILOT_SOURCE',
  sourceArtifactId: null,
  sourceArtifactHash: INTEL_HASH,
  provenance: {},
  commercialEvidence: {},
  socialEvidence: {},
  rawEvidence: {},
  ...overrides
});const intelEvidence = (id, artifactId) => baseEvidence(id, {
  sourceArtifactId: artifactId,
  provenance: { artifactIssuedAt: '2026-09-22T07:04:20.000Z' },
  socialEvidence: { verifiedPilotSignal: true }
});

const amazonEvidence = (id, artifactId, artifactHash, commercialEvidence={}) => baseEvidence(id, {
  sourceFamily: 'AMAZON_CEREBRO',
  authorityClassification: 'MODELED_THIRD_PARTY',
  evidenceTier: 'E2_MODELED_THIRD_PARTY',
  sourceArtifactType: 'RESEARCH_FILE',
  sourceArtifactId: artifactId,
  sourceArtifactHash: artifactHash,
  provenance: { integrityOutcome: 'VALID' },
  commercialEvidence,
  rawEvidence: { supportScope: 'QUERY_RESULT_SET' }
});

const etsyEvidence = (id, url) => baseEvidence(id, {
  sourceFamily: 'ETSY_PUBLIC_SEARCH',
  authorityClassification: 'OBSERVED_PUBLIC',
  evidenceTier: 'E1_OBSERVED_PUBLIC',
  sourceArtifactType: 'OFFICIAL_PAGE_EXTRACTION',
  sourceArtifactId: url,
  sourceArtifactHash: ETSY_HASH,
  provenance: { integrityOutcome: 'VALID' },
  commercialEvidence: { listingCount: 1, listings: [] },
  rawEvidence: { supportScope: 'QUERY_RESULT_SET' }
});const defs = [
 [1,'ETSY','pet memorial gift',()=>intelEvidence(1,'WATCH:kw-1789736854519')],
 [2,'ETSY','birth flower necklace',()=>intelEvidence(2,'WATCH:kw-1789736871543')],
 [3,'ETSY','personalized baptism gift',()=>intelEvidence(3,'WATCH:kw-1789736887293')],
 [4,'ETSY','boo basket',()=>intelEvidence(4,'WATCH:kw-1789736883033')],
 [5,'ETSY','custom photo blanket',()=>intelEvidence(5,'WATCH:kw-1789736876936')],
 [6,'ETSY','mama sweatshirt with kids names on sleeve',()=>intelEvidence(6,'WATCH:kw-1789736866060')],
 [7,'ETSY','quinceanera gift for daughter',()=>intelEvidence(7,'WATCH:kw-1789736903417')],
 [8,'AMAZON','halloween mama embroidered sweatshirt',
   ()=>amazonEvidence(8,'Cerebro Mom Hallo Sweats Embr _ NGA - BR3.xlsx',MOM_HASH,{})],
 [9,'AMAZON','spanish wife novia message card necklace',
   ()=>amazonEvidence(9,'Esposa - NGA - BR2.xlsx',ESPOSA_HASH,{})],
 [10,'AMAZON','postpartum gifts for new mom',
   ()=>amazonEvidence(10,'Cerebro Mom Hallo Sweats Embr _ NGA - BR3.xlsx',MOM_HASH,
     { searchVolume:1826, keywordSales:26, competingProducts:1000, titleDensity:0, bid:1.09, modeled:true })],
 [11,'AMAZON','quieres ser mi novia girlfriend proposal gift',
   ()=>amazonEvidence(11,'Esposa - NGA - BR2.xlsx',ESPOSA_HASH,{})], [12,'ETSY','adhd college student planner',
   ()=>etsyEvidence(12,'https://www.etsy.com/listing/1086570451/the-adhd-college-student-planner')],
 [13,'ETSY','contractor invoice template',
   ()=>etsyEvidence(13,'https://www.etsy.com/listing/4411325949/editable-contractor-invoice-template')],
 [14,'ETSY','iep parent binder printable',
   ()=>etsyEvidence(14,'https://www.etsy.com/listing/4403789489/iep-organizational-binder-for-families')],
 [15,'ETSY','airbnb cleaning checklist printable',
   ()=>etsyEvidence(15,'https://www.etsy.com/listing/1602892873/airbnb-cleaning-checklist-printable')],
 [16,'ETSY','moody botanical printable wall art',
   ()=>etsyEvidence(16,'https://www.etsy.com/listing/4335166527/moody-botanical-printable-wall-art-black')],
 [17,'ETSY','notion wedding planner',
   ()=>etsyEvidence(17,'https://www.etsy.com/ca/market/notion_wedding_planner_2026')],
 [18,'ETSY','basket for quinceanera',()=>intelEvidence(18,'DISCOVERY:basket for quinceañera')],
 [19,'ETSY','15th birthday today',()=>intelEvidence(19,'DISCOVERY:15th birthday today')],
 [20,'ETSY','christmas gift',()=>intelEvidence(20,'DISCOVERY:christmas gift')]
];const old = new Map([
 [1,'NEEDS_EVIDENCE'],[2,'NEEDS_EVIDENCE'],[3,'NEEDS_EVIDENCE'],[4,'NEEDS_EVIDENCE'],
 [5,'NEEDS_EVIDENCE'],[6,'NEEDS_EVIDENCE'],[7,'NEEDS_EVIDENCE'],[8,'NEEDS_EVIDENCE'],
 [9,'NEEDS_EVIDENCE'],[10,'WATCH'],[11,'NEEDS_EVIDENCE'],[12,'NEEDS_EVIDENCE'],
 [13,'NEEDS_EVIDENCE'],[14,'NEEDS_EVIDENCE'],[15,'NEEDS_EVIDENCE'],[16,'NEEDS_EVIDENCE'],
 [17,'NEEDS_EVIDENCE'],[18,'NEEDS_EVIDENCE'],[19,'NEEDS_EVIDENCE'],[20,'NEEDS_EVIDENCE']
]);

const rows = defs.map(([id, marketplace, phrase, makeEvidence]) => {
  const candidate = {
    id, candidateKey: hash('pilot20-candidate-'+id),
    normalizedPhrase: phrase, displayPhrase: phrase,
    evidence: [makeEvidence()]
  };
  const result = evaluateCandidate(candidate, { marketplace, now: NOW });
  return {
    pilotId:id, marketplace, phrase,
    priorDisposition:old.get(id),
    disposition:result.advisoryDisposition.value,
    researchReadiness:result.researchReadiness.value,
    readinessReasons:result.researchReadiness.reasonCodes,
    proof:result.commercialProof.status,
    reasonCodes:result.advisoryDisposition.reasonCodes,
    unknowns:result.unknowns,
    sourceFamilies:result.evidenceSummary.sourceFamilies
  };
});const counts = (field) => rows.reduce((acc,row)=>{
  const key=row[field]; acc[key]=(acc[key]||0)+1; return acc;
},{});
const summary = {
  replayType:'CURRENT_AUTHORITY_SEMANTIC_RECONSTRUCTION',
  authorityHead:'9517c7c96ec6672e681bebc49f8c9e67866b0939',
  evaluationPolicyVersion:EVALUATION_POLICY_VERSION,
  proofPolicyVersion:PROOF_POLICY_VERSION,
  evaluatedAt:NOW,
  productionMutation:false,
  candidateCount:rows.length,
  dispositionCounts:counts('disposition'),
  readinessCounts:counts('researchReadiness'),
  proofCounts:counts('proof'),
  dispositionDrift:rows.filter(r=>r.priorDisposition!==r.disposition)
    .map(r=>({pilotId:r.pilotId,prior:r.priorDisposition,current:r.disposition}))
};
console.log(JSON.stringify({summary,rows},null,2));
