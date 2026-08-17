import React, { useState, useEffect } from 'react';
import { 
  Brain, Link2, FileText, Sparkles, CheckCircle2, Trash2, RefreshCw, 
  ArrowRight, ShieldCheck, Tag, ExternalLink, Zap
} from 'lucide-react';

export default function LearningBoxWidget({ platform = 'AMAZON', onShowToast }) {
  const [url, setUrl] = useState('');
  const [rawText, setRawText] = useState('');
  const [inputMode, setInputMode] = useState('url'); // 'url' | 'text'
  const [category, setCategory] = useState('Apparel: Sweatshirt');
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

  const handleLearn = async (e) => {
    e.preventDefault();
    if (!url.trim() && !rawText.trim()) return;

    setLearning(true);
    try {
      const res = await fetch('/api/learning/analyze', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: inputMode === 'url' ? url.trim() : '',
          rawText: inputMode === 'text' ? rawText.trim() : '',
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
                ? 'Dán link Amazon / ASIN hoặc văn bản đối thủ để Omni học Title Hook 75 chars, 5 Bullets [HOOKS], Search Terms 240 bytes và A+ Content.' 
                : 'Dán link Etsy / Shop text đối thủ để Omni học Title <140 chars, đúng 13 Tags <=20 chars, và Storytelling Description.'}
            </div>
          </div>
        </div>

        {/* Input Mode Toggle */}
        <div style={{ display: 'flex', background: 'var(--bg-subtle)', borderRadius: '8px', padding: '3px', border: '1px solid var(--border-subtle)' }}>
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
            <span>Dán Link {isAmazon ? 'Amazon/ASIN' : 'Etsy Listing'}</span>
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
        </div>
      </div>

      {/* Input Form */}
      <form onSubmit={handleLearn} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {inputMode === 'url' ? (
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="url"
              className="form-input"
              style={{ flex: 1, fontSize: '0.85rem' }}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={isAmazon ? 'https://www.amazon.com/dp/B0... hoặc https://amazon.com/gp/product/...' : 'https://www.etsy.com/listing/123456789/...'}
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
            <span>KHO LISTING MẪU ĐÃ HỌC ({templates.length} MẪU CHO {platform}):</span>
            <span style={{ fontSize: '0.75rem', color: themeColor }}>✓ Tự động áp dụng vào AI khi tạo listing mới</span>
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

      {/* Active Template DNA Preview */}
      {activeTemplate && (
        <div style={{ background: isAmazon ? '#f8fafc' : '#fffaf5', borderRadius: '10px', padding: '14px 18px', border: `1px solid ${isAmazon ? '#bae6fd' : '#fed7aa'}`, fontSize: '0.85rem' }}>
          <div style={{ fontWeight: 800, color: themeColor, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CheckCircle2 size={16} />
            <span>DNA Đang Áp Dụng: "{activeTemplate.title}"</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '8px' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                {isAmazon ? 'CẤU TRÚC 5 BULLET HOOKS MẪU:' : '13 TAGS MẪU:'}
              </div>
              <ul style={{ margin: '4px 0 0 16px', padding: 0, fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                {isAmazon ? (
                  (activeTemplate.bullets || []).slice(0, 4).map((b, i) => (
                    <li key={i}>{b.slice(0, 75)}...</li>
                  ))
                ) : (
                  (activeTemplate.tags || []).slice(0, 6).map((t, i) => (
                    <li key={i}>#{t}</li>
                  ))
                )}
              </ul>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>QUY TẮC THUẬT TOÁN ĐÃ HỌC:</div>
              <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '4px', lineHeight: 1.4 }}>
                {activeTemplate.learnedRulesSummary || activeTemplate.styleDna?.recommendedTone || 'Áp dụng phong cách cảm xúc kết hợp thông số kỹ thuật rõ ràng.'}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
