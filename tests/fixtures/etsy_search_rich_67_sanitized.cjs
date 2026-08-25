// Sanitized golden fixture: exact header schema from the 67-row Etsy search
// export, with synthetic values only. It protects field-level projection, not
// competitor content or marketplace claims.
const headers = [
  'listing_id', 'title', 'shop', 'price', 'price_num', 'price_was', 'reviews', 'star_seller', 'ad', 'bestseller', 'free_shipping',
  'sold_24h', 'views_24h', 'he_sold', 'he_views_avg', 'he_views', 'he_fav_pct', 'he_favorites', 'he_created', 'age_days', 'he_updated',
  'he_revenue_usd', 'conversion_pct', 'country', 'shop_daily_sold', 'he_discount_pct', 'he_tags', 'he_categories', 'url', 'keyword_context',
  'keyword_match_type', 'keyword_match_confidence', 'proof_scope_hint', 'evidence_route_hint', 'data_use_hint', 'rank_position'
];

function escape(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function sourceRow(index) {
  return {
    listing_id: `900000${String(index).padStart(3, '0')}`,
    title: `Sanitized Etsy listing ${index}`,
    shop: `SanitizedShop${index}`,
    price: '12.50', price_num: '12.50', price_was: '15.00', reviews: index % 3 ? '0' : '12',
    star_seller: index % 2, ad: 0, bestseller: index % 5 === 0 ? 1 : 0, free_shipping: index % 2,
    sold_24h: 0, views_24h: index, he_sold: index, he_views_avg: 0, he_views: index * 10, he_fav_pct: '0', he_favorites: 0,
    he_created: '2026-08-25T01:30:00+07:00', age_days: index, he_updated: '2026-08-25T02:00:00Z',
    he_revenue_usd: index % 2 ? '0' : '18.50', conversion_pct: index <= 45 ? '0' : '', country: index % 2 ? 'Vietnam' : 'United States',
    shop_daily_sold: 0, he_discount_pct: '0', he_tags: 'para mi hija;daughter gift', he_categories: 'Jewelry, Necklaces',
    url: `https://www.etsy.com/listing/900000${String(index).padStart(3, '0')}`, keyword_context: 'para mi hija',
    keyword_match_type: 'exact_phrase_in_title_or_tags', keyword_match_confidence: '0.95', proof_scope_hint: 'SOURCE_HINT',
    evidence_route_hint: 'etsy_search_results', data_use_hint: 'pattern_research_only', rank_position: index
  };
}

const csv = [headers.join(','), ...Array.from({ length: 67 }, (_, index) => {
  const row = sourceRow(index + 1);
  return headers.map(header => escape(row[header])).join(',');
})].join('\n');

module.exports = { headers, csv };
