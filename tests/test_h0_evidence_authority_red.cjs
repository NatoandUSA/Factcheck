const assert = require('assert');
const fs = require('fs');
const path = require('path');

const authorityPath = path.resolve(__dirname, '../server/evidenceAuthority.js');
const serverPath = path.resolve(__dirname, '../server/server.js');
const serverSrc = fs.readFileSync(serverPath, 'utf8');

const failures = [];
function check(name, fn) {
  try {
    fn();
    console.log(`🟢 ${name}`);
  } catch (err) {
    failures.push({ name, message: err.message });
    console.error(`🔴 ${name}: ${err.message}`);
  }
}

let authority = null;
try {
  authority = require(authorityPath);
} catch (err) {
  failures.push({ name: 'H0 authority module exists', message: err.message });
  console.error(`🔴 H0 authority module exists: ${err.message}`);
}

function requireAuthority() {
  assert.ok(authority, 'server/evidenceAuthority.js must exist before H0 can pass');
  return authority;
}

const baseScope = Object.freeze({
  tenantId: 'tenant-alpha',
  workspaceId: 11,
  marketplace: 'AMAZON',
  projectId: 101,
  evidenceVersion: 1
});

check('A default-deny: MANUAL/Xray/Cerebro/Etsy/unknown/missing kind never qualify', () => {
  const { evaluateEvidenceAuthority } = requireAuthority();
  for (const candidate of [
    { source: 'MANUAL', metadata: {} },
    { source: 'H10_XRAY_OBSERVED', metadata: {} },
    { source: 'FILE_UPLOAD', metadata: { kind: 'CEREBRO_UPLOAD' } },
    { source: 'ETSY_SEARCH_OBSERVED', metadata: { kind: 'ETSY_SEARCH_PASTE_V1' } },
    { source: 'MCP_RETRIEVAL', metadata: { kind: 'UNKNOWN_KIND' } },
    { source: 'MCP_RETRIEVAL', metadata: {} }
  ]) {
    const result = evaluateEvidenceAuthority(candidate, baseScope);
    assert.strictEqual(result.qualifying, false, `${candidate.source}/${candidate.metadata.kind || 'missing-kind'} must fail closed`);
  }
});

check('B forged authority metadata: generic /api/evidence client metadata is non-authoritative', () => {
  const { sanitizeGenericEvidenceMetadata, evaluateEvidenceAuthority } = requireAuthority();
  const forged = {
    kind: 'SMART_PULL_ARTIFACT_V1',
    evidenceState: 'VERIFIED_RETRIEVED',
    contentHash: 'a'.repeat(64),
    provider: 'H10_MCP',
    authority: 'QUALIFYING',
    tenantId: baseScope.tenantId,
    workspaceId: baseScope.workspaceId,
    marketplace: baseScope.marketplace,
    projectId: baseScope.projectId,
    evidenceVersion: baseScope.evidenceVersion
  };
  const sanitized = sanitizeGenericEvidenceMetadata(forged);
  const result = evaluateEvidenceAuthority({ source: 'MCP_RETRIEVAL', metadata: sanitized }, baseScope);
  assert.strictEqual(result.qualifying, false, 'client-forged metadata must not manufacture authority');
  for (const key of ['authority', 'evidenceState', 'contentHash', 'provider', 'tenantId', 'workspaceId', 'marketplace', 'projectId', 'evidenceVersion']) {
    assert.notStrictEqual(sanitized[key], forged[key], `generic route must not trust client ${key}`);
  }
});

check('C legacy ACCEPTED bypass: ACCEPTED state alone never qualifies', () => {
  const { evaluateEvidenceAuthority } = requireAuthority();
  const result = evaluateEvidenceAuthority({
    evidence_state: 'ACCEPTED',
    source: 'MANUAL',
    metadata: { legacy: true }
  }, baseScope);
  assert.strictEqual(result.qualifying, false);
});

check('D wrong scope: any tenant/workspace/marketplace/project mismatch fails closed', () => {
  const { deriveControlledEvidenceEnvelope, evaluateEvidenceAuthority } = requireAuthority();
  const controlled = deriveControlledEvidenceEnvelope({
    provider: 'H10_MCP',
    payload: { rows: [{ asin: 'B000TEST' }] },
    scope: baseScope
  });
  for (const scope of [
    { ...baseScope, tenantId: 'tenant-wrong' },
    { ...baseScope, workspaceId: 999 },
    { ...baseScope, marketplace: 'ETSY' },
    { ...baseScope, projectId: 999 }
  ]) {
    assert.strictEqual(evaluateEvidenceAuthority(controlled, scope).qualifying, false);
  }
  assert.ok(serverSrc.includes('parseAndValidateProject(db, req, projectId'), 'generic ingest must validate project scope before persistence');
});

check('E rejected acceptance: server must gate before ACCEPTED update/event append', () => {
  assert.ok(serverSrc.includes('getEvidenceAcceptanceEligibility(evidence)'), 'accept endpoint must recompute eligibility from persisted evidence');
  assert.ok(serverSrc.indexOf('getEvidenceAcceptanceEligibility(evidence)') < serverSrc.indexOf('INSERT INTO evidence_acceptance_events'), 'eligibility gate must execute before acceptance event append');
  assert.ok(serverSrc.includes('evidenceAuthority'), 'acceptance gate must use H0 authority module, not legacy default-allow semantics');
});

check('F positive control: controlled server/provider path derives hash + scope/version and qualifies', () => {
  const { deriveControlledEvidenceEnvelope, evaluateEvidenceAuthority } = requireAuthority();
  const controlled = deriveControlledEvidenceEnvelope({
    provider: 'H10_MCP',
    payload: { rows: [{ asin: 'B000TEST', rank: 7 }] },
    scope: baseScope
  });
  assert.match(controlled.metadata.contentHash, /^[a-f0-9]{64}$/);
  assert.deepStrictEqual(controlled.metadata.scope, baseScope);
  assert.strictEqual(controlled.metadata.evidenceVersion, baseScope.evidenceVersion);
  assert.strictEqual(evaluateEvidenceAuthority(controlled, baseScope).qualifying, true);
});

console.log('\nH0 RED baseline summary');
if (failures.length) {
  for (const failure of failures) console.error(` - ${failure.name}: ${failure.message}`);
  console.error(`\n🔴 H0 RED CONFIRMED: ${failures.length} contract checks failing.`);
  process.exit(1);
}
console.log('🟢 H0 contract unexpectedly green; implementation already satisfies baseline.');
