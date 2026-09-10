'use strict';
process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const ExcelJS = require('exceljs');
const { FACT_KEYS } = require('../server/productTruthAttestation');
const { parseProductTruthWorkbook } = require('../server/productTruthWorkbookParser');

async function tick(window) {
  await new Promise(resolve => window.setTimeout(resolve, 0));
}

(async () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'product-truth-staff.html'), 'utf8');
  const calls = [];
  let excelPreviewResponse = null;
  const response = body => ({ ok: true, status: 200, json: async () => body });
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'http://omniseller.local/product-truth-staff.html',
    beforeParse(window) {
      Object.defineProperty(window.crypto, 'randomUUID', {
        configurable: true,
        value: () => '10000000-0000-4000-8000-000000000001'
      });
      window.fetch = async (url, options = {}) => {
        calls.push({ url: String(url), options });
        if (url === '/api/projects') return response({ projects: [
          { id: 17, name: 'AMAZON Hija browser', seed_phrase: 'para mi hija', marketplace: 'AMAZON', state: 'EVIDENCE_INTAKE' }
        ] });
        if (String(url).endsWith('/commerce-state')) return response({ heads: { productTruthRevisionId: 41 } });
        if (String(url).endsWith('/product-truth-imports/preview')) return response(excelPreviewResponse);
        if (String(url).endsWith('/product-truth/revisions')) return response({
          productTruthRevisionId: 42,
          confirmationState: 'STAFF_DRAFT'
        });
        throw new Error(`Unexpected fetch: ${url}`);
      };
    }
  });
  const { document, Event } = dom.window;
  let measured = 0;
  const check = (condition, message) => { measured += 1; assert.ok(condition, message); };

  await tick(dom.window);
  await tick(dom.window);
  check(document.documentElement.lang === 'vi', 'form must be Vietnamese');
  check(document.querySelectorAll('#factRows tr').length === 56, 'form must expose every canonical Product Truth fact');
  const formKeys = new Set([...document.querySelectorAll('#factRows tr')].map(row => row.dataset.key));
  check(formKeys.size === FACT_KEYS.size && [...FACT_KEYS].every(key => formKeys.has(key)),
    'HTML keys must exactly match the server canonical Product Truth registry');
  check(document.body.textContent.includes('STAFF_DRAFT'), 'form must disclose its non-manager state');
  check(!document.body.textContent.includes('Xác nhận Manager'), 'staff form must not expose Manager confirmation');

  const project = document.getElementById('project');
  project.value = '17';
  project.dispatchEvent(new Event('change', { bubbles: true }));
  await tick(dom.window);
  check(document.getElementById('message').textContent.includes('41'), 'form must load the current Product Truth head');

  document.getElementById('productCode').value = 'HIJA-NECKLACE-001';
  document.getElementById('staffName').value = 'Staff QA';
  const setAsserted = (key, value, basisNote) => {
    const row = document.querySelector(`[data-key="${key}"]`);
    row.querySelector('[data-role="mode"]').value = 'ASSERTED';
    row.querySelector('[data-role="value"]').value = value;
    row.querySelector('[data-role="basis"]').value = 'SUPPLIER_SPEC';
    row.querySelector('[data-role="basisNote"]').value = basisNote;
  };
  setAsserted('productName', 'Para Mi Hija Custom Necklace', 'Supplier sheet HJ-001');
  setAsserted('productType', 'Custom necklace', 'Supplier sheet HJ-001');
  const materialRow = document.querySelector('[data-key="materials"]');
  materialRow.querySelector('[data-role="mode"]').value = 'UNKNOWN';
  materialRow.querySelector('[data-role="reason"]').value = 'Đang chờ nhà cung cấp xác nhận';
  materialRow.querySelector('[data-role="mode"]').dispatchEvent(new Event('change', { bubbles: true }));

  document.getElementById('submitApi').click();
  await tick(dom.window);
  await tick(dom.window);
  const submit = calls.find(call => call.url === '/api/projects/17/product-truth/revisions');
  check(Boolean(submit), 'form must submit to the canonical project-scoped Product Truth route');
  const body = JSON.parse(submit.options.body);
  check(body.expectedHeadRevisionId === 41, 'submission must use optimistic head binding');
  check(body.facts.productName.value === 'Para Mi Hija Custom Necklace', 'asserted value must be preserved');
  check(body.facts.materials.disposition === 'UNKNOWN' && body.facts.materials.reason.includes('nhà cung cấp'),
    'unknown facts must remain explicit instead of being guessed');
  check(!('confirmationState' in body) && !('approved' in body), 'staff payload must not claim Manager authority');
  check(document.getElementById('message').textContent.includes('revision #42')
    && document.getElementById('message').textContent.includes('STAFF_DRAFT'), 'saved revision receipt must be visible');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path.join(__dirname, '..', 'public', 'templates', 'OMNISELLER_PRODUCT_TRUTH_STAFF_TEMPLATE_VI.xlsx'));
  check(['Sản phẩm', 'Sự thật', 'Hướng dẫn'].every(name => workbook.getWorksheet(name)),
    'Excel template must contain the three Vietnamese workflow sheets');
  const factSheet = workbook.getWorksheet('Sự thật');
  const excelKeys = new Set();
  for (let row = 3; row <= factSheet.rowCount; row += 1) {
    const key = String(factSheet.getCell(`B${row}`).value || '').trim();
    if (key) excelKeys.add(key);
  }
  check(excelKeys.size === FACT_KEYS.size && [...FACT_KEYS].every(key => excelKeys.has(key)),
    'Excel keys must exactly match the server canonical Product Truth registry');
  check(Boolean(factSheet.getCell('D3').dataValidation?.formulae), 'Excel fact status must use a dropdown validation');
  check(Boolean(workbook.getWorksheet('Sản phẩm').getCell('L3').value?.formula)
    && Boolean(workbook.getWorksheet('Sản phẩm').getCell('M3').value?.formula),
  'Excel minimum checks must remain formula-driven');

  factSheet.getCell('E3').value = 'Para Mi Hija Custom Necklace';
  factSheet.getCell('E4').value = 'Custom necklace';
  factSheet.getCell('D6').value = 'CHƯA RÕ';
  factSheet.getCell('H6').value = 'Đang chờ nhà cung cấp xác nhận';
  factSheet.getCell('I6').value = 'Supplier ticket 925';
  const validBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const preview = await parseProductTruthWorkbook(validBuffer);
  check(preview.zeroWrite === true && preview.selectedProductCode === 'PRODUCT-001',
    'Excel preview must remain zero-write and bind one product code');
  check(preview.facts.productName.value === 'Para Mi Hija Custom Necklace'
    && preview.facts.materials.disposition === 'UNKNOWN', 'Excel rows must normalize into canonical asserted and unknown facts');
  check(preview.facts.materials.reason.includes('Supplier ticket 925'),
    'reference columns must be preserved in the canonical preview');
  check(preview.accounting.selectedRowCount === FACT_KEYS.size && preview.accounting.missingCanonicalFactCount === 0,
    'Excel preview accounting must cover the entire canonical fact registry');
  excelPreviewResponse = { success: true, fileName: 'product-truth.xlsx', ...preview };
  document.getElementById('productCode').value = '';
  const excelInput = document.getElementById('excelFile');
  Object.defineProperty(excelInput, 'files', { configurable: true, value: [
    new dom.window.File([validBuffer], 'product-truth.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  ] });
  excelInput.dispatchEvent(new Event('change', { bubbles: true }));
  await tick(dom.window);
  await tick(dom.window);
  check(calls.some(call => call.url === '/api/projects/17/product-truth-imports/preview'),
    'HTML must send Excel to the authenticated project-scoped preview route');
  check(document.getElementById('message').textContent.includes('Preview zero-write')
    && document.getElementById('productCode').value === 'PRODUCT-001', 'Excel preview must populate the form for staff review');

  const formulaWorkbook = new ExcelJS.Workbook();
  await formulaWorkbook.xlsx.load(validBuffer);
  formulaWorkbook.getWorksheet('Sự thật').getCell('E3').value = { formula: '="Invented 18k gold"', result: 'Invented 18k gold' };
  await assert.rejects(parseProductTruthWorkbook(Buffer.from(await formulaWorkbook.xlsx.writeBuffer())),
    error => error?.code === 'PRODUCT_TRUTH_FORMULA_FORBIDDEN');
  measured += 1;

  const multiWorkbook = new ExcelJS.Workbook();
  await multiWorkbook.xlsx.load(validBuffer);
  multiWorkbook.getWorksheet('Sự thật').getCell('A5').value = 'PRODUCT-002';
  await assert.rejects(parseProductTruthWorkbook(Buffer.from(await multiWorkbook.xlsx.writeBuffer())),
    error => error?.code === 'PRODUCT_TRUTH_PRODUCT_CODE_REQUIRED' && error.details.productCodes.length === 2);
  measured += 1;

  dom.window.close();
  console.log(`Product Truth staff form: ${measured}/${measured} PASS`);
})().catch(error => { console.error(error); process.exit(1); });
