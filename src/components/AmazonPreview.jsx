import React from 'react';
import { Star, ShoppingCart, Sparkles, Award, ShieldCheck, Heart } from 'lucide-react';

export default function AmazonPreview({ data }) {
  if (!data) return null;

  const aplus = data.amazonAPlusContent;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Product Page Section */}
      <div style={{ background: '#fff', color: '#0f1111', fontFamily: 'Arial, sans-serif', padding: '24px', borderRadius: '8px', border: '1px solid #e7e7e7', display: 'flex', gap: '30px', flexWrap: 'wrap' }}>
        {/* Left Column: Image */}
        <div style={{ flex: '0 0 300px' }}>
          <div style={{ width: '100%', height: '300px', backgroundColor: '#f7f7f7', border: '1px solid #e7e7e7', borderRadius: '6px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#888', padding: '16px', textAlign: 'center' }}>
            <Sparkles size={36} style={{ color: '#de7921', marginBottom: '8px' }} />
            <div style={{ fontWeight: 600, color: '#333' }}>{data.categoryName || 'Product category: UNKNOWN'}</div>
            <div style={{ fontSize: '0.75rem', color: '#999', marginTop: '4px' }}>Simulation Preview — Not Live — Not Submission Ready</div>
          </div>
        </div>

        {/* Middle Column: Title & Bullets */}
        <div style={{ flex: 1, minWidth: '300px' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: '400', margin: '0 0 8px 0', lineHeight: '1.3' }}>
            {data.amazonTitle || 'Amazon Title Placeholder'}
          </h1>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', borderBottom: '1px solid #e7e7e7', paddingBottom: '12px', marginBottom: '12px' }}>
            <div style={{ color: '#007185', fontSize: '0.9rem' }}>Amazon FBM Listing</div>
            {data.rating ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#de7921' }}>
                <Star size={16} fill="currentColor" />
                <span style={{ color: '#007185', marginLeft: '4px' }}>{data.rating} ({data.reviewCount || 0} reviews)</span>
              </div>
            ) : (
              <span style={{ fontSize: '0.8rem', color: '#666' }}>New Listing (0 ratings)</span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '16px' }}>
            {data.price ? (
              <span style={{ fontSize: '1.8rem', fontWeight: '600', color: '#b12704' }}>${data.price}</span>
            ) : (
            <span style={{ fontSize: '1.2rem', color: '#666', fontStyle: 'italic' }}>Price: UNKNOWN — pending listing export</span>
            )}
          </div>

          <div style={{ background: '#f6f6f6', padding: '10px 14px', borderRadius: '4px', marginBottom: '16px', fontSize: '0.85rem' }}>
            <span style={{ fontWeight: 'bold' }}>Fulfillment: UNKNOWN</span> — {data.shippingPrice ? `Shipping: $${data.shippingPrice}` : 'Shipping: UNKNOWN'}
          </div>

          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '8px' }}>About this item</h3>
            <ul style={{ paddingLeft: '18px', margin: '0', fontSize: '0.92rem', lineHeight: '1.55' }}>
              {(data.amazonBullets || []).map((bullet, idx) => (
                <li key={idx} style={{ marginBottom: '8px' }}>{bullet}</li>
              ))}
              {(!data.amazonBullets || data.amazonBullets.length === 0) && (
                <li>Bullet points will appear here.</li>
              )}
            </ul>
          </div>
        </div>
        
        {/* Right Column: Buy Box */}
        <div style={{ flex: '0 0 220px', border: '1px solid #d5d9d9', borderRadius: '8px', padding: '16px', height: 'fit-content', background: '#fafafa' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '8px', color: '#b12704' }}>
            {data.price ? `$${data.price}` : '—'}
          </div>
          <div style={{ color: '#007185', fontSize: '0.85rem', marginBottom: '10px' }}>Return policy: UNKNOWN</div>
          <div style={{ color: '#007600', fontSize: '1.05rem', fontWeight: 600, marginBottom: '14px' }}>Draft / Pre-Publish</div>
          <div style={{ fontSize: '0.8rem', color: '#666' }}>No live offer, inventory, delivery, or purchase action.</div>
        </div>
      </div>

      {/* Amazon A+ Content / Enhanced Brand Content (EBC) Section */}
      <div style={{ background: '#fff', color: '#0f1111', fontFamily: 'Arial, sans-serif', padding: '24px', borderRadius: '8px', border: '1px solid #e7e7e7' }}>
        <div style={{ borderBottom: '2px solid #ea580c', paddingBottom: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Award size={20} style={{ color: '#ea580c' }} />
            A+ Layout Preview — Content Unset
          </h2>
          <span style={{ fontSize: '0.75rem', background: '#ffedd5', color: '#c2410c', padding: '3px 8px', borderRadius: '4px', fontWeight: 600 }}>
            Simulation only
          </span>
        </div>

        {/* Brand Story Hero Banner */}
        <div style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', color: '#fff', padding: '28px 24px', borderRadius: '8px', marginBottom: '24px', textAlign: 'center' }}>
          <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '2px', color: '#f59e0b', marginBottom: '8px', fontWeight: 700 }}>
            [A+ Brand Story: Unset]
          </div>
          <h3 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0 0 12px 0', color: '#ffffff' }}>
            {aplus?.brandStoryHeadline || '[A+ Headline: Unset]'}
          </h3>
          <p style={{ fontSize: '0.95rem', color: '#cbd5e1', maxWidth: '750px', margin: '0 auto', lineHeight: 1.6 }}>
            {aplus?.brandStoryBody || '[A+ Brand Story: Unset]'}
          </p>
        </div>

        {/* 3 Highlights Module */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          {aplus?.modules?.[1]?.features ? (
            aplus.modules[1].features.map((feat, i) => (
              <div key={i} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '18px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#ffedd5', color: '#ea580c', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px auto' }}>
                  <Sparkles size={20} />
                </div>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 6px 0', color: '#1e293b' }}>{feat.title}</h4>
                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0, lineHeight: 1.5 }}>{feat.desc}</p>
              </div>
            ))
          ) : (
            <>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '18px', borderRadius: '8px', textAlign: 'center' }}>
                <ShieldCheck size={24} style={{ color: '#059669', margin: '0 auto 8px auto' }} />
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 4px 0' }}>[A+ Feature: Unset]</h4>
                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>Product Truth evidence required.</p>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '18px', borderRadius: '8px', textAlign: 'center' }}>
                <Heart size={24} style={{ color: '#e11d48', margin: '0 auto 8px auto' }} />
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 4px 0' }}>[A+ Feature: Unset]</h4>
                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>Product Truth evidence required.</p>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '18px', borderRadius: '8px', textAlign: 'center' }}>
                <Award size={24} style={{ color: '#d97706', margin: '0 auto 8px auto' }} />
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 4px 0' }}>[A+ Feature: Unset]</h4>
                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>Product Truth evidence required.</p>
              </div>
            </>
          )}
        </div>

        {/* Module 3: Specifications & Unboxing Block */}
        {aplus?.modules?.[2] && (
          <div style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '18px 22px', borderRadius: '8px' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 6px 0', color: '#0f172a' }}>
              {aplus.modules[2].heading || 'Unboxing & Specifications'}
            </h4>
            <p style={{ fontSize: '0.875rem', color: '#475569', margin: 0, lineHeight: 1.5 }}>
              {aplus.modules[2].body}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
