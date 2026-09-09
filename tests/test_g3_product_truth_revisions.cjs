const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();
const { runMigrations } = require('../server/database/migrations');
const { stateColumnSql } = require('../server/projectStateRegistry');
const {
  appendProductTruthRevision,
  confirmProductTruthRevision,
  currentProductTruthRevision,
  listProductTruthRevisions
} = require('../server/productTruthStore');

const open = file => new sqlite3.Database(file);
const exec = (db, sql) => new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()));
const run = (db, sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function done(error) {
  if (error) reject(error); else resolve({ lastID: this.lastID, changes: this.changes });
}));
const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null)));
const close = db => new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
const key = value => `10000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const scope = Object.freeze({ tenantId: 'tenant-a', workspaceId: 1, marketplace: 'AMAZON', actorId: 1, role: 'SELLER' });
const facts = material => ({
  productType: { disposition: 'ASSERTED', value: 'Custom necklace', basis: 'SUPPLIER_SPEC' },
  materials: material
    ? { disposition: 'ASSERTED', value: material, basis: 'SUPPLIER_SPEC' }
    : { disposition: 'UNKNOWN', reason: 'Awaiting supplier confirmation' },
  recipient: { disposition: 'ASSERTED', value: 'daughter', basis: 'OTHER', basisNote: 'Selected design' }
});

async function schema(db) {
  await exec(db, `
    PRAGMA foreign_keys=ON;
    CREATE TABLE workspaces(id INTEGER PRIMARY KEY,tenant_id TEXT,marketplace TEXT,name TEXT);
    CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT UNIQUE,password_hash TEXT,role TEXT,name TEXT);
    CREATE TABLE sessions(id INTEGER PRIMARY KEY,token_hash TEXT,user_id INTEGER,expires_at DATETIME);
    CREATE TABLE listings(id INTEGER PRIMARY KEY AUTOINCREMENT,amazonTitle TEXT,etsyTitle TEXT,categoryName TEXT,status TEXT,authorId INTEGER,payload TEXT);
    CREATE TABLE research_projects(
      id INTEGER PRIMARY KEY AUTOINCREMENT,tenant_id TEXT NOT NULL,workspace_id INTEGER NOT NULL,
      marketplace TEXT NOT NULL,name TEXT NOT NULL,seed_phrase TEXT NOT NULL,${stateColumnSql},
      actor_id INTEGER NOT NULL,updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await run(db, "INSERT INTO workspaces VALUES(1,'tenant-a','AMAZON','A'),(2,'tenant-b','AMAZON','B')");
  await run(db, "INSERT INTO users(id,email,name) VALUES(1,'seller@test','Seller')");
  await run(db, `INSERT INTO research_projects(id,tenant_id,workspace_id,marketplace,name,seed_phrase,actor_id)
    VALUES(1,'tenant-a',1,'AMAZON','Hija','hija',1),(2,'tenant-b',2,'AMAZON','Other','other',1)`);
  await runMigrations(db);
}

async function expectCode(promise, code) {
  await assert.rejects(promise, error => error?.code === code);
}

async function counts(db) {
  return {
    revisions: (await get(db, 'SELECT COUNT(*) AS n FROM product_truth_revisions')).n,
    receipts: (await get(db, 'SELECT COUNT(*) AS n FROM product_truth_write_receipts')).n
  };
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omniseller-g3-truth-'));
  const dbPath = path.join(dir, 'truth.sqlite');
  let db = open(dbPath);
  try {
    await schema(db);
    const v1Input = { expectedHeadRevisionId: null, idempotencyKey: key(1), changeReason: 'STAFF_DRAFT', facts: facts(null) };
    const v1 = await appendProductTruthRevision(db, scope, 1, v1Input);
    assert.equal(v1.confirmationState, 'STAFF_DRAFT');
    assert.deepEqual(await appendProductTruthRevision(db, scope, 1, v1Input), v1);
    assert.deepEqual(await counts(db), { revisions: 1, receipts: 1 });
    await expectCode(appendProductTruthRevision(db, scope, 1, { ...v1Input, facts: facts('silver'), idempotencyKey: key(1) }), 'IDEMPOTENCY_KEY_REUSE');

    const v2 = await appendProductTruthRevision(db, scope, 1, {
      expectedHeadRevisionId: v1.productTruthRevisionId, idempotencyKey: key(2),
      changeReason: 'SUPPLIER_MATERIAL_CONFIRMED', facts: facts('stainless steel, 14k gold plated')
    });
    assert.equal(v2.revisionNumber, 2);
    assert.equal((await currentProductTruthRevision(db, scope, 1)).id, v2.productTruthRevisionId);
    const history = await listProductTruthRevisions(db, scope, 1);
    assert.deepEqual(history.map(row => row.revision_number), [2, 1]);
    assert.equal(history[0].snapshot.asserted.materials.value, 'stainless steel, 14k gold plated');
    assert.equal(history[1].snapshot.unknown.materials.reason, 'Awaiting supplier confirmation');
    await expectCode(confirmProductTruthRevision(db, scope, 1, v2.productTruthRevisionId, {
      idempotencyKey: key(6), reason: 'Reviewed against supplier specification'
    }), 'FORBIDDEN_ROLE');
    const managerScope = { ...scope, role: 'MANAGER' };
    const confirmed = await confirmProductTruthRevision(db, managerScope, 1, v2.productTruthRevisionId, {
      idempotencyKey: key(6), reason: 'Reviewed against supplier specification'
    });
    assert.equal(confirmed.confirmationState, 'MANAGER_CONFIRMED');
    assert.deepEqual(await confirmProductTruthRevision(db, managerScope, 1, v2.productTruthRevisionId, {
      idempotencyKey: key(6), reason: 'Reviewed against supplier specification'
    }), confirmed);
    assert.equal((await currentProductTruthRevision(db, scope, 1)).confirmationState, 'MANAGER_CONFIRMED');

    const beforeFailure = await counts(db);
    await expectCode(appendProductTruthRevision(db, scope, 1, {
      expectedHeadRevisionId: v1.productTruthRevisionId, idempotencyKey: key(3), changeReason: 'STALE', facts: facts('18k gold')
    }), 'REVISION_CONFLICT');
    await expectCode(appendProductTruthRevision(db, { ...scope, tenantId: 'tenant-b', workspaceId: 2 }, 1, {
      expectedHeadRevisionId: null, idempotencyKey: key(4), changeReason: 'CROSS_SCOPE', facts: facts('18k gold')
    }), 'PROJECT_NOT_FOUND');
    await assert.rejects(appendProductTruthRevision(db, scope, 1, {
      expectedHeadRevisionId: v2.productTruthRevisionId, idempotencyKey: key(5), changeReason: 'ROLLBACK', facts: facts('18k gold')
    }, { afterRevision: () => { throw new Error('INJECT_TRUTH_ROLLBACK'); } }), /INJECT_TRUTH_ROLLBACK/);
    assert.deepEqual(await counts(db), beforeFailure);
    await assert.rejects(run(db, 'UPDATE product_truth_revisions SET change_reason=? WHERE id=?', ['tamper', v1.productTruthRevisionId]), /IMMUTABLE_PRODUCT_TRUTH/);
    await assert.rejects(run(db, 'DELETE FROM product_truth_write_receipts WHERE id=1'), /IMMUTABLE_PRODUCT_TRUTH/);

    const before = await listProductTruthRevisions(db, scope, 1);
    await close(db); db = open(dbPath); await exec(db, 'PRAGMA foreign_keys=ON');
    assert.deepEqual(await listProductTruthRevisions(db, scope, 1), before);
    console.log('G3 project Product Truth revisions: 16/16 PASS');
  } finally {
    if (db) await close(db).catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
