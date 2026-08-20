/**
 * EXECUTABLE TEST SUITE: PUBLISH GATE CONTRACTS & HTTP AUTHORITY INTEGRATION MATRIX
 * Verified on clean SHA 4dfbf62 baseline.
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const { app, db, databaseReady } = require('../server/server');
const { evaluatePublishGate, MIN_NET_PROFIT, MIN_NET_MARGIN } = require('../server/publishGate');

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}

async function waitForOwnerWorkspaces(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await dbAll(`
      SELECT wm.workspace_id, w.marketplace, u.id as user_id, w.tenant_id
      FROM workspace_memberships wm
      JOIN users u ON u.id = wm.user_id
      JOIN workspaces w ON w.id = wm.workspace_id
      WHERE u.email = 'owner@omniseller.local'
    `);
    if (rows.length === 2) return rows;
    await new Promise(r => setTimeout(r, 25));
  }
  throw new Error('Timed out waiting for deterministic test fixtures');
}

async function login(port, email, password, workspaceId) {
  const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': `http://127.0.0.1:${port}` },
    body: JSON.stringify({ email, password, workspaceId })
  });
  if (res.status !== 200) return null;
  return res.headers.get('set-cookie').split(';')[0];
}

async function runPublishGateContractSuite() {
  console.log('================================================================');
  console.log('  TESTING PUBLISH GATE CONTRACTS & HTTP AUTHORITY INTEGRATION');
  console.log('================================================================');

  // --- PART 1: DIRECT UNIT GATE ASSERTIONS ---
  const validAmazonListing = {
    marketplace: 'AMAZON',
    status: 'MANAGER_APPROVED',
    amazonTitle: 'Custom Gold Bar Necklace for Women Personalised Name Gift',
    amazonBullets: [
      '[ELEGANT DESIGN] Crafted for everyday milestone elegance.',
      '[CUSTOM ENGRAVING] Precision laser engraved with your name or date.',
      '[PERFECT GIFT] Packaged for birthdays, anniversaries, and holidays.',
      '[DURABLE QUALITY] Premium grade finish built for daily wear.',
      '[SATISFACTION GUARANTEED] Dedicated customer support for every order.'
    ],
    amazonSearchTerms: 'personalized necklace gold bar custom name pendant',
    amazonDescription: '<p>Real detailed product description for custom gold bar necklace.</p>',
    productTruthNotes: 'Verified material quality and custom engraving mechanics in person.',
    ipVerdict: 'OK',
    netProfit: 8.50,
    netMargin: 35.0
  };

  const result1 = evaluatePublishGate(validAmazonListing);
  assert.strictEqual(result1.final_status, 'PUBLISH_READY');
  assert.strictEqual(result1.canExport, true);
  console.log('  🟢 Valid Amazon Listing: PUBLISH_READY passed.');

  const missingBulletsListing = { ...validAmazonListing, amazonBullets: [] };
  const result2 = evaluatePublishGate(missingBulletsListing);
  assert.strictEqual(result2.final_status, 'NEEDS_REVIEW');
  assert.ok(result2.reasons.some(r => r.includes('5 bullet points required for Amazon listings')));
  console.log('  🟢 Missing Amazon Bullets: NEEDS_REVIEW caught missing contract data.');

  const longSearchTerms = 'a'.repeat(250);
  const longTermsListing = { ...validAmazonListing, amazonSearchTerms: longSearchTerms };
  const result3 = evaluatePublishGate(longTermsListing);
  assert.strictEqual(result3.final_status, 'NEEDS_REVIEW');
  assert.ok(result3.reasons.some(r => r.includes('249 UTF-8 bytes limit')));
  console.log('  🟢 Search Terms >249 Bytes: NEEDS_REVIEW caught byte limit violation.');

  const nanProfitListing = { ...validAmazonListing, netProfit: 'invalid_number_string', netMargin: NaN };
  const result4 = evaluatePublishGate(nanProfitListing);
  assert.strictEqual(result4.final_status, 'NEEDS_REVIEW');
  assert.ok(result4.reasons.some(r => r.includes('Invalid net profit value')));
  assert.ok(result4.reasons.some(r => r.includes('Invalid net margin value')));
  console.log('  🟢 Financial NaN: Rejects invalid non-finite numbers safely without failing open.');

  const lowProfitListing = { ...validAmazonListing, netProfit: 4.50, netMargin: 32.0 };
  const result5 = evaluatePublishGate(lowProfitListing);
  assert.strictEqual(result5.final_status, 'NEEDS_REVIEW');
  assert.ok(result5.reasons.some(r => r.includes('below the required $6.00 floor')));
  console.log('  🟢 Financial Floor: Rejects net profit below $6.00 floor.');

  // Unrecognized Product Type test (Fail-closed contract)
  const unknownTypeListing = { ...validAmazonListing, productType: 'INVALID_SURPRISE_PRODUCT_TYPE' };
  const resultUnknown = evaluatePublishGate(unknownTypeListing);
  assert.strictEqual(resultUnknown.final_status, 'NEEDS_REVIEW');
  assert.ok(resultUnknown.reasons.some(r => r.includes('Unrecognized product type contract')));
  console.log('  🟢 Unrecognized Product Type: NEEDS_REVIEW caught unclassified product type contract.');

  // Etsy Title Authority (Dual title payload uses etsyTitle first for Etsy marketplace contract)
  const etsyDualListing = {
    marketplace: 'ETSY',
    productType: 'APPAREL',
    status: 'MANAGER_APPROVED',
    amazonTitle: 'a'.repeat(205), // > 200 chars on Amazon title, but Etsy title is valid
    etsyTitle: 'Valid Etsy Title Under 200 Chars',
    etsyTags: Array.from({ length: 13 }, (_, i) => `etsytag${i + 1}`),
    etsyDescription: 'Valid Etsy description text.',
    productTruthNotes: 'Verified Etsy product details.',
    ipVerdict: 'OK',
    ipHits: []
  };
  const resultEtsyTitle = evaluatePublishGate(etsyDualListing);
  assert.strictEqual(resultEtsyTitle.final_status, 'PUBLISH_READY', 'Etsy contract must evaluate etsyTitle over amazonTitle');
  console.log('  🟢 Marketplace Title Selection: Etsy contract evaluated etsyTitle over amazonTitle.');

  // Multi-Sheet Zero Signature Fail-Closed Test
  const ExcelJS = require('exceljs');
  const path = require('path');
  const fs = require('fs');
  const os = require('os');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multisheet-test-'));
  const testFile = path.join(tempDir, 'zero_signature.xlsx');
  const wb = new ExcelJS.Workbook();
  const ws1 = wb.addWorksheet('Sheet1');
  ws1.addRow(['Unrelated Header A', 'Unrelated Header B']);
  ws1.addRow(['val1', 'val2']);
  const ws2 = wb.addWorksheet('Sheet2');
  ws2.addRow(['Unrelated Header C', 'Unrelated Header D']);
  ws2.addRow(['val3', 'val4']);
  await wb.xlsx.writeFile(testFile);

  const { readWorksheetWithSignature } = require('../server/services/spreadsheetReader');
  const multiSheetRes = await readWorksheetWithSignature(testFile);
  assert.strictEqual(multiSheetRes.success, false);
  assert.strictEqual(multiSheetRes.code, 'UNSUPPORTED_REPORT');
  assert.ok(multiSheetRes.error.includes('none match a recognized report signature'));
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log('  🟢 Multi-Sheet Fail-Closed: Multi-sheet workbook with zero signature matches returned UNSUPPORTED_REPORT.');

  // --- PART 2: HTTP SERVER ROW AUTHORITY & INTEGRATION MATRIX ---
  await databaseReady;
  const workspaces = await waitForOwnerWorkspaces();
  const amazonWs = workspaces.find(w => w.marketplace === 'AMAZON');
  assert(amazonWs, 'Amazon workspace fixture missing');

  const server = app.listen(0);
  const port = server.address().port;
  process.env.ALLOWED_ORIGINS = `http://127.0.0.1:${port}`;

  try {
    const ownerCookie = await login(port, 'owner@omniseller.local', 'password123', amazonWs.workspace_id);
    assert(ownerCookie, 'Owner login failed');

    // Test A: Marketplace Spoofing Prevention via HTTP (DB row marketplace === AMAZON)
    const spoofCreateRes = await fetch(`http://127.0.0.1:${port}/api/listings`, {
      method: 'POST',
      headers: { Cookie: ownerCookie, 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${port}` },
      body: JSON.stringify({
        amazonTitle: 'Spoofed Etsy Marketplace Listing Test',
        etsyTitle: 'Spoofed Etsy Marketplace Listing Test',
        categoryName: 'Jewelry',
        payload: {
          marketplace: 'ETSY', // Client attempts to claim Etsy marketplace!
          ipVerdict: 'OK',
          ipHits: [],
          etsyTags: Array.from({ length: 13 }, (_, i) => `tag ${i + 1}`),
          amazonDescription: 'Valid description for spoofing test.'
        }
      })
    });
    assert.strictEqual(spoofCreateRes.status, 200);
    const spoofedListing = await spoofCreateRes.json();

    // Owner attempts to approve -- server MUST force row.marketplace ('AMAZON') and fail gate due to missing Amazon bullets/search terms
    const spoofApproveRes = await fetch(`http://127.0.0.1:${port}/api/listings/${spoofedListing.id}/approve`, {
      method: 'PATCH',
      headers: { Cookie: ownerCookie, 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${port}` },
      body: JSON.stringify({ expectedVersion: 1, productTruthNotes: 'Testing server marketplace authority.' })
    });
    assert.strictEqual(spoofApproveRes.status, 400, 'Server must reject spoofed Etsy payload on Amazon workspace DB row');
    const spoofBody = await spoofApproveRes.json();
    assert.strictEqual(spoofBody.error, 'APPROVAL_DENIED: Cannot publish listing with status "NEEDS_REVIEW".');
    assert.ok(spoofBody.reasons.some(r => r.includes('5 bullet points required for Amazon listings')));
    console.log('  🟢 HTTP Matrix 1 (Marketplace Spoofing Prevention): Server DB row.marketplace authority enforced.');

    // Test B: Missing Amazon Search Terms HTTP Rejection
    const missingSearchTermsRes = await fetch(`http://127.0.0.1:${port}/api/listings`, {
      method: 'POST',
      headers: { Cookie: ownerCookie, 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${port}` },
      body: JSON.stringify({
        amazonTitle: 'Missing Search Terms Test Listing',
        etsyTitle: 'Missing Search Terms Test Listing',
        categoryName: 'Apparel',
        payload: {
          ipVerdict: 'OK',
          ipHits: [],
          amazonTitle: 'Missing Search Terms Test Listing',
          amazonBullets: [
            '[HOOK ONE] Valid bullet description one.',
            '[HOOK TWO] Valid bullet description two.',
            '[HOOK THREE] Valid bullet description three.',
            '[HOOK FOUR] Valid bullet description four.',
            '[HOOK FIVE] Valid bullet description five.'
          ],
          amazonDescription: 'Valid description for search terms test.'
        }
      })
    });
    assert.strictEqual(missingSearchTermsRes.status, 200);
    const missingTermsListing = await missingSearchTermsRes.json();

    // Explicitly update payload to clear search terms
    const patchClearRes = await fetch(`http://127.0.0.1:${port}/api/listings/${missingTermsListing.id}`, {
      method: 'PATCH',
      headers: { Cookie: ownerCookie, 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${port}` },
      body: JSON.stringify({
        expectedVersion: 1,
        amazonTitle: 'Missing Search Terms Test Listing',
        etsyTitle: 'Missing Search Terms Test Listing',
        categoryName: 'Apparel',
        payload: {
          ipVerdict: 'OK',
          ipHits: [],
          amazonTitle: 'Missing Search Terms Test Listing',
          amazonBullets: [
            '[HOOK ONE] Valid bullet description one.',
            '[HOOK TWO] Valid bullet description two.',
            '[HOOK THREE] Valid bullet description three.',
            '[HOOK FOUR] Valid bullet description four.',
            '[HOOK FIVE] Valid bullet description five.'
          ],
          amazonSearchTerms: '', // Cleared search terms!
          amazonDescription: 'Valid description for search terms test.'
        }
      })
    });
    assert.strictEqual(patchClearRes.status, 200);

    const approveTermsRes = await fetch(`http://127.0.0.1:${port}/api/listings/${missingTermsListing.id}/approve`, {
      method: 'PATCH',
      headers: { Cookie: ownerCookie, 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${port}` },
      body: JSON.stringify({ expectedVersion: 2, productTruthNotes: 'Testing missing search terms rejection.' })
    });
    assert.strictEqual(approveTermsRes.status, 400, 'Missing search terms must be rejected via HTTP 400');
    const termsBody = await approveTermsRes.json();
    assert.ok(termsBody.reasons.some(r => r.includes('Missing Amazon search terms')));
    console.log('  🟢 HTTP Matrix 2 (Missing Amazon Search Terms): Rejected via HTTP 400.');

    // Test C: Economics Absence Non-Blocking & Export Integration
    const fullValidRes = await fetch(`http://127.0.0.1:${port}/api/listings`, {
      method: 'POST',
      headers: { Cookie: ownerCookie, 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${port}` },
      body: JSON.stringify({
        amazonTitle: 'Full Valid Amazon Listing Without Financial Figures',
        etsyTitle: 'Full Valid Amazon Listing Without Financial Figures',
        categoryName: 'Apparel',
        payload: {
          ipVerdict: 'OK',
          ipHits: [],
          amazonTitle: 'Full Valid Amazon Listing Without Financial Figures',
          amazonBullets: [
            '[HOOK ONE] Valid bullet description one.',
            '[HOOK TWO] Valid bullet description two.',
            '[HOOK THREE] Valid bullet description three.',
            '[HOOK FOUR] Valid bullet description four.',
            '[HOOK FIVE] Valid bullet description five.'
          ],
          amazonSearchTerms: 'valid generic search terms for apparel sweatshirt',
          amazonDescription: 'Valid description for complete test listing.'
        }
      })
    });
    assert.strictEqual(fullValidRes.status, 200);
    const validListingRow = await fullValidRes.json();

    const approveValidRes = await fetch(`http://127.0.0.1:${port}/api/listings/${validListingRow.id}/approve`, {
      method: 'PATCH',
      headers: { Cookie: ownerCookie, 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${port}` },
      body: JSON.stringify({ expectedVersion: 1, productTruthNotes: 'Verified full valid listing without financial figures.' })
    });
    assert.strictEqual(approveValidRes.status, 200, 'Full valid listing without financial figures must reach PUBLISH_READY');
    const validApproveBody = await approveValidRes.json();
    assert.strictEqual(validApproveBody.status, 'PUBLISH_READY');

    const exportValidRes = await fetch(`http://127.0.0.1:${port}/api/listings/${validListingRow.id}/export`, {
      headers: { Cookie: ownerCookie }
    });
    assert.strictEqual(exportValidRes.status, 200, 'PUBLISH_READY listing must export successfully');
    const exportBody = await exportValidRes.json();
    assert.strictEqual(exportBody.listing.marketplace, 'AMAZON', 'Exported payload must retain server DB row marketplace authority');
    console.log('  🟢 HTTP Matrix 3 (Economics Absence & Export Authority): Approved and exported with server row.marketplace authority.');

    // Test D: Etsy DB Row Symmetry (Client spoofing marketplace: 'AMAZON')
    const etsyWs = workspaces.find(w => w.marketplace === 'ETSY');
    assert(etsyWs, 'Etsy workspace fixture missing');
    const ownerEtsyCookie = await login(port, 'owner@omniseller.local', 'password123', etsyWs.workspace_id);
    assert(ownerEtsyCookie, 'Owner Etsy login failed');

    const etsySpoofRes = await fetch(`http://127.0.0.1:${port}/api/listings`, {
      method: 'POST',
      headers: { Cookie: ownerEtsyCookie, 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${port}` },
      body: JSON.stringify({
        amazonTitle: 'Etsy Workspace Listing Spoofing Amazon Test',
        etsyTitle: 'Etsy Workspace Listing Spoofing Amazon Test',
        categoryName: 'Embroidery',
        payload: {
          marketplace: 'AMAZON', // Client attempts to spoof Amazon marketplace!
          ipVerdict: 'OK',
          ipHits: [],
          amazonDescription: 'Etsy product description.'
          // Missing Etsy tags!
        }
      })
    });
    assert.strictEqual(etsySpoofRes.status, 200);
    const etsySpoofListing = await etsySpoofRes.json();

    // Explicitly update payload to clear etsyTags
    const patchClearTagsRes = await fetch(`http://127.0.0.1:${port}/api/listings/${etsySpoofListing.id}`, {
      method: 'PATCH',
      headers: { Cookie: ownerEtsyCookie, 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${port}` },
      body: JSON.stringify({
        expectedVersion: 1,
        amazonTitle: 'Etsy Workspace Listing Spoofing Amazon Test',
        etsyTitle: 'Etsy Workspace Listing Spoofing Amazon Test',
        categoryName: 'Embroidery',
        payload: {
          marketplace: 'AMAZON',
          ipVerdict: 'OK',
          ipHits: [],
          etsyTags: [], // Cleared Etsy tags!
          amazonDescription: 'Etsy product description.'
        }
      })
    });
    assert.strictEqual(patchClearTagsRes.status, 200);

    const etsyApproveSpoofRes = await fetch(`http://127.0.0.1:${port}/api/listings/${etsySpoofListing.id}/approve`, {
      method: 'PATCH',
      headers: { Cookie: ownerEtsyCookie, 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${port}` },
      body: JSON.stringify({ expectedVersion: 2, productTruthNotes: 'Testing Etsy server row authority.' })
    });
    assert.strictEqual(etsyApproveSpoofRes.status, 400, 'Server must enforce Etsy 13 tags contract on Etsy DB row');
    const etsySpoofBody = await etsyApproveSpoofRes.json();
    assert.ok(etsySpoofBody.reasons.some(r => r.includes('13 tags required for Etsy listings')));

    // Valid Etsy Approval (Does NOT require Amazon bullets or Amazon search terms)
    const etsyValidCreateRes = await fetch(`http://127.0.0.1:${port}/api/listings`, {
      method: 'POST',
      headers: { Cookie: ownerEtsyCookie, 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${port}` },
      body: JSON.stringify({
        amazonTitle: 'Valid Etsy Listing Title',
        etsyTitle: 'Valid Etsy Listing Title',
        categoryName: 'Embroidery',
        payload: {
          marketplace: 'AMAZON', // Spoofed payload marketplace, but server DB row is ETSY
          ipVerdict: 'OK',
          ipHits: [],
          etsyTags: Array.from({ length: 13 }, (_, i) => `etsytag${i + 1}`),
          etsyDescription: 'Valid Etsy product description.'
        }
      })
    });
    assert.strictEqual(etsyValidCreateRes.status, 200);
    const etsyValidListing = await etsyValidCreateRes.json();

    const etsyValidApproveRes = await fetch(`http://127.0.0.1:${port}/api/listings/${etsyValidListing.id}/approve`, {
      method: 'PATCH',
      headers: { Cookie: ownerEtsyCookie, 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${port}` },
      body: JSON.stringify({ expectedVersion: 1, productTruthNotes: 'Verified Etsy product details.' })
    });
    assert.strictEqual(etsyValidApproveRes.status, 200, 'Valid Etsy listing must reach PUBLISH_READY without Amazon bullets');
    console.log('  🟢 HTTP Matrix 4 (Etsy DB Row Symmetry): Server DB row.marketplace (ETSY) enforced, ignoring payload Amazon claims.');

    // Test E: Export Spoofed Payload Authority Test
    const etsyExportRes = await fetch(`http://127.0.0.1:${port}/api/listings/${etsyValidListing.id}/export`, {
      headers: { Cookie: ownerEtsyCookie }
    });
    assert.strictEqual(etsyExportRes.status, 200, 'Export of approved Etsy listing must succeed');
    const etsyExportBody = await etsyExportRes.json();
    assert.strictEqual(etsyExportBody.listing.marketplace, 'ETSY', 'Exported payload must retain server DB row marketplace (ETSY)');
    console.log('  🟢 HTTP Matrix 5 (Export Spoofed Payload Authority): Export enforced server DB row.marketplace (ETSY).');

  } finally {
    server.close();
  }

  console.log('================================================================');
  console.log('  🟢 ALL PUBLISH GATE CONTRACT & HTTP AUTHORITY TESTS PASSED CLEANLY');
  console.log('================================================================');
}

runPublishGateContractSuite().catch(err => {
  console.error('🔴 Publish Gate Contract Suite Failed:', err);
  process.exit(1);
});
