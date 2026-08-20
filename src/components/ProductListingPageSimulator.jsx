import React, { useState, useEffect } from 'react';
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

const emptyChildRow = () => ({ sku: '', variationAttribute: '', childTitle: '', asin: '' });

export default function ProductListingPageSimulator({ currentListing, history = [], onSelectListing, onUpdateListing, onShowToast }) {
  const [platformView, setPlatformView] = useState('AMAZON'); // 'AMAZON' | 'ETSY'
  const [activeListingId, setActiveListingId] = useState(currentListing?.dbId || currentListing?.id || (history[0]?.dbId || history[0]?.id));
  const [activeAsin, setActiveAsin] = useState('parent'); // 'parent' | childIndex

  // Determine active listing
  const activeListing = (history.find(h => (h.dbId || h.id) === activeListingId)) || currentListing || history[0] || null;
  const activeChild = activeAsin !== 'parent' ? (activeListing?.variations || []).find(v => v.childIndex === activeAsin) : null;

  // Variation Plan — Staff-entered planning fields only. No SKU/ASIN is ever
  // generated here; child rows only persist once Staff actually types a SKU,
  // and ASIN stays blank until Amazon really assigns one (owner instruction:
  // never fabricate a fixed 4-variant structure, only offer 4 planning slots).
  const [planParentSku, setPlanParentSku] = useState('');
  const [planParentAsin, setPlanParentAsin] = useState('');
  const [planVariationTheme, setPlanVariationTheme] = useState('');
  const [planRelationshipPlan, setPlanRelationshipPlan] = useState('');
  const [planChildren, setPlanChildren] = useState([emptyChildRow(), emptyChildRow(), emptyChildRow(), emptyChildRow()]);
  const [savingPlan, setSavingPlan] = useState(false);

  useEffect(() => {
    if (!activeListing) return;
    setPlanParentSku(activeListing.parentSku || '');
    setPlanParentAsin(activeListing.parentAsin || '');
    setPlanVariationTheme(activeListing.variationTheme || '');
    setPlanRelationshipPlan(activeListing.relationshipPlan || '');
    const existing = Array.isArray(activeListing.variations) ? activeListing.variations : [];
    setPlanChildren([1, 2, 3, 4].map((childIndex) => {
      const found = existing.find(v => v.childIndex === childIndex);
      return found
        ? { sku: found.sku || '', variationAttribute: found.variationAttribute || '', childTitle: found.childTitle || '', asin: found.asin || '' }
        : emptyChildRow();
    }));
  }, [activeListing?.dbId]);

  const updatePlanChild = (idx, field, value) => {
    setPlanChildren(rows => rows.map((row, i) => i === idx ? { ...row, [field]: value } : row));
  };

  const handleSaveVariationPlan = async () => {
    if (!activeListing?.dbId || !onUpdateListing) return;
    setSavingPlan(true);
    try {
      const variations = planChildren
        .map((row, idx) => ({ childIndex: idx + 1, sku: row.sku.trim(), variationAttribute: row.variationAttribute.trim(), childTitle: row.childTitle.trim(), asin: row.asin.trim() }))
        .filter(row => row.sku); // only rows Staff actually filled in — never pad to 4
      await onUpdateListing({
        ...activeListing,
        parentSku: planParentSku.trim(),
        parentAsin: planParentAsin.trim(),
        variationTheme: planVariationTheme.trim(),
        relationshipPlan: planRelationshipPlan.trim(),
        variations
      });
    } finally {
      setSavingPlan(false);
    }
  };

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
            <span>🔵 Amazon Product Page (Simulation Preview)</span>
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
            <span>🟠 Etsy Shop Page (Simulation Preview)</span>
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

      {/* Staff-facing Variation Plan — planning only, never auto-generated.
          Offers 4 child slots as a form convenience; only rows Staff fills
          in with a real SKU get saved, and ASIN stays blank until Amazon
          actually assigns one (owner decision 2026-08-20). */}
      {platformView === 'AMAZON' && activeListing && (
        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', padding: '14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', fontWeight: 800, color: '#0369a1', fontSize: '0.9rem' }}>
            <Layers size={18} />
            <span>Variation Plan (Parent + tối đa 4 Child SKU) — ASIN chỉ điền khi Amazon đã thực sự assign</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Parent SKU (draft)</label>
              <input className="form-input" style={{ width: '100%', fontSize: '0.82rem' }} value={planParentSku} onChange={(e) => setPlanParentSku(e.target.value)} placeholder="Chưa có" />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Parent ASIN</label>
              <input className="form-input" style={{ width: '100%', fontSize: '0.82rem' }} value={planParentAsin} onChange={(e) => setPlanParentAsin(e.target.value)} placeholder="UNKNOWN — chờ Amazon assign" />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Variation Theme</label>
              <input className="form-input" style={{ width: '100%', fontSize: '0.82rem' }} value={planVariationTheme} onChange={(e) => setPlanVariationTheme(e.target.value)} placeholder="Vd: Size, Color" />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Relationship Plan</label>
              <input className="form-input" style={{ width: '100%', fontSize: '0.82rem' }} value={planRelationshipPlan} onChange={(e) => setPlanRelationshipPlan(e.target.value)} placeholder="Vd: chờ Product Truth xác nhận variant thật" />
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', background: '#ffffff', borderRadius: '8px', overflow: 'hidden' }}>
              <thead>
                <tr style={{ background: '#0284c7', color: '#ffffff', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px' }}>#</th>
                  <th style={{ padding: '8px 12px' }}>SKU</th>
                  <th style={{ padding: '8px 12px' }}>Thuộc Tính Biến Thể</th>
                  <th style={{ padding: '8px 12px' }}>Tiêu Đề</th>
                  <th style={{ padding: '8px 12px' }}>ASIN</th>
                </tr>
              </thead>
              <tbody>
                {planChildren.map((row, idx) => (
                  <tr
                    key={idx}
                    onClick={() => setActiveAsin(idx + 1)}
                    style={{ borderBottom: '1px solid #e2e8f0', cursor: 'pointer', background: activeAsin === idx + 1 ? '#e0f2fe' : 'transparent' }}
                  >
                    <td style={{ padding: '6px 12px', fontWeight: 700, color: '#0284c7' }}>💎 #{idx + 1}</td>
                    <td style={{ padding: '4px 8px' }} onClick={(e) => e.stopPropagation()}>
                      <input className="form-input" style={{ width: '100%', fontSize: '0.8rem' }} value={row.sku} onChange={(e) => updatePlanChild(idx, 'sku', e.target.value)} placeholder="Chưa có" />
                    </td>
                    <td style={{ padding: '4px 8px' }} onClick={(e) => e.stopPropagation()}>
                      <input className="form-input" style={{ width: '100%', fontSize: '0.8rem' }} value={row.variationAttribute} onChange={(e) => updatePlanChild(idx, 'variationAttribute', e.target.value)} placeholder="Vd: Size L" />
                    </td>
                    <td style={{ padding: '4px 8px' }} onClick={(e) => e.stopPropagation()}>
                      <input className="form-input" style={{ width: '100%', fontSize: '0.8rem' }} value={row.childTitle} onChange={(e) => updatePlanChild(idx, 'childTitle', e.target.value)} placeholder="Chưa có" />
                    </td>
                    <td style={{ padding: '4px 8px' }} onClick={(e) => e.stopPropagation()}>
                      <input className="form-input" style={{ width: '100%', fontSize: '0.8rem' }} value={row.asin} onChange={(e) => updatePlanChild(idx, 'asin', e.target.value)} placeholder="UNKNOWN" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={handleSaveVariationPlan}
              disabled={savingPlan || !activeListing?.dbId}
              className="btn btn-primary btn-sm"
              style={{ cursor: (savingPlan || !activeListing?.dbId) ? 'not-allowed' : 'pointer' }}
            >
              {savingPlan ? 'Đang lưu...' : 'Lưu Variation Plan'}
            </button>
          </div>

          {/* Raw copy-paste panel — for pasting directly into Seller Central.
              Was previously gated behind parentSku, which no AI draft ever
              sets, so it was unreachable for every real listing; un-gated now. */}
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
