const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { buildDiscoveryProposal } = require('../server/globalOpportunityProposalPipeline');
const { buildReviewDashboardModel } = require('../server/globalOpportunityReviewDashboardModel');
const { buildReviewViewModel } = require('../server/globalOpportunityReviewViewModel');
const { buildReviewDecisionEnvelope } = require('../server/globalOpportunityDecisionBoundary');
const { createReviewLedger, appendReviewArtifact } = require('../server/globalOpportunityReviewArtifactLedger');
const {
  VERSION, buildCanonicalHandoffPacket, verifyCanonicalHandoffPacket
} = require('../server/globalOpportunityCanonicalHandoffPacket');

function fileId(label) {
  return crypto.createHash('sha256').update(label).digest('hex');
}

const parsed = {
  sourceFileId: fileId('handoff-packet'),
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
const targetId = vm.table.rows.find(row => row.headKeyword.includes('wind chime')).id;

let ledger = createReviewLedger({ scopeId: 'global-opportunity-review', sourceViewHash: vm.viewHash });

const noteEnvelope = buildReviewDecisionEnvelope(vm, {
  intent: 'ADD_REVIEW_NOTE',
  target: { type: 'CLUSTER', id: targetId },
  note: 'Cross-source observation reviewed.'
});
ledger = appendReviewArtifact(ledger, noteEnvelope, {
  recordedAt: '2026-09-20T01:05:00.000Z',
  reviewerRef: 'codex-reviewer'
});

const requestEnvelope = buildReviewDecisionEnvelope(vm, {
  intent: 'REQUEST_CANONICAL_EVALUATION',
  target: { type: 'CLUSTER', id: targetId },
  note: 'Canonical authority should independently evaluate this cluster.'
});
ledger = appendReviewArtifact(ledger, requestEnvelope, {
  recordedAt: '2026-09-20T01:06:00.000Z',
  reviewerRef: 'codex-reviewer'
});
const requestArtifact = ledger.entries.find(entry => entry.type === 'CANONICAL_EVALUATION_REQUEST');

const packet = buildCanonicalHandoffPacket(vm, ledger, { requestArtifactId: requestArtifact.artifactId });

assert.equal(VERSION, 'GLOBAL_CANONICAL_HANDOFF_PACKET_V1_PROPOSAL');
assert.equal(packet.authority, 'READ_ONLY_HANDOFF');
assert.equal(packet.executionContract.sidecarMayInvokeCanonicalWorkflow, false);
assert.equal(packet.executionContract.sidecarMayMutateCanonicalState, false);
assert.equal(packet.executionContract.canonicalSystemMustReevaluateIndependently, true);
assert.equal(packet.executionContract.packetConfersNoApproval, true);
assert.equal(packet.executionContract.packetConfersNoProofGate, true);
assert.equal(packet.executionContract.packetConfersNoProjectCreationAuthority, true);
assert.equal(packet.executionContract.packetConfersNoProductTruthAuthority, true);
assert.equal(packet.executionContract.packetConfersNoPublishAuthority, true);
assert.equal(packet.sourceBindings.viewHash, vm.viewHash);
assert.equal(packet.sourceBindings.ledgerHash, ledger.ledgerHash);
assert.equal(packet.sourceBindings.ledgerTailHash, ledger.tailHash);
assert.equal(packet.sourceBindings.ledgerEntryCount, ledger.entryCount);
assert.equal(packet.sourceBindings.requestArtifactId, requestArtifact.artifactId);
assert.equal(packet.target.id, targetId);
assert(packet.evidenceLineage.length >= 2);
assert(packet.evidenceLineage.every(row => /^[a-f0-9]{64}$/.test(row.sourceFileId)));
assert(packet.evidenceLineage.every(row => /^[a-f0-9]{64}$/.test(row.lineageHash)));
assert(packet.reviewArtifactRefs.length >= 2);
assert(packet.reviewArtifactRefs.some(ref => ref.isCanonicalRequest));
assert.deepEqual(packet.reviewArtifactRefs.map(ref => ref.sequence),
  [...packet.reviewArtifactRefs.map(ref => ref.sequence)].sort((a, b) => a - b));
assert(Object.isFrozen(packet));
assert.equal(verifyCanonicalHandoffPacket(packet).valid, true);


function stableForTest(value) {
  if (Array.isArray(value)) return '[' + value.map(stableForTest).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stableForTest(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

const ledgerTamperWithRehash = JSON.parse(JSON.stringify(ledger));
ledgerTamperWithRehash.entries[0].note = 'tampered review context';
const ledgerBody = { ...ledgerTamperWithRehash };
delete ledgerBody.ledgerHash;
ledgerTamperWithRehash.ledgerHash = crypto.createHash('sha256').update(stableForTest(ledgerBody)).digest('hex');
assert.throws(
  () => buildCanonicalHandoffPacket(vm, ledgerTamperWithRehash, { requestArtifactId: requestArtifact.artifactId }),
  error => String(error.code || '').startsWith('GLOBAL_HANDOFF_LEDGER_INVALID_')
);

const noteOnlyArtifact = ledger.entries.find(entry => entry.type === 'REVIEW_NOTE');
assert.throws(
  () => buildCanonicalHandoffPacket(vm, ledger, { requestArtifactId: noteOnlyArtifact.artifactId }),
  error => error.code === 'GLOBAL_HANDOFF_ARTIFACT_NOT_CANONICAL_REQUEST'
);

const badArtifactId = 'RA-' + 'f'.repeat(24);
assert.throws(
  () => buildCanonicalHandoffPacket(vm, ledger, { requestArtifactId: badArtifactId }),
  error => error.code === 'GLOBAL_HANDOFF_REQUEST_ARTIFACT_NOT_UNIQUE'
);

const otherVm = buildReviewViewModel(buildReviewDashboardModel(buildDiscoveryProposal({
  ...parsed,
  sourceFileId: fileId('handoff-packet-other')
})));
assert.throws(
  () => buildCanonicalHandoffPacket(otherVm, ledger, { requestArtifactId: requestArtifact.artifactId }),
  error => ['GLOBAL_HANDOFF_LEDGER_VIEW_MISMATCH','GLOBAL_HANDOFF_REQUEST_VIEW_MISMATCH'].includes(error.code)
);

const tamperedPacket = JSON.parse(JSON.stringify(packet));
tamperedPacket.executionContract.sidecarMayInvokeCanonicalWorkflow = true;
const tamperedVerify = verifyCanonicalHandoffPacket(tamperedPacket);
assert.equal(tamperedVerify.valid, false);
assert(['GLOBAL_HANDOFF_PACKET_HASH_MISMATCH','GLOBAL_HANDOFF_PACKET_AUTHORITY_LEAK'].includes(tamperedVerify.code));


const selfConsistentAuthorityLeak = JSON.parse(JSON.stringify(packet));
selfConsistentAuthorityLeak.executionContract.sidecarMayInvokeCanonicalWorkflow = true;
const leakBody = { ...selfConsistentAuthorityLeak };
delete leakBody.packetHash;
selfConsistentAuthorityLeak.packetHash = crypto.createHash('sha256').update(stableForTest(leakBody)).digest('hex');
assert.equal(verifyCanonicalHandoffPacket(selfConsistentAuthorityLeak).valid, false);
assert.equal(verifyCanonicalHandoffPacket(selfConsistentAuthorityLeak).code, 'GLOBAL_HANDOFF_PACKET_AUTHORITY_LEAK');

const noEvidenceVm = JSON.parse(JSON.stringify(vm));
noEvidenceVm.detailsById[targetId].provenance = [];
assert.throws(
  () => buildCanonicalHandoffPacket(noEvidenceVm, ledger, { requestArtifactId: requestArtifact.artifactId }),
  error => ['GLOBAL_HANDOFF_VIEW_HASH_MISMATCH','GLOBAL_HANDOFF_EVIDENCE_LINEAGE_REQUIRED'].includes(error.code)
);

const shuffledLedger = {
  ...ledger,
  entries: [...ledger.entries]
};
const packet2 = buildCanonicalHandoffPacket(vm, shuffledLedger, { requestArtifactId: requestArtifact.artifactId });
assert.equal(packet.packetHash, packet2.packetHash);
assert.deepEqual(packet, packet2);

console.log('GLOBAL_CANONICAL_HANDOFF_PACKET_V1 PASS');
