'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');

process.env.NODE_ENV = 'test';
process.env.OMNI_R43_SINGLE_PATH = '1';
process.env.OMNI_MASTER_KEY ||= Buffer.alloc(32, 67).toString('base64');

const { app, db, databaseReady } = require('../server/server');
const { createSessionRecord } = require('../server/security/session');

const ROOT = path.resolve(__dirname, '..');
const XRAY = path.resolve(ROOT, '..', '..', 'Inputdata08092026', 'Xray_Hija.xlsx');
const CEREBRO = path.resolve(ROOT, '..', '..', 'Inputdata08092026', 'Cerebro_Hija.xlsx');
const ETSY_HTML = 'C:\\Users\\Admin\\Downloads\\etsy.html';
const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params,
  (error, row) => error ? reject(error) : resolve(row || null)));
const uuid = () => crypto.randomUUID();
let server; let passed = 0;
function check(value, message) { assert.ok(value, message); passed++; }

async function sessionFor(marketplace) {
  const row = await get(`SELECT u.id AS userId,w.id AS workspaceId,w.tenant_id AS tenantId,w.marketplace
    FROM users u JOIN workspace_memberships m ON m.user_id=u.id JOIN workspaces w ON w.id=m.workspace_id
    WHERE u.email='seller@omniseller.local' AND m.role='SELLER' AND w.marketplace=? LIMIT 1`, [marketplace]);
  assert.ok(row, `Missing SELLER ${marketplace} fixture`);
  const session = await new Promise((resolve, reject) => createSessionRecord(db, row.userId, row.workspaceId,
    row.tenantId, (error, value) => error ? reject(error) : resolve(value)));
  return { ...row, rawToken: session.rawToken };
}

async function main() {
  const xrayWorkbook = new ExcelJS.Workbook();
  xrayWorkbook.addWorksheet('Xray').addRows([
    ['Product Details', 'ASIN', 'Brand', 'Price $', 'ASIN Sales'],
    ['Para Mi Hija Necklace', 'B0ABC12345', 'Fixture One', 29.99, 400]
  ]);
  const cerebroWorkbook = new ExcelJS.Workbook();
  cerebroWorkbook.addWorksheet('Cerebro').addRows([
    ['Keyword Phrase', 'Search Volume', 'Keyword Sales', 'Position (Rank)'],
    ['para mi hija', 1200, 40, 3]
  ]);
  const xrayFile = fs.existsSync(XRAY)
    ? { name: path.basename(XRAY), bytes: fs.readFileSync(XRAY), real: true }
    : { name: 'ci-xray.xlsx', bytes: Buffer.from(await xrayWorkbook.xlsx.writeBuffer()), real: false };
  const cerebroFile = fs.existsSync(CEREBRO)
    ? { name: path.basename(CEREBRO), bytes: fs.readFileSync(CEREBRO), real: true }
    : { name: 'ci-cerebro.xlsx', bytes: Buffer.from(await cerebroWorkbook.xlsx.writeBuffer()), real: false };
  const etsyFile = fs.existsSync(ETSY_HTML)
    ? { name: path.basename(ETSY_HTML), bytes: fs.readFileSync(ETSY_HTML), real: true }
    : { name: 'ci-etsy.html', bytes: Buffer.from(`<!doctype html><html><script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Product', sku: '4533292901',
      name: 'Para Mi Hija Necklace', brand: { name: 'Fixture Shop' },
      url: 'https://www.etsy.com/listing/4533292901', offers: { price: '29.99', priceCurrency: 'USD' }
    })}</script></html>`), real: false };
  check(xrayFile.bytes.length > 0 && cerebroFile.bytes.length > 0 && etsyFile.bytes.length > 0,
    'Amazon Xray/Cerebro and Etsy HTML fixtures are available');
  await databaseReady;
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  process.env.ALLOWED_ORIGINS = origin;

  const amazon = await sessionFor('AMAZON');
  const requestFor = token => async (route, options = {}) => {
    const response = await fetch(`${origin}${route}`, {
      ...options, headers: { Cookie: `omni_session=${token}`, Origin: origin, ...(options.headers || {}) }
    });
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body };
  };
  const amazonRequest = requestFor(amazon.rawToken);
  const json = (request, route, method, body) => request(route, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const upload = async (request, route, kind, file, confirm = false) => {
    const form = new FormData();
    form.append('kind', kind);
    if (confirm) form.append('idempotencyKey', uuid());
    form.append('researchFile', new Blob([file.bytes]), file.name);
    return request(route, { method: 'POST', body: form });
  };

  const amazonProject = await json(amazonRequest, '/api/projects', 'POST', {
    name: `R43 W1 Hija ${Date.now()}`, seedPhrase: 'para mi hija', locale: 'es-US', mediaClass: 'NON_MEDIA',
    productTypeId: 'CUSTOM_NECKLACE', categoryId: 'JEWELRY_NECKLACE', productFamilyVersion: 'custom-necklace-v1'
  });
  check(amazonProject.status === 200, JSON.stringify(amazonProject.body));
  const amazonProjectId = amazonProject.body.projectId;
  const before = await get('SELECT COUNT(*) AS n FROM research_imports WHERE project_id=?', [amazonProjectId]);
  const xrayPreview = await upload(amazonRequest,
    `/api/projects/${amazonProjectId}/research-imports/preview`, 'AMAZON_XRAY', xrayFile);
  const cerebroPreview = await upload(amazonRequest,
    `/api/projects/${amazonProjectId}/research-imports/preview`, 'AMAZON_CEREBRO', cerebroFile);
  check(xrayPreview.status === 200 && xrayPreview.body.zeroWrite === true, JSON.stringify(xrayPreview.body));
  check(cerebroPreview.status === 200 && cerebroPreview.body.zeroWrite === true, JSON.stringify(cerebroPreview.body));
  check(xrayPreview.body.accounting.inputRows > 0 && xrayPreview.body.asinSelection.batches.length > 0,
    'real Xray produces accounted ASIN suggestions');
  check(cerebroPreview.body.accounting.cerebroObservationCount > 0,
    'real Cerebro produces accounted keyword observations');
  check((await get('SELECT COUNT(*) AS n FROM research_imports WHERE project_id=?', [amazonProjectId])).n === before.n,
    'two real previews are zero-write');

  const xrayImport = await upload(amazonRequest,
    `/api/projects/${amazonProjectId}/research-imports`, 'AMAZON_XRAY', xrayFile, true);
  const cerebroImport = await upload(amazonRequest,
    `/api/projects/${amazonProjectId}/research-imports`, 'AMAZON_CEREBRO', cerebroFile, true);
  check(xrayImport.status === 201 && cerebroImport.status === 201,
    `real imports failed: ${JSON.stringify({ xray: xrayImport.body, cerebro: cerebroImport.body })}`);
  check(xrayImport.body.rawHash === xrayPreview.body.rawHash && cerebroImport.body.rawHash === cerebroPreview.body.rawHash,
    'confirmed imports bind the exact previewed bytes');

  const state = await amazonRequest(`/api/projects/${amazonProjectId}/commerce-state`);
  check(state.status === 200 && state.body.imports.length === 2, JSON.stringify(state.body));
  check(state.body.imports.some(item => item.kind === 'AMAZON_XRAY')
    && state.body.imports.some(item => item.kind === 'AMAZON_CEREBRO'),
  'commerce state reopens both independently imported source types');

  const reopened = await sessionFor('AMAZON');
  const reopenedState = await requestFor(reopened.rawToken)(`/api/projects/${amazonProjectId}/commerce-state`);
  check(reopenedState.status === 200 && reopenedState.body.imports.length === 2,
    'fresh authenticated session reopens persisted project imports');

  const legacy = await amazonRequest('/api/research/smart-pull', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: amazonProjectId })
  });
  check(legacy.status === 410 && legacy.body.error === 'LEGACY_WRITE_ROUTE_RETIRED',
    'R4.3 runtime denies direct legacy Smart Pull writes');

  const etsy = await sessionFor('ETSY');
  const etsyRequest = requestFor(etsy.rawToken);
  const etsyProject = await json(etsyRequest, '/api/projects', 'POST', {
    name: `R43 W1 Etsy ${Date.now()}`, seedPhrase: 'para mi hija', locale: 'es-US', mediaClass: 'NON_MEDIA',
    productTypeId: 'CUSTOM_NECKLACE', categoryId: 'JEWELRY_NECKLACE', productFamilyVersion: 'custom-necklace-v1'
  });
  check(etsyProject.status === 200, JSON.stringify(etsyProject.body));
  const etsyPreview = await upload(etsyRequest,
    `/api/projects/${etsyProject.body.projectId}/research-imports/preview`, 'ETSY_SEARCH', etsyFile);
  check(etsyPreview.status === 200 && etsyPreview.body.zeroWrite === true, JSON.stringify(etsyPreview.body));
  check(etsyPreview.body.accounting.observationCount > 0, 'saved Etsy HTML is parsed into observations');
  const etsyImport = await upload(etsyRequest,
    `/api/projects/${etsyProject.body.projectId}/research-imports`, 'ETSY_SEARCH', etsyFile, true);
  check(etsyImport.status === 201 && etsyImport.body.rawHash === etsyPreview.body.rawHash,
    JSON.stringify(etsyImport.body));
  const etsyState = await etsyRequest(`/api/projects/${etsyProject.body.projectId}/commerce-state`);
  check(etsyState.status === 200 && etsyState.body.imports.some(item => item.id === etsyImport.body.researchImportId),
    'Etsy HTML import persists and reopens in canonical state');

  console.log(`R4.3 W1 single path: ${passed}/${passed} PASS`);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await new Promise(resolve => db.close(() => resolve()));
});
