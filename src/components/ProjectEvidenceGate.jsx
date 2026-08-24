import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, RefreshCw, ShieldCheck } from 'lucide-react';
import { parseJsonResponse } from '../utils/apiResponse';

export default function ProjectEvidenceGate({ activeProject, onTransition, onShowToast, accent = '#0284c7' }) {
  const [evidence, setEvidence] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState(null);

  const reload = useCallback(async () => {
    if (!activeProject?.id) return setEvidence([]);
    setLoading(true);
    try {
      const response = await fetch(`/api/evidence?projectId=${encodeURIComponent(activeProject.id)}`, { credentials: 'include' });
      const data = await parseJsonResponse(response);
      if (!response.ok) throw new Error(data.message || data.error || 'EVIDENCE_LOAD_FAILED');
      setEvidence(Array.isArray(data.evidence) ? data.evidence : []);
    } catch (error) {
      onShowToast?.(`Không tải được evidence của project: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [activeProject?.id, onShowToast]);

  useEffect(() => { reload(); }, [reload]);

  const accept = async (id) => {
    setActingId(id);
    try {
      const response = await fetch(`/api/evidence/${id}/accept`, { method: 'POST', credentials: 'include' });
      const data = await parseJsonResponse(response);
      if (!response.ok) throw new Error(data.message || data.error || 'EVIDENCE_ACCEPT_FAILED');
      onShowToast?.(`Evidence #${id} đã được accept.`);
      await reload();
    } catch (error) {
      onShowToast?.(`Không thể accept evidence #${id}: ${error.message}`);
    } finally {
      setActingId(null);
    }
  };

  if (!activeProject) return null;
  const accepted = evidence.filter(row => row.evidence_state === 'ACCEPTED');
  const pending = evidence.filter(row => row.evidence_state !== 'ACCEPTED');
  const canAdvance = activeProject.state === 'EVIDENCE_INTAKE' && accepted.length > 0;

  return (
    <section className="studio-panel" style={{ padding: '14px 18px', borderLeft: `4px solid ${accent}`, background: '#f8fafc' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <strong><ShieldCheck size={16} style={{ verticalAlign: 'middle', marginRight: '6px', color: accent }} />Gate evidence — Project #{activeProject.id}</strong>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '3px' }}>State: <b>{activeProject.state}</b> · {accepted.length} accepted · {pending.length} pending/observed.</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary btn-sm" onClick={reload} disabled={loading}>{loading ? <RefreshCw size={14} className="spinner" /> : <RefreshCw size={14} />} Tải evidence</button>
          {activeProject.state === 'EVIDENCE_INTAKE' && <button className="btn btn-primary btn-sm" onClick={() => onTransition?.('RESEARCH_ACCEPTED')} disabled={!canAdvance} title={!canAdvance ? 'Cần ít nhất một evidence đủ điều kiện đã được accept.' : undefined} style={{ background: accent }}><CheckCircle2 size={14} /> Chuyển sang Research</button>}
        </div>
      </div>
      {pending.length > 0 && <div style={{ marginTop: '10px', display: 'grid', gap: '6px' }}>{pending.slice(0, 5).map(row => <div key={row.id} style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', fontSize: '0.78rem' }}><span>#{row.id} · {row.source} · {row.evidence_state}</span><button className="btn btn-secondary btn-sm" onClick={() => accept(row.id)} disabled={actingId === row.id}>{actingId === row.id ? 'Đang accept…' : 'Accept evidence'}</button></div>)}</div>}
      {activeProject.state === 'EVIDENCE_INTAKE' && !canAdvance && <div style={{ marginTop: '10px', color: '#92400e', fontSize: '0.78rem' }}><CircleAlert size={14} style={{ verticalAlign: 'middle', marginRight: '5px' }} />Sau upload/MCP pull: accept evidence phù hợp trước; server sẽ từ chối evidence không đủ điều kiện. Không có bypass.</div>}
    </section>
  );
}
