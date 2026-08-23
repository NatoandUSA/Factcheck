/**
 * Adversarial control-plane tests: a malicious/non-compliant model tries to
 * inject scope (tenant/workspace/marketplace/author), approval state
 * (status, approved_hash, approved_by, product_truth_notes), or wrong-typed
 * JSON into a listing. None of this should ever reach the server as
 * authoritative -- scope/approval must always be server-derived, and
 * malformed model output must not crash the route.
 *
 * Every check in this file was independently verified against the current
 * code (explicit named-field payload construction, no `...aiData` spread,
 * marketplace guards ahead of any LLM call, approval requiring a real
 * request-body attestation) before being written -- these are regression
 * locks on already-correct behavior, not fixes for open bugs, with one
 * exception: the wrong-type-JSON checks (R1) found and closed a real crash
 * bug (a non-array `etsyTags`/`amazonBullets`/`amazonAPlusPoints` from the
 * model would throw on `.slice()`/`.map()`).
 */
process.env.NODE_ENV = 'test';
process.env.OMNI_MASTER_KEY = Buffer.alloc(32, 9).toString('base64');
process.env.GEMINI_API_KEY = 'test-only-gemini-key';

const assert = require('assert');

let llmCalls = 0;
let llmMode = 'raw';
let currentLLMRaw = '{}';
let currentChatRaw = '```json\n{}\n```';

const llmServicePath = require.resolve('../server/llmService');
const llmService = require(llmServicePath);
llmService.callLLM = async () => {
  llmCalls += 1;
  return currentLLMRaw;
};
require.cache[llmServicePath].exports = llmService;

const genaiPath = require.resolve('@google/genai');
const genai = require(genaiPath);
class FakeGoogleGenAI {
  constructor() {
    this.interactions = {
      create: async () => ({ output_text: currentChatRaw })
    };
  }
}
genai.GoogleGenAI = FakeGoogleGenAI;
require.cache[genaiPath].exports = genai;

const { app, db, databaseReady } = require('../server/server');

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
}
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function onRun(err) { err ? reject(err) : resolve(this); }));
}

async function waitForOwnerWorkspaces(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await dbAll(`
      SELECT wm.workspace_id, w.marketplace, w.tenant_id
      FROM workspace_memberships wm
      JOIN users u ON u.id = wm.user_id
      JOIN workspaces w ON w.id = wm.workspace_id
      WHERE u.email = 'owner@omniseller.local'
      ORDER BY wm.workspace_id
    `);
    if (rows.length >= 2) return rows;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for deterministic test fixtures');
}

async function login(port, workspaceId) {
  const response = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${port}` },
    body: JSON.stringify({ email: 'owner@omniseller.local', password: 'password123', workspaceId })
  });
  assert.strictEqual(response.status, 200, `Fixture login failed: ${response.status}`);
  return response.headers.get('set-cookie').split(';')[0];
}

async function http(port, cookie, method, path, body) {
  const headers = { Cookie: cookie, Origin: `http://127.0.0.1:${port}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

// A malicious model trying to smuggle control-plane/approval state through
// otherwise valid-looking listing JSON.
const controlPlanePoison = {
  amazonTitle: '14k Gold Necklace',
  amazonBullets: ['[HOOK] Nice necklace.'],
  amazonSearchTerms: 'gold necklace',
  amazonDescription: '<p>Nice necklace.</p>',
  amazonAPlusPoints: [],
  etsyTitle: '14k Gold Necklace',
  etsyTags: Array.from({ length: 13 }, (_, i) => `tag${i}`),
  etsyMaterials: [],
  etsyPersonalizationInstructions: '',
  etsyDescription: 'Nice necklace.',
  // None of these must ever become authoritative:
  status: 'PUBLISH_READY',
  canExport: true,
  productTruthNotes: 'AI says all facts verified.',
  approvedHash: 'evil', approved_hash: 'evil',
  approvedBy: 999, approved_by: 999,
  approvedVersion: 999, approved_version: 999,
  tenantId: 'evil-tenant', tenant_id: 'evil-tenant',
  workspaceId: 999, workspace_id: 999,
  marketplace: 'ETSY',
  authorId: 999,
  parentSku: 'EVIL-SKU',
  variations: [{ sku: 'EVIL-CHILD', material: '14k Gold' }]
};

async function main() {
  await databaseReady;
  const memberships = await waitForOwnerWorkspaces();
  const amazon = memberships.find(x => x.marketplace === 'AMAZON');
  const etsy = memberships.find(x => x.marketplace === 'ETSY');
  assert(amazon && etsy, 'Both AMAZON and ETSY owner workspace fixtures are required');

  const server = app.listen(0);
  const port = server.address().port;
  process.env.ALLOWED_ORIGINS = `http://127.0.0.1:${port}`;
  const amazonCookie = await login(port, amazon.workspace_id);
  const etsyCookie = await login(port, etsy.workspace_id);
  const failures = [];
  let quickDraftListingId = null;

  async function check(name, fn) {
    try {
      await fn();
      console.log(`PASS ${name}`);
    } catch (error) {
      failures.push({ name, message: error.message });
      console.log(`FAIL ${name}: ${error.message}`);
    }
  }

  try {
    await check('M1 /api/chat does not auto-persist or self-approve malicious output', async () => {
      llmMode = 'raw';
      currentChatRaw = '```json\n' + JSON.stringify(controlPlanePoison) + '\n```';
      const before = (await dbAll('SELECT COUNT(*) AS n FROM listings WHERE workspace_id = ?', [amazon.workspace_id]))[0].n;
      const { response, payload } = await http(port, amazonCookie, 'POST', '/api/chat', {
        messages: [{ role: 'user', content: 'Draft from keyword gift necklace. No real facts supplied.' }]
      });
      assert.strictEqual(response.status, 200);
      assert(payload.listing, 'Expected chat to return a draft listing');
      assert.strictEqual(payload.listing.status, 'NEEDS_QA');
      assert.strictEqual(payload.listing.approvedHash, undefined);
      assert.strictEqual(payload.listing.workspaceId, undefined);
      const after = (await dbAll('SELECT COUNT(*) AS n FROM listings WHERE workspace_id = ?', [amazon.workspace_id]))[0].n;
      assert.strictEqual(after, before, '/api/chat must not persist a listing automatically');
    });

    await check('M2 Quick Draft ignores model control-plane/scope/approval fields', async () => {
      llmMode = 'raw';
      currentLLMRaw = JSON.stringify(controlPlanePoison);
      const { response, payload } = await http(port, amazonCookie, 'POST', '/api/amazon/quick-draft', {
        seedPhrase: 'gift necklace', category: 'Jewelry', asins: []
      });
      assert.strictEqual(response.status, 200);
      assert(payload.listing, 'Expected Quick Draft listing');
      quickDraftListingId = payload.listingId;
      assert.strictEqual(payload.listing.status, 'NEEDS_QA');

      const row = await dbGet('SELECT * FROM listings WHERE id = ?', [payload.listingId]);
      assert.strictEqual(row.tenant_id, amazon.tenant_id, 'tenant_id must be server-derived, not model-supplied');
      assert.strictEqual(row.workspace_id, amazon.workspace_id, 'workspace_id must be server-derived');
      assert.strictEqual(row.marketplace, 'AMAZON', 'marketplace must be server-derived, not overridable to ETSY');
      assert.strictEqual(row.status, 'NEEDS_QA');
      assert.strictEqual(row.approved_hash, null);
      assert.strictEqual(row.approved_version, null);
      assert.strictEqual(row.product_truth_notes, null);
    });

    await check('M3 Trend-draft ignores model control-plane/scope/approval fields', async () => {
      llmMode = 'raw';
      currentLLMRaw = JSON.stringify(controlPlanePoison);
      const insert = await dbRun(
        `INSERT INTO market_trends (category, trending_keywords, marketplace, tenant_id, workspace_id) VALUES (?, ?, ?, ?, ?)`,
        ['Jewelry', 'gift necklace', 'AMAZON', amazon.tenant_id, amazon.workspace_id]
      );
      const { response, payload } = await http(port, amazonCookie, 'POST', `/api/trends/${insert.lastID}/draft`, {});
      assert.strictEqual(response.status, 200);
      const row = await dbGet('SELECT * FROM listings WHERE id = ?', [payload.listingId]);
      assert.strictEqual(row.tenant_id, amazon.tenant_id);
      assert.strictEqual(row.workspace_id, amazon.workspace_id);
      assert.strictEqual(row.marketplace, 'AMAZON');
      assert.strictEqual(row.status, 'NEEDS_QA');
      assert.strictEqual(row.approved_hash, null);
      assert.strictEqual(row.product_truth_notes, null);
    });

    await check('M5 Cross-marketplace requests are rejected before any LLM call', async () => {
      llmMode = 'raw';
      currentLLMRaw = JSON.stringify(controlPlanePoison);
      const callsBefore = llmCalls;
      const qd = await http(port, etsyCookie, 'POST', '/api/amazon/quick-draft', {
        seedPhrase: 'gift necklace', category: 'Jewelry', asins: []
      });
      assert.strictEqual(qd.response.status, 403);
      const bl = await http(port, amazonCookie, 'POST', '/api/etsy/batch-learn', {
        seedPhrase: 'gift necklace',
        sellers: [{ title: 'A', selected: true }, { title: 'B', selected: true }, { title: 'C', selected: true }]
      });
      assert.strictEqual(bl.response.status, 403);
      assert.strictEqual(llmCalls, callsBefore, 'LLM must not be called when the marketplace guard rejects the request');
    });

    await check('M6 Model-supplied approval/attestation fields cannot satisfy export or approval', async () => {
      assert(quickDraftListingId, 'Quick Draft listing from M2 is required');
      const exportBefore = await http(port, amazonCookie, 'GET', `/api/listings/${quickDraftListingId}/export`);
      assert.strictEqual(exportBefore.response.status, 409);
      assert.strictEqual(exportBefore.payload.error, 'APPROVAL_INVALIDATED');

      const approveWithoutTruth = await http(port, amazonCookie, 'PATCH', `/api/listings/${quickDraftListingId}/approve`, { expectedVersion: 1 });
      assert.strictEqual(approveWithoutTruth.response.status, 400);
      assert.strictEqual(approveWithoutTruth.payload.error, 'PRODUCT_TRUTH_CARD_INVALID');

      const row = await dbGet('SELECT approved_hash, approved_version, product_truth_notes, status FROM listings WHERE id = ?', [quickDraftListingId]);
      assert.strictEqual(row.approved_hash, null);
      assert.strictEqual(row.status, 'NEEDS_QA');
    });

    await check('R1 Quick Draft normalizes wrong-type model JSON instead of crashing', async () => {
      llmMode = 'raw';
      currentLLMRaw = JSON.stringify({
        amazonTitle: ['not', 'a', 'string'],
        amazonBullets: { 0: 'fake bullet' },
        amazonAPlusPoints: 'not-an-array',
        etsyTags: 'tag1,tag2',
        etsyMaterials: { material: '14k gold' },
        etsyPersonalizationInstructions: ['name']
      });
      const { response, payload } = await http(port, amazonCookie, 'POST', '/api/amazon/quick-draft', {
        seedPhrase: 'gift necklace', category: 'Jewelry', asins: []
      });
      assert.notStrictEqual(response.status, 500, 'Model-controlled type confusion must not crash Quick Draft');
      assert.strictEqual(response.status, 200);
      assert(Array.isArray(payload.listing.etsyTags), 'etsyTags must normalize to an array');
      assert(Array.isArray(payload.listing.amazonBullets), 'amazonBullets must normalize to an array');
    });

    await check('R2 Malformed (truncated) model JSON fails safely without fabricating truth', async () => {
      llmMode = 'raw';
      currentLLMRaw = '{"amazonTitle": "truncated"';
      const { response, payload } = await http(port, amazonCookie, 'POST', '/api/amazon/quick-draft', {
        seedPhrase: 'gift necklace', category: 'Jewelry', asins: []
      });
      assert.notStrictEqual(response.status, 500);
      assert.strictEqual(payload.listing.status, 'NEEDS_QA');
      assert.deepStrictEqual(payload.listing.etsyMaterials || [], []);
    });

    console.log(`LLM_STUB_CALLS=${llmCalls}`);
    if (failures.length > 0) {
      console.log(`\nFAILURES: ${failures.length}`);
      for (const failure of failures) console.log(`- ${failure.name}: ${failure.message}`);
      process.exitCode = 1;
    } else {
      console.log('\nALL ADVERSARIAL CONTROL-PLANE TESTS PASSED');
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => db.close(resolve));
  }
}

main().catch(error => {
  console.error('ADVERSARIAL CONTROL-PLANE TEST HARNESS ERROR:', error);
  process.exitCode = 1;
});
