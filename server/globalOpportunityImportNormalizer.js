'use strict';

const crypto = require('node:crypto');

const VERSION = 'GLOBAL_IMPORT_NORMALIZER_V1_PROPOSAL';
const MAX_CANDIDATES = 10000;
const SOURCE_AUTHORITY = Object.freeze({
  CEREBRO: Object.freeze({ commercialMetrics: true, proofClass: 'MARKETPLACE_EXPORT' }),
  HEYETSY: Object.freeze({ commercialMetrics: true, proofClass: 'MARKETPLACE_EXPORT' }),
  YTREND: Object.freeze({ commercialMetrics: false, proofClass: 'WATCH_SIGNAL' }),
  GENERIC: Object.freeze({ commercialMetrics: false, proofClass: 'WATCH_SIGNAL' })
});

function text(value) { return value == null ? '' : String(value).trim(); }
function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function nonNegative(value) {
  const number = finite(value);
  return number != null && number >= 0 ? number : null;
}
function fold(value) {
  return text(value).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}
function normalizeKeyword(value) {
  return text(value).normalize('NFKC').toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]+/gu, ' ').replace(/\s+/g, ' ').trim();
}
function sourceFamily(candidate) {
  const source = text(candidate?.origin?.source).toUpperCase();
  return Object.prototype.hasOwnProperty.call(SOURCE_AUTHORITY, source) ? source : 'GENERIC';
}

function buildSheetAuthority(parsed) {
  const result = new Map();
  for (const diagnostic of Array.isArray(parsed?.diagnostics) ? parsed.diagnostics : []) {
    if (diagnostic?.status !== 'CONSUMED') continue;
    const source = text(diagnostic.source).toUpperCase();
    const mapping = diagnostic.mapping || {};
    const salesHeader = fold(mapping.estimatedSales);
    const competitionHeader = fold(mapping.competition);
    const commercialMetrics =
      (source === 'CEREBRO' && salesHeader === 'keyword sales') ||
      (source === 'HEYETSY' && competitionHeader === 'etsy competition');
    result.set(text(diagnostic.sheetName), Object.freeze({
      sourceFamily: Object.prototype.hasOwnProperty.call(SOURCE_AUTHORITY, source) ? source : 'GENERIC',
      commercialMetrics,
      proofClass: commercialMetrics ? 'MARKETPLACE_EXPORT_VERIFIED_HEADER' : 'UNVERIFIED_SOURCE_HINT'
    }));
  }
  return result;
}
function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}
function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}
function clonePlain(value) {
  if (Array.isArray(value)) return value.map(clonePlain);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value)) out[key] = clonePlain(child);
    return out;
  }
  return value;
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}
function proofTypeFor(source, sales, revenue) {
  if (!SOURCE_AUTHORITY[source].commercialMetrics) return 'NONE';
  if (sales != null && sales > 0) return source === 'CEREBRO' ? 'MARKETPLACE_SALES' : 'ESTIMATED_SALES';
  if (revenue != null && revenue > 0) return 'ESTIMATED_REVENUE';
  return 'NONE';
}
function clusterProposal(candidate) {
  const key = text(candidate.clusterKey || candidate.cluster);
  const label = text(candidate.clusterLabel || key);
  const method = text(candidate.clusterMethod || 'UNKNOWN');
  return Object.freeze({
    key: key || null,
    label: label || null,
    method,
    authority: method === 'SUPPLIED' ? 'SOURCE_SUPPLIED_PROPOSAL' : 'PARSER_PROPOSAL'
  });
}
function sanitizeCandidate(candidate, sourceFileId, sheetAuthority = null) {
  const source = sourceFamily(candidate);
  const baseAuthority = SOURCE_AUTHORITY[source];
  const verified = sheetAuthority && sheetAuthority.sourceFamily === source
    ? sheetAuthority
    : { commercialMetrics: false, proofClass: 'UNVERIFIED_SOURCE_HINT' };
  const authority = {
    commercialMetrics: baseAuthority.commercialMetrics && verified.commercialMetrics === true,
    proofClass: baseAuthority.commercialMetrics && verified.commercialMetrics === true
      ? verified.proofClass
      : 'UNVERIFIED_SOURCE_HINT'
  };
  const keyword = text(candidate.keyword);
  const normalized = normalizeKeyword(keyword);
  if (!normalized) return null;
  const sales = authority.commercialMetrics ? nonNegative(candidate.estimatedSales) : null;
  const revenue = authority.commercialMetrics ? nonNegative(candidate.estimatedRevenue) : null;
  const cluster = clusterProposal(candidate);
  const sanitized = {
    keyword,
    normalizedKeyword: normalized,
    sourceFamily: source,
    sourceSheet: text(candidate?.origin?.sheetName) || null,
    sourceFileId,
    searchVolume: nonNegative(candidate.searchVolume),
    estimatedSales: sales,
    estimatedRevenue: revenue,
    avgPrice: nonNegative(candidate.avgPrice),
    competition: nonNegative(candidate.competition),
    reviews: nonNegative(candidate.reviews),
    rankProxy: nonNegative(candidate.rankProxy),
    trendVelocity: nonNegative(candidate.trendVelocity),
    socialMomentum: nonNegative(candidate.socialMomentum),
    proofType: proofTypeFor(source, sales, revenue),
    proofTimestamp: null,
    cluster,
    authority: Object.freeze({
      commercialMetrics: authority.commercialMetrics,
      proofClass: authority.proofClass,
      createsProject: false,
      productTruth: false,
      publish: false
    })
  };
  sanitized.lineageHash = sha256(stable(sanitized));
  return Object.freeze(sanitized);
}
function duplicateSignature(candidate) {
  return stable({
    searchVolume: candidate.searchVolume,
    estimatedSales: candidate.estimatedSales,
    estimatedRevenue: candidate.estimatedRevenue,
    avgPrice: candidate.avgPrice,
    competition: candidate.competition,
    reviews: candidate.reviews,
    rankProxy: candidate.rankProxy,
    trendVelocity: candidate.trendVelocity,
    socialMomentum: candidate.socialMomentum,
    proofType: candidate.proofType,
    cluster: candidate.cluster
  });
}

function normalizeParsedImport(parsed) {
  const sourceFileId = text(parsed?.sourceFileId);
  const input = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
  if (!/^[a-f0-9]{64}$/i.test(sourceFileId)) {
    const error = new Error('GLOBAL_IMPORT_NORMALIZER_INVALID_FILE_ID');
    error.code = 'GLOBAL_IMPORT_NORMALIZER_INVALID_FILE_ID'; throw error;
  }
  if (!input.length || input.length > MAX_CANDIDATES) {
    const error = new Error('GLOBAL_IMPORT_NORMALIZER_INVALID_COUNT');
    error.code = 'GLOBAL_IMPORT_NORMALIZER_INVALID_COUNT'; throw error;
  }
  const sheetAuthority = buildSheetAuthority(parsed);
  const sanitized = input.map(item => sanitizeCandidate(
    item,
    sourceFileId,
    sheetAuthority.get(text(item?.origin?.sheetName)) || null
  )).filter(Boolean);
  const grouped = new Map();
  for (const item of sanitized) {
    const key = item.sourceFamily + '|' + item.normalizedKeyword;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }
  const accepted = []; const conflicts = [];
  let exactDuplicateCount = 0;
  for (const [key, rows] of grouped.entries()) {
    const signatures = new Map();
    for (const row of rows) {
      const signature = duplicateSignature(row);
      if (!signatures.has(signature)) signatures.set(signature, []);
      signatures.get(signature).push(row);
    }
    if (signatures.size === 1) {
      const canonical = [...rows].sort((a, b) => a.lineageHash.localeCompare(b.lineageHash))[0];
      accepted.push(canonical);
      exactDuplicateCount += rows.length - 1;
      continue;
    }
    conflicts.push(Object.freeze({
      key,
      sourceFamily: rows[0].sourceFamily,
      normalizedKeyword: rows[0].normalizedKeyword,
      disposition: 'REVIEW_DUPLICATE_CONFLICT',
      importEligible: false,
      lineageHashes: rows.map(row => row.lineageHash).sort()
    }));
  }
  accepted.sort((a, b) => (a.sourceFamily + '|' + a.normalizedKeyword).localeCompare(b.sourceFamily + '|' + b.normalizedKeyword));
  conflicts.sort((a, b) => a.key.localeCompare(b.key));

  const families = [...new Set(accepted.map(item => item.sourceFamily).concat(conflicts.map(item => item.sourceFamily)))].sort();
  const batches = families.map(source => {
    const candidates = accepted.filter(item => item.sourceFamily === source);
    const sourceConflicts = conflicts.filter(item => item.sourceFamily === source);
    return Object.freeze({
      sourceFamily: source,
      authority: Object.freeze({
        ...SOURCE_AUTHORITY[source],
        commercialMetrics: candidates.some(item => item.authority.commercialMetrics === true),
        proofClass: candidates.some(item => item.authority.commercialMetrics === true)
          ? 'MARKETPLACE_EXPORT_VERIFIED_HEADER'
          : 'UNVERIFIED_SOURCE_HINT'
      }),
      candidates,
      conflicts: sourceConflicts,
      accounting: Object.freeze({ accepted: candidates.length, conflicts: sourceConflicts.length })
    });
  });
  const output = {
    version: VERSION,
    authority: 'PROPOSAL_ONLY',
    sourceFileId,
    inputCandidateCount: input.length,
    usableCandidateCount: sanitized.length,
    acceptedCandidateCount: accepted.length,
    exactDuplicateCount,
    conflictCount: conflicts.length,
    skippedBlankCount: input.length - sanitized.length,
    batches,
    conflicts,
    diagnostics: clonePlain(Array.isArray(parsed?.diagnostics) ? parsed.diagnostics : [])
  };
  output.normalizationHash = sha256(stable(output));
  return deepFreeze(output);
}

module.exports = Object.freeze({
  VERSION, MAX_CANDIDATES, SOURCE_AUTHORITY,
  normalizeKeyword, sourceFamily, buildSheetAuthority, sanitizeCandidate, normalizeParsedImport
});
