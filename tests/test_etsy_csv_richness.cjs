const assert = require('assert');
const { parseEtsySearchCsv, parseCsvNumberEvidence, CSV_HEADER_REGISTRY } = require('../server/etsyPastedSearchParser');
const { buildEvidenceHealth } = require('../server/evidenceHealth');
const { headers: richHeaders, csv: rich67Csv } = require('./fixtures/etsy_search_rich_67_sanitized.cjs');

const CSV = `listing_id,title,shop,price_num,ad,bestseller,star_seller,free_shipping,sold_24h,views_24h,he_sold,he_views,conversion_pct,he_revenue_usd,reviews,rating,shop_daily_sold,keyword_context,keyword_match_exact,keyword_match_title,proof_scope_hint,evidence_route_hint,data_use_hint,he_created,mystery_metric
1001,First listing,Shop A,0,0,1,false,no,0,0,0,0,0,0,0,0,0,para mi hija,1,0,staff hint,etsy_search_results,pattern-only,2026-08-25T01:30:00+07:00,unmapped
1001,First listing,Shop A,0,0,1,false,no,0,0,0,0,0,0,0,0,0,para mi hija,1,0,staff hint,etsy_search_results,pattern-only,2026-08-25T01:30:00+07:00,unmapped
1002,=NOT_A_FORMULA(),Shop C,12,N/A,—,UNKNOWN,, , , , , , , , , ,@formula-hint,,, ,,,,
`;

const parsed = parseEtsySearchCsv(CSV);
assert.strictEqual(parsed.sellers.length, 2, 'Duplicate external listing_id must be represented once');
assert.strictEqual(parsed.duplicatesRemoved, 1);
assert.deepStrictEqual(parsed.rowAccounting, { inputRows: 3, validRows: 3, uniqueRows: 2, duplicateRowsRemoved: 1 });

const first = parsed.sellers[0];
assert.strictEqual(first.listingId, '1001');
assert.strictEqual(first.sourceRowId, 'csv-row-1');
assert.notStrictEqual(first.listingId, first.id);
assert.strictEqual(first.priceAmount, 0, 'Numeric zero is a known supplied value');
assert.strictEqual(first.priceAmountRaw, '0');
assert.strictEqual(first.fieldProvenance.priceAmount.raw, '0', 'Price provenance must bind the parsed numeric cell, not a display-price sibling');
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

const reportedRank = parseEtsySearchCsv('rank_position,listing_id,title,shop\n7,123,Item,Shop').sellers[0];
assert.strictEqual(reportedRank.sourceRank, 1, 'sourceRank is the internal source-order position');
assert.strictEqual(reportedRank.reportedRank.value, 7, 'Reported rank must remain a separate research-only source field');
assert.strictEqual(reportedRank.reportedRank.authority, 'NONE');
const numericPriceProvenance = parseEtsySearchCsv('price,price_num,listing_id,title,shop\nUS$12,12,123,Item,Shop').sellers[0];
assert.strictEqual(numericPriceProvenance.priceAmount, 12);
assert.strictEqual(numericPriceProvenance.priceDisplayRaw, 'US$12');
assert.strictEqual(numericPriceProvenance.priceAmountRaw, '12');
assert.strictEqual(numericPriceProvenance.fieldProvenance.priceAmount.raw, '12');

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
assert.strictEqual(richHealth.fieldCoverage.reportedRank.known, 67);
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

for (const csv of [
  'listing_id,listing_id,title,shop\n111,222,Item,Shop',
  'title,title,listing_id,shop\nFirst,Second,123,Shop',
  'keyword_match_exact,keyword_match_exact,listing_id,title,shop\n1,0,123,Item,Shop',
  'mystery_metric,mystery_metric,listing_id,title,shop\na,b,123,Item,Shop'
]) {
  assert.throws(() => parseEtsySearchCsv(csv), error => {
    assert.strictEqual(error.message, 'AMBIGUOUS_CSV_HEADERS');
    assert.strictEqual(error.duplicateHeaders, true);
    assert.strictEqual(error.canonicalCollisions.length, 1);
    assert.deepStrictEqual(error.canonicalCollisions[0].sourceColumns[0], error.canonicalCollisions[0].sourceColumns[1]);
    return true;
  }, 'Exact duplicate source headers must fail before projection');
}

for (const csv of [
  'listing_id,title,shop\n123,Item,Shop,EXTRA',
  'listing_id,title,shop,views_24h\n123,Item'
]) {
  assert.throws(() => parseEtsySearchCsv(csv), error => {
    assert.strictEqual(error.message, 'CSV_FIELD_COUNT_MISMATCH');
    assert(error.fieldMismatches.length > 0);
    return true;
  }, 'Rows with too many or too few cells must fail before projection');
}

for (const csv of [
  'listing_id,,title,shop\n123,HIDDEN,Item,Shop',
  'listing_id,   ,title,shop\n123,HIDDEN,Item,Shop'
]) {
  assert.throws(() => parseEtsySearchCsv(csv), error => {
    assert.strictEqual(error.message, 'INVALID_CSV_HEADER');
    assert(error.invalidHeaders.length > 0);
    return true;
  }, 'Blank or whitespace CSV headers must never hide a value');
}

for (const [raw, expected] of [
  ['0', 0], ['-12', -12], ['12.5', 12.5], ['1,234', 1234], ['~12', 12], ['12k', 12000], ['12.5%', 12.5],
  ['12garbage', null], ['1e3', null], ['Infinity', null], ['NaN', null], ['1,23', null], ['12k%', null]
]) {
  assert.strictEqual(parseCsvNumberEvidence(raw).value, expected, `Strict CSV numeric grammar: ${raw}`);
}

const canonicalValue = canonicalField => {
  if (canonicalField.includes('keywordMatches')) return '1';
  if (canonicalField.includes('badges.')) return '1';
  if (canonicalField.includes('listingCreatedAt')) return '2026-08-25T01:30:00Z';
  if (/price|revenue|review|rating|views|sold|favorite|conversion|discount|age|reportedRank/i.test(canonicalField)) return '7';
  if (canonicalField.includes('tags') || canonicalField.includes('categories')) return 'tag';
  if (canonicalField.includes('url')) return 'https://example.test/listing/123';
  return 'value';
};
const readCanonical = (seller, canonicalField) => {
  const path = canonicalField.split('/')[0].split('.');
  return path.reduce((value, key) => value?.[key], seller);
};
const expectedCanonicalValue = (canonicalField, raw) => {
  if (canonicalField.includes('badges.')) return true;
  if (canonicalField === 'reportedRank') return 7;
  if (canonicalField === 'price' || canonicalField === 'originalPrice' || canonicalField === 'priceCurrency') return raw;
  if (/price|revenue|review|rating|views|sold|favorite|conversion|discount|age/i.test(canonicalField)) return 7;
  if (canonicalField.includes('tags') || canonicalField.includes('categories')) return 'tag';
  return raw;
};
const assertCanonicalProjection = (seller, canonicalField, raw, alias) => {
  let actual = readCanonical(seller, canonicalField);
  if (canonicalField.includes('badges.') || canonicalField === 'reportedRank' || canonicalField.startsWith('sourceHints.')) actual = actual?.value;
  if (canonicalField.includes('tags') || canonicalField.includes('categories')) {
    assert(actual.includes('tag'), `${alias} must preserve a tag/category value`);
    return;
  }
  assert.strictEqual(actual, expectedCanonicalValue(canonicalField, raw), `${alias} must preserve the exact canonical value`);
};
// Meta-test the contract, not an implementation-shaped fixture: every
// registered alias must be both diagnosed and actually projected by the same
// parser. This prevents the registry and reader from drifting apart.
for (const [alias, canonicalField] of Object.entries(CSV_HEADER_REGISTRY)) {
  const headers = [alias];
  const values = [canonicalValue(canonicalField)];
  for (const [requiredHeader, requiredCanonical, requiredValue] of [
    ['listing_id', 'listingId', '123'], ['title', 'title', 'Item'], ['shop', 'shopName', 'Shop']
  ]) {
    if (requiredCanonical !== canonicalField) {
      headers.push(requiredHeader);
      values.push(requiredValue);
    }
  }
  const aliasResult = parseEtsySearchCsv(`${headers.join(',')}\n${values.join(',')}`);
  const recognized = aliasResult.headerDiagnostics.recognizedColumns.find(item => item.sourceColumn === alias);
  assert(recognized, `${alias} must be recognized`);
  assert.strictEqual(recognized.canonicalField, canonicalField, `${alias} canonical mapping`);
  assert.deepStrictEqual(aliasResult.headerDiagnostics.unmappedColumns, [], `${alias} must not be unmapped`);
  assertCanonicalProjection(aliasResult.sellers[0], canonicalField, values[0], alias);
}

const wildcardResult = parseEtsySearchCsv('listing_id,title,shop,keyword_match_exact\n123,Item,Shop,1');
assert.strictEqual(wildcardResult.sellers[0].sourceHints.keywordMatches.exact.value, '1');
assert.deepStrictEqual(wildcardResult.headerDiagnostics.unmappedColumns, []);

assert.throws(() => parseEtsySearchCsv('listing_id,title,shop\n123,One,A\n123,Two,B'), error => {
  assert.strictEqual(error.message, 'DUPLICATE_LISTING_ID_CONFLICT');
  assert.deepStrictEqual(error.listingIdConflicts, [{ listingId: '123', sourceRows: ['csv-row-1', 'csv-row-2'] }]);
  return true;
}, 'Conflicting rows for one external listing ID must not be silently de-duplicated');

assert.throws(() => parseEtsySearchCsv('listing_id,title,shop\n123,,A\n124,Good,B'), error => {
  assert.strictEqual(error.message, 'CSV_REQUIRED_FIELD_MISSING');
  assert.deepStrictEqual(error.invalidRows, [{ sourceRow: 2, requiredField: 'title' }]);
  return true;
}, 'Rows missing a required title must not be silently filtered out');

console.log('Etsy CSV Richness parser contract passed.');
