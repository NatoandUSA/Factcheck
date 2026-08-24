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
  const acceptedQualified = accepted.filter(row => row.acceptanceEligibility?.eligible === true);
  const pending = evidence.filter(row => row.evidence_state !== 'ACCEPTED');
  const canAdvance = activeProject.state === 'EVIDENCE_INTAKE' && acceptedQualified.length > 0;

  return (
    <section className="studio-panel" style={{ padding: '14px 18px', borderLeft: `4px solid ${accent}`, background: '#f8fafc' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <strong><ShieldCheck size={16} style={{ verticalAlign: 'middle', marginRight: '6px', color: accent }} />Gate evidence — Project #{activeProject.id}</strong>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '3px' }}>State: <b>{activeProject.state}</b> · {acceptedQualified.length} accepted đủ điều kiện · {accepted.length - acceptedQualified} accepted không đủ điều kiện · {pending.length} pending/observed.</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary btn-sm" onClick={reload} disabled={loading}>{loading ? <RefreshCw size={14} className="spinner" /> : <RefreshCw size={14} />} Tải evidence</button>
          {activeProject.state === 'EVIDENCE_INTAKE' && <button className="btn btn-primary btn-sm" onClick={() => onTransition?.('RESEARCH_ACCEPTED')} disabled={!canAdvance} title={!canAdvance ? 'Cần ít nhất một evidence đủ điều kiện đã được accept.' : undefined} style={{ background: accent }}><CheckCircle2 size={14} /> Chuyển sang Research</button>}
        </div>
      </div>
      {activeProject.state === 'EVIDENCE_INTAKE' && <div style={{ marginTop: '10px', padding: '10px', borderRadius: '8px', background: '#fff7ed', color: '#7c2d12', fontSize: '0.78rem', lineHeight: 1.45 }}>
        <b>Gate này không đánh giá “dữ liệu có nhiều hay ít”.</b> Xray/Cerebro, CSV/HTML Etsy và paste HeyEtsy vẫn dùng được cho phân tích pattern, keyword và draft có kiểm soát. Để chuyển sang Research Accepted, cần ít nhất một record mà <b>server</b> xác nhận đủ điều kiện; UI không thể tự nâng trạng thái.
      </div>}
      {pending.length > 0 && <div style={{ marginTop: '10px', display: 'grid', gap: '8px' }}>{pending.slice(0, 10).map(row => {
        const eligible = row.acceptanceEligibility?.eligible === true;
        const reason = row.acceptanceEligibility?.message || 'Đang tải điều kiện accept từ server.';
        return <div key={row.id} style={{ padding: '10px', borderRadius: '8px', border: `1px solid ${eligible ? '#bbf7d0' : '#fed7aa'}`, background: eligible ? '#f0fdf4' : '#fffaf0', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', fontSize: '0.78rem' }}>
          <div><b>#{row.id} · {row.source} · {row.evidence_state}</b><div style={{ marginTop: '3px', color: eligible ? '#166534' : '#9a3412' }}>{eligible ? 'Có thể được OWNER/MANAGER accept.' : reason}</div></div>
          <button className="btn btn-secondary btn-sm" onClick={() => accept(row.id)} disabled={!eligible || actingId === row.id} title={eligible ? 'Yêu cầu server accept record này.' : reason}>{actingId === row.id ? 'Đang accept…' : eligible ? 'Accept evidence' : 'Không đủ điều kiện'}</button>
        </div>;
      })}</div>}
      {activeProject.state === 'EVIDENCE_INTAKE' && !canAdvance && <div style={{ marginTop: '10px', color: '#92400e', fontSize: '0.78rem' }}><CircleAlert size={14} style={{ verticalAlign: 'middle', marginRight: '5px' }} />Bước kế tiếp: đọc lý do cạnh từng record. Nếu là MCP `PARTIAL_EVIDENCE`, retry khi provider trả retrieval hoàn chỉnh; nếu là staff file/paste, dùng nó cho analysis chứ không cố accept.</div>}
    </section>
  );
}
