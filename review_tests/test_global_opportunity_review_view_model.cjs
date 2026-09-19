const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { buildDiscoveryProposal } = require('../server/globalOpportunityProposalPipeline');
const { buildReviewDashboardModel } = require('../server/globalOpportunityReviewDashboardModel');
const { buildReviewViewModel, normalizeQuery, VERSION } = require('../server/globalOpportunityReviewViewModel');

function fileId(label) {
  return crypto.createHash('sha256').update(label).digest('hex');
}

const parsed = {
  sourceFileId: fileId('view-model'),
  diagnostics: [
    { status: 'CONSUMED', sheetName: 'C', source: 'CEREBRO', mapping: { estimatedSales: 'Keyword Sales' } },
    { status: 'CONSUMED', sheetName: 'Y', source: 'YTREND', mapping: { trendVelocity: 'Momentum Score' } }
  ],
  candidates: [
    { keyword: 'dog memorial wind chime', estimatedSales: 30, origin: { source: 'CEREBRO', sheetName: 'C' } },
    { keyword: 'dog memorial wind chime', trendVelocity: 9, origin: { source: 'YTREND', sheetName: 'Y' } },
    { keyword: 'pet memorial necklace', estimatedSales: 0, origin: { source: 'CEREBRO', sheetName: 'C' } },
    { keyword: 'viral memorial lamp', trendVelocity: 10, origin: { source: 'YTREND', sheetName: 'Y' } }
  ]
};

const model = buildReviewDashboardModel(buildDiscoveryProposal(parsed));
const vm = buildReviewViewModel(model);
assert.equal(VERSION, 'GLOBAL_REVIEW_UI_CONTRACT_V1_PROPOSAL');
assert.equal(vm.authority, 'PROPOSAL_ONLY');
assert.equal(vm.contract.readOnly, true);
assert.deepEqual(vm.contract.mutationsExposed, []);
assert.equal(vm.contract.canonicalGateAuthority, false);
assert.equal(vm.contract.createProjectEnabled, false);
assert.equal(vm.contract.productTruthEnabled, false);
assert.equal(vm.contract.publishEnabled, false);
assert(Object.isFrozen(vm));
assert(Object.isFrozen(vm.table.rows));
assert(Object.isFrozen(vm.detailsById));
assert.equal(vm.query.sortBy, 'HEAD_KEYWORD');
assert.equal(vm.query.direction, 'ASC');
assert.equal(vm.query.filter, 'ALL');
assert.equal(vm.table.pagination.totalItems, 3);
assert.equal(vm.table.rows.length, 3);
assert.deepEqual(vm.table.rows.map(r => r.headKeyword), [...vm.table.rows.map(r => r.headKeyword)].sort());
assert(vm.table.rows.every(r => r.reviewOnly === true && r.canonicalGateAuthority === false));

const positive = buildReviewViewModel(model, { filter: 'POSITIVE_COMMERCIAL_SIGNAL' });
assert.equal(positive.table.pagination.totalItems, 1);
assert.equal(positive.table.rows[0].evidenceState, 'POSITIVE_COMMERCIAL_SIGNAL');

const noPositive = buildReviewViewModel(model, { filter: 'NO_POSITIVE_COMMERCIAL_SIGNAL' });
assert.equal(noPositive.table.pagination.totalItems, 2);
assert(noPositive.table.rows.every(row => row.evidenceState !== 'POSITIVE_COMMERCIAL_SIGNAL'));

const searched = buildReviewViewModel(model, { search: 'necklace' });
assert.equal(searched.table.pagination.totalItems, 1);
assert(searched.table.rows[0].headKeyword.includes('necklace'));

const desc = buildReviewViewModel(model, { sortBy: 'MEMBER_COUNT', direction: 'DESC' });
assert(desc.table.rows[0].memberCount >= desc.table.rows[desc.table.rows.length - 1].memberCount);
const q = normalizeQuery({ sortBy: 'evil', direction: 'sideways', filter: 'hack', page: -4, pageSize: 500, search: '  DOG   ' });
assert.deepEqual(q, { sortBy: 'HEAD_KEYWORD', direction: 'ASC', filter: 'ALL', search: 'dog', pageSize: 100, page: 1 });

const conflictModel = buildReviewDashboardModel(buildDiscoveryProposal({
  sourceFileId: fileId('view-conflict'),
  diagnostics: [
    { status: 'CONSUMED', sheetName: 'C', source: 'CEREBRO', mapping: { estimatedSales: 'Keyword Sales' } }
  ],
  candidates: [
    { keyword: 'memorial mug', estimatedSales: 10, origin: { source: 'CEREBRO', sheetName: 'C' } },
    { keyword: 'memorial mug', estimatedSales: 100, origin: { source: 'CEREBRO', sheetName: 'C' } }
  ]
}));
const conflictVm = buildReviewViewModel(conflictModel, { filter: 'CONFLICTS_ONLY' });
assert.equal(conflictVm.conflictTable.pagination.totalItems, 1);
assert.equal(conflictVm.conflictTable.rows.length, 1);
assert.equal(conflictVm.conflictTable.rows[0].importEligible, false);
assert.equal(conflictVm.table.rows.length, 0);

const conflictSearch = buildReviewViewModel(conflictModel, { filter: 'CONFLICTS_ONLY', search: 'not-present' });
assert.equal(conflictSearch.conflictTable.pagination.totalItems, 0);
assert.equal(conflictSearch.conflictTable.rows.length, 0);

const tamperedModel = JSON.parse(JSON.stringify(model));
tamperedModel.clusters[0].headKeyword = 'tampered after model hash';
assert.throws(() => buildReviewViewModel(tamperedModel), error => error.code === 'GLOBAL_REVIEW_UI_MODEL_HASH_MISMATCH');

const paged = buildReviewViewModel(model, { pageSize: 1, page: 999 });
assert.equal(paged.table.pagination.page, 3, 'page must clamp to last page');
assert.equal(paged.table.rows.length, 1);

const shuffledModel = buildReviewDashboardModel(buildDiscoveryProposal({ ...parsed, candidates: [...parsed.candidates].reverse() }));
const shuffledVm = buildReviewViewModel(shuffledModel);
assert.equal(vm.viewHash, shuffledVm.viewHash, 'default view model must be deterministic');
assert.deepEqual(vm, shuffledVm);

const badAuthority = { ...model, authority: 'CANONICAL' };
assert.throws(() => buildReviewViewModel(badAuthority), error => error.code === 'GLOBAL_REVIEW_UI_NON_PROPOSAL_AUTHORITY');
const leakedDecision = JSON.parse(JSON.stringify(model));
leakedDecision.canonicalDecisions.publishAuthorized = true;
assert.throws(() => buildReviewViewModel(leakedDecision),
  error => ['GLOBAL_REVIEW_UI_MODEL_HASH_MISMATCH','GLOBAL_REVIEW_UI_CANONICAL_DECISION_LEAK'].includes(error.code));

console.log('GLOBAL_REVIEW_UI_CONTRACT_V1 PASS');
