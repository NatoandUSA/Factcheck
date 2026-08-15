import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, Zap, ShieldCheck, Database, RefreshCw
} from 'lucide-react';
import GoogleTrendsWidget from './GoogleTrendsWidget';
import LearningBoxWidget from './LearningBoxWidget';
import AmazonPipelineWorkflow from './AmazonPipelineWorkflow';
import UnifiedIpGateModal from './UnifiedIpGateModal';

export default function AmazonWorkspace({ onSelectListing, onApproveListing, onShowToast }) {
  const [seedPhrase, setSeedPhrase] = useState('mom sweatshirt');
  const [selectedCategory, setSelectedCategory] = useState('Apparel: Sweatshirt');
  const [isIpModalOpen, setIsIpModalOpen] = useState(false);

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* 0. Master Seed Phrase Anchor Bar + IP Gate Button */}
      <div style={{
        background: 'var(--bg-surface)',
        borderRadius: '16px',
        padding: '18px 24px',
        border: '1px solid #bae6fd',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        boxShadow: '0 4px 12px rgba(2, 132, 199, 0.08)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '320px' }}>
          <div style={{ background: '#0284c7', color: '#fff', padding: '10px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: '#0369a1' }}>
              📍 0. Amazon A10 Master Seed Phrase (Từ khóa Hạt nhân):
            </div>
            <input
              type="text"
              className="form-input"
              style={{
                fontSize: '1rem',
                fontWeight: 700,
                color: '#0f172a',
                background: '#f0f9ff',
                marginTop: '4px',
                border: '1px solid #7dd3fc'
              }}
              value={seedPhrase}
              onChange={(e) => setSeedPhrase(e.target.value)}
              placeholder="Ví dụ: mom sweatshirt, personalized acrylic song plaque..."
            />
          </div>
        </div>

        {/* Category Selector & IP Gate Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Danh Mục Sản Phẩm:</span>
            <select 
              value={selectedCategory} 
              onChange={(e) => setSelectedCategory(e.target.value)}
              style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #bae6fd', background: 'var(--bg-primary)', fontWeight: 700, fontSize: '0.85rem' }}
            >
              <option value="Apparel: Sweatshirt">🧥 Apparel: Sweatshirt</option>
              <option value="Apparel: Shirt">👕 Apparel: Shirt</option>
              <option value="Apparel: Hoodie">🧥 Apparel: Hoodie</option>
              <option value="Mug">☕ Mug (Cốc/Ly)</option>
              <option value="Blanket">🛋️ Blanket (Chăn/Mền)</option>
              <option value="Jewelry">✨ Custom Jewelry</option>
              <option value="Embroidery">🧵 Custom Embroidery</option>
              <option value="Acrylic">💡 Custom Acrylic</option>
            </select>
          </div>

          <button
            onClick={() => setIsIpModalOpen(true)}
            style={{
              background: '#fee2e2',
              border: '1px solid #fca5a5',
              color: '#991b1b',
              padding: '10px 18px',
              borderRadius: '10px',
              fontWeight: 700,
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              marginTop: '16px'
            }}
          >
            <ShieldCheck size={18} color="#dc2626" />
            <span>🛡️ Cổng Bảo Vệ IP Gate (2-in-1)</span>
          </button>
        </div>
      </div>

      {/* Google Trends Cross-Check (Anchored on Amazon Seed Phrase) */}
      <GoogleTrendsWidget seedPhrase={seedPhrase} onShowToast={onShowToast} />

      {/* Learning Box: Learn Best Seller DNA from Competitor Link / Text */}
      <LearningBoxWidget onShowToast={onShowToast} />

      {/* ======================================================== */}
      {/* 4-STEP AMAZON WORKFLOW: B1 Xray -> B2 Batch 10 ASINs -> B3 Cerebro -> B4 MKL & A10 */}
      {/* ======================================================== */}
      <AmazonPipelineWorkflow
        seedPhrase={seedPhrase}
        selectedCategory={selectedCategory}
        onShowToast={onShowToast}
        onSelectListing={onSelectListing}
      />

      {/* Unified IP Gate Modal */}
      <UnifiedIpGateModal
        isOpen={isIpModalOpen}
        onClose={() => setIsIpModalOpen(false)}
        onShowToast={onShowToast}
      />
    </div>
  );
}
