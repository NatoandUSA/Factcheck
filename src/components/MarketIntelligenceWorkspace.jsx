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

function Table({ columns, rows, empty = 'No data yet.' }) {
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

export default function MarketIntelligenceWorkspace({ onRequireLogin }) {
  const [state, setState] = useState({ loading: true, error: null, data: null });

  const load = async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch('/api/market-intelligence/dashboard', { credentials: 'include', cache: 'no-store' });
      if (res.status === 401) {
        onRequireLogin?.();
        throw new Error('Sign in required.');
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

  const sortedKeywords = useMemo(() => [...keywords].sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0)), [keywords]);

  if (state.loading && !state.data) {
    return <div className="card" style={{ marginTop: 24, padding: 24 }}>Loading Market Intelligence…</div>;
  }

  return (
    <div style={{ marginTop: 24, display: 'grid', gap: 18 }}>
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 800, letterSpacing: '.08em' }}>RESEARCH-ONLY · READ-ONLY IN OMNISELLER</div>
            <h2 style={{ margin: '6px 0 6px' }}>Market Intelligence</h2>
            <p style={{ margin: 0, color: '#64748b', maxWidth: 780 }}>
              Social listening, keyword watch, opportunity prioritization and competitor change detection. This module cannot mutate Product Truth, approve listings, publish, change prices or scale spend.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={badgeStyle(meta.liveSync ? 'good' : 'warn')}>{meta.liveSync ? 'LIVE SYNC' : 'FALLBACK'}</span>
            <button className="btn btn-secondary btn-sm" onClick={load}>Refresh</button>
            <a className="btn btn-secondary btn-sm" href="https://intel.theglobalserviceteam.site" target="_blank" rel="noreferrer">Open Intel Console</a>
          </div>
        </div>
        {state.error && <div style={{ marginTop: 12, padding: 10, background: '#fee2e2', color: '#991b1b', borderRadius: 8 }}>{state.error}</div>}
      </div>

      <div className="card" style={{ padding: 18 }}>
        <h3 style={{ marginTop: 0 }}>Keyword Watch & Suggested Decision</h3>
        <Table
          columns={[
            { key: 'keyword', label: 'Keyword', render: (r) => <><strong>{r.keyword}</strong><div style={{ color: '#64748b', marginTop: 3 }}>{r.language || 'auto'} · {r.market || 'US'} · {r.status || 'ACTIVE'}</div></> },
            { key: 'opportunityScore', label: 'Opportunity', render: (r) => <span style={badgeStyle(scoreTone(r.opportunityScore || 0))}>{r.opportunityScore || 0}/100</span> },
            { key: 'suggestedDecision', label: 'Suggested Decision', render: (r) => <><span style={badgeStyle(decisionTone(r.suggestedDecision))}>{r.suggestedDecision || 'NO_DATA'}</span><div style={{ color: '#64748b', marginTop: 4, maxWidth: 320 }}>{r.decisionRationale || '—'}</div></> },
            { key: 'signalCount', label: 'Signals' },
            { key: 'commercialSignalCount', label: 'Commercial' },
            { key: 'sourceFamilies', label: 'Source Families', render: (r) => (r.sourceFamilies || []).join(', ') || '—' },
            { key: 'topSources', label: 'Top Sources', render: (r) => (r.topSources || []).join(' · ') || '—' },
            { key: 'lastSignalAt', label: 'Last Signal' }
          ]}
          rows={sortedKeywords}
          empty="No watched keywords yet. Manage keyword watches in the Intel Console."
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
          empty="No canonical changes recorded yet."
        />
      </div>

      <div className="card" style={{ padding: 18 }}>
        <h3 style={{ marginTop: 0 }}>Buyer Language</h3>
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
        <h3 style={{ marginTop: 0 }}>Competitor Moves</h3>
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
