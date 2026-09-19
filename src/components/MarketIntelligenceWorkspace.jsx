import React, { useEffect, useMemo, useState } from 'react';

const badgeStyle = (tone = 'neutral') => ({
  display: 'inline-block',
  padding: '3px 8px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  background: tone === 'good' ? '#dcfce7' : tone === 'warn' ? '#fef3c7' : tone === 'bad' ? '#fee2e2' : '#e2e8f0',
  color: tone === 'good' ? '#166534' : tone === 'warn' ? '#92400e' : tone === 'bad' ? '#991b1b' : '#334155'
});

const decisionOrder = {
  PRIORITY_TEST: 5,
  TEST_CANDIDATE: 4,
  INVESTIGATE: 3,
  WATCH: 2,
  NO_DATA: 1
};

function scoreTone(score) {
  if (score >= 80) return 'good';
  if (score >= 60) return 'warn';
  return 'neutral';
}

function decisionTone(decision) {
  if (decision === 'PRIORITY_TEST') return 'good';
  if (decision === 'TEST_CANDIDATE' || decision === 'INVESTIGATE') return 'warn';
  return 'neutral';
}

function staffAction(decision) {
  const map = {
    NO_DATA: 'Chưa kết luận. Giữ theo dõi và chờ thêm dữ liệu.',
    WATCH: 'Theo dõi tiếp. Chưa cần tạo việc mới.',
    INVESTIGATE: 'Mở nguồn P1/P2, bổ sung bằng chứng thương mại và buyer intent.',
    TEST_CANDIDATE: 'Tóm tắt cơ hội, offer gap và rủi ro để Manager review.',
    PRIORITY_TEST: 'Ưu tiên đưa vào review cho controlled experiment; không tự chạy ads/publish.'
  };
  return map[decision] || 'Kiểm tra nguồn trước khi hành động.';
}

function scoreBreakdown(row) {
  const c = row.scoreComponents || {};
  const p = c.penalties || {};
  const items = [
    ['Commercial', c.commercialIntent],
    ['Marketplace', c.marketplaceProof],
    ['Diversity', c.sourceDiversity],
    ['Velocity', c.trendVelocity],
    ['Recency', c.recency],
    ['VOC', c.vocStrength],
    ['Creative', c.creativeMomentum]
  ].filter(([, value]) => Number.isFinite(value));
  if (!items.length) return 'Chưa có breakdown.';
  const positive = items.map(([label, value]) => `${label} +${value}`).join(' · ');
  return Number(p.total) > 0 ? `${positive} · Penalties -${p.total}` : positive;
}

function Table({ columns, rows, empty = 'Chưa có dữ liệu.' }) {
  return (
    <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12 }}>
      <table style={{ width: '100%', minWidth: 960, borderCollapse: 'collapse', background: '#fff' }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap', background: '#f8fafc' }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} style={{ padding: 18, color: '#64748b' }}>{empty}</td></tr>
          ) : rows.map((row, idx) => (
            <tr key={row.id || row.keyword || row.title || idx}>
              {columns.map((c) => (
                <td key={c.key} style={{ padding: '10px 12px', fontSize: 12, color: '#0f172a', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' }}>
                  {c.render ? c.render(row) : String(row[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GuideCard({ title, children }) {
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, background: '#fff' }}>
      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>{title}</div>
      <div style={{ color: '#475569', fontSize: 12, lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

export default function MarketIntelligenceWorkspace({ onRequireLogin }) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [globalState, setGlobalState] = useState({ loading: true, error: null, candidates: [] });
  const [globalBusy, setGlobalBusy] = useState(null);
  const [globalSummary, setGlobalSummary] = useState(null);
  const [globalImport, setGlobalImport] = useState({ sourceType: 'AUTO', file: null, busy: false, message: '' });

  const loadGlobal = async () => {
    setGlobalState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch('/api/global-opportunities?limit=100', { credentials: 'include', cache: 'no-store' });
      if (res.status === 401) {
        onRequireLogin?.();
        throw new Error('Cần đăng nhập để xem Global Opportunity Pool.');
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || body.error || 'Global Opportunity Pool unavailable');
      setGlobalState({ loading: false, error: null, candidates: body.candidates || [] });
    } catch (error) {
      setGlobalState({ loading: false, error: error.message, candidates: [] });
    }
  };

  const loadGlobalSummary = async () => {
    try {
      const res = await fetch('/api/global-opportunities/summary', { credentials: 'include', cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (res.ok) setGlobalSummary(body.summary || null);
    } catch (_) {}
  };

  const importGlobalFile = async () => {
    if (!globalImport.file || globalImport.busy) return;
    setGlobalImport((prev) => ({ ...prev, busy: true, message: '' }));
    try {
      const form = new FormData();
      form.set('sourceType', globalImport.sourceType);
      form.set('proofTimestamp', new Date().toISOString());
      form.set('file', globalImport.file);
      const res = await fetch('/api/global-opportunities/import-file', {
        method: 'POST', credentials: 'include', body: form
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || body.error || 'Bulk import failed');
      setGlobalImport((prev) => ({
        ...prev, busy: false, file: null,
        message: `Imported ${body.importedCount || 0}/${body.parsedCount || 0} candidates · ${body.sourceFileId?.slice(0, 10) || 'file'}…`
      }));
      await Promise.all([loadGlobal(), loadGlobalSummary()]);
    } catch (error) {
      setGlobalImport((prev) => ({ ...prev, busy: false, message: error.message }));
    }
  };

  const promoteCandidate = async (candidate) => {
    const promotableStatus = ['QUALIFIED', 'PROMOTE_TO_PROJECT'].includes(candidate?.status);
    if (!candidate?.id || candidate.proof_gate !== 'PASS' || !promotableStatus) return;
    const projectName = candidate.cluster_name || candidate.keyword;
    if (!window.confirm(`Tạo Project mới từ opportunity “${projectName}”? Project hiện có sẽ không bị thay đổi.`)) return;
    setGlobalBusy(candidate.id);
    try {
      const res = await fetch(`/api/global-opportunities/${candidate.id}/promote-to-project`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projectName })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || body.error || 'Promotion failed');
      await loadGlobal();
      window.alert(`Đã tạo Project #${body.projectId} ở EVIDENCE_INTAKE. Project cũ không thay đổi.`);
    } catch (error) {
      setGlobalState((prev) => ({ ...prev, error: error.message }));
    } finally {
      setGlobalBusy(null);
    }
  };

  const load = async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch('/api/market-intelligence/dashboard', { credentials: 'include', cache: 'no-store' });
      if (res.status === 401) {
        onRequireLogin?.();
        throw new Error('Cần đăng nhập để xem Market Intelligence.');
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || body.error || 'Market Intelligence unavailable');
      setState({ loading: false, error: null, data: body });
    } catch (error) {
      setState({ loading: false, error: error.message, data: null });
    }
  };

  useEffect(() => { load(); loadGlobal(); loadGlobalSummary(); }, []);

  const listening = state.data?.dashboard?.listening || {};
  const keywords = listening.keywordWatches || [];
  const changes = listening.changes || [];
  const buyerLanguage = listening.buyerLanguage || [];
  const competitorMoves = listening.competitorMoves || [];
  const sourceCoverage = listening.sourceCoverage || [];
  const staffReviews = listening.staffReviews || [];
  const sourceHealthSummary = listening.sourceHealthSummary || {};
  const meta = state.data?.dashboard?.meta || {};

  const sortedKeywords = useMemo(
    () => [...keywords].sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0)),
    [keywords]
  );

  const dailyQueue = useMemo(
    () => [...keywords]
      .filter((k) => (k.status || 'ACTIVE') === 'ACTIVE')
      .sort((a, b) => {
        const decisionDelta = (decisionOrder[b.suggestedDecision] || 0) - (decisionOrder[a.suggestedDecision] || 0);
        if (decisionDelta) return decisionDelta;
        return (b.opportunityScore || 0) - (a.opportunityScore || 0);
      })
      .slice(0, 5),
    [keywords]
  );

  if (state.loading && !state.data) {
    return <div className="card" style={{ marginTop: 24, padding: 24 }}>Đang tải Market Intelligence…</div>;
  }

  return (
    <div style={{ marginTop: 24, display: 'grid', gap: 18 }}>
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 800, letterSpacing: '.08em' }}>RESEARCH-ONLY · READ-ONLY IN OMNISELLER</div>
            <h2 style={{ margin: '6px 0 6px' }}>Market Intelligence — Hướng dẫn Staff</h2>
            <p style={{ margin: 0, color: '#475569', maxWidth: 820, lineHeight: 1.55 }}>
              Công cụ này giúp staff phát hiện cơ hội thị trường sớm từ keyword, marketplace, social commerce,
              buyer language và đối thủ. Mục tiêu là biết <strong>điều gì đáng xem tiếp</strong>, không phải tự động
              kết luận sản phẩm chắc chắn bán được.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={badgeStyle(meta.liveSync ? 'good' : 'warn')}>{meta.liveSync ? 'LIVE SYNC' : 'FALLBACK'}</span>
            <button className="btn btn-secondary btn-sm" onClick={load}>Refresh</button>
            <a className="btn btn-secondary btn-sm" href="https://intel.theglobalserviceteam.site" target="_blank" rel="noreferrer">Mở Intel Console</a>
            <a className="btn btn-secondary btn-sm" href="https://app.notion.com/p/1dd55c3edecf47f7b6f6572e50fadb91" target="_blank" rel="noreferrer">Mở Review Queue</a>
          </div>
        </div>
        {state.error && <div style={{ marginTop: 12, padding: 10, background: '#fee2e2', color: '#991b1b', borderRadius: 8 }}>{state.error}</div>}
      </div>

      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, color: '#7c3aed', fontWeight: 900, letterSpacing: '.08em' }}>GLOBAL DISCOVERY · PRE-PROJECT</div>
            <h3 style={{ margin: '4px 0' }}>Global Opportunity Pool</h3>
            <div style={{ color: '#64748b', fontSize: 12, maxWidth: 860, lineHeight: 1.5 }}>
              Candidate ở đây thuộc workspace + marketplace, chưa thuộc Project và không đi vào MKL/Product Truth.
              Proof-of-sale là gate bắt buộc trước khi tạo Project mới; social/trend-only chỉ được WATCH.
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => { loadGlobal(); loadGlobalSummary(); }} disabled={globalState.loading}>
            {globalState.loading ? 'Đang tải…' : 'Refresh Pool'}
          </button>
        </div>
        {globalState.error && <div style={{ marginTop: 10, padding: 9, background: '#fee2e2', color: '#991b1b', borderRadius: 8 }}>{globalState.error}</div>}
        {globalSummary && (
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: 8 }}>
            {[
              ['Candidates', globalSummary.candidateCount],
              ['Clusters', globalSummary.clusterCount],
              ['Qualified', globalSummary.qualifiedCount],
              ['Watch', globalSummary.watchCount],
              ['Promoted', globalSummary.promotedCount]
            ].map(([label, value]) => (
              <div key={label} style={{ padding: 10, border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 900, marginTop: 2 }}>{value || 0}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 12, padding: 12, border: '1px solid #ddd6fe', background: '#faf5ff', borderRadius: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>Bulk Import — Cerebro / HeyEtsy / YTrend</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={globalImport.sourceType}
              onChange={(e) => setGlobalImport((prev) => ({ ...prev, sourceType: e.target.value }))}
              style={{ padding: '7px 9px', borderRadius: 8, border: '1px solid #cbd5e1' }}
            >
              <option value="AUTO">Auto detect</option>
              <option value="CEREBRO">Cerebro</option>
              <option value="HEYETSY">HeyEtsy</option>
              <option value="YTREND">YTrend</option>
              <option value="GENERIC">Generic CSV/XLSX</option>
            </select>
            <input
              type="file"
              accept=".xlsx,.csv"
              onChange={(e) => setGlobalImport((prev) => ({ ...prev, file: e.target.files?.[0] || null, message: '' }))}
            />
            <button className="btn btn-primary btn-sm" onClick={importGlobalFile} disabled={!globalImport.file || globalImport.busy}>
              {globalImport.busy ? 'Đang import…' : 'Import to Global Pool'}
            </button>
            <a className="btn btn-secondary btn-sm" href="/api/global-opportunities/watchlist?limit=30" target="_blank" rel="noreferrer">
              Watchlist JSON
            </a>
          </div>
          <div style={{ marginTop: 7, color: '#64748b', fontSize: 11 }}>
            XLSX/CSV được parse trong memory. Sales/revenue chỉ được dùng làm proof khi cột đó thực sự tồn tại; trend/social/proxy không được nâng thành sales proof.
          </div>
          {globalImport.message && <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700 }}>{globalImport.message}</div>}
        </div>
        <div style={{ marginTop: 14 }}>
          <Table
            columns={[
              { key: 'keyword', label: 'Candidate / Cluster', render: (r) => <><strong>{r.keyword}</strong><div style={{ color: '#64748b', marginTop: 3 }}>{r.cluster_name || r.cluster_key || 'exact keyword cluster'} · {r.source}</div></> },
              { key: 'opportunity_score', label: 'Global Score', render: (r) => <><span style={badgeStyle(scoreTone(Number(r.opportunity_score) || 0))}>{Number(r.opportunity_score || 0).toFixed(1)}/100</span><div style={{ color: '#64748b', marginTop: 3 }}>{r.score_version || 'GLOBAL_OPPORTUNITY_V1'}</div></> },
              { key: 'proof_gate', label: 'Sales Proof Gate', render: (r) => <><span style={badgeStyle(r.proof_gate === 'PASS' ? 'good' : 'warn')}>{r.proof_gate || 'WATCH_ONLY'}</span><div style={{ color: '#64748b', marginTop: 3 }}>{r.proof_type || 'NONE'}</div></> },
              { key: 'marketplace_proof', label: 'Marketplace / Demand', render: (r) => <div>Proof {Number(r.marketplace_proof || 0).toFixed(1)} · Demand {Number(r.demand || 0).toFixed(1)}<div style={{ color: '#64748b', marginTop: 3 }}>Sales {r.estimated_sales ?? '—'} · Revenue {r.estimated_revenue ?? '—'}</div></div> },
              { key: 'trend_score', label: 'Trend / Social / Cross', render: (r) => <div>Trend {Number(r.trend_score || 0).toFixed(1)} · Social {Number(r.social_score || 0).toFixed(1)}<div style={{ color: '#64748b', marginTop: 3 }}>Cross {Number(r.cross_source_validation || 0).toFixed(1)}</div></div> },
              { key: 'status', label: 'Status', render: (r) => <span style={badgeStyle(r.status === 'PROMOTED' ? 'good' : r.status === 'QUALIFIED' ? 'warn' : 'neutral')}>{r.status}</span> },
              { key: 'action', label: 'Action', render: (r) => {
                if (r.status === 'PROMOTED') {
                  return <div><strong>Project #{r.promoted_project_id}</strong><div style={{ color: '#64748b' }}>đã promote</div></div>;
                }
                const promotable = r.proof_gate === 'PASS' && ['QUALIFIED', 'PROMOTE_TO_PROJECT'].includes(r.status);
                return <button className="btn btn-primary btn-sm" disabled={!promotable || globalBusy === r.id}
                  onClick={() => promoteCandidate(r)}>
                  {r.proof_gate !== 'PASS' ? 'WATCH ONLY'
                    : !promotable ? r.status
                      : globalBusy === r.id ? 'Đang tạo…' : 'Create Project'}
                </button>;
              } }
            ]}
            rows={globalState.candidates}
            empty="Global Candidate Pool chưa có dữ liệu. Import qua Global Opportunity API/bulk pipeline trước."
          />
        </div>
      </div>

      <div className="card" style={{ padding: 18 }}>
        <h3 style={{ marginTop: 0, marginBottom: 4 }}>Hôm nay staff cần làm gì?</h3>
        <div style={{ color: '#64748b', fontSize: 12, marginBottom: 14 }}>
          Mỗi ngày chỉ cần tập trung 3–5 keyword ưu tiên nhất. Không cần đọc toàn bộ dữ liệu.
        </div>
        <Table
          columns={[
            { key: 'keyword', label: 'Ưu tiên hôm nay', render: (r) => <><strong>{r.keyword}</strong><div style={{ color: '#64748b', marginTop: 3 }}>{r.market || 'US'} · {r.language || 'auto'}</div></> },
            { key: 'opportunityScore', label: 'Score / Delta', render: (r) => <><span style={badgeStyle(scoreTone(r.opportunityScore || 0))}>{r.opportunityScore || 0}/100</span><div style={{ color: '#64748b', marginTop: 4 }}>Δ {r.scoreDelta === null || r.scoreDelta === undefined ? 'baseline' : ((r.scoreDelta > 0 ? '+' : '') + r.scoreDelta)}</div></> },
            { key: 'suggestedDecision', label: 'Decision / Gate', render: (r) => <><span style={badgeStyle(decisionTone(r.suggestedDecision))}>{r.suggestedDecision || 'NO_DATA'}</span><div style={{ color: '#64748b', marginTop: 4 }}>{r.experimentGate?.state || 'NOT_READY'}</div></> },
            { key: 'why', label: 'Vì sao?', render: (r) => <div style={{ maxWidth: 360 }}><strong>{scoreBreakdown(r)}</strong><div style={{ color: '#64748b', marginTop: 4 }}>{r.whyChanged || r.decisionRationale || 'Chưa đủ dữ liệu giải thích.'}</div></div> },
            { key: 'staffAction', label: 'Staff nên làm', render: (r) => <div style={{ maxWidth: 340 }}>{staffAction(r.suggestedDecision)}</div> },
            { key: 'sources', label: 'Nguồn nên mở', render: (r) => (r.topSources || []).join(' · ') || 'Chưa có nguồn material' }
          ]}
          rows={dailyQueue}
          empty="Chưa có keyword ACTIVE."
        />
      </div>

      <div className="card" style={{ padding: 18 }}>
        <h3 style={{ marginTop: 0, marginBottom: 4 }}>Staff Intelligence Review Queue</h3>
        <div style={{ color: '#64748b', fontSize: 12, marginBottom: 14 }}>
          Đây là human handoff. OmniSeller chỉ đọc; staff/manager cập nhật disposition tại Review Queue canonical trong Notion.
        </div>
        <Table
          columns={[
            { key: 'keyword', label: 'Keyword', render: (r) => <><strong>{r.keyword}</strong>{r.validationCohort ? <div style={{ color: '#64748b', marginTop: 3 }}>Validation cohort · {r.cohortRole || '—'}</div> : null}</> },
            { key: 'opportunityScore', label: 'Score' },
            { key: 'suggestedDecision', label: 'System Suggestion', render: (r) => <span style={badgeStyle(decisionTone(r.suggestedDecision))}>{r.suggestedDecision || '—'}</span> },
            { key: 'staffDisposition', label: 'Staff', render: (r) => <span style={badgeStyle(r.staffDisposition === 'ESCALATE' ? 'warn' : 'neutral')}>{r.staffDisposition || 'UNREVIEWED'}</span> },
            { key: 'managerReview', label: 'Manager', render: (r) => <span style={badgeStyle(r.managerReview === 'APPROVED_FOR_EXPERIMENT' ? 'good' : r.managerReview === 'PENDING' ? 'warn' : 'neutral')}>{r.managerReview || 'NOT_REQUIRED'}</span> },
            { key: 'experimentGate', label: 'Experiment Gate', render: (r) => <><strong>{r.experimentGate || '—'}</strong><div style={{ color: '#64748b', marginTop: 3, maxWidth: 340 }}>{r.gateReasons || ''}</div></> },
            { key: 'whyNow', label: 'Why now', render: (r) => <div style={{ maxWidth: 380 }}>{r.whyNow || '—'}</div> }
          ]}
          rows={staffReviews}
          empty="Review Queue chưa được sync."
        />
      </div>

      <details className="card" style={{ padding: 18 }} open>
        <summary style={{ cursor: 'pointer', fontWeight: 800, fontSize: 16 }}>📘 Staff Guide — cách dùng tool trong công việc hằng ngày</summary>
        <div style={{ marginTop: 14, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
          <GuideCard title="1. Daily Workflow">
            <strong>Bước 1:</strong> xem Daily Queue. <strong>Bước 2:</strong> mở 3–5 keyword có decision cao nhất.
            <strong> Bước 3:</strong> đọc Sources + Latest Movement + Buyer Language.
            <strong> Bước 4:</strong> chọn NO ACTION / WATCH MORE / INVESTIGATE / ESCALATE TO MANAGER.
          </GuideCard>
          <GuideCard title="2. Đọc Market Opportunity Evidence Score v2">
            Score là <strong>điểm ưu tiên nghiên cứu</strong>, không phải xác suất thành công hay profit score.
            Điểm cộng đến từ Commercial Intent, Marketplace Proof, Source Diversity, Trend Velocity, Recency, VOC và Creative Momentum;
            hệ thống trừ điểm cho saturation rõ ràng, duplicate evidence, trend decay và nguồn yếu.
            0–39: WATCH/NO_DATA · 40–59: INVESTIGATE · 60–79: TEST_CANDIDATE · 80–100: PRIORITY_TEST.
          </GuideCard>
          <GuideCard title="3. Ưu tiên nguồn US ecommerce">
            <strong>P1:</strong> First-party + Marketplace (Amazon evidence owner-export, Etsy, listings/reviews).
            <strong> P2:</strong> TikTok Creative Center, TikTok/Shop, Reddit commercial VOC, Meta Ad Library, competitor/social discovery.
            <strong> P3:</strong> Reviews + Google Trends. <strong>P4:</strong> X/news/reference context.
            CORE cần theo dõi: Amazon evidence, Etsy, TikTok Creative Center, TikTok organic/Shop, Reddit và Meta Ad Library.
          </GuideCard>
          <GuideCard title="4. Guardrails">
            Score cao ≠ chắc chắn bán được. View/engagement ≠ purchase proof. Nhiều listing ≠ opportunity tốt.
            Competitor chạy ads lâu ≠ profitable. Research ≠ Product Truth. Staff không tự đổi giá, chạy ads, approve hay publish từ màn hình này.
          </GuideCard>
        </div>
      </details>

      <div className="card" style={{ padding: 18 }}>
        <h3 style={{ marginTop: 0 }}>US Ecom Source Coverage — hệ thống đang nghe nguồn nào?</h3>
        <div style={{ color: '#64748b', fontSize: 12, marginBottom: 12 }}>
          CORE = Amazon evidence (owner-export only), Etsy, TikTok Creative Center, TikTok organic/Shop, Reddit và Meta Ad Library.
          MISSING nghĩa là hiện chưa có canonical evidence trong hệ thống, không có nghĩa thị trường không có tín hiệu.
          <div style={{ marginTop: 6 }}><strong>Health:</strong> HEALTHY {sourceHealthSummary.HEALTHY || 0} · PARTIAL {sourceHealthSummary.PARTIAL || 0} · STALE {sourceHealthSummary.STALE || 0} · BLOCKED {sourceHealthSummary.BLOCKED || 0} · MISSING {sourceHealthSummary.MISSING || 0}</div>
        </div>
        <Table
          columns={[
            { key: 'priority', label: 'Importance' },
            { key: 'tier', label: 'Tier' },
            { key: 'name', label: 'Source', render: (r) => <><strong>{r.name}</strong><div style={{ color: '#64748b', marginTop: 3 }}>{r.collectorMode || '—'}</div></> },
            { key: 'status', label: 'Coverage / Health / Bridge', render: (r) => <><span style={badgeStyle(r.status === 'OBSERVED' ? 'good' : 'warn')}>{r.status || 'MISSING'}</span><div style={{ color: '#64748b', marginTop: 4 }}><strong>Health:</strong> {r.healthState || 'UNKNOWN'}{Number.isFinite(r.ageHours) ? ' · ' + r.ageHours.toFixed(1) + 'h' : ''}</div><div style={{ color: '#64748b', marginTop: 3, maxWidth: 300 }}>{r.healthReason || ''}</div><div style={{ color: '#64748b', marginTop: 4 }}>{r.connectorState ? 'Bridge: ' + r.connectorState : 'No local bridge required'}</div></> },
            { key: 'signalCount', label: 'Signals' },
            { key: 'lastObservedAt', label: 'Last observed' },
            { key: 'purpose', label: 'Best use' },
            { key: 'constraint', label: 'Constraint' },
            { key: 'nextAction', label: 'Collector action', render: (r) => <div style={{ maxWidth: 360 }}>{r.nextAction || '—'}{r.openUrl ? <div style={{ marginTop: 5 }}><a href={r.openUrl} target="_blank" rel="noreferrer">Open source</a></div> : null}</div> }
          ]}
          rows={sourceCoverage}
          empty="Chưa có source coverage data."
        />
      </div>

      <div className="card" style={{ padding: 18 }}>
        <h3 style={{ marginTop: 0 }}>Keyword Watch & Suggested Decision</h3>
        <div style={{ color: '#64748b', fontSize: 12, marginBottom: 12 }}>
          Dùng bảng này để hiểu keyword đang được theo dõi, evidence đến từ đâu và hệ thống đề xuất bước tiếp theo nào.
        </div>
        <Table
          columns={[
            { key: 'keyword', label: 'Keyword / Query Group', render: (r) => <><strong>{r.keyword}</strong><div style={{ color: '#64748b', marginTop: 3 }}>{r.language || 'auto'} · {r.market || 'US'} · {r.status || 'ACTIVE'}</div><div style={{ color: '#64748b', marginTop: 3 }}>Aliases: {(r.aliases || []).join(', ') || '—'}</div><div style={{ color: '#64748b', marginTop: 3 }}>Exclude: {(r.exclusions || []).join(', ') || '—'}</div></> },
            { key: 'opportunityScore', label: 'Opportunity / Delta', render: (r) => <><span style={badgeStyle(scoreTone(r.opportunityScore || 0))}>{r.opportunityScore || 0}/100</span><div style={{ color: '#64748b', marginTop: 4 }}>Δ {r.scoreDelta === null || r.scoreDelta === undefined ? 'baseline' : ((r.scoreDelta > 0 ? '+' : '') + r.scoreDelta)}</div><div style={{ color: '#64748b', marginTop: 4, minWidth: 220 }}>{scoreBreakdown(r)}</div></> },
            { key: 'suggestedDecision', label: 'Decision / Experiment Gate', render: (r) => <><span style={badgeStyle(decisionTone(r.suggestedDecision))}>{r.suggestedDecision || 'NO_DATA'}</span><div style={{ color: '#64748b', marginTop: 4, maxWidth: 320 }}>{r.experimentGate?.state || 'NOT_READY'}</div><div style={{ color: '#64748b', marginTop: 4, maxWidth: 320 }}>{(r.experimentGate?.reasons || []).join(' ') || r.decisionRationale || '—'}</div></> },
            { key: 'staffAction', label: 'Staff Action', render: (r) => staffAction(r.suggestedDecision) },
            { key: 'signalCount', label: 'Signals' },
            { key: 'commercialSignalCount', label: 'Commercial' },
            { key: 'sourceFamilies', label: 'Source Families', render: (r) => (r.sourceFamilies || []).join(', ') || '—' },
            { key: 'topSources', label: 'Top Sources', render: (r) => (r.topSources || []).join(' · ') || '—' },
            { key: 'lastSignalAt', label: 'Last Signal' }
          ]}
          rows={sortedKeywords}
          empty="Chưa có keyword. Quản lý keyword tại Intel Console."
        />
      </div>

      <div className="card" style={{ padding: 18 }}>
        <h3 style={{ marginTop: 0 }}>Change Detection</h3>
        <Table
          columns={[
            { key: 'detectedAt', label: 'Detected' },
            { key: 'materiality', label: 'Materiality' },
            { key: 'entityType', label: 'Type' },
            { key: 'entityId', label: 'Entity / Field', render: (r) => <><strong>{r.entityId || r.title}</strong><div style={{ color: '#64748b' }}>{r.field || ''}</div></> },
            { key: 'previous', label: 'Before' },
            { key: 'current', label: 'After' },
            { key: 'action', label: 'Action' }
          ]}
          rows={changes}
          empty="Chưa có canonical change record."
        />
      </div>

      <div className="card" style={{ padding: 18 }}>
        <h3 style={{ marginTop: 0 }}>Buyer Language — dùng để hiểu cách khách hàng nói</h3>
        <Table
          columns={[
            { key: 'cluster', label: 'Cluster', render: (r) => <><strong>{r.cluster}</strong><div style={{ color: '#64748b' }}>{r.phrase ? '“' + r.phrase + '”' : ''}</div></> },
            { key: 'evidence', label: 'Evidence Score' },
            { key: 'signalCount', label: 'Signals' },
            { key: 'uniqueSources', label: 'Sources' },
            { key: 'intent', label: 'Intent' },
            { key: 'funnel', label: 'Funnel' },
            { key: 'recommendedUse', label: 'Recommended Use' }
          ]}
          rows={buyerLanguage}
        />
      </div>

      <div className="card" style={{ padding: 18 }}>
        <h3 style={{ marginTop: 0 }}>Competitor Moves — quan sát, không sao chép</h3>
        <Table
          columns={[
            { key: 'name', label: 'Competitor', render: (r) => <strong>{r.name}</strong> },
            { key: 'threat', label: 'Threat' },
            { key: 'position', label: 'Current Offer' },
            { key: 'changed', label: 'What Changed' },
            { key: 'why', label: 'Why It Matters' },
            { key: 'response', label: 'Possible Response' }
          ]}
          rows={competitorMoves}
        />
      </div>
    </div>
  );
}
