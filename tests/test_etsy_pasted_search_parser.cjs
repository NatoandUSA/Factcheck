const assert = require('assert');
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'test';

const { parseHeyEtsyPastedText, parseEtsySearchCsv, parseEtsySearchHtml } = require('../server/etsyPastedSearchParser');
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

const CSV_SAMPLE = `listing_id,title,shop,price,price_num,reviews,he_views,he_sold,he_tags,he_categories,url,rank_position,ad,bestseller,star_seller,free_shipping,sold_24h,views_24h,shop_daily_sold,keyword_context,proof_scope_hint,data_use_hint,he_created
1001,"Para Mi Hija Necklace",Fantasticgiftsltd,"1,145,896",1145896,119,25136,1610,"para mi hija|hija necklace","Jewelry, Necklaces",https://www.etsy.com/listing/1001,3,0,1,false,no,0,0,0,"para mi hija",source-hint,pattern-only,not-a-date
1002,"Daughter Gift",SecondShop,"815,152",815152,0,0,0,,,https://www.etsy.com/listing/1002,4,1,0,true,yes,,,,,,`;

const HTML_SAMPLE = `<!doctype html><html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"ItemList","itemListElement":[{"@type":"ListItem","position":2,"item":{"@type":"Product","name":"Para Mi Hija Necklace","url":"https://www.etsy.com/listing/1001","brand":{"@type":"Brand","name":"Fantasticgiftsltd"},"offers":{"@type":"Offer","price":"1145896","priceCurrency":"VND"}}}]}</script></head></html>`;

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

  const csv = parseEtsySearchCsv(CSV_SAMPLE);
  assert.strictEqual(csv.inputFormat, 'CSV');
  assert.strictEqual(csv.sellers.length, 2);
  assert.strictEqual(csv.sellers[0].sourceRank, 1, 'Source order must not be replaced by a claimed performance rank');
  assert.strictEqual(csv.sellers[0].priceAmount, 1145896);
  assert.strictEqual(csv.sellers[0].listingId, '1001', 'External Etsy listing_id must survive separately from internal row identity');
  assert.strictEqual(csv.sellers[0].sourceRowId, 'csv-row-1');
  assert.notStrictEqual(csv.sellers[0].listingId, csv.sellers[0].id, 'External listing_id must never become the internal row id');
  assert.strictEqual(csv.sellers[0].totalViews, 25136);
  assert.strictEqual(csv.sellers[1].reviewCount, 0, 'CSV zero must stay a numeric zero');
  assert.strictEqual(csv.sellers[1].totalViews, 0, 'CSV zero must not become UNKNOWN');
  assert.deepStrictEqual(csv.sellers[0].badges.isAd.value, false, 'String/number zero is an observed false badge, not UNKNOWN or true');
  assert.strictEqual(csv.sellers[0].badges.isBestseller.value, true);
  assert.strictEqual(csv.sellers[0].badges.isStarSeller.value, false);
  assert.strictEqual(csv.sellers[0].badges.hasFreeShipping.value, false);
  assert.strictEqual(csv.sellers[1].badges.isAd.value, true);
  assert.strictEqual(csv.sellers[1].badges.isBestseller.value, false);
  assert.strictEqual(csv.sellers[0].sold24h, 0, 'Observed numeric zero must remain known');
  assert.strictEqual(csv.sellers[0].sourceHints.keywordContext.state, 'SOURCE_HINT');
  assert.strictEqual(csv.sellers[0].sourceHints.keywordContext.authority, 'NONE');
  assert.strictEqual(csv.sellers[0].listingCreatedAt, null, 'Non-ISO source date remains UNKNOWN rather than being guessed');
  assert.strictEqual(csv.sellers[0].evidenceSource, 'STAFF_MANUAL_ASSERTION');
  assert.strictEqual(csv.sellers[0].evidenceState, 'UNVERIFIED_INPUT');

  const html = parseEtsySearchHtml(HTML_SAMPLE);
  assert.strictEqual(html.inputFormat, 'HTML');
  assert.strictEqual(html.sellers.length, 1);
  assert.strictEqual(html.sellers[0].title, 'Para Mi Hija Necklace');
  assert.strictEqual(html.sellers[0].priceCurrency, 'VND');
  assert.strictEqual(html.sellers[0].evidenceState, 'UNVERIFIED_INPUT');
  console.log('  🟢 CSV/HTML parser: source fields preserved, zero/UNKNOWN separated, all inputs remain unverified.');

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

    const ambiguousCsv = 'listing_id,LISTING_ID,title,shop\n111,222,Item,Shop';
    for (const confirm of [false, true]) {
      const ambiguous = await post('/api/etsy/feed-search-results', { rawText: ambiguousCsv, seed: 'para mi hija', projectId, confirm });
      assert.strictEqual(ambiguous.status, 422);
      assert.strictEqual(ambiguous.body.error, 'AMBIGUOUS_CSV_HEADERS');
      assert.strictEqual(ambiguous.body.canonicalField, 'listingId');
      assert.deepStrictEqual(ambiguous.body.sourceColumns, ['listing_id', 'LISTING_ID']);
      assert.strictEqual((await dbAll('SELECT id FROM research_evidence')).length, countBefore, 'Ambiguous CSV headers must make zero DB writes for preview and confirm');
    }
    const duplicateHeaderCsv = 'listing_id,listing_id,title,shop\n111,222,Item,Shop';
    for (const confirm of [false, true]) {
      const duplicateHeader = await post('/api/etsy/feed-search-results', { rawText: duplicateHeaderCsv, seed: 'para mi hija', projectId, confirm });
      assert.strictEqual(duplicateHeader.status, 422);
      assert.strictEqual(duplicateHeader.body.error, 'AMBIGUOUS_CSV_HEADERS');
      assert.strictEqual(duplicateHeader.body.duplicateHeaders, true);
      assert.strictEqual(duplicateHeader.body.canonicalField, 'listingId');
      assert.deepStrictEqual(duplicateHeader.body.sourceColumns, ['listing_id', 'listing_id']);
      assert.strictEqual((await dbAll('SELECT id FROM research_evidence')).length, countBefore, 'Exact duplicate CSV headers must make zero DB writes for preview and confirm');
    }

    const urlOnly = await post('/api/etsy/feed-search-results', { rawText: 'https://www.etsy.com/search?q=para+mi+hija', seed: 'para mi hija', projectId });
    assert.strictEqual(urlOnly.status, 422);
    assert.strictEqual(urlOnly.body.error, 'PASTED_RESULT_TEXT_REQUIRED');

    const preview = await post('/api/etsy/feed-search-results', { rawText: SAMPLE, seed: 'para mi hija', projectId, confirm: false });
    assert.strictEqual(preview.status, 200);
    assert.strictEqual(preview.body.preview, true);
    assert.strictEqual(preview.body.committed, false);
    assert.strictEqual(preview.body.projectId, projectId);
    assert.strictEqual(preview.body.provider, 'HEYETSY_PASTED_TEXT');
    assert.strictEqual(preview.body.count, 4);
    assert.deepStrictEqual(preview.body.batches.map(batch => batch.sellers.length), [4]);
    assert.strictEqual(preview.body.ordering, 'SOURCE_ORDER_NOT_PERFORMANCE_RANK');
    assert.strictEqual((await dbAll('SELECT id FROM research_evidence')).length, countBefore, 'Preview must make zero DB writes');

    const filePreviewForm = new FormData();
    filePreviewForm.append('searchResultsFile', new Blob([CSV_SAMPLE], { type: 'text/csv' }), 'para-mi-hija.csv');
    filePreviewForm.append('seed', 'para mi hija');
    filePreviewForm.append('projectId', String(projectId));
    filePreviewForm.append('confirm', 'false');
    const filePreviewResponse = await fetch(base + '/api/etsy/feed-search-results-file', {
      method: 'POST', headers: { Origin: base, Cookie: `omni_session=${session.rawToken}` }, body: filePreviewForm
    });
    const filePreview = await filePreviewResponse.json();
    assert.strictEqual(filePreviewResponse.status, 200);
    assert.strictEqual(filePreview.inputFormat, 'CSV');
    assert.strictEqual(filePreview.provider, 'ETSY_SEARCH_CSV');
    assert.strictEqual(filePreview.sourceFileName, 'para-mi-hija.csv');
    assert.strictEqual(filePreview.count, 2);
    assert.strictEqual((await dbAll('SELECT id FROM research_evidence')).length, countBefore, 'File preview must make zero DB writes');

    const htmlPreviewForm = new FormData();
    htmlPreviewForm.append('searchResultsFile', new Blob([HTML_SAMPLE], { type: 'text/html' }), 'para-mi-hija.html');
    htmlPreviewForm.append('seed', 'para mi hija');
    htmlPreviewForm.append('projectId', String(projectId));
    htmlPreviewForm.append('confirm', 'false');
    const htmlPreviewResponse = await fetch(base + '/api/etsy/feed-search-results-file', {
      method: 'POST', headers: { Origin: base, Cookie: `omni_session=${session.rawToken}` }, body: htmlPreviewForm
    });
    const htmlPreview = await htmlPreviewResponse.json();
    assert.strictEqual(htmlPreviewResponse.status, 200);
    assert.strictEqual(htmlPreview.inputFormat, 'HTML');
    assert.strictEqual(htmlPreview.provider, 'ETSY_SEARCH_HTML');
    assert.strictEqual((await dbAll('SELECT id FROM research_evidence')).length, countBefore, 'HTML preview must make zero DB writes');

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

    const fileConfirmForm = new FormData();
    fileConfirmForm.append('searchResultsFile', new Blob([CSV_SAMPLE], { type: 'text/csv' }), 'para-mi-hija.csv');
    fileConfirmForm.append('seed', 'para mi hija');
    fileConfirmForm.append('projectId', String(projectId));
    fileConfirmForm.append('confirm', 'true');
    const fileCommitResponse = await fetch(base + '/api/etsy/feed-search-results-file', {
      method: 'POST', headers: { Origin: base, Cookie: `omni_session=${session.rawToken}` }, body: fileConfirmForm
    });
    const fileCommitted = await fileCommitResponse.json();
    assert.strictEqual(fileCommitResponse.status, 200);
    assert.strictEqual(fileCommitted.committed, true);
    const fileRows = await dbAll('SELECT metadata FROM research_evidence WHERE id = ?', [fileCommitted.evidenceId]);
    const fileMetadata = JSON.parse(fileRows[0].metadata);
    assert.strictEqual(fileMetadata.inputFormat, 'CSV');
    assert.strictEqual(fileMetadata.sourceFileName, 'para-mi-hija.csv');
    assert.strictEqual(fileMetadata.sellers[0].listingId, '1001', 'External listing id must persist inside the project-bound audit artifact');
    assert.strictEqual(fileMetadata.sellers[0].sourceRowId, 'csv-row-1');
    assert.strictEqual(fileMetadata.sellers[0].evidenceState, 'UNVERIFIED_INPUT');
    assert.strictEqual(fileMetadata.sellers[0].evidenceSource, 'STAFF_MANUAL_ASSERTION');
    assert.strictEqual(fileMetadata.sellers[0].badges.isAd.value, false);
    assert.strictEqual(fileMetadata.sellers[0].sourceHints.keywordContext.authority, 'NONE');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(fileMetadata, 'rawText'), false, 'Large file payload must not be duplicated into SQLite metadata');

    const duplicate = await post('/api/etsy/feed-search-results', { rawText: SAMPLE, seed: 'para mi hija', projectId, confirm: true });
    assert.strictEqual(duplicate.body.evidenceId, committed.body.evidenceId);
    assert.strictEqual(duplicate.body.duplicateSubmission, true);
    assert.strictEqual((await dbAll('SELECT id FROM research_evidence')).length, countBefore + 2, 'Duplicate confirm must be idempotent');

    const healthBefore = (await dbAll('SELECT id FROM research_evidence')).length;
    const healthResponse = await fetch(`${base}/api/projects/${projectId}/evidence-health`, { headers: { Origin: base, Cookie: `omni_session=${session.rawToken}` } });
    const health = await healthResponse.json();
    assert.strictEqual(healthResponse.status, 200);
    assert.strictEqual(health.health.contractVersion, 'EVIDENCE_HEALTH_V1');
    assert.strictEqual(health.health.scope, 'READ_ONLY_RESEARCH_STATUS');
    const searchHealth = health.health.layers.find(layer => layer.key === 'search_capture');
    assert.strictEqual(searchHealth.state, 'MAPPED');
    assert.deepStrictEqual(searchHealth.dbStates, ['OBSERVED']);
    assert.deepStrictEqual(searchHealth.semanticStates, ['UNVERIFIED_INPUT'], 'Health must report semantic input state without promoting staff data.');
    assert.strictEqual(health.health.fieldCoverage.title.total, 6);
    assert.strictEqual(health.health.fieldCoverage.title.status, 'KNOWN');
    assert.strictEqual((await dbAll('SELECT id FROM research_evidence')).length, healthBefore, 'Evidence health must be read-only.');

    const ledgerResponse = await fetch(`${base}/api/evidence?projectId=${projectId}`, { headers: { Origin: base, Cookie: `omni_session=${session.rawToken}` } });
    const ledger = await ledgerResponse.json();
    const pastedLedgerRow = ledger.evidence.find(row => row.id === committed.body.evidenceId);
    assert.strictEqual(pastedLedgerRow.acceptanceEligibility.eligible, false);
    assert.strictEqual(pastedLedgerRow.acceptanceEligibility.error, 'UNQUALIFIED_STAFF_PASTED_EVIDENCE');

    const accept = await post(`/api/evidence/${committed.body.evidenceId}/accept`, { reason: 'attempt to accept pasted evidence' });
    assert.strictEqual(accept.status, 409);
    assert.strictEqual(accept.body.error, 'UNQUALIFIED_STAFF_PASTED_EVIDENCE');
    console.log('  🟢 HTTP contract: project required, preview zero-write, confirm persisted once, acceptance blocked.');

    const ui = fs.readFileSync(path.join(__dirname, '../src/components/EtsyWorkspace.jsx'), 'utf8');
    assert(ui.includes('Phân tích & Xem trước'));
    assert(ui.includes('Xác nhận lưu'));
    assert(ui.includes('feed-search-results-file'));
    assert(ui.includes('CSV / HTML / TXT'));
    assert(ui.includes('Evidence Health — Project research'));
    assert(ui.includes('OBSERVED</b> = đã ghi nhận trong evidence ledger'));
    assert(ui.includes('Smart Pull dùng URL/seed để hỏi MCP'));
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
