const assert = require('assert');
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'test';

const { parseHeyEtsyPastedText } = require('../server/etsyPastedSearchParser');
const { app, db, databaseReady } = require('../server/server');
const { createSessionRecord } = require('../server/security/session');

const SAMPLE = `Show filters
Applied filters
Exclude digital downloads

Unapplied filters
Ships from VN
Vintage
Necklace
Blanket
Ring

413 results, with ads&#x20;

Most relevant
Search results
Para Mi Hija Necklace, Spanish Daughter Gift from Mom Dad, Gift for Daughter, Graduation Gift, Love Knot Jewelry
Para Mi Hija Necklace, Spanish Daughter Gift from Mom Dad, Gift for Daughter, Graduation Gift, Love Knot Jewelry
4.3
(119)

By Fantasticgiftsltd

From shop Fantasticgiftsltd
Sale Price 1,145,896₫1,145,896₫ 1,527,985₫ Original Price 1,527,985₫(25% off)
Add to cart
Total Views
143
AVG View
2
Views 24H
-
Total Sold
-
Revenue
-
Sold 24H
-
Favorites
0
Market
Favor. Rate
-
Created
06/07/2026 (1 month)
Updated
1 month ago
Conversion Rate
-
Tags Copy Suggestions
para mi hija
hija necklace
daughter gift
regalo hija
gift daughter
daughter necklace
spanish gift
mom daughter gift
dad daughter gift
graduation gift
quinceanera gift
Categories Copy
Jewelry, Necklaces, Pendant Necklaces
HeyEtsy.com

Daughter Acrylic night lamp| DAUGHTER NIGHT LAMP| Daughter gift room decor| Para mi hermosa hija
Daughter Acrylic night lamp| DAUGHTER NIGHT LAMP| Daughter gift room decor| Para mi hermosa hija
3.9
(91)
By Liamggiestore
From shop liamggiestore
1,238,292₫
Total Views
374
AVG View
0
Views 24H
-
Total Sold
-
Revenue
-
Sold 24H
-
Favorites
0
Favor. Rate
-
Created
06/11/2023 (2 years)
Updated
2 months ago
Conversion Rate
-
Tags Copy Suggestions
regalo pra hija
hija regalo
hija cumpleanos
hermosa hija
regalo hija navidad
hija cumple
de padre a hija
de mama a hija
que regalar a hija
hija mi tesoro
como sorprender hija
mis hijas
hija birthday
Categories Copy
Jewelry
HeyEtsy.com

A Mi Hija Collar, Regalo Para Mi Hija de Mamá y Papá, Collar Nudo de Amor - Spanish Daughter Gift
A Mi Hija Collar, Regalo Para Mi Hija de Mamá y Papá, Collar Nudo de Amor - Spanish Daughter Gift
4.4
(97)
By PutAVerseOnIt
From shop PutAVerseOnIt
1,101,653₫
Total Views
802
AVG View
11
Views 24H
-
Total Sold
-
Revenue
-
Sold 24H
-
Favorites
0
Favor. Rate
-
Created
15/06/2026 (2 months)
Updated
1 week ago
Conversion Rate
-
Tags
No tags found
Categories Copy
Jewelry, Necklaces
HeyEtsy.com

To My Daughter Sterling Silver Heart Necklace – CZ Crystal
To My Daughter Sterling Silver Heart Necklace – CZ Crystal
4.7
(113)
By Withinhisgrace
From shop Withinhisgrace
1,377,135₫
Total Views
13,198
AVG View
15
Views 24H
-
Total Sold
280
Revenue
14K USD
Sold 24H
-
Favorites
13
Market
Favor. Rate
~0.1%
Created
22/04/2024 (2 years)
Updated
1 week ago
Conversion Rate
~2%
Tags Copy Suggestions
love
birthday
gift
personalized
necklace
Gift for daughter
para mi Hija
Hija Boda Regalo
Cumpleanos feliz
personalizado regalo
collar para mi hija
gift for my daughter
regalo de navidad
Categories Copy
Jewelry, Necklaces, Pendant Necklaces
HeyEtsy.com`;

const dbAll = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
const createSession = (userId, workspaceId, tenantId) => new Promise((resolve, reject) => {
  createSessionRecord(db, userId, workspaceId, tenantId, (err, session) => err ? reject(err) : resolve(session));
});

async function waitForEtsyOwner() {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const rows = await dbAll(`SELECT u.id user_id, w.tenant_id, wm.workspace_id, wm.role, w.marketplace
      FROM workspace_memberships wm JOIN users u ON u.id = wm.user_id JOIN workspaces w ON w.id = wm.workspace_id`);
    const owner = rows.find(row => row.role === 'OWNER' && row.marketplace === 'ETSY');
    if (owner) return owner;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for Etsy owner fixture');
}

(async () => {
  console.log('================================================================');
  console.log('  TESTING PROJECT-BOUND HEYETSY PASTED SEARCH PARSER');
  console.log('================================================================\n');

  const parsed = parseHeyEtsyPastedText(SAMPLE);
  assert.strictEqual(parsed.parserVersion, 'HEYETSY_PASTED_TEXT_V1');
  assert.strictEqual(parsed.sellers.length, 4, 'Four listing blocks must produce exactly four listings');
  assert.strictEqual(parsed.searchContext.resultCount, 413);
  assert.strictEqual(parsed.searchContext.pageContainsAds, true);
  assert.strictEqual(parsed.searchContext.sortMode, 'Most relevant');
  assert.deepStrictEqual(parsed.searchContext.appliedFilters, ['Exclude digital downloads']);
  assert.deepStrictEqual(parsed.searchContext.unappliedFilters, ['Ships from VN', 'Vintage', 'Necklace', 'Blanket', 'Ring']);

  const first = parsed.sellers[0];
  assert.strictEqual(first.sourceRank, 1);
  assert.strictEqual(first.shopName, 'Fantasticgiftsltd');
  assert.strictEqual(first.rating, 4.3);
  assert.strictEqual(first.reviewCount, 119);
  assert.strictEqual(first.priceAmount, 1145896);
  assert.strictEqual(first.originalPriceAmount, 1527985);
  assert.strictEqual(first.priceCurrency, 'VND');
  assert.strictEqual(first.discountPercent, 25);
  assert.strictEqual(first.totalViews, 143);
  assert.strictEqual(first.views24h, null, 'Dash must stay UNKNOWN/null');
  assert.strictEqual(first.totalSold, null);
  assert.strictEqual(first.favorites, 0, 'Observed zero must stay numeric zero');
  assert.strictEqual(first.createdDate, '2026-07-06');
  assert.strictEqual(first.tags.length, 11);
  assert.deepStrictEqual(first.categories, ['Jewelry', 'Necklaces', 'Pendant Necklaces']);

  assert.strictEqual(parsed.sellers[1].avgViews, 0, 'Observed AVG View 0 must not become UNKNOWN');
  assert.strictEqual(parsed.sellers[2].tags.length, 0);
  assert.strictEqual(parsed.sellers[2].tagSource, 'NO_TAGS_REPORTED');
  const fourth = parsed.sellers[3];
  assert.strictEqual(fourth.totalViews, 13198);
  assert.strictEqual(fourth.totalSold, 280);
  assert.strictEqual(fourth.revenue, 14000);
  assert.strictEqual(fourth.revenueCurrency, 'USD');
  assert.strictEqual(fourth.revenueApproximate, true);
  assert.strictEqual(fourth.favoriteRate, 0.1);
  assert.strictEqual(fourth.favoriteRateApproximate, true);
  assert.strictEqual(fourth.conversionRate, 2);
  assert.strictEqual(fourth.conversionRateApproximate, true);

  const forbiddenNoise = ['Show filters', 'Total Views', 'Conversion Rate', 'para mi hija'];
  forbiddenNoise.forEach(noise => assert(!parsed.sellers.some(seller => seller.title === noise), `${noise} must not become a seller`));
  assert(parsed.tagSuggestions.some(item => item.tag === 'para mi hija'));
  console.log('  🟢 Block parser: exact 4 listings, VND/metrics/tags/context preserved, noise excluded.');

  await databaseReady;
  const owner = await waitForEtsyOwner();
  let server;
  await new Promise((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', resolve);
    server.on('error', reject);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  process.env.ALLOWED_ORIGINS = base;
  const session = await createSession(owner.user_id, owner.workspace_id, owner.tenant_id);
  const headers = { Origin: base, Cookie: `omni_session=${session.rawToken}`, 'Content-Type': 'application/json' };
  const post = async (url, body) => {
    const response = await fetch(base + url, { method: 'POST', headers, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };

  try {
    const projectResponse = await post('/api/projects', { name: 'HeyEtsy Paste Contract', seedPhrase: 'para mi hija' });
    const projectId = projectResponse.body.projectId;
    assert(projectId);
    const countBefore = (await dbAll('SELECT id FROM research_evidence')).length;

    const missingProject = await post('/api/etsy/feed-search-results', { rawText: SAMPLE, seed: 'para mi hija' });
    assert.strictEqual(missingProject.status, 400);
    assert.strictEqual(missingProject.body.error, 'MISSING_PROJECT_ID');
    assert.strictEqual((await dbAll('SELECT id FROM research_evidence')).length, countBefore, 'Missing project must make zero DB writes');

    const urlOnly = await post('/api/etsy/feed-search-results', { rawText: 'https://www.etsy.com/search?q=para+mi+hija', seed: 'para mi hija', projectId });
    assert.strictEqual(urlOnly.status, 422);
    assert.strictEqual(urlOnly.body.error, 'PASTED_RESULT_TEXT_REQUIRED');

    const preview = await post('/api/etsy/feed-search-results', { rawText: SAMPLE, seed: 'para mi hija', projectId, confirm: false });
    assert.strictEqual(preview.status, 200);
    assert.strictEqual(preview.body.preview, true);
    assert.strictEqual(preview.body.committed, false);
    assert.strictEqual(preview.body.projectId, projectId);
    assert.strictEqual(preview.body.count, 4);
    assert.deepStrictEqual(preview.body.batches.map(batch => batch.sellers.length), [4]);
    assert.strictEqual(preview.body.ordering, 'SOURCE_ORDER_NOT_PERFORMANCE_RANK');
    assert.strictEqual((await dbAll('SELECT id FROM research_evidence')).length, countBefore, 'Preview must make zero DB writes');

    const committed = await post('/api/etsy/feed-search-results', { rawText: SAMPLE, seed: 'para mi hija', projectId, confirm: true });
    assert.strictEqual(committed.status, 200);
    assert.strictEqual(committed.body.committed, true);
    assert(committed.body.evidenceId);
    const rows = await dbAll('SELECT * FROM research_evidence WHERE id = ? AND project_id = ?', [committed.body.evidenceId, projectId]);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].source, 'STAFF_MANUAL_ASSERTION');
    const metadata = JSON.parse(rows[0].metadata);
    assert.strictEqual(metadata.kind, 'ETSY_SEARCH_PASTE_V1');
    assert.strictEqual(metadata.contentHash, parsed.contentHash);
    assert.strictEqual(metadata.sellers.length, 4);
    assert.strictEqual(metadata.rawText.includes('413 results, with ads'), true);

    const duplicate = await post('/api/etsy/feed-search-results', { rawText: SAMPLE, seed: 'para mi hija', projectId, confirm: true });
    assert.strictEqual(duplicate.body.evidenceId, committed.body.evidenceId);
    assert.strictEqual(duplicate.body.duplicateSubmission, true);
    assert.strictEqual((await dbAll('SELECT id FROM research_evidence')).length, countBefore + 1, 'Duplicate confirm must be idempotent');

    const accept = await post(`/api/evidence/${committed.body.evidenceId}/accept`, { reason: 'attempt to accept pasted evidence' });
    assert.strictEqual(accept.status, 409);
    assert.strictEqual(accept.body.error, 'UNQUALIFIED_STAFF_PASTED_EVIDENCE');
    console.log('  🟢 HTTP contract: project required, preview zero-write, confirm persisted once, acceptance blocked.');

    const ui = fs.readFileSync(path.join(__dirname, '../src/components/EtsyWorkspace.jsx'), 'utf8');
    assert(ui.includes('Phân tích & Xem trước'));
    assert(ui.includes('Xác nhận lưu'));
    assert(ui.includes('URL/seed live dùng Project-bound Smart Pull'));
    assert(!ui.includes('30 Sellers thực tế'));
    assert(!ui.includes('13 Tags chuẩn 100%'));
    console.log('  🟢 UI contract: two-phase preview/confirm and truth-safe source wording present.');
  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log('  🟢 ALL HEYETSY PASTED SEARCH CONTRACTS PASSED');
  console.log('================================================================\n');
})().catch(error => {
  console.error('🔴 HEYETSY PASTED SEARCH CONTRACT FAILED:', error);
  process.exit(1);
});
