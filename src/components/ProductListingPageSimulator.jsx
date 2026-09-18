import React, { useState, useEffect } from 'react';
import AmazonRealProductPage from './AmazonRealProductPage';
import EtsyRealProductPage from './EtsyRealProductPage';
import { ShoppingBag, ShoppingCart, Layers, Sparkles, Copy, Check, Gauge, ShieldCheck, AlertTriangle } from 'lucide-react';
import { evaluateDraftQuality } from '../utils/draftQualityEvaluator.js';
import { generateAmazonListingImagePrompts, generateAmazonAPlusImagePrompts, generateEtsyListingImagePrompts } from '../services/imagePromptGenerator.js';

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

function getAssetPlan(listing, marketplace) {
  if (!listing) return { ready: 0, expected: marketplace === 'AMAZON' ? 20 : 12 };
  const canonicalPlan = listing?.canonicalQualityEvidence?.imagePlan;
  if (canonicalPlan && Number(canonicalPlan.expected) >= 0) return canonicalPlan;
  const exactPrompts = listing?.imagePrompts?.prompts || (Array.isArray(listing?.imagePrompts) ? listing.imagePrompts : null);
  if (Array.isArray(exactPrompts)) return {
    ready: exactPrompts.filter(item => item?.ready !== false && String(item?.prompt || '').trim()).length,
    expected: exactPrompts.length
  };
  try {
    const prompts = marketplace === 'AMAZON'
      ? [...generateAmazonListingImagePrompts(listing), ...generateAmazonAPlusImagePrompts(listing)]
      : generateEtsyListingImagePrompts(listing);
    return { ready: prompts.filter(item => String(item?.prompt || '').trim()).length, expected: marketplace === 'AMAZON' ? 20 : 12 };
  } catch (_) {
    return { ready: 0, expected: marketplace === 'AMAZON' ? 20 : 12 };
  }
}

export default function ProductListingPageSimulator({ currentListing, history = [], onSelectListing, onUpdateListing, onShowToast }) {
  const [platformView, setPlatformView] = useState('AMAZON'); // 'AMAZON' | 'ETSY'
  const [activeListingId, setActiveListingId] = useState(currentListing?.dbId || currentListing?.id || (history[0]?.dbId || history[0]?.id));
  const [activeAsin, setActiveAsin] = useState('parent'); // 'parent' | childIndex

  // Determine active listing
  const activeListing = (history.find(h => (h.dbId || h.id) === activeListingId)) || currentListing || history[0] || null;
  const activeChild = activeAsin !== 'parent' ? (activeListing?.variations || []).find(v => v.childIndex === activeAsin) : null;
  const quality = evaluateDraftQuality(activeListing, platformView, getAssetPlan(activeListing, platformView));

  useEffect(() => {
    const exactMarketplace = activeListing?.canonicalQualityEvidence?.marketplace;
    if (['AMAZON', 'ETSY'].includes(exactMarketplace)) setPlatformView(exactMarketplace);
  }, [activeListing?.dbId, activeListing?.canonicalQualityEvidence?.marketplace]);
  const verdictStyle = quality.verdict === 'REVIEW_READY'
    ? { color: '#166534', background: '#dcfce7', border: '#86efac' }
    : quality.verdict === 'BLOCKED'
      ? { color: '#991b1b', background: '#fee2e2', border: '#fca5a5' }
      : { color: '#9a3412', background: '#ffedd5', border: '#fdba74' };

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
      
      <section style={{ background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', borderRadius: '14px', border: '1px solid #dbe3ef', boxShadow: '0 10px 30px rgba(15,23,42,.06)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginRight: '4px' }}>
            <div style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: 10, color: '#fff', background: 'linear-gradient(135deg,#0f172a,#334155)' }}><Sparkles size={17} /></div>
            <div><div style={{ fontWeight: 900, fontSize: '.94rem', color: '#0f172a' }}>Draft Review Studio</div><div style={{ fontSize: '.68rem', color: '#64748b' }}>Simulation Preview · not live</div></div>
          </div>
          <div style={{ display: 'flex', gap: '3px', padding: '3px', borderRadius: '9px', background: '#e2e8f0' }}>
          <button
            onClick={() => setPlatformView('AMAZON')}
            style={{
              padding: '7px 12px', borderRadius: '7px', border: 'none',
              background: platformView === 'AMAZON' ? '#fff' : 'transparent',
              color: platformView === 'AMAZON' ? '#0369a1' : 'var(--text-secondary)',
              fontWeight: 800, fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', boxShadow: platformView === 'AMAZON' ? '0 1px 4px rgba(15,23,42,.12)' : 'none'
            }}
          >
            <ShoppingCart size={15} /><span>Amazon</span>
          </button>
          <button
            onClick={() => setPlatformView('ETSY')}
            style={{
              padding: '7px 12px', borderRadius: '7px', border: 'none',
              background: platformView === 'ETSY' ? '#fff' : 'transparent',
              color: platformView === 'ETSY' ? '#c2410c' : 'var(--text-secondary)',
              fontWeight: 800, fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', boxShadow: platformView === 'ETSY' ? '0 1px 4px rgba(15,23,42,.12)' : 'none'
            }}
          >
            <ShoppingBag size={15} /><span>Etsy</span>
          </button>
        </div>
        {history.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginLeft: 'auto', minWidth: 250 }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b' }}>DRAFT</span>
            <select
              className="form-input"
              style={{ width: '100%', maxWidth: '330px', fontSize: '0.78rem', padding: '7px 10px' }}
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

        <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: 'minmax(190px,.8fr) minmax(360px,2.2fr)', gap: '14px' }}>
          <div style={{ border: `1px solid ${verdictStyle.border}`, background: verdictStyle.background, borderRadius: 12, padding: '13px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.72rem', fontWeight: 900, color: verdictStyle.color }}><Gauge size={15} /> DRAFT QUALITY</span><span style={{ fontSize: '1.45rem', fontWeight: 950, color: verdictStyle.color }}>{quality.score}<small style={{ fontSize: '.68rem' }}>/100</small></span></div>
            <div style={{ marginTop: 6, fontSize: '.82rem', fontWeight: 900, color: verdictStyle.color }}>{quality.verdict.replace('_', ' ')}</div>
            <div style={{ marginTop: 4, fontSize: '.66rem', lineHeight: 1.35, color: '#475569' }}>Điểm hỗ trợ ưu tiên review, không dự báo doanh số và không cấp quyền upload.</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(92px,1fr))', gap: 7 }}>
            {quality.metrics.map(metric => <div key={metric.key} style={{ padding: '9px 10px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff' }}><div style={{ fontSize: '.64rem', color: '#64748b', minHeight: 28 }}>{metric.label}</div><div style={{ fontWeight: 900, fontSize: '.95rem', color: metric.score >= 85 ? '#166534' : metric.score >= 65 ? '#9a3412' : '#991b1b' }}>{metric.score}</div><div style={{ height: 3, borderRadius: 3, background: '#e2e8f0', overflow: 'hidden', marginTop: 5 }}><div style={{ width: `${metric.score}%`, height: '100%', background: metric.score >= 85 ? '#22c55e' : metric.score >= 65 ? '#f59e0b' : '#ef4444' }} /></div></div>)}
          </div>
        </div>
        {(quality.blockers.length > 0 || quality.warnings.length > 0) && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 8, padding: '0 16px 14px' }}>
          {quality.blockers.length > 0 && <details open style={{ border: '1px solid #fecaca', background: '#fff7f7', borderRadius: 9, padding: '8px 10px', fontSize: '.72rem' }}><summary style={{ cursor: 'pointer', color: '#991b1b', fontWeight: 900 }}><ShieldCheck size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} />{quality.blockers.length} blocker phải sửa</summary><ul style={{ margin: '7px 0 0 18px', padding: 0 }}>{quality.blockers.map(item => <li key={item} style={{ marginTop: 3 }}>{item}</li>)}</ul></details>}
          {quality.warnings.length > 0 && <details style={{ border: '1px solid #fed7aa', background: '#fffaf5', borderRadius: 9, padding: '8px 10px', fontSize: '.72rem' }}><summary style={{ cursor: 'pointer', color: '#9a3412', fontWeight: 900 }}><AlertTriangle size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} />{quality.warnings.length} điểm cần QA</summary><ul style={{ margin: '7px 0 0 18px', padding: 0 }}>{quality.warnings.map(item => <li key={item} style={{ marginTop: 3 }}>{item}</li>)}</ul></details>}
        </div>}
      </section>

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
