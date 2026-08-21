import React, { useState, useEffect, useRef } from 'react';
import { 
  FileSpreadsheet, Zap, ShieldCheck, RefreshCw, Layers, Brain, Database, Sparkles, Users
} from 'lucide-react';
import GoogleTrendsWidget from './GoogleTrendsWidget';
import LearningBoxWidget from './LearningBoxWidget';
import EtsyMultiSellerScanner from './EtsyMultiSellerScanner';
import MasterKeywordTable from './MasterKeywordTable';
import UnifiedIpGateModal from './UnifiedIpGateModal';
import MarketBenchmarkWidget from './MarketBenchmarkWidget';
import { parseJsonResponse } from '../utils/apiResponse';

export default function EtsyWorkspace({ onSelectListing, onApproveListing, onShowToast, onViewHistory }) {
  const [seedPhrase, setSeedPhrase] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('✨ Custom Jewelry');
  const [activeStage, setActiveStage] = useState('workflow'); // 'workflow' | 'research' | 'mkl'
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [trends, setTrends] = useState([]);
  const [draftingTrendId, setDraftingTrendId] = useState(null);
  const [mcpPulling, setMcpPulling] = useState(false);
  const [mcpResult, setMcpResult] = useState(null);
  const [isIpModalOpen, setIsIpModalOpen] = useState(false);
  const [activeProject, setActiveProject] = useState(null);
  const [isFeedModalOpen, setIsFeedModalOpen] = useState(false);
  const [feedRawText, setFeedRawText] = useState('');
  const [feedSubmitting, setFeedSubmitting] = useState(false);
  const [scannedSellers, setScannedSellers] = useState([]);
  const fileInputRef = useRef(null);

  const handleFeedSearchResults = async () => {
    if (!feedRawText.trim()) {
      if (onShowToast) onShowToast('Vui lòng dán nội dung kết quả tìm kiếm hoặc URL từ trang Etsy!');
      return;
    }
    setFeedSubmitting(true);
    try {
      const res = await fetch('/api/etsy/feed-search-results', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: feedRawText,
          seed: seedPhrase.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to feed Etsy search data');

      if (data.seed) {
        setSeedPhrase(data.seed);
      }
      if (Array.isArray(data.sellers) && data.sellers.length > 0) {
        setScannedSellers(data.sellers);
      }
      if (Array.isArray(data.keywords) && data.keywords.length > 0) {
        setMcpResult({
          source: 'ETSY_SEARCH_PAGE_RAW',
          evidenceState: 'OBSERVED',
          keywords: data.keywords,
          sellers: data.sellers,
          trendingKeywordsStr: data.keywords.join(', ')
        });
      }
      if (onShowToast) onShowToast(`✓ Đã kéo thành công ${data.sellers?.length || 0} seller evidence & ${data.keywords?.length || 0} tags từ Etsy!`);
      setIsFeedModalOpen(false);
      setFeedRawText('');
    } catch (err) {
      if (onShowToast) onShowToast(`Lỗi nạp dữ liệu: ${err.message}`);
    } finally {
      setFeedSubmitting(false);
    }
  };


  const fetchProjects = React.useCallback(async () => {
    try {
      const res = await fetch('/api/projects', { credentials: 'include' });
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.projects) && data.projects.length > 0) {
        setActiveProject(data.projects[0]);
      }
    } catch (e) {}
  }, []);

  const fetchData = async () => {
    try {
      const trendsRes = await fetch('/api/trends', { credentials: 'include' });
      if (trendsRes.ok) {
        const trendsData = await trendsRes.json();
        const etsyTrends = (trendsData || []).filter(t => t.marketplace === 'ETSY' && t.keywords_detailed);
        setTrends(etsyTrends);
      }
    } catch (e) {
      console.warn('Failed to fetch Etsy workspace data', e);
    }
  };

  useEffect(() => {
    fetchData();
    fetchProjects();
  }, [fetchProjects]);
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

  const handleFileUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    setUploadStatus(null);

    const formData = new FormData();
    formData.append('reportFile', file);
    formData.append('category', selectedCategory);
    formData.append('marketplace', 'ETSY');
    if (activeProject?.id) formData.append('projectId', activeProject.id);

    try {
      const res = await fetch('/api/upload-h10', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });
      const result = await parseJsonResponse(res);
      if (!res.ok) throw new Error(result.error || 'Upload failed');

      setUploadStatus({
        type: 'success',
        trendId: result.trendId,
        message: `Đã nạp thành công ${result.totalRows} dòng từ file Etsy "${result.fileName}"!`,
        category: result.category
      });
      if (onShowToast) onShowToast(`✓ Đã nạp thành công file Etsy!`);
      fetchData();
    } catch (err) {
      setUploadStatus({ type: 'error', message: err.message });
      if (onShowToast) onShowToast(`Lỗi nạp file: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleManualDraft = async (trendId) => {
    setDraftingTrendId(trendId);
    try {
      const res = await fetch(`/api/trends/${trendId}/draft`, {
        method: 'POST',
        credentials: 'include'
      });
      const result = await parseJsonResponse(res);
      if (!res.ok) throw new Error(result.error || 'Drafting failed');

      if (onShowToast) onShowToast('✅ Đã tạo Etsy Listing với 13 Tags thành công!');
      fetchData();

      if (onSelectListing && result.listing) {
        onSelectListing(result.listing);
      }
    } catch (err) {
      if (onShowToast) onShowToast(`Lỗi tạo listing: ${err.message}`);
    } finally {
      setDraftingTrendId(null);
    }
  };

  const handleMcpPull = async () => {
    if (!seedPhrase.trim()) {
      if (onShowToast) onShowToast('Vui lòng nhập Từ khóa Hạt nhân (Seed Phrase).');
      return;
    }

    setMcpPulling(true);
    setMcpResult(null);

    try {
      const res = await fetch('/api/mcp/pull-etsy', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProject?.id,
          seed: seedPhrase.trim(),
          category: selectedCategory
        })
      });

      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data.error || 'Failed to pull Etsy MCP');

      if (data.source !== 'ETSY_MCP_LIVE' || data.evidenceState !== 'OBSERVED' || !Array.isArray(data.keywords) || data.keywords.length === 0) {
        throw new Error('INSUFFICIENT_EVIDENCE: MCP response is not verified live evidence.');
      }
      setMcpResult(data);
      if (Array.isArray(data.sellers) && data.sellers.length > 0) {
        setScannedSellers(data.sellers);
      }
      if (onShowToast) onShowToast(`✓ Đã nạp ${data.keywords.length} observed Etsy tags & ${data.sellers?.length || 0} Top Sellers từ MCP!`);
      fetchData();
    } catch (err) {
      if (onShowToast) onShowToast(`Lỗi kéo MCP: ${err.message}`);
    } finally {
      setMcpPulling(false);
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
        border: '1px solid #fed7aa',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        boxShadow: '0 4px 14px rgba(234, 88, 12, 0.08)'
      }}>
        {/* Seed Phrase Input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: '320px' }}>
          <div style={{ background: '#ea580c', color: '#fff', padding: '10px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#c2410c' }}>
              📍 0. Etsy Master Seed Phrase (Từ khóa Hạt nhân):
            </div>
            <input
              type="text"
              className="form-input"
              style={{
                fontSize: '1rem',
                fontWeight: 700,
                color: '#0f172a',
                background: '#fff7ed',
                marginTop: '4px',
                border: '1px solid #fdba74'
              }}
              value={seedPhrase}
              onChange={(e) => setSeedPhrase(e.target.value)}
              placeholder="Ví dụ: para el amor de mi vida, custom nurse sweatshirt..."
            />
          </div>
        </div>

        {/* Category Selector + IP Gate + Auto-Pull Trigger */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Danh Mục:</span>
            <select 
              value={selectedCategory} 
              onChange={(e) => setSelectedCategory(e.target.value)}
              style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #fed7aa', background: 'var(--bg-primary)', fontWeight: 700, fontSize: '0.85rem' }}
            >
              <option value="✨ Custom Jewelry">✨ Custom Jewelry</option>
              <option value="Apparel: Sweatshirt">🧥 Apparel: Sweatshirt</option>
              <option value="Mug">☕ Mug (Cốc/Ly)</option>
              <option value="Apparel: Shirt">👕 Apparel: Shirt</option>
              <option value="Apparel: Hoodie">🧥 Apparel: Hoodie</option>
              <option value="Blanket">🛋️ Blanket (Chăn/Mền)</option>
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

          {activeProject && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#ea580c', color: '#fff', padding: '6px 14px', borderRadius: '10px', fontSize: '0.82rem', fontWeight: 800, marginTop: '15px' }}>
              <span>📌 Active Project #{activeProject.id}: <u style={{ textUnderlineOffset: '3px' }}>{activeProject.state}</u></span>
              {activeProject.state === 'EVIDENCE_INTAKE' && (
                <button onClick={() => handleTransition('RESEARCH_ACCEPTED')} style={{ background: '#fff', color: '#ea580c', border: 'none', padding: '3px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 800 }}>
                  Accept Research →
                </button>
              )}
              {activeProject.state === 'RESEARCH_ACCEPTED' && (
                <button onClick={() => handleTransition('DNA_ACCEPTED')} style={{ background: '#fff', color: '#ea580c', border: 'none', padding: '3px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 800 }}>
                  Accept DNA →
                </button>
              )}
              {activeProject.state === 'DNA_ACCEPTED' && (
                <button onClick={() => handleTransition('MKL_FROZEN')} style={{ background: '#fff', color: '#ea580c', border: 'none', padding: '3px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 800 }}>
                  Freeze MKL →
                </button>
              )}
            </div>
          )}

          <button
            onClick={() => setIsFeedModalOpen(true)}
            style={{
              background: '#ecfdf5',
              border: '1px solid #6ee7b7',
              color: '#065f46',
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
            title="Dán link listing, copy text kết quả tìm kiếm Etsy, hoặc danh sách từ khóa"
          >
            <Sparkles size={16} color="#059669" />
            <span>📥 Feed Trang Kết Quả Etsy</span>
          </button>

          <button
            onClick={handleMcpPull}
            disabled={mcpPulling || !seedPhrase.trim()}
            className="btn btn-primary"
            style={{
              background: '#ea580c',
              fontWeight: 800,
              padding: '9px 18px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: (mcpPulling || !seedPhrase.trim()) ? 'not-allowed' : 'pointer',
              marginTop: '15px',
              boxShadow: '0 4px 12px rgba(234, 88, 12, 0.25)'
            }}
          >
            <RefreshCw size={16} className={mcpPulling ? 'spinner' : ''} />
            <span>{mcpPulling ? 'Đang kéo MCP...' : '⚡ Auto-Pull Live Tags (MCP)'}</span>
          </button>
        </div>
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
          className={`command-stage-tab ${activeStage === 'workflow' ? 'active-etsy' : ''}`}
          onClick={() => setActiveStage('workflow')}
        >
          <Layers size={18} />
          <span>⚡ Stage 1: Challenger Top Sellers & MCP 13 Tags (Workflow)</span>
        </button>

        <button
          className={`command-stage-tab ${activeStage === 'research' ? 'active-etsy' : ''}`}
          onClick={() => setActiveStage('research')}
        >
          <Brain size={18} />
          <span>🧠 Stage 2: Nghiên Cứu Sâu & Học DNA Đối Thủ (Research Hub)</span>
        </button>

        <button
          className={`command-stage-tab ${activeStage === 'mkl' ? 'active-etsy' : ''}`}
          onClick={() => setActiveStage('mkl')}
        >
          <Database size={18} />
          <span>📊 Stage 3: Ma Trận 13 Tags & Từ Khóa Etsy</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* 3. FOCUSED STAGE WORKSPACE CONTENT                       */}
      {/* ======================================================== */}

      {/* STAGE 1: WORKFLOW ENGINE */}
      {activeStage === 'workflow' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Top Sellers Deep Reverse-Engineer Scanner */}
          <EtsyMultiSellerScanner
            seedPhrase={seedPhrase}
            category={selectedCategory}
            onShowToast={onShowToast}
            onViewHistory={onViewHistory}
            onSellersUpdated={setScannedSellers}
            initialSellers={mcpResult?.sellers || scannedSellers}
          />

          {/* MCP Real-Time Result Action Card & Dropzone */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '20px' }}>
            
            {/* Live MCP Results & 1-Click Generator */}
            <div className="studio-panel" style={{ padding: '22px', borderLeft: '4px solid #ea580c', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#c2410c' }}>
                    🏷️ Observed Etsy MCP Tags Cho "{seedPhrase}"
                  </h4>
                  <p style={{ margin: '2px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                    Tuân thủ nghiêm ngặt quy định Etsy Search ($\le 20$ ký tự/tag, lọc sạch từ cấm IP).
                  </p>
                </div>

                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setActiveStage('research')}
                  style={{ background: '#c2410c', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, cursor: 'pointer' }}
                >
                  <span>➡️ Chốt Evidence Stage 1 & Chuyển Sang Stage 2 (Research DNA)</span>
                </button>
              </div>

              {mcpResult ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {mcpResult.keywords.map((kw, i) => (
                    <span key={i} style={{ background: '#ffedd5', color: '#9a3412', padding: '5px 12px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, border: '1px solid #fed7aa' }}>
                      #{i + 1} {kw}
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ background: 'var(--bg-subtle)', borderRadius: '8px', padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Bấm "⚡ Auto-Pull Live Tags" ở thanh trên cùng để tải tag evidence trực tiếp từ MCP cho "{seedPhrase}".
                </div>
              )}
            </div>

            {/* Drag & Drop File Parser (eRank / Everbee / YTrends) */}
            <div 
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFileUpload(e.dataTransfer.files[0]);
              }}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${isDragging ? '#ea580c' : 'var(--border-strong)'}`,
                background: isDragging ? '#fff7ed' : 'var(--bg-surface)',
                borderRadius: '12px',
                padding: '22px 18px',
                textAlign: 'center',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
              }}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                accept=".xlsx,.xls,.csv,.html,.htm"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) handleFileUpload(e.target.files[0]);
                }}
              />
              <FileSpreadsheet size={26} style={{ color: '#ea580c' }} />
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {uploading ? 'Đang phân tích...' : 'Nạp file eRank / EverBee / YTrends (.csv / .html)'}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Hỗ trợ bóc tách danh sách từ khóa và chỉ số bán hàng từ file xuất
              </div>
            </div>

          </div>
        </div>
      )}

      {/* STAGE 2: DEEP RESEARCH & DNA MIRROR (2-COLUMN GRID) */}
      {activeStage === 'research' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
            {/* Google Trends Velocity */}
            <GoogleTrendsWidget seedPhrase={seedPhrase} onShowToast={onShowToast} />
            
            {/* Etsy Learning Box */}
            <LearningBoxWidget platform="ETSY" onShowToast={onShowToast} scannedSellers={scannedSellers} />
          </div>

          {/* Stage 2 Acceptance Gate */}
          <div className="studio-panel" style={{ padding: '20px 24px', borderLeft: '4px solid #ea580c', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff7ed', borderRadius: '12px' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: '#c2410c' }}>
                🧠 Stage 2: Competitor DNA & Trend Recheck Completed
              </div>
              <div style={{ fontSize: '0.8rem', color: '#ea580c', marginTop: '2px' }}>
                Xác nhận từ khóa hạt nhân "{seedPhrase}" và mẫu listing Etsy từ 30 benchmark sellers đã được duyệt đưa vào MKL.
              </div>
            </div>

            <button
              onClick={() => setActiveStage('mkl')}
              className="btn btn-primary"
              style={{ background: '#ea580c', fontWeight: 800, padding: '10px 20px', borderRadius: '8px', cursor: 'pointer' }}
            >
              <span>➡️ Chấp Nhận Research DNA & Mở Khóa Stage 3 (MKL & Controlled Drafts)</span>
            </button>
          </div>
        </div>
      )}

      {/* STAGE 3: MASTER KEYWORD INTELLIGENCE */}
      {activeStage === 'mkl' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff7ed', border: '1px solid #fed7aa', padding: '16px 20px', borderRadius: '12px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ margin: 0, color: '#ea580c', fontWeight: 800, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={20} />
                BƯỚC 3: Master Tag Matrix (Etsy 13 Tags Model) & Sinh Listing Etsy SEO
              </h3>
              <p style={{ margin: '4px 0 0 0', color: '#9a3412', fontSize: '0.85rem' }}>
                Tự động bóc tách và tạo Bộ Listing Etsy SEO chuẩn 13 Tags (mỗi tag &le; 20 chars) & Title thân thiện người mua (&le; 140 chars).
              </p>
            </div>

            <button
              onClick={() => {
                if (!trends[0]?.id) {
                  if (onShowToast) onShowToast('Chưa có dữ liệu từ khóa Etsy nào. Hãy "⚡ Auto-Pull Live Tags" hoặc nạp file trước.');
                  return;
                }
                handleManualDraft(trends[0].id);
              }}
              disabled={draftingTrendId !== null || !trends[0]?.id}
              className="btn btn-primary"
              title={!trends[0]?.id ? 'Auto-Pull 13 Tags hoặc nạp file trước khi tạo listing' : undefined}
              style={{
                background: '#ea580c',
                fontWeight: 800,
                padding: '10px 22px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(234, 88, 12, 0.25)',
                opacity: (draftingTrendId !== null || !trends[0]?.id) ? 0.6 : 1,
                cursor: (draftingTrendId !== null || !trends[0]?.id) ? 'not-allowed' : 'pointer'
              }}
            >
              <Zap size={16} className={draftingTrendId !== null ? 'spinner' : ''} />
              <span>{draftingTrendId !== null ? 'Đang tạo Etsy Listing...' : '🚀 TẠO ETSY LISTING (13 TAGS + BUYER FRIENDLY TITLE)'}</span>
            </button>
          </div>

          <MasterKeywordTable marketplace="ETSY" onShowToast={onShowToast} />
        </div>
      )}


      {/* Unified IP Gate Modal */}
      <UnifiedIpGateModal
        isOpen={isIpModalOpen}
        onClose={() => setIsIpModalOpen(false)}
        onShowToast={onShowToast}
      />

      {/* Feed Etsy Search Results Modal */}
      {isFeedModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            maxWidth: '650px',
            width: '100%',
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            padding: '28px',
            border: '1px solid #fed7aa'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: '#ecfdf5', color: '#059669', padding: '8px', borderRadius: '10px' }}>
                  <Sparkles size={20} />
                </div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', fontWeight: 800 }}>
                  🔗 Tự Động Kéo Dữ Liệu Từ Link Tìm Kiếm Etsy
                </h3>
              </div>
              <button
                onClick={() => setIsFeedModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: '#475569', margin: '0 0 14px 0', lineHeight: 1.5 }}>
              Chỉ cần copy đường link trang tìm kiếm Etsy (hoặc các link listing cụ thể) dán vào đây. Hệ thống sẽ tự động bóc tách từ khóa hạt nhân, cào <b>30 Sellers thực tế</b> và <b>13 Tags chuẩn 100%</b>!
            </p>

            <textarea
              value={feedRawText}
              onChange={(e) => setFeedRawText(e.target.value)}
              placeholder="Dán link trang tìm kiếm Etsy hoặc các link listing tại đây...&#10;Ví dụ:&#10;https://www.etsy.com/search?q=para%20mi%20hija&ref=search_bar&#10;https://www.etsy.com/listing/4463297405"
              rows={6}
              style={{
                width: '100%',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                padding: '12px',
                fontSize: '0.85rem',
                fontFamily: 'inherit',
                marginBottom: '14px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setFeedRawText('https://www.etsy.com/search?q=para%20mi%20hija&ref=search_bar')}
                style={{
                  background: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  color: '#475569',
                  fontSize: '0.75rem',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                + Thử link mẫu: para mi hija
              </button>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setIsFeedModalOpen(false)}
                  className="btn btn-secondary"
                  style={{ padding: '8px 16px', borderRadius: '8px' }}
                >
                  Hủy bỏ
                </button>
                <button
                  onClick={handleFeedSearchResults}
                  disabled={feedSubmitting || !feedRawText.trim()}
                  className="btn btn-primary"
                  style={{
                    background: '#059669',
                    color: '#fff',
                    fontWeight: 700,
                    padding: '8px 20px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: (feedSubmitting || !feedRawText.trim()) ? 'not-allowed' : 'pointer'
                  }}
                >
                  <Zap size={16} />
                  <span>{feedSubmitting ? 'Đang kéo dữ liệu...' : '⚡ Tự Động Kéo Dữ Liệu'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
