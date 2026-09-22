'use strict';

class CanonicalProjectError extends Error {
  constructor(code, status = 400, details = {}) {
    super(code);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const run = (db, sql, params = []) => new Promise((resolve, reject) =>
  db.run(sql, params, function done(error) {
    if (error) return reject(error);
    resolve({ changes: this.changes, lastID: this.lastID });
  }));

function normalizedPolicyContext(policyContext) {
  if (policyContext == null) return null;
  const fields = ['locale', 'mediaClass', 'productTypeId', 'categoryId', 'productFamilyVersion'];
  const values = fields.map(field => policyContext[field]);
  if (values.some(value => typeof value !== 'string' || !value.trim())) {
    throw new CanonicalProjectError('INCOMPLETE_PROJECT_POLICY_CONTEXT', 400);
  }
  return Object.freeze({
    locale: policyContext.locale.trim(),
    mediaClass: policyContext.mediaClass.trim().toUpperCase(),
    productTypeId: policyContext.productTypeId.trim(),
    categoryId: policyContext.categoryId.trim(),
    productFamilyVersion: policyContext.productFamilyVersion.trim()
  });
}

async function createCanonicalResearchProject(db, scope, input) {
  const workspaceId = Number(scope?.workspaceId);
  const actorId = Number(scope?.actorId);
  const marketplace = String(scope?.marketplace || '').trim().toUpperCase();
  const tenantId = String(scope?.tenantId || '').trim();
  if (!tenantId || !Number.isInteger(workspaceId) || workspaceId < 1
      || !['AMAZON', 'ETSY'].includes(marketplace) || !Number.isInteger(actorId) || actorId < 1) {
    throw new CanonicalProjectError('PROJECT_SCOPE_INVALID', 400);
  }

  const name = String(input?.name || '').trim();
  const seedPhrase = String(input?.seedPhrase || '').trim();
  if (!name || !seedPhrase) {
    throw new CanonicalProjectError('MISSING_FIELDS', 400,
      { message: 'Project name and seedPhrase are required.' });
  }

  const referenceAsin = input?.referenceAsin ? String(input.referenceAsin).trim() : null;
  const policyContext = normalizedPolicyContext(input?.policyContext ?? null);

  let workspace;
  try {
    workspace = await run(db, `UPDATE workspaces
      SET seller_account_label=COALESCE(seller_account_label,'workspace:' || id),
          site=COALESCE(site,'US')
      WHERE id=? AND tenant_id=? AND marketplace=?`,
    [workspaceId, tenantId, marketplace]);
  } catch (error) {
    throw new CanonicalProjectError('WORKSPACE_POLICY_CONTEXT_FAILED', 500);
  }
  if (workspace.changes !== 1) {
    throw new CanonicalProjectError('WORKSPACE_NOT_FOUND', 404);
  }

  const result = await run(db, `INSERT INTO research_projects
    (tenant_id, workspace_id, marketplace, name, seed_phrase, state, reference_asin, actor_id,
     locale, media_class, product_type_id, category_id, product_family_version)
    VALUES (?, ?, ?, ?, ?, 'EVIDENCE_INTAKE', ?, ?, ?, ?, ?, ?, ?)`,
  [
    tenantId,
    workspaceId,
    marketplace,
    name,
    seedPhrase,
    referenceAsin,
    actorId,
    policyContext?.locale ?? null,
    policyContext?.mediaClass ?? null,
    policyContext?.productTypeId ?? null,
    policyContext?.categoryId ?? null,
    policyContext?.productFamilyVersion ?? null
  ]);

  return Object.freeze({
    projectId: result.lastID,
    state: 'EVIDENCE_INTAKE',
    marketplace,
    policyContextState: policyContext ? 'COMPLETE' : 'INCOMPLETE'
  });
}

module.exports = Object.freeze({
  CanonicalProjectError,
  createCanonicalResearchProject
});
