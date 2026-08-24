import React, { useState, useEffect } from 'react';
import {
  Brain, Link2, FileText, Sparkles, CheckCircle2, Trash2, RefreshCw,
  ArrowRight, ShieldCheck, Tag, ExternalLink, Zap, Users
} from 'lucide-react';

export default function LearningBoxWidget({ platform = 'AMAZON', onShowToast, scannedSellers = [] }) {
  const [url, setUrl] = useState('');
  const [rawText, setRawText] = useState('');
  const [inputMode, setInputMode] = useState('url'); // 'url' | 'text' | 'seller'
  const [selectedSellerId, setSelectedSellerId] = useState('');
  // The learning source does not establish a product category. Keep the
  // value explicit rather than silently attributing every reference to apparel.
  const [category, setCategory] = useState('UNKNOWN');
  const [learning, setLearning] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [activeTemplate, setActiveTemplate] = useState(null);

  const isAmazon = platform === 'AMAZON';
  const themeColor = isAmazon ? '#0284c7' : '#ea580c';
  const badgeBg = isAmazon ? '#e0f2fe' : '#ffedd5';
  const badgeText = isAmazon ? '#0369a1' : '#c2410c';

  const fetchTemplates = async () => {
    try {
      const res = await fetch(`/api/learning/templates?marketplace=${platform}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const filtered = (data.templates || []).filter(t => (t.marketplace || 'AMAZON').toUpperCase() === platform.toUpperCase());
        setTemplates(filtered);
        if (filtered.length > 0 && !activeTemplate) {
          setActiveTemplate(filtered[0]);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch learned templates', e);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [platform]);

  // The parent workspace owns the active evidence set. Do not restore an
  // unscoped browser cache from another workspace/project/session.
  const effectiveSellers = Array.isArray(scannedSellers) ? scannedSellers : [];
  const selectedSeller = effectiveSellers.find(s => s.id === selectedSellerId || s.asin === selectedSellerId);
  const sellerAsRawText = selectedSeller
    ? (isAmazon
        ? `Title: ${selectedSeller.title || ''}\nASIN: ${selectedSeller.asin || ''}\nPrice: ${selectedSeller.price ?? ''}\nMonthly Sales: ${selectedSeller.sales ?? ''}\nURL: ${selectedSeller.url || ''}`
        : `Title: ${selectedSeller.title}\nShop: ${selectedSeller.shopName || ''} (${selectedSeller.country || ''})\nPrice: ${selectedSeller.price || ''}\nViews 24h: ${selectedSeller.views24h || ''}\nSold 24h: ${selectedSeller.sold24h || ''}\nFavorites: ${selectedSeller.favorites || ''}`)
    : '';

  const handleLearn = async (e) => {
    e.preventDefault();
    if (inputMode === 'url' && !url.trim()) return;
    if (inputMode === 'text' && !rawText.trim()) return;
    if (inputMode === 'seller' && !selectedSeller) return;

    if (isAmazon && inputMode === 'seller') {
      onShowToast?.('Xray đã được nạp ở Stage 1 để benchmark/batch/Cerebro. Một row Xray không có đầy đủ title + bullets + description, nên không gửi nó vào “Học DNA”; hãy dùng Link hoặc Văn bản mẫu đầy đủ khi muốn tạo template cấu trúc.');
      return;
    }

    setLearning(true);
    try {
      const res = await fetch('/api/learning/analyze', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: inputMode === 'url' ? url.trim() : (selectedSeller?.url || ''),
          rawText: inputMode === 'text' ? rawText.trim() : (inputMode === 'seller' ? sellerAsRawText : ''),
          category,
          marketplace: platform
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to analyze listing');

      setActiveTemplate(data);
      if (onShowToast) onShowToast(`🧠 Đã học thành công cấu trúc DNA cho ${platform}!`);
      setUrl('');
      setRawText('');
      setSelectedSellerId('');
      fetchTemplates();
    } catch (err) {
      if (onShowToast) onShowToast(`Lỗi học listing: ${err.message}`);
    } finally {
      setLearning(false);
    }
  };

  const handleDeleteTemplate = async (id) => {
    try {
      await fetch(`/api/learning/templates/${id}`, { method: 'DELETE', credentials: 'include' });
      if (onShowToast) onShowToast('Đã xóa listing mẫu.');
      fetchTemplates();
      if (activeTemplate?.id === id) setActiveTemplate(null);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="studio-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px', borderLeft: `4px solid ${themeColor}` }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ background: themeColor, color: '#fff', padding: '8px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Brain size={22} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>{isAmazon ? '🔵 Amazon Learning Box (Few-Shot A10 DNA)' : '🟠 Etsy Learning Box (Few-Shot Contextual DNA)'}</span>
              <span style={{ fontSize: '0.75rem', background: badgeBg, color: badgeText, padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>
                {isAmazon ? 'Amazon DNA Mirror' : 'Etsy DNA Mirror'}
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {isAmazon 
                ? 'Dán link Amazon/văn bản nguồn, hoặc chọn ASIN từ Xray để làm mẫu DNA. Xray chỉ là staff snapshot: dùng cho cấu trúc tham khảo, không tự thành Product Truth, approval hay publish evidence.'
                : 'Dán link Etsy / Shop text đối thủ để tham chiếu cấu trúc; không tạo Product Truth hay bằng chứng publish.'}
            </div>
          </div>
        </div>

        {/* Input Mode Toggle */}
        <div style={{ display: 'flex', background: 'var(--bg-subtle)', borderRadius: '8px', padding: '3px', border: '1px solid var(--border-subtle)', flexWrap: 'wrap', gap: '2px' }}>
          <button
            type="button"
            onClick={() => setInputMode('url')}
            style={{
              background: inputMode === 'url' ? 'var(--bg-surface)' : 'transparent',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '0.8rem',
              fontWeight: 700,
              color: inputMode === 'url' ? themeColor : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <Link2 size={14} />
            <span>Dán Link {isAmazon ? 'Amazon' : 'Etsy Listing'}</span>
          </button>

          <button
            type="button"
            onClick={() => setInputMode('text')}
            style={{
              background: inputMode === 'text' ? 'var(--bg-surface)' : 'transparent',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '0.8rem',
              fontWeight: 700,
              color: inputMode === 'text' ? themeColor : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <FileText size={14} />
            <span>Dán Văn Bản Mẫu</span>
          </button>

          <button
            type="button"
            onClick={() => setInputMode('seller')}
            style={{
              background: inputMode === 'seller' ? 'var(--bg-surface)' : 'transparent',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '0.8rem',
              fontWeight: 700,
              color: inputMode === 'seller' ? themeColor : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <Users size={14} />
            <span>{isAmazon ? `ASIN Xray tham khảo (${effectiveSellers.length})` : `Chọn Từ Sellers Đã Quét (${effectiveSellers.length})`}</span>
          </button>
        </div>
      </div>

      {/* Input Form */}
      <form onSubmit={handleLearn} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {inputMode === 'seller' ? (
          effectiveSellers.length === 0 ? (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '12px 16px', color: '#92400e', fontSize: '0.85rem' }}>
              ⚠️ Chưa có ASIN Xray trong phiên này. Upload Xray ở Stage 1 hoặc dùng tab <strong>“Dán Link Amazon/ASIN”</strong>. Chuyển stage không yêu cầu upload lại; chỉ đổi project hoặc reload trang mới xóa session snapshot.
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '10px' }}>
              <select
                className="form-input"
                style={{ flex: 1, fontSize: '0.85rem' }}
                value={selectedSellerId}
                onChange={(e) => setSelectedSellerId(e.target.value)}
              >
                <option value="">-- {isAmazon ? 'Chọn 1 ASIN Xray để học cấu trúc (không phải evidence)' : 'Chọn 1 seller đã quét ở Stage 1'} --</option>
                {effectiveSellers.map(s => (
                  <option key={s.id || s.asin} value={s.id || s.asin}>
                    {s.asin ? `[${s.asin}] ` : ''}{s.title ? s.title.slice(0, 55) : 'Amazon Product'} {s.price ? `• ${s.price}` : ''} {s.sales ? `• ${s.sales} sales` : ''}
                  </option>
                ))}
              </select>
              {isAmazon ? (
                <div style={{ minWidth: '210px', padding: '8px 10px', borderRadius: '8px', background: '#eff6ff', color: '#075985', fontSize: '0.74rem', lineHeight: 1.35 }}>
                  <b>Xray benchmark đã nạp.</b><br />Dùng Stage 1 để batch ASIN/Cerebro; cần link hoặc text listing đầy đủ mới học DNA.
                </div>
              ) : (
                <button type="submit" disabled={learning || !selectedSeller} className="btn btn-primary" style={{ background: themeColor, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', minWidth: '140px', justifyContent: 'center' }}>
                  {learning ? <RefreshCw size={15} className="spinner" /> : <Sparkles size={15} />}
                  <span>{learning ? 'Đang phân tích...' : '🧠 Học DNA'}</span>
                </button>
              )}
            </div>
          )
        ) : inputMode === 'url' ? (
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="url"
              className="form-input"
              style={{ flex: 1, fontSize: '0.85rem' }}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={isAmazon ? 'https://www.amazon.com/dp/B0... hoặc https://a.co/...' : 'https://www.etsy.com/listing/123456789/...'}
            />
            <button
              type="submit"
              disabled={learning || !url.trim()}
              className="btn btn-primary"
              style={{ background: themeColor, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', minWidth: '140px', justifyContent: 'center' }}
            >
              {learning ? <RefreshCw size={15} className="spinner" /> : <Sparkles size={15} />}
              <span>{learning ? 'Đang phân tích...' : '🧠 Học DNA'}</span>
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <textarea
              className="form-input"
              rows={4}
              style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={isAmazon 
                ? 'Dán Tiêu đề, 5 Bullet Points, và Mô tả của listing Amazon mẫu...' 
                : 'Dán Tiêu đề, 13 Tags, Mô tả Story, và Hướng dẫn cá nhân hóa của listing Etsy mẫu...'}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                disabled={learning || !rawText.trim()}
                className="btn btn-primary"
                style={{ background: themeColor, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', minWidth: '140px', justifyContent: 'center' }}
              >
                {learning ? <RefreshCw size={15} className="spinner" /> : <Sparkles size={15} />}
                <span>{learning ? 'Đang phân tích...' : '🧠 Học DNA'}</span>
              </button>
            </div>
          </div>
        )}
      </form>

      {/* Learned Templates Library */}
      {templates.length > 0 && (
        <div style={{ marginTop: '6px', borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>KHO THAM CHIẾU ĐÃ HỌC ({templates.length} MẪU CHO {platform}):</span>
            <span style={{ fontSize: '0.75rem', color: themeColor }}>Style reference for drafts only — không phải Product Truth hoặc publish approval</span>
          </div>

          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '6px' }}>
            {templates.map((t) => (
              <div
                key={t.id}
                onClick={() => setActiveTemplate(t)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: activeTemplate?.id === t.id ? (isAmazon ? '#f0f9ff' : '#fff7ed') : 'var(--bg-subtle)',
                  border: activeTemplate?.id === t.id ? `1px solid ${themeColor}` : '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  minWidth: '220px',
                  maxWidth: '280px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <div style={{ fontWeight: 700, color: activeTemplate?.id === t.id ? themeColor : 'var(--text-primary)' }}>
                    {t.title.slice(0, 32)}...
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                    {t.category} • {t.bullets?.length || 0} Bullets • {t.tags?.length || 0} Tags
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(t.id); }}
                  style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
                  title="Xóa mẫu"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Template DNA Preview & Deep Breakdown */}
      {activeTemplate && (
        <div style={{ background: isAmazon ? '#f8fafc' : '#fffaf5', borderRadius: '10px', padding: '16px 20px', border: `1px solid ${isAmazon ? '#bae6fd' : '#fed7aa'}`, fontSize: '0.85rem' }}>
          <div style={{ fontWeight: 800, color: themeColor, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CheckCircle2 size={18} />
            <span>DNA tham chiếu đang review: "{activeTemplate.title}"</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '8px' }}>
            Evidence: {activeTemplate.styleDna?.evidence?.state || activeTemplate.evidenceState || 'UNKNOWN'} • {activeTemplate.styleDna?.evidence?.sourceKind || activeTemplate.sourceKind || 'UNKNOWN SOURCE'} • Không phải Product Truth hay bằng chứng publish.
          </div>

          {isAmazon ? (
            /* Amazon Detailed 5-Tier DNA Breakdown */
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ background: '#fff', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0369a1' }}>👑 TIER 1: TITLE HOOK (≤ 75 KÝ TỰ):</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
                    "{activeTemplate.styleDna?.titleFrontLoadedHook || activeTemplate.title?.slice(0, 75)}"
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                    {activeTemplate.styleDna?.titleHookExplanation || 'Từ khóa hạt nhân + Target Recipient đưa lên đầu cho Mobile App.'}
                  </div>
                </div>

                <div style={{ background: '#fff', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#d97706' }}>💡 TIER 3: ITEM HIGHLIGHTS (≤ 125 CHARS):</div>
                  <div style={{ fontSize: '0.8rem', color: '#1e293b', marginTop: '2px' }}>
                    {activeTemplate.styleDna?.itemHighlights125 || 'Điểm nhấn sản phẩm tóm tắt ngắn gọn'}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                    Hiển thị trên màn hình điện thoại trước khi bấm "See more".
                  </div>
                </div>

                <div style={{ background: '#fff', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569' }}>📦 TIER 2: BACKEND SEARCH TERMS (≤ 249 BYTES):</div>
                  <div style={{ fontSize: '0.78rem', color: '#334155', marginTop: '2px' }}>
                    {activeTemplate.styleDna?.searchTermsRule || '249 Bytes, không dấu phẩy, không lặp từ trong Title'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ background: '#fff', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#7e22ce' }}>💎 TIER 4: 5 BULLET HOOKS MẪU:</div>
                  <ul style={{ margin: '4px 0 0 16px', padding: 0, fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                    {(activeTemplate.bullets || []).slice(0, 5).map((b, i) => (
                      <li key={i} style={{ marginBottom: '2px' }}>{b.slice(0, 80)}...</li>
                    ))}
                  </ul>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '4px' }}>
                    Cấu trúc mở đầu [UPPERCASE HOOK] kích thích tỷ lệ chuyển đổi (CVR).
                  </div>
                </div>

                <div style={{ background: '#fff', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0284c7' }}>✨ TIER 5: A+ CONTENT MODULES:</div>
                  <div style={{ fontSize: '0.78rem', color: '#0369a1', marginTop: '2px' }}>
                    Hero Banner Story • 3 Feature Highlights • Specifications & Unboxing
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Etsy DNA Breakdown */
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '8px' }}>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>13 TAGS MẪU:</div>
                <ul style={{ margin: '4px 0 0 16px', padding: 0, fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                  {(activeTemplate.tags || []).slice(0, 6).map((t, i) => (
                    <li key={i}>#{t}</li>
                  ))}
                </ul>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>QUY TẮC THUẬT TOÁN ĐÃ HỌC:</div>
                <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '4px', lineHeight: 1.4 }}>
                  {activeTemplate.learnedRulesSummary || 'Áp dụng phong cách cảm xúc kết hợp thông số kỹ thuật rõ ràng.'}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
