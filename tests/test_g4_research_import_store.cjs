'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const sqlite3 = require('sqlite3').verbose();
const { runMigrations } = require('../server/database/migrations');
const { stateColumnSql } = require('../server/projectStateRegistry');
const { appendIntelligenceSnapshot, appendResearchImport, appendResearchSnapshot,
  getResearchImport, snapshotJson } = require('../server/commerceSnapshotStore');
const { appendProductTruthRevision } = require('../server/productTruthStore');

const open = file => new sqlite3.Database(file);
const exec = (db, sql) => new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()));
const run = (db, sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function done(error) {
  if (error) reject(error); else resolve({ lastID: this.lastID, changes: this.changes });
}));
const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params,
  (error, row) => error ? reject(error) : resolve(row || null)));
const close = db => new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const key = value => `30000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const scope = Object.freeze({ tenantId: 'tenant-a', workspaceId: 1, marketplace: 'AMAZON', actorId: 1 });

async function schema(db) {
  await exec(db, `PRAGMA foreign_keys=ON;
    CREATE TABLE workspaces(id INTEGER PRIMARY KEY,tenant_id TEXT,marketplace TEXT,name TEXT);
    CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT,role TEXT,name TEXT);
    CREATE TABLE sessions(id INTEGER PRIMARY KEY,token_hash TEXT,user_id INTEGER,expires_at DATETIME);
    CREATE TABLE listings(id INTEGER PRIMARY KEY,amazonTitle TEXT,etsyTitle TEXT,categoryName TEXT,status TEXT,authorId INTEGER,payload TEXT);
    CREATE TABLE research_projects(id INTEGER PRIMARY KEY,tenant_id TEXT,workspace_id INTEGER,marketplace TEXT,
      name TEXT,seed_phrase TEXT,${stateColumnSql},actor_id INTEGER,updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);`);
  await run(db, "INSERT INTO workspaces VALUES(1,'tenant-a','AMAZON','A'),(2,'tenant-b','AMAZON','B')");
  await run(db, "INSERT INTO users VALUES(1,'a@test','SELLER','A')");
  await run(db, `INSERT INTO research_projects(id,tenant_id,workspace_id,marketplace,name,seed_phrase,actor_id)
    VALUES(1,'tenant-a',1,'AMAZON','Hija','hija',1),(2,'tenant-b',2,'AMAZON','Other','other',1)`);
  await runMigrations(db);
}

async function expectCode(promise, code) { await assert.rejects(promise, error => error?.code === code); }

async function main() {
  const withProtoKey = { sourceFields: Object.fromEntries([['Keyword', 'gift'], ['__proto__', 'EVIDENCE']]) };
  const withoutProtoKey = { sourceFields: { Keyword: 'gift' } };
  assert.notEqual(snapshotJson(withProtoKey), snapshotJson(withoutProtoKey));
  assert.match(snapshotJson(withProtoKey), /"__proto__":"EVIDENCE"/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-g4-import-'));
  const file = path.join(dir, 'db.sqlite'); let db = open(file);
  try {
    await schema(db);
    const input = { idempotencyKey: key(1), kind: 'AMAZON_CEREBRO', fileName: 'Cerebro.xlsx',
      mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      rawBytes: Buffer.from('exact raw workbook bytes'), selectedSheet: 'Cerebro',
      headerSignature: ['Keyword Phrase','Search Volume','Position (Rank)'],
      parserId: 'h10-object-row-v1', parserHash: digest('parser-v1') };
    const first = await appendResearchImport(db, scope, 1, input);
    assert.equal(first.duplicate, false);
    assert.equal(first.rawHash, digest(input.rawBytes));
    assert.deepEqual(await appendResearchImport(db, scope, 1, input), first);
    await expectCode(appendResearchImport(db, { ...scope, actorId: 2 }, 1, input), 'IDEMPOTENCY_KEY_ACTOR_MISMATCH');
    const second = await appendResearchImport(db, scope, 1, { ...input, idempotencyKey: key(2) });
    assert.equal(second.researchImportId, first.researchImportId);
    assert.equal(second.duplicate, true);
    assert.equal((await get(db, 'SELECT COUNT(*) AS n FROM research_imports')).n, 1);
    assert.equal((await get(db, 'SELECT COUNT(*) AS n FROM commerce_write_receipts')).n, 2);
    const metadata = await getResearchImport(db, scope, 1, first.researchImportId);
    assert.equal(metadata.byte_length, input.rawBytes.length);
    assert.deepEqual(metadata.headerSignature, input.headerSignature);
    const raw = await getResearchImport(db, scope, 1, first.researchImportId, { includeRaw: true });
    assert.deepEqual(Buffer.from(raw.raw_bytes), input.rawBytes);
    let adapterCalls = 0;
    const adapter = { buildSnapshot: async imports => {
      adapterCalls++;
      return { observations: imports.map(item => ({ importId: item.id, byteLength: item.raw_bytes.length })),
        accounting: { imports: imports.length, rows: 1, accepted: 1, rejected: 0 },
        adapterBindingHash: digest('research-adapter-v1') };
    } };
    const snapshotInput = { expectedHeadResearchSnapshotId: null, importIds: [first.researchImportId],
      idempotencyKey: key(4), changeReason: 'INITIAL_RESEARCH_SNAPSHOT' };
    const snapshotV1 = await appendResearchSnapshot(db, scope, 1, snapshotInput, adapter);
    assert.equal(snapshotV1.revisionNumber, 1);
    assert.deepEqual(await appendResearchSnapshot(db, scope, 1, snapshotInput,
      { buildSnapshot: () => { throw new Error('ADAPTER_MUST_NOT_RUN_ON_REPLAY'); } }), snapshotV1);
    assert.equal(adapterCalls, 1);
    await expectCode(appendResearchSnapshot(db, { ...scope, actorId: 2 }, 1, snapshotInput, adapter),
      'IDEMPOTENCY_KEY_ACTOR_MISMATCH');
    const snapshotV2 = await appendResearchSnapshot(db, scope, 1, {
      expectedHeadResearchSnapshotId: snapshotV1.researchSnapshotId, importIds: [first.researchImportId],
      idempotencyKey: key(5), changeReason: 'REBUILD_WITH_SAME_IMPORT'
    }, adapter);
    assert.equal(snapshotV2.revisionNumber, 2);
    assert.deepEqual(await appendResearchSnapshot(db, scope, 1, snapshotInput,
      { buildSnapshot: () => { throw new Error('OLD_REPLAY_MUST_PRECEDE_HEAD_CHECK'); } }), snapshotV1);
    await expectCode(appendResearchSnapshot(db, scope, 1, { ...snapshotInput, idempotencyKey: key(6) }, adapter),
      'RESEARCH_SNAPSHOT_CONFLICT');
    const persistedSnapshot = await get(db, 'SELECT * FROM research_snapshots WHERE id=?', [snapshotV1.researchSnapshotId]);
    assert.equal(digest(persistedSnapshot.observations_json), persistedSnapshot.observations_hash);
    assert.equal(digest(persistedSnapshot.accounting_json), persistedSnapshot.accounting_hash);
    assert.equal(persistedSnapshot.snapshot_hash, snapshotV1.researchSnapshotHash);
    assert.equal((await get(db, 'SELECT head_research_snapshot_id AS id FROM research_projects WHERE id=1')).id,
      snapshotV2.researchSnapshotId);
    const truth = await appendProductTruthRevision(db, { ...scope, role: 'SELLER' }, 1, {
      expectedHeadRevisionId: null, idempotencyKey: key(7), changeReason: 'STAFF_TRUTH', facts: {
        productType: { disposition: 'ASSERTED', value: 'Custom Necklace', basis: 'SUPPLIER_SPEC' },
        materials: { disposition: 'ASSERTED', value: 'stainless steel', basis: 'SUPPLIER_SPEC' }
      }
    });
    let engineCalls = 0;
    const engine = { buildIntelligence: async ({ research, productTruth, configuration }) => {
      engineCalls++;
      assert.equal(research.id, snapshotV2.researchSnapshotId);
      assert.equal(productTruth.id, truth.productTruthRevisionId);
      return { output: { classification: 'NON_AUTHORITATIVE_DRAFT_CANDIDATE', ranked: research.observations },
        accounting: { ...research.accounting, configuration }, engineBindingHash: digest('engine-v1') };
    } };
    const intelligenceInput = { expectedHeadIntelligenceSnapshotId: null,
      researchSnapshotId: snapshotV2.researchSnapshotId, productTruthRevisionId: truth.productTruthRevisionId,
      configuration: { minSearchVolume: 0 }, idempotencyKey: key(8), changeReason: 'AMAZON_INTELLIGENCE_V1' };
    const intelligence = await appendIntelligenceSnapshot(db, scope, 1, intelligenceInput, engine);
    assert.equal(intelligence.revisionNumber, 1);
    assert.deepEqual(await appendIntelligenceSnapshot(db, scope, 1, intelligenceInput,
      { buildIntelligence: () => { throw new Error('ENGINE_MUST_NOT_RUN_ON_REPLAY'); } }), intelligence);
    assert.equal(engineCalls, 1);
    await expectCode(appendIntelligenceSnapshot(db, { ...scope, actorId: 2 }, 1, intelligenceInput, engine),
      'IDEMPOTENCY_KEY_ACTOR_MISMATCH');
    const persistedIntelligence = await get(db, 'SELECT * FROM intelligence_snapshots WHERE id=?',
      [intelligence.intelligenceSnapshotId]);
    assert.equal(persistedIntelligence.snapshot_hash, intelligence.intelligenceSnapshotHash);
    assert.equal(digest(persistedIntelligence.output_json), persistedIntelligence.output_hash);
    assert.equal((await get(db, 'SELECT head_intelligence_snapshot_id AS id FROM research_projects WHERE id=1')).id,
      intelligence.intelligenceSnapshotId);
    await assert.rejects(run(db, 'UPDATE intelligence_snapshots SET change_reason=? WHERE id=?',
      ['tamper', intelligence.intelligenceSnapshotId]), /IMMUTABLE_COMMERCE_SNAPSHOT/);
    await assert.rejects(run(db, 'DELETE FROM research_snapshots WHERE id=?', [snapshotV1.researchSnapshotId]),
      /IMMUTABLE_COMMERCE_SNAPSHOT/);
    await expectCode(getResearchImport(db, { ...scope, tenantId: 'tenant-b', workspaceId: 2 }, 1,
      first.researchImportId), 'RESEARCH_IMPORT_NOT_FOUND');
    await assert.rejects(run(db, 'UPDATE research_imports SET file_name=? WHERE id=?', ['changed', first.researchImportId]),
      /IMMUTABLE_COMMERCE_SNAPSHOT/);
    const before = { imports: (await get(db, 'SELECT COUNT(*) AS n FROM research_imports')).n,
      receipts: (await get(db, 'SELECT COUNT(*) AS n FROM commerce_write_receipts')).n };
    await assert.rejects(appendResearchImport(db, scope, 1, { ...input, idempotencyKey: key(3),
      rawBytes: Buffer.from('rollback bytes') }, { beforeCommit: () => { throw new Error('ROLLBACK_IMPORT'); } }), /ROLLBACK_IMPORT/);
    assert.deepEqual({ imports: (await get(db, 'SELECT COUNT(*) AS n FROM research_imports')).n,
      receipts: (await get(db, 'SELECT COUNT(*) AS n FROM commerce_write_receipts')).n }, before);
    await close(db); db = open(file); await exec(db, 'PRAGMA foreign_keys=ON');
    assert.deepEqual(Buffer.from((await getResearchImport(db, scope, 1, first.researchImportId, { includeRaw: true })).raw_bytes), input.rawBytes);
    console.log('G4 immutable commerce snapshot chain: 42/42 PASS');
  } finally {
    if (db) await close(db).catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
