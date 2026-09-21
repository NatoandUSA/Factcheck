process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();
const { migrateGlobalCandidatePoolMvp } = require('../server/database/migrations');
const { projectResearchFile, projectSocialHandoff, projectWorkflowArtifact } = require('../server/globalCandidateProjection');
const { ingestCandidateProjections, listGlobalCandidates } = require('../server/globalCandidatePool');
const { csv } = require('./fixtures/etsy_search_rich_67_sanitized.cjs');

const run = (db, sql, params = []) => new Promise((resolve, reject) =>
  db.run(sql, params, function done(error) { error ? reject(error) : resolve({ changes: this.changes, lastID: this.lastID }); }));
const get = (db, sql, params = []) => new Promise((resolve, reject) =>
  db.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
const all = (db, sql, params = []) => new Promise((resolve, reject) =>
  db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));
const close = db => new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

(async () => {
  const db = new sqlite3.Database(':memory:');
  try {
    await run(db, 'PRAGMA foreign_keys=ON');
    await run(db, 'CREATE TABLE users(id INTEGER PRIMARY KEY)');
    await run(db, 'CREATE TABLE workspaces(id INTEGER PRIMARY KEY)');
    await run(db, 'INSERT INTO users(id) VALUES (1)');
    await run(db, 'INSERT INTO workspaces(id) VALUES (7),(8)');
    await run(db, 'CREATE TABLE product_truth_revisions(id INTEGER PRIMARY KEY, marker TEXT)');
    await run(db, 'CREATE TABLE listings(id INTEGER PRIMARY KEY, marker TEXT)');
    await run(db, "INSERT INTO product_truth_revisions VALUES(1,'truth-safe')");
    await run(db, "INSERT INTO listings VALUES(1,'listing-safe')");
    const commerceBefore = {
      truth: await all(db, 'SELECT * FROM product_truth_revisions'),
      listings: await all(db, 'SELECT * FROM listings')
    };
    await migrateGlobalCandidatePoolMvp(db);
    await migrateGlobalCandidatePoolMvp(db);

    const amazonScope = { tenantId: 'tenant-a', workspaceId: 7, marketplace: 'AMAZON', actorId: 1 };
    const amazonBytes = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample_cerebro.xlsx'));
    const amazon = await projectResearchFile({ kind: 'AMAZON_CEREBRO', fileName: 'sample_cerebro.xlsx',
      mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', rawBytes: amazonBytes }, 'AMAZON');
    assert.ok(amazon.projections.length > 0);
    assert.ok(amazon.projections.every(item => item.authorityClassification === 'MODELED_THIRD_PARTY'));
    assert.ok(amazon.projections.every(item => item.provenance.parserHash && item.provenance.rows));
    const firstAmazon = await ingestCandidateProjections(db, amazonScope, amazon.projections);
    assert.ok(firstAmazon.candidateCreated > 0);
    const candidateCount = (await get(db, 'SELECT COUNT(*) AS count FROM global_candidates')).count;
    const evidenceCount = (await get(db, 'SELECT COUNT(*) AS count FROM global_candidate_evidence')).count;
    const replayAmazon = await ingestCandidateProjections(db, amazonScope, amazon.projections);
    assert.equal(replayAmazon.evidenceCreated, 0);
    assert.equal((await get(db, 'SELECT COUNT(*) AS count FROM global_candidates')).count, candidateCount);
    assert.equal((await get(db, 'SELECT COUNT(*) AS count FROM global_candidate_evidence')).count, evidenceCount);

    const etsyScope = { tenantId: 'tenant-a', workspaceId: 7, marketplace: 'ETSY', actorId: 1 };
    const etsy = await projectResearchFile({ kind: 'ETSY_SEARCH', fileName: 'etsy.csv',
      mediaType: 'text/csv', rawBytes: Buffer.from(csv) }, 'ETSY');
    assert.ok(etsy.projections.some(item => item.phrase === 'para mi hija'));
    assert.ok(etsy.projections.every(item => item.authorityClassification === 'OBSERVED_PUBLIC'));
    await ingestCandidateProjections(db, etsyScope, etsy.projections);

    const socialPayload = { reviewedPromotionQueue: [], discoveryCandidates: [], competitorStoreChanges: [],
      watchedOpportunities: [{ keyword: 'Para mi hija', sourceFamilies: ['REDDIT','TIKTOK_CC'],
        researchRecommendation: 'HANDOFF_READY', marketValidationStatus: 'NOT_CONNECTED' }] };
    const social = projectSocialHandoff({ id: 12, source_system: 'Ecom Intelligence Command Center',
      source_git_sha: 'a'.repeat(40), source_deployment_id: 'deployment-1', artifact_issued_at: '2030-01-01T00:00:00.000Z',
      source_artifact_hash: sha('social-artifact'), payload_json: JSON.stringify(socialPayload) });
    await ingestCandidateProjections(db, etsyScope, social);
    const grouped = (await listGlobalCandidates(db, etsyScope)).find(item => item.normalizedPhrase === 'para mi hija');
    assert.equal(grouped.groupingMethod, 'EXACT_NORMALIZED_V1');
    assert.deepEqual(new Set(grouped.evidence.map(item => item.authorityClassification)),
      new Set(['OBSERVED_PUBLIC','RESEARCH_ONLY']));
    assert.ok(grouped.evidence.every(item => !Object.hasOwn(item, 'score')));
    assert.deepEqual(grouped.evidence.find(item => item.authorityClassification === 'RESEARCH_ONLY').commercialEvidence, {});

    const outlierArtifact = { id: 44, projectId: 3, kind: 'ETSY_MASTER_KEYWORDS', revisionNumber: 2,
      artifactHash: sha('etsy-mkl'), dependencies: { patternArtifactId: 40 }, payload: { keywords: [
        { phrase: 'Para mi hija', tier: 'REVIEW', listingSpread: 4, shopSpread: 3,
          demandProxy: .7, competitionProxy: .2, tierReason: 'REVIEW_NO_SEED_RELEVANCE', provenance: [{ listingId: 'x' }] },
        { phrase: 'ignored primary', tier: 'PRIMARY' }
      ] } };
    const outliers = projectWorkflowArtifact(outlierArtifact);
    assert.equal(outliers.length, 1);
    assert.equal(outliers[0].authorityClassification, 'PROJECT_RESEARCH');
    await ingestCandidateProjections(db, etsyScope, outliers);
    const groupedWithOutlier = (await listGlobalCandidates(db, etsyScope))
      .find(item => item.normalizedPhrase === 'para mi hija');
    assert.deepEqual(new Set(groupedWithOutlier.evidence.map(item => item.authorityClassification)),
      new Set(['OBSERVED_PUBLIC','RESEARCH_ONLY','PROJECT_RESEARCH']));

    const otherWorkspace = { ...etsyScope, workspaceId: 8 };
    await ingestCandidateProjections(db, otherWorkspace, social);
    assert.equal((await listGlobalCandidates(db, otherWorkspace)).length, 1);
    assert.notEqual((await listGlobalCandidates(db, otherWorkspace))[0].candidateKey, grouped.candidateKey);

    await assert.rejects(() => run(db, "UPDATE global_candidates SET display_phrase='changed' WHERE id=?", [grouped.id]),
      /IMMUTABLE_GLOBAL_CANDIDATE_POOL/);
    assert.deepEqual({ truth: await all(db, 'SELECT * FROM product_truth_revisions'),
      listings: await all(db, 'SELECT * FROM listings') }, commerceBefore);

    console.log('GLOBAL_CANDIDATE_POOL_MVP_PASSED');
  } finally { await close(db); }
})().catch(error => { console.error(error); process.exitCode = 1; });
