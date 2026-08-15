import React, { useState, useEffect } from 'react';
import { 
  Users, Search, UploadCloud, FileSpreadsheet, Sparkles, CheckSquare, 
  Square, ArrowRight, DollarSign, Eye, ShoppingCart, Heart, ShieldCheck, 
  Zap, ExternalLink, RefreshCw, Award
} from 'lucide-react';

export default function EtsyMultiSellerScanner({ seedPhrase, category, onShowToast }) {
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [learning, setLearning] = useState(false);
  const [synthesizedResult, setSynthesizedResult] = useState(null);
  const [searchUrl, setSearchUrl] = useState('');

  const scanSellers = async () => {
    setLoading(true);
    setSynthesizedResult(null);
    try {
      const res = await fetch('http://localhost:3001/api/etsy/scan-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seedPhrase: seedPhrase || 'nurse sweatshirt'
        })
      });
      const data = await res.json();
      if (data.sellers) {
        setSellers(data.sellers);
        if (onShowToast) onShowToast(`Đã quét thấy ${data.sellers.length} top sellers cho "${seedPhrase}"!`);
      }
    } catch (e) {
      if (onShowToast) onShowToast(`Lỗi quét sellers: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    scanSellers();
  }, [seedPhrase]);

  const toggleSeller = (id) => {
    setSellers(prev => prev.map(s => s.id === id ? { ...s, selected: !s.selected } : s));
  };

  const selectAllTop10 = () => {
    setSellers(prev => prev.map((s, idx) => ({ ...s, selected: idx < 10 })));
  };

  const handleBatchLearn = async () => {
    const selected = sellers.filter(s => s.selected);
    if (selected.length === 0) {
      if (onShowToast) onShowToast('Vui lòng chọn ít nhất 3-10 seller để học.');
      return;
    }

    setLearning(true);
    try {
      const res = await fetch('http://localhost:3001/api/etsy/batch-learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seedPhrase,
          category,
          sellers: selected
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to synthesize');

      setSynthesizedResult(data);
      if (onShowToast) onShowToast(`✓ Đã học thành công từ ${data.sellersLearned} top sellers và tạo listing!`);
    } catch (err) {
      if (onShowToast) onShowToast(`Lỗi: ${err.message}`);
    } finally {
      setLearning(false);
    }
  };

  const selectedCount = sellers.filter(s => s.selected).length;

  return (
    <div className="studio-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px', borderLeft: '4px solid #ea580c' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={22} style={{ color: '#ea580c' }} />
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
              Etsy Top Sellers Deep Reverse-Engineer (Học Trực Tiếp Từ 5 - 10 Sellers Bán Tốt Nhất)
            </h3>
          </div>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Quét trang kết quả tìm kiếm Etsy & HeyEtsy, phân tích các chỉ số thực chiến (Tuổi, Views 24h, Favorites, Sold, Quốc gia) để học trực tiếp Title, 13 Tags, và cấu trúc bán hàng.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button 
            onClick={scanSellers}
            disabled={loading}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} className={loading ? 'spinner' : ''} />
            <span>{loading ? 'Đang quét...' : 'Quét Lại Search Page'}</span>
          </button>

          <button 
            onClick={selectAllTop10}
            className="btn btn-secondary btn-sm"
            style={{ fontWeight: 600 }}
          >
            Chọn Top 10 Batch 1
          </button>
        </div>
      </div>

      {/* 30 Sellers 3-Batch Filter Header */}
      <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#c2410c', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Award size={16} />
          <span>Quét 30 Top Sellers (Chia 3 Batch x 10 Sellers):</span>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setSellers(prev => prev.map((s, i) => ({ ...s, selected: i < 10 })))}
            style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, border: '1px solid #fdba74', background: '#ffedd5', color: '#9a3412', cursor: 'pointer' }}
          >
            Batch 1: Revenue Leaders (10 Sellers)
          </button>
          <button
            onClick={() => setSellers(prev => prev.map((s, i) => ({ ...s, selected: i >= 10 && i < 20 })))}
            style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, border: '1px solid #fdba74', background: '#ffedd5', color: '#9a3412', cursor: 'pointer' }}
          >
            Batch 2: Sold Velocity (10 Sellers)
          </button>
          <button
            onClick={() => setSellers(prev => prev.map((s, i) => ({ ...s, selected: i >= 20 })))}
            style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, border: '1px solid #fdba74', background: '#ffedd5', color: '#9a3412', cursor: 'pointer' }}
          >
            Batch 3: Emerging Trends (10 Sellers)
          </button>
        </div>
      </div>


      {/* Sellers Table */}
      <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--border-color, #fed7aa)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#fff7ed', borderBottom: '2px solid #fed7aa', color: '#9a3412' }}>
              <th style={{ padding: '10px 12px', width: '40px' }}>Chọn</th>
              <th style={{ padding: '10px 12px', fontWeight: 700 }}>Tiêu Đề Listing (Title Hook)</th>
              <th style={{ padding: '10px 12px', fontWeight: 700 }}>Shop & Quốc Gia</th>
              <th style={{ padding: '10px 12px', fontWeight: 700 }}>Tuổi</th>
              <th style={{ padding: '10px 12px', fontWeight: 700 }}>Views 24h</th>
              <th style={{ padding: '10px 12px', fontWeight: 700 }}>Favorites</th>
              <th style={{ padding: '10px 12px', fontWeight: 700 }}>Sold 24h</th>
              <th style={{ padding: '10px 12px', fontWeight: 700 }}>Giá Bán</th>
            </tr>
          </thead>
          <tbody>
            {sellers.map((s, idx) => (
              <tr 
                key={s.id} 
                onClick={() => toggleSeller(s.id)}
                style={{ 
                  borderBottom: '1px solid #ffedd5', 
                  background: s.selected ? '#fffbeb' : idx % 2 === 0 ? '#fff' : '#fffaf5',
                  cursor: 'pointer'
                }}
              >
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                  {s.selected ? (
                    <CheckSquare size={16} style={{ color: '#ea580c' }} />
                  ) : (
                    <Square size={16} style={{ color: '#cbd5e1' }} />
                  )}
                </td>
                <td style={{ padding: '10px 12px', fontWeight: 700, color: '#1e293b', maxWidth: '320px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>{s.title}</span>
                    {s.url && (
                      <a href={s.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: '#94a3b8' }}>
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ fontWeight: 600, color: '#475569' }}>{s.shopName}</div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>📍 {s.country}</div>
                </td>
                <td style={{ padding: '10px 12px', color: '#64748b', fontSize: '0.8rem' }}>{s.listingAge}</td>
                <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0369a1' }}>{s.views24h.toLocaleString()}</td>
                <td style={{ padding: '10px 12px', color: '#e11d48', fontWeight: 600 }}>♥ {s.favorites.toLocaleString()}</td>
                <td style={{ padding: '10px 12px', fontWeight: 800, color: '#16a34a' }}>⚡ {s.sold24h}/ngày</td>
                <td style={{ padding: '10px 12px', fontWeight: 700, color: '#b45309' }}>{s.price}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff7ed', padding: '14px 20px', borderRadius: '10px', border: '1px solid #fed7aa', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Award size={18} style={{ color: '#ea580c' }} />
          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#9a3412' }}>
            Đã chọn: <strong style={{ color: '#ea580c', fontSize: '1rem' }}>{selectedCount}</strong> / {sellers.length} Top Sellers để học chuyên sâu
          </span>
        </div>

        <button
          onClick={handleBatchLearn}
          disabled={learning || selectedCount === 0}
          className="btn btn-primary"
          style={{ background: '#ea580c', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 22px' }}
        >
          <Zap size={16} className={learning ? 'spinner' : ''} />
          <span>{learning ? 'Đang phân tích & học từ Top Sellers...' : `🧠 Học Trực Tiếp Từ Batch ${selectedCount} Sellers Này`}</span>
        </button>
      </div>

      {/* Synthesized Output Display */}
      {synthesizedResult && (
        <div style={{ background: '#ffffff', border: '2px solid #ea580c', borderRadius: '12px', padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #ffedd5', paddingBottom: '12px' }}>
            <Sparkles size={20} style={{ color: '#ea580c' }} />
            <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#9a3412' }}>
              ✨ Kết Quả Học Trực Tiếp Từ {synthesizedResult.sellersLearned} Best Sellers:
            </h4>
          </div>

          {/* Key Insights */}
          {synthesizedResult.insights && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
              <div style={{ background: '#fff7ed', padding: '12px 14px', borderRadius: '8px', border: '1px solid #fed7aa' }}>
                <strong style={{ color: '#c2410c', fontSize: '0.8rem', textTransform: 'uppercase' }}>Công Thức Tiêu Đề Đúc Kết:</strong>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#1e293b' }}>{synthesizedResult.insights.titleFormula}</p>
              </div>

              <div style={{ background: '#fff7ed', padding: '12px 14px', borderRadius: '8px', border: '1px solid #fed7aa' }}>
                <strong style={{ color: '#c2410c', fontSize: '0.8rem', textTransform: 'uppercase' }}>Đề Xuất Giá & Vận Chuyển:</strong>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#1e293b' }}>{synthesizedResult.insights.priceRecommendation}</p>
              </div>

              <div style={{ background: '#fff7ed', padding: '12px 14px', borderRadius: '8px', border: '1px solid #fed7aa' }}>
                <strong style={{ color: '#c2410c', fontSize: '0.8rem', textTransform: 'uppercase' }}>Bí Quyết Search Dominance:</strong>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#1e293b' }}>{synthesizedResult.insights.secretSauce}</p>
              </div>
            </div>
          )}

          {/* Title & 13 Tags */}
          <div style={{ background: '#fafafa', padding: '14px 18px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>TIÊU ĐỀ ETSY MỚI (DƯỚI 140 KÝ TỰ):</div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b', marginTop: '4px' }}>
              {synthesizedResult.synthesized.etsyTitle}
            </div>

            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginTop: '14px' }}>13 TAGS TỐI ƯU NHẤT (MỖI TAG &le; 20 KÝ TỰ):</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
              {(synthesizedResult.synthesized.etsyTags || []).map((t, idx) => (
                <span key={idx} style={{ background: '#ffedd5', color: '#9a3412', border: '1px solid #fed7aa', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
                  #{t} ({t.length}/20)
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
