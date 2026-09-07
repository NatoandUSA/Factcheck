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
    server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent'
  });
  let measured = 0;
  const check = (value, message) => { measured += 1; assert.ok(value, message); };
  const response = (body, ok = true, status = ok ? 200 : 500) => ({
    ok, status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  });
  const deferredFetch = () => {
    const pending = new Map();
    const signals = new Map();
    const fetchImpl = (url, options = {}) => {
      const match = String(url).match(/projectId=(\d+)/);
      const projectId = match ? Number(match[1]) : null;
      signals.set(projectId, options.signal);
      return new Promise(resolve => pending.set(projectId, resolve));
    };
    return { pending, signals, fetchImpl };
  };
  const rootNode = document.getElementById('root');
  let root = createRoot(rootNode);
  const toasts = [];

  const { default: ProjectEvidenceGate } =
    await vite.ssrLoadModule('/src/components/ProjectEvidenceGate.jsx');
  let gateNet = deferredFetch();
  global.fetch = gateNet.fetchImpl;
  const gateProps = id => ({
    activeProject: { id, state: 'EVIDENCE_INTAKE' },
    onTransition: () => {},
    onShowToast: message => toasts.push(message)
  });
  await act(async () => root.render(React.createElement(ProjectEvidenceGate, gateProps(1))));
  await act(async () => gateNet.pending.get(1)(response({
    success: true, projectId: 1,
    evidence: [{ id: 11, source: 'PROJECT_A_EVIDENCE', evidence_state: 'OBSERVED' }]
  })));
  check(document.body.textContent.includes('PROJECT_A_EVIDENCE'),
    'ProjectEvidenceGate must render current project evidence');

  await act(async () => root.render(React.createElement(ProjectEvidenceGate, gateProps(2))));
  check(!document.body.textContent.includes('PROJECT_A_EVIDENCE'),
    'ProjectEvidenceGate must clear before project-B load');
  await act(async () => {
    gateNet.pending.get(2)(response({
      success: true, projectId: 2,
      evidence: [{ id: 22, source: 'PROJECT_B_EVIDENCE', evidence_state: 'OBSERVED' }]
    }));
  });
  check(document.body.textContent.includes('PROJECT_B_EVIDENCE'),
    'ProjectEvidenceGate must render project-B evidence');

  await act(async () => root.render(React.createElement(ProjectEvidenceGate, gateProps(3))));
  await act(async () => root.render(React.createElement(ProjectEvidenceGate, gateProps(4))));
  await act(async () => {
    gateNet.pending.get(3)(response({
      success: true, projectId: 3,
      evidence: [{ id: 33, source: 'LATE_PROJECT_C', evidence_state: 'OBSERVED' }]
    }));
    gateNet.pending.get(4)(response({
      success: true, projectId: 4,
      evidence: [{ id: 44, source: 'CURRENT_PROJECT_D', evidence_state: 'OBSERVED' }]
    }));
  });
  check(!document.body.textContent.includes('LATE_PROJECT_C') &&
    document.body.textContent.includes('CURRENT_PROJECT_D'),
  'ProjectEvidenceGate must suppress late cross-project responses');

  await act(async () => root.render(React.createElement(ProjectEvidenceGate, gateProps(5))));
  await act(async () => gateNet.pending.get(5)(response({
    success: false, projectId: 5, error: 'EVIDENCE_DENIED'
  }, false, 403)));
  check(!document.body.textContent.includes('CURRENT_PROJECT_D') &&
    toasts.some(message => message.includes('EVIDENCE_DENIED')),
  'ProjectEvidenceGate non-2xx must clear and surface an error');

  await act(async () => root.render(React.createElement(ProjectEvidenceGate, gateProps(6))));
  await act(async () => gateNet.pending.get(6)(response({
    success: true, projectId: 6, evidence: {}
  })));
  check(toasts.some(message => message.includes('EVIDENCE_RELOAD_MALFORMED')),
    'ProjectEvidenceGate malformed payload must be visible');
  await act(async () => root.render(React.createElement(ProjectEvidenceGate, gateProps(7))));
  const gateSignal = gateNet.signals.get(7);
  await act(async () => root.unmount());
  check(gateSignal?.aborted === true,
    'ProjectEvidenceGate unmount must abort its in-flight GET');
  rootNode.replaceChildren();
  root = createRoot(rootNode);
  const { default: SmartPullAnalyticsBar } =
    await vite.ssrLoadModule('/src/components/SmartPullAnalyticsBar.jsx');
  const smartNet = deferredFetch();
  global.fetch = smartNet.fetchImpl;
  const smartProps = id => ({
    marketplace: 'ETSY', activeProjectId: id, initialSeed: 'para mi hija',
    onShowToast: message => toasts.push(message)
  });
  const artifact = (projectId, provider) => ({
    success: true, projectId,
    evidence: [{
      metadata: JSON.stringify({
        kind: 'SMART_PULL_ARTIFACT_V1',
        response: {
          evidenceState: 'PARTIAL_EVIDENCE', provider,
          observedAt: null, importedAt: '2026-09-07',
          summary: { totalCompetitorsScanned: projectId },
          tagAnalytics: { selected13Tags: [] },
          priceAnalytics: { economics: {} }
        }
      })
    }]
  });

  await act(async () => root.render(React.createElement(SmartPullAnalyticsBar, smartProps(10))));
  await act(async () => smartNet.pending.get(10)(response(artifact(10, 'PROJECT_A_PROVIDER'))));
  check(document.body.textContent.includes('PROJECT_A_PROVIDER'),
    'SmartPull must render current persisted artifact');
  await act(async () => root.render(React.createElement(SmartPullAnalyticsBar, smartProps(11))));
  check(!document.body.textContent.includes('PROJECT_A_PROVIDER'),
    'SmartPull must clear before project switch reload');
  await act(async () => root.render(React.createElement(SmartPullAnalyticsBar, smartProps(12))));
  await act(async () => {
    smartNet.pending.get(11)(response(artifact(11, 'LATE_PROVIDER')));
    smartNet.pending.get(12)(response(artifact(12, 'CURRENT_PROVIDER')));
  });
  check(!document.body.textContent.includes('LATE_PROVIDER') &&
    document.body.textContent.includes('CURRENT_PROVIDER'),
  'SmartPull must suppress late persisted-artifact responses');

  await act(async () => root.render(React.createElement(SmartPullAnalyticsBar, smartProps(13))));
  await act(async () => smartNet.pending.get(13)(response({
    success: false, projectId: 13, error: 'SMART_RELOAD_DENIED'
  }, false, 500)));
  check(!document.body.textContent.includes('CURRENT_PROVIDER') &&
    toasts.some(message => message.includes('SMART_RELOAD_DENIED')),
  'SmartPull non-2xx must clear and surface an error');

  await act(async () => root.render(React.createElement(SmartPullAnalyticsBar, smartProps(14))));
  await act(async () => smartNet.pending.get(14)(response({
    success: true, projectId: 14, evidence: {}
  })));
  check(toasts.some(message => message.includes('SMART_PULL_RELOAD_MALFORMED')),
    'SmartPull malformed evidence must be visible');
  await act(async () => root.render(React.createElement(SmartPullAnalyticsBar, smartProps(15))));
  const smartSignal = smartNet.signals.get(15);
  await act(async () => root.unmount());
  check(smartSignal?.aborted === true,
    'SmartPull unmount must abort its in-flight persisted-evidence GET');

  rootNode.replaceChildren();
  root = createRoot(rootNode);
  const { default: EtsyMultiSellerScanner } =
    await vite.ssrLoadModule('/src/components/EtsyMultiSellerScanner.jsx');
  await act(async () => root.render(React.createElement(EtsyMultiSellerScanner, {
    seedPhrase: 'project-a', category: 'Jewelry',
    initialSellers: [{ id: 1, title: 'PROJECT_A_SELLER', selected: true }],
    onSellersUpdated: () => {}, onShowToast: () => {}
  })));
  check(document.body.textContent.includes('PROJECT_A_SELLER'),
    'Etsy scanner must render current project seller');
  await act(async () => root.render(React.createElement(EtsyMultiSellerScanner, {
    seedPhrase: 'project-b', category: 'Jewelry',
    initialSellers: [], onSellersUpdated: () => {}, onShowToast: () => {}
  })));
  check(!document.body.textContent.includes('PROJECT_A_SELLER'),
    'Etsy scanner must clear sellers on seed/project context change');
  await act(async () => root.unmount());

  const { PROJECT_SCOPED_RESEARCH_GET_CONSUMERS } =
    await vite.ssrLoadModule('/src/utils/projectBoundLoader.js');
  check(PROJECT_SCOPED_RESEARCH_GET_CONSUMERS.length === 5 &&
    PROJECT_SCOPED_RESEARCH_GET_CONSUMERS.includes('ProjectEvidenceGate:evidence') &&
    PROJECT_SCOPED_RESEARCH_GET_CONSUMERS.includes('SmartPullAnalyticsBar:persisted-evidence'),
  'project-scoped research GET consumer registry must be explicit and complete');

  await vite.close();
  dom.window.close();
  console.log(
    `RR_RELOAD_CONSUMERS measured=${measured} passed=${measured} failed=0 unexecuted=0`
  );
})().catch(error => {
  console.error(error);
  process.exit(1);
});
