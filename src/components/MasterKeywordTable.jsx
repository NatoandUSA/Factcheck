import React, { useState, useEffect } from 'react';
import { Database, Search, ShieldCheck, ShieldAlert, Sparkles, RefreshCw, Zap, Award, Layers } from 'lucide-react';

export default function MasterKeywordTable({ marketplace = 'ALL', onShowToast }) {
  const [keywords, setKeywords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTier, setSelectedTier] = useState('ALL');

  const fetchMasterKeywords = async () => {
    try {
      setLoading(true);
      const res = await fetch('http://localhost:3001/api/master-keywords');
      if (res.ok) {
        const data = await res.json();
        setKeywords(data.keywords || []);
      }
    } catch (err) {
      console.error('Failed to fetch master keywords:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMasterKeywords();
  }, []);

  const filtered = keywords.filter(k => {
    const matchText = (k.keyword || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                      (k.category || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchText;
  });

  return (
    <div className="studio-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database size={22} style={{ color: marketplace === 'ETSY' ? '#ea580c' : '#0284c7' }} />
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
              Master Keyword List (MKL) — Kho Từ Khóa & Phân Tầng Thuật Toán
            </h3>
          </div>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Toàn bộ từ khóa đã nạp qua Helium 10 & YTrends MCP kèm phân hạng 👑 Tier 1 (Title), 💎 Tier 2 (Bullets/Tags), 📦 Tier 3 (Backend).
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="Tìm từ khóa hoặc danh mục..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                padding: '6px 12px 6px 30px',
                borderRadius: '8px',
                border: '1px solid var(--border-color, #cbd5e1)',
                fontSize: '0.85rem',
                minWidth: '220px'
              }}
            />
          </div>

          <button 
            onClick={fetchMasterKeywords}
            disabled={loading}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} className={loading ? 'spinner' : ''} />
            <span>{loading ? 'Đang tải...' : 'Tải lại'}</span>
          </button>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '36px 20px', background: 'var(--bg-subtle)', borderRadius: '10px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          {loading ? 'Đang tải danh sách từ khóa...' : 'Chưa có từ khóa nào trong Master Keyword List. Hãy nạp file H10 hoặc bấm Auto-Pull MCP ở trên.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--border-color, #e2e8f0)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>STT</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Cụm Từ Khóa (Keyword Phrase)</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Danh Mục</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Phân Tầng Thuật Toán (MKL Tier)</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Kiểm Duyệt IP Gate</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Thời Gian Nạp</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, idx) => {
                const isTopTier = idx < 3;
                const isMidTier = idx >= 3 && idx < 8;

                return (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-color, #f1f5f9)', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 600 }}>#{idx + 1}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {item.keyword}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ background: '#f0f9ff', color: '#0369a1', padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, border: '1px solid #bae6fd' }}>
                        {item.category || 'General'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        padding: '3px 10px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        background: isTopTier ? '#fef3c7' : isMidTier ? '#e0f2fe' : '#f1f5f9',
                        color: isTopTier ? '#92400e' : isMidTier ? '#0369a1' : '#475569',
                        border: `1px solid ${isTopTier ? '#fde68a' : isMidTier ? '#bae6fd' : '#e2e8f0'}`
                      }}>
                        {isTopTier ? '👑 Tier 1 (Title Hook <= 75 chars)' : isMidTier ? '💎 Tier 2 (5 Bullets & 13 Tags)' : '📦 Tier 3 (Backend Search Terms)'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {item.ipStatus === 'BLOCK' ? (
                        <span style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700, fontSize: '0.75rem' }}>
                          <ShieldAlert size={14} /> BLOCKED (Trademark IP)
                        </span>
                      ) : (
                        <span style={{ color: '#16a34a', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700, fontSize: '0.75rem' }}>
                          <ShieldCheck size={14} /> PASSED (Safe)
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      {item.discoveredAt ? new Date(item.discoveredAt).toLocaleString('vi-VN') : 'Mới nạp'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
