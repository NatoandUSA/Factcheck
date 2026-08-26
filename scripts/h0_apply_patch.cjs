const fs = require('fs');
const path = require('path');

const serverPath = path.resolve(__dirname, '../server/server.js');
let src = fs.readFileSync(serverPath, 'utf8');

function replaceOnce(label, oldText, newText) {
  if (src.includes(newText)) {
    console.log(`H0 patch already applied: ${label}`);
    return;
  }
  const first = src.indexOf(oldText);
  if (first < 0) throw new Error(`H0 patch anchor missing: ${label}`);
  if (src.indexOf(oldText, first + oldText.length) >= 0) throw new Error(`H0 patch anchor ambiguous: ${label}`);
  src = src.slice(0, first) + newText + src.slice(first + oldText.length);
  console.log(`H0 patch applied: ${label}`);
}

replaceOnce(
  'authority import',
  "const { buildEvidenceHealth } = require('./evidenceHealth');",
  "const { buildEvidenceHealth } = require('./evidenceHealth');\nconst evidenceAuthority = require('./evidenceAuthority');\nconst { evaluateEvidenceAuthority, sanitizeGenericEvidenceMetadata, deriveControlledEvidenceEnvelope } = evidenceAuthority;\nconst H0_EVIDENCE_VERSION = 1;"
);

replaceOnce(
  'fail-closed eligibility',
`function getEvidenceAcceptanceEligibility(evidence) {
  const metadata = parseEvidenceMetadata(evidence);
  if (metadata.kind === ETSY_SEARCH_PASTE_ARTIFACT_KIND) {
    return {
      eligible: false,
      error: 'UNQUALIFIED_STAFF_PASTED_EVIDENCE',
      message: 'Staff-pasted HeyEtsy/search text is retained for analysis and audit, but it is not independently verified evidence and cannot satisfy Research Accepted.'
    };
  }
  if (metadata.kind !== SMART_PULL_ARTIFACT_KIND) return { eligible: true };

  const state = metadata.evidenceState;
  const hasContentHash = typeof metadata.contentHash === 'string' && /^[a-f0-9]{64}$/i.test(metadata.contentHash);
  const completeRetrieval = evidence.source === 'MCP_RETRIEVAL'
    && ACCEPTABLE_SMART_PULL_STATES.has(state)
    && hasContentHash;

  if (completeRetrieval) return { eligible: true };
  return {
    eligible: false,
    error: 'UNQUALIFIED_SMART_PULL_ARTIFACT',
    message: \`Smart Pull artifact state \${state || 'UNKNOWN'} is not eligible for acceptance. Only complete, hashed MCP retrievals may satisfy research acceptance.\`
  };
}`,
`function getEvidenceAuthorityScope(evidence) {
  return {
    tenantId: evidence?.tenant_id,
    workspaceId: Number(evidence?.workspace_id),
    marketplace: evidence?.marketplace,
    projectId: Number(evidence?.project_id),
    evidenceVersion: H0_EVIDENCE_VERSION
  };
}

function getEvidenceAcceptanceEligibility(evidence) {
  const metadata = parseEvidenceMetadata(evidence);
  if (metadata.kind === ETSY_SEARCH_PASTE_ARTIFACT_KIND) {
    return {
      eligible: false,
      error: 'UNQUALIFIED_STAFF_PASTED_EVIDENCE',
      message: 'Staff-pasted HeyEtsy/search text is retained for analysis and audit, but it is not independently verified evidence and cannot satisfy Research Accepted.'
    };
  }

  const authority = evaluateEvidenceAuthority(evidence, getEvidenceAuthorityScope(evidence));
  if (authority.qualifying) return { eligible: true };
  if (metadata.kind === SMART_PULL_ARTIFACT_KIND) {
    return {
      eligible: false,
      error: 'UNQUALIFIED_SMART_PULL_ARTIFACT',
      message: authority.message || 'Smart Pull artifact is missing a valid server/provider authority binding.'
    };
  }
  return {
    eligible: false,
    error: 'UNQUALIFIED_EVIDENCE_AUTHORITY',
    message: authority.message || 'Evidence is non-authoritative and cannot satisfy Research Accepted.'
  };
}`
);

replaceOnce(
  'server-derived Smart Pull authority',
`function persistSmartPullArtifact(req, project, source, seedPhrase, artifact) {
  return new Promise((resolve, reject) => {
    db.run(
      \`INSERT INTO research_evidence (tenant_id, workspace_id, marketplace, project_id, seed_phrase, source, actor_id, evidence_state, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'OBSERVED', ?)\`,
      [req.user.tenantId, req.user.workspaceId, req.user.marketplace, project.id, seedPhrase, source, req.user.userId,
        JSON.stringify({ kind: 'SMART_PULL_ARTIFACT_V1', ...artifact })],
      function(err) { if (err) reject(err); else resolve(this.lastID); }
    );
  });
}`,
`function persistSmartPullArtifact(req, project, source, seedPhrase, artifact) {
  const authorityScope = {
    tenantId: req.user.tenantId,
    workspaceId: req.user.workspaceId,
    marketplace: req.user.marketplace,
    projectId: project.id,
    evidenceVersion: H0_EVIDENCE_VERSION
  };
  const metadata = source === 'MCP_RETRIEVAL'
    ? deriveControlledEvidenceEnvelope({
        provider: artifact?.provider,
        payload: artifact?.response || artifact,
        scope: authorityScope,
        evidenceState: artifact?.evidenceState,
        extraMetadata: artifact
      }).metadata
    : {
        kind: SMART_PULL_ARTIFACT_KIND,
        ...(artifact || {}),
        authority: 'NON_AUTHORITY',
        authorityVersion: evidenceAuthority.AUTHORITY_VERSION,
        scope: authorityScope,
        evidenceVersion: H0_EVIDENCE_VERSION
      };

  return new Promise((resolve, reject) => {
    db.run(
      \`INSERT INTO research_evidence (tenant_id, workspace_id, marketplace, project_id, seed_phrase, source, actor_id, evidence_state, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'OBSERVED', ?)\`,
      [req.user.tenantId, req.user.workspaceId, req.user.marketplace, project.id, seedPhrase, source, req.user.userId,
        JSON.stringify(metadata)],
      function(err) { if (err) reject(err); else resolve(this.lastID); }
    );
  });
}`
);

replaceOnce(
  'generic metadata isolation',
  "    const finalMetadata = { ...(metadata || {}), isManualAssertion: isManual };",
  "    const finalMetadata = { ...sanitizeGenericEvidenceMetadata(metadata), isManualAssertion: isManual };"
);

fs.writeFileSync(serverPath, src, 'utf8');
console.log('H0 source patch complete.');
