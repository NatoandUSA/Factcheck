import React, { useState, useRef } from 'react';
import { Sparkles, Upload, Image as ImageIcon, X, Wand2, RefreshCw } from 'lucide-react';
import { CATEGORIES, OCCASIONS, TONES } from '../data/categoryPresets';
import { projectVerifiedAiInput } from '../utils/aiTruthBoundary.js';

export default function SingleListingGenerator({ onGenerate, isGenerating, truthListing = null }) {
  const verifiedProjection = projectVerifiedAiInput(truthListing);
  const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[0]);
  const [selectedOccasion, setSelectedOccasion] = useState(OCCASIONS[0]);
  const [selectedTone, setSelectedTone] = useState(TONES[0]);
  // Never pre-fill with category.sampleBrief: that's category-level example
  // text with invented specifics (e.g. "luxury gift box", "LED wooden light
  // base"), not a real fact about this product. Staff must type their own
  // brief; the textarea placeholder gives format guidance instead (GPT PR-10
  // 4th re-audit).
  const [productBrief, setProductBrief] = useState('');
  const [imagePreview, setImagePreview] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleCategorySelect = (category) => {
    setSelectedCategory(category);
    setProductBrief('');
  };

  const handleImageFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageFile(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!verifiedProjection.eligible) return;

    onGenerate({
      ...truthListing,
      tone: selectedTone,
    });
  };

  return (
    <div className="studio-panel">
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <Sparkles size={20} style={{ color: 'var(--primary)' }} />
          <span>Product Blueprint & Vision Input</span>
        </h2>
        <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
          Select your product line, attach design mockups, and define target gift angles.
        </p>
      </div>

      {/* Category Selection Grid */}
      <div className="form-group">
        <label className="form-label">
          <span>Product Line Preset</span>
          <span className="form-label-hint">4 Niche Workflows</span>
        </label>
        <div className="category-selector-grid">
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory.id === cat.id;
            return (
              <div
                key={cat.id}
                className={`category-card ${isSelected ? 'selected' : ''}`}
                onClick={() => handleCategorySelect(cat)}
              >
                <div className="category-icon">{cat.icon}</div>
                <div className="category-info">
                  <h4>{cat.name}</h4>
                  <p>{cat.badge}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Image Upload Zone */}
      <div className="form-group">
        <label className="form-label">
          <span>Product Mockup / Photo</span>
          <span className="form-label-hint">Multimodal Vision AI Analysis</span>
        </label>

        {imagePreview ? (
          <div style={{ position: 'relative', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', padding: '12px', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
            <img src={imagePreview} alt="Mockup preview" className="dropzone-preview" />
            <button
              type="button"
              onClick={() => setImagePreview(null)}
              style={{
                position: 'absolute',
                top: '18px',
                right: '18px',
                background: 'rgba(15, 23, 42, 0.8)',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                width: '28px',
                height: '28px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={16} />
            </button>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              ✓ Photo attached for AI visual material & color inspection
            </div>
          </div>
        ) : (
          <div
            className={`dropzone ${isDragging ? 'dragging' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => e.target.files?.[0] && handleImageFile(e.target.files[0])}
            />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <div style={{ background: 'var(--bg-surface)', padding: '10px', borderRadius: '50%', color: 'var(--primary)' }}>
                <Upload size={20} />
              </div>
              <div style={{ fontSize: '0.875rem', fontWeight: '600' }}>Drop product photo or click to browse</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>PNG, JPG, WEBP (Mockups, flat lays, embroidery close-ups)</div>
            </div>
          </div>
        )}
      </div>

      {/* Occasion Selector */}
      <div className="form-group">
        <label className="form-label">
          <span>Target Gift Occasion / Hook</span>
          <span className="form-label-hint">Drives Emotional Conversions</span>
        </label>
        <div className="pill-grid">
          {OCCASIONS.map((occ) => (
            <button
              key={occ}
              type="button"
              className={`pill-item ${selectedOccasion === occ ? 'active' : ''}`}
              onClick={() => setSelectedOccasion(occ)}
            >
              {occ}
            </button>
          ))}
        </div>
      </div>

      {/* Brand Tone Selector */}
      <div className="form-group">
        <label className="form-label">
          <span>Listing Voice & Copy Tone</span>
        </label>
        <div className="pill-grid">
          {TONES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`pill-item ${selectedTone.id === t.id ? 'active' : ''}`}
              onClick={() => setSelectedTone(t)}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      {/* Product Details & Brief */}
      <div className="form-group">
        <div className="form-label">
          <span>Creative Notes (not Product Truth; not sent to AI)</span>
        </div>
        <textarea
          className="form-textarea"
          rows={3}
          value={productBrief}
          onChange={(e) => setProductBrief(e.target.value)}
          placeholder="Optional staff note. Verify factual details in the version-bound Product Truth Card instead."
        />
      </div>

      {/* Materials Badges */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px' }}>
          SUGGESTED SPECS (reference only -- verify before publishing):
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {selectedCategory.defaultMaterials.map((mat, idx) => (
            <span key={idx} style={{ fontSize: '0.72rem', background: 'var(--bg-subtle)', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
              • {mat}
            </span>
          ))}
        </div>
      </div>

      {/* Submit Button */}
      {!verifiedProjection.eligible && (
        <div role="alert" style={{ marginBottom: '10px', color: 'var(--danger)', fontSize: '0.82rem' }}>
          Generation locked: select a listing with a current, IP-cleared Product Truth Card.
        </div>
      )}
      <button
        type="button"
        className="btn btn-primary"
        style={{ width: '100%', padding: '14px', fontSize: '1rem', boxShadow: '0 4px 12px rgba(15, 118, 110, 0.2)' }}
        disabled={isGenerating || !verifiedProjection.eligible}
        onClick={handleSubmit}
      >
        {isGenerating ? (
          <>
            <RefreshCw size={18} className="spin" />
            <span>Generating Amazon & Etsy Listings...</span>
          </>
        ) : (
          <>
            <Wand2 size={18} />
            <span>{verifiedProjection.eligible ? 'Generate Dual Listing Package' : 'Product Truth Required'}</span>
          </>
        )}
      </button>
    </div>
  );
}
