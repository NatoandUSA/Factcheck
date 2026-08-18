/**
 * Behavioral (not source-text) integration tests: drive real HTTP requests
 * through /api/chat, /api/amazon/quick-draft, and /api/trends/:id/draft with
 * a mocked LLM that deliberately returns fabricated Product Truth (materials,
 * personalization, SKU-implying claims) even when the request supplies no
 * real product facts. Proves the server does not trust that output for
 * fields it has no evidence for, regardless of what the model says.
 *
 * Scope, decided deliberately after an external review proposed a broader
 * version of this test:
 *
 * - Quick Draft and trend-draft are keyword-only routes with zero channel
 *   for real materials/personalization data, so their output for those two
 *   fields is now hard-coded server-side and independent of model
 *   compliance. Enforced and tested here as a hard requirement.
 * - /api/chat is a general-purpose Co-Pilot chat interface where a user CAN
 *   legitimately type real product facts ("this is 14k gold") into their own
 *   message. Hard-coding its materials/personalization fields empty would
 *   regress that legitimate use, not just block fabrication. There is no
 *   way to tell "the model invented this" apart from "the user typed this"
 *   without a second, semantically-verifying AI call -- a different and
 *   larger feature than this fix, and not something to add silently here.
 *   /api/chat's defense remains prompt-instruction-based (already hardened)
 *   plus the human Product Truth attestation required before any listing
 *   can publish. This is checked below as an informational probe, not a
 *   hard failure.
 * - Free-text fields (description, bullets, A+ content) are not scanned for
 *   an arbitrary forbidden-phrase list. A hardcoded blocklist is both
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
    // Informational only: /api/chat's materials/personalization defense is
    // prompt-based by design (see file header). Logged, not asserted.
    {
      const { payload } = await request(port, cookie, '/api/chat', {
        messages: [{
          role: 'user',
          content: 'Draft an SEO listing from keyword: gift necklace. No product materials or specs supplied.'
        }]
      });
      const materialsLeaked = Array.isArray(payload?.listing?.etsyMaterials) && payload.listing.etsyMaterials.length > 0;
      console.log(`INFO /api/chat prompt-based defense: materials ${materialsLeaked ? 'leaked (expected residual risk vs a non-compliant model)' : 'clean'}`);
    }

    await check('Quick Draft rejects model-returned materials/personalization/SKU', async () => {
      const { response, payload } = await request(port, cookie, '/api/amazon/quick-draft', {
        seedPhrase: 'gift necklace',
        category: 'Jewelry',
        asins: []
      });
      assert.strictEqual(response.status, 200, `Expected Quick Draft 200, got ${response.status}`);
      assert(payload.listing, 'Expected Quick Draft listing response');
      assertMaterialsEmpty(payload.listing, 'Quick Draft');
      assertPersonalizationEmpty(payload.listing, 'Quick Draft');
      assertSkuEmpty(payload.listing, 'Quick Draft');
      assert.strictEqual(payload.listing.variations?.length || 0, 0, 'Quick Draft must not fabricate child variations');
      // Quick Draft's title/highlights are built deterministically by
      // keywordRanker, not the mocked model -- this is the app's OWN code
      // fabricating capability claims, a different bug than untrusted model
      // output (independent re-audit finding, round 6).
      assertTitleNotUnconditionallyPersonalized(payload.listing, 'Quick Draft');
      assert.ok(!/custom handmade gift/i.test(payload.listing.etsyTitle || ''), 'Quick Draft etsyTitle must not fabricate a "Custom Handmade Gift" claim');
      assert.ok(!/multiple colors & sizes available/i.test(payload.listing.itemHighlights || ''), 'Quick Draft itemHighlights must not fabricate a variation-availability claim');
    });

    let trendDraftId = null;
    await check('Trend-draft rejects model-returned materials/personalization/SKU/title', async () => {
      const insert = await dbRun(
        `INSERT INTO market_trends (category, trending_keywords, marketplace, tenant_id, workspace_id)
         VALUES (?, ?, ?, ?, ?)`,
        ['Jewelry', 'gift necklace, personalized necklace', 'AMAZON', amazonWorkspace.tenant_id, amazonWorkspace.workspace_id]
      );
      trendDraftId = insert.lastID;
      const { response, payload } = await request(port, cookie, `/api/trends/${insert.lastID}/draft`, {});
      assert.strictEqual(response.status, 200, `Expected trend-draft 200, got ${response.status}`);
      assert(payload.listing, 'Expected trend-draft listing response');
      assertMaterialsEmpty(payload.listing, 'Trend-draft');
      assertPersonalizationEmpty(payload.listing, 'Trend-draft');
      assertSkuEmpty(payload.listing, 'Trend-draft');
      assertTitleNotUnconditionallyPersonalized(payload.listing, 'Trend-draft');
      assert.strictEqual(payload.listing.variations?.length || 0, 0, 'Trend-draft must not fabricate child variations');
    });

    await check('Persisted Quick Draft / trend-draft rows contain no fabricated materials/personalization/SKU', async () => {
      const rows = await dbAll(
        `SELECT payload FROM listings WHERE workspace_id = ? ORDER BY id DESC LIMIT 2`,
        [amazonWorkspace.workspace_id]
      );
      assert(rows.length >= 2, 'Expected Quick Draft and trend-draft rows in listings');
      for (const row of rows) {
        const listing = JSON.parse(row.payload);
        assertMaterialsEmpty(listing, 'Persisted listing');
        assertPersonalizationEmpty(listing, 'Persisted listing');
        assertSkuEmpty(listing, 'Persisted listing');
      }
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
