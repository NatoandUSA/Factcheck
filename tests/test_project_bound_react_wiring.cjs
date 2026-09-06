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
    MutationObserver: dom.window.MutationObserver
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
  const deferred = new Map();
  const response = body => ({ ok: true, json: async () => body });
  global.fetch = url => {
    const match = String(url).match(/projects\/(\d+)\/research-imports/);
    if (!match) return Promise.resolve(response({ success: true, projectId: 0, import: null }));
    const id = Number(match[1]);
    return new Promise(resolve => deferred.set(id, resolve));
  };
  const { default: AmazonPipelineWorkflow } = await vite.ssrLoadModule('/src/components/AmazonPipelineWorkflow.jsx');
  const root = createRoot(document.getElementById('root'));
  const props = projectId => ({
    seedPhrase: 'para mi hija', selectedCategory: 'Jewelry', activeProjectId: projectId,
    onShowToast: () => {}, onUpdateXraySellers: () => {}
  });
  await act(async () => { root.render(React.createElement(AmazonPipelineWorkflow, props(1))); });
  await act(async () => {
    deferred.get(1)(response({ success: true, projectId: 1, import: { metadata: {
      batches: [{ name: 'A batch', asins: ['AONLY'], items: [{ asin: 'AONLY', title: 'PROJECT_A_ONLY' }] }],
      xraySellers: [{ asin: 'AONLY', title: 'PROJECT_A_ONLY' }],
      reportProvenance: { projectBinding: 'PERSISTED_RESEARCH_ONLY' }
    } } }));
  });
  check(document.body.textContent.includes('PROJECT_A_ONLY'), 'Project A must render');
  await act(async () => { root.render(React.createElement(AmazonPipelineWorkflow, props(2))); });
  check(!document.body.textContent.includes('PROJECT_A_ONLY'), 'A must clear before B resolves');
  await act(async () => { deferred.get(2)(response({ success: true, projectId: 2, import: null })); });
  check(!document.body.textContent.includes('PROJECT_A_ONLY'), 'Empty B must stay clear');

  await act(async () => { root.render(React.createElement(AmazonPipelineWorkflow, props(3))); });
  const lateA = deferred.get(3);
  await act(async () => { root.render(React.createElement(AmazonPipelineWorkflow, props(4))); });
  await act(async () => {
    lateA(response({ success: true, projectId: 3, import: { metadata: {
      batches: [{ name: 'late', asins: ['LATEA'], items: [{ asin: 'LATEA', title: 'LATE_A' }] }],
      xraySellers: [{ asin: 'LATEA', title: 'LATE_A' }], reportProvenance: {}
    } } }));
    deferred.get(4)(response({ success: true, projectId: 4, import: { metadata: {
      batches: [{ name: 'B batch', asins: ['BONLY'], items: [{ asin: 'BONLY', title: 'PROJECT_B_ONLY' }] }],
      xraySellers: [{ asin: 'BONLY', title: 'PROJECT_B_ONLY' }], reportProvenance: {}
    } } }));
  });
  check(!document.body.textContent.includes('LATE_A'), 'Late project response must be discarded');
  check(document.body.textContent.includes('PROJECT_B_ONLY'), 'Current project response must render');
  await act(async () => root.unmount());

  const { createProjectBoundLoader } = await vite.ssrLoadModule('/src/utils/projectBoundLoader.js');
  let cleared = 0;
  let applied = 0;
  let errors = 0;
  const errorLoader = createProjectBoundLoader(async () => ({
    ok: false, json: async () => ({ success: false, projectId: 8, error: 'DENIED' })
  }));
  const errorResult = await errorLoader.load({
    projectId: 8, url: '/denied', clear: () => { cleared += 1; },
    select: () => null, apply: () => { applied += 1; }, onError: () => { errors += 1; }
  });
  check(errorResult.status === 'ERROR' && cleared === 2 && applied === 0 && errors === 1,
    'Non-2xx must clear and report a visible error without applying state');

  const malformedLoader = createProjectBoundLoader(async () => response({ success: true, projectId: 9, broken: true }));
  const malformedResult = await malformedLoader.load({
    projectId: 9, url: '/malformed', clear: () => { cleared += 1; },
    select: () => { throw new Error('MALFORMED'); },
    apply: () => { applied += 1; }, onError: () => { errors += 1; }
  });
  check(malformedResult.status === 'ERROR' && applied === 0 && errors === 2,
    'Malformed payload must fail closed and report an error');

  let resolveUnmounted;
  const unmountLoader = createProjectBoundLoader(() => new Promise(resolve => { resolveUnmounted = resolve; }));
  const pending = unmountLoader.load({
    projectId: 10, url: '/late', clear: () => {}, select: payload => payload,
    apply: () => { applied += 1; }, onError: () => { errors += 1; }
  });
  unmountLoader.dispose();
  resolveUnmounted(response({ success: true, projectId: 10 }));
  check((await pending).status === 'STALE' && applied === 0,
    'Dispose/unmount must suppress every late state write');

  await vite.close();
  dom.window.close();
  console.log(`RR_REACT_WIRING measured=${measured} passed=${measured} failed=0 unexecuted=0`);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
