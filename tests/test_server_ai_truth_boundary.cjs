'use strict';

process.env.NODE_ENV = 'test';
process.env.OMNI_MASTER_KEY = Buffer.alloc(32, 19).toString('base64');
process.env.GEMINI_API_KEY = 'server-ai-boundary-test-key';

const assert = require('assert');
const { makeProductTruthCard } = require('./helpers/productTruth.cjs');

const safeListing = {
  amazonTitle: 'Sweatshirt Gift for Family Everyday Style',
  amazonBullets: [
    'A meaningful sweatshirt gift for someone special',
    'Everyday sweatshirt style for gifting',
    'A thoughtful choice for family',
    'Sweatshirt design for everyday use',
    'A special gift with meaningful style'
  ],
  amazonSearchTerms: 'sweatshirt family gift everyday style',
  amazonDescription: '<p>A meaningful sweatshirt gift for someone special.</p>',
  amazonAPlusContent: { brandStoryHeadline: 'Meaningful Gifting', brandStoryBody: 'A thoughtful sweatshirt choice.', modules: [] },
  etsyTitle: 'Sweatshirt Gift for Family Everyday Style',
  etsyTags: ['sweatshirt gift', 'family gift', 'everyday style'],
  etsyMaterials: [],
  etsyPersonalizationInstructions: '',
  etsyDescription: 'A meaningful sweatshirt gift for someone special.'
};
const poisonedListing = {
  ...safeListing,
  amazonDescription: '<p>Organic linen, dishwasher-safe, handwoven, with a lifetime warranty.</p>',
  etsyMaterials: ['organic linen']
};

let activeOutput = { creativeProfile: 'WARM' };
let llmCalls = 0;
const llmServicePath = require.resolve('../server/llmService');
const llmService = require(llmServicePath);
llmService.callLLM = async () => {
  llmCalls += 1;
  return typeof activeOutput === 'string' ? activeOutput : JSON.stringify(activeOutput);
};
require.cache[llmServicePath].exports = llmService;

let researchCalls = 0;
let researchOutput = 'Research-only response.';
const genaiPath = require.resolve('@google/genai');
const genai = require(genaiPath);
genai.GoogleGenAI = class FakeGoogleGenAI {
  constructor() {
    this.interactions = { create: async () => { researchCalls += 1; return { output_text: researchOutput }; } };
  }
};
require.cache[genaiPath].exports = genai;

const { app, db, databaseReady } = require('../server/server');

const dbAll = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));
const dbRun = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function onRun(error) { error ? reject(error) : resolve(this); }));

async function waitForAmazonOwner() {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const rows = await dbAll(`SELECT u.id user_id, w.tenant_id, wm.workspace_id
      FROM workspace_memberships wm JOIN users u ON u.id = wm.user_id JOIN workspaces w ON w.id = wm.workspace_id
      WHERE u.email = 'owner@omniseller.local' AND w.marketplace = 'AMAZON'`);
    if (rows[0]) return rows[0];
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Amazon owner fixture unavailable');
}

async function login(port, workspaceId) {
  const response = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${port}` },
    body: JSON.stringify({ email: 'owner@omniseller.local', password: 'password123', workspaceId })
  });
  assert.strictEqual(response.status, 200);
  return response.headers.get('set-cookie').split(';')[0];
}

async function post(port, cookie, route, body) {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, {
    method: 'POST', headers: { Cookie: cookie, Origin: `http://127.0.0.1:${port}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { response, payload: await response.json().catch(() => ({})) };
}

async function main() {
  await databaseReady;
  const owner = await waitForAmazonOwner();
  const sourceInsert = await dbRun(
    `INSERT INTO listings (tenant_id, workspace_id, marketplace, amazonTitle, etsyTitle, categoryName, status, authorId, payload, listing_version)
     VALUES (?, ?, 'AMAZON', ?, ?, ?, 'PUBLISH_READY', ?, ?, 1)`,
    [owner.tenant_id, owner.workspace_id, 'Verified Sweatshirt', 'Verified Sweatshirt', 'SWEATSHIRT', owner.user_id, JSON.stringify(safeListing)]
  );
  const sourceId = sourceInsert.lastID;
  const evidence = { state: 'VERIFIED', subjectId: String(sourceId), listingVersion: 1, source: { kind: 'SUPPLIER_SPEC', id: 'server-route-spec' } };
  const card = makeProductTruthCard(sourceId, 1, {
    facts: { productType: { value: 'SWEATSHIRT', evidence }, materials: { value: ['cotton'], evidence } }
  });
  await dbRun('UPDATE listings SET product_truth_card = ?, approved_version = 1 WHERE id = ?', [JSON.stringify(card), sourceId]);
  const trendInsert = await dbRun(
    `INSERT INTO market_trends (category, trending_keywords, marketplace, tenant_id, workspace_id)
     VALUES ('Apparel', 'family sweatshirt gift', 'AMAZON', ?, ?)`,
    [owner.tenant_id, owner.workspace_id]
  );

  const server = app.listen(0);
  const port = server.address().port;
  process.env.ALLOWED_ORIGINS = `http://127.0.0.1:${port}`;
  const cookie = await login(port, owner.workspace_id);
  const listingCount = async () => Number((await dbAll('SELECT COUNT(*) count FROM listings WHERE workspace_id = ?', [owner.workspace_id]))[0].count);
  const trendCount = async () => Number((await dbAll('SELECT COUNT(*) count FROM market_trends WHERE workspace_id = ?', [owner.workspace_id]))[0].count);

  try {
    const before = await listingCount();
    let result = await post(port, cookie, '/api/amazon/quick-draft', { seedPhrase: 'family sweatshirt gift', category: 'Apparel' });
    assert.strictEqual(result.response.status, 409);
    assert.strictEqual(result.payload.error, 'PRODUCT_TRUTH_REQUIRED');
    assert.strictEqual(llmCalls, 0);
    assert.strictEqual(await listingCount(), before);

    result = await post(port, cookie, `/api/trends/${trendInsert.lastID}/draft`, { listingId: sourceId, expectedVersion: 2 });
    assert.strictEqual(result.response.status, 409);
    assert.strictEqual(result.payload.error, 'STALE_LISTING_VERSION');
    assert.strictEqual(llmCalls, 0);

    const staleCard = { ...card, listingVersion: 2 };
    await dbRun('UPDATE listings SET product_truth_card = ? WHERE id = ?', [JSON.stringify(staleCard), sourceId]);
    result = await post(port, cookie, '/api/amazon/quick-draft', {
      listingId: sourceId, expectedVersion: 1, seedPhrase: 'family sweatshirt gift', category: 'Apparel'
    });
    assert.strictEqual(result.response.status, 409);
    assert.strictEqual(result.payload.error, 'PRODUCT_TRUTH_REQUIRED');
    assert.strictEqual(llmCalls, 0);
    await dbRun('UPDATE listings SET product_truth_card = ? WHERE id = ?', [JSON.stringify(card), sourceId]);

    result = await post(port, cookie, '/api/amazon/quick-draft', {
      listingId: sourceId, expectedVersion: 1, seedPhrase: 'Official Disney sweatshirt', category: 'Apparel'
    });
    assert.strictEqual(result.response.status, 409);
    assert.strictEqual(result.payload.error, 'IP_CLEARANCE_REQUIRED');
    assert.strictEqual(llmCalls, 0);

    result = await post(port, cookie, '/api/chat', { mode: 'COMMERCE_DRAFT', messages: [{ role: 'user', content: 'Draft a listing' }] });
    assert.strictEqual(result.response.status, 409);
    assert.strictEqual(llmCalls, 0);

    activeOutput = poisonedListing;
    const trendsBeforePoisonedOutput = await trendCount();
    result = await post(port, cookie, '/api/amazon/quick-draft', {
      listingId: sourceId, expectedVersion: 1, seedPhrase: 'family sweatshirt gift', category: 'Apparel'
    });
    assert.strictEqual(result.response.status, 422);
    assert.strictEqual(result.payload.error, 'UNVERIFIED_OUTPUT_CLAIM');
    assert.strictEqual(await listingCount(), before);
    assert.strictEqual(await trendCount(), trendsBeforePoisonedOutput, 'Invalid model output must not persist a trend side effect');

    for (const bypassClaim of [
      'Made from hemp and modal fabric.',
      'Crafted in Vietnam by local makers.',
      'Rated 4.9 by thousands of buyers.',
      'Ready to ship tomorrow.',
      'Microwave safe and food safe.'
    ]) {
      const callsBeforeBypass = llmCalls;
      activeOutput = { ...safeListing, etsyDescription: bypassClaim };
      result = await post(port, cookie, '/api/amazon/quick-draft', {
        listingId: sourceId, expectedVersion: 1, seedPhrase: 'family sweatshirt gift', category: 'Apparel'
      });
      assert.strictEqual(result.response.status, 422, bypassClaim);
      assert.strictEqual(result.payload.error, 'UNVERIFIED_OUTPUT_CLAIM');
      assert.strictEqual(llmCalls, callsBeforeBypass + 1);
      assert.strictEqual(await listingCount(), before);
      assert.strictEqual(await trendCount(), trendsBeforePoisonedOutput);
    }

    const strictPlanRouteCases = [
      '```json\n{"creativeProfile":"WARM"}\n```',
      'Crafted in Vietnam by local makers. {"creativeProfile":"WARM"}',
      '{"creativeProfile":"WARM"} Ready to ship tomorrow.',
      '{"creativeProfile":"WARM"}{"creativeProfile":"MINIMAL"}'
    ];
    for (const invalidPlan of strictPlanRouteCases) {
      activeOutput = invalidPlan;
      const listingsBeforeInvalidPlan = await listingCount();
      const trendsBeforeInvalidPlan = await trendCount();
      result = await post(port, cookie, '/api/amazon/quick-draft', {
        listingId: sourceId, expectedVersion: 1, seedPhrase: 'family sweatshirt gift', category: 'Apparel'
      });
      assert.strictEqual(result.response.status, 422, invalidPlan);
      assert.strictEqual(result.payload.error, 'UNVERIFIED_OUTPUT_CLAIM', invalidPlan);
      assert.strictEqual(await listingCount(), listingsBeforeInvalidPlan, invalidPlan);
      assert.strictEqual(await trendCount(), trendsBeforeInvalidPlan, invalidPlan);

      result = await post(port, cookie, `/api/trends/${trendInsert.lastID}/draft`, {
        listingId: sourceId, expectedVersion: 1
      });
      assert.strictEqual(result.response.status, 422, invalidPlan);
      assert.strictEqual(result.payload.error, 'UNVERIFIED_OUTPUT_CLAIM', invalidPlan);
      assert.strictEqual(await listingCount(), listingsBeforeInvalidPlan, invalidPlan);
      assert.strictEqual(await trendCount(), trendsBeforeInvalidPlan, invalidPlan);
    }

    activeOutput = { creativeProfile: 'WARM' };
    result = await post(port, cookie, '/api/amazon/quick-draft', {
      listingId: sourceId, expectedVersion: 1, seedPhrase: 'family sweatshirt gift', category: 'Apparel'
    });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.payload));
    assert.strictEqual(await listingCount(), before + 1);
    assert.deepStrictEqual(result.payload.listing.etsyMaterials, ['cotton']);

    activeOutput = poisonedListing;
    result = await post(port, cookie, '/api/chat', {
      mode: 'COMMERCE_DRAFT', listingId: sourceId, expectedVersion: 1,
      messages: [{ role: 'user', content: 'Draft generic family gift copy' }]
    });
    assert.strictEqual(result.response.status, 422);
    assert.strictEqual(result.payload.error, 'INVALID_COMMERCE_OUTPUT_CONTRACT');

    activeOutput = { creativeProfile: 'WARM' };
    result = await post(port, cookie, '/api/chat', {
      mode: 'COMMERCE_DRAFT', listingId: sourceId, expectedVersion: 1,
      messages: [{ role: 'user', content: 'Draft generic family gift copy' }]
    });
    assert.strictEqual(result.response.status, 200, JSON.stringify(result.payload));
    assert.ok(result.payload.listing);
    assert.strictEqual(result.payload.reply, 'Commerce draft generated from verified Product Truth.');

    const invalidCommercePlans = [
      '```json\n{"creativeProfile":"WARM"}\n```',
      'Made from hemp and modal fabric. {"creativeProfile":"WARM"}',
      '{"creativeProfile":"WARM"} Ready to ship tomorrow.',
      'Crafted in Vietnam by local makers. ```json\n{"creativeProfile":"WARM"}\n``` Rated 4.9 by thousands of buyers.',
      '{ "creativeProfile": "WARM" }',
      '{"creativeProfile":"WARM","prose":"Microwave safe and food safe."}',
      '[{"creativeProfile":"WARM"}]',
      '{"creativeProfile":"INVALID"}',
      '{"creativeProfile":"WARM"}{"creativeProfile":"MINIMAL"}',
      '{"creativeProfile":"WARM","creativeProfile":"MINIMAL"}',
      '{"creativeProfile":"WARM"'
    ];
    const listingsBeforeInvalidPlans = await listingCount();
    const trendsBeforeInvalidPlans = await trendCount();
    for (const invalidPlan of invalidCommercePlans) {
      activeOutput = invalidPlan;
      result = await post(port, cookie, '/api/chat', {
        mode: 'COMMERCE_DRAFT', listingId: sourceId, expectedVersion: 1,
        messages: [{ role: 'user', content: 'Draft generic family gift copy' }]
      });
      assert.strictEqual(result.response.status, 422, invalidPlan);
      assert.strictEqual(result.payload.error, 'INVALID_COMMERCE_OUTPUT_CONTRACT', invalidPlan);
      assert.strictEqual(await listingCount(), listingsBeforeInvalidPlans, invalidPlan);
      assert.strictEqual(await trendCount(), trendsBeforeInvalidPlans, invalidPlan);
      assert.ok(!JSON.stringify(result.payload).includes('Made from hemp'), invalidPlan);
      assert.ok(!JSON.stringify(result.payload).includes('Ready to ship tomorrow'), invalidPlan);
    }
    activeOutput = { creativeProfile: 'WARM' };

    result = await post(port, cookie, '/api/chat', { mode: 'RESEARCH', messages: [{ role: 'user', content: 'Explain Etsy tags' }] });
    assert.strictEqual(result.response.status, 200);
    assert.strictEqual(result.payload.listing, null);
    assert.strictEqual(researchCalls, 1);

    researchOutput = JSON.stringify(safeListing);
    result = await post(port, cookie, '/api/chat', { mode: 'RESEARCH', messages: [{ role: 'user', content: 'Explain Etsy tags' }] });
    assert.strictEqual(result.response.status, 422);
    assert.strictEqual(result.payload.error, 'RESEARCH_MODE_COMMERCE_OUTPUT');
    assert.strictEqual(researchCalls, 2);
    console.log(`Server AI truth boundary passed: llmCalls=${llmCalls}, researchCalls=${researchCalls}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => db.close(resolve));
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
