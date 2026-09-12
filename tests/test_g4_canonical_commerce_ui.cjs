'use strict';
process.env.NODE_ENV = 'test';
const assert = require('assert');

(async () => {
  const { JSDOM } = require('jsdom');
  const { createServer } = await import('vite');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
  Object.assign(global, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, File: dom.window.File, Blob: dom.window.Blob,
    FormData: dom.window.FormData, TextEncoder });
  Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
  let copiedLog = '';
  Object.defineProperty(global.navigator, 'clipboard', { value: { writeText: async value => { copiedLog = value; } }, configurable: true });
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const React = (await import('react')).default;
  const { act } = React;
  const { createRoot } = await import('react-dom/client');
  const calls = [];
  let activeMockMarketplace = 'AMAZON';
  const response = body => ({ ok: true, status: 200, json: async () => body });
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (url === '/api/auth/me') return response({ user: { userId: 7, role: 'SELLER' } });
    if (String(url).endsWith('/commerce-state')) return response({ success: true, heads: {
      productTruthRevisionId: null, researchSnapshotId: activeMockMarketplace === 'ETSY' ? 21 : null, intelligenceSnapshotId: null
    }, imports: activeMockMarketplace === 'ETSY'
      ? [{ id: 8, kind: 'ETSY_SEARCH', file_name: 'etsy-live.csv', byte_length: 12500, raw_hash: 'e'.repeat(64) }]
      : [{ id: 4, kind: 'AMAZON_CEREBRO', file_name: 'Existing-Cerebro.xlsx', byte_length: 260477, raw_hash: 'c'.repeat(64) }],
    researchSnapshots: [], intelligenceSnapshots: [] });
    if (String(url).endsWith('/marketplace-workflow')) return response({ success: true,
      heads: activeMockMarketplace === 'ETSY' ? {
        ETSY_WINNER_SET: { revisionNumber: 1, accounting: { selectedWinnerCount: 12 } },
        ETSY_PATTERN_SNAPSHOT: { revisionNumber: 1 }
      } : {}, artifacts: [] });
    if (String(url).endsWith('/product-truth/revisions')) return response({ success: true, revisions: [] });
    if (String(url).endsWith('/product-truth-listing/preview')) return response({ success: true, zeroWrite: true,
      sourceReference: 'https://www.amazon.com/dp/B0D5XS64LH', rawHash: 'b'.repeat(64),
      facts: {
        productName: { disposition: 'ASSERTED', value: 'Para Mi Hija Necklace' },
        productType: { disposition: 'ASSERTED', value: 'Necklace' },
        materials: { disposition: 'ASSERTED', value: 'Stainless Steel' }
      },
      observations: { title: 'Para Mi Hija Necklace', bullets: ['Message card in gift box'] },
      accounting: { extractedFactCount: 3, observedBulletCount: 1 }
    });
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
    React.createElement(Workflow, { activeProject: { id: 3, state: 'EVIDENCE_INTAKE' }, marketplace: 'AMAZON' }))); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

  check(document.body.textContent.includes('Luồng Staff Canonical — AMAZON US'), 'Amazon workflow must render');
  check(document.body.textContent.includes('không tự đăng'), 'workflow must disclose its stop boundary');
  check(!document.body.textContent.includes('Manager xác nhận'), 'Seller must not receive Manager confirmation action');
  check(document.querySelector('[data-testid="amazon-xray-upload-lane"]')
    && document.querySelector('[data-testid="amazon-cerebro-upload-lane"]'),
  'Amazon must expose separate Xray and Cerebro intake lanes');
  check(document.body.textContent.includes('Seed → Xray') && document.body.textContent.includes('Cerebro hợp lệ'),
    'Amazon UI must explain the normal Xray-to-Cerebro order and independent Cerebro import');
  check(document.body.textContent.includes('Preview zero-write'), 'research and intelligence previews must be visible');
  check(document.body.textContent.includes('Product Truth do Seller nhập và kiểm'), 'Seller Product Truth stage must be visible');
  check(document.body.textContent.includes('Dùng ngay tài khoản, workspace và project đang mở'),
    'listing-assisted Product Truth must be integrated into the authenticated workflow');
  check(document.body.textContent.includes('Theo keyword đầu vào'), 'AUTO listing language must be visible');
  check(document.body.textContent.includes('OmniSeller không tự đăng')
    && document.body.textContent.includes('OPERATOR_REPORTED_SUBMITTED'),
  'workflow must expose the manual submission boundary and operator-reported terminal event');
  check(document.querySelector('[data-testid="canonical-next-action"]'), 'workflow must expose one concrete next action');
  check(document.body.textContent.includes('trạng thái này không chặn luồng R3'),
    'legacy EVIDENCE_INTAKE must be explained as non-blocking for canonical R3');
  check(document.querySelector('[data-testid="canonical-execution-log"]')
    && document.body.textContent.includes('Copy log JSON'), 'staff-visible execution log and copy action must render');

  const workflowText = document.body.textContent;
  const orderedSteps = [
    '1. Upload Xray từ seed',
    '2. Quyết định ASIN batches',
    '3. Upload Cerebro sau khi đã chạy các ASIN batch trên Helium 10',
    '4. Chọn file Cerebro để tạo Research Snapshot'
  ];
  check(orderedSteps.every((label, index) => workflowText.indexOf(label) >= 0
    && (index === 0 || workflowText.indexOf(label) > workflowText.indexOf(orderedSteps[index - 1]))),
  'Amazon DOM must preserve Xray -> editable ASIN plan -> Cerebro -> snapshot order');
  check(!/Chứng minh file Cerebro thuộc batch|gắn file với batch|CEREBRO_CONTAINS_ASINS_OUTSIDE_BATCH/i.test(workflowText),
    'active Amazon UI must not expose batch ancestry proof or the rejected hard lock');
  const xrayInput = document.querySelector('input[aria-label="Upload Xray"]');
  const input = document.querySelector('input[aria-label="Upload Cerebro"]');
  check(xrayInput.multiple && input.multiple, 'both Amazon intake lanes must accept multiple files in one selection');
  const selected = new dom.window.File(['fixture-one'], 'Cerebro-one.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const selectedTwo = new dom.window.File(['fixture-two'], 'Cerebro-two.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  Object.defineProperty(input, 'files', { value: [selected, selectedTwo], configurable: true });
  await act(async () => { input.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  const buttons = () => [...document.querySelectorAll('button')];
  await act(async () => { buttons().find(button => button.textContent.includes('Preview 2 Cerebro')).click(); });
  check(calls.filter(call => call.url.endsWith('/research-imports/preview')).length === 2,
    'one multi-file selection must preview every file through the zero-write route');
  check(document.body.textContent.includes('1099'), 'preview accounting must render');
  check(document.body.textContent.includes('aaaaaaaaaaaa'), 'raw hash must render for staff inspection');
  const confirm = buttons().find(button => button.textContent.includes('Xác nhận import Cerebro'));
  check(confirm && !confirm.disabled, 'confirm must unlock only after preview succeeds');
  await act(async () => { confirm.click(); });
  check(calls.filter(call => call.url.endsWith('/research-imports') && !call.url.endsWith('/preview')).length === 2,
    'explicit confirm must persist each previewed file separately');
  check(document.querySelector('textarea[aria-label="Nhật ký thực thi"]').value.includes('research-file-preview')
    && document.querySelector('textarea[aria-label="Nhật ký thực thi"]').value.includes('SUCCESS'),
  'execution log must record per-file action outcomes for copyable diagnostics');
  await act(async () => { buttons().find(button => button.textContent.includes('Copy log JSON')).click(); });
  const copiedPacket = JSON.parse(copiedLog);
  check(copiedPacket.schemaVersion === 1 && copiedPacket.projectId === 3 && copiedPacket.marketplace === 'AMAZON'
    && copiedPacket.entries.some(entry => entry.action === 'research-file-preview' && entry.status === 'SUCCESS'),
  'Copy log JSON must produce a parseable, project-scoped diagnostic packet');
  check(!/cookie|password|fixture-one|fixture-two/i.test(copiedLog),
    'copied execution log must omit credentials and source file contents');

  const sameSource = [...document.querySelectorAll('input[type="checkbox"]')].find(item => item.parentElement.textContent.includes('cùng supplier'));
  await act(async () => { sameSource.click(); });
  const listingHtmlInput = document.querySelector('input[aria-label="Upload HTML listing"]');
  const listingHtml = new dom.window.File(['<span id="productTitle">Para Mi Hija Necklace</span>'], 'amz.html', { type: 'text/html' });
  Object.defineProperty(listingHtmlInput, 'files', { value: [listingHtml], configurable: true });
  await act(async () => { listingHtmlInput.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  await act(async () => { buttons().find(button => button.textContent.includes('Upload HTML và điền')).click(); });
  check(calls.some(call => call.url.endsWith('/product-truth-listing/preview')),
    'integrated Product Truth scan must reuse the authenticated project-scoped route');
  check([...document.querySelectorAll('input')].some(item => item.value === 'Stainless Steel')
    && document.body.textContent.includes('3 trường · 1 bullet'),
  'reference listing preview must populate editable Product Truth fields and show accounting');
  check(!calls.some(call => call.url.includes('/submit') || call.url.includes('/export')), 'workflow must not submit or export');

  activeMockMarketplace = 'ETSY';
  await act(async () => { root.render(React.createElement(AuthProvider, null,
    React.createElement(Workflow, { activeProject: { id: 4, state: 'EVIDENCE_INTAKE' }, marketplace: 'ETSY' }))); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  check(document.querySelector('[data-testid="canonical-commerce-etsy"]'), 'Etsy canonical workflow must render');
  check(document.body.textContent.includes('1D. Dữ liệu live → Winner Set có thể sửa tự do')
    && document.body.textContent.includes('1E. Pattern Miner')
    && document.body.textContent.includes('1F. Pattern → Etsy Master Keyword List'),
  'Etsy research snapshot must continue into editable Winner Set, Pattern Miner and Master KW controls');
  check(document.querySelector('input[aria-label="File research"]').multiple,
    'Etsy must accept multiple CSV/HTML captures in one selection');
  check(document.body.textContent.includes('YTrends là nguồn E3 bổ sung')
    && !document.body.textContent.includes('MISSING_QUALIFYING_EVIDENCE_PRECONDITION'),
  'Etsy file workflow must remain usable without a provider/evidence-gate prerequisite');

  await act(async () => root.unmount());
  await vite.close(); dom.window.close();
  console.log(`G4 canonical commerce UI: ${measured}/${measured} PASS`);
})().catch(error => { console.error(error); process.exit(1); });
