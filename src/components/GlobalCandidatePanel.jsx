import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

function uuid() {
  if (!globalThis.crypto?.randomUUID) throw new Error('SECURE_UUID_UNAVAILABLE');
  return globalThis.crypto.randomUUID();
}

async function readJson(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || body.error || `HTTP_${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

export default function GlobalCandidatePanel({ marketplace, onPromoted, onRequireLogin, onShowToast }) {
  const { user, invalidateSession } = useAuth();
  const [state, setState] = useState({ loading: false, error: '', candidates: [] });
  const [projectNames, setProjectNames] = useState({});
  const [promotingId, setPromotingId] = useState(null);
  const [pullingIntel, setPullingIntel] = useState(false);
  const [researchFile, setResearchFile] = useState(null);
  const [researchPreview, setResearchPreview] = useState(null);
  const [researchBusy, setResearchBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user?.workspaceId) return setState({ loading: false, error: '', candidates: [] });
    setState(previous => ({ ...previous, loading: true, error: '' }));
    try {
      const body = await readJson(await fetch('/api/global-candidates/evaluations?limit=30', {
        credentials: 'include', cache: 'no-store'
      }));
      setState({ loading: false, error: '', candidates: body.candidates || [] });
    } catch (error) {
      if (error.status === 401) {
        invalidateSession();
        onRequireLogin?.();
      }
      setState({ loading: false, error: error.message, candidates: [] });
    }
  }, [user?.workspaceId, user?.marketplace, invalidateSession, onRequireLogin]);

  useEffect(() => { load(); }, [load]);

  const canPromote = ['OWNER', 'MANAGER'].includes(user?.role);
  const canPullIntel = user?.role === 'OWNER';

  const pullIntel = async () => {
    setPullingIntel(true);
    try {
      const pulled = await readJson(await fetch('/api/integrations/social-listening/handoffs/pull', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotencyKey: uuid() })
      }));
      const handoffId = Number(pulled?.handoff?.id);
      if (!Number.isInteger(handoffId) || handoffId < 1) throw new Error('SOCIAL_HANDOFF_ID_MISSING');
      await readJson(await fetch(`/api/global-candidates/social-handoffs/${handoffId}`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}'
      }));
      onShowToast?.(`Verified Intel handoff #${handoffId} projected into Global Candidate Pool.`, 'success');
      await load();
    } catch (error) {
      onShowToast?.(`Intel handoff pull blocked: ${error.message}`, 'error');
      setState(previous => ({ ...previous, error: error.message }));
    } finally {
      setPullingIntel(false);
    }
  };

  const researchKind = marketplace === 'AMAZON' ? 'AMAZON_CEREBRO' : 'ETSY_SEARCH';
  const researchLabel = marketplace === 'AMAZON' ? 'Helium 10 Cerebro' : 'Etsy public search';

  const submitResearch = async confirm => {
    if (!researchFile) return onShowToast?.(`Select one ${researchLabel} file first.`, 'error');
    setResearchBusy(true);
    try {
      const form = new FormData(); form.append('kind', researchKind); form.append('researchFile', researchFile);
      const endpoint = `/api/global-candidates/research-imports${confirm ? '' : '/preview'}`;
      const result = await readJson(await fetch(endpoint, { method: 'POST', credentials: 'include', body: form }));
      if (!confirm) {
        setResearchPreview(result);
        onShowToast?.(`Candidate evidence preview: ${result.candidateCount || 0} phrases, zero-write.`, 'success');
      } else {
        onShowToast?.(`Marketplace evidence added to Candidate Pool (${result.evidenceCreated || 0} new evidence rows).`, 'success');
        setResearchPreview(null); setResearchFile(null); await load();
      }
    } catch (error) {
      onShowToast?.(`Candidate evidence ${confirm ? 'import' : 'preview'} blocked: ${error.message}`, 'error');
      setState(previous => ({ ...previous, error: error.message }));
    } finally {
      setResearchBusy(false);
    }
  };

  const promote = async candidate => {
    const projectName = String(projectNames[candidate.candidateId] || candidate.displayPhrase || '').trim();
    if (!projectName) return onShowToast?.('Enter a Project name before Promote.', 'error');
    setPromotingId(candidate.candidateId);
    try {
      const result = await readJson(await fetch(`/api/global-candidates/${candidate.candidateId}/promote`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName, idempotencyKey: uuid() })
      }));
      onShowToast?.(`Promoted "${candidate.displayPhrase}" to Project #${result.projectId}.`, 'success');
      await onPromoted?.(result.projectId);
      await load();
    } catch (error) {
      onShowToast?.(`Promote blocked: ${error.message}`, 'error');
      setState(previous => ({ ...previous, error: error.message }));
    } finally {
      setPromotingId(null);
    }
  };

  return <section data-testid="global-candidate-operator-path" className="studio-panel"
    style={{ padding: '16px 20px', borderLeft: '4px solid #7c3aed' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div>
        <h3 style={{ margin: 0, color: '#6d28d9' }}>Global Candidate to Project</h3>
        <p style={{ margin: '5px 0 0', color: '#475569', fontSize: '.8rem' }}>
          B3 is advisory decision support. Only OWNER/MANAGER can Promote, and the server reevaluates the candidate before Project creation.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {canPullIntel && <button type="button" data-testid="pull-verified-intel-handoff"
          onClick={pullIntel} disabled={pullingIntel || state.loading}>
          {pullingIntel ? 'Pulling verified Intel...' : 'Pull verified Intel handoff'}
        </button>}
        <button type="button" onClick={load} disabled={state.loading}>
          {state.loading ? 'Loading...' : 'Refresh Candidates'}
        </button>
      </div>
    </div>

    {state.error && <div role="alert" style={{ marginTop: 10, color: '#991b1b' }}>{state.error}</div>}

    <div data-testid="global-candidate-marketplace-evidence" style={{ marginTop: 12, padding: 10, border: '1px solid #ddd6fe', borderRadius: 8 }}>
      <strong>Add marketplace evidence to B2 Pool</strong>
      <div style={{ color: '#64748b', fontSize: '.75rem', margin: '4px 0 8px' }}>
        {researchLabel} is parsed by the existing canonical adapter. Preview is zero-write; Confirm preserves the source authority classification.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input data-testid="global-candidate-research-file" type="file"
          accept={marketplace === 'AMAZON' ? '.csv,.xlsx' : '.csv,.html,.htm,text/csv,text/html'}
          onChange={event => { setResearchFile(event.target.files?.[0] || null); setResearchPreview(null); }} />
        <button type="button" disabled={!researchFile || researchBusy} onClick={() => submitResearch(false)}>Preview evidence</button>
        <button type="button" disabled={!researchPreview?.zeroWrite || researchBusy} onClick={() => submitResearch(true)}>Confirm into Candidate Pool</button>
      </div>
      {researchPreview && <div style={{ marginTop: 7, fontSize: '.75rem', color: '#475569' }}>
        {researchPreview.candidateCount || 0} candidate phrases / raw {String(researchPreview.rawHash || '').slice(0, 12)}... / zero-write
      </div>}
    </div>

    {!state.loading && !state.error && state.candidates.length === 0 &&
      <div data-testid="global-candidate-empty"
        style={{ marginTop: 12, padding: 12, background: '#faf5ff', borderRadius: 8, color: '#581c87' }}>
        No Global Candidate exists in {marketplace} yet. This means the pool has no qualifying evidence; it does not mean there is no market opportunity.
        OWNER can use Pull verified Intel handoff above to ingest the configured signed Social Handoff V3 as RESEARCH_ONLY evidence. Do not bypass B3 by creating a Project manually.
      </div>}

    {state.candidates.length > 0 && <div style={{ overflowX: 'auto', marginTop: 12 }}>
      <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', background: '#fff' }}>
        <thead><tr>
          <th style={{ textAlign: 'left', padding: 8 }}>#</th>
          <th style={{ textAlign: 'left' }}>Candidate</th>
          <th>Disposition</th>
          <th>Evidence</th>
          <th style={{ textAlign: 'left' }}>Reasons / blockers</th>
          <th>Action</th>
        </tr></thead>
        <tbody>{state.candidates.map(candidate => {
          const disposition = candidate.advisoryDisposition?.value || 'NEEDS_EVIDENCE';
          const promotable = disposition === 'PROMOTE' && canPromote;
          const reasons = candidate.advisoryDisposition?.reasonCodes || [];
          const blockers = candidate.advisoryDisposition?.blockers || [];
          return <tr key={candidate.candidateId} style={{ borderTop: '1px solid #e2e8f0' }}>
            <td style={{ padding: 8 }}>{candidate.priorityRank}</td>
            <td>
              <strong>{candidate.displayPhrase}</strong>
              <div style={{ color: '#64748b', fontSize: '.72rem' }}>{candidate.marketplace}</div>
            </td>
            <td style={{ textAlign: 'center', fontWeight: 800 }}>{disposition}</td>
            <td style={{ textAlign: 'center' }}>
              {candidate.evidenceSummary?.evidenceCount || 0} obs / {candidate.evidenceSummary?.sourceFamilyCount || 0} sources
            </td>
            <td style={{ fontSize: '.72rem', color: '#475569', maxWidth: 380 }}>
              {(reasons.length ? reasons : blockers).join(' / ') || 'No reason code'}
            </td>
            <td style={{ minWidth: 260, padding: 8 }}>
              {disposition === 'PROMOTE' ? <>
                <input aria-label={`Project name for ${candidate.displayPhrase}`}
                  value={projectNames[candidate.candidateId] ?? `${candidate.displayPhrase} Pilot`}
                  onChange={event => setProjectNames(previous => ({ ...previous, [candidate.candidateId]: event.target.value }))}
                  style={{ width: '100%', marginBottom: 6 }} />
                <button type="button" disabled={!promotable || promotingId === candidate.candidateId}
                  onClick={() => promote(candidate)}>
                  {promotingId === candidate.candidateId ? 'Promoting...' : canPromote ? 'Promote to Project' : 'Manager/Owner required'}
                </button>
              </> : <span style={{ color: '#64748b' }}>Promotion gate not met</span>}
            </td>
          </tr>;
        })}</tbody>
      </table>
    </div>}
  </section>;
}
