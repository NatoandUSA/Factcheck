import React, { useState } from 'react';
import { 
  Star, Heart, ShoppingBag, ShieldCheck, Sparkles, Copy, Check, 
  Camera, Tag, Gift, Award, Info, ChevronRight, Layers
} from 'lucide-react';
import { generateEtsyListingImagePrompts } from '../services/imagePromptGenerator';

export default function EtsyRealProductPage({ listing, onShowToast }) {
  const [selectedImgIdx, setSelectedImgIdx] = useState(0);
  const [activeSubTab, setActiveSubTab] = useState('page'); // 'page' | 'image-prompts'
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [customText, setCustomText] = useState('');

  if (!listing) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
        <Layers size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 16px auto' }} />
        <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>Chưa chọn Listing nào</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Hãy chọn một listing từ Kho Lưu Trữ (Saved Catalog) hoặc sinh listing mới từ Workspace Etsy.
        </p>
      </div>
    );
  }

  const etsyPrompts = generateEtsyListingImagePrompts(listing.etsyTitle, listing.categoryName, (listing.etsyTags || []).join(' '));

  const copyPrompt = (text, idx, label = 'Đã copy prompt ảnh!') => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    if (onShowToast) onShowToast(label);
    setTimeout(() => setCopiedIdx(null), 1800);
  };

  const copyAllPrompts = (promptsArray, label) => {
    const combined = promptsArray.map((p, i) => `=== ${p.slot} (${p.dimensions}) ===\nPURPOSE: ${p.purpose}\nPROMPT:\n${p.prompt}\n`).join('\n\n');
    navigator.clipboard.writeText(combined);
    if (onShowToast) onShowToast(label);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Top Simulator Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', background: '#2c1e19', padding: '16px 20px', borderRadius: '12px', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ background: '#ea580c', padding: '8px', borderRadius: '8px' }}>
            <Sparkles size={20} color="#fff" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: '#f59e0b' }}>
              Etsy Listing Page Simulation Preview — Not Live — Not Submission Ready
            </div>
            <div style={{ fontSize: '0.75rem', color: '#fed7aa' }}>
              Mô phỏng xem trước giao diện Etsy (Simulation Preview) với <strong>12 Listing Photos</strong> & <strong>13 Search Tags Pool</strong>
            </div>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div style={{ display: 'flex', gap: '8px', background: 'rgba(255, 255, 255, 0.1)', padding: '4px', borderRadius: '8px' }}>
          <button
            onClick={() => setActiveSubTab('page')}
            style={{
              background: activeSubTab === 'page' ? '#ea580c' : 'transparent',
              color: '#fff',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '0.8rem',
              cursor: 'pointer'
            }}
          >
            🛍️ Live Etsy Shop Page
          </button>
          <button
            onClick={() => setActiveSubTab('image-prompts')}
            style={{
              background: activeSubTab === 'image-prompts' ? '#ea580c' : 'transparent',
              color: '#fff',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '0.8rem',
              cursor: 'pointer'
            }}
          >
            📸 12 Etsy Photo Prompts
          </button>
        </div>
      </div>

      {/* VIEW 1: LIVE 100% REAL ETSY SHOP PAGE */}
      {activeSubTab === 'page' && (
        <div style={{ background: '#fff', color: '#222222', fontFamily: '"Guardian Egyptian Web", Georgia, serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', padding: '28px', borderRadius: '12px', border: '1px solid #e1e3df', display: 'flex', gap: '28px', flexWrap: 'wrap' }}>
          
          {/* 1. Left Photos Column (12 Etsy Photos Carousel) */}
          <div style={{ flex: '1 1 450px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            
            {/* Main Active Photo Viewport */}
            <div style={{ width: '100%', height: '420px', background: '#faf9f8', border: '1px solid #e1e3df', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center', position: 'relative' }}>
              <div style={{ position: 'absolute', top: '14px', left: '14px', background: '#ffedd5', color: '#9a3412', fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px', borderRadius: '6px' }}>
                {etsyPrompts[selectedImgIdx]?.slot}
              </div>
              <Camera size={48} style={{ color: '#ea580c', marginBottom: '12px' }} />
              <div style={{ fontWeight: 700, fontSize: '1rem', color: '#222' }}>
                {etsyPrompts[selectedImgIdx]?.purpose}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#595959', marginTop: '6px', maxWidth: '340px' }}>
                {etsyPrompts[selectedImgIdx]?.dimensions}
              </div>
              <button
                onClick={() => copyPrompt(etsyPrompts[selectedImgIdx]?.prompt, selectedImgIdx, `Đã copy Prompt Ảnh Etsy #${selectedImgIdx + 1}!`)}
                style={{ marginTop: '16px', background: '#ea580c', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
              >
                {copiedIdx === selectedImgIdx ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedIdx === selectedImgIdx ? 'Đã Copy Prompt' : 'Copy Midjourney Prompt'}</span>
              </button>
            </div>

            {/* 12 Photo Thumbnails Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
              {etsyPrompts.map((img, idx) => (
                <div
                  key={idx}
                  onClick={() => setSelectedImgIdx(idx)}
                  style={{
                    height: '54px',
                    borderRadius: '8px',
                    border: selectedImgIdx === idx ? '2px solid #222' : '1px solid #e1e3df',
                    background: '#f8fafc',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    color: selectedImgIdx === idx ? '#222' : '#757575'
                  }}
                  title={img.slot}
                >
                  <span>#{idx + 1}</span>
                  <span style={{ fontSize: '0.6rem', fontWeight: 400, opacity: 0.8 }}>Photo</span>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Right Shop & Buy Box Column */}
          <div style={{ flex: '1 1 380px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* Shop Header & Star Seller */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.85rem', color: '#595959', textDecoration: 'underline', cursor: 'pointer' }}>
                  {listing.shopName || '[Shop Name: Unset]'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                  <span style={{ background: '#f1f5f9', color: '#64748b', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                    SIMULATION ONLY (No live Etsy sales data)
                  </span>
                </div>
              </div>
            </div>

            {/* Title */}
            <h1 style={{ fontSize: '1.2rem', fontWeight: 400, lineHeight: 1.4, margin: '0', color: '#222' }}>
              {listing.etsyTitle || '[Etsy Title Pending Generation]'}
            </h1>

            {/* Price & Cart Urgency */}
            <div style={{ borderBottom: '1px solid #e1e3df', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ fontSize: '0.9rem', color: '#64748b', fontStyle: 'italic' }}>
                  Price: [NOT SET — PENDING ETSY LISTING EXPORT]
                </span>
              </div>
            </div>

            {/* Personalization Section */}
            <div style={{ background: '#f8f8f8', padding: '14px', borderRadius: '8px', border: '1px solid #e1e3df' }}>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '0.85rem', marginBottom: '4px', color: '#222' }}>
                Add your personalization:
              </label>
              <div style={{ fontSize: '0.75rem', color: '#595959', marginBottom: '8px' }}>
                Enter custom names, date, or song title for laser engraving (Max 250 characters):
              </div>
              <textarea
                rows={2}
                className="form-input"
                style={{ width: '100%', fontSize: '0.85rem', background: '#fff' }}
                placeholder="Example: Sarah & David, EST. 2024, 'Perfect' by Ed Sheeran"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button style={{ width: '100%', background: '#222', color: '#fff', border: 'none', borderRadius: '24px', padding: '14px', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' }}>
                Buy it now
              </button>
              <button style={{ width: '100%', background: 'transparent', color: '#222', border: '2px solid #222', borderRadius: '24px', padding: '12px', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' }}>
                Add to cart
              </button>
            </div>

            {/* 13 Clickable Etsy Tags Cloud */}
            <div style={{ marginTop: '8px', borderTop: '1px solid #e1e3df', paddingTop: '14px' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: '#595959', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Tag size={14} color="#ea580c" />
                Etsy 13 Search Tags Pool (Max 20 chars/tag):
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {(listing.etsyTags || []).map((tag, i) => (
                  <span
                    key={i}
                    onClick={() => copyPrompt(tag, `tag-${i}`, `Đã copy tag "${tag}"!`)}
                    style={{
                      background: '#f4f4f4',
                      border: '1px solid #e1e3df',
                      color: '#222',
                      padding: '4px 10px',
                      borderRadius: '16px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                    title="Click để copy Tag này"
                  >
                    #{i + 1} {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Handmade Description */}
            <div style={{ borderTop: '1px solid #e1e3df', paddingTop: '14px' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '8px' }}>Item Details & Story</h3>
              <div style={{ fontSize: '0.85rem', lineHeight: 1.6, color: '#333', whiteSpace: 'pre-line' }}>
                {listing.etsyDescription || 'No description provided.'}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* VIEW 2: 12 ETSY LISTING PHOTO PROMPTS */}
      {activeSubTab === 'image-prompts' && (
        <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: '#ea580c' }}>
                Bộ 12 Prompt Ảnh Listing Chuẩn Etsy Maker & Best Seller
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                Tối ưu hóa thẩm mỹ ấm cúng, ảnh thực tế cầm trên tay, bảng size, và hậu trường làm xưởng.
              </p>
            </div>
            <button
              onClick={() => copyAllPrompts(etsyPrompts, 'Đã copy toàn bộ 12 Prompt Ảnh Etsy!')}
              className="btn btn-primary btn-sm"
              style={{ background: '#ea580c', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Copy size={14} />
              <span>Copy Tất Cả 12 Prompts</span>
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {etsyPrompts.map((img, idx) => (
              <div key={idx} style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ background: '#ea580c', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800 }}>
                      PHOTO #{idx + 1}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                      {img.slot}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({img.dimensions})</span>
                  </div>

                  <button
                    onClick={() => copyPrompt(img.prompt, `etsy-slot-${idx}`, `Đã copy prompt Photo #${idx + 1}`)}
                    className="btn btn-secondary btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    {copiedIdx === `etsy-slot-${idx}` ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                    <span>{copiedIdx === `etsy-slot-${idx}` ? 'Copied' : 'Copy Prompt'}</span>
                  </button>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  <strong>Mục đích ảnh:</strong> {img.purpose}
                </div>
                <div style={{ background: 'var(--bg-surface)', padding: '10px 14px', borderRadius: '6px', fontSize: '0.8rem', fontFamily: 'monospace', color: '#c2410c', border: '1px solid var(--border-subtle)' }}>
                  {img.prompt}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
