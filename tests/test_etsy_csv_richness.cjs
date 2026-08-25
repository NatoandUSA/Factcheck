const assert = require('assert');
const { parseEtsySearchCsv } = require('../server/etsyPastedSearchParser');
const { buildEvidenceHealth } = require('../server/evidenceHealth');
const { headers: richHeaders, csv: rich67Csv } = require('./fixtures/etsy_search_rich_67_sanitized.cjs');

const CSV = `listing_id,title,shop,price_num,ad,bestseller,star_seller,free_shipping,sold_24h,views_24h,he_sold,he_views,conversion_pct,he_revenue_usd,reviews,rating,shop_daily_sold,keyword_context,keyword_match_exact,keyword_match_title,proof_scope_hint,evidence_route_hint,data_use_hint,he_created,mystery_metric
1001,First listing,Shop A,0,0,1,false,no,0,0,0,0,0,0,0,0,0,para mi hija,1,0,staff hint,etsy_search_results,pattern-only,2026-08-25T01:30:00+07:00,unmapped
1001,Duplicate title must not become another listing,Shop B,10,yes,no,true,yes,2,3,4,5,6,7,8,4.5,9,ignored,0,1,ignored,ignored,ignored,2026-02-30T10:00:00Z,unmapped
1002,=NOT_A_FORMULA(),Shop C,12,N/A,—,UNKNOWN,, , , , , , , , , ,@formula-hint,,, ,,,,
`;

const parsed = parseEtsySearchCsv(CSV);
assert.strictEqual(parsed.sellers.length, 2, 'Duplicate external listing_id must be represented once');
assert.strictEqual(parsed.duplicatesRemoved, 1);

const first = parsed.sellers[0];
assert.strictEqual(first.listingId, '1001');
assert.strictEqual(first.sourceRowId, 'csv-row-1');
assert.notStrictEqual(first.listingId, first.id);
assert.strictEqual(first.priceAmount, 0, 'Numeric zero is a known supplied value');
assert.strictEqual(first.badges.isAd.value, false);
assert.strictEqual(first.badges.isBestseller.value, true);
assert.strictEqual(first.badges.isStarSeller.value, false);
assert.strictEqual(first.badges.hasFreeShipping.value, false);
assert.strictEqual(first.listingCreatedAt, '2026-08-24T18:30:00.000Z');
assert.strictEqual(first.sourceHints.keywordContext.authority, 'NONE');
assert.strictEqual(first.sourceHints.proofScopeHint.state, 'SOURCE_HINT');
assert.strictEqual(first.sourceHints.evidenceRouteHint.authority, 'NONE');
assert.strictEqual(first.sourceHints.keywordMatches.exact.value, '1');
assert.strictEqual(first.sourceHints.keywordMatches.title.value, '0');
assert.strictEqual(first.fieldProvenance.totalSold.state, 'OBSERVED');
assert.strictEqual(first.fieldProvenance.totalSold.authority, 'NONE');
assert.strictEqual(first.fieldProvenance.totalSold.allowedUse, 'RESEARCH_ONLY');
assert.deepStrictEqual(parsed.headerDiagnostics.unmappedColumns, ['mystery_metric']);

const second = parsed.sellers[1];
assert.strictEqual(second.listingId, '1002');
assert.strictEqual(second.title, '=NOT_A_FORMULA()', 'Parser must preserve text and never evaluate CSV cell content');
assert.strictEqual(second.badges.isAd.value, null);
assert.strictEqual(second.badges.isBestseller.value, null);
assert.strictEqual(second.badges.isStarSeller.value, null);
assert.strictEqual(second.badges.hasFreeShipping.value, null);
assert.strictEqual(second.listingCreatedAt, null, 'Impossible timestamps must remain UNKNOWN');

const health = buildEvidenceHealth([{
  source: 'STAFF_MANUAL_ASSERTION', evidence_state: 'OBSERVED', metadata: JSON.stringify({
    kind: 'ETSY_SEARCH_PASTE_V1', provider: 'ETSY_SEARCH_CSV', evidenceState: 'UNVERIFIED_INPUT', sellers: parsed.sellers
  })
}]);
assert.strictEqual(health.fieldCoverage.listingId.known, 2);
assert.strictEqual(health.fieldCoverage.isAd.known, 1, 'Unknown boolean must not be treated as false');
assert.strictEqual(health.fieldCoverage.isAd.status, 'PARTIAL');
assert.strictEqual(health.fieldGroups.identity.status, 'PARTIAL');
assert.strictEqual(health.fieldGroups.badgeOffer.status, 'PARTIAL');
assert.strictEqual(health.fieldGroups.sourceHints.status, 'PARTIAL');
assert.deepStrictEqual(health.summary.unmappedSourceColumns, [], 'A parser-only object has no persisted header diagnostics');
assert.deepStrictEqual(health.layers.find(layer => layer.key === 'search_capture').semanticStates, ['UNVERIFIED_INPUT']);

const rich67 = parseEtsySearchCsv(rich67Csv);
assert.strictEqual(rich67.searchContext.resultCount, 67);
assert.strictEqual(rich67.sellers.length, 67);
assert.strictEqual(rich67.sellers.filter(row => row.listingId).length, 67);
assert.strictEqual(rich67.headerDiagnostics.recognizedColumnCount, richHeaders.length);
assert.deepStrictEqual(rich67.headerDiagnostics.unmappedColumns, []);
const richHealth = buildEvidenceHealth([{ source: 'STAFF_MANUAL_ASSERTION', evidence_state: 'OBSERVED', metadata: JSON.stringify({
  kind: 'ETSY_SEARCH_PASTE_V1', provider: 'ETSY_SEARCH_CSV', evidenceState: 'UNVERIFIED_INPUT', headerDiagnostics: rich67.headerDiagnostics, sellers: rich67.sellers
}) }]);
assert.strictEqual(richHealth.fieldCoverage.listingId.known, 67);
assert.strictEqual(richHealth.fieldCoverage.tags.known, 67);
assert.strictEqual(richHealth.fieldCoverage.views24h.known, 67);
assert.strictEqual(richHealth.fieldCoverage.conversion.known, 45);
assert.deepStrictEqual(richHealth.summary.unmappedSourceColumns, []);

for (const alias of ['listing_id', 'listingId', 'listingid', 'Listing ID', 'LISTING_ID']) {
  const aliasParsed = parseEtsySearchCsv(`${alias},title,shop\n123,Item,Shop`);
  assert.strictEqual(aliasParsed.sellers[0].listingId, '123', `${alias} must populate the canonical listingId`);
  assert.deepStrictEqual(aliasParsed.headerDiagnostics.unmappedColumns, []);
  assert.strictEqual(aliasParsed.headerDiagnostics.recognizedColumns.find(item => item.sourceColumn === alias).canonicalField, 'listingId');
}

const parserAliasMatrix = parseEtsySearchCsv('listing_id,title,shop_name,avg_view,discount_pct\n123,Item,Shop,0,0');
assert.strictEqual(parserAliasMatrix.sellers[0].shopName, 'Shop');
assert.strictEqual(parserAliasMatrix.sellers[0].avgViews, 0);
assert.strictEqual(parserAliasMatrix.sellers[0].discountPercent, 0);
assert.deepStrictEqual(parserAliasMatrix.headerDiagnostics.unmappedColumns, []);

for (const csv of [
  'listing_id,LISTING_ID,title,shop\n111,222,Item,Shop',
  'listing_id,listingId,title,shop\n111,222,Item,Shop',
  'title,TITLE,listing_id,shop\nFirst,Second,123,Shop',
  'keyword_match_exact,KEYWORD_MATCH_EXACT,listing_id,title,shop\n1,0,123,Item,Shop'
]) {
  assert.throws(() => parseEtsySearchCsv(csv), error => {
    assert.strictEqual(error.message, 'AMBIGUOUS_CSV_HEADERS');
    assert.strictEqual(error.canonicalCollisions.length, 1);
    assert.strictEqual(error.canonicalCollisions[0].sourceColumns.length, 2);
    return true;
  }, 'Any duplicate canonical CSV header must fail before projection');
}

console.log('Etsy CSV Richness parser contract passed.');
