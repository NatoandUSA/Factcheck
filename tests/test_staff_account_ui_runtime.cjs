/** Executable React contract for staff status display and deactivation. */
const assert = require('assert');
process.env.NODE_ENV = 'test';

(async () => {
  const { JSDOM } = require('jsdom');
  const { createServer } = await import('vite');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
  Object.assign(global, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, MouseEvent: dom.window.MouseEvent
  });
  Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
  global.IS_REACT_ACT_ENVIRONMENT = true;
  window.confirm = () => true;

  const React = (await import('react')).default;
  const { createRoot } = await import('react-dom/client');
  const { act } = React;
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  const initialUsers = [
    { id: 1, name: 'Owner', email: 'owner@example.test', role: 'OWNER', status: 'ACTIVE' },
    { id: 2, name: 'Seller', email: 'seller@example.test', role: 'SELLER', status: 'ACTIVE' },
    { id: 3, name: 'Manager', email: 'manager@example.test', role: 'MANAGER', status: 'INACTIVE' }
  ];
  let users = initialUsers;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (options.method === 'POST') {
      assert.strictEqual(String(url), '/api/owner/users/2/deactivate');
      assert.match(JSON.parse(options.body).reason, /Owner deactivated staff account/);
      users = initialUsers.map(user => user.id === 2 ? { ...user, status: 'INACTIVE' } : user);
      return { ok: true, json: async () => ({ success: true, status: 'INACTIVE', revokedSessions: 1 }) };
    }
    return { ok: true, json: async () => ({ success: true, users }) };
  };

  const toasts = [];
  const { default: UserManagementModal } = await vite.ssrLoadModule('/src/components/UserManagementModal.jsx');
  const root = createRoot(document.getElementById('root'));
  await act(async () => {
    root.render(React.createElement(UserManagementModal, {
      isOpen: true, onClose: () => {}, onShowToast: message => toasts.push(message)
    }));
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  assert(document.body.textContent.includes('● INACTIVE'), 'Persisted inactive membership must be rendered');
  let deactivateButtons = [...document.querySelectorAll('button')]
    .filter(button => button.textContent.includes('Vô hiệu hóa'));
  assert.strictEqual(deactivateButtons.length, 1, 'Only the active non-Owner membership may be deactivated');

  await act(async () => {
    deactivateButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  assert(calls.some(call => call.url === '/api/owner/users/2/deactivate' && call.options.method === 'POST'));
  assert(toasts.some(message => message.includes('thu hồi 1 phiên đăng nhập')));
  assert(document.body.textContent.includes('Seller'));
  deactivateButtons = [...document.querySelectorAll('button')]
    .filter(button => button.textContent.includes('Vô hiệu hóa'));
  assert.strictEqual(deactivateButtons.length, 0, 'Deactivated memberships must not retain an active action');

  await act(async () => root.unmount());
  await vite.close();
  dom.window.close();
  console.log('STAFF_ACCOUNT_UI_RUNTIME_PASSED');
})().catch(error => {
  console.error('STAFF_ACCOUNT_UI_RUNTIME_FAILED', error);
  process.exitCode = 1;
});
