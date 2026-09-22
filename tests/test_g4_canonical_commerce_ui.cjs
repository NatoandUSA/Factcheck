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
  let authMeAuthenticated = true;
  let authRole = 'SELLER';
  let mockListings = [];
  let mockReviewPackage = null;
  let qaRevisionBody = null;
  const response = body => ({ ok: true, status: 200, json: async () => body });
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (url === '/api/auth/me') return authMeAuthenticated
      ? response({ user: { userId: 7, role: authRole, workspaceId: 11, marketplace: activeMockMarketplace } })
      : { ok: false, status: 401, json: async () => ({ error: 'INVALID_SESSION' }) };
    if (String(url).endsWith('/commerce-state')) return response({ success: true, heads: {
      productTruthRevisionId: null, researchSnapshotId: activeMockMarketplace === 'ETSY' ? 21 : null, intelligenceSnapshotId: null
    }, policyCapability: { status: 'DRAFT_ONLY', approvalEligible: false,
      blockers: [{ code: 'POLICY_CONTRACT_DRAFT_ONLY' }], policyContractId: `${activeMockMarketplace.toLowerCase()}-draft-policy` },
    imports: activeMockMarketplace === 'ETSY'
      ? [{ id: 8, kind: 'ETSY_SEARCH', file_name: 'etsy-live.csv', byte_length: 12500, raw_hash: 'e'.repeat(64) }]
      : [{ id: 4, kind: 'AMAZON_CEREBRO', file_name: 'Existing-Cerebro.xlsx', byte_length: 260477, raw_hash: 'c'.repeat(64) }],
    researchSnapshots: [], intelligenceSnapshots: [] });
    if (String(url).endsWith('/marketplace-workflow')) return response({ success: true,
      heads: activeMockMarketplace === 'ETSY' ? {
        ETSY_WINNER_SET: { revisionNumber: 1, accounting: { selectedWinnerCount: 12 } },
        ETSY_PATTERN_SNAPSHOT: { revisionNumber: 1, accounting: { unparseableTagCellCount: 1 }, payload: {
          sampleSize: 2, leadingWords: [{ phrase: 'collar', count: 2, share: 1 }],
          repeatedPhrases: [{ phrase: 'collar hija', count: 2, share: 1 }],
          observedTags: [{ phrase: 'regalo hija', listingSpread: 2, shopSpread: 2, evidenceTier: 'E1_OBSERVED_PUBLIC' }],
          structure: { personalizationRate: 0, giftRate: 100, averageWords: 4 }, marketContext: { uniqueShopCount: 2 }
        } }
      } : {}, artifacts: [] });
    if (String(url) === '/api/projects') return response({ success: true, projects: [
      { id: 3, name: 'Existing Amazon Project', seed_phrase: 'pet memorial gift', state: 'EVIDENCE_INTAKE' },
      { id: 9, name: 'Pet Memorial Candidate Pilot', seed_phrase: 'pet memorial gift', state: 'EVIDENCE_INTAKE' }
    ] });
    if (String(url) === '/api/integrations/social-listening/handoffs/pull' && options.method === 'POST') return response({
      success: true, replay: false, handoff: { id: 44, authority: { classification: 'RESEARCH_ONLY' },
        marketValidationCapability: 'NOT_CONNECTED' }
    });
    if (String(url) === '/api/global-candidates/social-handoffs/44' && options.method === 'POST') return response({
      success: true, evidenceCreated: 2, groupingMethod: 'EXACT_NORMALIZED_V1', decisionAuthority: false, promotionAuthority: false
    });
    if (String(url).startsWith('/api/global-candidates/evaluations')) return response({ success: true, candidates: [{
      candidateId: 31, priorityRank: 1, displayPhrase: 'pet memorial gift', marketplace: activeMockMarketplace,
      advisoryDisposition: { value: 'PROMOTE', reasonCodes: ['PROMOTE_FOR_PROJECT_RESEARCH_NOT_AS_COMMERCIAL_PROOF'], blockers: [] },
      evidenceSummary: { evidenceCount: 4, sourceFamilyCount: 2 }
    }] });
    if (String(url) === '/api/global-candidates/31/promote' && options.method === 'POST') return response({
      success: true, projectId: 9, createdState: 'EVIDENCE_INTAKE', promotionAuthority: 'HUMAN_EXPLICIT'
    });
    if (String(url).endsWith('/product-truth/revisions')) return response({ success: true, revisions: [] });
    if (String(url).endsWith('/product-truth-families')) return response({ success: true, families: [] });
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
    if (String(url).endsWith('/etsy/winners/preview')) return response({ zeroWrite: true,
      accounting: { sourceObservationCount: 3, normalizedEntityCount: 3, duplicateObservationCount: 0,
        relevantEntityCount: 3, irrelevantEntityCount: 0, droppedObservationCount: 0, selectedWinnerCount: 2 },
      payload: { selectedEntityIds: ['e1', 'e2'], cohorts: [
        { name: 'CURRENT_ORGANIC_LEADERS', members: ['e1', 'e2'] },
        { name: 'EMERGING_WINNERS', members: ['e2', 'e3'] }
      ], entities: [
        { entityId: 'e1', listingId: '1', title: 'Collar hija', shopName: 'One', relevance: { relevant: true }, winnerScore: 90, observationCount: 1 },
        { entityId: 'e2', listingId: '2', title: 'Regalo hija', shopName: 'Two', relevance: { relevant: true }, winnerScore: 80, observationCount: 1 },
        { entityId: 'e3', listingId: '3', title: 'Collar regalo', shopName: 'Three', relevance: { relevant: true }, winnerScore: 70, observationCount: 1 }
      ] }
    });
    if (String(url).endsWith('/etsy/patterns/preview')) return response({ zeroWrite: true,
      accounting: { selectedWinnerCount: 2, repeatedPhraseCount: 1, unparseableTagCellCount: 1 },
      payload: { sampleSize: 2, leadingWords: [{ phrase: 'collar', count: 2, share: 1 }],
        repeatedPhrases: [{ phrase: 'collar hija', count: 2, share: 1 }],
        observedTags: [{ phrase: 'regalo hija', listingSpread: 2, shopSpread: 2, evidenceTier: 'E1_OBSERVED_PUBLIC' }],
        structure: { personalizationRate: 0, giftRate: 100, averageWords: 4 }, marketContext: { uniqueShopCount: 2 } }
    });
    if (/\/api\/listings\/7\/review-package$/.test(String(url))) return response(mockReviewPackage);
    if (/\/api\/listings\/7\/revisions$/.test(String(url)) && options.method === 'POST') {
      qaRevisionBody = JSON.parse(options.body);
      mockReviewPackage = { ...mockReviewPackage, listingRevisionId: 6, revisionNumber: 2,
        content: qaRevisionBody.content, contentHash: 'd'.repeat(64) };
      mockListings = [{ ...mockListings[0], head_revision_id: 6, etsyTitle: qaRevisionBody.content.etsyTitle }];
      return response({ success: true, revisionId: 6, revisionNumber: 2, status: 'NEEDS_QA',
        content: qaRevisionBody.content, guardAccounting: {} });
    }
    if (String(url).endsWith('/listings')) return response({ success: true, listings: mockListings });
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
  check(document.querySelector('[data-testid="policy-capability-banner"]')
    && document.body.textContent.includes('Policy capability: DRAFT_ONLY')
    && document.body.textContent.includes('Manager approval, Owner authorization và exact export bị vô hiệu hóa'),
  'DRAFT_ONLY must be prominent before staff invests in the workflow');
  check(!document.body.textContent.includes('Manager xác nhận'), 'Seller must not receive Manager confirmation action');
  check(document.querySelector('[data-testid="amazon-xray-upload-lane"]')
    && document.querySelector('[data-testid="amazon-cerebro-upload-lane"]'),
  'Amazon must expose separate Xray and Cerebro intake lanes');
  check(document.body.textContent.includes('Seed → Xray') && document.body.textContent.includes('Cerebro hợp lệ'),
    'Amazon UI must explain the normal Xray-to-Cerebro order and independent Cerebro import');
  check(document.body.textContent.includes('Preview zero-write'), 'research and intelligence previews must be visible');
  check(document.body.textContent.includes('Product Truth do Seller nhập và kiểm'), 'Seller Product Truth stage must be visible');
  check(document.querySelector('[data-testid="product-truth-family-library"]')
    && document.body.textContent.includes('nhập một lần, dùng lại có kiểm soát'),
  'versioned Product Truth family library must be visible');
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
  Object.defineProperty(input, 'files', { value: [selected], configurable: true });
  await act(async () => { input.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  Object.defineProperty(input, 'files', { value: [selectedTwo], configurable: true });
  await act(async () => { input.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  const buttons = () => [...document.querySelectorAll('button')];
  check(document.body.textContent.includes('Cerebro đang chờ: 2 file'),
    'subsequent picker selections must append and visibly queue files instead of replacing the prior selection');
  await act(async () => { buttons().find(button => button.textContent.includes('Preview 2 Cerebro')).click(); });
  check(calls.filter(call => call.url.endsWith('/research-imports/preview')).length === 2,
    'one multi-file selection must preview every file through the zero-write route');
  check(document.body.textContent.includes('1099'), 'preview accounting must render');
  check(document.body.textContent.includes('aaaaaaaaaaaa'), 'raw hash must render for staff inspection');
  check(document.body.textContent.includes('không cần chọn lại'),
    'Amazon Cerebro lane must explicitly tell staff that accepted previews remain importable without reselecting files');
  const confirm = buttons().find(button => button.textContent.includes('Xác nhận import Cerebro'));
  check(confirm && !confirm.disabled, 'confirm must unlock from the accepted preview set');
  await act(async () => { confirm.click(); });
  check(calls.filter(call => call.url.endsWith('/research-imports') && !call.url.endsWith('/preview')).length === 2,
    'explicit confirm must persist each previewed file separately');
  check(document.querySelector('textarea[aria-label="Nhật ký thực thi"]').value.includes('research-file-preview')
    && document.querySelector('textarea[aria-label="Nhật ký thực thi"]').value.includes('SUCCESS'),
  'execution log must record per-file action outcomes for copyable diagnostics');
  await act(async () => { buttons().find(button => button.textContent.includes('Copy log JSON')).click(); });
  const copiedPacket = JSON.parse(copiedLog);
  check(copiedPacket.schemaVersion === 2 && copiedPacket.captureState === 'IDLE' && copiedPacket.inFlightAction === null
    && copiedPacket.projectId === 3 && copiedPacket.marketplace === 'AMAZON'
    && copiedPacket.entries.some(entry => entry.action === 'research-file-preview' && entry.status === 'SUCCESS'),
  'Copy log JSON must produce a parseable, project-scoped diagnostic packet');
  check(!/cookie|password|fixture-one|fixture-two/i.test(copiedLog),
    'copied execution log must omit credentials and source file contents');

  const sameSource = [...document.querySelectorAll('input[type="checkbox"]')].find(item => item.parentElement.textContent.includes('cùng supplier'));
  await act(async () => { sameSource.click(); });
  const listingHtmlInput = document.querySelector('input[aria-label="Upload listing capture"]');
  const listingHtml = new dom.window.File(['<span id="productTitle">Para Mi Hija Necklace</span>'], 'amz.html', { type: 'text/html' });
  Object.defineProperty(listingHtmlInput, 'files', { value: [listingHtml], configurable: true });
  await act(async () => { listingHtmlInput.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  await act(async () => { buttons().find(button => button.textContent.includes('Preview HTML / TXT / CSV / JSON')).click(); });
  check(calls.some(call => call.url.endsWith('/product-truth-listing/preview')),
    'integrated Product Truth scan must reuse the authenticated project-scoped route');
  check([...document.querySelectorAll('input')].some(item => item.value === 'Stainless Steel')
    && document.body.textContent.includes('3 trường · 1 bullet'),
  'reference listing preview must populate editable Product Truth fields and show accounting');
  check(!calls.some(call => call.url.includes('/submit') || call.url.includes('/export')), 'workflow must not submit or export');

  activeMockMarketplace = 'ETSY';
  mockListings = [{ id: 7, status: 'NEEDS_QA', head_revision_id: 5, etsyTitle: 'Personalizado Fleece Blanket' }];
  mockReviewPackage = { success: true, listingId: 7, projectId: 4, status: 'NEEDS_QA', listingRevisionId: 5,
    revisionNumber: 1, contentHash: 'a'.repeat(64), dependencyHash: 'b'.repeat(64),
    dependencies: { productTruthRevisionId: 10, intelligenceSnapshotId: 5 }, validationAccounting: {},
    approvalReadiness: { ready: false, error: 'POLICY_CONTRACT_DRAFT_ONLY' },
    qualityEvidence: { marketplace: 'ETSY', listingLanguage: 'ES', productTruthBound: true,
      productTruthRevisionId: 10, productTruthHash: 'c'.repeat(64), verifiedFactCount: 6,
      imagePlan: { ready: 7, expected: 8 } },
    content: { etsyTitle: 'Personalizado Fleece Blanket',
      etsyTags: ['regalo hermana'], etsyTagExplanations: [], etsyTagStatus: { code: 'TAG_SHORTAGE', missingCount: 12 },
      etsyDescription: 'Regalo personalizado para hermana.', itemHighlights: 'Fleece Blanket',
      categoryName: 'Blankets', shopName: 'Luna Atelier Studio', priceAmount: '39.95', priceCurrency: 'USD',
      imagePrompts: { prompts: [] } } };
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
  await act(async () => { [...document.querySelectorAll('button')].find(button => button.textContent.includes('Phân tích / làm mới winner views')).click(); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
  check(document.body.textContent.includes('Chọn hợp nhất mọi cohort')
    && document.body.textContent.includes('CURRENT_ORGANIC_LEADERS (2/2)'),
  'Etsy winner cohorts must support additive multi-cohort selection');
  await act(async () => { [...document.querySelectorAll('button')].find(button => button.textContent.includes('Chọn hợp nhất mọi cohort')).click(); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
  check(document.body.textContent.includes('Lưu 3 winner'), 'cohort union must deduplicate shared listings');
  check(document.querySelector('[data-testid="etsy-pattern-table"]')
    && document.body.textContent.includes('OBSERVED_TAG') && document.body.textContent.includes('E1_OBSERVED_PUBLIC'),
  'Pattern Miner must render structured phrase, coverage, shop and evidence columns');

  const exactPackageButton = [...document.querySelectorAll('button')]
    .find(button => button.textContent.includes('Mở exact review package'));
  await act(async () => { exactPackageButton.click(); await new Promise(resolve => setTimeout(resolve, 0)); });
  const createQaEdit = [...document.querySelectorAll('button')].find(button => button.textContent.includes('Create QA Edit'));
  check(Boolean(createQaEdit), 'exact review package must expose the controlled QA edit entry point');
  await act(async () => { createQaEdit.click(); });
  const qaPanel = document.querySelector('[data-testid="qa-edit-7"]');
  check(qaPanel && qaPanel.textContent.includes('Product Truth #10') && qaPanel.textContent.includes('Intelligence #5'),
    'QA edit must visibly preserve exact immutable upstream dependencies');
  check([...qaPanel.querySelectorAll('input')].some(field => field.value === 'Luna Atelier Studio')
    && [...qaPanel.querySelectorAll('input')].some(field => field.value === '39.95')
    && [...qaPanel.querySelectorAll('input')].some(field => field.value === 'USD'),
  'QA edit must expose shop identity and price/currency from the exact immutable revision');
  const qaTitle = [...qaPanel.querySelectorAll('textarea')].find(field => field.value === 'Personalizado Fleece Blanket');
  const setTextareaValue = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set;
  await act(async () => { setTextareaValue.call(qaTitle, 'Manta Personalizada para Hermana');
    qaTitle.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
  const qaReason = qaPanel.querySelector('textarea[aria-label="Lý do QA edit listing 7"]');
  await act(async () => { setTextareaValue.call(qaReason, 'Chuẩn hóa ngôn ngữ; giữ nguyên Product Truth.');
    qaReason.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
  await act(async () => { [...qaPanel.querySelectorAll('button')]
    .find(button => button.textContent.includes('Lưu immutable successor revision')).click();
    await new Promise(resolve => setTimeout(resolve, 0)); });
  check(qaRevisionBody?.parentRevisionId === 5 && qaRevisionBody?.expectedHeadRevisionId === 5
    && qaRevisionBody?.productTruthRevisionId === 10 && qaRevisionBody?.intelligenceSnapshotId === 5,
  `QA edit POST must bind parent/head and preserve exact Product Truth/Intelligence dependencies: ${JSON.stringify(qaRevisionBody)}`);
  check(qaRevisionBody?.content.etsyTitle === 'Manta Personalizada para Hermana',
    'controlled QA edit must submit the edited copy through the immutable revision endpoint');
  check(qaRevisionBody?.content.shopName === 'Luna Atelier Studio' && qaRevisionBody?.content.priceAmount === '39.95'
    && qaRevisionBody?.content.priceCurrency === 'USD',
  'controlled QA edit must preserve commercial fields in the immutable successor payload');

  await act(async () => root.unmount());

  const { default: SinglePathWorkspace } = await vite.ssrLoadModule('/src/components/SinglePathMarketplaceWorkspace.jsx');
  activeMockMarketplace = 'AMAZON'; authRole = 'OWNER'; authMeAuthenticated = true;
  const candidateRoot = createRoot(document.getElementById('root'));
  await act(async () => { candidateRoot.render(React.createElement(AuthProvider, null,
    React.createElement(SinglePathWorkspace, { marketplace: 'AMAZON' }))); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  check(Boolean(document.querySelector('[data-testid="global-candidate-operator-path"]'))
    && document.body.textContent.includes('pet memorial gift')
    && document.body.textContent.includes('PROMOTE'),
  'authenticated operator must see B3 Global Candidate disposition in normal workspace UI');
  const intelPullButton = document.querySelector('[data-testid="pull-verified-intel-handoff"]');
  check(Boolean(intelPullButton) && !intelPullButton.disabled,
    'OWNER must receive an explicit authority-safe Intel handoff pull action');
  await act(async () => { intelPullButton.click(); await new Promise(resolve => setTimeout(resolve, 20)); });
  check(calls.some(call => call.url === '/api/integrations/social-listening/handoffs/pull' && call.options.method === 'POST')
    && calls.some(call => call.url === '/api/global-candidates/social-handoffs/44' && call.options.method === 'POST'),
  'Intel operator action must reuse verified Social Handoff V3 then canonical B2 projection, never direct score promotion');
  const promoteButton = [...document.querySelectorAll('button')].find(button => button.textContent.includes('Promote to Project'));
  check(Boolean(promoteButton) && !promoteButton.disabled, 'OWNER must receive explicit Promote-to-Project action only for PROMOTE candidate');
  await act(async () => { promoteButton.click(); await new Promise(resolve => setTimeout(resolve, 20)); });
  check(calls.some(call => call.url === '/api/global-candidates/31/promote' && call.options.method === 'POST'),
    'operator Promote action must use canonical B4 route');
  check(document.querySelector('select[aria-label="Active AMAZON project"]')?.value === '9',
    'successful promotion must move operator directly into the created canonical Project');
  await act(async () => candidateRoot.unmount());

  authMeAuthenticated = false; authRole = 'SELLER';
  let loginRequests = 0;
  const root2 = createRoot(document.getElementById('root'));
  await act(async () => { root2.render(React.createElement(AuthProvider, null,
    React.createElement(SinglePathWorkspace, { marketplace: 'AMAZON', onRequireLogin: () => { loginRequests += 1; } }))); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  check(Boolean(document.querySelector('[data-testid="project-login-required"]')),
    'an invalid/restored session must render a login boundary instead of an active project form');
  check(!document.querySelector('form'), 'unauthenticated staff must not be able to submit project creation');
  const loginButton = [...document.querySelectorAll('button')].find(button => button.textContent.includes('Đăng nhập để bắt đầu'));
  await act(async () => { loginButton.click(); });
  check(loginRequests === 1, 'the project boundary must open the shared OmniSeller login flow');
  await act(async () => root2.unmount());

  const { default: EtsyPreview } = await vite.ssrLoadModule('/src/components/EtsyRealProductPage.jsx');
  const root3 = createRoot(document.getElementById('root'));
  const exactPrompts = Array.from({ length: 8 }, (_, index) => ({ id: `ETSY-${index + 1}`,
    purpose: `Exact purpose ${index + 1}`, aspectRatio: '4:3', prompt: `Exact prompt ${index + 1}`,
    ready: index < 7, missingInputs: index < 7 ? [] : ['packaging'] }));
  await act(async () => { root3.render(React.createElement(EtsyPreview, { listing: {
    etsyTitle: 'Exact Etsy Preview', etsyTags: ['exact tag'], etsyDescription: 'Exact description',
    shopName: 'Luna Atelier Studio', priceAmount: '42.50', priceCurrency: 'USD',
    imagePrompts: { prompts: exactPrompts }
  } })); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  check(document.body.textContent.includes('8 photo prompts'),
    'Etsy exact Preview must render the canonical eight-prompt artifact rather than a legacy generated count');
  check(document.body.textContent.includes('Luna Atelier Studio') && !document.body.textContent.includes('[Shop Name: Unset]')
    && !document.body.textContent.includes('NOT SET'),
  'Etsy exact Preview must render immutable shop identity and formatted price instead of placeholders');
  const promptTab = [...document.querySelectorAll('button')].find(button => button.textContent.includes('Image plan'));
  await act(async () => { promptTab.click(); });
  check(document.body.textContent.includes('Bộ 8 Prompt Ảnh Etsy')
    && document.body.textContent.includes('Blocked — missing: packaging'),
    'Etsy exact Preview must retain blocked-slot readiness evidence');
  await act(async () => root3.unmount());
  await vite.close(); dom.window.close();
  console.log(`G4 canonical commerce UI: ${measured}/${measured} PASS`);
})().catch(error => { console.error(error); process.exit(1); });
