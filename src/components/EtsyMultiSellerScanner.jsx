import React, { useEffect, useMemo, useState } from 'react';
import {
  Users, Sparkles, CheckSquare, Square, Zap, ExternalLink,
  Plus, History, AlertTriangle, ShieldCheck
} from 'lucide-react';

const emptyManualSeller = {
  title: '',
  shopName: '',
  country: '',
  views24h: '',
  sold24h: '',
  favorites: '',
  price: '',
  url: ''
};

function nullableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function displayValue(value, formatter = v => String(v)) {
  return value === null || value === undefined || value === '' ? '—' : formatter(value);
}

export default function EtsyMultiSellerScanner({ seedPhrase, category, onShowToast, onSellersUpdated, onViewHistory }) {
  const [sellers, setSellers] = useState([]);
  const [learning, setLearning] = useState(false);
  const [synthesizedResult, setSynthesizedResult] = useState(null);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualSeller, setManualSeller] = useState(emptyManualSeller);
  const [evidenceMessage, setEvidenceMessage] = useState(
    'Chưa có seller evidence. Live seller connector chưa được chứng minh; hiện dùng Staff manual assertion hoặc raw source qua server API.'
  );

  useEffect(() => {
    setSellers([]);
    setSynthesizedResult(null);
    setEvidenceMessage('Seed đã thay đổi. Cần nạp seller evidence mới; hệ thống không tự tạo Top Seller giả.');
  }, [seedPhrase]);

  useEffect(() => {
    if (onSellersUpdated) onSellersUpdated(sellers);
  }, [sellers, onSellersUpdated]);

  const selectedCount = sellers.filter(s => s.selected).length;
  const sourceCounts = useMemo(() => {
    const counts = {};
    sellers.forEach(s => {
      const source = s.evidenceSource || 'UNKNOWN_SOURCE';
      counts[source] = (counts[source] || 0) + 1;
    });
    return counts;
  }, [sellers]);

  const toggleSeller = (id) => {
    setSellers(prev => prev.map(s => s.id === id ? { ...s, selected: !s.selected } : s));
  };

  const addManualSeller = () => {
    if (!manualSeller.title.trim()) {
      if (onShowToast) onShowToast('Cần nhập Tiêu đề listing đã kiểm tra. Các field còn thiếu có thể để trống/UNKNOWN.');
      return;
    }

    setSellers(prev => [
      ...prev,
      {
        id: `manual-${Date.now()}`,
        title: manualSeller.title.trim(),
        shopName: manualSeller.shopName.trim() || null,
        country: manualSeller.country.trim() || null,
        listingAge: null,
        views24h: nullableNumber(manualSeller.views24h),
        sold24h: nullableNumber(manualSeller.sold24h),
        favorites: nullableNumber(manualSeller.favorites),
        price: manualSeller.price.trim() || null,
        rating: null,
        url: manualSeller.url.trim() || null,
        evidenceSource: 'STAFF_MANUAL_ASSERTION',
        isSynthetic: false,
        selected: true
      }
    ]);
    setManualSeller(emptyManualSeller);
    setShowManualAdd(false);
    setEvidenceMessage('Seller nhập tay được đánh dấu STAFF_MANUAL_ASSERTION; field bỏ trống vẫn UNKNOWN.');
    if (onShowToast) onShowToast('✓ Đã thêm Staff manual assertion. Không có metric nào được tự điền.');
  };

  const handleBatchLearn = async () => {
    const selected = sellers.filter(s => s.selected);
    if (selected.length < 3) {
      if (onShowToast) onShowToast('Cần ít nhất 3 seller/listing evidence rows để tạo SEO recommendation.');
      return;
    }

    setLearning(true);
    try {
      const res = await fetch('/api/etsy/batch-learn', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seedPhrase, category, sellers: selected })
      });
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.error || data.message || 'Failed to synthesize');

      setSynthesizedResult(data);
      if (onShowToast) onShowToast(`✓ Đã tạo SEO recommendation từ ${data.sellersLearned} evidence rows. Product Truth vẫn cần Owner xác nhận.`);
    } catch (err) {
      if (onShowToast) onShowToast(`Lỗi evidence learn: ${err.message}`);
    } finally {
      setLearning(false);
    }
  };

  return (
    <div className="studio-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px', borderLeft: '4px solid #ea580c' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={22} style={{ color: '#ea580c' }} />
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
              Etsy Seller Evidence → SEO Pattern Lab
            </h3>
          </div>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Chỉ học từ evidence có nguồn hoặc Staff assertion. UNKNOWN không bị đổi thành 0. Auto seller scan chưa có nguồn live được chứng minh nên không hiển thị nút giả.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => setShowManualAdd(v => !v)} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={14} /> Thêm Seller Đã Kiểm Tra
          </button>
        </div>
      </div>

      <div style={{ background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: '10px', padding: '12px 14px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
        <AlertTriangle size={18} style={{ color: '#b45309', marginTop: '1px' }} />
        <div>
          <div style={{ fontWeight: 800, color: '#92400e' }}>Evidence state</div>
          <div style={{ fontSize: '0.82rem', color: '#78350f', marginTop: '2px' }}>{evidenceMessage}</div>
          {Object.keys(sourceCounts).length > 0 && (
            <div style={{ marginTop: '6px', fontSize: '0.76rem', color: '#92400e' }}>
              Sources: {Object.entries(sourceCounts).map(([source, count]) => `${source}=${count}`).join(' · ')}
            </div>
          )}
        </div>
      </div>

      {showManualAdd && (
        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#075985' }}>
            Staff manual assertion — chỉ điền field bạn đã kiểm tra; để trống nếu chưa biết.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr', gap: '8px' }}>
            <input className="form-input" placeholder="Tiêu đề listing *" value={manualSeller.title} onChange={e => setManualSeller(p => ({ ...p, title: e.target.value }))} />
            <input className="form-input" placeholder="Tên Shop (optional)" value={manualSeller.shopName} onChange={e => setManualSeller(p => ({ ...p, shopName: e.target.value }))} />
            <input className="form-input" placeholder="Quốc gia (optional)" value={manualSeller.country} onChange={e => setManualSeller(p => ({ ...p, country: e.target.value }))} />
            <input className="form-input" type="number" placeholder="Views 24h (optional)" value={manualSeller.views24h} onChange={e => setManualSeller(p => ({ ...p, views24h: e.target.value }))} />
            <input className="form-input" type="number" placeholder="Sold 24h (optional)" value={manualSeller.sold24h} onChange={e => setManualSeller(p => ({ ...p, sold24h: e.target.value }))} />
            <input className="form-input" type="number" placeholder="Favorites (optional)" value={manualSeller.favorites} onChange={e => setManualSeller(p => ({ ...p, favorites: e.target.value }))} />
            <input className="form-input" placeholder="Giá (optional)" value={manualSeller.price} onChange={e => setManualSeller(p => ({ ...p, price: e.target.value }))} />
            <input className="form-input" placeholder="URL listing (optional)" value={manualSeller.url} onChange={e => setManualSeller(p => ({ ...p, url: e.target.value }))} style={{ gridColumn: 'span 2' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={addManualSeller} className="btn btn-primary btn-sm" style={{ background: '#0284c7' }}>
              Thêm Evidence Row
            </button>
          </div>
        </div>
      )}

      <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--border-color, #fed7aa)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#fff7ed', borderBottom: '2px solid #fed7aa', color: '#9a3412' }}>
              <th style={{ padding: '10px' }}>Chọn</th>
              <th style={{ padding: '10px' }}>Listing title / Source</th>
              <th style={{ padding: '10px' }}>Shop / Country</th>
              <th style={{ padding: '10px' }}>Views 24h</th>
              <th style={{ padding: '10px' }}>Favorites</th>
              <th style={{ padding: '10px' }}>Sold 24h</th>
              <th style={{ padding: '10px' }}>Price</th>
            </tr>
          </thead>
          <tbody>
            {sellers.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '22px', textAlign: 'center', color: '#64748b' }}>
                  Không có seller evidence hợp lệ. Hệ thống không tạo dữ liệu mẫu thay thế.
                </td>
              </tr>
            ) : sellers.map((seller, idx) => (
              <tr key={seller.id || idx} onClick={() => toggleSeller(seller.id)} style={{ borderBottom: '1px solid #ffedd5', background: seller.selected ? '#fffbeb' : '#fff', cursor: 'pointer' }}>
                <td style={{ padding: '10px', textAlign: 'center' }}>
                  {seller.selected ? <CheckSquare size={16} style={{ color: '#ea580c' }} /> : <Square size={16} style={{ color: '#cbd5e1' }} />}
                </td>
                <td style={{ padding: '10px', maxWidth: '340px' }}>
                  <div style={{ fontWeight: 700, color: '#1e293b' }}>
                    {displayValue(seller.title)}
                    {seller.url && (
                      <a href={seller.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ marginLeft: '6px', color: '#94a3b8' }}>
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '3px' }}>
                    {seller.evidenceSource || 'UNKNOWN_SOURCE'}
                  </div>
                </td>
                <td style={{ padding: '10px' }}>
                  <div>{displayValue(seller.shopName)}</div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{displayValue(seller.country)}</div>
                </td>
                <td style={{ padding: '10px' }}>{displayValue(seller.views24h, v => Number(v).toLocaleString())}</td>
                <td style={{ padding: '10px' }}>{displayValue(seller.favorites, v => Number(v).toLocaleString())}</td>
                <td style={{ padding: '10px' }}>{displayValue(seller.sold24h, v => Number(v).toLocaleString())}</td>
                <td style={{ padding: '10px' }}>{displayValue(seller.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff7ed', padding: '14px 18px', borderRadius: '10px', border: '1px solid #fed7aa', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#9a3412' }}>
          Đã chọn {selectedCount} / {sellers.length} evidence rows. Cần tối thiểu 3.
        </div>
        <button onClick={handleBatchLearn} disabled={learning || selectedCount < 3} className="btn btn-primary" style={{ background: '#ea580c', opacity: selectedCount < 3 ? 0.55 : 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Zap size={16} className={learning ? 'spinner' : ''} />
          {learning ? 'Đang phân tích evidence...' : 'Tạo SEO Recommendation Từ Evidence'}
        </button>
      </div>

      {synthesizedResult && (
        <div style={{ background: '#fff', border: '2px solid #ea580c', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#9a3412', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={18} /> SEO Recommendation từ {synthesizedResult.sellersLearned} evidence rows
            </h4>
            {onViewHistory && synthesizedResult.listingId && (
              <button type="button" onClick={onViewHistory} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <History size={13} /> Xem Listing NEEDS_QA
              </button>
            )}
          </div>

          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '11px 12px', color: '#991b1b', fontSize: '0.8rem', display: 'flex', gap: '8px' }}>
            <ShieldCheck size={17} />
            <div>
              <strong>Product Truth chưa được AI xác minh.</strong> Materials, description facts, personalization limits và shipping/processing phải do Owner/Product Truth cung cấp trước publish.
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#64748b' }}>ETSY TITLE RECOMMENDATION</div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b', marginTop: '4px' }}>{displayValue(synthesizedResult.synthesized?.etsyTitle)}</div>
          </div>

          <div>
            <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#64748b' }}>TITLE-DERIVED TAG RECOMMENDATIONS</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
              {(synthesizedResult.synthesized?.etsyTags || []).map((tag, idx) => (
                <span key={idx} style={{ background: '#ffedd5', color: '#9a3412', border: '1px solid #fed7aa', padding: '4px 9px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
                  #{tag}
                </span>
              ))}
            </div>
          </div>

          {synthesizedResult.insights && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
              <div style={{ background: '#f8fafc', padding: '11px', borderRadius: '8px' }}><strong>Title pattern</strong><div style={{ marginTop: '4px', fontSize: '0.82rem' }}>{synthesizedResult.insights.titleFormula}</div></div>
              <div style={{ background: '#f8fafc', padding: '11px', borderRadius: '8px' }}><strong>Price</strong><div style={{ marginTop: '4px', fontSize: '0.82rem' }}>{synthesizedResult.insights.priceRecommendation}</div></div>
              <div style={{ background: '#f8fafc', padding: '11px', borderRadius: '8px' }}><strong>Inference</strong><div style={{ marginTop: '4px', fontSize: '0.82rem' }}>{synthesizedResult.insights.secretSauce}</div></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
