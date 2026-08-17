import React, { useState, useEffect } from 'react';
import { Database, Search, ShieldCheck, ShieldAlert, Sparkles, RefreshCw, Zap, Award, Layers, Tag } from 'lucide-react';

export default function MasterKeywordTable({ marketplace = 'AMAZON', keywords: passedKeywords, onShowToast }) {
  const [keywords, setKeywords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTier, setSelectedTier] = useState('ALL');

  const isAmazon = marketplace === 'AMAZON';
  const themeColor = isAmazon ? '#0284c7' : '#ea580c';
  const themeBg = isAmazon ? '#f0f9ff' : '#fff7ed';

  const fetchMasterKeywords = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/master-keywords?marketplace=${marketplace}`, { credentials: 'include' });
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
    if (passedKeywords && Array.isArray(passedKeywords) && passedKeywords.length > 0) {
      setKeywords(passedKeywords);
    } else {
      fetchMasterKeywords();
    }
  }, [marketplace, passedKeywords]);


  const filtered = keywords.filter(k => {
    const matchText = (k.keyword || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                      (k.category || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchText;
  });

  return (
    <div className="studio-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', borderLeft: `4px solid ${themeColor}` }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database size={22} style={{ color: themeColor }} />
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
              {isAmazon ? '🔵 Amazon Master Keyword List (MKL 3-Tier Model)' : '🟠 Etsy Master Tag & Keyword Matrix (13 Tags Model)'}
            </h3>
          </div>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {isAmazon 
              ? 'Từ khóa phân tầng theo thuật toán Amazon A10: 👑 Tier 1 (Title <=75 chars), 💎 Tier 2 (5 Bullets [HOOKS]), 📦 Tier 3 (Backend 240 bytes).'
              : 'Bộ 13 Tags độc lập tuân thủ chính sách Etsy Search: 100% cụm từ đa âm <=20 ký tự, lọc sạch từ cấm IP.'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder={`Tìm từ khóa ${isAmazon ? 'Amazon' : 'Etsy'}...`} 
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
          {loading ? 'Đang tải danh sách từ khóa...' : `Chưa có từ khóa nào trong Master List của ${isAmazon ? 'Amazon' : 'Etsy'}.`}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--border-color, #e2e8f0)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: themeBg, borderBottom: `2px solid ${isAmazon ? '#bae6fd' : '#fed7aa'}`, color: themeColor }}>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>STT</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>{isAmazon ? 'Cụm Từ Khóa (Keyword Phrase)' : 'Etsy Tag (<= 20 ký tự)'}</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Danh Mục</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }} title="Search Volume thực tế từ báo cáo nạp vào">Volume</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }} title="Competing Products Rank thực tế từ báo cáo nạp vào">CPR</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }} title="Opportunity Score tính từ dữ liệu thực, không phải AI đoán">Score</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>{isAmazon ? 'Phân Tầng A10 (MKL Tier)' : 'Loại Tag Etsy'}</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Kiểm Duyệt IP Gate</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Độ Dài</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Ngày Cập Nhật</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, idx) => {
                const len = (item.keyword || '').length;
                let tierBadge = item.tierBadge || '📦 Tier 3 (Backend)';
                let tierColor = '#64748b';
                let tierBg = '#f1f5f9';

                if (isAmazon) {
                  if (tierBadge.includes('Tier 1') || idx < 10) {
                    tierBadge = '👑 Tier 1 (Title Hook)';
                    tierColor = '#0369a1';
                    tierBg = '#e0f2fe';
                  } else if (tierBadge.includes('Tier 2') || idx < 35) {
                    tierBadge = '💎 Tier 2 (5 Bullets)';
                    tierColor = '#7e22ce';
                    tierBg = '#f3e8ff';
                  }
                } else {
                  if (len <= 20) {
                    tierBadge = '🎯 Valid Tag (<=20 chars)';
                    tierColor = '#15803d';
                    tierBg = '#dcfce7';
                  } else {
                    tierBadge = '⚠️ Over 20 chars (Title only)';
                    tierColor = '#b45309';
                    tierBg = '#fef3c7';
                  }
                }


                const isBlocked = item.ipVerdict === 'BLOCK' || (item.ipHits && item.ipHits.length > 0 && item.ipVerdict !== 'OK');
                const isReview = item.ipVerdict === 'REVIEW';
                const isClean = !isBlocked && !isReview;

                return (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle, #f1f5f9)', background: idx % 2 === 0 ? 'transparent' : 'var(--bg-subtle)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-muted)' }}>#{idx + 1}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {item.keyword}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                      {item.category || 'Apparel: Sweatshirt'}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                      {item.volume != null ? item.volume.toLocaleString() : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                      {item.cpr != null ? item.cpr : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                      {item.opportunityScore != null ? Math.round(item.opportunityScore).toLocaleString() : '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px', borderRadius: '20px', background: tierBg, color: tierColor, display: 'inline-block' }}>
                        {tierBadge}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {isClean && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#16a34a', fontWeight: 700, fontSize: '0.75rem' }}>
                          <ShieldCheck size={14} /> ✓ Clean (An Toàn)
                        </span>
                      )}
                      {isReview && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#d97706', fontWeight: 700, fontSize: '0.75rem' }}>
                          <ShieldAlert size={14} /> ⚠️ Xem xét: {item.ipHits?.join(', ')}
                        </span>
                      )}
                      {isBlocked && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#dc2626', fontWeight: 700, fontSize: '0.75rem' }}>
                          <ShieldAlert size={14} /> 🚫 Blocked: {item.ipHits?.join(', ')}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', color: len > 20 && !isAmazon ? '#dc2626' : 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem' }}>
                      {len} chars
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                      {item.discoveredAt ? new Date(item.discoveredAt).toLocaleString() : '—'}
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
