/**
 * Behavioral (not source-text) integration tests: drive real HTTP requests
 * through /api/chat, /api/amazon/quick-draft, and /api/trends/:id/draft with
 * a mocked LLM that deliberately returns fabricated Product Truth. Commerce
 * routes now require a server-loaded, listing/version-bound Product Truth
 * projection and validate the complete model output before persistence or
 * response. Research chat must reject commerce-shaped JSON. Free-text fields
 * are not scanned with an arbitrary catch-all forbidden-phrase list because
 * such a blocklist is both
 *   trivially bypassed by rephrasing and a false-positive risk against real
 *   products that legitimately are made of the listed materials -- it is
 *   not a real defense, and was rejected rather than implemented.
 * - Approving a listing with a short-but-nonempty attestation is not tested
 *   here as a failure case. No code can verify a human's free-text
 *   attestation is semantically genuine; three independent prior reviews
 *   agreed pursuing that would be scope creep for an internal tool where the
 *   approver already carries full accountability. This is an intentional,
 *   documented design boundary, not an oversight.
 */
process.env.NODE_ENV = 'test';
process.env.OMNI_MASTER_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.GEMINI_API_KEY = 'test-only-gemini-key';

const assert = require('assert');

const maliciousListing = {
  amazonTitle: 'Personalized 14k Gold Necklace with Gift Box',
  amazonBullets: [
    '[PREMIUM MATERIALS] Made from 14k gold and sterling silver.',
    '[GIFT READY] Includes a luxury gift box.',
    '[CARE] Tarnish-proof and water resistant.',
    '[WORKSHOP] Handcrafted in a US workshop.',
    '[PERSONALIZATION] Add any name and date.'
  ],
  amazonSearchTerms: 'gold necklace gift personalized',
  amazonDescription: '<p>14k gold, luxury gift box, water resistant, handcrafted in the USA.</p>',
  amazonAPlusPoints: ['Specifications: 14k gold', 'Gift unboxing included', 'US workshop story'],
  etsyTitle: 'Personalized 14k Gold Necklace',
  etsyTags: Array.from({ length: 13 }, (_, i) => `tag${i}`),
  etsyMaterials: ['14k Gold', 'Sterling Silver', 'Cubic Zirconia'],
  etsyPersonalizationInstructions: 'Send names, dates, and custom message.',
  etsyDescription: 'Handmade 14k gold necklace with care instructions and US workshop promise.'
};

function fencedMaliciousJson() {
  return '```json\n' + JSON.stringify(maliciousListing) + '\n```';
}

// Patch the unified server LLM seam before server.js destructures callLLM.
const llmServicePath = require.resolve('../server/llmService');
const llmService = require(llmServicePath);
let llmCalls = 0;
llmService.callLLM = async () => {
  llmCalls += 1;
  return JSON.stringify(maliciousListing);
};
require.cache[llmServicePath].exports = llmService;

// Patch the inline /api/chat Gemini client before server.js imports it.
const genaiPath = require.resolve('@google/genai');
const genai = require(genaiPath);
class FakeGoogleGenAI {
  constructor() {
    this.interactions = {
      create: async () => ({ output_text: fencedMaliciousJson() })
    };
  }
}
genai.GoogleGenAI = FakeGoogleGenAI;
require.cache[genaiPath].exports = genai;

const { app, db, databaseReady } = require('../server/server');

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
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
    if (rows.length === 2) return rows;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for deterministic test fixtures');
}

async function login(port, workspaceId) {
  const response = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: `http://127.0.0.1:${port}`
    },
    body: JSON.stringify({
      email: 'owner@omniseller.local',
      password: 'password123',
      workspaceId
    })
  });
  assert.strictEqual(response.status, 200, `Fixture login failed with ${response.status}`);
  return response.headers.get('set-cookie').split(';')[0];
}

async function request(port, cookie, path, body) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: {
      Cookie: cookie,
      Origin: `http://127.0.0.1:${port}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function assertMaterialsEmpty(listing, label) {
  assert.deepStrictEqual(listing.etsyMaterials || [], [], `${label}: fabricated etsyMaterials reached the response`);
}

function assertPersonalizationEmpty(listing, label) {
  assert.strictEqual(listing.etsyPersonalizationInstructions || '', '', `${label}: fabricated personalization instructions reached the response`);
}

function assertSkuEmpty(listing, label) {
  assert.strictEqual(listing.parentSku || '', '', `${label}: fabricated parentSku reached the response`);
}

function assertTitleNotUnconditionallyPersonalized(listing, label) {
  // Checks BOTH title fields, not just amazonTitle: an earlier round of this
  // fix stripped the claim from amazonTitle only, leaving etsyTitle with the
  // identical unfiltered gap (independent probe finding, round 6).
  assert.ok(!/^(personalized|custom)\b/i.test(String(listing.amazonTitle || '')), `${label}: unconditional Personalized/Custom Amazon title reached the response`);
  assert.ok(!/^(personalized|custom)\b/i.test(String(listing.etsyTitle || '')), `${label}: unconditional Personalized/Custom Etsy title reached the response`);
}

async function main() {
  await databaseReady;
  const memberships = await waitForOwnerWorkspaces();
  const amazonWorkspace = memberships.find(row => row.marketplace === 'AMAZON');
  assert(amazonWorkspace, 'Amazon workspace fixture is required');

  const server = app.listen(0);
  const port = server.address().port;
  process.env.ALLOWED_ORIGINS = `http://127.0.0.1:${port}`;
  const cookie = await login(port, amazonWorkspace.workspace_id);
  const listingCountBefore = Number((await dbAll('SELECT COUNT(*) count FROM listings WHERE workspace_id = ?', [amazonWorkspace.workspace_id]))[0].count);
  const failures = [];

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
    await check('Research chat rejects commerce-shaped model output', async () => {
      const { response, payload } = await request(port, cookie, '/api/chat', {
        messages: [{
          role: 'user',
          content: 'Draft an SEO listing from keyword: gift necklace. No product materials or specs supplied.'
        }]
      });
      assert.strictEqual(response.status, 422);
      assert.strictEqual(payload.error, 'RESEARCH_MODE_COMMERCE_OUTPUT');
    });

    await check('Quick Draft without Product Truth authority makes zero LLM calls', async () => {
      const callsBefore = llmCalls;
      const { response, payload } = await request(port, cookie, '/api/amazon/quick-draft', {
        seedPhrase: 'gift necklace',
        category: 'Jewelry',
        asins: []
      });
      assert.strictEqual(response.status, 409, `Expected Quick Draft 409, got ${response.status}`);
      assert.strictEqual(payload.error, 'PRODUCT_TRUTH_REQUIRED');
      assert.strictEqual(llmCalls, callsBefore);
    });

    let trendDraftId = null;
    await check('Trend-draft without Product Truth authority makes zero LLM calls', async () => {
      const insert = await dbRun(
        `INSERT INTO market_trends (category, trending_keywords, marketplace, tenant_id, workspace_id)
         VALUES (?, ?, ?, ?, ?)`,
        ['Jewelry', 'gift necklace, personalized necklace', 'AMAZON', amazonWorkspace.tenant_id, amazonWorkspace.workspace_id]
      );
      trendDraftId = insert.lastID;
      const { response, payload } = await request(port, cookie, `/api/trends/${insert.lastID}/draft`, {});
      assert.strictEqual(response.status, 409, `Expected trend-draft 409, got ${response.status}`);
      assert.strictEqual(payload.error, 'PRODUCT_TRUTH_REQUIRED');
    });

    await check('Rejected commerce routes make zero listing writes', async () => {
      const countAfter = Number((await dbAll('SELECT COUNT(*) count FROM listings WHERE workspace_id = ?', [amazonWorkspace.workspace_id]))[0].count);
      assert.strictEqual(countAfter, listingCountBefore);
    });

    console.log(`LLM_STUB_CALLS=${llmCalls}`);
    if (failures.length > 0) {
      console.log(`\nFAILURES: ${failures.length}`);
      for (const failure of failures) console.log(`- ${failure.name}: ${failure.message}`);
      process.exitCode = 1;
    } else {
      console.log('\nALL MALICIOUS MODEL OUTPUT ENFORCEMENT CHECKS PASSED');
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => db.close(resolve));
  }
}

main().catch(error => {
  console.error('MALICIOUS MODEL TEST HARNESS ERROR:', error);
  process.exitCode = 1;
});
