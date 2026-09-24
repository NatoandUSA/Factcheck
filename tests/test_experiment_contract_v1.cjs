const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { migrateExperimentContract } = require('../server/database/migrations');
const { createExperimentContract, listProjectExperiments, recordExperimentOutcome, classify } = require('../server/experimentContract');

const db = new sqlite3.Database(':memory:');
const run = (sql, params = []) => new Promise((resolve, reject) =>
  db.run(sql, params, function done(error) { error ? reject(error) : resolve({ changes: this.changes, lastID: this.lastID }); }));
const get = (sql, params = []) => new Promise((resolve, reject) =>
  db.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null)));

const scope = { tenantId: 'tenant-a', workspaceId: 2, marketplace: 'ETSY', actorId: 1 };
const base = {
  projectId: 9,
  hypothesis: 'A clearer memorial promise improves qualified conversion.',
  offer: 'Personalized pet memorial gift with one included customization.',
  priceAmount: 39.95,
  priceCurrency: 'USD',
  variant: 'Variant A — memorial-first title and hero image.',
  trafficSource: 'Etsy organic search',
  startAt: '2026-09-25T00:00:00.000Z',
  endAt: '2026-10-02T00:00:00.000Z',
  successMetrics: [
    { metric: 'ORDERS', operator: 'GTE', target: 3 },
    { metric: 'CVR', operator: 'GTE', target: 2.5 },
    { metric: 'CAC', operator: 'LTE', target: 12 }
  ],
  stopConditions: ['Stop if refund/cancellation signal indicates offer mismatch.'],
  idempotencyKey: 'exp-project9-v1'
};
async function main() {
  await run('PRAGMA foreign_keys=ON');
  await run('CREATE TABLE workspaces (id INTEGER PRIMARY KEY)');
  await run('CREATE TABLE users (id INTEGER PRIMARY KEY)');
  await run(`CREATE TABLE research_projects (
    id INTEGER PRIMARY KEY, tenant_id TEXT NOT NULL, workspace_id INTEGER NOT NULL,
    marketplace TEXT NOT NULL, name TEXT, state TEXT, seed_phrase TEXT
  )`);
  await run('INSERT INTO workspaces(id) VALUES (2)');
  await run('INSERT INTO users(id) VALUES (1)');
  await run(`INSERT INTO research_projects
    (id,tenant_id,workspace_id,marketplace,name,state,seed_phrase)
    VALUES (9,'tenant-a',2,'ETSY','Pet Memorial Gift','EVIDENCE_INTAKE','pet memorial gift')`);
  await migrateExperimentContract(db);

  const first = await createExperimentContract(db, scope, base);
  assert.equal(first.replay, false);
  assert.equal(first.contract.projectId, 9);
  assert.equal(first.contract.successMetrics.length, 3);
  assert.match(first.contract.snapshotHash, /^[a-f0-9]{64}$/);

  const replay = await createExperimentContract(db, scope, base);
  assert.equal(replay.replay, true);
  assert.equal(replay.contract.id, first.contract.id);
  assert.equal((await get('SELECT COUNT(*) c FROM experiment_contracts')).c, 1);
  await assert.rejects(createExperimentContract(db, scope, { ...base, hypothesis: 'Changed with same key' }),
    error => error.code === 'EXPERIMENT_IDEMPOTENCY_CONFLICT');

  await assert.rejects(run('UPDATE experiment_contracts SET hypothesis=? WHERE id=?', ['mutated', first.contract.id]),
    /IMMUTABLE_EXPERIMENT_RECORD/);
  await assert.rejects(run('DELETE FROM experiment_contracts WHERE id=?', [first.contract.id]),
    /IMMUTABLE_EXPERIMENT_RECORD/);
  assert.equal(classify(base.successMetrics, { ORDERS: 3, CVR: 2.5, CAC: 10 }).classification, 'SUPPORTED');
  assert.equal(classify(base.successMetrics, { ORDERS: 1, CVR: 2.5, CAC: 10 }).classification, 'CONTRADICTED');
  assert.equal(classify(base.successMetrics, { ORDERS: 3, CVR: 2.5 }).classification, 'INCONCLUSIVE');

  const outcomeInput = {
    experimentId: first.contract.id,
    metrics: { ORDERS: 4, CVR: 3.1, AOV: 42, CAC: 9, MARGIN: 61, CONTRIBUTION_PROFIT: 54 },
    notes: 'Operator-entered real outcome.',
    capturedAt: '2026-10-02T00:05:00.000Z',
    idempotencyKey: 'outcome-project9-v1'
  };
  const outcome = await recordExperimentOutcome(db, scope, outcomeInput);
  assert.equal(outcome.replay, false);
  assert.equal(outcome.learningReceipt.classification, 'SUPPORTED');

  const outcomeReplay = await recordExperimentOutcome(db, scope, outcomeInput);
  assert.equal(outcomeReplay.replay, true);
  assert.equal(outcomeReplay.outcomeId, outcome.outcomeId);
  assert.equal((await get('SELECT COUNT(*) c FROM experiment_outcomes')).c, 1);
  assert.equal((await get('SELECT COUNT(*) c FROM experiment_learning_receipts')).c, 1);
  await assert.rejects(recordExperimentOutcome(db, scope, { ...outcomeInput, metrics: { ORDERS: 999 } }),
    error => error.code === 'EXPERIMENT_OUTCOME_ALREADY_RECORDED');

  const listed = await listProjectExperiments(db, scope, 9);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].outcome.metrics.ORDERS, 4);
  assert.equal(listed[0].learningReceipt.classification, 'SUPPORTED');

  for (let i = 2; i <= 3; i++) {
    await createExperimentContract(db, scope, { ...base, idempotencyKey: `exp-project9-v${i}`,
      hypothesis: `Hypothesis ${i}`, startAt: `2026-10-0${i}T00:00:00Z`, endAt: `2026-10-1${i}T00:00:00Z` });
  }
  await assert.rejects(createExperimentContract(db, scope, {
    ...base, idempotencyKey: 'exp-project9-v4', hypothesis: 'Hypothesis 4',
    startAt: '2026-10-04T00:00:00Z', endAt: '2026-10-14T00:00:00Z'
  }), error => error.code === 'EXPERIMENT_PROJECT_LIMIT_REACHED');

  console.log('Experiment Contract V1: PASS');
}

main().then(() => db.close()).catch(error => {
  console.error(error);
  try { db.close(); } catch (_) {}
  process.exit(1);
});
