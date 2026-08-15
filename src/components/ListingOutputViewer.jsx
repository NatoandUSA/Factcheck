import React, { useState } from 'react';
import { 
  Copy, Check, Download, AlertTriangle, CheckCircle2, 
  Layers, ShoppingBag, Tag, BookmarkPlus, Info, ExternalLink, ShieldAlert, Eye, Bot
} from 'lucide-react';
import { validateAmazonListing, validateEtsyListing } from '../utils/complianceValidator';
import { useAuth } from '../context/AuthContext';
import AmazonPreview from './AmazonPreview';
import EtsyPreview from './EtsyPreview';
import AgentChat from './AgentChat';

export default function ListingOutputViewer({ listing, onSaveListing, onShowToast, onApproveListing, onListingGenerated }) {
  const [activeMarketTab, setActiveMarketTab] = useState('amazon');
  const [viewMode, setViewMode] = useState('raw'); // 'raw' | 'preview'
  const [showChat, setShowChat] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);
  const [activeVarIdx, setActiveVarIdx] = useState(0);
  const { user } = useAuth();


  if (!listing) {
    return (
      <div className="studio-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '520px', textAlign: 'center' }}>
        <div style={{ background: 'var(--bg-subtle)', padding: '24px', borderRadius: '50%', marginBottom: '16px', color: 'var(--text-muted)' }}>
          <Layers size={48} />
        </div>
        <h3 style={{ fontSize: '1.2rem', marginBottom: '6px' }}>Dual Listing Engine Ready</h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', maxWidth: '420px', lineHeight: 1.5 }}>
          Select your product category and click <strong>Generate Dual Listing Package</strong> on the left to produce Amazon FBM bullet points, 249-byte search terms, and 13 Etsy SEO tags.
        </p>
      </div>
    );
  }

  const isBlocked = listing.status === 'IP_RISK_BLOCKED' || listing.ipVerdict === 'BLOCK';
  const isApproved = (listing.status === 'PUBLISH_READY' || listing.status === 'MANAGER_APPROVED') && !isBlocked;
  const isManager = user?.role === 'MANAGER' || user?.role === 'OWNER' || user?.role === 'ADMIN';

  const copyToClipboard = (text, keyName, label = 'Copied to clipboard!') => {
    if (isBlocked) {
      onShowToast('🔴 BLOCKED: Cannot copy IP-flagged listing!');
      return;
    }
    if (!isApproved) {
      onShowToast('⚠️ Cannot copy unapproved or incomplete draft!');
      return;
    }

    navigator.clipboard.writeText(text);
    setCopiedKey(keyName);
    onShowToast(label);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const exportSingleCsv = async () => {
    if (isBlocked) {
      onShowToast('🔴 BLOCKED: Cannot export IP-flagged listing!');
      return;
    }

    try {
      // H7 Fix: Verify Server-Side Authorization & Canonical Publish Gate
      const listingId = listing.dbId || listing.id || 1;
      const res = await fetch(`http://localhost:3001/api/listings/${listingId}/export`);
      const gateData = await res.json();

      if (!res.ok || !gateData.success) {
        onShowToast(`🛑 EXPORT DENIED: ${gateData.error || 'Server Gate Rejected Export'}`);
        return;
      }

      const serverListing = gateData.listing || listing;
      const headers = ['Marketplace', 'Field', 'Content'];
      const rows = [
        ['Amazon', 'Title', `"${(serverListing.amazonTitle || '').replace(/"/g, '""')}"`],
        ['Amazon', 'Bullet 1', `"${(serverListing.amazonBullets?.[0] || '').replace(/"/g, '""')}"`],
        ['Amazon', 'Bullet 2', `"${(serverListing.amazonBullets?.[1] || '').replace(/"/g, '""')}"`],
        ['Amazon', 'Bullet 3', `"${(serverListing.amazonBullets?.[2] || '').replace(/"/g, '""')}"`],
        ['Amazon', 'Bullet 4', `"${(serverListing.amazonBullets?.[3] || '').replace(/"/g, '""')}"`],
        ['Amazon', 'Bullet 5', `"${(serverListing.amazonBullets?.[4] || '').replace(/"/g, '""')}"`],
        ['Amazon', 'Search Terms (249 bytes)', `"${(serverListing.amazonSearchTerms || '').replace(/"/g, '""')}"`],
        ['Amazon', 'Description', `"${(serverListing.amazonDescription || '').replace(/"/g, '""')}"`],
        ['Etsy', 'Title (140 max)', `"${(serverListing.etsyTitle || '').replace(/"/g, '""')}"`],
        ['Etsy', '13 Tags', `"${(serverListing.etsyTags?.join(', ') || '').replace(/"/g, '""')}"`],
        ['Etsy', 'Materials', `"${(serverListing.etsyMaterials?.join(', ') || '').replace(/"/g, '""')}"`],
        ['Etsy', 'Personalization Instructions', `"${(serverListing.etsyPersonalizationInstructions || '').replace(/"/g, '""')}"`],
        ['Etsy', 'Description', `"${(serverListing.etsyDescription || '').replace(/"/g, '""')}"`]
      ];

      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `listing_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      onShowToast('🚀 Server-Authorized Listing exported to CSV!');
    } catch (err) {
      onShowToast(`⚠️ Server Export Error: ${err.message}`);
    }
  };


  return (
    <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', width: '100%' }}>
      {showChat && (
        <div style={{ width: '380px', flexShrink: 0 }}>
          <AgentChat onClose={() => setShowChat(false)} contextListing={listing} onListingGenerated={onListingGenerated} />
        </div>
      )}
      <div className="studio-panel" style={{ flex: 1, minWidth: 0, margin: 0 }}>
      {/* Top Header Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '18px' }}>
        <div className="marketplace-tabs" style={{ marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }}>
          <button
            className={`m-tab-btn amazon ${activeMarketTab === 'amazon' ? 'active' : ''}`}
            onClick={() => setActiveMarketTab('amazon')}
          >
            <span>📦 Amazon FBM View</span>
            {amazonValidation.isValid ? (
              <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />
            ) : (
              <AlertTriangle size={16} style={{ color: 'var(--warning)' }} />
            )}
          </button>

          <button
            className={`m-tab-btn etsy ${activeMarketTab === 'etsy' ? 'active' : ''}`}
            onClick={() => setActiveMarketTab('etsy')}
          >
            <span>🧡 Etsy Shop View</span>
            {etsyValidation.isValid ? (
              <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />
            ) : (
              <AlertTriangle size={16} style={{ color: 'var(--warning)' }} />
            )}
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ background: 'var(--bg-subtle)', padding: '4px', borderRadius: '8px', display: 'flex', gap: '4px', marginRight: '8px' }}>
            <button 
              className={`btn btn-sm ${viewMode === 'raw' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setViewMode('raw')}
              style={{ background: viewMode === 'raw' ? '#fff' : 'transparent', color: viewMode === 'raw' ? '#1e293b' : 'var(--text-muted)', boxShadow: viewMode === 'raw' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', border: 'none' }}
            >
              Raw Data
            </button>
            <button 
              className={`btn btn-sm ${viewMode === 'preview' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setViewMode('preview')}
              style={{ background: viewMode === 'preview' ? '#fff' : 'transparent', color: viewMode === 'preview' ? '#1e293b' : 'var(--text-muted)', boxShadow: viewMode === 'preview' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', border: 'none' }}
            >
              <Eye size={14} style={{ marginRight: '4px' }}/> Live Preview
            </button>
          </div>

          <button className={`btn btn-sm ${showChat ? 'btn-secondary' : 'btn-primary'}`} onClick={() => setShowChat(!showChat)} style={{ background: showChat ? 'transparent' : 'var(--primary)', color: showChat ? 'var(--text-muted)' : '#fff' }}>
            <Bot size={14} />
            <span>AI Co-Pilot</span>
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => onSaveListing(listing)}>
            <BookmarkPlus size={14} />
            <span>Save to Catalog</span>
          </button>
          <button className="btn btn-secondary btn-sm" onClick={exportSingleCsv} disabled={!isApproved} style={{ opacity: isApproved ? 1 : 0.5 }}>
            <Download size={14} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* AMAZON FBM & ETSY TAB HEADER */}
      {/* IP Safety & Opportunity Score Banner */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {/* IP Safety Badge */}
        <div style={{
          flex: '1 1 240px',
          padding: '12px 16px',
          borderRadius: '8px',
          border: '1px solid',
          borderColor: (listing.ipVerdict === 'BLOCK' || listing.status === 'IP_RISK_BLOCKED') ? '#fecaca' : listing.ipVerdict === 'REVIEW' ? '#fde68a' : '#bbf7d0',
          background: (listing.ipVerdict === 'BLOCK' || listing.status === 'IP_RISK_BLOCKED') ? '#fef2f2' : listing.ipVerdict === 'REVIEW' ? '#fffbeb' : '#f0fdf4',
          color: (listing.ipVerdict === 'BLOCK' || listing.status === 'IP_RISK_BLOCKED') ? '#991b1b' : listing.ipVerdict === 'REVIEW' ? '#92400e' : '#166534'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '0.85rem' }}>
            <ShieldAlert size={18} />
            <span>IP Safety Guard: {(listing.ipVerdict === 'BLOCK' || listing.status === 'IP_RISK_BLOCKED') ? '🔴 BLOCKED (Trademark Risk)' : listing.ipVerdict === 'REVIEW' ? '🟡 REVIEW REQUIRED' : '🟢 PASSED (0 Trademark Hits)'}</span>
          </div>
          {Array.isArray(listing.ipHits) && listing.ipHits.length > 0 && (
            <div style={{ marginTop: '6px', fontSize: '0.75rem' }}>
              <strong>Hits: </strong>
              {listing.ipHits.map(h => typeof h === 'string' ? h : `${h.term} (${h.category})`).join(', ')}
            </div>
          )}

        </div>

        {/* Opportunity Score Card */}
        <div style={{
          flex: '1 1 280px',
          padding: '12px 16px',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          background: '#f8fafc',
          display: 'flex',
          alignItems: 'center',
          justify: 'space-between'
        }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Opportunity Score (L0-L4)
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '2px' }}>
              <span style={{ fontSize: '1.4rem', fontWeight: 700, color: typeof listing.opportunityScore === 'number' ? (listing.opportunityScore >= 80 ? '#16a34a' : listing.opportunityScore >= 65 ? '#d97706' : '#dc2626') : '#64748b' }}>
                {typeof listing.opportunityScore === 'number' ? `${listing.opportunityScore}/100` : 'N/A'}
              </span>
              <span style={{
                padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 700,
                background: listing.verdict === 'GO' ? '#dcfce7' : listing.verdict === 'NO_GO' ? '#fee2e2' : '#f1f5f9',
                color: listing.verdict === 'GO' ? '#15803d' : listing.verdict === 'NO_GO' ? '#991b1b' : '#475569'
              }}>
                {listing.verdict || 'UNEVALUATED'}
              </span>
            </div>
          </div>
          <div style={{ fontSize: '0.7rem', color: '#475569', textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div>📈 Demand: <strong>{typeof listing.metrics?.demandScore === 'number' ? `${listing.metrics.demandScore}%` : 'N/A'}</strong></div>
            <div>🥊 Comp Index: <strong>{typeof listing.metrics?.competitionIndex === 'number' ? `${listing.metrics.competitionIndex}%` : 'N/A'}</strong></div>
            <div>🎯 SEO Score: <strong>{typeof listing.metrics?.seoScore === 'number' ? `${listing.metrics.seoScore}%` : 'N/A'}</strong></div>
          </div>

        </div>
      </div>


      {!isApproved && (
        <div style={{ background: listing.status === 'IP_RISK_BLOCKED' ? '#fef2f2' : '#fffbeb', border: listing.status === 'IP_RISK_BLOCKED' ? '1px solid #fecaca' : '1px solid #fde68a', padding: '16px', borderRadius: '8px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: listing.status === 'IP_RISK_BLOCKED' ? '#991b1b' : '#92400e' }}>
            <ShieldAlert size={24} />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{listing.status === 'IP_RISK_BLOCKED' ? '🛑 IP Risk Blocked — Approval Forbidden' : 'Awaiting Manager Approval'}</div>
              <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>{listing.status === 'IP_RISK_BLOCKED' ? 'This draft contains registered trademark terms. Resolve IP hits before approving.' : 'This listing is in DRAFT status. Copying and Exporting are disabled until approved.'}</div>
            </div>
          </div>
          {isManager && (
            <button 
              className="btn btn-primary btn-sm"
              onClick={() => onApproveListing(listing)}
              disabled={listing.status === 'IP_RISK_BLOCKED'}
              style={{ opacity: listing.status === 'IP_RISK_BLOCKED' ? 0.4 : 1, cursor: listing.status === 'IP_RISK_BLOCKED' ? 'not-allowed' : 'pointer' }}
            >
              <CheckCircle2 size={16} />
              <span>Approve Listing</span>
            </button>
          )}
        </div>
      )}

      {listing.systemNote && (
        <div style={{ background: '#fef3c7', padding: '8px 12px', borderRadius: '6px', fontSize: '0.75rem', color: '#92400e', marginBottom: '14px', border: '1px solid #fde68a' }}>
          ℹ️ {listing.systemNote}
        </div>
      )}


      {/* AMAZON FBM TAB */}
      {activeMarketTab === 'amazon' && (
        <div>
          {/* Parent & 4 Child ASIN Variations Switcher Bar */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>
              <Layers size={16} style={{ color: '#d97706' }} />
              <span>Multi-ASIN Variations (1 Parent + 4 Child ASINs):</span>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button
                className={`btn btn-sm ${activeVarIdx === 0 ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveVarIdx(0)}
                style={{ background: activeVarIdx === 0 ? '#0f766e' : '#fff', color: activeVarIdx === 0 ? '#fff' : '#334155', fontWeight: 600, fontSize: '0.75rem', padding: '4px 10px', borderRadius: '6px' }}
              >
                👑 Parent ASIN ({listing.parentSku || 'PARENT'})
              </button>
              {(listing.variations || [
                { childIndex: 1, variationAttribute: 'Gold / S', sku: 'SKU-GOLD-S' },
                { childIndex: 2, variationAttribute: 'Silver / M', sku: 'SKU-SILVER-M' },
                { childIndex: 3, variationAttribute: 'Rose Gold / L', sku: 'SKU-ROSE-L' },
                { childIndex: 4, variationAttribute: 'Custom / XL', sku: 'SKU-CUSTOM-XL' }
              ]).map((v, idx) => (
                <button
                  key={idx}
                  className={`btn btn-sm ${activeVarIdx === idx + 1 ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setActiveVarIdx(idx + 1)}
                  style={{ background: activeVarIdx === idx + 1 ? '#0284c7' : '#fff', color: activeVarIdx === idx + 1 ? '#fff' : '#334155', fontWeight: 600, fontSize: '0.75rem', padding: '4px 10px', borderRadius: '6px' }}
                >
                  Child #{idx + 1}: {v.variationAttribute}
          </div>

          {/* Complete 1 Parent + 4 Child ASIN Matrix Card */}
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', padding: '14px 18px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ fontWeight: 800, color: '#0369a1', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={18} />
                <span>BỘ BIẾN THỂ AMAZON MULTI-ASIN (1 PARENT + 4 CHILD ASINs):</span>
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0284c7', background: '#e0f2fe', padding: '2px 8px', borderRadius: '12px' }}>
                Full Package Ready
              </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', background: '#ffffff', borderRadius: '8px', overflow: 'hidden' }}>
                <thead>
                  <tr style={{ background: '#0284c7', color: '#ffffff', textAlign: 'left' }}>
                    <th style={{ padding: '8px 12px' }}>Loại ASIN</th>
                    <th style={{ padding: '8px 12px' }}>Mã ASIN / SKU</th>
                    <th style={{ padding: '8px 12px' }}>Thuộc Tính Biến Thể (Variation)</th>
                    <th style={{ padding: '8px 12px' }}>Giá Niêm Yết</th>
                    <th style={{ padding: '8px 12px' }}>Trạng Thái</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #e2e8f0', background: activeVarIdx === 0 ? '#e0f2fe' : '#ffffff' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 800, color: '#0f766e' }}>👑 PARENT ASIN</td>
                    <td style={{ padding: '8px 12px', fontWeight: 700, fontFamily: 'monospace' }}>{listing.parentAsin || 'B0PARENT99'} ({listing.parentSku || 'SKU-PARENT-MAIN'})</td>
                    <td style={{ padding: '8px 12px', color: '#64748b' }}>Parent Catalog Anchor (Non-sellable Container)</td>
                    <td style={{ padding: '8px 12px', color: '#64748b' }}>—</td>
                    <td style={{ padding: '8px 12px', fontWeight: 700, color: '#16a34a' }}>🟢 Active Parent</td>
                  </tr>
                  {(listing.variations || [
                    { childIndex: 1, asin: 'B0CHILD01', variationAttribute: 'Vàng 24k / Kích thước S', price: '$28.99', sku: 'SKU-GOLD-S' },
                    { childIndex: 2, asin: 'B0CHILD02', variationAttribute: 'Bạc Ý 925 / Kích thước M', price: '$29.99', sku: 'SKU-SILVER-M' },
                    { childIndex: 3, asin: 'B0CHILD03', variationAttribute: 'Vàng Hồng / Kích thước L', price: '$31.99', sku: 'SKU-ROSE-L' },
                    { childIndex: 4, asin: 'B0CHILD04', variationAttribute: 'Khắc Tên Theo Yêu Cầu / XL', price: '$34.99', sku: 'SKU-CUSTOM-XL' }
                  ]).map((v, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #e2e8f0', background: activeVarIdx === i + 1 ? '#e0f2fe' : '#ffffff' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 700, color: '#0284c7' }}>💎 CHILD ASIN #{i + 1}</td>
                      <td style={{ padding: '8px 12px', fontWeight: 700, fontFamily: 'monospace' }}>{v.asin || `B0CHILD0${i+1}`} ({v.sku})</td>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1e293b' }}>{v.variationAttribute}</td>
                      <td style={{ padding: '8px 12px', fontWeight 700, color: '#16a34a' }}>{v.price || '$29.99'}</td>
                      <td style={{ padding: '8px 12px', fontWeight 700, color: '#16a34a' }}>🟢 Purchasable Child</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>


          {viewMode === 'preview' ? (
             <AmazonPreview data={listing} />
          ) : (
            <>

              {/* Amazon Validation Banner */}
              {!amazonValidation.isValid && (
            <div style={{ background: '#fee2e2', border: '1px solid #fecaca', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.8rem', color: '#991b1b' }}>
              <strong>⚠️ Amazon Compliance Alerts:</strong>
              <ul style={{ paddingLeft: '18px', marginTop: '4px' }}>
                {amazonValidation.issues.map((iss, i) => (
                  <li key={i}>{iss}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Amazon Product Title (Max 75 Chars per July 27, 2026 Policy) */}
          <div className="listing-field-card">
            <div className="field-header">
              <div className="field-title">
                Amazon Product Title 
                <span style={{ fontSize: '0.75rem', fontWeight: 600, background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '12px', marginLeft: '8px' }}>
                  July 27, 2026 Policy: Max 75 Chars
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className={`compliance-meter ${(listing.amazonTitle?.length || 0) <= 75 ? 'valid' : 'invalid'}`}>
                  {(listing.amazonTitle || '').length} / 75 Chars
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => copyToClipboard(listing.amazonTitle, 'amz-title', 'Amazon Title Copied!')}
                  disabled={!isApproved} style={{ opacity: isApproved ? 1 : 0.5 }}
                >
                  {copiedKey === 'amz-title' ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedKey === 'amz-title' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
            <div className="field-content">{listing.amazonTitle}</div>
          </div>

          {/* Amazon Item Highlights (NEW Field: Max 125 Chars per July 27, 2026 Policy) */}
          <div className="listing-field-card" style={{ borderLeft: '4px solid #0284c7' }}>
            <div className="field-header">
              <div className="field-title">
                Item Highlights (Mới - Tăng tốc SEO & CTR)
                <span style={{ fontSize: '0.75rem', fontWeight: 600, background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '12px', marginLeft: '8px' }}>
                  New Amazon Field: Max 125 Chars
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className={`compliance-meter ${(listing.itemHighlights?.length || 0) <= 125 ? 'valid' : 'invalid'}`}>
                  {(listing.itemHighlights || '').length} / 125 Chars
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => copyToClipboard(listing.itemHighlights, 'amz-highlights', 'Item Highlights Copied!')}
                  disabled={!isApproved} style={{ opacity: isApproved ? 1 : 0.5 }}
                >
                  {copiedKey === 'amz-highlights' ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedKey === 'amz-highlights' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
            <div className="field-content" style={{ fontWeight: 600, color: '#0369a1' }}>
              {listing.itemHighlights || 'Custom cuff embroidery with up to 3 names • Cozy gift for moms • Multiple sweatshirt colors and sizes'}
            </div>
          </div>


          {/* 5 Amazon Bullet Points */}
          <div className="listing-field-card">
            <div className="field-header">
              <div className="field-title">5 Key Feature Bullets</div>
              <button
                className="btn btn-amazon btn-sm"
                onClick={() => copyToClipboard(listing.amazonBullets?.join('\n\n'), 'amz-all-bullets', 'All 5 Bullets Copied!')}
                disabled={!isApproved} style={{ opacity: isApproved ? 1 : 0.5 }}
              >
                {copiedKey === 'amz-all-bullets' ? <Check size={14} /> : <Copy size={14} />}
                <span>Copy All 5 Bullets</span>
              </button>
            </div>

            <ul className="bullet-list">
              {(listing.amazonBullets || []).map((bullet, idx) => (
                <li key={idx} className="bullet-item">
                  <span className="bullet-num">#{idx + 1}</span>
                  <div style={{ flex: 1 }}>{bullet}</div>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '3px 6px', height: 'fit-content', opacity: isApproved ? 1 : 0.5 }}
                    onClick={() => copyToClipboard(bullet, `amz-bullet-${idx}`, `Bullet #${idx + 1} Copied!`)}
                    disabled={!isApproved}
                  >
                    {copiedKey === `amz-bullet-${idx}` ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Amazon Backend Search Terms */}
          <div className="listing-field-card" style={{ borderLeft: '4px solid var(--amazon-color)' }}>
            <div className="field-header">
              <div className="field-title">
                <span>Backend Generic Search Terms</span>
                <span style={{ fontSize: '0.7rem', textTransform: 'none', color: 'var(--text-muted)', fontWeight: 'normal' }}>
                  (No commas • Spaces only)
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className={`compliance-meter ${amazonValidation.searchTermsBytes <= 249 ? 'valid' : 'invalid'}`}>
                  {amazonValidation.searchTermsBytes} / 249 Bytes ({amazonValidation.searchTermsBytesLeft} left)
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => copyToClipboard(listing.amazonSearchTerms, 'amz-search-terms', 'Search Terms Copied!')}
                  disabled={!isApproved} style={{ opacity: isApproved ? 1 : 0.5 }}
                >
                  {copiedKey === 'amz-search-terms' ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedKey === 'amz-search-terms' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
            <div className="field-content" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
              {listing.amazonSearchTerms}
            </div>
          </div>

          {/* Amazon Product Description */}
          <div className="listing-field-card">
            <div className="field-header">
              <div className="field-title">Amazon HTML Product Description</div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => copyToClipboard(listing.amazonDescription, 'amz-desc', 'Amazon Description Copied!')}
                disabled={!isApproved} style={{ opacity: isApproved ? 1 : 0.5 }}
              >
                {copiedKey === 'amz-desc' ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedKey === 'amz-desc' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <div 
              className="field-content" 
              style={{ fontSize: '0.85rem', maxHeight: '240px', overflowY: 'auto', lineHeight: '1.6' }}
              dangerouslySetInnerHTML={{ __html: listing.amazonDescription || '<p><i>No description generated.</i></p>' }}
            />
          </div>


          {/* Amazon A+ Content Modules */}
          {listing.amazonAPlusContent && (
            <div className="listing-field-card" style={{ borderLeft: '4px solid #ea580c' }}>
              <div className="field-header">
                <div className="field-title">
                  <span>Amazon A+ Content (EBC Modules)</span>
                  <span style={{ fontSize: '0.7rem', textTransform: 'none', color: '#c2410c', fontWeight: 'bold' }}>
                    [Brand Story & Feature Modules]
                  </span>
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => copyToClipboard(JSON.stringify(listing.amazonAPlusContent, null, 2), 'amz-aplus', 'A+ Content Copied!')}
                  disabled={!isApproved} style={{ opacity: isApproved ? 1 : 0.5 }}
                >
                  {copiedKey === 'amz-aplus' ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedKey === 'amz-aplus' ? 'Copied' : 'Copy A+ Data'}</span>
                </button>
              </div>
              <div className="field-content" style={{ fontSize: '0.85rem' }}>
                <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>
                  {listing.amazonAPlusContent.brandStoryHeadline}
                </div>
                <p style={{ color: '#475569', marginBottom: '12px' }}>
                  {listing.amazonAPlusContent.brandStoryBody}
                </p>

                {listing.amazonAPlusContent.modules && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                    {listing.amazonAPlusContent.modules.map((mod, mIdx) => (
                      <div key={mIdx} style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ea580c', textTransform: 'uppercase' }}>
                          Module #{mIdx + 1}: {mod.moduleType}
                        </div>
                        {mod.heading && <div style={{ fontWeight: 600, fontSize: '0.85rem', marginTop: '2px' }}>{mod.heading}</div>}
                        {mod.body && <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>{mod.body}</div>}
                        {mod.features && (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', marginTop: '6px' }}>
                            {mod.features.map((f, fIdx) => (
                              <div key={fIdx} style={{ background: '#fff', padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                                <strong style={{ fontSize: '0.8rem', color: '#1e293b' }}>{f.title}:</strong>
                                <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '4px' }}>{f.desc}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          </>
          )}
        </div>
      )}

      {/* ETSY TAB */}
      {activeMarketTab === 'etsy' && (
        <div>
          {viewMode === 'preview' ? (
             <EtsyPreview data={listing} />
          ) : (
            <>
              {/* Etsy Validation Banner */}
              {!etsyValidation.isValid && (
            <div style={{ background: '#fee2e2', border: '1px solid #fecaca', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.8rem', color: '#991b1b' }}>
              <strong>⚠️ Etsy Compliance Alerts:</strong>
              <ul style={{ paddingLeft: '18px', marginTop: '4px' }}>
                {etsyValidation.issues.map((iss, i) => (
                  <li key={i}>{iss}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Etsy Title */}
          <div className="listing-field-card">
            <div className="field-header">
              <div className="field-title">Etsy SEO Title</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className={`compliance-meter ${(listing.etsyTitle?.length || 0) <= 140 ? 'valid' : 'invalid'}`}>
                  {(listing.etsyTitle || '').length} / 140 Chars Max
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => copyToClipboard(listing.etsyTitle, 'etsy-title', 'Etsy Title Copied!')}
                  disabled={!isApproved} style={{ opacity: isApproved ? 1 : 0.5 }}
                >
                  {copiedKey === 'etsy-title' ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedKey === 'etsy-title' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
            <div className="field-content">{listing.etsyTitle}</div>
          </div>

          {/* Etsy 13 Tags */}
          <div className="listing-field-card" style={{ borderLeft: '4px solid var(--etsy-color)' }}>
            <div className="field-header">
              <div className="field-title">
                <span>Etsy 13 Search Tags</span>
                <span style={{ fontSize: '0.7rem', textTransform: 'none', color: 'var(--text-muted)', fontWeight: 'normal' }}>
                  (Click any tag to copy, max 20 chars each)
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="compliance-meter valid">
                  {(listing.etsyTags || []).length} / 13 Tags
                </div>
                <button
                  className="btn btn-etsy btn-sm"
                  onClick={() => copyToClipboard(listing.etsyTags?.join(', '), 'etsy-all-tags', 'All 13 Etsy Tags Copied!')}
                  disabled={!isApproved} style={{ opacity: isApproved ? 1 : 0.5 }}
                >
                  {copiedKey === 'etsy-all-tags' ? <Check size={14} /> : <Copy size={14} />}
                  <span>Copy All 13 Tags</span>
                </button>
              </div>
            </div>

            <div className="tags-cloud">
              {(listing.etsyTags || []).map((tag, idx) => {
                const isOverLimit = tag.length > 20;
                return (
                  <div
                    key={idx}
                    className={`tag-badge ${isOverLimit ? 'invalid-len' : ''}`}
                    onClick={() => copyToClipboard(tag, `tag-${idx}`, `Tag "${tag}" Copied!`)}
                    title="Click to copy tag"
                  >
                    <Tag size={12} />
                    <span>{tag}</span>
                    <span style={{ fontSize: '0.7rem', color: isOverLimit ? 'var(--danger)' : 'var(--text-muted)' }}>
                      ({tag.length}c)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Personalization Instructions Template */}
          <div className="listing-field-card">
            <div className="field-header">
              <div className="field-title">Etsy Personalization Box Instructions</div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => copyToClipboard(listing.etsyPersonalizationInstructions, 'etsy-person', 'Personalization Instructions Copied!')}
                disabled={!isApproved} style={{ opacity: isApproved ? 1 : 0.5 }}
              >
                {copiedKey === 'etsy-person' ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedKey === 'etsy-person' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <div className="field-content">{listing.etsyPersonalizationInstructions}</div>
          </div>

          {/* Etsy Description */}
          <div className="listing-field-card">
            <div className="field-header">
              <div className="field-title">Etsy Item Description (Story, Sizing & Care)</div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => copyToClipboard(listing.etsyDescription, 'etsy-desc', 'Etsy Description Copied!')}
                disabled={!isApproved} style={{ opacity: isApproved ? 1 : 0.5 }}
              >
                {copiedKey === 'etsy-desc' ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedKey === 'etsy-desc' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <div className="field-content" style={{ maxHeight: '220px', overflowY: 'auto' }}>
              {listing.etsyDescription}
            </div>
          </div>
          </>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
