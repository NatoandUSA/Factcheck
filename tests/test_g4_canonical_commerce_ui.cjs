'use strict';
process.env.NODE_ENV = 'test';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

(async () => {
  const { JSDOM } = require('jsdom');
  const { createServer } = await import('vite');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
  Object.assign(global, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, File: dom.window.File, Blob: dom.window.Blob,
    FormData: dom.window.FormData, TextEncoder });
  Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const React = (await import('react')).default;
  const { act } = React;
  const { createRoot } = await import('react-dom/client');
  const calls = [];
  const response = body => ({ ok: true, status: 200, json: async () => body });
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (url === '/api/auth/me') return response({ user: { userId: 7, role: 'SELLER' } });
    if (String(url).endsWith('/commerce-state')) return response({ success: true, heads: {
      productTruthRevisionId: null, researchSnapshotId: null, intelligenceSnapshotId: null
    }, imports: [], researchSnapshots: [], intelligenceSnapshots: [] });
    if (String(url).endsWith('/product-truth/revisions')) return response({ success: true, revisions: [] });
    if (String(url).endsWith('/listings')) return response({ success: true, listings: [] });
    if (String(url).endsWith('/research-imports/preview')) return response({ success: true, zeroWrite: true,
      fileName: 'Cerebro.xlsx', rawHash: 'a'.repeat(64), accounting: { sourceRowCount: 1099, unconsumedRowCount: 0 } });
    if (String(url).endsWith('/research-imports')) return response({ success: true, researchImportId: 12,
      accounting: { sourceRowCount: 1099, unconsumedRowCount: 0 } });
    throw new Error(`Unexpected fetch ${url}`);
  };

  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  const { default: Workflow } = await vite.ssrLoadModule('/src/components/CanonicalCommerceWorkflow.jsx');
  const { AuthProvider } = await vite.ssrLoadModule('/src/context/AuthContext.jsx');
  const root = createRoot(document.getElementById('root'));
  let measured = 0;
  const check = (value, message) => { measured += 1; assert.ok(value, message); };
  await act(async () => { root.render(React.createElement(AuthProvider, null,
    React.createElement(Workflow, { activeProject: { id: 3 }, marketplace: 'AMAZON' }))); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

  check(document.body.textContent.includes('Luồng Staff Canonical — AMAZON US'), 'Amazon workflow must render');
  check(document.body.textContent.includes('không tự đăng'), 'workflow must disclose its stop boundary');
  check(!document.body.textContent.includes('Manager xác nhận'), 'Seller must not receive Manager confirmation action');
  check(document.body.textContent.includes('Cerebro keywords') && document.body.textContent.includes('Xray competitors'), 'Amazon must accept both research kinds');
  check(document.body.textContent.includes('Preview zero-write'), 'research and intelligence previews must be visible');
  check(document.body.textContent.includes('Product Truth do Seller nhập và kiểm'), 'Seller Product Truth stage must be visible');
  check(document.body.textContent.includes('Theo keyword đầu vào'), 'AUTO listing language must be visible');
  check(document.body.textContent.includes('Luồng dừng ở NEEDS_QA'), 'workflow must stop at NEEDS_QA');
  const workflowSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'CanonicalCommerceWorkflow.jsx'), 'utf8');
  check(workflowSource.includes("marketplace === 'AMAZON' ? 'CLAIM BLOCKED / PPC' : 'CLAIM BLOCKED'")
    && workflowSource.includes("marketplace === 'AMAZON' ? 'OTHER LANGUAGE / PPC' : 'OTHER LANGUAGE'"),
  'routing labels must distinguish Amazon PPC from Etsy non-PPC handling');

  const input = document.querySelector('input[type="file"]');
  const selected = new dom.window.File(['fixture'], 'Cerebro.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  Object.defineProperty(input, 'files', { value: [selected], configurable: true });
  await act(async () => { input.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  const buttons = () => [...document.querySelectorAll('button')];
  await act(async () => { buttons().find(button => button.textContent.includes('1A. Preview')).click(); });
  check(calls.some(call => call.url.endsWith('/research-imports/preview')), 'preview must call zero-write route');
  check(document.body.textContent.includes('1099'), 'preview accounting must render');
  check(document.body.textContent.includes('aaaaaaaaaaaa'), 'raw hash must render for staff inspection');
  const confirm = buttons().find(button => button.textContent.includes('1B. Xác nhận import'));
  check(confirm && !confirm.disabled, 'confirm must unlock only after preview succeeds');
  await act(async () => { confirm.click(); });
  check(calls.some(call => call.url.endsWith('/research-imports') && !call.url.endsWith('/preview')),
    'explicit confirm must call immutable import route separately');
  check(!calls.some(call => call.url.includes('/submit') || call.url.includes('/export')), 'workflow must not submit or export');

  await act(async () => root.unmount());
  await vite.close(); dom.window.close();
  console.log(`G4 canonical commerce UI: ${measured}/${measured} PASS`);
})().catch(error => { console.error(error); process.exit(1); });
