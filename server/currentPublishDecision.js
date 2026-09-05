// Binding/orchestration only. publishGate remains the sole publish policy.
const crypto = require('node:crypto');
const { canonicalJson } = require('./evidenceAuthority');
const { approvalHash } = require('./security/approval');
const { evaluatePublishGate } = require('./publishGate');
function approvalContextHash(row, card, approvedBy = row.approved_by) {
  return crypto.createHash('sha256').update(canonicalJson({
    tenantId: row.tenant_id, workspaceId: row.workspace_id, marketplace: row.marketplace,
    projectId: row.project_id, listingId: row.id, listingVersion: row.listing_version,
    payloadHash: approvalHash(JSON.parse(row.payload)), productTruthCard: card, approvedBy
  })).digest('hex');
}
function hasCurrentApprovalBinding(row) {
  let payload, card;
  try { payload = JSON.parse(row.payload); card = JSON.parse(row.product_truth_card); }
  catch (_) { return false; }
  if (!payload || Array.isArray(payload) || !card || Array.isArray(card)
      || row.status !== 'PUBLISH_READY' || row.approved_version !== row.listing_version
      || !Number.isSafeInteger(row.approved_by) || !row.approved_at || row.approval_authorized !== 1
      || row.approved_hash !== approvalHash(payload)
      || row.approved_context_hash !== approvalContextHash(row, card)) return false;
  return true;
}
function currentPublishDecision(row, screenListingIpOrFail) {
  const deny = (error, status = 409) => ({ allowed: false, error, status });
  if (!hasCurrentApprovalBinding(row)) return deny('APPROVAL_INVALIDATED');
  let payload = JSON.parse(row.payload);
  const card = JSON.parse(row.product_truth_card);
  try { ({ listing: payload } = screenListingIpOrFail(payload)); }
  catch (_) { return deny('IP_GUARD_UNAVAILABLE', 503); }
  Object.assign(payload, { status: row.status, productId: row.id, listingVersion: row.listing_version,
    marketplace: row.marketplace, productTruthCard: card, productTruthNotes: row.product_truth_notes || '' });
  const gate = evaluatePublishGate(payload);
  if (gate.final_status !== 'PUBLISH_READY' || !gate.canExport) return { ...deny('MISSING_PUBLISH_PRECONDITION', 400), gate };
  return { allowed: true, gate, payload };
}
module.exports = { approvalContextHash, hasCurrentApprovalBinding, currentPublishDecision };
