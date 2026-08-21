import React, { useEffect, useState } from 'react';
import { 
  Zap, ShieldCheck, Layers, Brain, Database, TrendingUp, RefreshCw
} from 'lucide-react';
import GoogleTrendsWidget from './GoogleTrendsWidget';
import LearningBoxWidget from './LearningBoxWidget';
import AmazonPipelineWorkflow from './AmazonPipelineWorkflow';
import MasterKeywordTable from './MasterKeywordTable';
import UnifiedIpGateModal from './UnifiedIpGateModal';
import MarketBenchmarkWidget from './MarketBenchmarkWidget';

export default function AmazonWorkspace({ onSelectListing, onApproveListing, onShowToast }) {
  const [seedPhrase, setSeedPhrase] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Apparel: Sweatshirt');
  const [activeStage, setActiveStage] = useState('workflow'); // 'workflow' | 'research' | 'mkl'
  const [isIpModalOpen, setIsIpModalOpen] = useState(false);
  const [activeProject, setActiveProject] = useState(null);

  // Workflow Evidence State shared across Stages
  // Xray data is held only in the active workspace React state. Browser-wide
  // storage is not an authority for research evidence because it cannot bind
  // a record to the active tenant, workspace, project, or seed.
  const [xraySellers, setXraySellers] = useState([]);
  const [cerebroKeywords, setCerebroKeywords] = useState([]);
  const [cerebroSummary, setCerebroSummary] = useState(null);
  const [drafting, setDrafting] = useState(false);

  const handleUpdateXraySellers = React.useCallback((sellers) => {
    setXraySellers(Array.isArray(sellers) ? sellers : []);
  }, []);

  // Uploaded Xray rows are display-only session state. They must not survive a
  // project context change or become an authority for Learning Box/publish flow.
  useEffect(() => {
    setXraySellers([]);
  }, [activeProject?.id]);

  const fetchProjects = React.useCallback(async () => {
    try {
      const res = await fetch('/api/projects', { credentials: 'include' });
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.projects) && data.projects.length > 0) {
        setActiveProject(data.projects[0]);
      }
    } catch (e) {}
  }, []);

  // Also load latest trend if available to populate cerebroSummary
  const fetchLatestTrend = React.useCallback(async () => {
    try {
      const res = await fetch('/api/trends', { credentials: 'include' });
      if (res.ok) {
        const trends = await res.json();
        const amzTrends = (trends || []).filter(t => t.marketplace === 'AMAZON');
        if (amzTrends.length > 0) {
          const latest = amzTrends[0];
          let detailed = [];
          try { detailed = JSON.parse(latest.keywords_detailed || '[]'); } catch (e) {}
          if (!cerebroSummary) {
            setCerebroSummary({ trendId: latest.id, totalRows: detailed.length });
          }
          if (cerebroKeywords.length === 0 && detailed.length > 0) {
            setCerebroKeywords(detailed);
          }
          if (!seedPhrase && latest.category) {
            setSeedPhrase(latest.category);
          }
        }
      }
    } catch (e) {}
  }, [cerebroSummary, cerebroKeywords.length, seedPhrase]);

  React.useEffect(() => {
    fetchProjects();
    fetchLatestTrend();
  }, [fetchProjects, fetchLatestTrend]);

  const handleTransition = async (targetState) => {
    if (!activeProject) return;
    try {
      const res = await fetch(`/api/projects/${activeProject.id}/transition`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetState })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Transition failed');
      if (onShowToast) onShowToast(`✓ Chuyển trạng thái dự án sang ${data.state} thành công!`);
      setActiveProject(prev => ({ ...prev, state: data.state }));
      fetchProjects();
    } catch (err) {
      if (onShowToast) onShowToast(`⚠ Transition error: ${err.message}`);
    }
  };

  // Generate Amazon A10 Listing Action (Available across Stage 2, Stage 3, and Stage 1)
  const handleGenerateListing = async () => {
    const trendId = cerebroSummary?.trendId;
    if (!trendId) {
      if (onShowToast) onShowToast('⚠️ Vui lòng nạp file Cerebro ở Stage 1 (Bước 3) trước khi tạo listing!');
      setActiveStage('workflow');
      return;
    }

    setDrafting(true);
    try {
      const res = await fetch(`/api/trends/${trendId}/draft`, {
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Drafting failed');

      if (onShowToast) onShowToast('✅ Đã tạo thành công Amazon Listing & A+ Content chuẩn 75 chars!');
      if (onSelectListing && data.listing) {
        onSelectListing(data.listing);
      }
    } catch (err) {
      if (onShowToast) onShowToast(`Lỗi tạo listing: ${err.message}`);
    } finally {
      setDrafting(false);
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
        </div>

        {activeProject && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#0284c7', color: '#fff', padding: '6px 14px', borderRadius: '10px', fontSize: '0.82rem', fontWeight: 800 }}>
            <span>📌 Active Project #{activeProject.id}: <u style={{ textUnderlineOffset: '3px' }}>{activeProject.state}</u></span>
            {activeProject.state === 'EVIDENCE_INTAKE' && (
              <button onClick={() => handleTransition('RESEARCH_ACCEPTED')} style={{ background: '#fff', color: '#0284c7', border: 'none', padding: '3px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 800 }}>
                Accept Research →
              </button>
            )}
            {activeProject.state === 'RESEARCH_ACCEPTED' && (
              <button onClick={() => handleTransition('DNA_ACCEPTED')} style={{ background: '#fff', color: '#0284c7', border: 'none', padding: '3px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 800 }}>
                Accept DNA →
              </button>
            )}
            {activeProject.state === 'DNA_ACCEPTED' && (
              <button onClick={() => handleTransition('MKL_FROZEN')} style={{ background: '#fff', color: '#0284c7', border: 'none', padding: '3px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 800 }}>
                Freeze MKL →
              </button>
            )}
          </div>
        )}
      </div>

      {/* 0. Market Benchmark & Go/No-Go Decision Gate (Pre-Listing Validation) */}
      <MarketBenchmarkWidget 
        seedPhrase={seedPhrase} 
        category={selectedCategory} 
        onSelectNicheKeyword={(kw) => {
          setSeedPhrase(kw);
          if (onShowToast) onShowToast(`Đã chọn từ khóa ngách: "${kw}"`);
        }} 
        onShowToast={onShowToast} 
      />

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
          <span>📊 Stage 3: Kho Từ Khóa Phân Tầng MKL 5-Tier</span>
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
          activeProjectId={activeProject?.id}
          onShowToast={onShowToast}
          onSelectListing={onSelectListing}
          onProceedToStage={(stage) => setActiveStage(stage)}
          onUpdateXraySellers={handleUpdateXraySellers}
          onUpdateCerebroSummary={(summary, kw) => {
            setCerebroSummary(summary);
            if (kw) setCerebroKeywords(kw);
          }}
          onGenerateListingDirect={handleGenerateListing}
          isDrafting={drafting}
        />
      )}

      {/* STAGE 2: DEEP RESEARCH & DNA MIRROR (2-COLUMN GRID) */}
      {activeStage === 'research' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
            {/* Google Trends Velocity */}
            <GoogleTrendsWidget seedPhrase={seedPhrase} onShowToast={onShowToast} />
            
            {/* Amazon Learning Box accepts URL/text only until project-bound server evidence exists. */}
            <LearningBoxWidget 
              platform="AMAZON" 
              scannedSellers={[]}
              onShowToast={onShowToast} 
            />
          </div>

          {/* Stage 2 Acceptance Gate & Instant Generation */}
          <div className="studio-panel" style={{ padding: '20px 24px', borderLeft: '4px solid #0284c7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f0f9ff', borderRadius: '12px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0369a1' }}>
                🧠 Stage 2: Competitor DNA & Trend Recheck Completed
              </div>
              <div style={{ fontSize: '0.8rem', color: '#0284c7', marginTop: '2px' }}>
                Xác nhận từ khóa hạt nhân "{seedPhrase}" và DNA đối thủ ({xraySellers.length} ASINs đã quét) sẵn sàng cho MKL & Sinh Listing.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleGenerateListing}
                disabled={drafting}
                className="btn btn-primary"
                style={{ background: '#16a34a', fontWeight: 800, padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                {drafting ? <RefreshCw size={16} className="spinner" /> : <Zap size={16} />}
                <span>{drafting ? 'Đang tạo listing...' : '⚡ Sinh Listing Ngay'}</span>
              </button>

              <button
                onClick={() => setActiveStage('mkl')}
                className="btn btn-primary"
                style={{ background: '#0284c7', fontWeight: 800, padding: '10px 20px', borderRadius: '8px', cursor: 'pointer' }}
              >
                <span>➡️ Mở Khóa Stage 3 (MKL & Family Draft)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STAGE 3: MASTER KEYWORD INTELLIGENCE & PROMINENT LISTING GENERATION */}
      {activeStage === 'mkl' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="studio-panel" style={{ padding: '20px 24px', borderLeft: '4px solid #7e22ce', background: '#faf5ff', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h3 style={{ margin: 0, color: '#7e22ce', fontWeight: 800, fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📊 STAGE 3: Master Keyword Intelligence & Family Draft (1 Parent + 4 Children)</span>
              </h3>
              <p style={{ margin: '4px 0 0 0', color: '#6b21a8', fontSize: '0.85rem' }}>
                Bảng MKL phân tầng 5 Tiers chuẩn A10. Bấm nút dưới đây để sinh trọn bộ Amazon Listing (Title, 5 Bullets, Highlights 125c, Backend 249b, A+ Content).
              </p>
            </div>

            {/* HIGH-IMPACT PROMINENT GENERATION CTA */}
            <button
              onClick={handleGenerateListing}
              disabled={drafting}
              className="btn btn-primary"
              style={{
                background: 'linear-gradient(135deg, #7e22ce 0%, #0284c7 100%)',
                color: '#fff',
                fontWeight: 800,
                fontSize: '0.95rem',
                padding: '12px 24px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 16px rgba(126, 34, 206, 0.35)',
                cursor: drafting ? 'not-allowed' : 'pointer'
              }}
            >
              {drafting ? <RefreshCw size={18} className="spinner" /> : <Zap size={18} />}
              <span>{drafting ? 'Đang sinh Amazon A10 Listing...' : '⚡ Sinh Bộ Amazon A10 Listing & Family Draft'}</span>
            </button>
          </div>

          <MasterKeywordTable marketplace="AMAZON" keywords={cerebroKeywords} onShowToast={onShowToast} />
        </div>
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
