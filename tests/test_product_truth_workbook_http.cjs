'use strict';
process.env.NODE_ENV = 'test';
process.env.OMNI_MASTER_KEY ||= Buffer.alloc(32, 93).toString('base64');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { app, db, databaseReady } = require('../server/server');
const { createSessionRecord } = require('../server/security/session');

const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params,
  (error, row) => error ? reject(error) : resolve(row || null)));
let server;

(async () => {
  await databaseReady;
  const seller = await get(`SELECT u.id AS userId,w.id AS workspaceId,w.tenant_id AS tenantId,w.marketplace
    FROM users u JOIN workspace_memberships m ON m.user_id=u.id JOIN workspaces w ON w.id=m.workspace_id
    WHERE u.email='seller@omniseller.local' AND m.role='SELLER' AND w.marketplace='AMAZON' LIMIT 1`);
  assert(seller);
  const session = await new Promise((resolve, reject) => createSessionRecord(db, seller.userId, seller.workspaceId,
    seller.tenantId, (error, value) => error ? reject(error) : resolve(value)));
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  process.env.ALLOWED_ORIGINS = origin;
  const jsonHeaders = { Cookie: `omni_session=${session.rawToken}`, Origin: origin, 'Content-Type': 'application/json' };
  const create = await fetch(`${origin}/api/projects`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({
    name: `Workbook Preview ${Date.now()}`, seedPhrase: 'product truth workbook', locale: 'en-US', mediaClass: 'NON_MEDIA',
    productTypeId: 'CUSTOM_PRODUCT', categoryId: 'CUSTOM', productFamilyVersion: 'custom-v1'
  }) });
  const project = await create.json();
  assert.equal(create.status, 200, JSON.stringify(project));

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path.join(__dirname, '..', 'public', 'templates', 'OMNISELLER_PRODUCT_TRUTH_STAFF_TEMPLATE_VI.xlsx'));
  const facts = workbook.getWorksheet('Sự thật');
  facts.getCell('E3').value = 'Workbook Test Product';
  facts.getCell('E4').value = 'Custom product';
  facts.getCell('D6').value = 'CHƯA RÕ';
  facts.getCell('H6').value = 'Supplier confirmation pending';
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
  const before = (await get('SELECT COUNT(*) AS n FROM product_truth_revisions')).n;

  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'truth.xlsx');
  const response = await fetch(`${origin}/api/projects/${project.projectId}/product-truth-imports/preview`, {
    method: 'POST', headers: { Cookie: `omni_session=${session.rawToken}`, Origin: origin }, body: form
  });
  const preview = await response.json();
  assert.equal(response.status, 200, JSON.stringify(preview));
  assert.equal(preview.zeroWrite, true);
  assert.equal(preview.facts.productName.value, 'Workbook Test Product');
  assert.equal(preview.facts.materials.disposition, 'UNKNOWN');
  assert.equal(preview.accounting.selectedRowCount, 56);
  assert.match(preview.rawHash, /^[0-9a-f]{64}$/);
  assert.equal((await get('SELECT COUNT(*) AS n FROM product_truth_revisions')).n, before,
    'preview must not create a Product Truth revision');

  const listingHtml = `<!doctype html><html><body>
    <span id="productTitle">Para Mi Hija Custom Necklace</span>
    <div id="feature-bullets"><ul><li><span class="a-list-item">Personalized message card included</span></li></ul></div>
    <table><tr><th>Material</th><td>Stainless steel, 14k gold plating</td></tr><tr><th>Item dimensions</th><td>45 cm + 5 cm extension</td></tr></table>
    <div id="productDescription">A custom gift necklace for daughter.</div>
  </body></html>`;
  const listingForm = new FormData();
  listingForm.append('file', new Blob([listingHtml], { type: 'text/html' }), 'amazon-listing.html');
  listingForm.append('source', 'B0ABC12345');
  listingForm.append('confirmSameSource', 'true');
  const listingResponse = await fetch(`${origin}/api/projects/${project.projectId}/product-truth-listing/preview`, {
    method: 'POST', headers: { Cookie: `omni_session=${session.rawToken}`, Origin: origin }, body: listingForm
  });
  const listingPreview = await listingResponse.json();
  assert.equal(listingResponse.status, 200, JSON.stringify(listingPreview));
  assert.equal(listingPreview.zeroWrite, true);
  assert.equal(listingPreview.facts.productName.value, 'Para Mi Hija Custom Necklace');
  assert.equal(listingPreview.facts.materials.value, 'Stainless steel, 14k gold plating');
  assert.equal(listingPreview.facts.materials.basis, 'REFERENCE_LISTING_SAME_SOURCE');
  assert.equal(listingPreview.facts.sizes.value, '45 cm + 5 cm extension');
  assert.equal((await get('SELECT COUNT(*) AS n FROM product_truth_revisions')).n, before,
    'listing preview must not create a Product Truth revision');

  const unconfirmedListing = new FormData();
  unconfirmedListing.append('file', new Blob([listingHtml]), 'amazon-listing.html');
  const unconfirmedResponse = await fetch(`${origin}/api/projects/${project.projectId}/product-truth-listing/preview`, {
    method: 'POST', headers: { Cookie: `omni_session=${session.rawToken}`, Origin: origin }, body: unconfirmedListing
  });
  assert.equal(unconfirmedResponse.status, 400);

  const unauthenticated = new FormData();
  unauthenticated.append('file', new Blob([bytes]), 'truth.xlsx');
  const denied = await fetch(`${origin}/api/projects/${project.projectId}/product-truth-imports/preview`, {
    method: 'POST', headers: { Origin: origin }, body: unauthenticated
  });
  assert.equal(denied.status, 401);

  const wrongType = new FormData();
  wrongType.append('file', new Blob(['not a workbook']), 'truth.csv');
  const unsupported = await fetch(`${origin}/api/projects/${project.projectId}/product-truth-imports/preview`, {
    method: 'POST', headers: { Cookie: `omni_session=${session.rawToken}`, Origin: origin }, body: wrongType
  });
  assert.equal(unsupported.status, 415);

  console.log('Product Truth workbook/listing HTTP: 17/17 PASS');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (db?.open) await new Promise(resolve => db.close(resolve));
});
