'use strict';

const cheerio = require('cheerio');
const crypto = require('node:crypto');

class ProductTruthListingError extends Error {
  constructor(code, status = 400, details = {}) {
    super(code);
    this.name = 'ProductTruthListingError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const unique = values => [...new Set(values.map(clean).filter(Boolean))];

function jsonLdProducts($) {
  const products = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      const parsed = JSON.parse($(element).text());
      const visit = node => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) return node.forEach(visit);
        if (node['@type'] === 'Product' || (Array.isArray(node['@type']) && node['@type'].includes('Product'))) products.push(node);
        if (node['@graph']) visit(node['@graph']);
      };
      visit(parsed);
    } catch (_) { /* malformed third-party JSON-LD is ignored */ }
  });
  return products;
}

function collectAttributes($) {
  const attributes = new Map();
  const add = (label, value) => {
    const key = clean(label).replace(/[:\u200e\u200f]+$/g, '').toLowerCase();
    const val = clean(value);
    if (key && val && key.length <= 120 && val.length <= 1000 && attributes.size < 100 && !attributes.has(key)) attributes.set(key, val);
  };
  $('table tr').each((_, row) => {
    const cells = $(row).find('th,td').map((__, cell) => clean($(cell).text())).get().filter(Boolean);
    if (cells.length >= 2) add(cells[0], cells.slice(1).join(' '));
  });
  $('#detailBullets_feature_div li, #productDetails_detailBullets_sections1 tr, [data-product-details] li').each((_, row) => {
    const text = clean($(row).text());
    const separator = text.indexOf(':');
    if (separator > 0) add(text.slice(0, separator), text.slice(separator + 1));
  });
  return attributes;
}

const FIELD_LABELS = Object.freeze({
  materials: [/^material(s)?$/, /^metal$/, /fabric( type)?/, /primary material/, /material principal/, /materiales?/],
  colors: [/^colou?r$/, /color name/, /colores?/],
  sizes: [/^size$/, /item dimensions/, /product dimensions/, /dimensions?/, /tama(n|ñ)o/, /medidas?/],
  weight: [/^weight$/, /item weight/, /peso/],
  quantity: [/^number of items$/, /^unit count$/, /cantidad/],
  includedItems: [/included components/, /what.*included/, /contenido/, /incluye/],
  care: [/care instructions?/, /cuidado/],
  finish: [/finish type/, /acabado/],
  purity: [/metal stamp/, /purity/, /plating/, /chapado/],
  gemstones: [/gem type/, /stone/, /piedra/],
  origin: [/country of origin/, /made in/, /pa[ií]s de origen/],
  ageCompliance: [/age range/, /recommended age/, /edad/],
  language: [/^language$/, /idioma/]
});

function findAttribute(attributes, patterns) {
  for (const [label, value] of attributes) {
    if (patterns.some(pattern => pattern.test(label))) return value;
  }
  return '';
}

function parseListingHtml(html, { marketplace, sourceReference = '' } = {}) {
  if (!html || typeof html !== 'string') throw new ProductTruthListingError('LISTING_HTML_REQUIRED');
  if (!['AMAZON', 'ETSY'].includes(marketplace)) throw new ProductTruthListingError('LISTING_MARKETPLACE_REQUIRED');
  const $ = cheerio.load(html);
  $('script:not([type="application/ld+json"]),style,noscript').remove();
  const products = jsonLdProducts($);
  const product = products[0] || {};
  const title = clean(
    (marketplace === 'AMAZON' ? $('#productTitle').first().text() : $('h1[data-buy-box-listing-title="true"]').first().text())
    || product.name || $('meta[property="og:title"]').attr('content') || $('h1').first().text()
  );
  const bulletNodes = marketplace === 'AMAZON'
    ? $('#feature-bullets li span.a-list-item, #productFactsDesktopExpander li')
    : $('[data-id="description-text"] li, [data-product-details] li');
  const bullets = unique(bulletNodes.map((_, element) => $(element).text()).get())
    .filter(item => item.length > 3).slice(0, 12);
  const description = clean(
    (marketplace === 'AMAZON'
      ? $('#productDescription, #aplus').first().text()
      : $('[data-id="description-text"], [data-product-details-description]').first().text())
    || product.description || $('meta[property="og:description"]').attr('content')
  ).slice(0, 12000);
  const breadcrumb = unique($('#wayfinding-breadcrumbs_container a, nav[aria-label*="breadcrumb" i] a, [data-breadcrumb] a')
    .map((_, element) => $(element).text()).get()).join(' > ');
  const attributes = collectAttributes($);
  const jsonMaterials = unique([].concat(product.material || [], product.materials || [])).join(', ');
  const extracted = { productName: title };
  for (const [fact, patterns] of Object.entries(FIELD_LABELS)) {
    const value = fact === 'materials' && jsonMaterials ? jsonMaterials : findAttribute(attributes, patterns);
    if (value) extracted[fact] = value;
  }
  if (breadcrumb) extracted.category = breadcrumb;
  if (!extracted.category && clean(product.category)) extracted.category = clean(product.category);
  const productType = findAttribute(attributes, [/^item type name$/, /^product type$/, /^tipo de producto$/]);
  if (productType) extracted.productType = productType;
  else if (clean(product.category)) extracted.productType = clean(product.category).split(/\s*[<>]\s*/).filter(Boolean).pop();

  const searchable = `${title}\n${bullets.join('\n')}\n${description}`;
  if (/\b(personali[sz]ed|customi[sz]able|custom made|personalizado|personalizada|personalizable)\b/i.test(searchable)) {
    extracted.personalization = 'Có — theo thông tin trên listing tham chiếu';
  }
  if (/\b(message card|tarjeta (de )?mensaje)\b/i.test(searchable)) extracted.includedItems = 'Message card — theo listing tham chiếu';
  if (/\b(gift box|caja de regalo|ready.to.gift)\b/i.test(searchable)) extracted.packaging = 'Gift box / ready-to-gift — theo listing tham chiếu';
  if (/\b(para mi hija|to my daughter|daughter gift|gift for daughter)\b/i.test(searchable)) extracted.recipient = 'Daughter / Hija';
  const occasions = [];
  if (/\b(graduation|graduaci[oó]n)\b/i.test(searchable)) occasions.push('Graduation');
  if (/\b(birthday|cumplea[nñ]os)\b/i.test(searchable)) occasions.push('Birthday');
  if (/\b(christmas|navidad)\b/i.test(searchable)) occasions.push('Christmas');
  if (/\bquincea[nñ]era\b/i.test(searchable)) occasions.push('Quinceañera');
  if (occasions.length) extracted.occasion = unique(occasions).join(', ');
  const facts = {};
  const rawHash = crypto.createHash('sha256').update(html).digest('hex');
  const basisNote = `Trích từ listing cùng supplier/nguồn hàng do staff xác nhận; nguồn: ${sourceReference || 'HTML upload'}; SHA-256: ${rawHash}`;
  for (const [fact, value] of Object.entries(extracted)) {
    if (clean(value)) facts[fact] = { disposition: 'ASSERTED', value: clean(value), basis: 'REFERENCE_LISTING_SAME_SOURCE', basisNote };
  }
  if (!facts.productName) throw new ProductTruthListingError('LISTING_CONTENT_NOT_EXTRACTED', 422);

  return Object.freeze({
    zeroWrite: true,
    marketplace,
    sourceReference: sourceReference || null,
    rawHash,
    facts: Object.freeze(facts),
    observations: Object.freeze({ title, bullets: Object.freeze(bullets), description, breadcrumb: breadcrumb || null,
      attributes: Object.freeze(Object.fromEntries(attributes)) }),
    dna: Object.freeze({ titleLength: Array.from(title).length, bulletCount: bullets.length,
      descriptionLength: Array.from(description).length, observedSections: Object.freeze(['title', bullets.length ? 'bullets' : null,
        description ? 'description' : null, attributes.size ? 'attributes' : null].filter(Boolean)) }),
    accounting: Object.freeze({ extractedFactCount: Object.keys(facts).length, observedAttributeCount: attributes.size,
      observedBulletCount: bullets.length })
  });
}

module.exports = Object.freeze({ ProductTruthListingError, parseListingHtml });
