'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { canonicalJson, hashBytes } = require('../server/revisionStore');
const { migrateOperatorReportedSubmissionLifecycle } = require('../server/database/migrations');
const { requestCanonicalSubmission, authorizeCanonicalSubmission, exportCanonicalSubmission,
  reportCanonicalOperatorSubmission } = require('../server/canonicalReviewHandoffStore');

const db = new sqlite3.Database(':memory:');
const exec = sql => new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()));
const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params,
  (error, row) => error ? reject(error) : resolve(row || null)));
const seller = Object.freeze({ tenantId: 'tenant-a', workspaceId: 7, marketplace: 'ETSY', actorId: 21, role: 'SELLER' });
const owner = Object.freeze({ ...seller, actorId: 22, role: 'OWNER' });
const otherWorkspace = Object.freeze({ ...seller, workspaceId: 8 });
const key = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const hooks = Object.freeze({ assertDependenciesCurrent: async () => {}, assertApprovalEligible: async () => {} });
let passed = 0;
function check(value, message) { assert.ok(value, message); passed++; }

async function rejectsCode(operation, code) {
  await assert.rejects(operation, error => error?.code === code); passed++;
}

(async () => {
  await exec(`
    CREATE TABLE research_projects (id INTEGER PRIMARY KEY);
    CREATE TABLE listings (id INTEGER PRIMARY KEY,tenant_id TEXT,workspace_id INTEGER,marketplace TEXT,project_id INTEGER,
      status TEXT,head_revision_id INTEGER);
    CREATE TABLE listing_revisions (id INTEGER PRIMARY KEY,listing_id INTEGER,tenant_id TEXT,workspace_id INTEGER,
      marketplace TEXT,project_id INTEGER,revision_number INTEGER,content_json TEXT,content_hash TEXT,
      dependency_manifest_json TEXT,dependency_manifest_hash TEXT);
    CREATE TABLE canonical_listing_reviews (id INTEGER PRIMARY KEY,tenant_id TEXT,workspace_id INTEGER,marketplace TEXT,
      project_id INTEGER,listing_id INTEGER,listing_revision_id INTEGER,decision TEXT,content_hash TEXT,
      dependency_manifest_hash TEXT);
    CREATE TABLE canonical_submission_requests (id INTEGER PRIMARY KEY AUTOINCREMENT,tenant_id TEXT,workspace_id INTEGER,
      marketplace TEXT,project_id INTEGER,listing_id INTEGER,listing_revision_id INTEGER,review_id INTEGER,
      package_hash TEXT,notes TEXT,requested_by INTEGER,requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(listing_revision_id));
    CREATE TABLE canonical_submission_handoffs (id INTEGER PRIMARY KEY AUTOINCREMENT,listing_revision_id INTEGER);
    CREATE TABLE canonical_handoff_write_receipts (id INTEGER PRIMARY KEY AUTOINCREMENT,tenant_id TEXT,workspace_id INTEGER,
      marketplace TEXT,project_id INTEGER,listing_id INTEGER,operation TEXT,idempotency_key TEXT,request_hash TEXT,
      response_json TEXT,created_by INTEGER,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tenant_id,workspace_id,marketplace,operation,idempotency_key));
    INSERT INTO research_projects(id) VALUES (3),(4);
  `);
  await migrateOperatorReportedSubmissionLifecycle(db); await migrateOperatorReportedSubmissionLifecycle(db);
  const contentJson = canonicalJson({ etsyTitle: 'Custom Necklace for Daughter', etsyTags: ['daughter necklace'] });
  const dependencyJson = canonicalJson({ productTruthRevisionId: 5, productTruthHash: 'a'.repeat(64),
    intelligenceSnapshotId: 6 });
  const contentHash = hashBytes(contentJson); const dependencyHash = hashBytes(dependencyJson);
  await exec(`INSERT INTO listing_revisions VALUES
    (10,9,'tenant-a',7,'ETSY',3,1,'${contentJson.replaceAll("'", "''")}','${contentHash}',
     '${dependencyJson}','${dependencyHash}');
    INSERT INTO listings VALUES (9,'tenant-a',7,'ETSY',3,'MANAGER_APPROVED',10);
    INSERT INTO canonical_listing_reviews VALUES
    (11,'tenant-a',7,'ETSY',3,9,10,'APPROVED','${contentHash}','${dependencyHash}');`);

  const requested = await requestCanonicalSubmission(db, seller, 9, { notes: 'Ready for manual Etsy submission',
    idempotencyKey: key(1) }, hooks);
  check(requested.status === 'SUBMISSION_REQUESTED' && /^[0-9a-f]{64}$/.test(requested.packageHash),
    'Seller request binds the approved exact package');
  check((await requestCanonicalSubmission(db, seller, 9, { notes: 'Ready for manual Etsy submission',
    idempotencyKey: key(1) }, hooks)).submissionRequestId === requested.submissionRequestId,
  'Seller request is idempotent');
  await rejectsCode(() => authorizeCanonicalSubmission(db, seller, 9, { submissionRequestId: requested.submissionRequestId,
    notes: 'not owner', idempotencyKey: key(2) }, hooks), 'OWNER_SUBMISSION_AUTHORIZATION_REQUIRED');
  await rejectsCode(() => authorizeCanonicalSubmission(db, { ...owner, workspaceId: 8 }, 9,
    { submissionRequestId: requested.submissionRequestId, notes: 'wrong workspace', idempotencyKey: key(3) }, hooks),
  'LISTING_NOT_FOUND');

  const authorized = await authorizeCanonicalSubmission(db, owner, 9, { submissionRequestId: requested.submissionRequestId,
    notes: 'Owner authorizes only this package', idempotencyKey: key(4) }, hooks);
  check(authorized.status === 'SUBMISSION_AUTHORIZED' && authorized.packageHash === requested.packageHash
    && authorized.marketplacePublishingPerformed === false, 'Owner authorization does not claim marketplace publishing');
  await rejectsCode(() => exportCanonicalSubmission(db, owner, 9, { submissionAuthorizationId: authorized.submissionAuthorizationId,
    idempotencyKey: key(5) }, hooks), 'SELLER_OPERATOR_EXPORT_REQUIRED');

  const exported = await exportCanonicalSubmission(db, seller, 9, {
    submissionAuthorizationId: authorized.submissionAuthorizationId, idempotencyKey: key(6) }, hooks);
  check(exported.status === 'EXACT_EXPORT_READY' && hashBytes(exported.exportJson) === exported.exportHash,
    'Downloaded bytes have the declared exact export hash');
  check(JSON.parse(exported.exportJson).packageHash === requested.packageHash
    && JSON.parse(exported.exportJson).content.etsyTitle === 'Custom Necklace for Daughter',
  'Exact export contains the authorized content and package binding');
  const exportReplay = await exportCanonicalSubmission(db, seller, 9, {
    submissionAuthorizationId: authorized.submissionAuthorizationId, idempotencyKey: key(6) }, hooks);
  check(exportReplay.exportJson === exported.exportJson && exportReplay.exportHash === exported.exportHash,
    'exact-export replay hydrates verified bytes from export storage instead of duplicating them in the receipt');
  check(!JSON.parse((await get(`SELECT response_json FROM canonical_handoff_write_receipts
    WHERE operation='CANONICAL_EXACT_SUBMISSION_EXPORT'`)).response_json).exportJson,
  'idempotency receipt stores compact export metadata rather than duplicating near-limit listing bytes');
  await rejectsCode(() => reportCanonicalOperatorSubmission(db, seller, 9, {
    submissionAuthorizationId: authorized.submissionAuthorizationId, submissionExportId: exported.submissionExportId,
    manualSubmissionConfirmed: false, externalReference: 'ETSY-DRAFT-1', notes: 'not confirmed', idempotencyKey: key(7)
  }, hooks), 'MANUAL_SUBMISSION_CONFIRMATION_REQUIRED');
  await rejectsCode(() => reportCanonicalOperatorSubmission(db, owner, 9, {
    submissionAuthorizationId: authorized.submissionAuthorizationId, submissionExportId: exported.submissionExportId,
    manualSubmissionConfirmed: true, externalReference: 'ETSY-DRAFT-1', notes: 'wrong role', idempotencyKey: key(8)
  }, hooks), 'SELLER_OPERATOR_REPORT_REQUIRED');

  const reported = await reportCanonicalOperatorSubmission(db, seller, 9, {
    submissionAuthorizationId: authorized.submissionAuthorizationId, submissionExportId: exported.submissionExportId,
    manualSubmissionConfirmed: true, externalReference: 'ETSY-DRAFT-1', notes: 'Submitted manually in Etsy UI',
    idempotencyKey: key(9)
  }, hooks);
  check(reported.status === 'OPERATOR_REPORTED_SUBMITTED' && reported.marketplacePublishingPerformed === false
    && reported.marketplaceAcceptanceConfirmed === false, 'operator event explicitly disclaims marketplace acceptance/live');
  check((await get('SELECT status FROM listings WHERE id=9')).status === 'OPERATOR_REPORTED_SUBMITTED',
    'listing records the operator-reported terminal state without bare SUBMITTED');
  await assert.rejects(() => exec("UPDATE listings SET status='NEEDS_QA',head_revision_id=10 WHERE id=9"),
    /OPERATOR_REPORTED_SUBMITTED_TERMINAL/); passed++;
  check((await get('SELECT COUNT(*) AS n FROM canonical_submission_handoffs')).n === 0,
    'new lifecycle never writes the legacy submission handoff table');
  await assert.rejects(() => exec('UPDATE canonical_submission_authorizations SET notes="tampered" WHERE id=1'),
    /IMMUTABLE_CANONICAL_SUBMISSION_EVENT/); passed++;
  await assert.rejects(() => exec('DELETE FROM canonical_submission_exports WHERE id=1'),
    /IMMUTABLE_CANONICAL_SUBMISSION_EVENT/); passed++;
  check((await get('SELECT COUNT(*) AS n FROM canonical_operator_submission_reports')).n === 1,
    'one immutable operator report is persisted');
  check((await get(`SELECT COUNT(*) AS n FROM canonical_handoff_write_receipts
    WHERE operation IN ('CANONICAL_SUBMISSION_REQUEST','CANONICAL_SUBMISSION_AUTHORIZATION',
      'CANONICAL_EXACT_SUBMISSION_EXPORT','CANONICAL_OPERATOR_SUBMISSION_REPORT')`)).n === 4,
  'every successful lifecycle write has an immutable idempotency receipt');
  const contentTwo = canonicalJson({ etsyTitle: 'Personalized Pillow', etsyTags: ['custom pillow'] });
  const contentHashTwo = hashBytes(contentTwo);
  await exec(`INSERT INTO listing_revisions VALUES
    (20,19,'tenant-a',7,'ETSY',4,1,'${contentTwo}','${contentHashTwo}','${dependencyJson}','${dependencyHash}');
    INSERT INTO listings VALUES (19,'tenant-a',7,'ETSY',4,'MANAGER_APPROVED',20);
    INSERT INTO canonical_listing_reviews VALUES
    (21,'tenant-a',7,'ETSY',4,19,20,'APPROVED','${contentHashTwo}','${dependencyHash}');`);
  const secondListingRequest = await requestCanonicalSubmission(db, seller, 19, {
    notes: 'Ready for manual Etsy submission', idempotencyKey: key(1) }, hooks);
  check(secondListingRequest.listingId === 19,
    'the same idempotency UUID is independently valid for a different project/listing scope');
  await rejectsCode(() => requestCanonicalSubmission(db, { ...seller, actorId: 99 }, 19, {
    notes: 'Ready for manual Etsy submission', idempotencyKey: key(1) }, hooks), 'IDEMPOTENCY_KEY_ACTOR_MISMATCH');
  const contentThree = canonicalJson({ etsyTitle: 'Personalized Pillow Revised', etsyTags: ['custom pillow'] });
  const contentHashThree = hashBytes(contentThree);
  await exec(`INSERT INTO listing_revisions VALUES
    (22,19,'tenant-a',7,'ETSY',4,2,'${contentThree}','${contentHashThree}','${dependencyJson}','${dependencyHash}');
    UPDATE listings SET head_revision_id=22 WHERE id=19;
    INSERT INTO canonical_listing_reviews VALUES
    (23,'tenant-a',7,'ETSY',4,19,22,'APPROVED','${contentHashThree}','${dependencyHash}');`);
  await rejectsCode(() => requestCanonicalSubmission(db, seller, 19, {
    notes: 'Ready for manual Etsy submission', idempotencyKey: key(1) }, hooks), 'IDEMPOTENCY_KEY_REUSE');
  await rejectsCode(() => requestCanonicalSubmission(db, otherWorkspace, 9, { notes: 'cross-scope',
    idempotencyKey: key(10) }, hooks), 'LISTING_NOT_FOUND');
  const receiptIndexes = await new Promise((resolve, reject) => db.all('PRAGMA index_list(canonical_handoff_write_receipts)',
    (error, rows) => error ? reject(error) : resolve(rows)));
  check(receiptIndexes.some(index => index.unique === 1), 'migration installs a scoped unique idempotency index');
  const partialDb = new sqlite3.Database(':memory:');
  const partialExec = sql => new Promise((resolve, reject) => partialDb.exec(sql, error => error ? reject(error) : resolve()));
  await partialExec(`CREATE TABLE canonical_handoff_write_receipts
    (id INTEGER PRIMARY KEY,tenant_id TEXT,workspace_id INTEGER,marketplace TEXT,project_id INTEGER,listing_id INTEGER,
     operation TEXT,idempotency_key TEXT,request_hash TEXT,response_json TEXT,created_by INTEGER,created_at TEXT);
    CREATE TABLE canonical_submission_authorizations (id INTEGER PRIMARY KEY);`);
  await assert.rejects(() => migrateOperatorReportedSubmissionLifecycle(partialDb)); passed++;
  await new Promise(resolve => partialDb.close(resolve));
  console.log(`R4.3 W5 submission lifecycle: ${passed}/${passed} PASS`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.close());
