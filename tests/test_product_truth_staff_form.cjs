'use strict';
process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const ExcelJS = require('exceljs');
const { FACT_KEYS } = require('../server/productTruthAttestation');

async function tick(window) {
  await new Promise(resolve => window.setTimeout(resolve, 0));
}

(async () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'product-truth-staff.html'), 'utf8');
  const calls = [];
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

  dom.window.close();
  console.log(`Product Truth staff form: ${measured}/${measured} PASS`);
})().catch(error => { console.error(error); process.exit(1); });
