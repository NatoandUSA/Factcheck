'use strict';

const crypto = require('node:crypto');
const { canonicalJson } = require('./revisionStore');

class ExperimentContractError extends Error {
  constructor(code, status = 400, details = {}) {
    super(code); this.code = code; this.status = status; this.details = details;
  }
}

const run = (db, sql, params = []) => new Promise((resolve, reject) =>
  db.run(sql, params, function done(error) { error ? reject(error) : resolve({ changes: this.changes, lastID: this.lastID }); }));
const get = (db, sql, params = []) => new Promise((resolve, reject) =>
  db.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null)));
const all = (db, sql, params = []) => new Promise((resolve, reject) =>
  db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows || [])));

const hash = value => crypto.createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
const METRICS = new Set(['ORDERS','CVR','AOV','CAC','MARGIN','CONTRIBUTION_PROFIT']);
const OPS = new Set(['GTE','LTE']);

function text(value, code, max = 2000) {
  const out = String(value || '').trim();
  if (!out || out.length > max) throw new ExperimentContractError(code, 422);
  return out;
}
function validateScope(scope) {
  if (!scope?.tenantId || !Number.isInteger(Number(scope.workspaceId))
    || !['AMAZON','ETSY'].includes(scope.marketplace) || !Number.isInteger(Number(scope.actorId))) {
    throw new ExperimentContractError('EXPERIMENT_SCOPE_INVALID', 400);
  }
}

function normalizeRules(rules) {
  if (!Array.isArray(rules) || rules.length < 1 || rules.length > 12) {
    throw new ExperimentContractError('EXPERIMENT_SUCCESS_METRICS_REQUIRED', 422);
  }
  const seen = new Set();
  return rules.map(rule => {
    const metric = String(rule?.metric || '').trim().toUpperCase();
    const operator = String(rule?.operator || '').trim().toUpperCase();
    const target = Number(rule?.target);
    if (!METRICS.has(metric) || !OPS.has(operator) || !Number.isFinite(target)) {
      throw new ExperimentContractError('EXPERIMENT_SUCCESS_METRIC_INVALID', 422, { metric, operator });
    }
    if (seen.has(metric)) throw new ExperimentContractError('EXPERIMENT_SUCCESS_METRIC_DUPLICATE', 422, { metric });
    seen.add(metric);
    return { metric, operator, target };
  });
}

function normalizeMetrics(metrics) {
  const out = {};
  for (const metric of METRICS) {
    const raw = metrics?.[metric] ?? metrics?.[metric.toLowerCase()];
    if (raw === undefined || raw === null || raw === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new ExperimentContractError('EXPERIMENT_OUTCOME_METRIC_INVALID', 422, { metric });
    if (['ORDERS','CVR','AOV','CAC'].includes(metric) && value < 0) {
      throw new ExperimentContractError('EXPERIMENT_OUTCOME_METRIC_INVALID', 422, { metric });
    }
    if (metric === 'ORDERS' && !Number.isInteger(value)) {
      throw new ExperimentContractError('EXPERIMENT_OUTCOME_METRIC_INVALID', 422, { metric });
    }
    out[metric] = value;
  }
  return out;
}
async function assertProject(db, scope, projectId) {
  const row = await get(db, `SELECT id,name,state,seed_phrase FROM research_projects
    WHERE id=? AND tenant_id=? AND workspace_id=? AND marketplace=?`,
    [projectId, scope.tenantId, Number(scope.workspaceId), scope.marketplace]);
  if (!row) throw new ExperimentContractError('EXPERIMENT_PROJECT_NOT_FOUND', 404);
  return row;
}

async function createExperimentContract(db, scope, input) {
  validateScope(scope);
  const projectId = Number(input?.projectId);
  if (!Number.isInteger(projectId) || projectId < 1) throw new ExperimentContractError('EXPERIMENT_PROJECT_INVALID', 422);
  await assertProject(db, scope, projectId);
  const idempotencyKey = text(input.idempotencyKey, 'EXPERIMENT_IDEMPOTENCY_REQUIRED', 128);
  const startAt = new Date(input.startAt); const endAt = new Date(input.endAt);
  if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || endAt <= startAt) {
    throw new ExperimentContractError('EXPERIMENT_TEST_WINDOW_INVALID', 422);
  }
  const contract = {
    hypothesis: text(input.hypothesis, 'EXPERIMENT_HYPOTHESIS_REQUIRED'),
    offer: text(input.offer, 'EXPERIMENT_OFFER_REQUIRED'),
    priceAmount: Number(input.priceAmount),
    priceCurrency: String(input.priceCurrency || '').trim().toUpperCase(),
    variant: text(input.variant, 'EXPERIMENT_VARIANT_REQUIRED'),
    trafficSource: text(input.trafficSource, 'EXPERIMENT_TRAFFIC_SOURCE_REQUIRED', 500),
    startAt: startAt.toISOString(), endAt: endAt.toISOString(),
    successMetrics: normalizeRules(input.successMetrics),
    stopConditions: Array.isArray(input.stopConditions) ? input.stopConditions.map(x => text(x, 'EXPERIMENT_STOP_CONDITION_INVALID', 500)) : []
  };
  if (!Number.isFinite(contract.priceAmount) || contract.priceAmount <= 0 || !/^[A-Z]{3}$/.test(contract.priceCurrency)
    || contract.stopConditions.length < 1 || contract.stopConditions.length > 12) {
    throw new ExperimentContractError('EXPERIMENT_COMMERCIAL_TERMS_INVALID', 422);
  }
  const snapshotHash = hash(contract);
  const requestHash = hash({ projectId, contract });
  const existing = await get(db, `SELECT * FROM experiment_contracts
    WHERE tenant_id=? AND workspace_id=? AND marketplace=? AND idempotency_key=?`,
    [scope.tenantId, Number(scope.workspaceId), scope.marketplace, idempotencyKey]);
  if (existing) {
    if (existing.request_hash !== requestHash) throw new ExperimentContractError('EXPERIMENT_IDEMPOTENCY_CONFLICT', 409);
    return { contract: mapContract(existing), replay: true };
  }
  const count = await get(db, 'SELECT COUNT(*) c FROM experiment_contracts WHERE project_id=?', [projectId]);
  if (Number(count?.c || 0) >= 3) throw new ExperimentContractError('EXPERIMENT_PROJECT_LIMIT_REACHED', 409);
  const result = await run(db, `INSERT INTO experiment_contracts
    (tenant_id,workspace_id,marketplace,project_id,hypothesis,offer,price_amount,price_currency,variant,traffic_source,
     start_at,end_at,success_metrics_json,stop_conditions_json,snapshot_hash,request_hash,idempotency_key,created_by,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    scope.tenantId, Number(scope.workspaceId), scope.marketplace, projectId, contract.hypothesis, contract.offer,
    contract.priceAmount, contract.priceCurrency, contract.variant, contract.trafficSource, contract.startAt, contract.endAt,
    canonicalJson(contract.successMetrics), canonicalJson(contract.stopConditions), snapshotHash, requestHash, idempotencyKey,
    Number(scope.actorId), new Date().toISOString()
  ]);
  return { contract: await getExperimentContract(db, scope, result.lastID), replay: false };
}
function mapContract(row) {
  if (!row) return null;
  return { id: row.id, projectId: row.project_id, hypothesis: row.hypothesis, offer: row.offer,
    priceAmount: row.price_amount, priceCurrency: row.price_currency, variant: row.variant,
    trafficSource: row.traffic_source, startAt: row.start_at, endAt: row.end_at,
    successMetrics: JSON.parse(row.success_metrics_json), stopConditions: JSON.parse(row.stop_conditions_json),
    snapshotHash: row.snapshot_hash, createdBy: row.created_by, createdAt: row.created_at };
}

async function getExperimentContract(db, scope, id) {
  validateScope(scope);
  const row = await get(db, `SELECT * FROM experiment_contracts WHERE id=? AND tenant_id=? AND workspace_id=? AND marketplace=?`,
    [id, scope.tenantId, Number(scope.workspaceId), scope.marketplace]);
  if (!row) throw new ExperimentContractError('EXPERIMENT_CONTRACT_NOT_FOUND', 404);
  return mapContract(row);
}

async function listProjectExperiments(db, scope, projectId) {
  validateScope(scope); await assertProject(db, scope, Number(projectId));
  const rows = await all(db, `SELECT * FROM experiment_contracts WHERE project_id=? AND tenant_id=? AND workspace_id=? AND marketplace=? ORDER BY id`,
    [Number(projectId), scope.tenantId, Number(scope.workspaceId), scope.marketplace]);
  const out = [];
  for (const row of rows) {
    const outcome = await get(db, 'SELECT * FROM experiment_outcomes WHERE experiment_contract_id=?', [row.id]);
    const receipt = await get(db, 'SELECT * FROM experiment_learning_receipts WHERE experiment_contract_id=?', [row.id]);
    out.push({ ...mapContract(row), outcome: outcome ? { id: outcome.id, metrics: JSON.parse(outcome.metrics_json), notes: outcome.notes, capturedAt: outcome.captured_at } : null,
      learningReceipt: receipt ? { id: receipt.id, classification: receipt.classification, evaluation: JSON.parse(receipt.evaluation_json), createdAt: receipt.created_at } : null });
  }
  return out;
}
function classify(rules, metrics) {
  const checks = rules.map(rule => {
    const actual = metrics[rule.metric];
    if (actual === undefined) return { ...rule, actual: null, result: 'MISSING' };
    const pass = rule.operator === 'GTE' ? actual >= rule.target : actual <= rule.target;
    return { ...rule, actual, result: pass ? 'PASS' : 'FAIL' };
  });
  const classification = checks.some(x => x.result === 'MISSING') ? 'INCONCLUSIVE'
    : checks.every(x => x.result === 'PASS') ? 'SUPPORTED' : 'CONTRADICTED';
  return { classification, checks };
}

async function recordExperimentOutcome(db, scope, input) {
  validateScope(scope);
  const contract = await getExperimentContract(db, scope, Number(input?.experimentId));
  const metrics = normalizeMetrics(input.metrics);
  const idempotencyKey = text(input.idempotencyKey, 'EXPERIMENT_OUTCOME_IDEMPOTENCY_REQUIRED', 128);
  const capturedAt = new Date(input.capturedAt);
  if (!Number.isFinite(capturedAt.getTime())) throw new ExperimentContractError('EXPERIMENT_OUTCOME_CAPTURE_TIME_REQUIRED', 422);
  const outcomeRequestHash = hash({ experimentId: contract.id, metrics, notes: String(input.notes || '').trim() || null,
    capturedAt: capturedAt.toISOString() });
  const replay = await get(db, 'SELECT * FROM experiment_outcomes WHERE experiment_contract_id=?', [contract.id]);
  if (replay) {
    if (replay.idempotency_key !== idempotencyKey || replay.request_hash !== outcomeRequestHash) {
      throw new ExperimentContractError('EXPERIMENT_OUTCOME_ALREADY_RECORDED', 409);
    }
    const receipt = await get(db, 'SELECT * FROM experiment_learning_receipts WHERE experiment_contract_id=?', [contract.id]);
    return { outcomeId: replay.id, learningReceipt: { id: receipt.id, classification: receipt.classification,
      evaluation: JSON.parse(receipt.evaluation_json) }, replay: true };
  }
  const evaluation = classify(contract.successMetrics, metrics);
  await run(db, 'BEGIN IMMEDIATE');
  try {
    const outcome = await run(db, `INSERT INTO experiment_outcomes
      (experiment_contract_id,tenant_id,workspace_id,marketplace,project_id,metrics_json,request_hash,idempotency_key,notes,captured_at,created_by,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [contract.id, scope.tenantId, Number(scope.workspaceId), scope.marketplace, contract.projectId,
      canonicalJson(metrics), outcomeRequestHash, idempotencyKey, String(input.notes || '').trim() || null, capturedAt.toISOString(),
      Number(scope.actorId), new Date().toISOString()]);
    const receipt = await run(db, `INSERT INTO experiment_learning_receipts
      (experiment_contract_id,experiment_outcome_id,tenant_id,workspace_id,marketplace,project_id,contract_snapshot_hash,
       classification,evaluation_json,created_by,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [contract.id, outcome.lastID, scope.tenantId, Number(scope.workspaceId), scope.marketplace,
      contract.projectId, contract.snapshotHash, evaluation.classification, canonicalJson(evaluation), Number(scope.actorId), new Date().toISOString()]);
    await run(db, 'COMMIT');
    return { outcomeId: outcome.lastID, learningReceipt: { id: receipt.lastID, classification: evaluation.classification,
      evaluation }, replay: false };
  } catch (error) {
    try { await run(db, 'ROLLBACK'); } catch (_) {}
    throw error;
  }
}

module.exports = Object.freeze({
  ExperimentContractError, createExperimentContract, listProjectExperiments, recordExperimentOutcome, classify
});
