const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const sqlite3 = require('sqlite3').verbose();

const { runMigrations } = require('../server/database/migrations');
const { stateColumnSql } = require('../server/projectStateRegistry');
const {
  appendCreativeRevision: appendCreativeRevisionStore,
  appendListingRevision: appendListingRevisionStore,
  createListingWithRevision: createListingWithRevisionStore,
  getCreativeRevision,
  getListingRevision,
  hashBytes
} = require('../server/revisionStore');

const open = file => new sqlite3.Database(file);
const exec = (db, sql) => new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()));
const run = (db, sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function done(error) {
  if (error) reject(error); else resolve({ lastID: this.lastID, changes: this.changes });
}));
const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null)));
const all = (db, sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));
const close = db => new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
const id = value => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

const scope = Object.freeze({ tenantId: 'tenant-a', workspaceId: 1, marketplace: 'AMAZON', actorId: 1 });
const dependencies = Object.freeze({
  productTruthRevisionId: 7,
  productTruthHash: digest('truth-v7'),
  researchSnapshotId: 3,
  researchSnapshotHash: digest('research-v3'),
  intelligenceSnapshotId: 2,
  intelligenceSnapshotHash: digest('intelligence-v2'),
  policyBindingHash: digest('policy-v1'),
  claimIpBindingHash: digest('claims-ip-v1'),
  validatorHash: digest('validator-v1'),
  locale: 'en-US',
  productFamilyVersion: 'necklace-v1'
});
const authority = Object.freeze({ resolveDependencies: async ({ proposed }) => proposed });
const createListingWithRevision = (db, currentScope, input, hooks = {}) =>
  createListingWithRevisionStore(db, currentScope, input, { ...authority, ...hooks });
const appendListingRevision = (db, currentScope, listingId, input, hooks = {}) =>
  appendListingRevisionStore(db, currentScope, listingId, input, { ...authority, ...hooks });
const appendCreativeRevision = (db, currentScope, listingId, input, hooks = {}) =>
  appendCreativeRevisionStore(db, currentScope, listingId, input, { ...authority, ...hooks });

async function createSchema(db) {
  await exec(db, `
    PRAGMA foreign_keys=ON;
    CREATE TABLE workspaces (
      id INTEGER PRIMARY KEY, tenant_id TEXT NOT NULL, marketplace TEXT NOT NULL, name TEXT NOT NULL
    );
    CREATE TABLE users (
      id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT, role TEXT, name TEXT
    );
    CREATE TABLE sessions (
      id INTEGER PRIMARY KEY, token_hash TEXT, user_id INTEGER, expires_at DATETIME
    );
    CREATE TABLE listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amazonTitle TEXT, etsyTitle TEXT, categoryName TEXT, status TEXT, authorId INTEGER, payload TEXT
    );
    CREATE TABLE research_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL, workspace_id INTEGER NOT NULL,
      marketplace TEXT NOT NULL CHECK(marketplace IN ('AMAZON','ETSY')),
      name TEXT NOT NULL, seed_phrase TEXT NOT NULL,
      ${stateColumnSql}, reference_asin TEXT, batch_count INTEGER DEFAULT 0,
      actor_id INTEGER NOT NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await run(db, "INSERT INTO workspaces(id,tenant_id,marketplace,name) VALUES (1,'tenant-a','AMAZON','A'),(2,'tenant-b','AMAZON','B')");
  await run(db, "INSERT INTO users(id,email,name) VALUES (1,'seller@example.test','Seller')");
  await run(db, `INSERT INTO research_projects(id,tenant_id,workspace_id,marketplace,name,seed_phrase,actor_id)
    VALUES (1,'tenant-a',1,'AMAZON','Hija','para mi hija',1),
           (2,'tenant-b',2,'AMAZON','Other','other',1)`);
  await runMigrations(db);
}

async function expectCode(promise, code) {
  await assert.rejects(promise, error => error && error.code === code);
}

async function counts(db, listingId) {
  return {
    roots: (await get(db, 'SELECT COUNT(*) AS n FROM listings')).n,
    listingRevisions: (await get(db, 'SELECT COUNT(*) AS n FROM listing_revisions WHERE listing_id=?', [listingId])).n,
    creativeRevisions: (await get(db, 'SELECT COUNT(*) AS n FROM creative_revisions WHERE listing_id=?', [listingId])).n,
    receipts: (await get(db, 'SELECT COUNT(*) AS n FROM listing_write_receipts')).n
  };
}

async function legacyBackfillMatrix() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omniseller-g2-legacy-'));
  const dbPath = path.join(dir, 'legacy.sqlite');
  const db = open(dbPath);
  try {
    await exec(db, `
      PRAGMA foreign_keys=ON;
      CREATE TABLE workspaces (id INTEGER PRIMARY KEY, tenant_id TEXT NOT NULL, marketplace TEXT NOT NULL, name TEXT NOT NULL);
      CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT, role TEXT, name TEXT);
      CREATE TABLE sessions (id INTEGER PRIMARY KEY, token_hash TEXT, user_id INTEGER, expires_at DATETIME);
      CREATE TABLE research_projects (
        id INTEGER PRIMARY KEY, tenant_id TEXT NOT NULL, workspace_id INTEGER NOT NULL,
        marketplace TEXT NOT NULL, name TEXT NOT NULL, seed_phrase TEXT NOT NULL,
        ${stateColumnSql}, actor_id INTEGER NOT NULL
      );
      CREATE TABLE listings (
        id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT, workspace_id INTEGER, marketplace TEXT,
        project_id INTEGER, amazonTitle TEXT, etsyTitle TEXT, categoryName TEXT, status TEXT,
        authorId INTEGER, listing_version INTEGER DEFAULT 1, payload TEXT,
        generatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await run(db, "INSERT INTO workspaces VALUES (1,'tenant-a','AMAZON','A')");
    await run(db, "INSERT INTO users(id,email,name) VALUES (1,'seller@example.test','Seller')");
    await run(db, "INSERT INTO research_projects(id,tenant_id,workspace_id,marketplace,name,seed_phrase,actor_id) VALUES (1,'tenant-a',1,'AMAZON','Legacy','legacy',1)");
    const rawPayload = '{"z":1, "a":2}';
    const malformedPayload = '{broken legacy json';
    await run(db, `INSERT INTO listings(tenant_id,workspace_id,marketplace,project_id,authorId,listing_version,payload)
      VALUES ('tenant-a',1,'AMAZON',1,1,4,?),
             ('tenant-a',1,'AMAZON',1,1,2,?),
             (NULL,NULL,NULL,NULL,1,9,'unscoped')`, [rawPayload, malformedPayload]);
    await runMigrations(db);
    const migrated = await get(db, 'SELECT * FROM listing_revisions WHERE listing_id=1');
    assert.equal(migrated.content_json, rawPayload);
    assert.equal(migrated.content_hash, digest(rawPayload));
    assert.equal(migrated.revision_number, 4);
    assert.equal(migrated.migrated_from_legacy, 1);
    assert.equal(migrated.change_reason, 'LEGACY_SNAPSHOT_NO_HISTORY_INVENTED');
    assert.equal(JSON.parse(migrated.dependency_manifest_json).state, 'LEGACY_UNKNOWN');
    const malformedRow = await get(db, 'SELECT id FROM listing_revisions WHERE listing_id=2');
    const malformedRead = await getListingRevision(db, scope, 2, malformedRow.id, 1);
    assert.equal(malformedRead.content, null);
    assert.equal(malformedRead.contentRaw, malformedPayload);
    assert.equal(malformedRead.contentParseState, 'MALFORMED_LEGACY_JSON');
    assert.equal((await get(db, 'SELECT COUNT(*) AS n FROM listing_revisions WHERE listing_id=3')).n, 0);
    assert.equal((await get(db, 'SELECT head_revision_id FROM listings WHERE id=3')).head_revision_id, null);
  } finally {
    await close(db).catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  await legacyBackfillMatrix();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omniseller-g2-'));
  const dbPath = path.join(dir, 'revisions.sqlite');
  let db = open(dbPath);
  try {
    await createSchema(db);

    // Simulate an upgrade from a DB that already recorded G3 migration 011
    // before immutable validation accounting was introduced.
    assert.equal((await get(db, "SELECT COUNT(*) AS n FROM schema_migrations WHERE id='011_project_product_truth_revisions'")).n, 1);
    await run(db, "DELETE FROM schema_migrations WHERE id='012_listing_revision_validation_accounting'");
    await run(db, 'ALTER TABLE listing_revisions DROP COLUMN validation_accounting_hash');
    await run(db, 'ALTER TABLE listing_revisions DROP COLUMN validation_accounting_json');
    assert.deepEqual((await all(db, 'PRAGMA table_info(listing_revisions)')).filter(column => column.name.startsWith('validation_accounting_')), []);
    await runMigrations(db);
    assert.deepEqual((await all(db, 'PRAGMA table_info(listing_revisions)')).filter(column => column.name.startsWith('validation_accounting_'))
      .map(column => column.name), ['validation_accounting_json', 'validation_accounting_hash']);
    assert.equal((await get(db, "SELECT COUNT(*) AS n FROM schema_migrations WHERE id='012_listing_revision_validation_accounting'")).n, 1);
    await runMigrations(db);
    assert.equal((await get(db, "SELECT COUNT(*) AS n FROM schema_migrations WHERE id='012_listing_revision_validation_accounting'")).n, 1);

    await expectCode(createListingWithRevisionStore(db, scope, {
      projectId: 1, idempotencyKey: id(12), changeReason: 'NO_AUTHORITY_RESOLVER',
      content: { amazonTitle: 'Rejected' }, dependencies
    }), 'DEPENDENCY_RESOLVER_REQUIRED');
    assert.equal((await get(db, 'SELECT COUNT(*) AS n FROM listings')).n, 0);

    const v1Content = { amazonTitle: 'Para Mi Hija Necklace', bullets: ['A verified gift'], locale: 'en-US' };
    const created = await createListingWithRevision(db, scope, {
      projectId: 1, idempotencyKey: id(1), changeReason: 'INITIAL_DRAFT', content: v1Content, dependencies
    });
    assert.equal(created.revisionNumber, 1);
    assert.equal((await get(db, 'SELECT head_revision_id FROM listings WHERE id=?', [created.listingId])).head_revision_id, created.revisionId);
    const createdRow = await get(db, 'SELECT content_json,dependency_manifest_json FROM listing_revisions WHERE id=?', [created.revisionId]);
    assert.equal(createdRow.content_json,
      '{"amazonTitle":"Para Mi Hija Necklace","bullets":["A verified gift"],"locale":"en-US"}');
    assert.equal(JSON.parse(createdRow.dependency_manifest_json).bindingState, 'BOUND');
    assert.deepEqual(JSON.parse(createdRow.dependency_manifest_json).missingBindings, []);

    const replay = await createListingWithRevision(db, scope, {
      projectId: 1, idempotencyKey: id(1), changeReason: 'INITIAL_DRAFT', content: v1Content, dependencies
    });
    assert.deepEqual(replay, created);
    assert.deepEqual(await createListingWithRevisionStore(db, scope, {
      projectId: 1, idempotencyKey: id(1), changeReason: 'INITIAL_DRAFT', content: v1Content, dependencies
    }, { resolveDependencies: () => { throw new Error('MUTATED_AUTHORITY_MUST_NOT_RUN_ON_REPLAY'); } }), created);
    await expectCode(createListingWithRevision(db, { ...scope, actorId: 2 }, {
      projectId: 1, idempotencyKey: id(1), changeReason: 'INITIAL_DRAFT', content: v1Content, dependencies
    }), 'IDEMPOTENCY_KEY_ACTOR_MISMATCH');
    assert.deepEqual(await counts(db, created.listingId), { roots: 1, listingRevisions: 1, creativeRevisions: 0, receipts: 1 });

    await expectCode(createListingWithRevision(db, scope, {
      projectId: 1, idempotencyKey: id(1), changeReason: 'INITIAL_DRAFT', content: { amazonTitle: 'Changed' }, dependencies
    }), 'IDEMPOTENCY_KEY_REUSE');
    assert.deepEqual(await counts(db, created.listingId), { roots: 1, listingRevisions: 1, creativeRevisions: 0, receipts: 1 });
    await expectCode(createListingWithRevision(db, scope, {
      projectId: 1, idempotencyKey: id(10), changeReason: 'BAD_BINDING', content: v1Content,
      dependencies: { productTruthRevisionId: 7 }
    }), 'INCOMPLETE_DEPENDENCY_BINDING');
    await expectCode(createListingWithRevision(db, scope, {
      projectId: 1, idempotencyKey: id(11), changeReason: 'KEY_COLLISION',
      content: { '\u00e9': 1, 'e\u0301': 2 }, dependencies
    }), 'REVISION_CONTENT_KEY_COLLISION');

    const original = await get(db, 'SELECT content_json,content_hash,dependency_manifest_json,dependency_manifest_hash FROM listing_revisions WHERE id=?', [created.revisionId]);
    const v2Content = { amazonTitle: 'Para Mi Hija Custom Necklace', bullets: ['A verified custom gift'], locale: 'en-US' };
    const v2 = await appendListingRevision(db, scope, created.listingId, {
      projectId: 1, parentRevisionId: created.revisionId, expectedHeadRevisionId: created.revisionId,
      idempotencyKey: id(2), changeReason: 'SELLER_EDIT', content: v2Content, dependencies
    });
    assert.equal(v2.revisionNumber, 2);
    assert.deepEqual(await appendListingRevisionStore(db, scope, created.listingId, {
      projectId: 1, parentRevisionId: created.revisionId, expectedHeadRevisionId: created.revisionId,
      idempotencyKey: id(2), changeReason: 'SELLER_EDIT', content: v2Content, dependencies
    }, { resolveDependencies: () => { throw new Error('MUTATED_AUTHORITY_MUST_NOT_RUN_ON_REPLAY'); } }), v2);
    assert.deepEqual(await get(db, 'SELECT content_json,content_hash,dependency_manifest_json,dependency_manifest_hash FROM listing_revisions WHERE id=?', [created.revisionId]), original);

    const beforeStale = await counts(db, created.listingId);
    await expectCode(appendListingRevision(db, scope, created.listingId, {
      projectId: 1, parentRevisionId: created.revisionId, expectedHeadRevisionId: created.revisionId,
      idempotencyKey: id(3), changeReason: 'STALE_EDIT', content: { amazonTitle: 'Stale' }, dependencies
    }), 'REVISION_CONFLICT');
    assert.deepEqual(await counts(db, created.listingId), beforeStale);

    await expectCode(appendListingRevision(db, { ...scope, tenantId: 'tenant-b', workspaceId: 2 }, created.listingId, {
      projectId: 2, parentRevisionId: v2.revisionId, expectedHeadRevisionId: v2.revisionId,
      idempotencyKey: id(4), changeReason: 'CROSS_SCOPE', content: { amazonTitle: 'Leak' }, dependencies
    }), 'LISTING_NOT_FOUND');
    assert.deepEqual(await counts(db, created.listingId), beforeStale);

    await assert.rejects(run(db, 'UPDATE listing_revisions SET change_reason=? WHERE id=?', ['tampered', created.revisionId]), /IMMUTABLE_REVISION/);
    await assert.rejects(run(db, 'DELETE FROM listing_revisions WHERE id=?', [created.revisionId]), /IMMUTABLE_REVISION/);
    await assert.rejects(run(db, 'UPDATE listing_write_receipts SET response_json=? WHERE id=1', ['{}']), /IMMUTABLE_REVISION/);
    await assert.rejects(run(db, 'DELETE FROM listing_write_receipts WHERE id=1'), /IMMUTABLE_REVISION/);

    const db2 = open(dbPath);
    await exec(db, 'PRAGMA busy_timeout=5000');
    await exec(db2, 'PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON');
    const contenders = await Promise.allSettled([
      appendListingRevision(db, scope, created.listingId, {
        projectId: 1, parentRevisionId: v2.revisionId, expectedHeadRevisionId: v2.revisionId,
        idempotencyKey: id(8), changeReason: 'CONCURRENT_A', content: { amazonTitle: 'Concurrent A' }, dependencies
      }),
      appendListingRevision(db2, scope, created.listingId, {
        projectId: 1, parentRevisionId: v2.revisionId, expectedHeadRevisionId: v2.revisionId,
        idempotencyKey: id(9), changeReason: 'CONCURRENT_B', content: { amazonTitle: 'Concurrent B' }, dependencies
      })
    ]);
    await close(db2);
    assert.equal(contenders.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(contenders.filter(result => result.status === 'rejected' && result.reason?.code === 'REVISION_CONFLICT').length, 1);
    assert.equal((await get(db, 'SELECT COUNT(*) AS n FROM listing_revisions WHERE listing_id=?', [created.listingId])).n, 3);
    assert.equal((await get(db, `SELECT COUNT(*) AS n FROM listing_write_receipts
      WHERE operation='APPEND_LISTING_REVISION' AND idempotency_key IN (?,?)`, [id(8), id(9)])).n, 1);

    const currentHead = (await get(db, 'SELECT head_revision_id FROM listings WHERE id=?', [created.listingId])).head_revision_id;
    const sameHandleContenders = await Promise.allSettled([
      appendListingRevision(db, scope, created.listingId, {
        projectId: 1, parentRevisionId: currentHead, expectedHeadRevisionId: currentHead,
        idempotencyKey: id(13), changeReason: 'SAME_HANDLE_A', content: { amazonTitle: 'Same handle A' }, dependencies
      }),
      appendListingRevision(db, scope, created.listingId, {
        projectId: 1, parentRevisionId: currentHead, expectedHeadRevisionId: currentHead,
        idempotencyKey: id(14), changeReason: 'SAME_HANDLE_B', content: { amazonTitle: 'Same handle B' }, dependencies
      })
    ]);
    assert.equal(sameHandleContenders.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(sameHandleContenders.filter(result => result.status === 'rejected' && result.reason?.code === 'REVISION_CONFLICT').length, 1);

    const beforeRollback = await counts(db, created.listingId);
    await assert.rejects(createListingWithRevision(db, scope, {
      projectId: 1, idempotencyKey: id(5), changeReason: 'ROLLBACK_PROBE', content: { amazonTitle: 'Must Roll Back' }, dependencies
    }, { afterRoot: () => { throw new Error('INJECT_AFTER_ROOT'); } }), /INJECT_AFTER_ROOT/);
    assert.deepEqual(await counts(db, created.listingId), beforeRollback);

    const c1 = await appendCreativeRevision(db, scope, created.listingId, {
      projectId: 1, listingRevisionId: v2.revisionId, parentRevisionId: null, expectedHeadRevisionId: null,
      idempotencyKey: id(6), changeReason: 'IMAGE_PROMPTS_V1',
      content: { prompts: [{ type: 'MAIN', prompt: 'Verified product on pure white background' }] },
      dependencies: { productTruthRevisionId: 7, productTruthHash: dependencies.productTruthHash }
    });
    const c1Row = await get(db, 'SELECT * FROM creative_revisions WHERE id=?', [c1.creativeRevisionId]);
    const c1Deps = JSON.parse(c1Row.dependency_manifest_json);
    assert.equal(c1Deps.listingRevisionId, v2.revisionId);
    assert.equal(c1Deps.listingRevisionHash, v2.contentHash);
    assert.equal(c1Row.content_hash, hashBytes(c1Row.content_json));
    assert.equal(c1Deps.bindingState, 'INCOMPLETE');
    assert.ok(c1Deps.missingBindings.includes('policyBindingHash'));

    const c2 = await appendCreativeRevision(db, scope, created.listingId, {
      projectId: 1, listingRevisionId: v2.revisionId,
      parentRevisionId: c1.creativeRevisionId, expectedHeadRevisionId: c1.creativeRevisionId,
      idempotencyKey: id(7), changeReason: 'IMAGE_PROMPTS_V2',
      content: { prompts: [{ type: 'MAIN', prompt: 'Verified necklace centered on pure white background' }] },
      dependencies: { productTruthRevisionId: 7, productTruthHash: dependencies.productTruthHash }
    });
    assert.equal(c2.revisionNumber, 2);
    assert.deepEqual(await appendCreativeRevision(db, scope, created.listingId, {
      projectId: 1, listingRevisionId: v2.revisionId,
      parentRevisionId: c1.creativeRevisionId, expectedHeadRevisionId: c1.creativeRevisionId,
      idempotencyKey: id(7), changeReason: 'IMAGE_PROMPTS_V2',
      content: { prompts: [{ type: 'MAIN', prompt: 'Verified necklace centered on pure white background' }] },
      dependencies: { productTruthRevisionId: 7, productTruthHash: dependencies.productTruthHash }
    }), c2);
    assert.deepEqual(await appendCreativeRevisionStore(db, scope, created.listingId, {
      projectId: 1, listingRevisionId: v2.revisionId,
      parentRevisionId: c1.creativeRevisionId, expectedHeadRevisionId: c1.creativeRevisionId,
      idempotencyKey: id(7), changeReason: 'IMAGE_PROMPTS_V2',
      content: { prompts: [{ type: 'MAIN', prompt: 'Verified necklace centered on pure white background' }] },
      dependencies: { productTruthRevisionId: 7, productTruthHash: dependencies.productTruthHash }
    }, { resolveDependencies: () => { throw new Error('MUTATED_AUTHORITY_MUST_NOT_RUN_ON_REPLAY'); } }), c2);
    await expectCode(appendCreativeRevision(db, { ...scope, actorId: 2 }, created.listingId, {
      projectId: 1, listingRevisionId: v2.revisionId,
      parentRevisionId: c1.creativeRevisionId, expectedHeadRevisionId: c1.creativeRevisionId,
      idempotencyKey: id(7), changeReason: 'IMAGE_PROMPTS_V2',
      content: { prompts: [{ type: 'MAIN', prompt: 'Verified necklace centered on pure white background' }] },
      dependencies: { productTruthRevisionId: 7, productTruthHash: dependencies.productTruthHash }
    }), 'IDEMPOTENCY_KEY_ACTOR_MISMATCH');
    await expectCode(appendCreativeRevision(db, scope, created.listingId, {
      projectId: 1, listingRevisionId: v2.revisionId,
      parentRevisionId: c1.creativeRevisionId, expectedHeadRevisionId: c1.creativeRevisionId,
      idempotencyKey: id(7), changeReason: 'IMAGE_PROMPTS_V2', content: { prompts: [] },
      dependencies: { productTruthRevisionId: 7, productTruthHash: dependencies.productTruthHash }
    }), 'IDEMPOTENCY_KEY_REUSE');
    const creativeBeforeFailures = await counts(db, created.listingId);
    await expectCode(appendCreativeRevision(db, scope, created.listingId, {
      projectId: 1, listingRevisionId: v2.revisionId,
      parentRevisionId: c1.creativeRevisionId, expectedHeadRevisionId: c1.creativeRevisionId,
      idempotencyKey: id(15), changeReason: 'STALE_CREATIVE', content: { prompts: [] },
      dependencies: { productTruthRevisionId: 7, productTruthHash: dependencies.productTruthHash }
    }), 'REVISION_CONFLICT');
    await expectCode(appendCreativeRevision(db, { ...scope, tenantId: 'tenant-b', workspaceId: 2 }, created.listingId, {
      projectId: 2, listingRevisionId: v2.revisionId,
      parentRevisionId: c2.creativeRevisionId, expectedHeadRevisionId: c2.creativeRevisionId,
      idempotencyKey: id(16), changeReason: 'CROSS_SCOPE_CREATIVE', content: { prompts: [] },
      dependencies: { productTruthRevisionId: 7, productTruthHash: dependencies.productTruthHash }
    }), 'LISTING_NOT_FOUND');
    await assert.rejects(appendCreativeRevision(db, scope, created.listingId, {
      projectId: 1, listingRevisionId: v2.revisionId,
      parentRevisionId: c2.creativeRevisionId, expectedHeadRevisionId: c2.creativeRevisionId,
      idempotencyKey: id(17), changeReason: 'CREATIVE_ROLLBACK', content: { prompts: [{ type: 'MAIN', prompt: 'rollback' }] },
      dependencies: { productTruthRevisionId: 7, productTruthHash: dependencies.productTruthHash }
    }, { beforeCommit: () => { throw new Error('INJECT_CREATIVE_BEFORE_COMMIT'); } }), /INJECT_CREATIVE_BEFORE_COMMIT/);
    assert.deepEqual(await counts(db, created.listingId), creativeBeforeFailures);
    await expectCode(getCreativeRevision(db, { ...scope, tenantId: 'tenant-b', workspaceId: 2 },
      created.listingId, c2.creativeRevisionId, 2), 'REVISION_NOT_FOUND');
    await assert.rejects(run(db, 'UPDATE creative_revisions SET change_reason=? WHERE id=?', ['tampered', c1.creativeRevisionId]), /IMMUTABLE_REVISION/);

    const v1Read = await getListingRevision(db, scope, created.listingId, created.revisionId, 1);
    assert.deepEqual(v1Read.content, v1Content);
    const corrupt = await run(db, `INSERT INTO listing_revisions
      (listing_id,tenant_id,workspace_id,marketplace,project_id,revision_number,parent_revision_id,
       content_json,content_hash,dependency_manifest_json,dependency_manifest_hash,change_reason,created_by)
      VALUES (?,?,?,?,?,99,?,?,?,?,?,?,?)`, [created.listingId, scope.tenantId, scope.workspaceId,
      scope.marketplace, 1, v2.revisionId, '{"forged":true}', '0'.repeat(64), '{}', '0'.repeat(64), 'DIRECT_SCHEMA_PROBE', 1]);
    await expectCode(getListingRevision(db, scope, created.listingId, corrupt.lastID, 1), 'REVISION_INTEGRITY_FAILURE');
    const validHead = (await get(db, 'SELECT head_revision_id FROM listings WHERE id=?', [created.listingId])).head_revision_id;
    await run(db, 'UPDATE listings SET head_revision_id=? WHERE id=?', [corrupt.lastID, created.listingId]);
    await expectCode(appendListingRevision(db, scope, created.listingId, {
      projectId: 1, parentRevisionId: corrupt.lastID, expectedHeadRevisionId: corrupt.lastID,
      idempotencyKey: id(18), changeReason: 'CORRUPT_PARENT_PROBE', content: { amazonTitle: 'Rejected' }, dependencies
    }), 'REVISION_INTEGRITY_FAILURE');
    await run(db, 'UPDATE listings SET head_revision_id=? WHERE id=?', [validHead, created.listingId]);
    const snapshot = {
      heads: await get(db, 'SELECT head_revision_id,head_creative_revision_id FROM listings WHERE id=?', [created.listingId]),
      listing: await all(db, 'SELECT revision_number,parent_revision_id,content_json,content_hash,dependency_manifest_json,dependency_manifest_hash FROM listing_revisions WHERE listing_id=? ORDER BY revision_number', [created.listingId]),
      creative: await all(db, 'SELECT revision_number,parent_revision_id,listing_revision_id,content_json,content_hash,dependency_manifest_json,dependency_manifest_hash FROM creative_revisions WHERE listing_id=? ORDER BY revision_number', [created.listingId])
    };
    await close(db);
    db = open(dbPath);
    await exec(db, 'PRAGMA foreign_keys=ON');
    assert.deepEqual({
      heads: await get(db, 'SELECT head_revision_id,head_creative_revision_id FROM listings WHERE id=?', [created.listingId]),
      listing: await all(db, 'SELECT revision_number,parent_revision_id,content_json,content_hash,dependency_manifest_json,dependency_manifest_hash FROM listing_revisions WHERE listing_id=? ORDER BY revision_number', [created.listingId]),
      creative: await all(db, 'SELECT revision_number,parent_revision_id,listing_revision_id,content_json,content_hash,dependency_manifest_json,dependency_manifest_hash FROM creative_revisions WHERE listing_id=? ORDER BY revision_number', [created.listingId])
    }, snapshot);

    assert.deepEqual(await createListingWithRevision(db, scope, {
      projectId: 1, idempotencyKey: id(1), changeReason: 'INITIAL_DRAFT', content: v1Content, dependencies
    }), created);

    console.log('G2 immutable revisions: 45/45 PASS');
  } finally {
    if (db) await close(db).catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
