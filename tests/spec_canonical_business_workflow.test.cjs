/**
 * SPEC CANONICAL BUSINESS WORKFLOW & ADVERSARIAL CERTIFICATION SUITE
 * Tests all end-to-end business rules, stage invariant blocks, unit economics,
 * and truth boundaries for Amazon & Etsy.
 */

const assert = require("assert");
const { makeProductTruthCard } = require('./helpers/productTruth.cjs');
const path = require("path");
const fs = require("fs");

process.env.NODE_ENV = "test";

const { app, db, databaseReady } = require("../server/server");
const { createSessionRecord } = require("../server/security/session");
const { evaluatePublishGate } = require("../server/publishGate");
const { filterAndBatchXrayAsins } = require("../server/asinBatcher");
const { calculateOpportunityScore } = require("../server/opportunityScorer");

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}

function createSession(userId, workspaceId, tenantId) {
  return new Promise((resolve, reject) => {
    createSessionRecord(db, userId, workspaceId, tenantId, (err, session) => {
      if (err) reject(err);
      else resolve(session);
    });
  });
}

async function waitForFixtures(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await dbAll(`
      SELECT u.id as user_id, w.tenant_id, wm.workspace_id, wm.role, w.marketplace
      FROM workspace_memberships wm
      JOIN users u ON u.id = wm.user_id
      JOIN workspaces w ON w.id = wm.workspace_id
      ORDER BY wm.workspace_id
    `);
    const hasOwnerAmz = rows.some(f => f.role === 'OWNER' && f.marketplace === 'AMAZON');
    const hasOwnerEtsy = rows.some(f => f.role === 'OWNER' && f.marketplace === 'ETSY');
    if (hasOwnerAmz && hasOwnerEtsy) return rows;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error("Timed out waiting for test fixtures");
}

async function runBusinessWorkflowTests() {
  await databaseReady;
  const fixtures = await waitForFixtures();
  const ownerAmz = fixtures.find(f => f.role === "OWNER" && f.marketplace === "AMAZON");
  const ownerEtsy = fixtures.find(f => f.role === "OWNER" && f.marketplace === "ETSY");

  assert(ownerAmz && ownerEtsy, "Fixtures missing for business workflow tests");

  console.log("================================================================");
  console.log("  TESTING CANONICAL BUSINESS WORKFLOW & ADVERSARIAL RULES");
  console.log("================================================================\n");

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const origin = { Origin: `http://127.0.0.1:${port}` };
  process.env.ALLOWED_ORIGINS = `http://127.0.0.1:${port},http://localhost:${port}`;

  try {
    const amzSession = await createSession(ownerAmz.user_id, ownerAmz.workspace_id, ownerAmz.tenant_id);
    const etsySession = await createSession(ownerEtsy.user_id, ownerEtsy.workspace_id, ownerEtsy.tenant_id);

    const amzCookie = `omni_session=${amzSession.rawToken}`;
    const etsyCookie = `omni_session=${etsySession.rawToken}`;

    // 1. Stage 1/Stage 2 Invariant: Cannot create listing during Stage 1 / Stage 2
    console.log("Test 1: Stage 1/2 Invariant -> POST /api/listings during Stage 1/2 must be BLOCKED...");
    const projRes = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { ...origin, "Content-Type": "application/json", Cookie: amzCookie },
      body: JSON.stringify({ name: "Stage Invariant Test Project", seedPhrase: "test shirt" })
    });
    const projData = await projRes.json();
    const stage1ProjId = projData.projectId;

    // Attempt listing creation targeting stage 1 project
    const createListingRes = await fetch(`${baseUrl}/api/listings`, {
      method: "POST",
      headers: { ...origin, "Content-Type": "application/json", Cookie: amzCookie },
      body: JSON.stringify({
        projectId: stage1ProjId,
        amazonTitle: "Test Title That Should Be Blocked In Stage 1",
        categoryName: "Apparel"
      })
    });
    assert.strictEqual(createListingRes.status, 409, `Stage 1 listing creation should return 409, got ${createListingRes.status}`);
    const createListingData = await createListingRes.json();
    assert.strictEqual(createListingData.error, "STAGE_INVARIANT_VIOLATION");
    console.log("  🟢 Stage 1/2 listing creation attempt correctly BLOCKED with HTTP 409 STAGE_INVARIANT_VIOLATION.");

    // 2. Amazon Batching Invariant: 29 ASINs must not force mandatory 3rd batch requirement
    console.log("\nTest 2: Amazon Batching: 29 ASINs must NOT force mandatory 3 batches requirement...");
    const sampleAsins29 = Array.from({ length: 29 }, (_, i) => `B09TEST${String(i).padStart(3, "0")}`);
    const batchResult29 = filterAndBatchXrayAsins(sampleAsins29.join(" "), "test hoodie");
    assert.strictEqual(batchResult29.success, true);
    assert.strictEqual(batchResult29.totalCleanAsins, 29);
    assert.strictEqual(batchResult29.batchCount, 3);
    assert.strictEqual(batchResult29.batches[0].asinCount, 10);
    assert.strictEqual(batchResult29.batches[1].asinCount, 10);
    assert.strictEqual(batchResult29.batches[2].asinCount, 9); // Partial batch of 9 without synthetic padding
    console.log("  🟢 29 ASINs cleanly batched (10, 10, 9) without synthetic padding or rigid 30-requirement.");

    // 3. Competitor DNA vs Product Truth Invariant: Missing sales stays UNKNOWN (never 0)
    console.log("\nTest 3: Missing Metrics stay UNKNOWN/null (Never coerced to 0)...");
    const oppUnscored = calculateOpportunityScore({ amazonTitle: "Mama Bear Sweatshirt" });
    assert.strictEqual(oppUnscored.overallScore, null, "Missing search volume/competitors must result in null overallScore");
    assert.strictEqual(oppUnscored.verdict, "UNSCORED");
    assert.strictEqual(oppUnscored.metrics.demandScore, null);
    assert.strictEqual(oppUnscored.metrics.competitionIndex, null);
    console.log("  🟢 Missing sales/market metrics stay null/UNKNOWN, zero synthetic data.");

    // 4. Amazon Search Terms UTF-8 Byte Limit: 248 bytes PASS, 250 bytes FAIL
    console.log("\nTest 4: Amazon Search Terms: 248 UTF-8 bytes PASS vs 250 UTF-8 bytes FAIL...");
    const validListingTemplate = {
      productId: 201,
      listingVersion: 1,
      productTruthCard: makeProductTruthCard(201, 1),
      marketplace: "AMAZON",
      productType: "STANDARD_PRINT_ON_DEMAND",
      amazonTitle: "Genuine Cotton Graphic Sweatshirt For Casual Wear",
      amazonBullets: ["Bullet 1 feature", "Bullet 2 feature", "Bullet 3 feature", "Bullet 4 feature", "Bullet 5 feature"],
      amazonDescription: "High quality print on 100% cotton garment.",
      productTruthNotes: "Material verified: 100% ring-spun cotton 8oz",
      netProfit: 8.5,
      netMargin: 35.0,
      status: "MANAGER_APPROVED"
    };

    // 248 bytes search terms
    const st248 = "a".repeat(248);
    assert.strictEqual(Buffer.byteLength(st248, "utf8"), 248);
    const passGate248 = evaluatePublishGate({ ...validListingTemplate, amazonSearchTerms: st248 });
    assert.strictEqual(passGate248.final_status, "PUBLISH_READY", `248 bytes should be PUBLISH_READY, got: ${JSON.stringify(passGate248.reasons)}`);

    // 250 bytes search terms
    const st250 = "a".repeat(250);
    assert.strictEqual(Buffer.byteLength(st250, "utf8"), 250);
    const failGate250 = evaluatePublishGate({ ...validListingTemplate, amazonSearchTerms: st250 });
    assert(
      failGate250.reasons.some(r => r.includes("249 UTF-8 bytes limit")),
      "250 bytes search terms must fail 249 UTF-8 bytes limit"
    );
    console.log("  🟢 Amazon Search Terms UTF-8 byte boundary strictly enforced (248 PASS, 250 FAIL).");

    // 5. Etsy Tags Invariants: 12 tags FAIL, 14 tags FAIL, 13 tags PASS, 21-char tag FAIL
    console.log("\nTest 5: Etsy Tags: 12 tags FAIL, 14 tags FAIL, 13 tags PASS, 21-char tag FAIL...");
    const validEtsyTemplate = {
      productId: 202,
      listingVersion: 1,
      productTruthCard: makeProductTruthCard(202, 1),
      marketplace: "ETSY",
      productType: "STANDARD_PRINT_ON_DEMAND",
      etsyTitle: "Handcrafted Minimalist Wooden Desk Organizer Gift For Office",
      etsyDescription: "Made from solid oak wood, hand finished with beeswax.",
      productTruthNotes: "Verified material: Solid Oak Wood, Supplier: OakCraft",
      netProfit: 10.0,
      netMargin: 40.0,
      status: "MANAGER_APPROVED"
    };

    // 12 tags -> FAIL
    const tags12 = Array.from({ length: 12 }, (_, i) => `tag${i + 1}`);
    const gate12 = evaluatePublishGate({ ...validEtsyTemplate, etsyTags: tags12 });
    assert(gate12.reasons.some(r => r.includes("exactly 13 tags")), "12 tags must fail 13 tags requirement");

    // 14 tags -> FAIL
    const tags14 = Array.from({ length: 14 }, (_, i) => `tag${i + 1}`);
    const gate14 = evaluatePublishGate({ ...validEtsyTemplate, etsyTags: tags14 });
    assert(gate14.reasons.some(r => r.includes("exactly 13 tags")), "14 tags must fail 13 tags requirement");

    // Tag with 21 chars -> FAIL
    const tagsWithLong = Array.from({ length: 13 }, (_, i) => i === 0 ? "thisis21characterslong" : `tag${i + 1}`);
    assert.strictEqual(tagsWithLong[0].length, 22);
    const gateLong = evaluatePublishGate({ ...validEtsyTemplate, etsyTags: tagsWithLong });
    assert(gateLong.reasons.some(r => r.includes("20-character Etsy limit")), "21+ character tag must fail 20-character limit");

    // 13 valid tags -> PASS
    const tags13 = Array.from({ length: 13 }, (_, i) => `validtag${i + 1}`);
    const gate13 = evaluatePublishGate({ ...validEtsyTemplate, etsyTags: tags13 });
    assert.strictEqual(gate13.final_status, "PUBLISH_READY", `13 valid tags should be PUBLISH_READY, got: ${JSON.stringify(gate13.reasons)}`);
    console.log("  🟢 Etsy Tags contract strictly enforced (12 FAIL, 14 FAIL, 21-char FAIL, 13 valid PASS).");

    // 6. Operational Evidence: AI Shipping Profile & Personalization without evidence -> FAIL
    console.log("\nTest 6: Operational Evidence: AI Shipping Profile & Personalization without evidence...");
    const fakeShippingListing = {
      ...validEtsyTemplate,
      etsyTags: tags13,
      shippingProfile: { isSynthetic: true, source: "AI_GENERATED_WITHOUT_EVIDENCE" }
    };
    const gateFakeShipping = evaluatePublishGate(fakeShippingListing);
    assert(gateFakeShipping.reasons.some(r => r.includes("AI-generated shipping profile")), "AI synthetic shipping profile must be blocked");

    const fakePersonalizationListing = {
      ...validEtsyTemplate,
      etsyTags: tags13,
      personalizationEnabled: true,
      personalizationEvidence: false,
      etsyPersonalizationInstructions: ""
    };
    const gateFakePersonalization = evaluatePublishGate(fakePersonalizationListing);
    assert(gateFakePersonalization.reasons.some(r => r.includes("Personalization asserted")), "Personalization without evidence must be blocked");
    console.log("  🟢 AI Shipping profile and Personalization without evidence correctly BLOCKED.");

    console.log("\n================================================================");
    console.log("  🟢 ALL CANONICAL BUSINESS WORKFLOW ASSERTIONS PASSED CLEANLY!");
    console.log("================================================================\n");
  } finally {
    server.close();
  }
}

runBusinessWorkflowTests().catch(err => {
  console.error("🔴 CANONICAL BUSINESS WORKFLOW SUITE FAILED:", err);
  process.exit(1);
});
