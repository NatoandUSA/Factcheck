/**
 * F-AL1: server-authoritative IP re-screen regression coverage.
 *
 * PATCH /api/listings/:id previously persisted the client's payload as-is,
 * with no call to ipGuard.screenListing() at all. A client could edit a
 * benign listing's title to a protected/trademarked term while claiming
 * ipVerdict:'CLEAR' in the payload, and that forged clean state would
 * persist through approval and export unchanged (publishGate only trusts
 * whatever ipVerdict/ipHits are already on the object -- it never calls
 * ipGuard itself).
 *
 * IP-1 Amazon title, IP-2 Etsy title, IP-3 Etsy tags verify a client cannot
 * forge clean IP metadata on a post-create PATCH. IP-4 proves approval
 * re-screens a legacy/tampered payload. IP-5 verifies the matching export
 * defense-in-depth boundary.
 */
process.env.NODE_ENV = 'test';

const assert = require('assert');
const { makeProductTruthCard } = require('./helpers/productTruth.cjs');
const { approvalHash } = require('../server/security/approval');
const { app, db, databaseReady } = require('../server/server');

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
}
function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function onRun(err) { err ? reject(err) : resolve(this); }));
}

async function waitForOwnerWorkspaces(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await dbAll(`
      SELECT wm.workspace_id, w.marketplace
      FROM workspace_memberships wm
      JOIN users u ON u.id = wm.user_id
      JOIN workspaces w ON w.id = wm.workspace_id
      WHERE u.email = 'owner@omniseller.local'
    `);
    if (rows.length === 2) return rows;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for deterministic workspace fixtures');
}

async function login(port, workspaceId) {
  const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${port}` },
    body: JSON.stringify({ email: 'owner@omniseller.local', password: 'password123', workspaceId })
  });
  assert.strictEqual(res.status, 200, 'owner fixture login must succeed');
  return res.headers.get('set-cookie').split(';')[0];
}

async function request(port, path, cookie, method = 'GET', body) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      Origin: `http://127.0.0.1:${port}`,
      Cookie: cookie,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, body: await res.json() };
}

async function createBenignListing(port, cookie, marketplace) {
  const created = await request(port, '/api/listings', cookie, 'POST', {
    amazonTitle: marketplace === 'AMAZON' ? 'Neutral Family Gift Idea' : '',
    etsyTitle: marketplace === 'ETSY' ? 'Neutral Family Gift Idea' : '',
    categoryName: 'Apparel',
    payload: {
      amazonDescription: 'Human checked neutral product description.',
      etsyDescription: 'Human checked neutral product description.',
      etsyTags: [],
      netProfit: 8.50,
      netMargin: 35.0
    }
  });
  assert.strictEqual(created.status, 200, 'benign listing create must succeed');
  return created.body.id;
}

function forgedPayload({ amazonTitle = '', etsyTitle = '', etsyTags = [] }) {
  return {
    // The attack: a client can put whatever it wants here. The hotfix must
    // overwrite these, never trust them.
    ipVerdict: 'CLEAR',
    ipHits: [],
    status: 'PUBLISH_READY',
    amazonTitle,
    etsyTitle,
    amazonDescription: 'Human checked neutral product description.',
    etsyDescription: 'Human checked neutral product description.',
    etsyTags,
    netProfit: 8.50,
    netMargin: 35.0
  };
}

async function patchProtected(port, cookie, listingId, { amazonTitle = '', etsyTitle = '', etsyTags = [] }) {
  return request(port, `/api/listings/${listingId}`, cookie, 'PATCH', {
    expectedVersion: 1,
    amazonTitle,
    etsyTitle,
    categoryName: 'Apparel',
    payload: forgedPayload({ amazonTitle, etsyTitle, etsyTags })
  });
}

function assertBlockScreen(body, label) {
  assert.strictEqual(body.status, 'IP_RISK_BLOCKED', `${label}: PATCH must set IP_RISK_BLOCKED`);
  assert.strictEqual(body.ipVerdict, 'BLOCK', `${label}: IP Guard, not the client, must derive BLOCK`);
  assert.ok(Array.isArray(body.ipHits) && body.ipHits.some(hit => String(hit.term || hit).toLowerCase() === 'disney'),
    `${label}: server must retain the authoritative protected-term hit`);
}

async function assertPersistedBlock(listingId, label) {
  const row = await dbGet('SELECT status, payload FROM listings WHERE id = ?', [listingId]);
  const payload = JSON.parse(row.payload);
  assert.strictEqual(row.status, 'IP_RISK_BLOCKED', `${label}: blocked state must persist, not only appear in the HTTP response`);
  assert.strictEqual(payload.ipVerdict, 'BLOCK', `${label}: persisted payload must retain the canonical BLOCK verdict`);
  assert.ok(payload.ipHits.some(hit => String(hit.term || hit).toLowerCase() === 'disney'), `${label}: persisted hit must remain canonical`);
}

async function main() {
  console.log('================================================================');
  console.log('  TESTING F-AL1: SERVER-AUTHORITATIVE LISTING IP RE-SCREEN');
  console.log('================================================================\n');

  await databaseReady;
  const server = app.listen(0);
  const port = server.address().port;
  process.env.ALLOWED_ORIGINS = `http://127.0.0.1:${port}`;

  try {
    const memberships = await waitForOwnerWorkspaces();
    const amazonWorkspaceId = memberships.find(m => m.marketplace === 'AMAZON').workspace_id;
    const etsyWorkspaceId = memberships.find(m => m.marketplace === 'ETSY').workspace_id;
    const amazonCookie = await login(port, amazonWorkspaceId);
    const etsyCookie = await login(port, etsyWorkspaceId);

    // IP-1: Amazon title is protected after the benign record was created.
    const amazonListingId = await createBenignListing(port, amazonCookie, 'AMAZON');
    const amazonPatch = await patchProtected(port, amazonCookie, amazonListingId, { amazonTitle: 'Disney Family Gift Idea' });
    assert.strictEqual(amazonPatch.status, 200, 'IP-1 PATCH should persist a reviewable blocked revision');
    assertBlockScreen(amazonPatch.body, 'IP-1 Amazon title');
    await assertPersistedBlock(amazonListingId, 'IP-1 Amazon title');
    console.log('🟢 IP-1: Amazon protected-title PATCH cannot forge a clean IP state.');

    // IP-2: Amazon/Etsy sibling symmetry for title fields.
    const etsyTitleListingId = await createBenignListing(port, etsyCookie, 'ETSY');
    const etsyTitlePatch = await patchProtected(port, etsyCookie, etsyTitleListingId, { etsyTitle: 'Disney Family Gift Idea' });
    assert.strictEqual(etsyTitlePatch.status, 200, 'IP-2 PATCH should persist a reviewable blocked revision');
    assertBlockScreen(etsyTitlePatch.body, 'IP-2 Etsy title');
    await assertPersistedBlock(etsyTitleListingId, 'IP-2 Etsy title');
    console.log('🟢 IP-2: Etsy protected-title PATCH is screened symmetrically.');

    // IP-3: Etsy tags are also in ipGuard.screenListing(), not a title-only gate.
    const etsyTagListingId = await createBenignListing(port, etsyCookie, 'ETSY');
    const etsyTagPatch = await patchProtected(port, etsyCookie, etsyTagListingId, {
      etsyTitle: 'Neutral Family Gift Idea',
      etsyTags: ['disney gift', 'family gift']
    });
    assert.strictEqual(etsyTagPatch.status, 200, 'IP-3 PATCH should persist a reviewable blocked revision');
    assertBlockScreen(etsyTagPatch.body, 'IP-3 Etsy tag');
    await assertPersistedBlock(etsyTagListingId, 'IP-3 Etsy tag');
    console.log('🟢 IP-3: Etsy protected tags are included in server-side screening.');

    // IP-4: simulate a legacy/corrupted record that still contains protected
    // content but carries forged clean metadata (e.g. a row written before
    // this hotfix existed). Approval must independently re-screen rather
    // than trust the stored status/ip fields.
    const patchedRow = await dbGet('SELECT payload FROM listings WHERE id = ?', [amazonListingId]);
    const forgedLegacyPayload = { ...JSON.parse(patchedRow.payload), ipVerdict: 'CLEAR', ipHits: [] };
    await dbRun("UPDATE listings SET status = 'NEEDS_QA', payload = ? WHERE id = ?", [JSON.stringify(forgedLegacyPayload), amazonListingId]);
    const approvalAttempt = await request(port, `/api/listings/${amazonListingId}/approve`, amazonCookie, 'PATCH', {
      expectedVersion: 2,
      productTruthCard: makeProductTruthCard(amazonListingId, 2)
    });
    assert.strictEqual(approvalAttempt.status, 400, 'IP-4 protected legacy content must be denied at approval');
    assert.match(String(approvalAttempt.body.error || ''), /APPROVAL_DENIED/, 'IP-4 denial must be explicit');
    assert.strictEqual(approvalAttempt.body.publishGate?.final_status, 'BLOCKED', 'IP-4 canonical gate must receive re-screened BLOCK data');
    assert.ok(approvalAttempt.body.reasons.some(reason => /trademark|ip|disney/i.test(String(reason))), 'IP-4 must expose a server-derived IP reason');
    console.log('🟢 IP-4: approval re-screens forged legacy metadata and denies publish.');

    // IP-5: matching export defense-in-depth. Seed a row that looks fully
    // approved (valid hash/version) but whose stored content is still the
    // forged-clean protected payload -- export must not trust that either.
    await dbRun(
      `UPDATE listings
       SET status = 'PUBLISH_READY', approved_version = listing_version,
           approved_hash = ?, product_truth_notes = ?
       WHERE id = ?`,
      [approvalHash(forgedLegacyPayload), 'I personally verified the product truth details.', amazonListingId]
    );
    // Bind all current approval fields so IP-5 still reaches IP re-screening,
    // rather than being rejected earlier as an unbound legacy approval.
    const fixtureRow = await dbGet('SELECT * FROM listings WHERE id=?', [amazonListingId]);
    const fixtureOwner = await dbGet("SELECT id FROM users WHERE email='owner@omniseller.local'");
    const fixtureCard = makeProductTruthCard(amazonListingId, fixtureRow.listing_version);
    const contextHash = require('../server/currentPublishDecision').approvalContextHash(fixtureRow, fixtureCard, fixtureOwner.id);
    await dbRun('UPDATE listings SET approved_by=?,approved_at=CURRENT_TIMESTAMP,product_truth_card=?,approved_context_hash=? WHERE id=?',
      [fixtureOwner.id, JSON.stringify(fixtureCard), contextHash, amazonListingId]);
    const exportAttempt = await request(port, `/api/listings/${amazonListingId}/export`, amazonCookie);
    assert.strictEqual(exportAttempt.status, 403, 'IP-5 protected legacy content must be denied at export');
    assert.match(String(exportAttempt.body.error || ''), /EXPORT_DENIED/, 'IP-5 export denial must be explicit');
    assert.ok(exportAttempt.body.reasons?.some(reason => /trademark|ip|disney/i.test(String(reason))), 'IP-5 must expose a server-derived IP reason');
    console.log('🟢 IP-5: export re-screens forged legacy metadata and denies output.');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => db.close(resolve));
  }
}

main().catch(error => {
  console.error('🔴 F-AL1 IP re-screen regression failed:', error.stack || error.message);
  process.exitCode = 1;
});
