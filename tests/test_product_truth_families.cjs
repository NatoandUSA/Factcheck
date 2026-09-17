const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();
const { runMigrations } = require('../server/database/migrations');
const { stateColumnSql } = require('../server/projectStateRegistry');
const { appendProductTruthRevision } = require('../server/productTruthStore');
const { createProductTruthFamily, appendProductTruthFamilyRevision, listProductTruthFamilies } = require('../server/productTruthFamilyStore');

const open = file => new sqlite3.Database(file);
const exec = (db, sql) => new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()));
const run = (db, sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function done(error) {
  if (error) reject(error); else resolve({ lastID: this.lastID, changes: this.changes });
}));
const close = db => new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
const key = value => `20000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const scope = Object.freeze({ tenantId: 'tenant-a', workspaceId: 1, marketplace: 'AMAZON', actorId: 1, role: 'SELLER' });
const facts = (material = 'stainless steel', sku = 'SKU-1') => ({
  productType: { disposition: 'ASSERTED', value: 'Pendant necklace', basis: 'SUPPLIER_SPEC' },
  materials: { disposition: 'ASSERTED', value: material, basis: 'SUPPLIER_SPEC' },
  sku: { disposition: 'ASSERTED', value: sku, basis: 'OWN_LISTING_RECORD' },
  weight: { disposition: 'UNKNOWN', reason: 'Awaiting exact variant measurement' }
});

async function schema(db) {
  await exec(db, `PRAGMA foreign_keys=ON;
    CREATE TABLE workspaces(id INTEGER PRIMARY KEY,tenant_id TEXT,marketplace TEXT,name TEXT);
    CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT UNIQUE,password_hash TEXT,role TEXT,name TEXT);
    CREATE TABLE sessions(id INTEGER PRIMARY KEY,token_hash TEXT,user_id INTEGER,expires_at DATETIME);
    CREATE TABLE listings(id INTEGER PRIMARY KEY AUTOINCREMENT,amazonTitle TEXT,etsyTitle TEXT,categoryName TEXT,status TEXT,authorId INTEGER,payload TEXT);
    CREATE TABLE research_projects(id INTEGER PRIMARY KEY AUTOINCREMENT,tenant_id TEXT NOT NULL,workspace_id INTEGER NOT NULL,
      marketplace TEXT NOT NULL,name TEXT NOT NULL,seed_phrase TEXT NOT NULL,${stateColumnSql},actor_id INTEGER NOT NULL,updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);`);
  await run(db, "INSERT INTO workspaces VALUES(1,'tenant-a','AMAZON','A'),(2,'tenant-b','AMAZON','B')");
  await run(db, "INSERT INTO users(id,email,name) VALUES(1,'seller@test','Seller')");
  await run(db, `INSERT INTO research_projects(id,tenant_id,workspace_id,marketplace,name,seed_phrase,actor_id)
    VALUES(1,'tenant-a',1,'AMAZON','SKU 1','necklace',1)`);
  await runMigrations(db);
}

async function expectCode(promise, code) { await assert.rejects(promise, error => error?.code === code); }

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omniseller-family-truth-'));
  const db = open(path.join(dir, 'family.sqlite'));
  try {
    await schema(db);
    const created = await createProductTruthFamily(db, scope, { name: ' Hija Necklace  ', idempotencyKey: key(1),
      changeReason: 'CREATE_FAMILY', facts: facts(), notes: 'Shared supplier facts' });
    assert.equal(created.revisionNumber, 1);
    assert.equal(created.displayName, 'Hija Necklace');
    assert.deepEqual(await createProductTruthFamily(db, scope, { name: ' Hija Necklace  ', idempotencyKey: key(1),
      changeReason: 'CREATE_FAMILY', facts: facts(), notes: 'Shared supplier facts' }), created);
    await expectCode(createProductTruthFamily(db, scope, { name: 'hija necklace', idempotencyKey: key(2),
      changeReason: 'DUPLICATE', facts: facts() }), 'PRODUCT_TRUTH_FAMILY_NAME_CONFLICT');
    assert.equal((await listProductTruthFamilies(db, scope)).length, 1);
    assert.equal((await listProductTruthFamilies(db, { ...scope, workspaceId: 2 })).length, 0);

    const updated = await appendProductTruthFamilyRevision(db, scope, created.familyId, {
      expectedHeadRevisionId: created.familyRevisionId, idempotencyKey: key(3), changeReason: 'SUPPLIER_UPDATE',
      facts: facts('stainless steel, 14k gold plated'), notes: 'Supplier spec 2026-09'
    });
    assert.equal(updated.revisionNumber, 2);
    const family = (await listProductTruthFamilies(db, scope))[0];
    assert.equal(family.headRevisionId, updated.familyRevisionId);
    assert.equal(family.snapshot.asserted.materials.value, 'stainless steel, 14k gold plated');
    assert.equal(family.snapshot.asserted.sku, undefined, 'SKU must remain project-only and never become inherited family truth');
    await expectCode(appendProductTruthFamilyRevision(db, scope, created.familyId, {
      expectedHeadRevisionId: created.familyRevisionId, idempotencyKey: key(4), changeReason: 'STALE', facts: facts()
    }), 'REVISION_CONFLICT');

    const projectRevision = await appendProductTruthRevision(db, scope, 1, { expectedHeadRevisionId: null,
      familyRevisionId: updated.familyRevisionId, idempotencyKey: key(5), changeReason: 'APPLY_FAMILY',
      facts: facts('stainless steel, 14k gold plated', 'SKU-CHILD'), notes: 'Exact child SKU' });
    const row = await new Promise((resolve, reject) => db.get('SELECT snapshot_json FROM product_truth_revisions WHERE id=?',
      [projectRevision.productTruthRevisionId], (error, value) => error ? reject(error) : resolve(value)));
    const snapshot = JSON.parse(row.snapshot_json);
    assert.equal(snapshot.inheritance.familyId, created.familyId);
    assert.equal(snapshot.inheritance.familyRevisionId, updated.familyRevisionId);
    assert(snapshot.inheritance.inheritedFactKeys.includes('materials'));
    assert(snapshot.inheritance.projectOnlyFactKeys.includes('sku'));
    assert(!snapshot.inheritance.inheritedFactKeys.includes('sku'));
    assert.equal(snapshot.asserted.sku.value, 'SKU-CHILD');
    await expectCode(appendProductTruthRevision(db, { ...scope, workspaceId: 2 }, 1, { expectedHeadRevisionId: null,
      familyRevisionId: updated.familyRevisionId, idempotencyKey: key(6), changeReason: 'CROSS_SCOPE', facts: facts()
    }), 'PRODUCT_TRUTH_FAMILY_REVISION_NOT_FOUND');
    await assert.rejects(run(db, 'UPDATE product_truth_family_revisions SET change_reason=? WHERE id=?', ['tamper', updated.familyRevisionId]), /IMMUTABLE_PRODUCT_TRUTH_FAMILY/);
    await assert.rejects(run(db, 'DELETE FROM product_truth_families WHERE id=?', [created.familyId]), /IMMUTABLE_PRODUCT_TRUTH_FAMILY/);
    console.log('Product Truth family profiles: 20/20 PASS');
  } finally { await close(db).catch(() => {}); fs.rmSync(dir, { recursive: true, force: true }); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
