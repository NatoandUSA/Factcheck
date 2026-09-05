// Synthetic provider fixture; not evidence of a live connector invocation.
const { deriveControlledEvidenceEnvelope } = require('../../server/evidenceAuthority');
module.exports = async function controlledEvidence(db, projectId) {
  const project = await new Promise((resolve, reject) => db.get('SELECT * FROM research_projects WHERE id=?', [projectId], (e, p) => e ? reject(e) : resolve(p)));
  if (!project) throw new Error('FIXTURE_PROJECT_REQUIRED');
  const envelope = deriveControlledEvidenceEnvelope({
    provider: project.marketplace === 'ETSY' ? 'YTRENDS_MCP' : 'H10_MCP',
    payload: { rows: [{ title: 'synthetic research', rank: 1 }] },
    scope: { tenantId: project.tenant_id, workspaceId: project.workspace_id,
      marketplace: project.marketplace, projectId, evidenceVersion: 1 }
  });
  return new Promise((resolve, reject) => db.run(`INSERT INTO research_evidence
    (tenant_id,workspace_id,marketplace,project_id,seed_phrase,source,actor_id,evidence_state,metadata)
    VALUES (?,?,?,?,?,'MCP_RETRIEVAL',?,'OBSERVED',?)`,
    [project.tenant_id, project.workspace_id, project.marketplace, projectId, project.seed_phrase, project.actor_id, JSON.stringify(envelope.metadata)],
    function(e) { e ? reject(e) : resolve(this.lastID); }));
};
