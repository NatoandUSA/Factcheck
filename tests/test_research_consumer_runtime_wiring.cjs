const assert = require('assert');
process.env.NODE_ENV = 'test';

(async () => {
  const { JSDOM } = require('jsdom');
  const { createServer } = await import('vite');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/'
  });
  Object.assign(global, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver,
    FormData: dom.window.FormData,
    File: dom.window.File
  });
  Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const React = (await import('react')).default;
  const { createRoot } = await import('react-dom/client');
  const { act } = React;
  const vite = await createServer({
    server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent',
    plugins: [{
      name: 'test-cjs-contract-adapter', enforce: 'pre',
      transform(code, id) {
        if (!id.endsWith('/src/utils/xrayUploadOutcome.cjs')) return null;
        return code.replace('module.exports = { deriveXrayUploadOutcome };',
          'export default { deriveXrayUploadOutcome };');
      }
    }]
  });
  let measured = 0;
  const check = (value, message) => { measured += 1; assert.ok(value, message); };
  const response = (body, ok = true, status = ok ? 200 : 500) => ({
    ok, status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  });
  const flush = async () => {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  };
  const setInput = async (element, value) => {
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype, 'value'
      ).set;
      setter.call(element, value);
      element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
  };

  const { default: MasterKeywordTable } =
    await vite.ssrLoadModule('/src/components/MasterKeywordTable.jsx');
  let keywordRequests = [];
  let pending = new Map();
  global.fetch = url => {
    const text = String(url);
    keywordRequests.push(text);
    const projectId = Number(new URL(text, 'http://localhost').searchParams.get('projectId'));
    return new Promise(resolve => pending.set(projectId, resolve));
  };
  let toasts = [];
  let root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(MasterKeywordTable, {
    marketplace: 'AMAZON', activeProjectId: 1,
    keywords: [{ keyword: 'FORGED_PROP_BYPASS' }],
    onShowToast: message => toasts.push(message)
  })));
  check(!document.body.textContent.includes('FORGED_PROP_BYPASS'),
    'MasterKeywordTable must reject reintroduced passedKeywords bypass data');
  await act(async () => root.render(React.createElement(MasterKeywordTable, {
    marketplace: 'AMAZON', activeProjectId: 2,
    onShowToast: message => toasts.push(message)
  })));
  await act(async () => {
    pending.get(1)(response({ success: true, projectId: 1, keywords: [
      { keyword: 'PROJECT_A_ONLY' }
    ] }));
    pending.get(2)(response({ success: true, projectId: 2, keywords: [
      { keyword: 'PROJECT_B_ONLY' }
    ] }));
  });
  check(!document.body.textContent.includes('PROJECT_A_ONLY'),
    'late project-A master keywords must be suppressed');
  check(document.body.textContent.includes('PROJECT_B_ONLY'),
    'current project-B master keywords must render');
  check(keywordRequests.every(url => url.startsWith('/api/master-keywords?')),
    'MasterKeywordTable must load only from /api/master-keywords');

  await act(async () => root.render(React.createElement(MasterKeywordTable, {
    marketplace: 'AMAZON', activeProjectId: 3,
    onShowToast: message => toasts.push(message)
  })));
  await act(async () => pending.get(3)(response({
    success: false, projectId: 3, error: 'DENIED'
  }, false, 403)));
  check(!document.body.textContent.includes('PROJECT_B_ONLY') && toasts.some(x => x.includes('DENIED')),
    'non-2xx must clear old rows and expose an error');

  await act(async () => root.render(React.createElement(MasterKeywordTable, {
    marketplace: 'AMAZON', activeProjectId: 4,
    onShowToast: message => toasts.push(message)
  })));
  await act(async () => pending.get(4)(response({
    success: true, projectId: 4, keywords: {}
  })));
  check(toasts.some(x => x.includes('MASTER_KEYWORDS_MALFORMED')),
    'malformed response must clear and expose an error');
  await act(async () => root.unmount());

  const mountWorkspace = async (Component, marketplace, projectId) => {
    let created = false;
    const urls = [];
    const errors = [];
    global.fetch = async (url, options = {}) => {
      const text = String(url);
      urls.push(text);
      if (text === '/api/projects' && options.method === 'POST') {
        created = true;
        return response({ success: true, projectId });
      }
      if (text === '/api/projects') {
        return response({ success: true, projects: created ? [{
          id: projectId, marketplace, state: 'MKL_FROZEN',
          seed_phrase: 'para mi hija'
        }] : [] });
      }
      const matched = text.match(/projectId=(\d+)/) || text.match(/projects\/(\d+)/);
      const scopedId = matched ? Number(matched[1]) : projectId;
      if (text.startsWith('/api/evidence?')) {
        return response({ success: true, projectId: scopedId, evidence: [] });
      }
      if (text.startsWith('/api/trends')) {
        return response({
          success: true, projectId: scopedId,
          trends: [{ id: projectId * 10, category: 'summary', keywordCount: 67 }]
        });
      }
      if (text.startsWith('/api/master-keywords')) {
        return response({ success: true, projectId: scopedId, keywords: [] });
      }
      if (text.includes('/research-imports/')) {
        return response({ success: true, projectId: scopedId, import: null });
      }
      if (text.includes('/evidence-health')) {
        return response({ success: true, projectId: scopedId, health: null });
      }
      return response({ success: true, projectId: scopedId });
    };
    document.getElementById('root').replaceChildren();
    root = createRoot(document.getElementById('root'));
    await act(async () => root.render(React.createElement(Component, {
      onShowToast: (message, level) => {
        if (level === 'error' || String(message).includes('Không thể')) errors.push(message);
      }
    })));
    const name = document.querySelector('input[aria-label="Tên project"]');
    const seed = document.querySelector('input[aria-label="Seed phrase project"]');
    check(Boolean(name && seed), `${marketplace} outer workspace must mount ProjectSetupCard`);
    await setInput(name, `${marketplace} project`);
    await setInput(seed, 'para mi hija');
    await act(async () => {
      name.closest('form').dispatchEvent(
        new dom.window.Event('submit', { bubbles: true, cancelable: true })
      );
    });
    for (let index = 0; index < 8; index += 1) await flush();
    if (marketplace === 'ETSY') {
      const stageButton = [...document.querySelectorAll('button')]
        .find(button => button.textContent.includes('Ma Trận 13 Tags'));
      check(Boolean(stageButton), 'Etsy outer workspace must expose its real MKL stage');
      await act(async () => stageButton.click());
      for (let index = 0; index < 4; index += 1) await flush();
      const draftButton = [...document.querySelectorAll('button')]
        .find(button => button.textContent.includes('TẠO ETSY LISTING'));
      check(Boolean(draftButton) && draftButton.disabled === true,
        'legacy Etsy draft generator stays visibly disabled after canonical workflow cutover');
      check(Boolean(document.querySelector('[data-testid="canonical-commerce-etsy"]')),
        'Etsy canonical workflow is mounted as the active draft path');
    }
    check(urls.some(url => url.startsWith(
      `/api/master-keywords?projectId=${projectId}`
    )), `${marketplace} outer workspace must bind MasterKeywordTable to active project`);
    check(urls.some(url => url.startsWith(
      `/api/trends?projectId=${projectId}`
    )), `${marketplace} trend summary must bind active project`);
    check(errors.length === 0, `${marketplace} valid wiring must not surface an error`);
    await act(async () => root.unmount());
    return urls;
  };

  const { default: AmazonWorkspace } =
    await vite.ssrLoadModule('/src/components/AmazonWorkspace.jsx');
  const amazonUrls = await mountWorkspace(AmazonWorkspace, 'AMAZON', 101);
  check(amazonUrls.filter(url => url.startsWith('/api/master-keywords')).every(
    url => url.includes('projectId=101')
  ), 'Amazon must never issue an unbound Master Keyword request');

  const { default: EtsyWorkspace } =
    await vite.ssrLoadModule('/src/components/EtsyWorkspace.jsx');
  const etsyUrls = await mountWorkspace(EtsyWorkspace, 'ETSY', 202);
  check(etsyUrls.filter(url => url.startsWith('/api/master-keywords')).every(
    url => url.includes('projectId=202')
  ), 'Etsy must never issue an unbound Master Keyword request');

  await vite.close();
  dom.window.close();
  console.log(
    `RR_CONSUMER_RUNTIME measured=${measured} passed=${measured} failed=0 unexecuted=0`
  );
})().catch(error => {
  console.error(error);
  process.exit(1);
});
