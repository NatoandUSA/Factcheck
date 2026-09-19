'use strict';

const crypto = require('node:crypto');
const { readAllWorksheetsBuffer } = require('./services/spreadsheetReader');

const SOURCE_TYPES = new Set(['CEREBRO','HEYETSY','YTREND','GENERIC']);
const HEADER_ALIASES = Object.freeze({
  keyword: ['keyword phrase','keyword','phrase','search term','search query','query','tag','term'],
  searchVolume: ['search volume','volume','monthly searches','monthly search volume','searches'],
  estimatedSales: ['keyword sales','sales','estimated sales','est sales','monthly sales','sold'],
  estimatedRevenue: ['estimated revenue','revenue','monthly revenue','est revenue'],
  avgPrice: ['avg price','average price','price'],
  competition: ['competition','competing products','title density','etsy competition','competition score'],
  reviews: ['reviews','review count','avg reviews','average reviews'],
  rankProxy: ['rank','position rank','organic rank','search rank'],
  trendVelocity: ['trend','trend velocity','growth','growth rate','momentum','momentum score'],
  socialMomentum: ['social momentum','social score','viral score'],
  cluster: ['cluster','cluster key','semantic cluster','product cluster']
});

const CONCEPT = Object.freeze({
  loss: 'memorial', sympathy: 'memorial', bereavement: 'memorial', remembrance: 'memorial',
  memorials: 'memorial', personalized: '', personalised: '', custom: '', customized: '',
  gift: '', gifts: '', present: '', for: '', the: '', a: '', an: '', of: '', to: '',
  dog: 'pet', cat: 'pet', puppy: 'pet', kitten: 'pet'
});
const PRODUCT_ANCHOR_WORDS = new Set([
  'necklace','bracelet','ring','earrings','earring','shirt','tshirt','sweatshirt','hoodie','mug','tumbler',
  'blanket','pillow','ornament','sign','plaque','keychain','poster','print','canvas','journal','card',
  'chime','windchime','frame','wallet','lamp','acrylic','sticker','hat','cap','bag','tote'
]);

function text(value) { return value == null ? '' : String(value).trim(); }
function num(value) {
  if (value == null || value === '') return null;
  const cleaned = typeof value === 'string' ? value.replace(/[$,%\s,]/g, '') : value;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}
function fold(value) {
  return text(value).normalize('NFKC').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}\s'-]+/gu, ' ')
    .replace(/\s+/g, ' ').trim();
}
function headerMap(headers) {
  const normalized = new Map((headers || []).map(h => [fold(h), h]));
  const result = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) {
      if (normalized.has(alias)) { result[field] = normalized.get(alias); break; }
    }
  }
  return result;
}
function sourceType(raw, headers) {
  const requested = text(raw).toUpperCase();
  if (SOURCE_TYPES.has(requested)) return requested;
  const joined = (headers || []).map(fold).join('|');
  if (joined.includes('keyword sales') || joined.includes('cerebro iq') || joined.includes('cpr')) return 'CEREBRO';
  if (joined.includes('etsy competition') || joined.includes('favorites') || joined.includes('favourites')) return 'HEYETSY';
  if (joined.includes('momentum score') || joined.includes('gem score') || joined.includes('sold 24h')) return 'YTREND';
  return 'GENERIC';
}
function commercialProofType(source, row) {
  const sales = num(row.estimatedSales);
  const revenue = num(row.estimatedRevenue);
  if (sales != null && sales > 0) return source === 'CEREBRO' ? 'MARKETPLACE_SALES' : 'ESTIMATED_SALES';
  if (revenue != null && revenue > 0) return 'ESTIMATED_REVENUE';
  return 'NONE';
}
function canonicalTokens(keyword) {
  const raw = fold(keyword).split(/\s+/).filter(Boolean);
  const out = [];
  for (const token of raw) {
    const canonical = Object.prototype.hasOwnProperty.call(CONCEPT, token) ? CONCEPT[token] : token;
    if (canonical && !out.includes(canonical)) out.push(canonical);
  }
  return out;
}
function clusterDescriptor(keyword) {
  const tokens = canonicalTokens(keyword);
  if (!tokens.length) return { clusterKey: '', clusterLabel: '', method: 'EMPTY' };
  let anchorIndex = -1;
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    if (PRODUCT_ANCHOR_WORDS.has(tokens[i])) { anchorIndex = i; break; }
  }
  let selected;
  if (anchorIndex >= 0) {
    const start = Math.max(0, anchorIndex - 2);
    selected = tokens.slice(start, anchorIndex + 1);
    if (tokens[anchorIndex] === 'chime' && anchorIndex > 0 && tokens[anchorIndex - 1] === 'wind') {
      selected = tokens.slice(Math.max(0, anchorIndex - 3), anchorIndex + 1);
    }
  } else {
    selected = tokens.slice(-Math.min(4, tokens.length));
  }
  const key = selected.join('_').toUpperCase().slice(0, 160);
  return { clusterKey: key, clusterLabel: selected.map(x => x.charAt(0).toUpperCase() + x.slice(1)).join(' '),
    method: anchorIndex >= 0 ? 'PRODUCT_ANCHOR_V1' : 'TAIL_CONCEPT_V1' };
}
function stableFileId(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function parseGlobalOpportunityFile(rawBytes, options = {}) {
  if (!Buffer.isBuffer(rawBytes) || rawBytes.length === 0) {
    const error = new Error('GLOBAL_IMPORT_FILE_REQUIRED'); error.code = 'GLOBAL_IMPORT_FILE_REQUIRED'; error.status = 400; throw error;
  }
  const sheets = await readAllWorksheetsBuffer(rawBytes, { fileName: options.fileName, mediaType: options.mediaType });
  if (!sheets.length) {
    const error = new Error('GLOBAL_IMPORT_EMPTY_WORKBOOK'); error.code = 'GLOBAL_IMPORT_EMPTY_WORKBOOK'; error.status = 422; throw error;
  }
  const candidates = []; const diagnostics = [];
  for (const sheet of sheets) {
    const mapping = headerMap(sheet.headers);
    const source = sourceType(options.sourceType, sheet.headers);
    if (!mapping.keyword) {
      diagnostics.push({ sheetName: sheet.sheetName, status: 'SKIPPED_NO_KEYWORD_COLUMN', headers: sheet.headers });
      continue;
    }
    let accepted = 0; let skipped = 0;
    for (const row of sheet.rows || []) {
      const keyword = text(row[mapping.keyword]);
      if (!keyword) { skipped += 1; continue; }
      const projected = {
        keyword,
        searchVolume: mapping.searchVolume ? num(row[mapping.searchVolume]) : null,
        estimatedSales: mapping.estimatedSales ? num(row[mapping.estimatedSales]) : null,
        estimatedRevenue: mapping.estimatedRevenue ? num(row[mapping.estimatedRevenue]) : null,
        avgPrice: mapping.avgPrice ? num(row[mapping.avgPrice]) : null,
        competition: mapping.competition ? num(row[mapping.competition]) : null,
        reviews: mapping.reviews ? num(row[mapping.reviews]) : null,
        rankProxy: mapping.rankProxy ? num(row[mapping.rankProxy]) : null,
        trendVelocity: mapping.trendVelocity ? num(row[mapping.trendVelocity]) : null,
        socialMomentum: mapping.socialMomentum ? num(row[mapping.socialMomentum]) : null
      };
      const suppliedCluster = mapping.cluster ? text(row[mapping.cluster]) : '';
      const cluster = suppliedCluster
        ? { clusterKey: suppliedCluster, clusterLabel: suppliedCluster, method: 'SUPPLIED' }
        : clusterDescriptor(keyword);
      candidates.push({
        ...projected,
        clusterKey: cluster.clusterKey,
        clusterLabel: cluster.clusterLabel,
        clusterMethod: cluster.method,
        proofType: commercialProofType(source, projected),
        proofTimestamp: text(options.proofTimestamp) || null,
        crossSourceCount: 1,
        origin: { kind: 'GLOBAL_BULK_FILE', source, sheetName: sheet.sheetName }
      });
      accepted += 1;
      if (candidates.length > 50000) {
        const error = new Error('GLOBAL_IMPORT_ROW_LIMIT_EXCEEDED'); error.code = 'GLOBAL_IMPORT_ROW_LIMIT_EXCEEDED'; error.status = 413; throw error;
      }
    }
    diagnostics.push({ sheetName: sheet.sheetName, status: 'CONSUMED', source, mapping, inputRows: sheet.rows.length, acceptedRows: accepted, skippedRows: skipped });
  }
  if (!candidates.length) {
    const error = new Error('GLOBAL_IMPORT_NO_USABLE_KEYWORDS'); error.code = 'GLOBAL_IMPORT_NO_USABLE_KEYWORDS'; error.status = 422;
    error.details = { diagnostics }; throw error;
  }
  return Object.freeze({
    sourceFileId: stableFileId(rawBytes),
    candidateCount: candidates.length,
    candidates,
    diagnostics
  });
}

module.exports = Object.freeze({
  SOURCE_TYPES, fold, num, headerMap, sourceType, clusterDescriptor, commercialProofType, parseGlobalOpportunityFile
});
