'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { migrateOwnerSubmissionAuthorization } = require('../server/database/migrations');

const db = new sqlite3.Database(':memory:');
const exec = sql => new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()));
const all = sql => new Promise((resolve, reject) => db.all(sql, (error, rows) => error ? reject(error) : resolve(rows)));

(async () => {
  await exec(`CREATE TABLE canonical_submission_handoffs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, workspace_id INTEGER NOT NULL,
    marketplace TEXT NOT NULL, project_id INTEGER NOT NULL, listing_id INTEGER NOT NULL,
    listing_revision_id INTEGER NOT NULL, review_id INTEGER NOT NULL, external_reference TEXT,
    notes TEXT NOT NULL, submitted_by INTEGER NOT NULL, submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(listing_revision_id));`);
  await migrateOwnerSubmissionAuthorization(db);
  await migrateOwnerSubmissionAuthorization(db);
  const columns = await all('PRAGMA table_info(canonical_submission_handoffs)');
  assert.ok(columns.some(column => column.name === 'submission_request_id'), 'upgrade adds request binding column');
  await assert.rejects(() => exec(`INSERT INTO canonical_submission_handoffs
    (tenant_id,workspace_id,marketplace,project_id,listing_id,listing_revision_id,review_id,external_reference,notes,submitted_by)
    VALUES ('t',1,'AMAZON',1,1,1,1,'ref','note',1)`), /SUBMISSION_REQUEST_REQUIRED/);
  await exec(`INSERT INTO canonical_submission_handoffs
    (tenant_id,workspace_id,marketplace,project_id,listing_id,listing_revision_id,review_id,submission_request_id,
     external_reference,notes,submitted_by)
    VALUES ('t',1,'AMAZON',1,1,1,1,1,'ref','note',1)`);
  assert.equal((await all('SELECT id FROM canonical_submission_handoffs')).length, 1,
    'upgrade accepts a new handoff only when request binding is present');
  const triggers = await all("SELECT name FROM sqlite_master WHERE type='trigger'");
  assert.ok(triggers.some(row => row.name === 'canonical_submission_handoffs_request_required_insert'));
  console.log('G4 014->015 submission migration upgrade: 4/4 PASS');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.close());
