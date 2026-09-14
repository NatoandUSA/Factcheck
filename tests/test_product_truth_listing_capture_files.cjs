'use strict';

const assert = require('node:assert');
const Papa = require('papaparse');
const { parseListingCapture } = require('../server/productTruthListingParser');

function envelope(headers, values, pageType) {
  return Buffer.from(JSON.stringify({
    schema_version: 'omni_listing_v1', exporter_version: '2.1.0',
    source_page_type: pageType, evidence_policy: 'rendered_page_only_no_invention',
    headers, rows: [values]
  }));
}

const amazonHeaders = ['asin', 'displayed_asin', 'asin_conflict', 'title', 'top_highlights_json',
  'about_this_item_json', 'categories_json', 'source_url', 'source_page_type'];
const amazonValues = ['B0D5W7RXC2', 'B0D5W7RQQX', '1', 'Collar para mi hija',
  JSON.stringify([{ key: 'Material', value: 'Stainless Steel' }, { key: 'Gem type', value: 'Cubic Zirconia' }]),
  JSON.stringify(['Includes a message card and gift box.']), JSON.stringify(['Jewelry', 'Necklaces']),
  'https://www.amazon.com/dp/B0D5W7RXC2', 'amazon_product_detail'];

const amazon = parseListingCapture(envelope(amazonHeaders, amazonValues, 'amazon_product_detail'), {
  marketplace: 'AMAZON', fileName: 'amazon.json'
});
assert.strictEqual(amazon.zeroWrite, true);
assert.strictEqual(amazon.identity.state, 'REVIEW_REQUIRED');
assert.strictEqual(amazon.identity.listingId, 'B0D5W7RXC2');
assert.strictEqual(amazon.identity.displayedListingId, 'B0D5W7RQQX');
assert.strictEqual(amazon.warnings[0].code, 'LISTING_IDENTITY_CONFLICT');
assert.match(amazon.rawHash, /^[0-9a-f]{64}$/);
assert.strictEqual(amazon.capture.sourcePageType, 'amazon_product_detail');
assert.match(amazon.facts.materials.value, /Stainless Steel/i);
assert.match(amazon.facts.gemstones.value, /Cubic Zirconia/i);
assert.match(amazon.facts.materials.basisNote, /amazon\.com\/dp\/B0D5W7RXC2/);

const etsyHeaders = ['listing_id', 'title', 'item_details_json', 'highlights_json', 'description',
  'category_breadcrumb_json', 'source_url', 'source_page_type'];
const etsyValues = ['4533292901', 'Para Mi Hija Necklace',
  JSON.stringify([{ key: 'Materials', value: 'White gold, Yellow gold' }, { key: 'Gemstone', value: 'Cubic zirconia' }]),
  JSON.stringify([{ value: 'Gift for daughter' }]), 'Includes a message card and gift box.',
  JSON.stringify(['Jewelry', 'Necklaces', 'Pendant Necklaces']),
  'https://www.etsy.com/listing/4533292901', 'etsy_listing_detail'];
const etsyCsv = Papa.unparse([Object.fromEntries(etsyHeaders.map((header, index) => [header, etsyValues[index]]))]);
const etsy = parseListingCapture(Buffer.from(etsyCsv), { marketplace: 'ETSY', fileName: 'etsy.csv' });
assert.strictEqual(etsy.identity.state, 'CLEAR');
assert.strictEqual(etsy.identity.listingId, '4533292901');
assert.match(etsy.facts.materials.value, /White gold/i);
assert.match(etsy.facts.gemstones.value, /Cubic zirconia/i);
assert.strictEqual(etsy.facts.recipient.value, 'Daughter / Hija');

assert.throws(() => parseListingCapture(Buffer.from(Papa.unparse([
  { listing_id: '1', title: 'One', source_page_type: 'etsy_search_results' },
  { listing_id: '2', title: 'Two', source_page_type: 'etsy_search_results' }
])), { marketplace: 'ETSY', fileName: 'search.csv' }), error => error.code === 'PRODUCT_TRUTH_DETAIL_CAPTURE_REQUIRED');

assert.throws(() => parseListingCapture(envelope(etsyHeaders, etsyValues, 'etsy_listing_detail'), {
  marketplace: 'AMAZON', fileName: 'etsy.json'
}), error => error.code === 'PRODUCT_TRUTH_DETAIL_CAPTURE_REQUIRED');

assert.throws(() => parseListingCapture(Buffer.from('{"rows":[]}'), {
  marketplace: 'ETSY', fileName: 'invalid.json'
}), error => error.code === 'UNSUPPORTED_PRODUCT_TRUTH_CAPTURE_SCHEMA');

console.log('Product Truth structured listing capture: 18/18 PASS');
