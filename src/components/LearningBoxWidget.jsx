import React, { useState, useEffect } from 'react';
import { 
  Brain, Link2, FileText, Sparkles, CheckCircle2, Trash2, RefreshCw, 
  ArrowRight, ShieldCheck, Tag, ExternalLink, Zap
} from 'lucide-react';

export default function LearningBoxWidget({ onShowToast }) {
  const [url, setUrl] = useState('');
  const [rawText, setRawText] = useState('');
  const [inputMode, setInputMode] = useState('url'); // 'url' | 'text'
  const [category, setCategory] = useState('Apparel: Sweatshirt');
  const [marketplace, setMarketplace] = useState('AMAZON');
  const [learning, setLearning] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [activeTemplate, setActiveTemplate] = useState(null);

  const fetchTemplates = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/learning/templates');
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
        if (data.templates?.length > 0 && !activeTemplate) {
          setActiveTemplate(data.templates[0]);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch learned templates', e);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleLearn = async (e) => {
    e.preventDefault();
    if (!url.trim() && !rawText.trim()) return;

    setLearning(true);
    try {
      const res = await fetch('http://localhost:3001/api/learning/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: inputMode === 'url' ? url.trim() : '',
          rawText: inputMode === 'text' ? rawText.trim() : '',
          category,
          marketplace
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to analyze listing');

      setActiveTemplate(data);
      if (onShowToast) onShowToast(`🧠 Đã học thành công cấu trúc DNA từ listing mẫu!`);
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
      await fetch(`http://localhost:3001/api/learning/templates/${id}`, { method: 'DELETE' });
      if (onShowToast) onShowToast('Đã xóa listing mẫu.');
      fetchTemplates();
      if (activeTemplate?.id === id) setActiveTemplate(null);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="studio-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px', borderLeft: '4px solid #8b5cf6' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ background: '#8b5cf6', color: '#fff', padding: '8px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Brain size={22} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Learning Box — Hộp Học Tập Listing Mẫu (Few-Shot DNA)</span>
              <span style={{ fontSize: '0.75rem', background: '#f3e8ff', color: '#7e22ce', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>
                AI Mirror Engine
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Dán link Amazon / Etsy của đối thủ bán chạy (hoặc dán văn bản mẫu) để Omni tự động học văn phong, cấu trúc Bullets, và chính sách shipping.
            </div>
          </div>
        </div>

        {/* Input Mode Toggle */}
        <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-subtle)', padding: '4px', borderRadius: '8px' }}>
          <button
            onClick={() => setInputMode('url')}
            style={{
              background: inputMode === 'url' ? '#8b5cf6' : 'transparent',
              color: inputMode === 'url' ? '#fff' : 'var(--text-secondary)',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Link2 size={13} />
            <span>Dán Link URL</span>
          </button>

          <button
            onClick={() => setInputMode('text')}
            style={{
              background: inputMode === 'text' ? '#8b5cf6' : 'transparent',
              color: inputMode === 'text' ? '#fff' : 'var(--text-secondary)',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <FileText size={13} />
            <span>Dán Văn Bản Mẫu</span>
          </button>
        </div>
      </div>

      {/* Input Form */}
      <form onSubmit={handleLearn} style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: '#faf5ff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e9d5ff' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '260px' }}>
            {inputMode === 'url' ? (
              <input
                type="text"
                className="form-input"
                style={{ background: '#fff' }}
                placeholder="Dán link Amazon (e.g. https://amazon.com/dp/...) hoặc Etsy listing link..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            ) : (
              <textarea
                rows={3}
                className="form-input"
                style={{ background: '#fff' }}
                placeholder="Dán tiêu đề, 5 bullets, mô tả chi tiết sản phẩm mẫu của bạn vào đây..."
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
              />
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select
              className="form-input"
              style={{ background: '#fff', minWidth: '140px' }}
              value={marketplace}
              onChange={(e) => setMarketplace(e.target.value)}
            >
              <option value="AMAZON">🔵 Amazon FBM</option>
              <option value="ETSY">🟠 Etsy Shop</option>
            </select>

            <select
              className="form-input"
              style={{ background: '#fff', minWidth: '160px' }}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="Apparel: Sweatshirt">🧥 Apparel: Sweatshirt</option>
              <option value="Jewelry">✨ Custom Jewelry</option>
              <option value="Acrylic">💡 Custom Acrylic</option>
              <option value="Blanket">🛋️ Blanket</option>
              <option value="Mug">☕ Mug</option>
              <option value="Embroidery">🧵 Embroidery</option>
            </select>

            <button
              type="submit"
              disabled={learning || (!url.trim() && !rawText.trim())}
              className="btn btn-primary"
              style={{ background: '#8b5cf6', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Zap size={16} className={learning ? 'spinner' : ''} />
              <span>{learning ? 'Đang phân tích DNA...' : '🧠 Học Listing Mẫu Này'}</span>
            </button>
          </div>
        </div>
      </form>

      {/* Active Learned DNA Display */}
      {activeTemplate && (
        <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #ddd6fe', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f3e8ff', paddingBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ background: '#8b5cf6', color: '#fff', fontSize: '0.75rem', fontWeight: 800, padding: '3px 8px', borderRadius: '4px' }}>
                ĐANG KÍCH HOẠT (ACTIVE FEW-SHOT)
              </span>
              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b' }}>
                {activeTemplate.title}
              </span>
            </div>
            <span style={{ fontSize: '0.75rem', color: '#7e22ce', fontWeight: 600 }}>
              Sàn: {activeTemplate.marketplace} | Danh mục: {activeTemplate.category}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            <div style={{ background: '#faf5ff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #f3e8ff' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#7e22ce' }}>Mẫu Cấu Trúc Bullet Hooks Học Được:</div>
              <div style={{ fontSize: '0.8rem', color: '#334155', marginTop: '4px' }}>
                {(activeTemplate.styleDna?.bulletHookPatterns || ['[HOOK 1]', '[HOOK 2]']).join(' → ')}
              </div>
            </div>

            <div style={{ background: '#faf5ff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #f3e8ff' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#7e22ce' }}>Tone Văn Phong:</div>
              <div style={{ fontSize: '0.8rem', color: '#334155', marginTop: '4px' }}>
                {activeTemplate.styleDna?.recommendedTone || 'Emotional Craftsmanship'}
              </div>
            </div>

            <div style={{ background: '#faf5ff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #f3e8ff' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#7e22ce' }}>Chính Sách Vận Chuyển Học Được:</div>
              <div style={{ fontSize: '0.8rem', color: '#334155', marginTop: '4px' }}>
                {activeTemplate.styleDna?.shippingPolicyPattern || 'Handmade & Shipped in 24h.'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Previously Learned Templates List */}
      {templates.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Kho Listing Mẫu Đã Lưu ({templates.length}):
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                onClick={() => setActiveTemplate(tpl)}
                style={{
                  background: activeTemplate?.id === tpl.id ? '#f3e8ff' : 'var(--bg-subtle)',
                  border: activeTemplate?.id === tpl.id ? '2px solid #8b5cf6' : '1px solid var(--border-subtle)',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.8rem'
                }}
              >
                <span style={{ fontWeight: 600 }}>{tpl.marketplace === 'AMAZON' ? '🔵' : '🟠'} {tpl.title.slice(0, 30)}...</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteTemplate(tpl.id);
                  }}
                  style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
