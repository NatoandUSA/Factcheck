'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { PolicyContractRegistry, createServerPolicyContext } = require('./policy/contractRegistry');
const { bindingOf, validatePolicySurfaces } = require('./policy/enforce');
const { canonicalJson, hashBytes } = require('./revisionStore');
const { currentProductTruthRevision } = require('./productTruthStore');
const { evaluateListingGuard } = require('./listingGuard');
const ipGuard = require('./ipGuard');

const fixtureDir = path.resolve(__dirname, '../contracts/omniseller-r3/v1/policy-fixtures');
const draftPolicyRegistry = PolicyContractRegistry.fromDirectory(fixtureDir, {
  lifecycleSnapshot: { completeThrough: '2026-09-09T00:00:00.000Z', events: [] }
});
const validatorFiles = [
  path.resolve(__dirname, 'listingGuard.js'),
  path.resolve(__dirname, 'claimGuard/index.js'),
  path.resolve(__dirname, 'claimGuard/ipMatcher.js'),
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
const ETSY_FIELDS = new Set([...COMMON_FIELDS, 'etsyTitle', 'etsyTags', 'etsyDescription']);

function exactContent(content, marketplace) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) throw new CanonicalDraftError('INVALID_LISTING_PAYLOAD');
  const allowed = marketplace === 'AMAZON' ? AMAZON_FIELDS : ETSY_FIELDS;
  const unexpected = Object.keys(content).find(key => !allowed.has(key));
  if (unexpected) throw new CanonicalDraftError('UNEXPECTED_LISTING_FIELD', 400, { field: unexpected });
  return content;
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
    ['Material', facts.materials || facts.composition], ['Size', facts.sizes || facts.dimensions],
    ['Personalization', facts.personalization], ['Included', facts.includedItems],
    ['Format', facts.fileFormat], ['Players', facts.playerCount], ['Age', facts.minimumAge], ['Duration', facts.duration]
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
  const row = await get(db, `SELECT p.*,w.seller_account_label,w.site FROM research_projects p
    JOIN workspaces w ON w.id=p.workspace_id AND w.tenant_id=p.tenant_id AND w.marketplace=p.marketplace
    WHERE p.id=? AND p.tenant_id=? AND p.workspace_id=? AND p.marketplace=?`,
  [projectId, scope.tenantId, scope.workspaceId, scope.marketplace]);
  if (!row) throw new CanonicalDraftError('PROJECT_NOT_FOUND', 404);
  const missing = ['locale', 'media_class', 'product_type_id', 'category_id', 'product_family_version',
    'seller_account_label', 'site'].filter(key => !String(row[key] || '').trim());
  if (missing.length) throw new CanonicalDraftError('PROJECT_POLICY_CONTEXT_INCOMPLETE', 409, { missing });
  return row;
}

function policySurfaces(listing, marketplace) {
  return marketplace === 'AMAZON' ? {
    title: listing.amazonTitle,
    itemHighlights: listing.itemHighlights,
    bullets: listing.amazonBullets,
    genericKeywords: listing.amazonSearchTerms
  } : { title: listing.etsyTitle, tags: listing.etsyTags };
}

async function validateCanonicalDraft(db, scope, projectId, selectedTruthRevisionId, rawContent) {
  const project = await projectPolicyContext(db, scope, projectId);
  const truth = await currentProductTruthRevision(db, scope, projectId);
  if (Number(selectedTruthRevisionId) !== truth.id) throw new CanonicalDraftError('STALE_PRODUCT_TRUTH_REVISION', 409);
  const listing = exactContent(rawContent, scope.marketplace);
  let guarded;
  try { guarded = evaluateListingGuard({ listing, verifiedFacts: factsFromSnapshot(truth.snapshot) }); }
  catch (error) { throw new CanonicalDraftError(error.code || 'LISTING_GUARD_UNAVAILABLE', error.code === 'UNVERIFIED_OUTPUT_CLAIM' ? 422 : 503, error.details); }
  let ip;
  try { ip = ipGuard.screenListing(guarded.listing); }
  catch (_) { throw new CanonicalDraftError('IP_GUARD_UNAVAILABLE', 503); }
  if (ip.verdict === 'BLOCK') throw new CanonicalDraftError('IP_CLEARANCE_REQUIRED', 409, { ipHits: ip.hits });
  const policyContext = createServerPolicyContext({
    tenantId: scope.tenantId, workspaceId: String(scope.workspaceId), sellerAccountId: project.seller_account_label,
    marketplace: scope.marketplace, site: project.site, locale: project.locale, mediaClass: project.media_class,
    productTypeId: project.product_type_id, categoryId: project.category_id, effectiveAt: new Date().toISOString()
  });
  let resolution;
  let policy;
  try {
    resolution = draftPolicyRegistry.resolve(policyContext, { purpose: 'DRAFT' });
    policy = validatePolicySurfaces(policySurfaces(guarded.listing, scope.marketplace), resolution);
  } catch (error) {
    throw new CanonicalDraftError(error.code || 'POLICY_CONTRACT_UNAVAILABLE', 409, error.details);
  }
  if (!policy.policyCompliant) throw new CanonicalDraftError('POLICY_VALIDATION_FAILED', 422, { violations: policy.policyViolations });
  const policyBinding = bindingOf(resolution);
  return Object.freeze({
    content: guarded.listing,
    truth,
    policy,
    dependencies: Object.freeze({
      productTruthRevisionId: truth.id,
      productTruthHash: truth.content_hash,
      researchSnapshotId: null,
      researchSnapshotHash: null,
      intelligenceSnapshotId: null,
      intelligenceSnapshotHash: null,
      policyBindingHash: hashBytes(canonicalJson(policyBinding)),
      claimIpBindingHash,
      validatorHash,
      locale: project.locale,
      productFamilyVersion: project.product_family_version
    }),
    guardAccounting: Object.freeze({ backendExcluded: guarded.backendExcluded, ppcFlagged: guarded.ppcFlagged,
      ipVerdict: ip.verdict, policyQualityGaps: policy.qualityGaps,
      approvalBlockers: policy.policyApprovalBlockers })
  });
}

async function composeTruthOnlyDraft(db, scope, projectId, selectedTruthRevisionId) {
  const truth = await currentProductTruthRevision(db, scope, projectId);
  if (Number(selectedTruthRevisionId) !== truth.id) throw new CanonicalDraftError('STALE_PRODUCT_TRUTH_REVISION', 409);
  const content = composeTruthOnlyContent(truth, scope.marketplace);
  const validated = await validateCanonicalDraft(db, scope, projectId, selectedTruthRevisionId, content);
  return Object.freeze({ ...validated, degraded: true, provider: 'DETERMINISTIC_TRUTH_ONLY' });
}

module.exports = Object.freeze({ CanonicalDraftError, composeTruthOnlyDraft, validateCanonicalDraft });
