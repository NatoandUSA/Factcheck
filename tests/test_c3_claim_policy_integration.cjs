'use strict';

const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.OMNI_MASTER_KEY ||= Buffer.alloc(32, 73).toString('base64');

const { app, db, databaseReady } = require('../server/server');
const { createSessionRecord } = require('../server/security/session');
const { approvalHash } = require('../server/security/approval');
const { approvalContextHash } = require('../server/currentPublishDecision');
const { makeProductTruthCard } = require('./helpers/productTruth.cjs');

const all = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
});
const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function onRun(error) {
    if (error) reject(error);
    else resolve({ lastID: this.lastID, changes: this.changes });
  });
});

let server;
let passed = 0;
let failed = 0;
let unexecuted = 0;
const EXPECTED_TESTS = 6;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    failed += 1;
    process.stderr.write(`FAIL ${name}\n${error.stack || error.message}\n`);
  }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

async function writableAuthorityTables() {
  const rows = await all(`SELECT name FROM sqlite_master
    WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`);
  return rows.map(row => row.name).filter(name => /(listing|revision|approval|event)/i.test(name));
}

async function writeSnapshot() {
  const snapshot = {};
  for (const table of await writableAuthorityTables()) {
    snapshot[table] = canonical(await all(`SELECT * FROM "${table}" ORDER BY rowid`));
  }
  return snapshot;
}

function diffCounts(before, after) {
  const names = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return Object.fromEntries(names.map(name => [name, (after[name] || []).length - (before[name] || []).length]));
}

function assertClaimPolicyRejection(result, allowedStatuses, label) {
  assert.ok(allowedStatuses.includes(result.status),
    `${label} must fail closed with ${allowedStatuses.join('/')}; observed status=${result.status} body=${JSON.stringify(result.body)}`);
  assert.match(JSON.stringify(result.body), /UNVERIFIED_OUTPUT_CLAIM|CLAIM_GUARD|POLICY_[A-Z_]+/,
    `${label} must expose a claim/policy denial, not an unrelated gate: ${JSON.stringify(result.body)}`);
}

function unsafePayload() {
  return {
    amazonTitle: 'Silver 925 Laser Engraved Necklace',
    etsyTitle: 'Silver 925 Laser Engraved Necklace',
    categoryName: 'JEWELRY_NECKLACE',
    amazonDescription: 'Sterling silver 925 necklace with laser engraving.',
    amazonBullets: ['Silver 925', 'Laser engraved', 'Gift ready', 'Fast shipping', 'Guaranteed quality'],
    amazonSearchTerms: 'silver 925 laser engraved necklace',
    etsyTags: ['silver necklace', '925 necklace'],
    netProfit: 8.5,
    netMargin: 35,
    // Every field below is attacker-controlled and must have zero authority.
    claimSurfaceBlockingFree: true,
    claimsCleared: true,
    policyCompliant: true,
    policyContractApprovalEligible: true,
    policyContractExportEligible: true,
    policyBinding: { policyContractId: 'attacker', policyContractArtifactHash: '0'.repeat(64) },
    canApprove: true,
    canExport: true,
    productTruthCard: {
      state: 'VERIFIED',
      facts: { materials: ['silver 925'], process: ['laser engraved'] }
    }
  };
}

async function insertListing(owner, payload = unsafePayload()) {
  const result = await run(`INSERT INTO listings
    (tenant_id, workspace_id, marketplace, amazonTitle, etsyTitle, categoryName, status, authorId, payload)
    VALUES (?, ?, ?, ?, ?, ?, 'NEEDS_QA', ?, ?)`, [
    owner.tenantId, owner.workspaceId, owner.marketplace,
    payload.amazonTitle, payload.etsyTitle, payload.categoryName,
    owner.userId, JSON.stringify(payload)
  ]);
  return result.lastID;
}

async function main() {
  await databaseReady;
  const [owner] = await all(`SELECT u.id AS userId, w.id AS workspaceId,
      w.tenant_id AS tenantId, w.marketplace
    FROM users u
    JOIN workspace_memberships m ON m.user_id=u.id
    JOIN workspaces w ON w.id=m.workspace_id
    WHERE u.email='owner@omniseller.local' AND m.role='OWNER' AND w.marketplace='AMAZON'
    ORDER BY w.id LIMIT 1`);
  assert(owner, 'DISCOVERY: Amazon OWNER fixture is required for real staff-facing route tests');

  const session = await new Promise((resolve, reject) => {
    createSessionRecord(db, owner.userId, owner.workspaceId, owner.tenantId,
      (error, value) => error ? reject(error) : resolve(value));
  });
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  process.env.ALLOWED_ORIGINS = origin;
  const headers = {
    Cookie: `omni_session=${session.rawToken}`,
    Origin: origin,
    'Content-Type': 'application/json'
  };

  async function request(route, method, body, requestHeaders = headers) {
    const response = await fetch(`${origin}${route}`, {
      method,
      headers: requestHeaders,
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    let payload;
    try { payload = await response.json(); } catch (_) { payload = { nonJson: await response.text() }; }
    return { status: response.status, body: payload };
  }

  await test('DISCOVERY real C3 staff paths exist and authority-write surfaces are measurable', async () => {
    const routeSignatures = app.router.stack
      .filter(layer => layer.route)
      .map(layer => `${Object.keys(layer.route.methods).join(',').toUpperCase()} ${layer.route.path}`);
    for (const expected of [
      'POST /api/listings',
      'POST /api/amazon/quick-draft',
      'PATCH /api/listings/:id',
      'PATCH /api/listings/:id/approve',
      'GET /api/listings/:id/export'
    ]) assert(routeSignatures.includes(expected), `DISCOVERY missing live endpoint: ${expected}`);
    const tables = await writableAuthorityTables();
    assert(tables.includes('listings'), `DISCOVERY cannot measure listing writes; found=${tables.join(',')}`);
    process.stdout.write(`DISCOVERY authority tables=${tables.join(',')}\n`);
  });

  await test('compose/create rejects unverified claims and forged clearance with zero writes', async () => {
    const before = await writeSnapshot();
    const attack = unsafePayload();
    const result = await request('/api/listings', 'POST', {
      amazonTitle: attack.amazonTitle,
      etsyTitle: attack.etsyTitle,
      categoryName: attack.categoryName,
      payload: attack
    });
    const after = await writeSnapshot();
    const deltas = diffCounts(before, after);
    // Keep later RED cases independent when the current fail-open route inserts.
    if (result.body && Number.isSafeInteger(result.body.id)) await run('DELETE FROM listings WHERE id=?', [result.body.id]);
    assertClaimPolicyRejection(result, [409, 422], 'compose/create');
    assert.deepEqual(after, before, `rejected compose/create wrote authority state: ${JSON.stringify(deltas)}`);
  });

  await test('post-edit second pass rejects injected claims and client clearance with zero writes', async () => {
    const safe = {
      amazonTitle: 'Neutral Necklace', etsyTitle: 'Neutral Necklace', categoryName: 'JEWELRY_NECKLACE',
      amazonDescription: 'A neutral product description.', amazonBullets: ['One', 'Two', 'Three', 'Four', 'Five'],
      amazonSearchTerms: 'neutral necklace', etsyTags: ['neutral necklace'], netProfit: 8.5, netMargin: 35
    };
    const id = await insertListing(owner, safe);
    const before = await writeSnapshot();
    const attack = unsafePayload();
    const result = await request(`/api/listings/${id}`, 'PATCH', {
      expectedVersion: 1,
      amazonTitle: attack.amazonTitle,
      etsyTitle: attack.etsyTitle,
      categoryName: attack.categoryName,
      payload: attack
    });
    const after = await writeSnapshot();
    assertClaimPolicyRejection(result, [409, 422], 'post-edit');
    assert.deepEqual(after, before, `rejected post-edit changed listing/approval/event state: ${JSON.stringify(diffCounts(before, after))}`);
  });

  await test('approval rejects blocked copy without writes while the attested row remains editable', async () => {
    const id = await insertListing(owner);
    const attested = await request(`/api/listings/${id}/product-truth`, 'PUT', {
      expectedVersion: 1,
      facts: {
        productType: { disposition: 'ASSERTED', value: 'Necklace', basis: 'PHYSICAL_INSPECTION' },
        materials: { disposition: 'UNKNOWN', reason: 'Supplier confirmation pending' },
        process: { disposition: 'UNKNOWN', reason: 'Production method not confirmed' }
      }
    });
    assert.equal(attested.status, 200, JSON.stringify(attested.body));
    assert.equal(attested.body.status, 'CLAIM_RISK_BLOCKED');
    const before = await writeSnapshot();
    const result = await request(`/api/listings/${id}/approve`, 'PATCH', {
      expectedVersion: 2,
      productTruthNotes: 'Client says all claims are verified.',
      claimSurfaceBlockingFree: true,
      policyContractApprovalEligible: true,
      policyBinding: { policyContractId: 'attacker', policyContractArtifactHash: '0'.repeat(64) },
      canApprove: true
    });
    const after = await writeSnapshot();
    assertClaimPolicyRejection(result, [400, 409, 422], 'approval');
    assert.deepEqual(after, before, `rejected approval changed listing/approval/event state: ${JSON.stringify(diffCounts(before, after))}`);

    const corrected = {
      amazonTitle: 'Everyday Necklace Gift', etsyTitle: '', categoryName: 'JEWELRY_NECKLACE',
      amazonDescription: 'A necklace for everyday gifting.',
      amazonBullets: ['[PRODUCT] Necklace.', '[DETAILS] Review options.', '[GIFTING] A thoughtful gift.', '[STYLE] Everyday style.', '[ORDERING] Confirm options.'],
      amazonSearchTerms: 'necklace everyday gift', etsyTags: [], netProfit: 8.5, netMargin: 35
    };
    const edit = await request(`/api/listings/${id}`, 'PATCH', {
      expectedVersion: 2,
      amazonTitle: corrected.amazonTitle,
      etsyTitle: corrected.etsyTitle,
      categoryName: corrected.categoryName,
      payload: corrected
    });
    assert.equal(edit.status, 200, JSON.stringify(edit.body));
    assert.equal(edit.body.listingVersion, 3);
    assert.equal(edit.body.productTruthCard.listingVersion, 3, 'blocked IP must not erase the staff attestation needed for correction');
  });

  await test('export re-audits persisted claims and ignores stored/client-shaped clearance', async () => {
    const payload = unsafePayload();
    const id = await insertListing(owner, payload);
    const attested = await request(`/api/listings/${id}/product-truth`, 'PUT', {
      expectedVersion: 1,
      facts: {
        productType: { disposition: 'ASSERTED', value: 'Necklace', basis: 'PHYSICAL_INSPECTION' },
        materials: { disposition: 'UNKNOWN', reason: 'Supplier confirmation pending' },
        process: { disposition: 'UNKNOWN', reason: 'Production method not confirmed' }
      }
    });
    assert.equal(attested.status, 200, JSON.stringify(attested.body));
    const [row] = await all('SELECT * FROM listings WHERE id=?', [id]);
    const card = JSON.parse(row.product_truth_card);
    const approvedRow = { ...row, status: 'PUBLISH_READY', approved_by: owner.userId };
    const approvedHash = approvalHash(payload);
    approvedRow.approved_hash = approvedHash;
    const contextHash = approvalContextHash(approvedRow, card, owner.userId);
    await run(`UPDATE listings SET status='PUBLISH_READY', approved_version=2,
      approved_hash=?, approved_context_hash=?, approved_by=?, approved_at=CURRENT_TIMESTAMP,
      product_truth_card=? WHERE id=?`, [approvedHash, contextHash, owner.userId, JSON.stringify(card), id]);
    const before = await writeSnapshot();
    const result = await request(`/api/listings/${id}/export`, 'GET');
    const after = await writeSnapshot();
    assertClaimPolicyRejection(result, [403, 409, 422], 'export');
    assert.deepEqual(after, before, `rejected export changed listing/approval/event state: ${JSON.stringify(diffCounts(before, after))}`);
  });

  await test('Seller attests truth, edit rebinds it, Manager approves, and export reads the same canonical row', async () => {
    const [seller] = await all(`SELECT u.id AS userId, w.id AS workspaceId, w.tenant_id AS tenantId, w.marketplace
      FROM users u JOIN workspace_memberships m ON m.user_id=u.id JOIN workspaces w ON w.id=m.workspace_id
      WHERE u.email='seller@omniseller.local' AND m.role='SELLER' AND w.id=? LIMIT 1`, [owner.workspaceId]);
    assert(seller, 'SELLER fixture in the exact Amazon workspace is required');
    const sellerSession = await new Promise((resolve, reject) => {
      createSessionRecord(db, seller.userId, seller.workspaceId, seller.tenantId,
        (error, value) => error ? reject(error) : resolve(value));
    });
    const sellerHeaders = { ...headers, Cookie: `omni_session=${sellerSession.rawToken}` };
    const safe = {
      amazonTitle: 'Stainless Steel Necklace Gift', etsyTitle: '', categoryName: 'JEWELRY',
      itemHighlights: 'Stainless steel necklace',
      amazonDescription: 'Stainless steel necklace for everyday gifting.',
      amazonBullets: [
        '[PRODUCT] Necklace.', '[MATERIAL] Stainless steel.', '[DETAILS] Review options.',
        '[GIFTING] For thoughtful gifting.', '[ORDERING] Confirm the selected option.'
      ],
      amazonSearchTerms: 'stainless steel necklace gift', etsyTags: [], netProfit: 8.5, netMargin: 35
    };
    const id = await insertListing(owner, safe);
    const truth = await request(`/api/listings/${id}/product-truth`, 'PUT', {
      expectedVersion: 1,
      facts: {
        productType: { disposition: 'ASSERTED', value: 'JEWELRY', basis: 'PHYSICAL_INSPECTION' },
        materials: { disposition: 'ASSERTED', value: ['stainless steel'], basis: 'PHYSICAL_INSPECTION' },
        packaging: { disposition: 'UNKNOWN', reason: 'Not confirmed' }
      }
    }, sellerHeaders);
    assert.equal(truth.status, 200, JSON.stringify(truth.body));
    assert.equal(truth.body.listingVersion, 2);
    assert.equal(truth.body.status, 'NEEDS_QA');
    const firstAttestation = truth.body.productTruthCard.attestation.id;

    const edited = await request(`/api/listings/${id}`, 'PATCH', {
      expectedVersion: 2,
      amazonTitle: safe.amazonTitle,
      etsyTitle: safe.etsyTitle,
      categoryName: safe.categoryName,
      payload: { ...safe, amazonDescription: `${safe.amazonDescription} Review all product details.` }
    }, sellerHeaders);
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    assert.equal(edited.body.listingVersion, 3);
    assert.notEqual(edited.body.productTruthCard.attestation.id, firstAttestation);
    assert.equal(edited.body.productTruthCard.listingVersion, 3);

    const approved = await request(`/api/listings/${id}/approve`, 'PATCH', { expectedVersion: 3 });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(approved.body.status, 'PUBLISH_READY');
    const exported = await request(`/api/listings/${id}/export`, 'GET');
    assert.equal(exported.status, 200, JSON.stringify(exported.body));
    assert.equal(exported.body.listing.amazonTitle, safe.amazonTitle);
  });
}

main().catch(error => {
  unexecuted += EXPECTED_TESTS - passed - failed;
  process.stderr.write(`HARNESS_FATAL ${error.stack || error.message}\n`);
  process.exitCode = 1;
}).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await new Promise(resolve => db.close(resolve));
  process.stdout.write(`C3_ROUTE_ACCOUNTING passed=${passed} failed=${failed} unexecuted=${unexecuted} total=${EXPECTED_TESTS}\n`);
  if (failed > 0 || unexecuted > 0) process.exitCode = 1;
});
