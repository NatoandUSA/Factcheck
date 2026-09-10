'use strict';

// Opt-in local UAT. This script is intentionally absent from CI because its
// inputs are operator-supplied exports that must never be committed.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

process.env.NODE_ENV = 'test';
process.env.OMNI_MASTER_KEY ||= Buffer.alloc(32, 82).toString('base64');

const { app, db, databaseReady } = require('../../server/server');
const { createSessionRecord } = require('../../server/security/session');

function argumentsByName(argv) {
  const result = { etsy: [] };
  for (let index = 0; index < argv.length; index++) {
    const name = argv[index]; const value = argv[index + 1];
    if (!name.startsWith('--') || !value || value.startsWith('--')) throw new Error(`INVALID_ARGUMENT:${name}`);
    if (name === '--etsy') result.etsy.push(path.resolve(value));
    else result[name.slice(2)] = path.resolve(value);
    index++;
  }
  if (!result.cerebro || !result.xray || result.etsy.length === 0) {
    throw new Error('USAGE: --cerebro FILE --xray FILE --etsy FILE [--etsy FILE ...]');
  }
  return result;
}

const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params,
  (error, row) => error ? reject(error) : resolve(row || null)));

async function sessionFor(marketplace) {
  const member = await get(`SELECT u.id AS userId,w.id AS workspaceId,w.tenant_id AS tenantId,w.marketplace
    FROM users u JOIN workspace_memberships m ON m.user_id=u.id JOIN workspaces w ON w.id=m.workspace_id
    WHERE u.email='seller@omniseller.local' AND m.role='SELLER' AND w.marketplace=? LIMIT 1`, [marketplace]);
  assert.equal(member?.marketplace, marketplace, `Seller fixture missing ${marketplace} membership`);
  const session = await new Promise((resolve, reject) => createSessionRecord(db, member.userId, member.workspaceId,
    member.tenantId, (error, value) => error ? reject(error) : resolve(value)));
  return { member, session };
}

async function main() {
  const input = argumentsByName(process.argv.slice(2));
  for (const file of [input.cerebro, input.xray, ...input.etsy]) assert.ok(fs.statSync(file).isFile(), `FILE_REQUIRED:${file}`);
  await databaseReady;
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`; process.env.ALLOWED_ORIGINS = origin;

  async function client(marketplace) {
    const { session } = await sessionFor(marketplace);
    const headers = { Cookie: `omni_session=${session.rawToken}`, Origin: origin };
    const json = async (route, method = 'GET', body) => {
      const response = await fetch(`${origin}${route}`, { method, headers: { ...headers, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(`${marketplace}:${route}:${response.status}:${JSON.stringify(payload)}`);
      return payload;
    };
    const upload = async (projectId, kind, file) => {
      const form = new FormData(); form.append('kind', kind); form.append('idempotencyKey', crypto.randomUUID());
      const bytes = fs.readFileSync(file); form.append('researchFile', new Blob([bytes]), path.basename(file));
      const previewForm = new FormData(); previewForm.append('kind', kind);
      previewForm.append('researchFile', new Blob([bytes]), path.basename(file));
      const previewResponse = await fetch(`${origin}/api/projects/${projectId}/research-imports/preview`,
        { method: 'POST', headers, body: previewForm });
      const preview = await previewResponse.json();
      assert.equal(previewResponse.status, 200, JSON.stringify(preview)); assert.equal(preview.zeroWrite, true);
      const response = await fetch(`${origin}/api/projects/${projectId}/research-imports`,
        { method: 'POST', headers, body: form });
      const committed = await response.json(); assert.equal(response.status, 201, JSON.stringify(committed));
      assert.equal(committed.rawHash, crypto.createHash('sha256').update(bytes).digest('hex'));
      return { id: committed.researchImportId, rawHash: committed.rawHash, bytes: bytes.length, preview: preview.accounting };
    };
    return { json, upload };
  }

  async function runMarketplace(marketplace, files) {
    const api = await client(marketplace); const amazon = marketplace === 'AMAZON';
    const project = await api.json('/api/projects', 'POST', {
      name: `REAL INPUT UAT ${marketplace} ${Date.now()}`, seedPhrase: 'para mi hija', locale: 'es-US',
      mediaClass: 'NON_MEDIA', productTypeId: 'CUSTOM_NECKLACE', categoryId: 'JEWELRY_NECKLACE',
      productFamilyVersion: 'custom-necklace-v1'
    });
    const imports = [];
    for (const file of files) imports.push(await api.upload(project.projectId,
      amazon ? (file === input.cerebro ? 'AMAZON_CEREBRO' : 'AMAZON_XRAY') : 'ETSY_SEARCH', file));
    const research = await api.json(`/api/projects/${project.projectId}/research-snapshots`, 'POST', {
      expectedHeadResearchSnapshotId: null, importIds: imports.map(item => item.id), idempotencyKey: crypto.randomUUID(),
      changeReason: 'REAL_INPUT_UAT_CONFIRMED'
    });
    const asserted = (value, basis = 'OTHER') => ({ disposition: 'ASSERTED', value, basis });
    const truth = await api.json(`/api/projects/${project.projectId}/product-truth/revisions`, 'POST', {
      expectedHeadRevisionId: null, idempotencyKey: crypto.randomUUID(), changeReason: 'REAL_INPUT_UAT_MINIMUM_TRUTH',
      facts: { productName: asserted('Collar personalizado para mi hija', 'SUPPLIER_SPEC'),
        productType: asserted('Collar personalizado', 'SUPPLIER_SPEC'), category: asserted('Joyeria'),
        personalization: asserted('Collar personalizado', 'PRODUCTION_WORKFLOW'), recipient: asserted('Hija'),
        language: asserted('Espanol') }
    });
    const intelligencePreview = await api.json(`/api/projects/${project.projectId}/intelligence-snapshots/preview`, 'POST', {
      researchSnapshotId: research.researchSnapshotId, productTruthRevisionId: truth.productTruthRevisionId,
      listingLanguage: 'AUTO'
    });
    assert.equal(intelligencePreview.zeroWrite, true);
    const intelligence = await api.json(`/api/projects/${project.projectId}/intelligence-snapshots`, 'POST', {
      expectedHeadIntelligenceSnapshotId: null, researchSnapshotId: research.researchSnapshotId,
      productTruthRevisionId: truth.productTruthRevisionId, listingLanguage: 'AUTO', idempotencyKey: crypto.randomUUID(),
      changeReason: 'REAL_INPUT_UAT_INTELLIGENCE_LOCK'
    });
    assert.equal(intelligence.output.language, 'ES', `${marketplace}:AUTO_LANGUAGE_MUST_FOLLOW_SPANISH_SEED`);
    const listingPreview = await api.json(`/api/projects/${project.projectId}/listings/commerce-preview`, 'POST', {
      intelligenceSnapshotId: intelligence.intelligenceSnapshotId
    });
    assert.equal(listingPreview.zeroWrite, true);
    const listing = await api.json(`/api/projects/${project.projectId}/listings`, 'POST', {
      idempotencyKey: crypto.randomUUID(), changeReason: 'REAL_INPUT_UAT_SAVE_NEEDS_QA',
      productTruthRevisionId: truth.productTruthRevisionId, intelligenceSnapshotId: intelligence.intelligenceSnapshotId,
      content: listingPreview.content
    });
    assert.equal(listing.status, 'NEEDS_QA');
    const draft = intelligence.output.listingDraft;
    if (amazon) {
      assert.ok(Array.from(draft.amazonTitle).length <= 75); assert.ok(Buffer.byteLength(draft.amazonSearchTerms) <= 249);
      assert.equal(intelligence.accounting.unallocatedCount, 0);
    } else {
      assert.ok(Array.from(draft.etsyTitle).length <= 140); assert.equal(draft.etsyTags.length, 13);
      assert.ok(draft.etsyTags.every(tag => Array.from(tag).length <= 20));
      assert.equal(intelligence.accounting.corpusAccountingGap, 0);
    }
    return { marketplace, projectId: project.projectId, imports, researchSnapshotId: research.researchSnapshotId,
      researchSnapshotHash: research.researchSnapshotHash, intelligenceSnapshotId: intelligence.intelligenceSnapshotId,
      intelligenceSnapshotHash: intelligence.intelligenceSnapshotHash, listingId: listing.listingId,
      listingRevisionId: listing.revisionId, status: listing.status, accounting: intelligence.accounting,
      title: amazon ? draft.amazonTitle : draft.etsyTitle,
      tags: amazon ? undefined : draft.etsyTags, imagePrompts: draft.imagePrompts,
      policy: { contractId: listingPreview.dependencies.policyContractId,
        approvalEligible: listingPreview.policy?.policyContractApprovalEligible ?? false,
        blockers: listingPreview.guardAccounting?.approvalBlockers || [] } };
  }

  try {
    const amazon = await runMarketplace('AMAZON', [input.cerebro, input.xray]);
    const etsy = await runMarketplace('ETSY', input.etsy);
    process.stdout.write(`${JSON.stringify({ result: 'PASS', amazon, etsy }, null, 2)}\n`);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => db.close(() => resolve()));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
