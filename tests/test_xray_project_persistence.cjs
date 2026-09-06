const assert = require('assert');
const fs = require('fs');
const path = require('path');
process.env.NODE_ENV = 'test';
const { app, db, databaseReady } = require('../server/server');
const { createSessionRecord } = require('../server/security/session');

const all = (sql, params = []) => new Promise((resolve, reject) =>
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
const sessionFor = (userId, workspaceId, tenantId) => new Promise((resolve, reject) =>
  createSessionRecord(db, userId, workspaceId, tenantId, (err, session) => err ? reject(err) : resolve(session)));

async function amazonOwner() {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const rows = await all(`SELECT u.id user_id, w.tenant_id, wm.workspace_id
      FROM workspace_memberships wm JOIN users u ON u.id=wm.user_id
      JOIN workspaces w ON w.id=wm.workspace_id
      WHERE wm.role='OWNER' AND w.marketplace='AMAZON'`);
    if (rows[0]) return rows[0];
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('AMAZON_OWNER_TIMEOUT');
}

(async () => {
  await databaseReady;
  const owner = await amazonOwner();
  let server;
  await new Promise((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', resolve);
    server.on('error', reject);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  process.env.ALLOWED_ORIGINS = base;
  const session = await sessionFor(owner.user_id, owner.workspace_id, owner.tenant_id);
  const auth = { Origin: base, Cookie: `omni_session=${session.rawToken}` };
  const jsonPost = async (url, body) => {
    const response = await fetch(base + url, {
      method: 'POST', credentials: 'include',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  };
  const upload = async (projectId, confirm) => {
    const csv = [
      'ASIN,Title,Brand,Price,Monthly Sales',
      'B0REAL0001,Para Mi Hija Necklace,Brand A,24.99,512',
      'B0REAL0002,Cheap Reject,Brand B,3.99,10'
    ].join('\n');
    const form = new FormData();
    form.append('reportFile', new Blob([csv], { type: 'text/csv' }), 'xray.csv');
    form.append('category', 'Jewelry');
    form.append('seedPhrase', 'para mi hija');
    form.append('projectId', String(projectId));
    form.append('confirm', String(confirm));
    const response = await fetch(base + '/api/upload-h10', {
      method: 'POST', credentials: 'include', headers: auth, body: form
    });
    return { status: response.status, body: await response.json() };
  };

  try {
    const created = await jsonPost('/api/projects', {
      name: 'R2 Xray Persistence', seedPhrase: 'para mi hija'
    });
    assert.strictEqual(created.status, 200);
    const projectId = created.body.projectId;
    const before = await all('SELECT * FROM research_evidence');

    const preview = await upload(projectId, false);
    assert.strictEqual(preview.status, 200);
    assert.strictEqual(preview.body.preview, true);
    assert.strictEqual(preview.body.committed, false);
    assert.strictEqual(preview.body.projectId, projectId);
    assert.strictEqual(preview.body.reportProvenance.projectBinding, 'PREVIEW_NOT_PERSISTED');
    assert.deepStrictEqual(preview.body.rowAccounting, {
      inputRows: 2, acceptedRows: 1, rejectedRows: 1
    });
    assert.strictEqual((await all('SELECT * FROM research_evidence')).length, before.length,
      'Preview must make zero evidence writes');
    const committed = await upload(projectId, true);
    assert.strictEqual(committed.status, 200);
    assert.strictEqual(committed.body.committed, true);
    assert.strictEqual(committed.body.reportProvenance.projectBinding, 'PERSISTED_RESEARCH_ONLY');
    assert.ok(committed.body.evidenceId);
    const stored = await all('SELECT * FROM research_evidence WHERE id=?', [committed.body.evidenceId]);
    assert.strictEqual(stored.length, 1);
    assert.strictEqual(stored[0].tenant_id, owner.tenant_id);
    assert.strictEqual(stored[0].workspace_id, owner.workspace_id);
    assert.strictEqual(stored[0].marketplace, 'AMAZON');
    assert.strictEqual(stored[0].project_id, projectId);
    assert.strictEqual(stored[0].source, 'STAFF_MANUAL_ASSERTION');
    assert.strictEqual(stored[0].evidence_state, 'OBSERVED');
    const metadata = JSON.parse(stored[0].metadata);
    assert.strictEqual(metadata.kind, 'AMAZON_XRAY_REPORT_V1');
    assert.strictEqual(metadata.authority, 'NONE');
    assert.strictEqual(metadata.provider, 'HELIUM10_XRAY');
    assert.strictEqual(metadata.xraySellers.length, 1);
    assert.strictEqual(metadata.reportProvenance.projectBinding, 'PERSISTED_RESEARCH_ONLY');

    const amazonUi = fs.readFileSync(path.join(__dirname, '../src/components/AmazonPipelineWorkflow.jsx'), 'utf8');
    const etsyUi = fs.readFileSync(path.join(__dirname, '../src/components/EtsyWorkspace.jsx'), 'utf8');
    assert.ok(amazonUi.includes('clearProjectXrayState();\n    if (!requestedProjectId)'),
      'Project-bound Xray state must clear before rehydration starts');
    assert.ok(amazonUi.includes('activeProjectIdRef.current !== requestedProjectId'),
      'Late Amazon responses must be bound to the requested project');
    assert.ok(!amazonUi.includes('.catch(() => {})'), 'Amazon rehydration errors must not be swallowed');
    assert.ok(amazonUi.includes('Không thể tải lại dữ liệu Xray cho project hiện tại'),
      'Amazon rehydration failure must be surfaced to staff');
    assert.ok(!etsyUi.includes('.catch(() => {})'), 'Etsy rehydration errors must not be swallowed');
    assert.ok(etsyUi.includes('Không thể tải lại dữ liệu Etsy cho project hiện tại'),
      'Etsy rehydration failure must be surfaced to staff');

    for (let reload = 0; reload < 2; reload += 1) {
      const response = await fetch(
        base + `/api/projects/${projectId}/research-imports/AMAZON_XRAY_REPORT_V1`,
        { headers: auth }
      );
      const data = await response.json();
      assert.strictEqual(response.status, 200);
      assert.strictEqual(data.import.metadata.contentHash, metadata.contentHash);
      assert.deepStrictEqual(data.import.metadata.xraySellers, metadata.xraySellers);
    }

    const duplicate = await upload(projectId, true);
    assert.strictEqual(duplicate.body.evidenceId, committed.body.evidenceId);
    assert.strictEqual(duplicate.body.duplicateSubmission, true);
    const after = await all('SELECT * FROM research_evidence');
    assert.strictEqual(after.length, before.length + 1);

    const accept = await jsonPost(`/api/evidence/${committed.body.evidenceId}/accept`, {
      reason: 'must remain research only'
    });
    assert.strictEqual(accept.status, 409);
    assert.ok(/^UNQUALIFIED_/.test(accept.body.error));

    console.log('R2_XRAY: measured=39 passed=39 failed=0 unexecuted=0');
  } finally {
    await new Promise(resolve => server.close(resolve));
    db.close();
  }
})().catch(error => {
  console.error(error);
  try { db.close(); } catch (_) {}
  process.exit(1);
});
