import React, { useState } from 'react';
import AmazonRealProductPage from './AmazonRealProductPage';
import EtsyRealProductPage from './EtsyRealProductPage';
import { ShoppingBag, ShoppingCart, Layers, ArrowRight, Sparkles } from 'lucide-react';

export default function ProductListingPageSimulator({ currentListing, history = [], onSelectListing, onShowToast }) {
  const [platformView, setPlatformView] = useState('AMAZON'); // 'AMAZON' | 'ETSY'
  const [activeListingId, setActiveListingId] = useState(currentListing?.dbId || currentListing?.id || (history[0]?.dbId || history[0]?.id));

  // Determine active listing
  const activeListing = (history.find(h => (h.dbId || h.id) === activeListingId)) || currentListing || history[0] || null;

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

      {/* Render Selected Platform View */}
      {platformView === 'AMAZON' ? (
        <AmazonRealProductPage listing={activeListing} onShowToast={onShowToast} />
      ) : (
        <EtsyRealProductPage listing={activeListing} onShowToast={onShowToast} />
      )}
    </div>
  );
}
