const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const sqlite3 = require('sqlite3');
const { auditProjectEligibility } = require('../server/evidenceEligibilityAudit');

const validMetadata = JSON.stringify({
  kind: 'SMART_PULL_ARTIFACT_V1',
  evidenceState: 'VERIFIED_RETRIEVED',
  contentHash: 'a'.repeat(64)
});

const report = auditProjectEligibility(
  [
    { id: 1, marketplace: 'AMAZON', state: 'DNA_ACCEPTED' },
    { id: 2, marketplace: 'ETSY', state: 'MKL_FROZEN' },
    { id: 3, marketplace: 'ETSY', state: 'EVIDENCE_INTAKE' }
  ],
  [
    { id: 10, project_id: 1, source: 'STAFF_MANUAL_ASSERTION', evidence_state: 'ACCEPTED', metadata: '{}' },
    { id: 11, project_id: 2, source: 'MCP_RETRIEVAL', evidence_state: 'ACCEPTED', metadata: validMetadata }
  ]
);
assert.strictEqual(report.auditedProjectCount, 2);
assert.strictEqual(report.affectedProjectCount, 1);
assert.strictEqual(report.affectedProjects[0].projectId, 1);
assert.strictEqual(report.affectedProjects[0].blockingEvidence[0].evidenceId, 10);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-evidence-audit-'));
const dbPath = path.join(tempRoot, 'audit.db');
const db = new sqlite3.Database(dbPath);
const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, error => error ? reject(error) : resolve()));

(async () => {
  await run('CREATE TABLE research_projects (id INTEGER PRIMARY KEY, marketplace TEXT, state TEXT)');
  await run('CREATE TABLE research_evidence (id INTEGER PRIMARY KEY, project_id INTEGER, source TEXT, evidence_state TEXT, metadata TEXT)');
  await run("INSERT INTO research_projects VALUES (1, 'AMAZON', 'DNA_ACCEPTED')");
  await run("INSERT INTO research_evidence VALUES (1, 1, 'STAFF_MANUAL_ASSERTION', 'ACCEPTED', '{}')");
  await new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()));

  const before = fs.statSync(dbPath);
  const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'audit_evidence_eligibility.cjs'), dbPath], { encoding: 'utf8' });
  const after = fs.statSync(dbPath);
  assert.strictEqual(result.status, 2, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout.trim());
  assert.strictEqual(payload.scope, 'READ_ONLY_CURRENT_STATE_AUDIT');
  assert.strictEqual(payload.affectedProjectCount, 1);
  assert.strictEqual(after.size, before.size, 'Read-only audit must not change DB size');
  assert.strictEqual(after.mtimeMs, before.mtimeMs, 'Read-only audit must not change DB mtime');

  fs.rmSync(tempRoot, { recursive: true, force: true });
  console.log('EVIDENCE_ELIGIBILITY_READ_ONLY_AUDIT=PASS');
})().catch(error => {
  try { db.close(); } catch (_) {}
  try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch (_) {}
  console.error('EVIDENCE_ELIGIBILITY_READ_ONLY_AUDIT=FAIL', error);
  process.exit(1);
});
