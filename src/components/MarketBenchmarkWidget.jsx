import React, { useState, useEffect } from 'react';
import { 
  Compass, TrendingUp, ShoppingBag, AlertCircle, CheckCircle, XCircle, 
  Sparkles, RefreshCw, ArrowUpRight, HelpCircle, Lightbulb
} from 'lucide-react';

export default function MarketBenchmarkWidget({ seedPhrase, category, onSelectNicheKeyword, onShowToast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchBenchmark = async (query) => {
    const clean = (query || seedPhrase || '').trim();
    if (!clean) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/benchmark/validate?seed=${encodeURIComponent(clean)}&category=${encodeURIComponent(category || '')}`, { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.warn('Failed to fetch market benchmark:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (seedPhrase?.trim()) {
        fetchBenchmark(seedPhrase);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [seedPhrase, category]);

  if (!seedPhrase?.trim()) return null;

  return (
    <div className="studio-panel" style={{
      padding: '20px 24px',
      borderRadius: '16px',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.03)'
    }}>
      
      {/* Header with Title & Quick Refresh */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ background: '#f8fafc', color: '#0f766e', padding: '8px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #ccfbf1' }}>
            <Compass size={20} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Cổng Thẩm Định Thị Trường & Ra Quyết Định (Go / No-Go Gate)</span>
              <span style={{ fontSize: '0.7rem', background: '#ccfbf1', color: '#0f766e', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>
                Live Benchmark 2 Nguồn
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Đối chiếu tự động Google Trends 90 ngày và Gợi ý mua sắm thời gian thực từ Amazon US A9.
            </div>
          </div>
        </div>

        <button
          onClick={() => fetchBenchmark(seedPhrase)}
          disabled={loading}
          className="btn btn-secondary btn-sm"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}
        >
          <RefreshCw size={13} className={loading ? 'spinner' : ''} />
          <span>{loading ? 'Đang thẩm định...' : 'Thẩm định lại'}</span>
        </button>
      </div>

      {/* Main Decision Banner */}
      {data && (
        <div style={{
          background: data.verdictBg || '#f0fdf4',
          border: `1px solid ${data.verdictColor || '#16a34a'}40`,
          borderRadius: '12px',
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px'
        }}>
          {/* Left: Verdict & Advice */}
          <div style={{ flex: 1, minWidth: '280px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <span style={{
                fontSize: '0.85rem',
                fontWeight: 900,
                color: data.verdictColor,
                background: '#fff',
                padding: '4px 12px',
                borderRadius: '20px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.06)'
              }}>
                {data.verdictBadge}
              </span>
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Điểm Tiềm Năng: <span style={{ color: data.verdictColor, fontSize: '1rem' }}>{data.opportunityScore !== null && data.opportunityScore !== undefined ? `${data.opportunityScore}/100` : 'Chưa đủ dữ liệu'}</span>
              </span>
            </div>
            <div style={{ fontSize: '0.85rem', color: '#1e293b', fontWeight: 600, lineHeight: 1.4 }}>
              👉 Khuyến nghị cho Staff: {data.staffAdvice}
            </div>
          </div>

          {/* Right: Key Findings Checklist */}
          <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: '10px', padding: '10px 14px', border: '1px solid rgba(0,0,0,0.05)', maxWidth: '420px', fontSize: '0.78rem' }}>
            <div style={{ fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '4px' }}>CĂN CỨ ĐÁNH GIÁ:</div>
            <ul style={{ margin: 0, paddingLeft: '16px', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {data.keyFindings?.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* 3 Live Benchmark Metric Cards */}
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
          
          {/* Card 1: Google Trends 90-Day Velocity */}
          <div style={{ background: 'var(--bg-subtle)', borderRadius: '10px', padding: '12px 16px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0369a1', textTransform: 'uppercase' }}>
                📈 1. Google Trends 90D
              </span>
              {data.sources.googleTrends?.evidenceState !== 'SOURCE_ERROR' && (
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: data.sources.googleTrends.growth >= 0 ? '#16a34a' : '#dc2626' }}>
                  {data.sources.googleTrends.growth >= 0 ? `+${data.sources.googleTrends.growth}%` : `${data.sources.googleTrends.growth}%`}
                </span>
              )}
            </div>
            {data.sources.googleTrends?.evidenceState === 'SOURCE_ERROR' ? (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Không khả dụng lúc này -- không dùng số liệu giả định.
              </div>
            ) : (
              <>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Trạng thái: {data.sources.googleTrends.status}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Có {data.sources.googleTrends.breakoutCount || 0} cụm từ khóa đột phá liên quan.
                </div>
              </>
            )}
          </div>

          {/* Card 2: Amazon Live A9 Suggestions */}
          <div style={{ background: 'var(--bg-subtle)', borderRadius: '10px', padding: '12px 16px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#d97706', textTransform: 'uppercase' }}>
                🛒 2. Amazon US Live A9 Suggestions
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Người mua đang gõ thật</span>
            </div>
            {data.sources.amazonLiveSuggestions?.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
                {data.sources.amazonLiveSuggestions.map((sug, i) => (
                  <span
                    key={i}
                    onClick={() => onSelectNicheKeyword && onSelectNicheKeyword(sug)}
                    style={{
                      background: '#fff',
                      border: '1px solid #fed7aa',
                      color: '#9a3412',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: onSelectNicheKeyword ? 'pointer' : 'default'
                    }}
                    title={onSelectNicheKeyword ? 'Bấm để dùng làm từ khóa con' : sug}
                  >
                    {sug}
                  </span>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Không khả dụng lúc này -- không dùng gợi ý giả định.
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
