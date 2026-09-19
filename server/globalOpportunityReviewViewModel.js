'use strict';

const crypto = require('node:crypto');

const VERSION = 'GLOBAL_REVIEW_UI_CONTRACT_V1_PROPOSAL';
const ALLOWED_SORTS = new Set(['HEAD_KEYWORD','SOURCE_COUNT','MEMBER_COUNT','EVIDENCE_STATE']);
const ALLOWED_DIRECTIONS = new Set(['ASC','DESC']);
const ALLOWED_FILTERS = new Set(['ALL','POSITIVE_COMMERCIAL_SIGNAL','NO_POSITIVE_COMMERCIAL_SIGNAL','CONFLICTS_ONLY']);

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
function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}
function fail(code) {
  const error = new Error(code); error.code = code; throw error;
}
function cloneWithoutHash(value, hashKey) {
  const out = {};
  for (const [key, child] of Object.entries(value || {})) {
    if (key !== hashKey) out[key] = child;
  }
  return out;
}
function text(value, max = 320) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, max);
}
function validateDashboardModel(model) {
  if (!model || typeof model !== 'object') fail('GLOBAL_REVIEW_UI_INVALID_MODEL');
  if (model.authority !== 'PROPOSAL_ONLY') fail('GLOBAL_REVIEW_UI_NON_PROPOSAL_AUTHORITY');
  if (!Array.isArray(model.clusters) || !Array.isArray(model.conflicts) || !Array.isArray(model.sources)) {
    fail('GLOBAL_REVIEW_UI_INVALID_MODEL_SHAPE');
  }
  if (!/^[a-f0-9]{64}$/i.test(String(model.modelHash || ''))) fail('GLOBAL_REVIEW_UI_INVALID_MODEL_HASH');
  const expectedModelHash = sha256(stable(cloneWithoutHash(model, 'modelHash')));
  if (expectedModelHash !== String(model.modelHash).toLowerCase()) fail('GLOBAL_REVIEW_UI_MODEL_HASH_MISMATCH');
  if (!model.canonicalDecisions || Object.values(model.canonicalDecisions).some(Boolean)) {
    fail('GLOBAL_REVIEW_UI_CANONICAL_DECISION_LEAK');
  }
}

function evidenceState(card) {
  const code = card?.evidenceObservation?.code;
  if (code === 'POSITIVE_COMMERCIAL_SIGNAL_PRESENT') return 'POSITIVE_COMMERCIAL_SIGNAL';
  if (code === 'COMMERCIAL_SCHEMA_WITHOUT_POSITIVE_PROOF') return 'COMMERCIAL_SCHEMA_NO_POSITIVE_PROOF';
  if (code === 'MULTI_SOURCE_NON_COMMERCIAL_SIGNALS_ONLY') return 'MULTI_SOURCE_NON_COMMERCIAL';
  return 'NO_POSITIVE_COMMERCIAL_SIGNAL';
}

function evidenceRank(state) {
  switch (state) {
    case 'POSITIVE_COMMERCIAL_SIGNAL': return 4;
    case 'COMMERCIAL_SCHEMA_NO_POSITIVE_PROOF': return 3;
    case 'MULTI_SOURCE_NON_COMMERCIAL': return 2;
    default: return 1;
  }
}

function clusterRow(card) {
  const state = evidenceState(card);
  return {
    id: text(card.proposalId, 120),
    headKeyword: text(card.headKeyword),
    productFamily: text(card.productFamily, 120) || 'unknown',
    commercialIntent: text(card.commercialIntent, 120) || 'GENERAL',
    memberCount: Math.max(0, Number(card.memberCount) || 0),
    sourceCount: Array.isArray(card.sourceFamilies) ? card.sourceFamilies.length : 0,
    sourceFamilies: Array.isArray(card.sourceFamilies) ? [...card.sourceFamilies].map(x => text(x, 80)).sort() : [],
    evidenceState: state,
    evidenceMessage: text(card?.evidenceObservation?.message, 500),
    canonicalGateAuthority: false,
    reviewOnly: true,
    detailRef: text(card.proposalId, 120)
  };
}
function clusterDetail(card) {
  return {
    id: text(card.proposalId, 120),
    title: text(card.headKeyword),
    badges: [
      { key: 'productFamily', label: 'Product family', value: text(card.productFamily, 120) || 'unknown' },
      { key: 'intent', label: 'Intent', value: text(card.commercialIntent, 120) || 'GENERAL' },
      { key: 'authority', label: 'Authority', value: 'PROPOSAL_ONLY' }
    ],
    members: Array.isArray(card.members) ? card.members.map(item => text(item)).sort() : [],
    whyGrouped: Array.isArray(card.whyGrouped) ? card.whyGrouped.map(reason => ({
      member: text(reason.member),
      comparedAgainst: reason.comparedAgainst == null ? null : text(reason.comparedAgainst),
      rule: text(reason.rule, 120),
      similarity: Number.isFinite(Number(reason.similarity)) ? Number(reason.similarity) : null
    })) : [],
    provenance: Array.isArray(card.provenance) ? card.provenance.map(ref => ({
      sourceFamily: text(ref.sourceFamily, 80),
      proofType: text(ref.proofType, 120) || 'NONE',
      commercialMetricsVerified: ref.commercialMetricsVerified === true,
      sourceFileId: text(ref.sourceFileId, 80),
      lineageHash: text(ref.lineageHash, 80)
    })) : [],
    explanation: {
      code: text(card?.evidenceObservation?.code, 120),
      message: text(card?.evidenceObservation?.message, 500),
      canonicalGateAuthority: false
    }
  };
}
function conflictRow(conflict) {
  return {
    id: sha256(stable({ key: conflict.key, lineageHashes: conflict.lineageHashes })),
    keyword: text(conflict.normalizedKeyword),
    sourceFamily: text(conflict.sourceFamily, 80) || 'UNKNOWN',
    disposition: text(conflict.disposition, 120) || 'REVIEW_DUPLICATE_CONFLICT',
    importEligible: false,
    lineageCount: Array.isArray(conflict.lineageHashes) ? conflict.lineageHashes.length : 0,
    explanation: text(conflict.explanation, 500)
  };
}

function sourceCard(source) {
  return {
    sourceFamily: text(source.sourceFamily, 80) || 'UNKNOWN',
    acceptedCount: Math.max(0, Number(source.acceptedCount) || 0),
    conflictCount: Math.max(0, Number(source.conflictCount) || 0),
    commercialAuthority: source.commercialAuthority === true,
    proofClasses: Array.isArray(source.proofClasses) ? source.proofClasses.map(x => text(x, 120)).sort() : []
  };
}

function normalizeQuery(query = {}) {
  const sortBy = ALLOWED_SORTS.has(String(query.sortBy || '').toUpperCase()) ? String(query.sortBy).toUpperCase() : 'HEAD_KEYWORD';
  const direction = ALLOWED_DIRECTIONS.has(String(query.direction || '').toUpperCase()) ? String(query.direction).toUpperCase() : 'ASC';
  const filter = ALLOWED_FILTERS.has(String(query.filter || '').toUpperCase()) ? String(query.filter).toUpperCase() : 'ALL';
  const search = text(query.search, 120).toLowerCase();
  const pageSizeRaw = Number(query.pageSize);
  const pageSize = Number.isInteger(pageSizeRaw) ? Math.min(100, Math.max(1, pageSizeRaw)) : 25;
  const pageRaw = Number(query.page);
  const page = Number.isInteger(pageRaw) ? Math.max(1, pageRaw) : 1;
  return { sortBy, direction, filter, search, pageSize, page };
}
function compareRows(sortBy) {
  return (a, b) => {
    if (sortBy === 'SOURCE_COUNT') return a.sourceCount - b.sourceCount || a.headKeyword.localeCompare(b.headKeyword);
    if (sortBy === 'MEMBER_COUNT') return a.memberCount - b.memberCount || a.headKeyword.localeCompare(b.headKeyword);
    if (sortBy === 'EVIDENCE_STATE') return evidenceRank(a.evidenceState) - evidenceRank(b.evidenceState) || a.headKeyword.localeCompare(b.headKeyword);
    return a.headKeyword.localeCompare(b.headKeyword) || a.id.localeCompare(b.id);
  };
}

function applyQuery(rows, conflicts, query) {
  let filtered = rows;
  if (query.filter === 'POSITIVE_COMMERCIAL_SIGNAL') filtered = rows.filter(row => row.evidenceState === 'POSITIVE_COMMERCIAL_SIGNAL');
  if (query.filter === 'NO_POSITIVE_COMMERCIAL_SIGNAL') filtered = rows.filter(row => row.evidenceState !== 'POSITIVE_COMMERCIAL_SIGNAL');
  if (query.filter === 'CONFLICTS_ONLY') filtered = [];
  if (query.search) {
    filtered = filtered.filter(row => [row.headKeyword, row.productFamily, row.commercialIntent, ...row.sourceFamilies]
      .join(' ').toLowerCase().includes(query.search));
  }
  let filteredConflicts = conflicts;
  if (query.search) {
    filteredConflicts = conflicts.filter(row => [row.keyword, row.sourceFamily, row.disposition]
      .join(' ').toLowerCase().includes(query.search));
  }
  filtered = [...filtered].sort(compareRows(query.sortBy));
  if (query.direction === 'DESC') filtered.reverse();
  const active = query.filter === 'CONFLICTS_ONLY' ? filteredConflicts : filtered;
  const totalItems = active.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / query.pageSize));
  const safePage = Math.min(query.page, totalPages);
  const start = (safePage - 1) * query.pageSize;
  return {
    rows: query.filter === 'CONFLICTS_ONLY' ? [] : active.slice(start, start + query.pageSize),
    conflictRows: query.filter === 'CONFLICTS_ONLY' ? active.slice(start, start + query.pageSize) : [],
    pagination: { page: safePage, pageSize: query.pageSize, totalItems, totalPages }
  };
}
function buildReviewViewModel(model, query = {}) {
  validateDashboardModel(model);
  const normalizedQuery = normalizeQuery(query);
  const clusterRows = model.clusters.map(clusterRow);
  const clusterDetails = Object.fromEntries(model.clusters.map(card => [text(card.proposalId, 120), clusterDetail(card)]));
  const conflicts = model.conflicts.map(conflictRow).sort((a, b) => a.keyword.localeCompare(b.keyword) || a.id.localeCompare(b.id));
  const paged = applyQuery(clusterRows, conflicts, normalizedQuery);
  const sources = model.sources.map(sourceCard).sort((a, b) => a.sourceFamily.localeCompare(b.sourceFamily));
  const viewModel = {
    version: VERSION,
    authority: 'PROPOSAL_ONLY',
    contract: {
      readOnly: true,
      mutationsExposed: [],
      canonicalGateAuthority: false,
      createProjectEnabled: false,
      productTruthEnabled: false,
      publishEnabled: false
    },
    query: normalizedQuery,
    summary: {
      clusterCount: Math.max(0, Number(model?.summary?.clusterCount) || 0),
      conflictCount: Math.max(0, Number(model?.summary?.conflictCount) || 0),
      sourceFamilyCount: Math.max(0, Number(model?.summary?.sourceFamilyCount) || 0),
      attentionCount: Math.max(0, Number(model?.summary?.attentionCount) || 0)
    },
    toolbar: {
      allowedSorts: [...ALLOWED_SORTS],
      allowedDirections: [...ALLOWED_DIRECTIONS],
      allowedFilters: [...ALLOWED_FILTERS],
      searchMaxLength: 120
    },
    sources,
    table: { rows: paged.rows, pagination: paged.pagination },
    conflictTable: { rows: paged.conflictRows, pagination: paged.pagination },
    detailsById: clusterDetails,
    attention: Array.isArray(model.attention) ? model.attention.map(item => ({
      code: text(item.code, 120), count: Math.max(0, Number(item.count) || 0)
    })) : []
  };
  viewModel.viewHash = sha256(stable(viewModel));
  return deepFreeze(viewModel);
}

module.exports = Object.freeze({ VERSION, normalizeQuery, buildReviewViewModel });
