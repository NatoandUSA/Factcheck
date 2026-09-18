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
  const items = [
    ['Signal', c.volume],
    ['Commercial', c.commercialProximity],
    ['Diversity', c.sourceDiversity],
    ['Purchase', c.purchaseIntent],
    ['Recency', c.recency]
  ].filter(([, value]) => Number.isFinite(value));
  if (!items.length) return 'Chưa có breakdown.';
  return items.map(([label, value]) => `${label} +${value}`).join(' · ');
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

  useEffect(() => { load(); }, []);

  const listening = state.data?.dashboard?.listening || {};
  const keywords = listening.keywordWatches || [];
  const changes = listening.changes || [];
  const buyerLanguage = listening.buyerLanguage || [];
  const competitorMoves = listening.competitorMoves || [];
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
          </div>
        </div>
        {state.error && <div style={{ marginTop: 12, padding: 10, background: '#fee2e2', color: '#991b1b', borderRadius: 8 }}>{state.error}</div>}
      </div>

      <div className="card" style={{ padding: 18 }}>
        <h3 style={{ marginTop: 0, marginBottom: 4 }}>Hôm nay staff cần làm gì?</h3>
        <div style={{ color: '#64748b', fontSize: 12, marginBottom: 14 }}>
          Mỗi ngày chỉ cần tập trung 3–5 keyword ưu tiên nhất. Không cần đọc toàn bộ dữ liệu.
        </div>
        <Table
          columns={[
            { key: 'keyword', label: 'Ưu tiên hôm nay', render: (r) => <><strong>{r.keyword}</strong><div style={{ color: '#64748b', marginTop: 3 }}>{r.market || 'US'} · {r.language || 'auto'}</div></> },
            { key: 'opportunityScore', label: 'Score', render: (r) => <span style={badgeStyle(scoreTone(r.opportunityScore || 0))}>{r.opportunityScore || 0}/100</span> },
            { key: 'suggestedDecision', label: 'Suggested Decision', render: (r) => <span style={badgeStyle(decisionTone(r.suggestedDecision))}>{r.suggestedDecision || 'NO_DATA'}</span> },
            { key: 'why', label: 'Vì sao?', render: (r) => <div style={{ maxWidth: 360 }}><strong>{scoreBreakdown(r)}</strong><div style={{ color: '#64748b', marginTop: 4 }}>{r.decisionRationale || 'Chưa đủ dữ liệu giải thích.'}</div></div> },
            { key: 'staffAction', label: 'Staff nên làm', render: (r) => <div style={{ maxWidth: 340 }}>{staffAction(r.suggestedDecision)}</div> },
            { key: 'sources', label: 'Nguồn nên mở', render: (r) => (r.topSources || []).join(' · ') || 'Chưa có nguồn material' }
          ]}
          rows={dailyQueue}
          empty="Chưa có keyword ACTIVE."
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
          <GuideCard title="2. Đọc Opportunity Score">
            Score là <strong>điểm ưu tiên nghiên cứu</strong>, không phải xác suất thành công.
            0–39: WATCH/NO_DATA · 40–59: INVESTIGATE · 60–79: TEST_CANDIDATE · 80–100: PRIORITY_TEST.
            Luôn mở breakdown và nguồn trước khi kết luận.
          </GuideCard>
          <GuideCard title="3. Ưu tiên nguồn">
            <strong>P1:</strong> First-party + Marketplace/Product listings. <strong>P2:</strong> Social commerce + Competitor storefront.
            <strong> P3:</strong> Reviews/Reddit/Forums/VOC. <strong>P4:</strong> Search/Blog/News/Reference.
            P1/P2 gần hành vi mua hơn P4.
          </GuideCard>
          <GuideCard title="4. Guardrails">
            Score cao ≠ chắc chắn bán được. View/engagement ≠ purchase proof. Nhiều listing ≠ opportunity tốt.
            Competitor chạy ads lâu ≠ profitable. Research ≠ Product Truth. Staff không tự đổi giá, chạy ads, approve hay publish từ màn hình này.
          </GuideCard>
        </div>
      </details>

      <div className="card" style={{ padding: 18 }}>
        <h3 style={{ marginTop: 0 }}>Keyword Watch & Suggested Decision</h3>
        <div style={{ color: '#64748b', fontSize: 12, marginBottom: 12 }}>
          Dùng bảng này để hiểu keyword đang được theo dõi, evidence đến từ đâu và hệ thống đề xuất bước tiếp theo nào.
        </div>
        <Table
          columns={[
            { key: 'keyword', label: 'Keyword', render: (r) => <><strong>{r.keyword}</strong><div style={{ color: '#64748b', marginTop: 3 }}>{r.language || 'auto'} · {r.market || 'US'} · {r.status || 'ACTIVE'}</div></> },
            { key: 'opportunityScore', label: 'Opportunity', render: (r) => <><span style={badgeStyle(scoreTone(r.opportunityScore || 0))}>{r.opportunityScore || 0}/100</span><div style={{ color: '#64748b', marginTop: 4, minWidth: 220 }}>{scoreBreakdown(r)}</div></> },
            { key: 'suggestedDecision', label: 'Suggested Decision', render: (r) => <><span style={badgeStyle(decisionTone(r.suggestedDecision))}>{r.suggestedDecision || 'NO_DATA'}</span><div style={{ color: '#64748b', marginTop: 4, maxWidth: 320 }}>{r.decisionRationale || '—'}</div></> },
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
