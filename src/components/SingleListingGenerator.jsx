import React, { useState, useRef } from 'react';
import { Sparkles, Upload, Image as ImageIcon, X, Wand2, RefreshCw } from 'lucide-react';
import { CATEGORIES, OCCASIONS, TONES } from '../data/categoryPresets';

export default function SingleListingGenerator({ onGenerate, isGenerating }) {
  const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[0]);
  const [selectedOccasion, setSelectedOccasion] = useState(OCCASIONS[0]);
  const [selectedTone, setSelectedTone] = useState(TONES[0]);
  const [productBrief, setProductBrief] = useState(CATEGORIES[0].sampleBrief);
  const [imagePreview, setImagePreview] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleCategorySelect = (category) => {
    setSelectedCategory(category);
    setProductBrief(category.sampleBrief);
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
    if (!productBrief.trim()) return;

    onGenerate({
      category: selectedCategory,
      occasion: selectedOccasion,
      tone: selectedTone,
      productBrief: productBrief.trim(),
      // Category presets are unverified suggestions for staff reference, not
      // confirmed facts about this specific product -- never sent to the AI
      // as real materials unless staff typed them into productBrief.
      materials: [],
      imageBase64: imagePreview
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
          <span>Product Brief & Personalization Specs</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '0.7rem', padding: '2px 6px' }}
            onClick={() => setProductBrief(selectedCategory.sampleBrief)}
          >
            <RefreshCw size={10} /> Reset Sample Brief
          </button>
        </div>
        <textarea
          className="form-textarea"
          rows={3}
          value={productBrief}
          onChange={(e) => setProductBrief(e.target.value)}
          placeholder="Describe your design, personalization options, specs, sizing, and recipient details..."
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
      <button
        type="button"
        className="btn btn-primary"
        style={{ width: '100%', padding: '14px', fontSize: '1rem', boxShadow: '0 4px 12px rgba(15, 118, 110, 0.2)' }}
        disabled={isGenerating || !productBrief.trim()}
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
            <span>Generate Dual Listing Package</span>
          </>
        )}
      </button>
    </div>
  );
}
