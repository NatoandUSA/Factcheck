import React, { useState } from 'react';
import AmazonRealProductPage from './AmazonRealProductPage';
import EtsyRealProductPage from './EtsyRealProductPage';
import { ShoppingBag, ShoppingCart, Layers, ArrowRight, Sparkles, Copy, Check } from 'lucide-react';

function CopyField({ label, value, onShowToast }) {
  const [copied, setCopied] = useState(false);
  const text = Array.isArray(value) ? value.join('\n') : (value || '');
  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>{label}</span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(text);
            setCopied(true);
            if (onShowToast) onShowToast(`Đã copy ${label}!`);
            setTimeout(() => setCopied(false), 1500);
          }}
          style={{ background: copied ? '#dcfce7' : '#e0f2fe', color: copied ? '#166534' : '#0369a1', border: 'none', borderRadius: '6px', padding: '3px 8px', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? 'Đã copy' : 'Copy'}</span>
        </button>
      </div>
      <div style={{ fontSize: '0.82rem', color: '#1e293b', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text || '—'}</div>
    </div>
  );
}

export default function ProductListingPageSimulator({ currentListing, history = [], onSelectListing, onShowToast }) {
  const [platformView, setPlatformView] = useState('AMAZON'); // 'AMAZON' | 'ETSY'
  const [activeListingId, setActiveListingId] = useState(currentListing?.dbId || currentListing?.id || (history[0]?.dbId || history[0]?.id));
  const [activeAsin, setActiveAsin] = useState('parent'); // 'parent' | childIndex

  // Determine active listing
  const activeListing = (history.find(h => (h.dbId || h.id) === activeListingId)) || currentListing || history[0] || null;
  const activeChild = activeAsin !== 'parent' ? (activeListing?.variations || []).find(v => v.childIndex === activeAsin) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '16px' }}>
      
      {/* Top Header & Platform Switcher Bar */}
      <div style={{
        background: 'var(--bg-surface)',
        borderRadius: '16px',
        padding: '18px 24px',
        border: '1px solid var(--border-subtle)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        boxShadow: 'var(--shadow-sm)'
      }}>
        {/* Left: Platform Switcher */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setPlatformView('AMAZON')}
            style={{
              padding: '10px 20px',
              borderRadius: '10px',
              border: platformView === 'AMAZON' ? '2px solid #0284c7' : '1px solid var(--border-subtle)',
              background: platformView === 'AMAZON' ? '#f0f9ff' : 'var(--bg-subtle)',
              color: platformView === 'AMAZON' ? '#0369a1' : 'var(--text-secondary)',
              fontWeight: 800,
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer'
            }}
          >
            <ShoppingCart size={18} color={platformView === 'AMAZON' ? '#0284c7' : 'currentColor'} />
            <span>🔵 Amazon Product Page (100% Clone)</span>
          </button>

          <button
            onClick={() => setPlatformView('ETSY')}
            style={{
              padding: '10px 20px',
              borderRadius: '10px',
              border: platformView === 'ETSY' ? '2px solid #ea580c' : '1px solid var(--border-subtle)',
              background: platformView === 'ETSY' ? '#fff7ed' : 'var(--bg-subtle)',
              color: platformView === 'ETSY' ? '#c2410c' : 'var(--text-secondary)',
              fontWeight: 800,
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer'
            }}
          >
            <ShoppingBag size={18} color={platformView === 'ETSY' ? '#ea580c' : 'currentColor'} />
            <span>🟠 Etsy Shop Page (100% Clone)</span>
          </button>
        </div>

        {/* Right: Select Active Listing */}
        {history.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Chọn Listing xem thử:</span>
            <select
              className="form-input"
              style={{ maxWidth: '300px', fontSize: '0.85rem', padding: '8px 12px' }}
              value={activeListingId || ''}
              onChange={(e) => setActiveListingId(Number(e.target.value) || e.target.value)}
            >
              {history.map((item) => (
                <option key={item.dbId || item.id} value={item.dbId || item.id}>
                  {item.amazonTitle ? item.amazonTitle.slice(0, 45) + '...' : item.categoryName || 'Listing Draft'}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Staff-facing Multi-ASIN Variations (1 Parent + 4 Child ASINs) */}
      {platformView === 'AMAZON' && activeListing?.parentSku && (
        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', padding: '14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', fontWeight: 800, color: '#0369a1', fontSize: '0.9rem' }}>
            <Layers size={18} />
            <span>Bộ Biến Thể Amazon Multi-ASIN (1 Parent + 4 Child ASINs)</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', background: '#ffffff', borderRadius: '8px', overflow: 'hidden' }}>
              <thead>
                <tr style={{ background: '#0284c7', color: '#ffffff', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px' }}>Loại ASIN</th>
                  <th style={{ padding: '8px 12px' }}>SKU</th>
                  <th style={{ padding: '8px 12px' }}>Thuộc Tính Biến Thể</th>
                  <th style={{ padding: '8px 12px' }}>Tiêu Đề</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  onClick={() => setActiveAsin('parent')}
                  style={{ borderBottom: '1px solid #e2e8f0', cursor: 'pointer', background: activeAsin === 'parent' ? '#e0f2fe' : 'transparent' }}
                >
                  <td style={{ padding: '8px 12px', fontWeight: 800, color: '#0f766e' }}>👑 PARENT</td>
                  <td style={{ padding: '8px 12px', fontWeight: 700, fontFamily: 'monospace' }}>{activeListing.parentSku}</td>
                  <td style={{ padding: '8px 12px', color: '#64748b' }} colSpan={2}>Parent Catalog Anchor (Non-sellable Container)</td>
                </tr>
                {(activeListing.variations || []).map((v) => (
                  <tr
                    key={v.childIndex}
                    onClick={() => setActiveAsin(v.childIndex)}
                    style={{ borderBottom: '1px solid #e2e8f0', cursor: 'pointer', background: activeAsin === v.childIndex ? '#e0f2fe' : 'transparent' }}
                  >
                    <td style={{ padding: '8px 12px', fontWeight: 700, color: '#0284c7' }}>💎 CHILD #{v.childIndex}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 700, fontFamily: 'monospace' }}>{v.sku}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1e293b' }}>{v.variationAttribute}</td>
                    <td style={{ padding: '8px 12px', color: '#334155' }}>{v.childTitle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Raw copy-paste panel for the selected ASIN — for pasting directly into Seller Central */}
          <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px dashed #bae6fd' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0369a1', marginBottom: '8px' }}>
              📋 Raw Data — {activeAsin === 'parent' ? `PARENT (${activeListing.parentSku})` : `CHILD #${activeAsin} (${activeChild?.sku})`}
            </div>
            {activeAsin === 'parent' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <CopyField label="Title" value={activeListing.amazonTitle} onShowToast={onShowToast} />
                <CopyField label="Backend Search Terms" value={activeListing.amazonSearchTerms} onShowToast={onShowToast} />
                <CopyField label="Bullet Points" value={activeListing.amazonBullets} onShowToast={onShowToast} />
                <CopyField label="Description" value={activeListing.amazonDescription} onShowToast={onShowToast} />
                <div style={{ gridColumn: '1 / -1' }}>
                  <CopyField
                    label="A+ Content (Brand Story)"
                    value={activeListing.amazonAPlusContent ? `${activeListing.amazonAPlusContent.brandStoryHeadline}\n\n${activeListing.amazonAPlusContent.brandStoryBody}` : ''}
                    onShowToast={onShowToast}
                  />
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <CopyField label="Title" value={activeChild?.childTitle} onShowToast={onShowToast} />
                <CopyField label="Backend Search Terms" value={activeChild?.childSearchTerms} onShowToast={onShowToast} />
                <CopyField label="Bullet Points" value={activeChild?.childBullets} onShowToast={onShowToast} />
                <CopyField label="Description" value={activeChild?.childDescription} onShowToast={onShowToast} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Render Selected Platform View */}
      {platformView === 'AMAZON' ? (
        <AmazonRealProductPage listing={activeListing} onShowToast={onShowToast} />
      ) : (
        <EtsyRealProductPage listing={activeListing} onShowToast={onShowToast} />
      )}
    </div>
  );
}
