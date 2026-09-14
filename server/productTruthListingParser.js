'use strict';

const cheerio = require('cheerio');
const crypto = require('node:crypto');
const Papa = require('papaparse');

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
const foldText = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
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

function collectMatchingAttributes(attributes, patterns) {
  const values = [];
  for (const [label, value] of attributes) {
    if (patterns.some(pattern => pattern.test(label))) values.push(`${titleLabel(label)}: ${value}`);
  }
  return unique(values).join('; ');
}

function collectRenderedTextAttributes(lines) {
  const attributes = new Map();
  const knownLabels = /^(material|materials|metal type|clasp type|chain type|gem type|item type name|product type|color|size|item dimensions|product dimensions|item weight|number of items|unit count|included components|care instructions|finish type|metal stamp|country of origin|ships from|made in)$/i;
  const add = (label, value) => {
    const key = clean(label).replace(/:+$/g, '').toLowerCase();
    const val = clean(value);
    if (key && val && !attributes.has(key)) attributes.set(key, val);
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const colon = line.indexOf(':');
    if (colon > 0 && knownLabels.test(line.slice(0, colon).trim())) add(line.slice(0, colon), line.slice(colon + 1));
    else if (knownLabels.test(line) && lines[index + 1]) add(line, lines[index + 1]);
  }
  return attributes;
}

function sectionLines(lines, labels, stopLabels) {
  const start = lines.findIndex(line => labels.some(label => foldText(line) === foldText(label)));
  if (start < 0) return [];
  const values = [];
  for (let index = start + 1; index < lines.length; index++) {
    if (stopLabels.some(label => foldText(lines[index]) === foldText(label))) break;
    if (values.length >= 12) break;
    if (lines[index].length > 3) values.push(lines[index]);
  }
  return values;
}

function titleLabel(value) {
  return clean(value).replace(/\b\w/g, letter => letter.toUpperCase());
}

function findAttribute(attributes, patterns) {
  for (const [label, value] of attributes) {
    if (patterns.some(pattern => pattern.test(label))) return value;
  }
  return '';
}

function parseListingHtml(html, { marketplace, sourceReference = '' } = {}) {
  if (!html || typeof html !== 'string') throw new ProductTruthListingError('LISTING_HTML_REQUIRED');
  if (!['AMAZON', 'ETSY'].includes(marketplace)) throw new ProductTruthListingError('LISTING_MARKETPLACE_REQUIRED');
  const isRenderedText = !/<(?:html|body|head|h1|div|script|meta)\b/i.test(html);
  const renderedLines = isRenderedText ? String(html).split(/\r?\n/).map(clean).filter(Boolean) : [];
  const $ = cheerio.load(isRenderedText ? `<body><h1>${String(renderedLines[0] || '').replace(/[&<>]/g, value => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[value]))}</h1></body>` : html);
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
  const textBullets = isRenderedText ? sectionLines(renderedLines, ['About this item'],
    ['Product Description', 'Product information', 'Additional Information', 'Customer reviews']) : [];
  const bullets = unique([...bulletNodes.map((_, element) => $(element).text()).get(), ...textBullets])
    .filter(item => item.length > 3).slice(0, 12);
  const textDescription = isRenderedText ? sectionLines(renderedLines, ['Product Description', 'Description'],
    ['Product information', 'Additional Information', 'Shipping and return policies', 'Meet your sellers']).join(' ') : '';
  const description = clean(
    (marketplace === 'AMAZON'
      ? $('#productDescription, #aplus').first().text()
      : $('[data-id="description-text"], [data-product-details-description]').first().text())
    || product.description || $('meta[property="og:description"]').attr('content') || textDescription
  ).slice(0, 12000);
  const breadcrumb = unique($('#wayfinding-breadcrumbs_container a, nav[aria-label*="breadcrumb" i] a, [data-breadcrumb] a')
    .map((_, element) => $(element).text()).get()).join(' > ');
  const attributes = collectAttributes($);
  for (const [label, value] of collectRenderedTextAttributes(renderedLines)) if (!attributes.has(label)) attributes.set(label, value);
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
  const componentDetails = collectMatchingAttributes(attributes, [
    /^metal type$/, /^clasp type$/, /^chain type$/, /^setting type$/, /^back finding$/,
    /^closure type$/, /^number of stones$/, /^componentes?$/, /^tipo de cadena$/, /^tipo de cierre$/
  ]);
  if (componentDetails) extracted.components = componentDetails;
  const shipFrom = findAttribute(attributes, [/^ships from$/]);
  if (shipFrom) extracted.shipFrom = shipFrom;

  const searchable = `${title}\n${bullets.join('\n')}\n${description}`;
  if (!extracted.gemstones) {
    const gemstoneMatches = searchable.match(/\b(cubic zirconia|zirconia|circonita|moissanite|diamond|diamante|sapphire|zafiro|ruby|emerald|esmeralda|opal|topaz|amethyst|garnet|pearl|perla|birthstone|rhinestone)\b/gi);
    if (gemstoneMatches?.length) extracted.gemstones = unique(gemstoneMatches).join(', ');
  }
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
      observedBulletCount: bullets.length, renderedTextInput: isRenderedText })
  });
}

function parseJsonCell(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); }
  catch (_) { return fallback; }
}

function captureRowFromJson(rawText) {
  let envelope;
  try { envelope = JSON.parse(rawText); }
  catch (_) { throw new ProductTruthListingError('INVALID_PRODUCT_TRUTH_CAPTURE_JSON'); }
  if (envelope?.schema_version !== 'omni_listing_v1'
    || !Array.isArray(envelope.headers) || !Array.isArray(envelope.rows)) {
    throw new ProductTruthListingError('UNSUPPORTED_PRODUCT_TRUTH_CAPTURE_SCHEMA');
  }
  const normalizedHeaders = envelope.headers.map(header => String(header || '').trim());
  if (normalizedHeaders.some(header => !header) || new Set(normalizedHeaders).size !== normalizedHeaders.length) {
    throw new ProductTruthListingError('PRODUCT_TRUTH_CAPTURE_HEADERS_INVALID');
  }
  if (envelope.rows.length !== 1) {
    throw new ProductTruthListingError('PRODUCT_TRUTH_DETAIL_CAPTURE_REQUIRED', 400, { rowCount: envelope.rows.length });
  }
  const values = envelope.rows[0];
  if (!Array.isArray(values) || values.length !== envelope.headers.length) {
    throw new ProductTruthListingError('PRODUCT_TRUTH_CAPTURE_FIELD_COUNT_MISMATCH');
  }
  return {
    row: Object.fromEntries(normalizedHeaders.map((header, index) => [header, values[index]])),
    envelope
  };
}

function captureRowFromCsv(rawText) {
  const parsed = Papa.parse(rawText.replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: 'greedy' });
  const fatal = (parsed.errors || []).find(error => error.type === 'Quotes'
    || error.code === 'TooFewFields' || error.code === 'TooManyFields');
  if (fatal) throw new ProductTruthListingError('INVALID_PRODUCT_TRUTH_CAPTURE_CSV', 400, { code: fatal.code, row: fatal.row });
  if (!Array.isArray(parsed.meta?.fields) || !parsed.meta.fields.includes('source_page_type')) {
    throw new ProductTruthListingError('UNSUPPORTED_PRODUCT_TRUTH_CAPTURE_SCHEMA');
  }
  if (parsed.meta.fields.some(field => !String(field || '').trim())
    || Object.keys(parsed.meta.renamedHeaders || {}).length > 0) {
    throw new ProductTruthListingError('PRODUCT_TRUTH_CAPTURE_HEADERS_INVALID');
  }
  if (parsed.data.length !== 1) {
    throw new ProductTruthListingError('PRODUCT_TRUTH_DETAIL_CAPTURE_REQUIRED', 400, { rowCount: parsed.data.length });
  }
  if (Object.prototype.hasOwnProperty.call(parsed.data[0], '__parsed_extra')) {
    throw new ProductTruthListingError('PRODUCT_TRUTH_CAPTURE_FIELD_COUNT_MISMATCH');
  }
  return { row: parsed.data[0], envelope: null };
}

const escapeHtml = value => clean(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

function attributePairs(row, keys) {
  const pairs = [];
  for (const key of keys) {
    const parsed = parseJsonCell(row[key], []);
    if (!Array.isArray(parsed)) continue;
    for (const item of parsed) {
      if (item && typeof item === 'object' && clean(item.key) && clean(item.value)) {
        pairs.push({ key: clean(item.key), value: clean(item.value) });
      }
    }
  }
  return pairs;
}

function listingCaptureHtml(row, marketplace) {
  const title = escapeHtml(row.title);
  const description = escapeHtml(row.product_description || row.description);
  const categories = parseJsonCell(row.categories_json || row.category_breadcrumb_json, []);
  const categoryList = Array.isArray(categories) ? categories : [];
  const attributes = marketplace === 'AMAZON'
    ? attributePairs(row, ['top_highlights_json', 'features_specs_json', 'style_json', 'product_details_json'])
    : attributePairs(row, ['item_details_json']);
  const bullets = marketplace === 'AMAZON'
    ? parseJsonCell(row.about_this_item_json, [])
    : parseJsonCell(row.highlights_json, []).map(item => typeof item === 'object' ? item.value : item);
  const table = attributes.map(item => `<tr><th>${escapeHtml(item.key)}</th><td>${escapeHtml(item.value)}</td></tr>`).join('');
  const breadcrumb = categoryList.map(item => `<a>${escapeHtml(item)}</a>`).join('');
  if (marketplace === 'AMAZON') {
    return `<body><span id="productTitle">${title}</span><div id="wayfinding-breadcrumbs_container">${breadcrumb}</div>`
      + `<div id="feature-bullets"><ul>${(Array.isArray(bullets) ? bullets : []).map(item => `<li><span class="a-list-item">${escapeHtml(item)}</span></li>`).join('')}</ul></div>`
      + `<div id="productDescription">${description}</div><table>${table}</table></body>`;
  }
  return `<body><h1 data-buy-box-listing-title="true">${title}</h1><nav aria-label="breadcrumb">${breadcrumb}</nav>`
    + `<div data-product-details><ul>${(Array.isArray(bullets) ? bullets : []).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>`
    + `<div data-id="description-text">${description}</div><table>${table}</table></body>`;
}

function truthyFlag(value) {
  return ['1', 'true', 'yes'].includes(String(value || '').trim().toLowerCase());
}

function parseListingCapture(buffer, { marketplace, sourceReference = '', fileName = '' } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new ProductTruthListingError('PRODUCT_TRUTH_CAPTURE_REQUIRED');
  const rawText = buffer.toString('utf8');
  const isJson = /\.json$/i.test(fileName);
  const { row, envelope } = isJson ? captureRowFromJson(rawText) : captureRowFromCsv(rawText);
  const expectedPageType = marketplace === 'AMAZON' ? 'amazon_product_detail' : 'etsy_listing_detail';
  const pageType = clean(row.source_page_type || envelope?.source_page_type);
  if (pageType !== expectedPageType) {
    throw new ProductTruthListingError('PRODUCT_TRUTH_DETAIL_CAPTURE_REQUIRED', 400, { expectedPageType, actualPageType: pageType || null });
  }
  const listingId = clean(marketplace === 'AMAZON' ? row.asin : row.listing_id);
  if (!listingId || (marketplace === 'AMAZON' ? !/^[A-Z0-9]{10}$/i.test(listingId) : !/^\d{6,15}$/.test(listingId))) {
    throw new ProductTruthListingError('PRODUCT_TRUTH_CAPTURE_LISTING_ID_REQUIRED');
  }
  if (!clean(row.title)) throw new ProductTruthListingError('LISTING_CONTENT_NOT_EXTRACTED', 422);
  const displayedId = clean(marketplace === 'AMAZON' ? row.displayed_asin : listingId);
  const identityConflict = marketplace === 'AMAZON'
    && (truthyFlag(row.asin_conflict) || (displayedId && displayedId.toUpperCase() !== listingId.toUpperCase()));
  const originalHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const effectiveSource = clean(sourceReference || row.source_url || row.url || envelope?.source_url || fileName);
  if (effectiveSource.length > 2000) throw new ProductTruthListingError('LISTING_REFERENCE_TOO_LARGE');
  const parsed = parseListingHtml(listingCaptureHtml(row, marketplace), { marketplace, sourceReference: effectiveSource });
  const basisNote = `Trích từ file capture listing cùng supplier/nguồn hàng do staff xác nhận; nguồn: ${effectiveSource || fileName}; SHA-256: ${originalHash}`;
  const facts = Object.freeze(Object.fromEntries(Object.entries(parsed.facts).map(([key, fact]) => [key, { ...fact, basisNote }])));
  const warnings = identityConflict ? Object.freeze([Object.freeze({
    code: 'LISTING_IDENTITY_CONFLICT', requestedListingId: listingId, displayedListingId: displayedId || null,
    message: `ASIN từ URL/capture (${listingId}) khác ASIN hiển thị trong Product Details (${displayedId || 'UNKNOWN'}). Xác nhận exact variant trước khi áp dụng.`
  })]) : Object.freeze([]);
  return Object.freeze({ ...parsed, rawHash: originalHash, facts,
    sourceReference: effectiveSource || null,
    capture: Object.freeze({ schemaVersion: envelope?.schema_version || 'csv.omni_listing_v1',
      exporterVersion: envelope?.exporter_version || null, sourcePageType: pageType, listingId,
      displayedListingId: displayedId || null }),
    identity: Object.freeze({ state: identityConflict ? 'REVIEW_REQUIRED' : 'CLEAR', listingId,
      displayedListingId: displayedId || null }), warnings });
}

module.exports = Object.freeze({ ProductTruthListingError, parseListingHtml, parseListingCapture });
