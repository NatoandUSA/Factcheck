'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createServerPolicyContext } = require('./policy/contractRegistry');
const { policyRegistryForContext } = require('./policy/authorityLoader');
const { bindingOf, validatePolicySurfaces } = require('./policy/enforce');
const { canonicalJson, hashBytes } = require('./revisionStore');
const { currentProductTruthRevision } = require('./productTruthStore');
const { evaluateListingGuard } = require('./listingGuard');
const ipGuard = require('./ipGuard');
const { getIntelligenceSnapshot } = require('./commerceSnapshotStore');
const { getArtifact, getArtifactState } = require('./commerceWorkflowArtifactStore');
const { guardFactsForLanguage } = require('./commerceIntelligence/amazonBuyerLanguage');

const validatorFiles = [
  path.resolve(__dirname, 'listingGuard.js'),
  path.resolve(__dirname, 'ipGuard.js'),
  path.resolve(__dirname, 'claimGuard/index.js'),
  path.resolve(__dirname, 'claimGuard/lexicalScanner.js'),
  path.resolve(__dirname, 'claimGuard/corroboration.js'),
  path.resolve(__dirname, 'claimGuard/surfacePolicy.js'),
  path.resolve(__dirname, 'claimGuard/outputAudit.js'),
  path.resolve(__dirname, 'claimGuard/taxonomyAdapter.js'),
  path.resolve(__dirname, 'claimGuard/ipMatcher.js'),
  path.resolve(__dirname, 'policy/enforce.js'),
  path.resolve(__dirname, 'policy/contractRegistry.js'),
  path.resolve(__dirname, 'policy/authorityLoader.js'),
  path.resolve(__dirname, '../contracts/omniseller-r3/v1/policy-authority-scopes.json'),
  path.resolve(__dirname, '../contracts/omniseller-r3/v1/policy-owner-contracts/amazon-us-workspace1-jewelry-necklace-owner-2026-09-24-v1.json'),
  path.resolve(__dirname, '../contracts/omniseller-r3/v1/policy-owner-attestations/amz-policy-auth-r1-owner-20260924.json'),
  path.resolve(__dirname, 'policy/contractSchemaValidator.js'),
  path.resolve(__dirname, '../shared/policyContractInvariants.cjs'),
  path.resolve(__dirname, '../contracts/omniseller-r3/v1/policy-contract.schema.json'),
  path.resolve(__dirname, '../contracts/omniseller-r3/v1/policy-lifecycle-event.schema.json'),
  path.resolve(__dirname, '../contracts/omniseller-r3/v1/claim-taxonomy.v1.json')
];
const validatorHash = hashBytes(validatorFiles.map(file => fs.readFileSync(file)).map(bytes => bytes.toString('base64')).join('.'));
const claimIpBindingHash = hashBytes(canonicalJson({
  taxonomy: fs.readFileSync(path.resolve(__dirname, '../contracts/omniseller-r3/v1/claim-taxonomy.v1.json')).toString('utf8'),
  ipLibrary: fs.readFileSync(path.resolve(__dirname, 'ip_library.json')).toString('utf8')
}));

class CanonicalDraftError extends Error {
  constructor(code, status = 400, details = {}) {
    super(code); this.name = 'CanonicalDraftError'; this.code = code; this.status = status; this.details = details;
  }
}

const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params,
  (error, row) => error ? reject(error) : resolve(row || null)));

const COMMON_FIELDS = new Set(['categoryName', 'itemHighlights', 'imagePrompts', 'creativeAssets', 'ppcKeywords']);
const AMAZON_FIELDS = new Set([...COMMON_FIELDS, 'amazonTitle', 'amazonBullets', 'amazonSearchTerms', 'amazonDescription', 'amazonAPlusPoints']);
const ETSY_FIELDS = new Set([...COMMON_FIELDS, 'etsyTitle', 'etsyTags', 'etsyDescription', 'etsyTagExplanations',
  'etsyTagStatus', 'shopName', 'priceAmount', 'priceCurrency']);

function exactContent(content, marketplace) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) throw new CanonicalDraftError('INVALID_LISTING_PAYLOAD');
  const allowed = marketplace === 'AMAZON' ? AMAZON_FIELDS : ETSY_FIELDS;
  const unexpected = Object.keys(content).find(key => !allowed.has(key));
  if (unexpected) throw new CanonicalDraftError('UNEXPECTED_LISTING_FIELD', 400, { field: unexpected });
  const normalized = { ...content };
  if (marketplace === 'ETSY') {
    const shopName = String(content.shopName ?? '').normalize('NFC').trim();
    const priceAmount = String(content.priceAmount ?? '').trim();
    const priceCurrency = String(content.priceCurrency ?? '').trim().toUpperCase();
    if (shopName.length > 120 || /[\u0000-\u001f\u007f]/u.test(shopName)) {
      throw new CanonicalDraftError('INVALID_SHOP_IDENTITY', 422);
    }
    if (priceAmount && !/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(priceAmount)) {
      throw new CanonicalDraftError('INVALID_PRICE_AMOUNT', 422);
    }
    if (priceAmount && Number(priceAmount) <= 0) throw new CanonicalDraftError('INVALID_PRICE_AMOUNT', 422);
    if (priceCurrency && !/^[A-Z]{3}$/.test(priceCurrency)) throw new CanonicalDraftError('INVALID_PRICE_CURRENCY', 422);
    normalized.shopName = shopName;
    normalized.priceAmount = priceAmount;
    normalized.priceCurrency = priceCurrency;
  }
  return normalized;
}

function factsFromSnapshot(snapshot) {
  return Object.freeze(Object.fromEntries(Object.entries(snapshot?.asserted || {}).map(([key, assertion]) => [key, assertion.value])));
}

function scalar(value) {
  return ['string', 'number', 'boolean'].includes(typeof value) ? String(value).trim() : '';
}

function composeTruthOnlyContent(truth, marketplace) {
  const facts = factsFromSnapshot(truth.snapshot);
  const productType = scalar(facts.productType || facts.productName || facts.category);
  if (!productType) throw new CanonicalDraftError('PRODUCT_IDENTITY_REQUIRED', 409, { missing: ['productType'] });
  const recipient = scalar(facts.recipient || facts.audience);
  const occasion = scalar(facts.occasion);
  const title = [productType, recipient ? `for ${recipient}` : '', occasion].filter(Boolean).join(' ').trim();
  const detailPairs = [
    ['Brand', facts.brand], ['Model', facts.model],
    ['Material / ingredients', facts.materials || facts.composition || facts.ingredients],
    ['Size', facts.sizes || facts.dimensions], ['Features', facts.features || facts.capabilities],
    ['Specifications', facts.specifications], ['Intended use', facts.intendedUse],
    ['Compatibility', facts.compatibility || facts.softwareCompatibility],
    ['Performance', facts.performance], ['Durability', facts.durability],
    ['Personalization', facts.personalization], ['Included', facts.includedItems],
    ['Format', facts.fileFormat], ['Players', facts.playerCount], ['Age', facts.minimumAge], ['Duration', facts.duration],
    ['Instructions', facts.instructions], ['Warranty', facts.warranty],
    ['Safety', facts.safetyWarnings || facts.safety], ['Allergens', facts.allergens]
  ].map(([label, value]) => [label, scalar(value)]).filter(([, value]) => value);
  const description = [title, ...detailPairs.map(([label, value]) => `${label}: ${value}`)].join('. ');
  if (marketplace === 'AMAZON') return Object.freeze({
    amazonTitle: title, itemHighlights: productType,
    amazonBullets: detailPairs.length ? detailPairs.map(([label, value]) => `${label}: ${value}`) : [productType],
    amazonSearchTerms: '', amazonDescription: description, amazonAPlusPoints: [], categoryName: scalar(facts.category)
  });
  const tagCandidates = [productType, recipient, occasion, ...productType.split(/\s+/)].map(value => value.trim())
    .filter(value => value && Array.from(value).length <= 20);
  return Object.freeze({ etsyTitle: title, etsyTags: [...new Set(tagCandidates)].slice(0, 13),
    etsyDescription: description, itemHighlights: productType, categoryName: scalar(facts.category) });
}

async function projectPolicyContext(db, scope, projectId) {
  const row = await get(db, `SELECT p.*,w.seller_account_label,w.site,
    u.id AS uat_lifecycle_authorization_id,u.mode AS uat_lifecycle_mode,
      u.authorization_hash AS uat_lifecycle_authorization_hash,u.authorized_by AS uat_lifecycle_authorized_by,
      u.authorized_at AS uat_lifecycle_authorized_at
    FROM research_projects p
    JOIN workspaces w ON w.id=p.workspace_id AND w.tenant_id=p.tenant_id AND w.marketplace=p.marketplace
    LEFT JOIN project_uat_lifecycle_authorizations u ON u.project_id=p.id AND u.tenant_id=p.tenant_id
      AND u.workspace_id=p.workspace_id AND u.marketplace=p.marketplace
    WHERE p.id=? AND p.tenant_id=? AND p.workspace_id=? AND p.marketplace=?`,
  [projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
  if (!row) throw new CanonicalDraftError('PROJECT_NOT_FOUND', 404);
  const missing = ['locale', 'media_class', 'product_type_id', 'category_id', 'product_family_version',
    'seller_account_label', 'site'].filter(key => !String(row[key] || '').trim());
  if (missing.length) throw new CanonicalDraftError('PROJECT_POLICY_CONTEXT_INCOMPLETE', 409, { missing });
  return row;
}

async function resolveCurrentMasterKeywordArtifact(db, scope, projectId, configuration) {
  const artifactId = Number(configuration?.masterKeywordArtifactId);
  const artifactHash = String(configuration?.masterKeywordArtifactHash || '');
  if (!Number.isInteger(artifactId) || artifactId < 1 || !/^[a-f0-9]{64}$/.test(artifactHash)) {
    throw new CanonicalDraftError('MASTER_KEYWORD_ARTIFACT_REQUIRED', 409);
  }
  let artifact;
  const kind = scope.marketplace === 'AMAZON' ? 'AMAZON_MASTER_KEYWORDS' : 'ETSY_MASTER_KEYWORDS';
  try { artifact = await getArtifact(db, scope, projectId, artifactId, kind); }
  catch (error) {
    throw new CanonicalDraftError(error.code === 'WORKFLOW_ARTIFACT_NOT_FOUND'
      ? 'MASTER_KEYWORD_ARTIFACT_NOT_FOUND' : (error.code || 'MASTER_KEYWORD_ARTIFACT_UNAVAILABLE'),
    error.status || 409, error.details);
  }
  const state = await getArtifactState(db, scope, projectId);
  if (artifact.artifactHash !== artifactHash || state.heads[kind]?.id !== artifact.id) {
    throw new CanonicalDraftError('STALE_MASTER_KEYWORD_ARTIFACT', 409);
  }
  return artifact;
}

function policySurfaces(listing, marketplace) {
  return marketplace === 'AMAZON' ? {
    title: listing.amazonTitle,
    itemHighlights: listing.itemHighlights,
    bullets: listing.amazonBullets,
    genericKeywords: listing.amazonSearchTerms
  } : { title: listing.etsyTitle, tags: listing.etsyTags };
}

async function resolveIntelligenceBinding(db, scope, projectId, selectedIntelligenceSnapshotId, truth) {
  if (selectedIntelligenceSnapshotId == null) return null;
  const intelligence = await getIntelligenceSnapshot(db, scope, projectId, selectedIntelligenceSnapshotId);
  const project = await get(db, `SELECT head_research_snapshot_id,head_product_truth_revision_id,head_intelligence_snapshot_id
    FROM research_projects WHERE id=? AND tenant_id=? AND workspace_id=? AND marketplace=?`,
  [projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
  if (!project || project.head_intelligence_snapshot_id !== intelligence.id
    || project.head_research_snapshot_id !== intelligence.research_snapshot_id
    || project.head_product_truth_revision_id !== intelligence.product_truth_revision_id
    || intelligence.product_truth_revision_id !== truth.id || intelligence.product_truth_hash !== truth.content_hash) {
    throw new CanonicalDraftError('STALE_INTELLIGENCE_SNAPSHOT', 409);
  }
  if (!intelligence.output?.listingDraft || typeof intelligence.output.listingDraft !== 'object') {
    throw new CanonicalDraftError('INTELLIGENCE_DRAFT_UNAVAILABLE', 409);
  }
  await resolveCurrentMasterKeywordArtifact(db, scope, projectId, intelligence.configuration);
  return intelligence;
}

function stablePolicyContext(project, scope) {
  return Object.freeze({ tenantId: scope.tenantId, workspaceId: String(scope.workspaceId),
    sellerAccountId: project.seller_account_label, marketplace: scope.marketplace, site: project.site,
    locale: project.locale, mediaClass: project.media_class, productTypeId: project.product_type_id,
    categoryId: project.category_id, productFamilyVersion: project.product_family_version,
    uatLifecycleAuthorizationId: project.uat_lifecycle_authorization_id || null,
    uatLifecycleMode: project.uat_lifecycle_mode || null,
    uatLifecycleAuthorizationHash: project.uat_lifecycle_authorization_hash || null,
    uatLifecycleAuthorizedBy: project.uat_lifecycle_authorized_by || null,
    uatLifecycleAuthorizedAt: project.uat_lifecycle_authorized_at || null });
}

function uatApprovalExportEnabled(project) {
  return project?.uat_lifecycle_mode === 'APPROVAL_EXPORT_ONLY'
    && Number.isInteger(Number(project?.uat_lifecycle_authorization_id))
    && /^[a-f0-9]{64}$/.test(String(project?.uat_lifecycle_authorization_hash || ''));
}

function lifecycleCapability(project) {
  const uat = uatApprovalExportEnabled(project);
  return Object.freeze({ mode: uat ? 'UAT_APPROVAL_EXPORT_ONLY' : 'MARKETPLACE_POLICY',
    approvalAllowed: uat, exportAllowed: uat, marketplaceSubmissionAllowed: !uat,
    uatLifecycleAuthorizationId: uat ? Number(project.uat_lifecycle_authorization_id) : null,
    uatLifecycleAuthorizationHash: uat ? project.uat_lifecycle_authorization_hash : null,
    uatLifecycleAuthorizedBy: uat ? Number(project.uat_lifecycle_authorized_by) : null,
    uatLifecycleAuthorizedAt: uat ? project.uat_lifecycle_authorized_at : null });
}

function serverPolicyContext(project, scope) {
  return createServerPolicyContext({ ...stablePolicyContext(project, scope), effectiveAt: new Date().toISOString() });
}

async function describePolicyCapability(db, scope, projectId) {
  let project;
  try { project = await projectPolicyContext(db, scope, projectId); }
  catch (error) {
    if (error?.code === 'PROJECT_POLICY_CONTEXT_INCOMPLETE') {
      return Object.freeze({ status: 'CONTEXT_INCOMPLETE', approvalEligible: false,
        blockers: Object.freeze([{ code: 'PROJECT_POLICY_CONTEXT_INCOMPLETE', ...(error.details || {}) }]) });
    }
    throw error;
  }
  const context = serverPolicyContext(project, scope);
  try {
    const resolution = policyRegistryForContext(context).resolve(context, { purpose: 'DRAFT' });
    const eligibility = resolution.contract.approvalEligibility;
    const lifecycle = lifecycleCapability(project);
    if (lifecycle.mode === 'UAT_APPROVAL_EXPORT_ONLY') {
      return Object.freeze({ status: lifecycle.mode, approvalEligible: true, exportEligible: true,
        marketplaceSubmissionAllowed: false, lifecycle,
        blockers: Object.freeze([]), policyContractId: resolution.policyContractId,
        policyContractArtifactHash: resolution.policyContractArtifactHash,
        checkedAt: resolution.contract.checkedAt, effectiveFrom: resolution.contract.effectiveFrom });
    }
    return Object.freeze({
      status: eligibility,
      approvalEligible: eligibility === 'APPROVAL_ELIGIBLE',
      exportEligible: eligibility === 'APPROVAL_ELIGIBLE',
      marketplaceSubmissionAllowed: eligibility === 'APPROVAL_ELIGIBLE',
      blockers: Object.freeze(eligibility === 'APPROVAL_ELIGIBLE' ? [] : [{ code: 'POLICY_CONTRACT_DRAFT_ONLY' }]),
      policyContractId: resolution.policyContractId,
      policyContractArtifactHash: resolution.policyContractArtifactHash,
      checkedAt: resolution.contract.checkedAt,
      effectiveFrom: resolution.contract.effectiveFrom
    });
  } catch (error) {
    return Object.freeze({ status: 'POLICY_UNAVAILABLE', approvalEligible: false,
      blockers: Object.freeze([{ code: error?.code || 'POLICY_CONTRACT_UNAVAILABLE' }]) });
  }
}

async function validateCanonicalDraft(db, scope, projectId, selectedTruthRevisionId, rawContent,
  selectedIntelligenceSnapshotId = null, purpose = 'DRAFT') {
  const project = await projectPolicyContext(db, scope, projectId);
  const truth = await currentProductTruthRevision(db, scope, projectId);
  if (Number(selectedTruthRevisionId) !== truth.id) throw new CanonicalDraftError('STALE_PRODUCT_TRUTH_REVISION', 409);
  const intelligence = await resolveIntelligenceBinding(db, scope, projectId, selectedIntelligenceSnapshotId, truth);
  const listing = exactContent(rawContent, scope.marketplace);
  const verifiedFacts = factsFromSnapshot(truth.snapshot);
  const guardFacts = scope.marketplace === 'AMAZON' && intelligence?.output?.language === 'ES'
    ? guardFactsForLanguage(verifiedFacts, 'ES') : verifiedFacts;
  let guarded;
  try { guarded = evaluateListingGuard({ listing, verifiedFacts: guardFacts }); }
  catch (error) { throw new CanonicalDraftError(error.code || 'LISTING_GUARD_UNAVAILABLE', error.code === 'UNVERIFIED_OUTPUT_CLAIM' ? 422 : 503, error.details); }
  let ip;
  try { ip = ipGuard.screenListing(guarded.listing); }
  catch (_) { throw new CanonicalDraftError('IP_GUARD_UNAVAILABLE', 503); }
  if (ip.verdict === 'BLOCK') throw new CanonicalDraftError('IP_CLEARANCE_REQUIRED', 409, { ipHits: ip.hits });
  const policyContext = serverPolicyContext(project, scope);
  const lifecycle = lifecycleCapability(project);
  const uatApproval = lifecycle.mode === 'UAT_APPROVAL_EXPORT_ONLY' && ['APPROVAL', 'EXPORT'].includes(purpose);
  let resolution;
  let policy;
  try {
    resolution = policyRegistryForContext(policyContext).resolve(policyContext, { purpose: uatApproval ? 'DRAFT' : purpose });
    policy = validatePolicySurfaces(policySurfaces(guarded.listing, scope.marketplace), resolution, policyContext);
  } catch (error) {
    throw new CanonicalDraftError(error.code || 'POLICY_CONTRACT_UNAVAILABLE', 409, error.details);
  }
  if (!policy.policyCompliant) throw new CanonicalDraftError('POLICY_VALIDATION_FAILED', 422, { violations: policy.policyViolations });
  const approvalBlockers = [...policy.policyApprovalBlockers];
  if (uatApproval) {
    for (let index = approvalBlockers.length - 1; index >= 0; index -= 1) {
      if (approvalBlockers[index]?.code === 'POLICY_CONTRACT_DRAFT_ONLY') approvalBlockers.splice(index, 1);
    }
    if (scope.marketplace === 'ETSY') {
      if (!guarded.listing.shopName) approvalBlockers.push({ code: 'SHOP_IDENTITY_REQUIRED' });
      if (!guarded.listing.priceAmount) approvalBlockers.push({ code: 'PRICE_AMOUNT_REQUIRED' });
      if (!guarded.listing.priceCurrency) approvalBlockers.push({ code: 'PRICE_CURRENCY_REQUIRED' });
    }
  }
  if (purpose === 'APPROVAL' && approvalBlockers.length) {
    throw new CanonicalDraftError('POLICY_APPROVAL_BLOCKED', 409, { blockers: approvalBlockers });
  }
  const effectivePolicy = Object.freeze({ ...policy,
    policyApprovalBlockers: Object.freeze(approvalBlockers),
    policyContractApprovalEligible: purpose === 'APPROVAL' && approvalBlockers.length === 0,
    policyContractExportEligible: purpose === 'EXPORT' && approvalBlockers.length === 0,
    uatApprovalExportOnly: uatApproval });
  const policyBinding = bindingOf(resolution, policyContext);
  const policyContextHash = hashBytes(canonicalJson(stablePolicyContext(project, scope)));
  return Object.freeze({
    content: guarded.listing,
    truth,
    policy: effectivePolicy,
    lifecycle,
    dependencies: Object.freeze({
      productTruthRevisionId: truth.id,
      productTruthHash: truth.content_hash,
      researchSnapshotId: intelligence?.research_snapshot_id ?? null,
      researchSnapshotHash: intelligence?.research_snapshot_hash ?? null,
      masterKeywordArtifactId: intelligence?.configuration?.masterKeywordArtifactId ?? null,
      masterKeywordArtifactHash: intelligence?.configuration?.masterKeywordArtifactHash ?? null,
      intelligenceSnapshotId: intelligence?.id ?? null,
      intelligenceSnapshotHash: intelligence?.snapshot_hash ?? null,
      policyBindingHash: hashBytes(canonicalJson(policyBinding)),
      policyContractId: resolution.policyContractId,
      policyContractArtifactHash: resolution.policyContractArtifactHash,
      policyContextHash,
      policyLifecycleSnapshotDigest: resolution.lifecycleSnapshotDigest,
      claimIpBindingHash,
      validatorHash,
      locale: project.locale,
      productFamilyVersion: project.product_family_version
    }),
    guardAccounting: Object.freeze({ backendExcluded: guarded.backendExcluded, ppcFlagged: guarded.ppcFlagged,
      ipVerdict: ip.verdict, policyQualityGaps: effectivePolicy.qualityGaps,
      approvalBlockers: effectivePolicy.policyApprovalBlockers,
      lifecycleMode: lifecycle.mode, marketplaceSubmissionAllowed: lifecycle.marketplaceSubmissionAllowed })
  });
}

async function composeTruthOnlyDraft(db, scope, projectId, selectedTruthRevisionId) {
  const truth = await currentProductTruthRevision(db, scope, projectId);
  if (Number(selectedTruthRevisionId) !== truth.id) throw new CanonicalDraftError('STALE_PRODUCT_TRUTH_REVISION', 409);
  const content = composeTruthOnlyContent(truth, scope.marketplace);
  const validated = await validateCanonicalDraft(db, scope, projectId, selectedTruthRevisionId, content);
  return Object.freeze({ ...validated, degraded: true, provider: 'DETERMINISTIC_TRUTH_ONLY' });
}

async function composeCommerceDraft(db, scope, projectId, selectedIntelligenceSnapshotId) {
  const intelligence = await getIntelligenceSnapshot(db, scope, projectId, selectedIntelligenceSnapshotId);
  const validated = await validateCanonicalDraft(db, scope, projectId, intelligence.product_truth_revision_id,
    intelligence.output?.listingDraft, intelligence.id);
  return Object.freeze({ ...validated, intelligence, degraded: false, provider: 'PERSISTED_COMMERCE_INTELLIGENCE' });
}

async function assertCanonicalDependenciesCurrent(db, scope, projectId, dependencies) {
  const selectedId = Number(dependencies?.productTruthRevisionId);
  const selectedHash = String(dependencies?.productTruthHash || '');
  const row = await get(db, `SELECT r.id,r.content_hash,r.snapshot_json,p.head_research_snapshot_id,p.head_intelligence_snapshot_id
    FROM research_projects p
    JOIN product_truth_revisions r ON r.id=p.head_product_truth_revision_id AND r.project_id=p.id
    WHERE p.id=? AND p.tenant_id=? AND p.workspace_id=? AND p.marketplace=?
      AND r.tenant_id=p.tenant_id AND r.workspace_id=p.workspace_id AND r.marketplace=p.marketplace`,
  [projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
  if (!row || row.id !== selectedId || row.content_hash !== selectedHash) {
    throw new CanonicalDraftError('STALE_PRODUCT_TRUTH_REVISION', 409);
  }
  if (hashBytes(row.snapshot_json) !== row.content_hash) {
    throw new CanonicalDraftError('REVISION_INTEGRITY_FAILURE', 500);
  }
  if (dependencies?.intelligenceSnapshotId != null || dependencies?.researchSnapshotId != null) {
    if (Number(dependencies.researchSnapshotId) !== row.head_research_snapshot_id
      || Number(dependencies.intelligenceSnapshotId) !== row.head_intelligence_snapshot_id) {
      throw new CanonicalDraftError('STALE_INTELLIGENCE_SNAPSHOT', 409);
    }
    const intelligence = await getIntelligenceSnapshot(db, scope, projectId, dependencies.intelligenceSnapshotId);
    if (intelligence.snapshot_hash !== dependencies.intelligenceSnapshotHash
      || intelligence.research_snapshot_id !== Number(dependencies.researchSnapshotId)
      || intelligence.research_snapshot_hash !== dependencies.researchSnapshotHash
      || intelligence.product_truth_revision_id !== selectedId
      || intelligence.product_truth_hash !== selectedHash) {
      throw new CanonicalDraftError('STALE_INTELLIGENCE_SNAPSHOT', 409);
    }
    const artifact = await resolveCurrentMasterKeywordArtifact(db, scope, projectId, intelligence.configuration);
    if (Number(dependencies.masterKeywordArtifactId) !== artifact.id
      || dependencies.masterKeywordArtifactHash !== artifact.artifactHash) {
      throw new CanonicalDraftError('STALE_MASTER_KEYWORD_ARTIFACT', 409);
    }
  }
  const project = await projectPolicyContext(db, scope, projectId);
  const policyContext = serverPolicyContext(project, scope);
  let currentResolution;
  try { currentResolution = policyRegistryForContext(policyContext).resolve(policyContext, { purpose: 'DRAFT' }); }
  catch (error) { throw new CanonicalDraftError(error.code || 'POLICY_CONTRACT_UNAVAILABLE', 409, error.details); }
  const currentContextHash = hashBytes(canonicalJson(stablePolicyContext(project, scope)));
  if (!dependencies?.policyContractId || !dependencies?.policyContractArtifactHash || !dependencies?.policyContextHash
    || dependencies.policyContractId !== currentResolution.policyContractId
    || dependencies.policyContractArtifactHash !== currentResolution.policyContractArtifactHash
    || dependencies.policyContextHash !== currentContextHash
    || dependencies.policyLifecycleSnapshotDigest !== currentResolution.lifecycleSnapshotDigest
    || dependencies.claimIpBindingHash !== claimIpBindingHash || dependencies.validatorHash !== validatorHash
    || dependencies.locale !== project.locale || dependencies.productFamilyVersion !== project.product_family_version) {
    throw new CanonicalDraftError('STALE_POLICY_OR_VALIDATOR_BINDING', 409);
  }
}

module.exports = Object.freeze({
  CanonicalDraftError,
  assertCanonicalDependenciesCurrent,
  composeCommerceDraft,
  composeTruthOnlyDraft,
  describePolicyCapability,
  projectPolicyContext,
  lifecycleCapability,
  validateCanonicalDraft
});
