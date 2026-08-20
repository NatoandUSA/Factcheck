import React, { useState } from 'react';
import { 
  Star, ChevronDown, ShoppingCart, Sparkles, Award, ShieldCheck, Heart, 
  Copy, Check, Image as ImageIcon, Camera, Layers, CheckCircle2, AlertTriangle, ExternalLink
} from 'lucide-react';
import { generateAmazonListingImagePrompts, generateAmazonAPlusImagePrompts } from '../services/imagePromptGenerator';

export default function AmazonRealProductPage({ listing, onShowToast }) {
  const [selectedImgIdx, setSelectedImgIdx] = useState(0);
  const [activeSubTab, setActiveSubTab] = useState('page'); // 'page' | 'image-prompts' | 'aplus-prompts'
  const [copiedIdx, setCopiedIdx] = useState(null);

  if (!listing) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
        <Layers size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 16px auto' }} />
        <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>Chưa chọn Listing nào</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Hãy chọn một listing từ Kho Lưu Trữ (Saved Catalog) hoặc sinh listing mới từ Workspace Amazon.
        </p>
      </div>
    );
  }

  const listingPrompts = generateAmazonListingImagePrompts(listing.amazonTitle, listing.categoryName, listing.amazonSearchTerms);
  const aplusPrompts = generateAmazonAPlusImagePrompts(listing.amazonTitle, listing.categoryName);

  const copyPrompt = (text, idx, label = 'Đã copy prompt ảnh!') => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    if (onShowToast) onShowToast(label);
    setTimeout(() => setCopiedIdx(null), 1800);
  };

  const copyAllPrompts = (promptsArray, label) => {
    const combined = promptsArray.map((p, i) => `=== ${p.slot || p.moduleNum} (${p.dimensions}) ===\nPROMPT:\n${p.prompt}\n`).join('\n\n');
    navigator.clipboard.writeText(combined);
    if (onShowToast) onShowToast(label);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Top Simulator Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', background: '#0f172a', padding: '16px 20px', borderRadius: '12px', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ background: '#0284c7', padding: '8px', borderRadius: '8px' }}>
            <Sparkles size={20} color="#fff" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1rem' }}>
              Amazon 100% Real Product Page Simulator
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              Bản mô phỏng chính xác giao diện Amazon với đầy đủ <strong>10 Listing Images</strong> & <strong>10 A+ Content Modules</strong>
            </div>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div style={{ display: 'flex', gap: '8px', background: 'rgba(255, 255, 255, 0.1)', padding: '4px', borderRadius: '8px' }}>
          <button
            onClick={() => setActiveSubTab('page')}
            style={{
              background: activeSubTab === 'page' ? '#0284c7' : 'transparent',
              color: '#fff',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '0.8rem',
              cursor: 'pointer'
            }}
          >
            🛒 Live Amazon Page View
          </button>
          <button
            onClick={() => setActiveSubTab('image-prompts')}
            style={{
              background: activeSubTab === 'image-prompts' ? '#0284c7' : 'transparent',
              color: '#fff',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '0.8rem',
              cursor: 'pointer'
            }}
          >
            📸 10 Listing Image Prompts
          </button>
          <button
            onClick={() => setActiveSubTab('aplus-prompts')}
            style={{
              background: activeSubTab === 'aplus-prompts' ? '#0284c7' : 'transparent',
              color: '#fff',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '0.8rem',
              cursor: 'pointer'
            }}
          >
            ✨ 10 A+ Content Prompts
          </button>
        </div>
      </div>

      {/* VIEW 1: LIVE 100% REAL AMAZON PAGE */}
      {activeSubTab === 'page' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Main Top Section: Gallery + Info + BuyBox */}
          <div style={{ background: '#fff', color: '#0f1111', fontFamily: 'Arial, sans-serif', padding: '24px', borderRadius: '8px', border: '1px solid #e7e7e7', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            
            {/* 1. Left Thumbnail Column (Amazon 10 Images Carousel) */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {listingPrompts.map((img, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedImgIdx(idx)}
                    style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '4px',
                      border: selectedImgIdx === idx ? '2px solid #e77600' : '1px solid #d5d9d9',
                      background: '#f8fafc',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      color: selectedImgIdx === idx ? '#e77600' : '#64748b'
                    }}
                    title={img.slot}
                  >
                    #{idx + 1}
                  </div>
                ))}
              </div>

              {/* Main Active Image Viewport */}
              <div style={{ width: '380px', height: '380px', background: '#fafafa', border: '1px solid #e7e7e7', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', textAlign: 'center', position: 'relative' }}>
                <div style={{ position: 'absolute', top: '10px', left: '10px', background: '#e0f2fe', color: '#0369a1', fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>
                  {listingPrompts[selectedImgIdx]?.slot}
                </div>
                <Camera size={44} style={{ color: '#94a3b8', marginBottom: '10px' }} />
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>
                  {listingPrompts[selectedImgIdx]?.purpose}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '6px', maxWidth: '300px' }}>
                  {listingPrompts[selectedImgIdx]?.dimensions}
                </div>
                <button
                  onClick={() => copyPrompt(listingPrompts[selectedImgIdx]?.prompt, selectedImgIdx, `Đã copy Prompt Ảnh #${selectedImgIdx + 1}!`)}
                  style={{ marginTop: '14px', background: '#0284c7', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                >
                  {copiedIdx === selectedImgIdx ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedIdx === selectedImgIdx ? 'Đã Copy Prompt' : 'Copy Midjourney Prompt'}</span>
                </button>
              </div>
            </div>

            {/* 2. Middle Details Column */}
            <div style={{ flex: 1, minWidth: '320px' }}>
              <h1 style={{ fontSize: '1.25rem', fontWeight: '400', margin: '0 0 6px 0', lineHeight: '1.35', color: '#0f1111' }}>
                {listing.amazonTitle || 'Amazon Title Placeholder'}
              </h1>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', borderBottom: '1px solid #e7e7e7', paddingBottom: '10px', marginBottom: '10px' }}>
                <div style={{ color: '#007185', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 500 }}>Brand: {listing.categoryName || 'Custom Store'}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ background: '#f1f5f9', color: '#64748b', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                    SIMULATION ONLY (No live review data)
                  </span>
                </div>
              </div>

              {/* Price & Deal */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '12px' }}>
                <span style={{ fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic' }}>Price: [NOT SET — PENDING LISTING EXPORT]</span>
              </div>

              {/* Fulfillment & Delivery Note */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '8px 12px', borderRadius: '4px', marginBottom: '14px', fontSize: '0.8rem', color: '#64748b' }}>
                ℹ️ Fulfillment & shipping options will be calculated by Amazon Seller Central upon upload.
              </div>

              {/* 5 Feature Bullets */}
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 'bold', marginBottom: '8px' }}>About this item</h3>
                <ul style={{ paddingLeft: '18px', margin: '0', fontSize: '0.9rem', lineHeight: '1.5' }}>
                  {(listing.amazonBullets || []).map((bullet, idx) => (
                    <li key={idx} style={{ marginBottom: '8px' }}>{bullet}</li>
                  ))}
                  {(!listing.amazonBullets || listing.amazonBullets.length === 0) && (
                    <li style={{ color: '#94a3b8', fontStyle: 'italic' }}>5 Bullet Points will appear here once generated.</li>
                  )}
                </ul>
              </div>
            </div>

            {/* 3. Right Buy Box Column */}
            <div style={{ flex: '0 0 210px', border: '1px solid #d5d9d9', borderRadius: '8px', padding: '16px', height: 'fit-content', background: '#fafafa' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>Buy Box Preview</div>
              <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '8px', fontStyle: 'italic' }}>Price & Shipping set on Amazon</div>
              <div style={{ color: '#007600', fontSize: '0.85rem', fontWeight: 600, marginBottom: '12px' }}>Draft Ready for Export</div>
              <button disabled style={{ width: '100%', background: '#e2e8f0', border: '1px solid #cbd5e1', borderRadius: '100px', padding: '8px', color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600, cursor: 'not-allowed', marginBottom: '8px' }}>
                Add to Cart (Preview)
              </button>
              <button disabled style={{ width: '100%', background: '#e2e8f0', border: '1px solid #cbd5e1', borderRadius: '100px', padding: '8px', color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600, cursor: 'not-allowed' }}>
                Buy Now (Preview)
              </button>
            </div>
          </div>

          {/* Amazon A+ Content Real Section */}
          <div style={{ background: '#fff', color: '#0f1111', fontFamily: 'Arial, sans-serif', padding: '24px', borderRadius: '8px', border: '1px solid #e7e7e7' }}>
            <div style={{ borderBottom: '2px solid #ea580c', paddingBottom: '8px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Award size={20} style={{ color: '#ea580c' }} />
                From the Brand — Amazon A+ Enhanced Brand Content (10 Modules Ready)
              </h2>
              <button
                onClick={() => copyAllPrompts(aplusPrompts, 'Đã copy toàn bộ 10 Prompt A+ Content!')}
                style={{ background: '#ea580c', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
              >
                <Copy size={12} />
                <span>Copy 10 A+ Prompts</span>
              </button>
            </div>

            {/* Brand Hero Story Banner */}
            <div style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', color: '#fff', padding: '32px 24px', borderRadius: '8px', marginBottom: '20px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '2px', color: '#f59e0b', fontWeight: 800, marginBottom: '6px' }}>
                [A+ Brand Story Section]
              </div>
              <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', margin: '0 0 10px 0' }}>
                {listing.amazonAPlusContent?.brandStoryHeadline || '[A+ Brand Story Headline: Unset]'}
              </h3>
              <p style={{ fontSize: '0.9rem', color: '#cbd5e1', maxWidth: '750px', margin: '0 auto', lineHeight: 1.6 }}>
                {listing.amazonAPlusContent?.brandStoryBody || '[A+ Brand Story Body: Unset — Generates from verified Product Truth grounding.]'}
              </p>
            </div>

            {/* A+ Feature Modules (Layout Preview) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '20px' }}>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '18px', borderRadius: '8px', textAlign: 'center' }}>
                <ShieldCheck size={26} style={{ color: '#059669', margin: '0 auto 8px auto' }} />
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 4px 0' }}>A+ Module 1: Material & Specs</h4>
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>Grounding facts populate this card upon generation.</p>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '18px', borderRadius: '8px', textAlign: 'center' }}>
                <Heart size={26} style={{ color: '#e11d48', margin: '0 auto 8px auto' }} />
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 4px 0' }}>A+ Module 2: Gift & Occasion</h4>
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>Gift/occasion positioning populates here.</p>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '18px', borderRadius: '8px', textAlign: 'center' }}>
                <Award size={26} style={{ color: '#d97706', margin: '0 auto 8px auto' }} />
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 4px 0' }}>A+ Module 3: Craftsmanship</h4>
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>Process and origin details populate here.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: 10 AMAZON LISTING IMAGE PROMPTS */}
      {activeSubTab === 'image-prompts' && (
        <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: '#0284c7' }}>
                Bộ 10 Prompt Ảnh Listing Chuẩn Amazon A10 Algorithm
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                Copy trực tiếp vào Midjourney, Stable Diffusion hoặc DALL-E để sinh bộ ảnh chuyển đổi cao nhất.
              </p>
            </div>
            <button
              onClick={() => copyAllPrompts(listingPrompts, 'Đã copy toàn bộ 10 Prompt Listing!')}
              className="btn btn-primary btn-sm"
              style={{ background: '#0284c7', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Copy size={14} />
              <span>Copy Tất Cả 10 Prompts</span>
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {listingPrompts.map((img, idx) => (
              <div key={idx} style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ background: '#0284c7', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800 }}>
                      SLOT #{idx + 1}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                      {img.slot}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({img.dimensions})</span>
                  </div>

                  <button
                    onClick={() => copyPrompt(img.prompt, `slot-${idx}`, `Đã copy prompt #${idx + 1}`)}
                    className="btn btn-secondary btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    {copiedIdx === `slot-${idx}` ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                    <span>{copiedIdx === `slot-${idx}` ? 'Copied' : 'Copy Prompt'}</span>
                  </button>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  <strong>Mục đích:</strong> {img.purpose}
                </div>
                <div style={{ background: 'var(--bg-surface)', padding: '10px 14px', borderRadius: '6px', fontSize: '0.8rem', fontFamily: 'monospace', color: '#0369a1', border: '1px solid var(--border-subtle)' }}>
                  {img.prompt}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VIEW 3: 10 AMAZON A+ CONTENT IMAGE PROMPTS */}
      {activeSubTab === 'aplus-prompts' && (
        <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: '#ea580c' }}>
                Bộ 10 Prompt Ảnh Amazon A+ Enhanced Content (EBC Modules)
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                Bao gồm Banner Header (970x600), Full Width Banner (970x300), và các cụm 3-Module Cards (300x300).
              </p>
            </div>
            <button
              onClick={() => copyAllPrompts(aplusPrompts, 'Đã copy toàn bộ 10 Prompt A+!')}
              className="btn btn-primary btn-sm"
              style={{ background: '#ea580c', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Copy size={14} />
              <span>Copy Tất Cả 10 A+ Prompts</span>
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {aplusPrompts.map((ap, idx) => (
              <div key={idx} style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ background: '#ea580c', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800 }}>
                      MODULE #{idx + 1}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                      {ap.moduleNum}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({ap.dimensions})</span>
                  </div>

                  <button
                    onClick={() => copyPrompt(ap.prompt, `aplus-${idx}`, `Đã copy prompt Module #${idx + 1}`)}
                    className="btn btn-secondary btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    {copiedIdx === `aplus-${idx}` ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                    <span>{copiedIdx === `aplus-${idx}` ? 'Copied' : 'Copy Prompt'}</span>
                  </button>
                </div>
                <div style={{ background: 'var(--bg-surface)', padding: '10px 14px', borderRadius: '6px', fontSize: '0.8rem', fontFamily: 'monospace', color: '#c2410c', border: '1px solid var(--border-subtle)' }}>
                  {ap.prompt}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
