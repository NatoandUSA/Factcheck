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

  const amazonValidation = validateAmazonListing(listing);
  const etsyValidation = validateEtsyListing(listing);

  const isApproved = listing.status !== 'NEEDS_QA';
  const isManager = user?.role === 'MANAGER' || user?.role === 'OWNER' || user?.role === 'ADMIN';

  const copyToClipboard = (text, keyName, label = 'Copied to clipboard!') => {
    if (!isApproved) {
      onShowToast('Cannot copy unapproved draft!');
      return;
    }
    navigator.clipboard.writeText(text);
    setCopiedKey(keyName);
    onShowToast(label);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const exportSingleCsv = () => {
    const headers = ['Marketplace', 'Field', 'Content'];
    const rows = [
      ['Amazon', 'Title', `"${(listing.amazonTitle || '').replace(/"/g, '""')}"`],
      ['Amazon', 'Bullet 1', `"${(listing.amazonBullets?.[0] || '').replace(/"/g, '""')}"`],
      ['Amazon', 'Bullet 2', `"${(listing.amazonBullets?.[1] || '').replace(/"/g, '""')}"`],
      ['Amazon', 'Bullet 3', `"${(listing.amazonBullets?.[2] || '').replace(/"/g, '""')}"`],
      ['Amazon', 'Bullet 4', `"${(listing.amazonBullets?.[3] || '').replace(/"/g, '""')}"`],
      ['Amazon', 'Bullet 5', `"${(listing.amazonBullets?.[4] || '').replace(/"/g, '""')}"`],
      ['Amazon', 'Search Terms (249 bytes)', `"${(listing.amazonSearchTerms || '').replace(/"/g, '""')}"`],
      ['Amazon', 'Description', `"${(listing.amazonDescription || '').replace(/"/g, '""')}"`],
      ['Etsy', 'Title (140 max)', `"${(listing.etsyTitle || '').replace(/"/g, '""')}"`],
      ['Etsy', '13 Tags', `"${(listing.etsyTags?.join(', ') || '').replace(/"/g, '""')}"`],
      ['Etsy', 'Materials', `"${(listing.etsyMaterials?.join(', ') || '').replace(/"/g, '""')}"`],
      ['Etsy', 'Personalization Instructions', `"${(listing.etsyPersonalizationInstructions || '').replace(/"/g, '""')}"`],
      ['Etsy', 'Description', `"${(listing.etsyDescription || '').replace(/"/g, '""')}"`]
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `listing_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onShowToast('Listing exported to CSV!');
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

      {!isApproved && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '16px', borderRadius: '8px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#92400e' }}>
            <ShieldAlert size={24} />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Awaiting Manager Approval</div>
              <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>This listing is in DRAFT status. Copying and Exporting are disabled until approved.</div>
            </div>
          </div>
          {isManager && (
            <button 
              className="btn btn-primary btn-sm"
              onClick={() => onApproveListing(listing)}
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

          {/* Amazon Title */}
          <div className="listing-field-card">
            <div className="field-header">
              <div className="field-title">Amazon Product Title</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className={`compliance-meter ${(listing.amazonTitle?.length || 0) <= 200 ? 'valid' : 'invalid'}`}>
                  {(listing.amazonTitle || '').length} / 200 Chars
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
            <div className="field-content" style={{ fontSize: '0.85rem', maxHeight: '180px', overflowY: 'auto' }}>
              {listing.amazonDescription}
            </div>
          </div>
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
