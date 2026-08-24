import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Database, RefreshCw, ShieldCheck, Sparkles, Tag, Users, Zap } from 'lucide-react';
import { parseJsonResponse } from '../utils/apiResponse';

const STATE_LABELS = {
  RETRIEVED_NO_OBSERVED_AT: 'Retrieved evidence — observation time unknown',
  PARTIAL_EVIDENCE: 'Partial provider evidence',
  INPUT_ONLY_UNVERIFIED: 'Staff input only — unverified'
};

export default function SmartPullAnalyticsBar({ marketplace = 'ETSY', activeProjectId, initialSeed = '', onApplyTags, onShowToast, onProceedToDraft }) {
  const [queryInput, setQueryInput] = useState('');
  const [unitCostInput, setUnitCostInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [intelligence, setIntelligence] = useState(null);
  const activeProjectIdRef = useRef(activeProjectId || null);
  activeProjectIdRef.current = activeProjectId || null;

  useEffect(() => {
    setIntelligence(null);
    setQueryInput(initialSeed || '');
    setLoading(false);
    if (!activeProjectId) return undefined;
    const requestedProjectId = activeProjectId;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/evidence?projectId=${encodeURIComponent(requestedProjectId)}`, { credentials: 'include' });
        const data = await parseJsonResponse(res);
        if (!res.ok || cancelled || activeProjectIdRef.current !== requestedProjectId || Number(data.projectId) !== Number(requestedProjectId)) return;
        const artifact = (data.evidence || []).map(row => {
          try { return { row, metadata: JSON.parse(row.metadata || '{}') }; } catch (_) { return null; }
        }).find(item => item?.metadata?.kind === 'SMART_PULL_ARTIFACT_V1');
        if (artifact?.metadata?.response) setIntelligence(artifact.metadata.response);
      } catch (_) {
        // Reload is optional display restoration; failed reads must not invent a result.
      }
    })();
    return () => { cancelled = true; };
  }, [activeProjectId, initialSeed]);

  const handleSmartPull = async () => {
    if (!activeProjectId) {
      onShowToast?.('Hãy chọn Active Project trước khi dùng Smart Pull.');
      return;
    }
    if (!queryInput.trim()) {
      onShowToast?.('Vui lòng nhập từ khóa, URL tìm kiếm hoặc ASIN.');
      return;
    }
    const requestedProjectId = activeProjectId;
    setLoading(true);
    setIntelligence(null);
    try {
      const res = await fetch('/api/research/smart-pull', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: queryInput.trim(),
          unitCost: unitCostInput === '' ? null : Number(unitCostInput),
          projectId: requestedProjectId
        })
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data.message || data.error || 'SMART_PULL_FAILED');
      if (activeProjectIdRef.current !== requestedProjectId || Number(data.projectId) !== Number(requestedProjectId)) return;
      setIntelligence(data);
      onShowToast?.(`Đã nhận ${data.summary?.totalCompetitorsScanned || 0} records cho project #${requestedProjectId}.`);
    } catch (err) {
      if (activeProjectIdRef.current === requestedProjectId) onShowToast?.(`Smart Pull: ${err.message}`);
    } finally {
      if (activeProjectIdRef.current === requestedProjectId) setLoading(false);
    }
  };

  const tags = intelligence?.tagAnalytics?.selected13Tags || [];
  const economics = intelligence?.priceAnalytics?.economics || {};
  const isAmazonInputOnly = intelligence?.evidenceState === 'INPUT_ONLY_UNVERIFIED';
  const isPartial = intelligence?.evidenceState === 'PARTIAL_EVIDENCE';

  return (
    <section className="studio-panel" style={{ padding: '20px', borderLeft: '4px solid #4f46e5' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={20} /> Project-bound Smart Pull
          </h3>
          <p style={{ margin: '5px 0 0', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
            {marketplace === 'ETSY'
              ? 'Nhập seed hoặc URL Etsy. Hệ thống gọi MCP, lưu artifact theo project, rồi tách dữ liệu quan sát khỏi phrase suy ra.'
              : 'Xác nhận ASIN do staff nhập. Chưa có Amazon live connector.'}
          </p>
        </div>
        <div style={{ fontSize: '0.78rem', fontWeight: 800 }}>
          {activeProjectId ? `Project #${activeProjectId}` : 'Chưa chọn project'}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px auto', gap: '10px', marginTop: '16px' }}>
        <input value={queryInput} onChange={event => setQueryInput(event.target.value)} placeholder={marketplace === 'ETSY' ? 'Etsy search URL hoặc seed phrase' : 'Danh sách ASIN'} />
        <input type="number" min="0" max="100000" step="0.01" value={unitCostInput} onChange={event => setUnitCostInput(event.target.value)} placeholder="Unit cost (optional)" />
        <button className="btn btn-primary" onClick={handleSmartPull} disabled={loading || !activeProjectId || !queryInput.trim()}>
          {loading ? <RefreshCw size={16} className="spinner" /> : <Database size={16} />} {loading ? 'Đang kéo MCP…' : 'Kéo MCP & phân tích'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px', marginTop: '12px', fontSize: '0.75rem' }}>
        <div style={{ padding: '9px', borderRadius: '8px', background: '#eff6ff' }}><b>Input</b><br />Seed/URL + unit cost tùy chọn.</div>
        <div style={{ padding: '9px', borderRadius: '8px', background: '#f0fdf4' }}><b>Output</b><br />Artifact MCP, tags quan sát, phrase suy ra và so sánh giá.</div>
        <div style={{ padding: '9px', borderRadius: '8px', background: '#fff7ed' }}><b>Không làm</b><br />Không tạo Product Truth, không publish, không tự mở Gate.</div>
      </div>

      {intelligence && (
        <div style={{ marginTop: '18px', display: 'grid', gap: '14px' }}>
          <div style={{ padding: '12px', borderRadius: '10px', background: isAmazonInputOnly ? '#fff7ed' : '#eef2ff' }}>
            <strong>{STATE_LABELS[intelligence.evidenceState] || intelligence.evidenceState}</strong>
            <div style={{ fontSize: '0.78rem', marginTop: '4px' }}>
              Provider: {intelligence.provider} · observedAt: {intelligence.observedAt || 'UNKNOWN'} · importedAt: {intelligence.importedAt}
            </div>
            {isPartial && <div style={{ fontSize: '0.78rem', marginTop: '7px', color: '#9a3412' }}><b>Next:</b> dữ liệu provider hiện chưa đủ hoàn chỉnh để accept. Bạn vẫn có thể đọc output phân tích; hãy retry MCP khi cần một record đủ điều kiện Gate.</div>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
            <div><Users size={15} /> Records: <strong>{intelligence.summary?.totalCompetitorsScanned || 0}</strong></div>
            <div><ShieldCheck size={15} /> Tags screened: <strong>{tags.length}</strong></div>
            <div><CheckCircle2 size={15} /> Avg price: <strong>{intelligence.summary?.avgMarketPrice ?? 'UNKNOWN'}</strong></div>
          </div>

          <div style={{ padding: '12px', background: '#fffbeb', borderRadius: '10px' }}>
            <AlertCircle size={15} /> Price minus entered unit cost: <strong>{economics.estimatedPriceMinusUnitCost ?? 'UNKNOWN'}</strong>
            {' · '}Contribution margin: <strong>{economics.estimatedContributionMargin ?? 'UNKNOWN'}{economics.estimatedContributionMargin != null ? '%' : ''}</strong>
            <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>{economics.disclaimer}</div>
            <strong style={{ fontSize: '0.75rem' }}>Không dùng kết quả này để pass Publish Gate.</strong>
          </div>

          {marketplace === 'ETSY' && (
            <div>
              <h4 style={{ margin: '0 0 8px', display: 'flex', gap: '6px', alignItems: 'center' }}><Tag size={16} /> Observed provider tags ({tags.length}/13)</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>{tags.map(tag => <span key={tag} className="badge">{tag}</span>)}</div>
              <details style={{ marginTop: '10px' }}>
                <summary>Derived title phrases ({intelligence.derivedTitlePhrases?.length || 0})</summary>
                <div style={{ fontSize: '0.78rem', marginTop: '6px' }}>{(intelligence.derivedTitlePhrases || []).map(item => item.phrase).join(' · ') || 'None'}</div>
              </details>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            {tags.length > 0 && <button className="btn btn-secondary" onClick={() => onApplyTags?.(tags)}>Apply observed tags</button>}
            <button className="btn btn-primary" onClick={() => onProceedToDraft?.({ seed: intelligence.seedPhrase, tags, intelligence })}>
              <Sparkles size={15} /> Send to controlled draft
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
