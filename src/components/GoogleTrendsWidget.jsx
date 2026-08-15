import React, { useState, useEffect } from 'react';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip 
} from 'recharts';
import { 
  TrendingUp, Globe, Sparkles, AlertCircle, RefreshCw, Flame, ExternalLink, Activity
} from 'lucide-react';

export default function GoogleTrendsWidget({ seedPhrase, onShowToast }) {
  const [trendsData, setTrendsData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchTrends = async (keyword) => {
    if (!keyword || !keyword.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`http://localhost:3001/api/google-trends?keyword=${encodeURIComponent(keyword.trim())}`);
      if (!res.ok) throw new Error('Không thể lấy dữ liệu Google Trends');
      const data = await res.json();
      setTrendsData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (seedPhrase) {
      fetchTrends(seedPhrase);
    }
  }, [seedPhrase]);

  if (!seedPhrase) return null;

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      borderRadius: '16px',
      padding: '22px 24px',
      color: '#fff',
      boxShadow: '0 8px 24px rgba(15, 23, 42, 0.25)',
      marginBottom: '24px',
      border: '1px solid rgba(255, 255, 255, 0.1)'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ background: '#3b82f6', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Globe size={20} color="#fff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-0.02em' }}>
                Google Trends Cross-Check Engine
              </span>
              <span style={{ fontSize: '0.75rem', background: 'rgba(59, 130, 246, 0.25)', color: '#93c5fd', padding: '2px 8px', borderRadius: '6px', border: '1px solid rgba(59, 130, 246, 0.4)' }}>
                US Real-Time Data
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>
              Đối chiếu nhu cầu thị trường thực tế của Seed Phrase: <strong style={{ color: '#60a5fa' }}>"{seedPhrase}"</strong>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {trendsData?.statusBadge && (
            <span style={{
              background: trendsData.isBreakout ? '#dc2626' : '#2563eb',
              color: '#fff',
              padding: '6px 12px',
              borderRadius: '20px',
              fontWeight: 700,
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              {trendsData.isBreakout ? <Flame size={14} /> : <TrendingUp size={14} />}
              {trendsData.statusBadge}
            </span>
          )}

          <button
            onClick={() => fetchTrends(seedPhrase)}
            disabled={loading}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#fff',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <RefreshCw size={13} className={loading ? 'spinner' : ''} />
            <span>{loading ? 'Đang quét...' : 'Đối chiếu lại'}</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8', fontSize: '0.85rem' }}>
          <RefreshCw size={24} className="spinner" style={{ margin: '0 auto 8px auto', display: 'block', color: '#60a5fa' }} />
          Đang truy vấn tín hiệu tìm kiếm người tiêu dùng từ Google Trends...
        </div>
      ) : error ? (
        <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '12px', borderRadius: '8px', color: '#fca5a5', fontSize: '0.85rem' }}>
          {error}
        </div>
      ) : trendsData ? (
        <div>
          {/* Top Metrics Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Điểm Nhu Cầu Hiện Tại</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#38bdf8', marginTop: '2px' }}>
                {trendsData.currentScore}/100
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Tốc Độ Tăng Trưởng (30d)</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: trendsData.momentumPercent >= 0 ? '#4ade80' : '#f87171', marginTop: '2px' }}>
                {trendsData.momentumPercent >= 0 ? `+${trendsData.momentumPercent}%` : `${trendsData.momentumPercent}%`}
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Đỉnh Mùa Vụ (Peak)</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#facc15', marginTop: '2px' }}>
                {trendsData.peakScore}/100
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Khuyến Nghị Đẩy Rank</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e2e8f0', marginTop: '6px' }}>
                {trendsData.momentumPercent > 30 ? '🚀 Thúc đẩy PPC & Đặt Title ngay' : '⚖️ Tối ưu SEO 13 Tags & Bullets'}
              </div>
            </div>
          </div>

          {/* Sparkline Trend Chart */}
          {trendsData.timeline && trendsData.timeline.length > 0 && (
            <div style={{ height: '140px', width: '100%', marginBottom: '16px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendsData.timeline} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="googleTrendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={10} domain={[0, 100]} />
                  <Tooltip 
                    contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#fff', fontSize: '0.8rem' }}
                    formatter={(val) => [`${val}/100`, 'Interest']}
                  />
                  <Area type="monotone" dataKey="value" stroke="#38bdf8" strokeWidth={2.5} fillOpacity={1} fill="url(#googleTrendGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Related / Rising Queries Cross-Check */}
          {trendsData.relatedQueries && trendsData.relatedQueries.length > 0 && (
            <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '12px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={14} color="#60a5fa" />
                Cụm từ khóa mở rộng bùng nổ trên Google (Khuyên dùng đưa vào Search Terms & 13 Tags):
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {trendsData.relatedQueries.map((item, idx) => (
                  <span
                    key={idx}
                    style={{
                      background: item.type === 'RISING' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                      border: `1px solid ${item.type === 'RISING' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`,
                      color: item.type === 'RISING' ? '#fca5a5' : '#93c5fd',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 600
                    }}
                  >
                    {item.query} <span style={{ opacity: 0.75, fontSize: '0.7rem' }}>({item.value})</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
