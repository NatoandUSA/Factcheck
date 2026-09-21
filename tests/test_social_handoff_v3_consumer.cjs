process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();
const { migrateSocialHandoffV3Consumer } = require('../server/database/migrations');
const { canonicalArtifactString, verifySocialHandoffV3 } = require('../server/integrations/socialHandoffV3Verifier');
const { pullAndPersistSocialHandoff } = require('../server/socialHandoffStore');

const SOURCE_SHA = '2ae2316ba73abd1fac75b706d2d41b9487bb4321';
const DEPLOYMENT_ID = 'ee11aa7d-e76f-4f72-9771-e6570ddaeb8a';
const SECRET = 'test-handoff-secret-with-32-bytes-minimum';
const NOW = new Date('2030-01-01T00:02:00.000Z');
const GOLDEN_BASE = '{"schemaVersion":"OMNISELLER_INTELLIGENCE_HANDOFF_V3","sourceSystem":"Ecom Intelligence Command Center","sourceVersion":"command-center-v2.3.0","sourceRelease":{"gitSha":"2ae2316ba73abd1fac75b706d2d41b9487bb4321","deploymentId":"ee11aa7d-e76f-4f72-9771-e6570ddaeb8a"},"generatedAt":"2030-01-01T00:00:00.000Z","market":"US","sourceRoleRegistryVersion":"SOURCE_ROLE_REGISTRY_V1","marketValidationCapability":"NOT_CONNECTED","authority":{"classification":"RESEARCH_ONLY","productTruth":false,"approvalAuthority":false,"publishAuthority":false,"marketplaceWrite":false,"note":"Research only."},"watchedOpportunities":[],"discoveryCandidates":[],"competitorStoreChanges":[],"reviewedPromotionQueue":[],"receipt":{"artifact":{"codecVersion":"ECOM_CANONICAL_ARTIFACT_V1","domain":"OMNISELLER_HANDOFF_V3","sha256":"2e5cd42d99b9ecd19a80aa5402a97d07d31fed56bcdec625221caca874b7ad12","bytes":897},"issuedAt":"2030-01-01T00:00:00.000Z","expiresAt":"2030-01-01T00:05:00.000Z","nonce":"123e4567-e89b-42d3-a456-426614174000","authentication":"HMAC_SHA256","signatureScope":"PAYLOAD_RECEIPT_TRANSPORT_V1","signature":"placeholder"},"transportDigest":"2e5cd42d99b9ecd19a80aa5402a97d07d31fed56bcdec625221caca874b7ad12","transportDigestAuthority":"SERVER_HMAC_AUTHENTICATED_ARTIFACT"}';

const run = (db, sql, params = []) => new Promise((resolve, reject) =>
  db.run(sql, params, function complete(error) { error ? reject(error) : resolve(this); }));
const get = (db, sql, params = []) => new Promise((resolve, reject) =>
  db.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
const all = (db, sql, params = []) => new Promise((resolve, reject) =>
  db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));
const close = db => new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
const COMMERCE_TABLES = [
  'product_truth_revisions', 'product_truth_families', 'product_truth_family_revisions',
  'intelligence_snapshots', 'listings', 'listing_revisions', 'canonical_listing_reviews',
  'canonical_submission_requests', 'canonical_submission_authorizations', 'canonical_submission_handoffs',
  'canonical_submission_exports', 'canonical_operator_submission_reports'
];

async function commerceSnapshot(db) {
  const snapshot = {};
  for (const table of COMMERCE_TABLES) {
    snapshot[table] = await all(db, `SELECT * FROM ${table} ORDER BY id`);
  }
  return snapshot;
}

function expectCode(fn, code) {
  assert.throws(fn, error => error?.code === code, `expected ${code}`);
}

function envelopeWithNonce(nonce) {
  // issuedAt intentionally stays fixed: Social includes sourceRevision +
  // receipt.issuedAt in the canonical artifact metadata. Changing issuedAt
  // therefore defines a different artifact rather than a fresh delivery of A.
  const envelope = JSON.parse(GOLDEN_BASE);
  envelope.receipt.nonce = nonce;
  const { receipt, transportDigest, transportDigestAuthority, ...payload } = envelope;
  const { signature: _signature, ...unsignedReceipt } = receipt;
  const input = canonicalArtifactString(JSON.stringify({ payload, receipt: unsignedReceipt,
    transportDigest, transportDigestAuthority }));
  envelope.receipt.signature = crypto.createHmac('sha256', SECRET).update(input, 'utf8').digest('hex');
  return JSON.stringify(envelope);
}

const GOLDEN = envelopeWithNonce('123e4567-e89b-42d3-a456-426614174000');

(async () => {
  const verified = verifySocialHandoffV3(GOLDEN, { secret: SECRET, allowedSourceSha: SOURCE_SHA,
    allowedDeploymentId: DEPLOYMENT_ID, now: NOW });
  assert.equal(verified.artifact.sha256, '2e5cd42d99b9ecd19a80aa5402a97d07d31fed56bcdec625221caca874b7ad12');
  assert.equal(verified.envelope.authority.classification, 'RESEARCH_ONLY');
  assert.equal(verified.envelope.marketValidationCapability, 'NOT_CONNECTED');

  const tamperedAuthority = JSON.stringify({ ...JSON.parse(GOLDEN), authority: {
    ...JSON.parse(GOLDEN).authority, productTruth: true } });
  expectCode(() => verifySocialHandoffV3(tamperedAuthority, { secret: SECRET, allowedSourceSha: SOURCE_SHA,
    allowedDeploymentId: DEPLOYMENT_ID, now: NOW }), 'SOCIAL_HANDOFF_SCHEMA_INVALID');
  const tamperedPayload = JSON.stringify({ ...JSON.parse(GOLDEN), sourceVersion: 'tampered' });
  expectCode(() => verifySocialHandoffV3(tamperedPayload, { secret: SECRET, allowedSourceSha: SOURCE_SHA,
    allowedDeploymentId: DEPLOYMENT_ID, now: NOW }), 'SOCIAL_HANDOFF_ARTIFACT_IDENTITY_INVALID');
  expectCode(() => verifySocialHandoffV3(GOLDEN, { secret: SECRET, allowedSourceSha: 'a'.repeat(40),
    allowedDeploymentId: DEPLOYMENT_ID, now: NOW }), 'SOCIAL_HANDOFF_SOURCE_SHA_REJECTED');
  expectCode(() => verifySocialHandoffV3(GOLDEN, { secret: SECRET, allowedSourceSha: SOURCE_SHA,
    allowedDeploymentId: 'wrong-deployment', now: NOW }), 'SOCIAL_HANDOFF_DEPLOYMENT_REJECTED');
  expectCode(() => verifySocialHandoffV3(GOLDEN, { secret: SECRET, allowedSourceSha: SOURCE_SHA,
    allowedDeploymentId: DEPLOYMENT_ID, now: new Date('2030-01-01T00:06:00.000Z') }), 'SOCIAL_HANDOFF_RECEIPT_EXPIRED');
  expectCode(() => verifySocialHandoffV3(GOLDEN, { secret: 'wrong-secret', allowedSourceSha: SOURCE_SHA,
    allowedDeploymentId: DEPLOYMENT_ID, now: NOW }), 'SOCIAL_HANDOFF_SIGNATURE_INVALID');

  const db = new sqlite3.Database(':memory:');
  try {
    await run(db, 'PRAGMA foreign_keys=ON');
    await run(db, 'CREATE TABLE users (id INTEGER PRIMARY KEY)');
    await run(db, 'INSERT INTO users(id) VALUES (1),(2)');
    await run(db, `CREATE TABLE audit_events (id INTEGER PRIMARY KEY AUTOINCREMENT,tenant_id TEXT,actor_id INTEGER,
      workspace_id INTEGER,marketplace TEXT,action TEXT,resource_type TEXT,resource_id TEXT,outcome TEXT,
      content_hash TEXT,metadata TEXT)`);
    for (const [index, table] of COMMERCE_TABLES.entries()) {
      if (table === 'listings') {
        await run(db, `CREATE TABLE listings (id INTEGER PRIMARY KEY,marker INTEGER NOT NULL,status TEXT,
          approved_version INTEGER,approved_hash TEXT,approved_by INTEGER,approved_at TEXT,publish_state TEXT)`);
        await run(db, `INSERT INTO listings
          (id,marker,status,approved_version,approved_hash,approved_by,approved_at,publish_state)
          VALUES (1,?,'MANAGER_APPROVED',7,'approved-hash',1,'2026-09-21T00:00:00.000Z','PUBLISH_BLOCKED')`,
        [index + 101]);
      } else {
        await run(db, `CREATE TABLE ${table} (id INTEGER PRIMARY KEY,marker INTEGER NOT NULL)`);
        await run(db, `INSERT INTO ${table}(id,marker) VALUES (1,?)`, [index + 101]);
      }
    }
    const commerceBefore = await commerceSnapshot(db);
    await migrateSocialHandoffV3Consumer(db);
    await migrateSocialHandoffV3Consumer(db);
    const env = { SOCIAL_HANDOFF_URL: 'https://intel.example.test/api/integrations/omniseller/opportunities',
      OMNISELLER_HANDOFF_TOKEN: SECRET, SOCIAL_HANDOFF_ALLOWED_SOURCE_SHA: SOURCE_SHA,
      SOCIAL_HANDOFF_ALLOWED_DEPLOYMENT_ID: DEPLOYMENT_ID };
    const scope = { tenantId: 'tenant-a', actorId: 1, role: 'OWNER', workspaceId: 7, marketplace: 'ETSY' };
    let fetches = 0;
    const fetchImpl = async () => { fetches += 1; return new Response(GOLDEN, { status: 200,
      headers: { 'content-type': 'application/json' } }); };
    const created = await pullAndPersistSocialHandoff({ db, scope, idempotencyKey: 'pull-social-0001',
      env, fetchImpl, now: NOW });
    assert.equal(created.replay, false);
    assert.equal(created.artifactReused, false);
    assert.equal(created.handoff.authority.productTruth, false);
    assert.equal(created.handoff.authority.marketplaceWrite, false);
    assert.equal((await get(db, 'SELECT COUNT(*) AS n FROM external_research_handoffs')).n, 1);
    assert.equal((await get(db, 'SELECT COUNT(*) AS n FROM external_research_handoff_receipts')).n, 1);
    assert.equal((await get(db, "SELECT COUNT(*) AS n FROM audit_events WHERE action='social-handoff-v3:pull'")).n, 1);

    const replay = await pullAndPersistSocialHandoff({ db, scope, idempotencyKey: 'pull-social-0001',
      env, fetchImpl: async () => { throw new Error('must not fetch'); }, now: NOW });
    assert.equal(replay.replay, true);
    assert.equal(replay.handoff.id, created.handoff.id);
    assert.equal(fetches, 1);
    await assert.rejects(() => pullAndPersistSocialHandoff({ db, scope: { ...scope, actorId: 2 },
      idempotencyKey: 'pull-social-0001', env, fetchImpl, now: NOW }),
    error => error?.code === 'SOCIAL_HANDOFF_IDEMPOTENCY_CONFLICT');

    await assert.rejects(() => pullAndPersistSocialHandoff({ db, scope, idempotencyKey: 'pull-social-0002',
      env, fetchImpl, now: NOW }), error => error?.code === 'SOCIAL_HANDOFF_NONCE_REPLAY');
    assert.equal((await get(db, 'SELECT COUNT(*) AS n FROM external_research_handoffs')).n, 1);
    const freshNonceEnvelope = envelopeWithNonce('223e4567-e89b-42d3-a456-426614174000');
    const freshNonce = await pullAndPersistSocialHandoff({ db, scope, idempotencyKey: 'pull-social-0003', env,
      fetchImpl: async () => new Response(freshNonceEnvelope, { status: 200,
        headers: { 'content-type': 'application/json' } }), now: NOW });
    assert.equal(freshNonce.artifactReused, true);
    assert.equal(freshNonce.handoff.id, created.handoff.id);
    assert.notEqual(freshNonce.handoff.nonceReceiptId, created.handoff.nonceReceiptId);
    assert.equal((await get(db, 'SELECT COUNT(*) AS n FROM external_research_handoffs')).n, 1,
      'fresh nonce for the same canonical artifact must not duplicate the artifact');
    assert.equal((await get(db, 'SELECT COUNT(*) AS n FROM external_research_handoff_nonces')).n, 2);
    assert.equal((await get(db, 'SELECT COUNT(*) AS n FROM external_research_handoff_receipts')).n, 2);
    await assert.rejects(() => run(db, 'UPDATE external_research_handoffs SET tenant_id=? WHERE id=1', ['tenant-b']),
      /IMMUTABLE_EXTERNAL_RESEARCH_HANDOFF/);
    await assert.rejects(() => run(db, 'UPDATE external_research_handoff_nonces SET nonce=? WHERE id=1', ['changed']),
      /IMMUTABLE_EXTERNAL_RESEARCH_HANDOFF/);
    await assert.rejects(() => run(db, 'DELETE FROM external_research_handoff_receipts WHERE id=1'),
      /IMMUTABLE_EXTERNAL_RESEARCH_HANDOFF/);
    await run(db, `CREATE TEMP TRIGGER force_social_handoff_audit_failure BEFORE INSERT ON main.audit_events
      WHEN NEW.action='social-handoff-v3:pull' BEGIN SELECT RAISE(ABORT,'forced audit failure'); END`);
    const rollbackEnvelope = envelopeWithNonce('323e4567-e89b-42d3-a456-426614174000');
    await assert.rejects(() => pullAndPersistSocialHandoff({ db, scope, idempotencyKey: 'pull-social-0005', env,
      fetchImpl: async () => new Response(rollbackEnvelope, { status: 200,
        headers: { 'content-type': 'application/json' } }), now: NOW }), /forced audit failure/);
    assert.equal((await get(db, 'SELECT COUNT(*) AS n FROM external_research_handoffs')).n, 1,
      'audit failure must roll back the handoff insert');
    assert.equal((await get(db, 'SELECT COUNT(*) AS n FROM external_research_handoff_nonces')).n, 2,
      'audit failure must roll back the nonce receipt');
    assert.equal((await get(db, 'SELECT COUNT(*) AS n FROM external_research_handoff_receipts')).n, 2,
      'audit failure must roll back the idempotency receipt');
    await run(db, 'DROP TRIGGER force_social_handoff_audit_failure');
    await assert.rejects(() => pullAndPersistSocialHandoff({ db, scope: { ...scope, role: 'MANAGER' },
      idempotencyKey: 'pull-social-0006', env, fetchImpl, now: NOW }), error => error?.code === 'SOCIAL_HANDOFF_OWNER_SCOPE_REQUIRED');
    assert.deepStrictEqual(await commerceSnapshot(db), commerceBefore,
      'Social Handoff intake must not mutate Product Truth, Intelligence, listing, review, export, or submission tables');
  } finally {
    await close(db);
  }

  const raceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-handoff-race-'));
  const racePath = path.join(raceDir, 'race.db');
  const raceA = new sqlite3.Database(racePath);
  const raceB = new sqlite3.Database(racePath);
  try {
    await run(raceA, 'PRAGMA foreign_keys=ON');
    await run(raceA, 'PRAGMA busy_timeout=5000');
    await run(raceB, 'PRAGMA foreign_keys=ON');
    await run(raceB, 'PRAGMA busy_timeout=5000');
    await run(raceA, 'CREATE TABLE users (id INTEGER PRIMARY KEY)');
    await run(raceA, 'INSERT INTO users(id) VALUES (1)');
    await run(raceA, `CREATE TABLE audit_events (id INTEGER PRIMARY KEY AUTOINCREMENT,tenant_id TEXT,actor_id INTEGER,
      workspace_id INTEGER,marketplace TEXT,action TEXT,resource_type TEXT,resource_id TEXT,outcome TEXT,
      content_hash TEXT,metadata TEXT)`);
    await migrateSocialHandoffV3Consumer(raceA);
    const env = { SOCIAL_HANDOFF_URL: 'https://intel.example.test/api/integrations/omniseller/opportunities',
      OMNISELLER_HANDOFF_TOKEN: SECRET, SOCIAL_HANDOFF_ALLOWED_SOURCE_SHA: SOURCE_SHA,
      SOCIAL_HANDOFF_ALLOWED_DEPLOYMENT_ID: DEPLOYMENT_ID };
    const scope = { tenantId: 'tenant-race', actorId: 1, role: 'OWNER', workspaceId: 1, marketplace: 'ETSY' };
    const raceEnvelopeA = envelopeWithNonce('423e4567-e89b-42d3-a456-426614174000');
    const raceEnvelopeB = envelopeWithNonce('523e4567-e89b-42d3-a456-426614174000');
    const [raceResultA, raceResultB] = await Promise.all([
      pullAndPersistSocialHandoff({ db: raceA, scope, idempotencyKey: 'race-social-pull-0001', env,
        fetchImpl: async () => new Response(raceEnvelopeA, { status: 200,
          headers: { 'content-type': 'application/json' } }), now: NOW }),
      pullAndPersistSocialHandoff({ db: raceB, scope, idempotencyKey: 'race-social-pull-0002', env,
        fetchImpl: async () => new Response(raceEnvelopeB, { status: 200,
          headers: { 'content-type': 'application/json' } }), now: NOW })
    ]);
    assert.equal(raceResultA.handoff.id, raceResultB.handoff.id);
    assert.deepStrictEqual([raceResultA.artifactReused, raceResultB.artifactReused].sort(), [false, true]);
    assert.equal((await get(raceA, 'SELECT COUNT(*) AS n FROM external_research_handoffs')).n, 1);
    assert.equal((await get(raceA, 'SELECT COUNT(*) AS n FROM external_research_handoff_nonces')).n, 2);
    assert.equal((await get(raceA, 'SELECT COUNT(*) AS n FROM external_research_handoff_receipts')).n, 2);
    assert.equal((await get(raceA, "SELECT COUNT(*) AS n FROM audit_events WHERE action='social-handoff-v3:pull'")).n, 2);
  } finally {
    await close(raceA);
    await close(raceB);
    fs.rmSync(raceDir, { recursive: true, force: true });
  }
  console.log('SOCIAL_HANDOFF_V3_CONSUMER_PASSED');
})().catch(error => {
  console.error('SOCIAL_HANDOFF_V3_CONSUMER_FAILED', error);
  process.exitCode = 1;
});
