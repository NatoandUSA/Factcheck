const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { buildDiscoveryProposal } = require('../server/globalOpportunityProposalPipeline');
const { buildReviewDashboardModel } = require('../server/globalOpportunityReviewDashboardModel');
const { buildReviewViewModel } = require('../server/globalOpportunityReviewViewModel');
const { buildReviewDecisionEnvelope } = require('../server/globalOpportunityDecisionBoundary');
const {
  VERSION, createReviewLedger, appendReviewArtifact, verifyReviewLedger
} = require('../server/globalOpportunityReviewArtifactLedger');

function fileId(label) {
  return crypto.createHash('sha256').update(label).digest('hex');
}

const parsed = {
  sourceFileId: fileId('review-ledger'),
  diagnostics: [
    { status: 'CONSUMED', sheetName: 'C', source: 'CEREBRO', mapping: { estimatedSales: 'Keyword Sales' } },
    { status: 'CONSUMED', sheetName: 'Y', source: 'YTREND', mapping: { trendVelocity: 'Momentum Score' } }
  ],
  candidates: [
    { keyword: 'dog memorial wind chime', estimatedSales: 30, origin: { source: 'CEREBRO', sheetName: 'C' } },
    { keyword: 'dog memorial wind chime', trendVelocity: 9, origin: { source: 'YTREND', sheetName: 'Y' } },
    { keyword: 'pet memorial necklace', estimatedSales: 0, origin: { source: 'CEREBRO', sheetName: 'C' } }
  ]
};

const vm = buildReviewViewModel(buildReviewDashboardModel(buildDiscoveryProposal(parsed)));
const clusterIds = vm.table.rows.map(row => row.id);
const firstCluster = clusterIds[0];

assert.equal(VERSION, 'GLOBAL_REVIEW_ARTIFACT_LEDGER_V1_PROPOSAL');

const ledger0 = createReviewLedger({ scopeId: 'global-opportunity-review', sourceViewHash: vm.viewHash });
assert.equal(ledger0.authority, 'REVIEW_ONLY');
assert.equal(ledger0.storageContract, 'SEPARATE_IMMUTABLE_REVIEW_LEDGER');
assert.equal(ledger0.entryCount, 0);
assert.equal(ledger0.tailHash, null);
assert(Object.isFrozen(ledger0));
assert.deepEqual(verifyReviewLedger(ledger0), {
  valid: true, code: 'VALID', entryCount: 0, tailHash: null
});

const noteEnvelope = buildReviewDecisionEnvelope(vm, {
  intent: 'ADD_REVIEW_NOTE',
  target: { type: 'CLUSTER', id: firstCluster },
  note: 'Needs independent source review.'
});

const ledger1 = appendReviewArtifact(ledger0, noteEnvelope, {
  recordedAt: '2026-09-20T00:10:00.000Z',
  reviewerRef: 'codex-reviewer',
  metadata: { channel: 'isolated-review', severity: 'normal' }
});
assert.equal(ledger1.entryCount, 1);
assert.equal(ledger1.entries[0].type, 'REVIEW_NOTE');
assert.equal(ledger1.entries[0].canonicalEffects, 'NONE');
assert.equal(ledger1.entries[0].previousEntryHash, null);
assert.match(ledger1.entries[0].artifactId, /^RA-[a-f0-9]{24}$/);
assert.equal(ledger1.tailHash, ledger1.entries[0].entryHash);
assert(Object.isFrozen(ledger1.entries));
assert.equal(ledger0.entryCount, 0, 'append must not mutate previous ledger');

const flagEnvelope = buildReviewDecisionEnvelope(vm, {
  intent: 'FLAG_FOR_REVIEW',
  target: { type: 'CLUSTER', id: firstCluster }
});
const ledger2 = appendReviewArtifact(ledger1, flagEnvelope, {
  recordedAt: '2026-09-20T00:11:00.000Z',
  reviewerRef: 'codex-reviewer'
});
assert.equal(ledger2.entryCount, 2);
assert.equal(ledger2.entries[1].type, 'REVIEW_FLAG');
assert.equal(ledger2.entries[1].previousEntryHash, ledger2.entries[0].entryHash);
assert.equal(verifyReviewLedger(ledger2).valid, true);

if (clusterIds.length > 1) {
  const mergeEnvelope = buildReviewDecisionEnvelope(vm, {
    intent: 'PROPOSE_CLUSTER_MERGE',
    target: { type: 'CLUSTER', id: clusterIds[0] },
    relatedTargetIds: [clusterIds[1]]
  });
  const mergeLedger = appendReviewArtifact(ledger2, mergeEnvelope, {
    recordedAt: '2026-09-20T00:12:00.000Z',
    reviewerRef: 'codex-reviewer',
    metadata: { reasonCode: 'semantic-overlap' }
  });
  assert.equal(mergeLedger.entries[2].type, 'CLUSTER_MERGE_PROPOSAL');
  assert.equal(mergeLedger.entries[2].canonicalEffects, 'NONE');
}

const splitEnvelope = buildReviewDecisionEnvelope(vm, {
  intent: 'PROPOSE_CLUSTER_SPLIT',
  target: { type: 'CLUSTER', id: firstCluster },
  note: 'Split variants before any canonical decision.'
});
const splitLedger = appendReviewArtifact(ledger2, splitEnvelope, {
  recordedAt: '2026-09-20T00:13:00.000Z',
  reviewerRef: 'codex-reviewer'
});
assert.equal(splitLedger.entries[2].type, 'CLUSTER_SPLIT_PROPOSAL');

const canonicalRequestEnvelope = buildReviewDecisionEnvelope(vm, {
  intent: 'REQUEST_CANONICAL_EVALUATION',
  target: { type: 'CLUSTER', id: firstCluster },
  note: 'Canonical authority may evaluate eligibility.'
});
const requestLedger = appendReviewArtifact(ledger2, canonicalRequestEnvelope, {
  recordedAt: '2026-09-20T00:14:00.000Z',
  reviewerRef: 'codex-reviewer'
});
assert.equal(requestLedger.entries[2].type, 'CANONICAL_EVALUATION_REQUEST');
assert.equal(requestLedger.entries[2].canonicalEffects, 'NONE');

assert.throws(
  () => appendReviewArtifact(ledger1, noteEnvelope, {
    recordedAt: 'bad-date', reviewerRef: 'x'
  }),
  error => error.code === 'GLOBAL_REVIEW_LEDGER_RECORDED_AT_REQUIRED'
);
assert.throws(
  () => appendReviewArtifact(ledger1, noteEnvelope, {
    recordedAt: '2026-09-20T00:15:00.000Z', reviewerRef: ''
  }),
  error => error.code === 'GLOBAL_REVIEW_LEDGER_REVIEWER_REF_REQUIRED'
);
assert.throws(
  () => appendReviewArtifact(ledger1, noteEnvelope, {
    recordedAt: '2026-09-20T00:15:00.000Z', reviewerRef: 'x',
    metadata: { status: 'QUALIFIED' }
  }),
  error => error.code === 'GLOBAL_REVIEW_LEDGER_CANONICAL_METADATA_FORBIDDEN'
);


assert.throws(
  () => appendReviewArtifact(ledger1, noteEnvelope, {
    recordedAt: '2026-09-20T00:15:00.000Z', reviewerRef: 'x',
    metadata: { Proof_Gate: 'PASS' }
  }),
  error => error.code === 'GLOBAL_REVIEW_LEDGER_CANONICAL_METADATA_FORBIDDEN'
);
assert.throws(
  () => appendReviewArtifact(ledger1, noteEnvelope, {
    recordedAt: '2026-09-20T00:15:00.000Z', reviewerRef: 'x',
    metadata: { score: Number.NaN }
  }),
  error => error.code === 'GLOBAL_REVIEW_LEDGER_METADATA_NUMBER_INVALID'
);
assert.throws(
  () => appendReviewArtifact(ledger1, noteEnvelope, {
    recordedAt: '2026-09-20T00:15:00.000Z', reviewerRef: 'x',
    metadata: { 'review-code': 'a', review_code: 'b' }
  }),
  error => error.code === 'GLOBAL_REVIEW_LEDGER_METADATA_KEY_COLLISION'
);


const badHandoffEnvelope = JSON.parse(JSON.stringify(noteEnvelope));
badHandoffEnvelope.handoff.requiresCanonicalAuthority = true;
delete badHandoffEnvelope.envelopeHash;
badHandoffEnvelope.envelopeHash = crypto.createHash('sha256').update(
  // Reproduce only enough to prove semantic validation still matters even for a self-consistent hash is
  // intentionally not attempted here; mutating the envelope must fail closed at integrity or semantics.
  'tampered-handoff'
).digest('hex');
assert.throws(
  () => appendReviewArtifact(ledger1, badHandoffEnvelope, {
    recordedAt: '2026-09-20T00:15:00.000Z', reviewerRef: 'x'
  }),
  error => ['GLOBAL_REVIEW_LEDGER_ENVELOPE_HASH_MISMATCH','GLOBAL_REVIEW_LEDGER_HANDOFF_SEMANTICS_INVALID'].includes(error.code)
);

const otherLedger = createReviewLedger({ scopeId: 'other', sourceViewHash: 'a'.repeat(64) });
assert.throws(
  () => appendReviewArtifact(otherLedger, noteEnvelope, {
    recordedAt: '2026-09-20T00:15:00.000Z', reviewerRef: 'x'
  }),
  error => error.code === 'GLOBAL_REVIEW_LEDGER_VIEW_SCOPE_MISMATCH'
);

const tampered = JSON.parse(JSON.stringify(ledger2));
tampered.entries[0].note = 'tampered';
const verifyTampered = verifyReviewLedger(tampered);
assert.equal(verifyTampered.valid, false);
assert(['GLOBAL_REVIEW_LEDGER_ENTRY_HASH_MISMATCH','GLOBAL_REVIEW_LEDGER_HASH_MISMATCH'].includes(verifyTampered.code));


const semanticTamper = JSON.parse(JSON.stringify(ledger1));
semanticTamper.entries[0].canonicalEffects = 'SET_QUALIFIED';
assert.equal(verifyReviewLedger(semanticTamper).valid, false);
assert.equal(verifyReviewLedger(semanticTamper).code, 'GLOBAL_REVIEW_LEDGER_ENTRY_CANONICAL_EFFECT_LEAK');

const typeTamper = JSON.parse(JSON.stringify(ledger1));
typeTamper.entries[0].type = 'CANONICAL_EVALUATION_REQUEST';
assert.equal(verifyReviewLedger(typeTamper).valid, false);
assert.equal(verifyReviewLedger(typeTamper).code, 'GLOBAL_REVIEW_LEDGER_ENTRY_TYPE_MISMATCH');

const deterministicA = appendReviewArtifact(ledger0, noteEnvelope, {
  recordedAt: '2026-09-20T00:10:00.000Z',
  reviewerRef: 'codex-reviewer',
  metadata: { b: '2', a: '1' }
});
const deterministicB = appendReviewArtifact(ledger0, noteEnvelope, {
  recordedAt: '2026-09-20T00:10:00.000Z',
  reviewerRef: 'codex-reviewer',
  metadata: { a: '1', b: '2' }
});
assert.equal(deterministicA.ledgerHash, deterministicB.ledgerHash);
assert.deepEqual(deterministicA, deterministicB);

console.log('GLOBAL_REVIEW_ARTIFACT_LEDGER_V1 PASS');
