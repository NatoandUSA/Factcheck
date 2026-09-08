const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Ajv2020 = require('ajv/dist/2020');
const { validatePolicyContractInvariants } = require('../shared/policyContractInvariants.cjs');
const { validateTrackAHandoffInvariants } = require('../shared/trackAHandoffInvariants.cjs');

const root = path.resolve(__dirname, '..');
const contractRoot = path.join(root, 'contracts', 'omniseller-r3', 'v1');
const load = relative => {
  const bytes = fs.readFileSync(path.join(contractRoot, relative));
  return {
    value: JSON.parse(bytes.toString('utf8')),
    artifactByteHash: crypto.createHash('sha256').update(bytes).digest('hex')
  };
};
const clone = value => JSON.parse(JSON.stringify(value));
const fail = message => { throw new Error(message); };

const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
ajv.addFormat('date-time', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/);
const policySchema = load('policy-contract.schema.json');
const lifecycleSchema = load('policy-lifecycle-event.schema.json');
const trackASchema = load('track-a-handoff-manifest.schema.json');
const validatePolicy = ajv.compile(policySchema.value);
const validateLifecycle = ajv.compile(lifecycleSchema.value);
const validateTrackA = ajv.compile(trackASchema.value);

const assertValid = (validator, value, id) => {
  if (!validator(value)) fail(`${id}_EXPECTED_VALID ${ajv.errorsText(validator.errors)}`);
};
const assertInvalid = (validator, value, id) => {
  if (validator(value)) fail(`${id}_EXPECTED_INVALID`);
};
const assertPolicyContractValid = (value, id) => {
  assertValid(validatePolicy, value, id);
  const invariantResult = validatePolicyContractInvariants(value);
  if (!invariantResult.valid) fail(`${id}_INVARIANT_INVALID ${JSON.stringify(invariantResult.violations)}`);
};

const taxonomy = load('claim-taxonomy.v1.json');
if (taxonomy.value.claimIds.length !== 14) fail('CLAIM_ID_COUNT_MISMATCH');
if (new Set(taxonomy.value.claimIds).size !== taxonomy.value.claimIds.length) fail('DUPLICATE_CLAIM_ID');
if (taxonomy.value.identityDoesNotProveAttribute !== true) fail('IDENTITY_ATTRIBUTE_INVARIANT_MISSING');
if (taxonomy.value.legacyAdapterPolicy?.mappingGranularity !== 'TOKEN_OR_PATTERN') fail('LEGACY_MAPPING_MUST_BE_TOKEN_LEVEL');
if (taxonomy.value.legacyAdapterPolicy?.classWideOneToManyPromotionForbidden !== true) fail('LEGACY_CLASS_WIDE_PROMOTION_MUST_BE_FORBIDDEN');
const withoutDedicatedLegacyClass = new Set(taxonomy.value.stableClassesWithoutDedicatedLegacyClass || []);
for (const id of [
  'SAFETY_MEDICAL_HEALTH_AGE_COMPLIANCE',
  'DIGITAL_FORMAT_LICENSE_USAGE_RIGHT',
  'PRICE_DISCOUNT_SCARCITY_COMMERCIAL_PROMISE',
  'COMPARATIVE_SUPERLATIVE_EXCLUSIVITY'
]) {
  if (!withoutDedicatedLegacyClass.has(id)) fail(`LEGACY_DEDICATED_CLASS_GAP_MISSING_${id}`);
}
if (JSON.stringify(taxonomy.value.stableClassesWithNoLegacyTokenCoverage) !== JSON.stringify(['DIGITAL_FORMAT_LICENSE_USAGE_RIGHT'])) {
  fail('LEGACY_TOKEN_COVERAGE_GAP_MISMATCH');
}

const redCases = load('c0-red-cases.json');
const requiredRedCases = [
  'POLICY_CONTRACT_MUTATION_75_TO_200',
  'POLICY_CLIENT_OVERRIDE_FORBIDDEN',
  'POLICY_COMPOSER_VALIDATOR_PARITY',
  'POLICY_UNKNOWN_OR_AMBIGUOUS_FAILS_CLOSED',
  'ETSY_POLICY_VS_QUALITY_TARGET',
  'SINGLE_CANONICAL_COMPOSER_WRITE_PATH',
  'LEGACY_AUTH_BEFORE_RETIREMENT_RESPONSE',
  'CHAT_RESEARCH_MODE_ZERO_WRITE',
  'NO_LEGACY_UI_COMPOSER_CALLERS',
  'ROOT_V1_TRANSACTION_ROLLBACK_AND_IDEMPOTENCY',
  'RECURSIVE_SQL_WRITER_ALLOWLIST',
  'PRODUCT_NAME_DOES_NOT_PROVE_MATERIAL'
];
const redIds = new Set(redCases.value.cases.map(item => item.id));
for (const id of requiredRedCases) if (!redIds.has(id)) fail(`MISSING_RED_CASE_${id}`);

const amazon = load(path.join('policy-fixtures', 'amazon-us-nonmedia-2026-07-27-v1.json'));
const etsy = load(path.join('policy-fixtures', 'etsy-us-general-2026-09-08-v1.json'));
assertPolicyContractValid(amazon.value, 'AMAZON_PUBLIC_BASELINE');
assertPolicyContractValid(etsy.value, 'ETSY_PUBLIC_BASELINE');
if (amazon.value.approvalEligibility !== 'DRAFT_ONLY') fail('PUBLIC_BASELINE_MUST_BE_DRAFT_ONLY');
const etsyTargetExceedsMax = clone(etsy.value);
etsyTargetExceedsMax.rules.tags.maxCount = 5;
if (validatePolicyContractInvariants(etsyTargetExceedsMax).valid) fail('ETSY_TARGET_EXCEEDS_MAX_EXPECTED_INVALID');

const emptyRules = clone(amazon.value);
emptyRules.rules = {};
assertInvalid(validatePolicy, emptyRules, 'AMAZON_EMPTY_RULES');
const publicApproval = clone(amazon.value);
publicApproval.approvalEligibility = 'APPROVAL_ELIGIBLE';
assertInvalid(validatePolicy, publicApproval, 'PUBLIC_BASELINE_APPROVAL_ELIGIBLE');
const publicWithoutUrl = clone(amazon.value);
delete publicWithoutUrl.sourceRefs[0].url;
assertInvalid(validatePolicy, publicWithoutUrl, 'PUBLIC_SOURCE_WITHOUT_URL');

const ownerConfirmed = clone(amazon.value);
ownerConfirmed.policyContractId = 'amazon-us-account-category-confirmed-v1';
ownerConfirmed.verificationStatus = 'OWNER_CONFIRMED_ACCOUNT_CATEGORY';
ownerConfirmed.approvalEligibility = 'APPROVAL_ELIGIBLE';
ownerConfirmed.cohort.categoryIds = ['JEWELRY_NECKLACE'];
ownerConfirmed.cohort.sellerAccountIds = ['ACCOUNT_ALIAS_MAIN'];
ownerConfirmed.sourceRefs.push({
  kind: 'OWNER_ATTESTATION',
  artifactHash: 'a'.repeat(64),
  capturedAt: '2026-09-09T00:00:00Z',
  actorId: 'owner-1'
});
assertPolicyContractValid(ownerConfirmed, 'OWNER_CONFIRMED_EXACT_SCOPE');
const ownerEmptyScope = clone(ownerConfirmed);
ownerEmptyScope.cohort.categoryIds = [];
ownerEmptyScope.cohort.sellerAccountIds = [];
assertInvalid(validatePolicy, ownerEmptyScope, 'OWNER_CONFIRMED_EMPTY_SCOPE');
const ownerWithoutEvidence = clone(ownerConfirmed);
ownerWithoutEvidence.sourceRefs = amazon.value.sourceRefs;
assertInvalid(validatePolicy, ownerWithoutEvidence, 'OWNER_CONFIRMED_WITHOUT_BOUND_EVIDENCE');

const lifecycleEvent = {
  schemaVersion: 'omniseller.policy-lifecycle-event.v1',
  eventId: 'event-1',
  policyContractId: ownerConfirmed.policyContractId,
  policyContractArtifactHash: 'b'.repeat(64),
  eventType: 'REVOKED',
  actorId: 'owner-1',
  occurredAt: '2026-09-09T01:00:00Z',
  reasonCode: 'ACCOUNT_POLICY_CHANGED',
  supersedingPolicyContractId: null
};
assertValid(validateLifecycle, lifecycleEvent, 'APPEND_ONLY_LIFECYCLE_EVENT');

const trackA = load(path.join('track-a-fixtures', 'valid-handoff.example.json'));
assertValid(validateTrackA, trackA.value, 'TRACK_A_HANDOFF');
if (!validateTrackAHandoffInvariants(trackA.value).valid) fail('TRACK_A_ACCOUNTING_INVARIANT_INVALID');
const requiredTrackAComponents = new Set([
  '01_PRODUCT_TRUTH.json',
  '02_RESEARCH_SOURCE_MANIFEST.json',
  '03_AMAZON_DRAFT.json',
  '03_AMAZON_DRAFT.csv',
  '03_AMAZON_DRAFT.txt',
  '04_KEYWORD_DISPOSITION.csv',
  '05_CLAIM_IP_POLICY_REPORT.json',
  '06_PPC_REVIEW.csv',
  '07_TRACK_B_IMPORT_RECEIPT_TEMPLATE.json'
]);
const hasRequiredTrackAComponents = value => {
  const names = value.components.map(component => component.name);
  return new Set(names).size === names.length && [...requiredTrackAComponents].every(name => names.includes(name));
};
if (!hasRequiredTrackAComponents(trackA.value)) fail('TRACK_A_REQUIRED_COMPONENT_SET_INVALID');
const trackAAuthorityEscalation = clone(trackA.value);
trackAAuthorityEscalation.authority = 'APPROVED';
assertInvalid(validateTrackA, trackAAuthorityEscalation, 'TRACK_A_AUTHORITY_ESCALATION');
const trackAMissingComponent = clone(trackA.value);
trackAMissingComponent.components.pop();
assertInvalid(validateTrackA, trackAMissingComponent, 'TRACK_A_MISSING_COMPONENT');
const trackAWrongComponent = clone(trackA.value);
trackAWrongComponent.components[0].name = 'UNRECOGNIZED.json';
assertInvalid(validateTrackA, trackAWrongComponent, 'TRACK_A_WRONG_COMPONENT');
const trackADuplicateComponent = clone(trackA.value);
trackADuplicateComponent.components[0].name = trackADuplicateComponent.components[1].name;
assertInvalid(validateTrackA, trackADuplicateComponent, 'TRACK_A_DUPLICATE_COMPONENT');
const trackATraversalComponent = clone(trackA.value);
trackATraversalComponent.components[0].name = '../../outside.json';
assertInvalid(validateTrackA, trackATraversalComponent, 'TRACK_A_TRAVERSAL_COMPONENT');
const trackAAccountingMismatch = clone(trackA.value);
trackAAccountingMismatch.keywordAccounting.accountedObservations -= 1;
if (validateTrackAHandoffInvariants(trackAAccountingMismatch).valid) fail('TRACK_A_ACCOUNTING_MISMATCH_EXPECTED_INVALID');

for (const [name, artifact] of Object.entries({ taxonomy, redCases, policySchema, lifecycleSchema, trackASchema, amazon, etsy, trackA })) {
  console.log(`C0_CONTRACT_OK ${name} artifactByteSha256=${artifact.artifactByteHash}`);
}
console.log('C0_JSON_SCHEMA_2020_POSITIVE_NEGATIVE_VALIDATION PASS');
