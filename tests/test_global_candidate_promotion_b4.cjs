process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const sqlite3 = require('sqlite3').verbose();
const { migrateGlobalCandidatePoolMvp, migrateGlobalCandidatePromotion } = require('../server/database/migrations');
const { ingestCandidateProjections, listGlobalCandidates } = require('../server/globalCandidatePool');
const { promoteGlobalCandidateToProject } = require('../server/globalCandidatePromotion');

const run = (db, sql, params = []) => new Promise((resolve, reject) =>
  db.run(sql, params, function done(error) { error ? reject(error) : resolve({ changes: this.changes, lastID: this.lastID }); }));
const get = (db, sql, params = []) => new Promise((resolve, reject) =>
  db.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null)));
const all = (db, sql, params = []) => new Promise((resolve, reject) =>
  db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));
const close = db => new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const researchOnlyField = value => ({ value, state: 'OBSERVED', source: 'ETSY_SEARCH_CSV',
  authority: 'NONE', allowedUse: 'RESEARCH_ONLY', raw: String(value) });

function observedProjection(phrase, sold24h, suffix) {
  return {
    phrase, sourceFamily: 'ETSY_PUBLIC_SEARCH', authorityClassification: 'OBSERVED_PUBLIC',
    evidenceTier: 'E1_OBSERVED_PUBLIC', sourceArtifactType: 'RESEARCH_FILE',
    sourceArtifactId: 'etsy-' + suffix, sourceArtifactHash: sha('etsy-' + suffix),
    provenance: { parser: 'canonical-etsy' },
    commercialEvidence: { listingCount: 5, listings: [{ listingId: 'L-' + suffix, sold24h,
      totalSold: sold24h * 10, revenue: sold24h * 100, reviewCount: sold24h,
      fieldProvenance: { sold24h: researchOnlyField(sold24h), totalSold: researchOnlyField(sold24h * 10),
        revenue: researchOnlyField(sold24h * 100), reviewCount: researchOnlyField(sold24h) } }] },
    socialEvidence: {}, rawEvidence: { phrase, sold24h }
  };
}

function socialProjection(phrase, suffix) {
  return {
    phrase, sourceFamily: 'SOCIAL_LISTENING', authorityClassification: 'RESEARCH_ONLY',
    evidenceTier: 'RESEARCH_ONLY', sourceArtifactType: 'SOCIAL_HANDOFF_V3',
    sourceArtifactId: 'social-' + suffix, sourceArtifactHash: sha('social-' + suffix),
    provenance: { artifactIssuedAt: '2026-09-22T00:00:00.000Z' },
    commercialEvidence: {}, socialEvidence: { momentum: 'rising' }, rawEvidence: { phrase }
  };
}

function modeledProjection(phrase, suffix) {
  return {
    phrase, sourceFamily: 'AMAZON_CEREBRO', authorityClassification: 'MODELED_THIRD_PARTY',
    evidenceTier: 'E2_MODELED_THIRD_PARTY', sourceArtifactType: 'RESEARCH_FILE',
    sourceArtifactId: 'modeled-' + suffix, sourceArtifactHash: sha('modeled-' + suffix),
    provenance: { parser: 'canonical-amazon' },
    commercialEvidence: { searchVolume: 5000, competingProducts: 250, modeled: true },
    socialEvidence: {}, rawEvidence: { phrase }
  };
}

(async () => {
  const db = new sqlite3.Database(':memory:');
  try {
    await run(db, 'PRAGMA foreign_keys=ON');
    await run(db, 'CREATE TABLE users(id INTEGER PRIMARY KEY)');
    await run(db, `CREATE TABLE workspaces(
      id INTEGER PRIMARY KEY, tenant_id TEXT NOT NULL, marketplace TEXT NOT NULL,
      seller_account_label TEXT, site TEXT)`);
    await run(db, `CREATE TABLE research_projects(
      id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, workspace_id INTEGER NOT NULL,
      marketplace TEXT NOT NULL, name TEXT NOT NULL, seed_phrase TEXT NOT NULL, state TEXT NOT NULL,
      reference_asin TEXT, actor_id INTEGER NOT NULL)`);
    await run(db, `CREATE TABLE research_evidence(
      id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, workspace_id INTEGER NOT NULL,
      marketplace TEXT NOT NULL, project_id INTEGER, seed_phrase TEXT NOT NULL, source TEXT NOT NULL,
      actor_id INTEGER NOT NULL, evidence_state TEXT, metadata TEXT)`);
    await run(db, 'CREATE TABLE product_truth_revisions(id INTEGER PRIMARY KEY, marker TEXT)');
    await run(db, 'CREATE TABLE listings(id INTEGER PRIMARY KEY, marker TEXT)');
    await run(db, 'INSERT INTO users(id) VALUES (1)');
    await run(db, "INSERT INTO workspaces(id,tenant_id,marketplace) VALUES (7,'tenant-a','ETSY'),(8,'tenant-a','ETSY')");
    await run(db, `INSERT INTO research_projects
      (tenant_id,workspace_id,marketplace,name,seed_phrase,state,actor_id)
      VALUES ('tenant-a',7,'ETSY','Existing Project','existing seed','EVIDENCE_INTAKE',1)`);
    await run(db, "INSERT INTO product_truth_revisions VALUES(1,'truth-safe')");
    await run(db, "INSERT INTO listings VALUES(1,'listing-safe')");
    const protectedBefore = {
      existingProject: await get(db, 'SELECT * FROM research_projects WHERE id=1'),
      truth: await all(db, 'SELECT * FROM product_truth_revisions'),
      listings: await all(db, 'SELECT * FROM listings')
    };

    await migrateGlobalCandidatePoolMvp(db);
    await migrateGlobalCandidatePromotion(db);
    await migrateGlobalCandidatePromotion(db);

    const scope = { tenantId: 'tenant-a', workspaceId: 7, marketplace: 'ETSY', actorId: 1 };
    await ingestCandidateProjections(db, scope, [
      observedProjection('candidate alpha', 3, 'alpha'),
      socialProjection('candidate alpha', 'alpha'),
      modeledProjection('candidate beta', 'beta'),
      observedProjection('candidate beta', 0, 'beta'),
      socialProjection('candidate beta', 'beta')
    ]);
    const candidates = await listGlobalCandidates(db, scope, { limit: 20 });
    const alpha = candidates.find(item => item.normalizedPhrase === 'candidate alpha');
    const beta = candidates.find(item => item.normalizedPhrase === 'candidate beta');
    assert.ok(alpha && beta);

    const promoted = await promoteGlobalCandidateToProject(db, scope, {
      candidateId: alpha.id, projectName: 'Candidate Alpha Pilot', idempotencyKey: 'alpha-promote-001'
    }, new Date('2026-09-22T01:00:00.000Z'));
    assert.equal(promoted.replay, false);
    assert.equal(promoted.createdState, 'EVIDENCE_INTAKE');
    assert.equal(promoted.commercialProofStatus, 'NOT_ESTABLISHED');

    const project = await get(db, 'SELECT * FROM research_projects WHERE id=?', [promoted.projectId]);
    assert.equal(project.name, 'Candidate Alpha Pilot');
    assert.equal(project.seed_phrase, 'candidate alpha');
    assert.equal(project.state, 'EVIDENCE_INTAKE');
    assert.equal(project.actor_id, 1);

    const intake = await get(db, 'SELECT * FROM research_evidence WHERE id=?', [promoted.projectEvidenceId]);
    assert.equal(intake.project_id, promoted.projectId);
    assert.equal(intake.source, 'GLOBAL_CANDIDATE_POOL');
    assert.equal(intake.evidence_state, 'OBSERVED');
    const metadata = JSON.parse(intake.metadata);
    assert.equal(metadata.kind, 'GLOBAL_CANDIDATE_PROMOTION_V1');
    assert.equal(metadata.authority, 'NONE');
    assert.equal(metadata.allowedUse, 'RESEARCH_ONLY');
    assert.equal(metadata.candidate.candidateKey, alpha.candidateKey);
    assert.equal(metadata.evaluation.advisoryDisposition.value, 'PROMOTE');
    assert.equal(metadata.evaluation.commercialProof.status, 'NOT_ESTABLISHED');
    assert.equal(metadata.evidenceRefs.length, alpha.evidence.length);
    assert.deepEqual(new Set(metadata.evidenceRefs.map(item => item.evidenceHash)),
      new Set(alpha.evidence.map(item => item.evidenceHash)));

    const receipt = await get(db, 'SELECT * FROM global_candidate_promotions WHERE id=?', [promoted.promotionId]);
    assert.equal(receipt.project_id, promoted.projectId);
    assert.equal(receipt.candidate_id, alpha.id);
    assert.equal(receipt.evidence_snapshot_hash, promoted.evidenceSnapshotHash);

    const replay = await promoteGlobalCandidateToProject(db, scope, {
      candidateId: alpha.id, projectName: 'Candidate Alpha Pilot', idempotencyKey: 'alpha-promote-001'
    });
    assert.equal(replay.replay, true);
    assert.equal(replay.projectId, promoted.projectId);
    assert.equal((await get(db, 'SELECT COUNT(*) AS count FROM global_candidate_promotions')).count, 1);
    assert.equal((await get(db, 'SELECT COUNT(*) AS count FROM research_projects')).count, 2);
    assert.equal((await get(db, "SELECT COUNT(*) AS count FROM research_evidence WHERE source='GLOBAL_CANDIDATE_POOL'")).count, 1);

    await assert.rejects(() => promoteGlobalCandidateToProject(db, scope, {
      candidateId: beta.id, projectName: 'Candidate Beta', idempotencyKey: 'alpha-promote-001'
    }), error => error?.code === 'GLOBAL_CANDIDATE_PROMOTION_IDEMPOTENCY_CONFLICT');

    await assert.rejects(() => promoteGlobalCandidateToProject(db, scope, {
      candidateId: alpha.id, projectName: 'Candidate Alpha Again', idempotencyKey: 'alpha-promote-002'
    }), error => error?.code === 'GLOBAL_CANDIDATE_ALREADY_PROMOTED');

    await assert.rejects(() => promoteGlobalCandidateToProject(db, scope, {
      candidateId: beta.id, projectName: 'Candidate Beta Pilot', idempotencyKey: 'beta-promote-001'
    }), error => error?.code === 'GLOBAL_CANDIDATE_NOT_PROMOTABLE');
    assert.equal((await get(db, 'SELECT COUNT(*) AS count FROM research_projects')).count, 2);

    const otherScope = { ...scope, workspaceId: 8 };
    await assert.rejects(() => promoteGlobalCandidateToProject(db, otherScope, {
      candidateId: alpha.id, projectName: 'Wrong Workspace', idempotencyKey: 'wrong-workspace-001'
    }), error => error?.code === 'GLOBAL_CANDIDATE_NOT_FOUND');

    await assert.rejects(() => run(db, 'UPDATE global_candidate_promotions SET candidate_key=? WHERE id=?',
      [sha('mutated'), promoted.promotionId]), /IMMUTABLE_GLOBAL_CANDIDATE_PROMOTION/);

    assert.deepEqual(await get(db, 'SELECT * FROM research_projects WHERE id=1'), protectedBefore.existingProject);
    assert.deepEqual(await all(db, 'SELECT * FROM product_truth_revisions'), protectedBefore.truth);
    assert.deepEqual(await all(db, 'SELECT * FROM listings'), protectedBefore.listings);

    console.log('GLOBAL_CANDIDATE_PROMOTION_B4_PASSED');
  } finally { await close(db); }
})().catch(error => { console.error(error); process.exitCode = 1; });
