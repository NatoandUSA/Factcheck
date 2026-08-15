import React, { useState } from 'react';
import { 
  Zap, ShieldCheck, Layers, Brain, Database, Sparkles, TrendingUp, RefreshCw
} from 'lucide-react';
import GoogleTrendsWidget from './GoogleTrendsWidget';
import LearningBoxWidget from './LearningBoxWidget';
import AmazonPipelineWorkflow from './AmazonPipelineWorkflow';
import MasterKeywordTable from './MasterKeywordTable';
import UnifiedIpGateModal from './UnifiedIpGateModal';

export default function AmazonWorkspace({ onSelectListing, onApproveListing, onShowToast }) {
  const [seedPhrase, setSeedPhrase] = useState('mom sweatshirt');
  const [selectedCategory, setSelectedCategory] = useState('Apparel: Sweatshirt');
  const [activeStage, setActiveStage] = useState('workflow'); // 'workflow' | 'research' | 'mkl'
  const [isIpModalOpen, setIsIpModalOpen] = useState(false);
  const [quickGenerating, setQuickGenerating] = useState(false);

  const handleQuickLaunch = async () => {
    if (!seedPhrase.trim()) {
      if (onShowToast) onShowToast('Vui lòng nhập Từ khóa Hạt nhân.');
      return;
    }
    setQuickGenerating(true);
    try {
      const res = await fetch('http://localhost:3001/api/amazon/quick-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seedPhrase,
          category: selectedCategory
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Quick launch failed');
      
      if (onShowToast) onShowToast('🚀 Đã tạo thành công Amazon Listing A10!');
      if (onSelectListing && data.listing) {
        onSelectListing(data.listing);
      }
    } catch (err) {
      if (onShowToast) onShowToast(`Lỗi tạo listing: ${err.message}`);
    } finally {
      setQuickGenerating(false);
    }
  };

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* ======================================================== */}
      {/* 1. TOP HERO COMMAND BAR                                  */}
      {/* ======================================================== */}
      <div style={{
        background: 'var(--bg-surface)',
        borderRadius: '16px',
        padding: '16px 24px',
        border: '1px solid #bae6fd',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        boxShadow: '0 4px 14px rgba(2, 132, 199, 0.08)'
      }}>
        {/* Seed Phrase Input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: '320px' }}>
          <div style={{ background: '#0284c7', color: '#fff', padding: '10px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#0369a1' }}>
              📍 0. Amazon A10 Master Seed Phrase:
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
              placeholder="Ví dụ: mom sweatshirt, personalized gifts..."
            />
          </div>
        </div>

        {/* Category Selector + IP Gate + Quick Launch */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Danh Mục:</span>
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
              padding: '9px 16px',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              marginTop: '15px'
            }}
          >
            <ShieldCheck size={16} color="#dc2626" />
            <span>🛡️ IP Gate (2-in-1)</span>
          </button>

          <button
            onClick={handleQuickLaunch}
            disabled={quickGenerating || !seedPhrase.trim()}
            className="btn btn-primary"
            style={{
              background: '#0284c7',
              fontWeight: 800,
              padding: '9px 18px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: (quickGenerating || !seedPhrase.trim()) ? 'not-allowed' : 'pointer',
              marginTop: '15px',
              boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)'
            }}
          >
            <Sparkles size={16} className={quickGenerating ? 'spinner' : ''} />
            <span>{quickGenerating ? 'Đang tạo...' : '🚀 Tạo Nhanh Listing A10'}</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. 3-STAGE PROMAX COMMAND SWITCHER                       */}
      {/* ======================================================== */}
      <div className="command-stage-bar">
        <button
          className={`command-stage-tab ${activeStage === 'workflow' ? 'active-amazon' : ''}`}
          onClick={() => setActiveStage('workflow')}
        >
          <Layers size={18} />
          <span>⚡ Stage 1: Quy Trình 4 Bước Amazon A10 (Workflow)</span>
        </button>

        <button
          className={`command-stage-tab ${activeStage === 'research' ? 'active-amazon' : ''}`}
          onClick={() => setActiveStage('research')}
        >
          <Brain size={18} />
          <span>🧠 Stage 2: Nghiên Cứu Sâu & Học DNA Đối Thủ (Research Hub)</span>
        </button>

        <button
          className={`command-stage-tab ${activeStage === 'mkl' ? 'active-amazon' : ''}`}
          onClick={() => setActiveStage('mkl')}
        >
          <Database size={18} />
          <span>📊 Stage 3: Kho Từ Khóa Phân Tầng MKL 3-Tier</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* 3. FOCUSED STAGE WORKSPACE CONTENT                       */}
      {/* ======================================================== */}

      {/* STAGE 1: 4-STEP PIPELINE WORKFLOW */}
      {activeStage === 'workflow' && (
        <AmazonPipelineWorkflow
          seedPhrase={seedPhrase}
          selectedCategory={selectedCategory}
          onShowToast={onShowToast}
          onSelectListing={onSelectListing}
        />
      )}

      {/* STAGE 2: DEEP RESEARCH & DNA MIRROR (2-COLUMN GRID) */}
      {activeStage === 'research' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
          {/* Google Trends Velocity */}
          <GoogleTrendsWidget seedPhrase={seedPhrase} onShowToast={onShowToast} />
          
          {/* Amazon Learning Box */}
          <LearningBoxWidget platform="AMAZON" onShowToast={onShowToast} />
        </div>
      )}

      {/* STAGE 3: MASTER KEYWORD INTELLIGENCE */}
      {activeStage === 'mkl' && (
        <MasterKeywordTable marketplace="AMAZON" onShowToast={onShowToast} />
      )}

      {/* Unified IP Gate Modal */}
      <UnifiedIpGateModal
        isOpen={isIpModalOpen}
        onClose={() => setIsIpModalOpen(false)}
        onShowToast={onShowToast}
      />
    </div>
  );
}
