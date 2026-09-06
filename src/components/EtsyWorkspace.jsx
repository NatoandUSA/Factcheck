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
import SmartPullAnalyticsBar from './SmartPullAnalyticsBar';
import ProjectSetupCard from './ProjectSetupCard';
import ProjectEvidenceGate from './ProjectEvidenceGate';
import { parseJsonResponse } from '../utils/apiResponse';
import { createProjectBoundLoader } from '../utils/projectBoundLoader.js';

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
  const [projects, setProjects] = useState([]);
  const [isFeedModalOpen, setIsFeedModalOpen] = useState(false);
  const [feedRawText, setFeedRawText] = useState('');
  const [feedFile, setFeedFile] = useState(null);
  const [feedPreview, setFeedPreview] = useState(null);
  const [feedSubmitting, setFeedSubmitting] = useState(false);
  const [scannedSellers, setScannedSellers] = useState([]);
  const [evidenceHealth, setEvidenceHealth] = useState(null);
  const fileInputRef = useRef(null);
  const feedFileInputRef = useRef(null);
  const activeProjectIdRef = useRef(null);
  activeProjectIdRef.current = activeProject?.id || null;
  const persistedSearchLoaderRef = useRef(null);
  if (!persistedSearchLoaderRef.current) persistedSearchLoaderRef.current = createProjectBoundLoader();

  const refreshEvidenceHealth = React.useCallback(async (projectId) => {
    if (!projectId) return;
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/evidence-health`, { credentials: 'include' });
      const payload = await parseJsonResponse(response);
      if (response.ok && payload.success && activeProjectIdRef.current === projectId) setEvidenceHealth(payload.health || null);
    } catch (_) {
      // Evidence Health is guidance only. A failed refresh never changes
      // evidence or workflow state.
    }
  }, []);

  useEffect(() => {
    setMcpResult(null);
    setScannedSellers([]);
    setTrends([]);
    setUploadStatus(null);
    setFeedRawText('');
    setFeedFile(null);
    setFeedPreview(null);
    setEvidenceHealth(null);
    setSeedPhrase(activeProject?.seed_phrase || '');
  }, [activeProject?.id]);

  useEffect(() => {
    const projectId = activeProject?.id;
    const clear = () => {
      setScannedSellers([]);
      setMcpResult(null);
      setFeedPreview(null);
    };
    persistedSearchLoaderRef.current.load({
      projectId,
      url: `/api/projects/${encodeURIComponent(projectId || '')}/research-imports/ETSY_SEARCH_PASTE_V1`,
      clear,
      select: data => {
        if (data.import === null) return null;
        const metadata = data.import?.metadata;
        if (!metadata || !Array.isArray(metadata.sellers) || !Array.isArray(metadata.keywordCandidates)) {
          throw new Error('ETSY_REHYDRATION_MALFORMED');
        }
        return { source: data.import.source, metadata };
      },
      apply: ({ source, metadata }) => {
        setScannedSellers(metadata.sellers);
        setMcpResult({
          source,
          evidenceState: metadata.evidenceState,
          provider: metadata.provider,
          observedAt: metadata.observedAt,
          importedAt: metadata.importedAt,
          keywords: metadata.keywordCandidates,
          sellers: metadata.sellers,
          trendingKeywordsStr: metadata.keywordCandidates.join(', ')
        });
      },
      onError: error => onShowToast?.(
        `Không thể tải lại dữ liệu Etsy cho project hiện tại: ${error.message || 'UNKNOWN_ERROR'}`,
        'error'
      )
    });
    return () => persistedSearchLoaderRef.current.dispose();
  }, [activeProject?.id]);

  const handleFeedSearchResults = async ({ confirm = false } = {}) => {
    if (!activeProject?.id) {
      if (onShowToast) onShowToast('Hãy chọn Active Project trước khi nạp Etsy Feed.');
      return;
    }
    const requestedProjectId = activeProject.id;
    if (!feedFile && !feedRawText.trim()) {
      if (onShowToast) onShowToast('Chọn CSV/HTML/TXT hoặc dán toàn bộ nội dung kết quả tìm kiếm.');
      return;
    }
    setFeedSubmitting(true);
    try {
      const request = feedFile
        ? (() => {
            const body = new FormData();
            body.append('searchResultsFile', feedFile);
            body.append('seed', seedPhrase.trim());
            body.append('projectId', String(requestedProjectId));
            body.append('confirm', String(confirm));
            return { url: '/api/etsy/feed-search-results-file', options: { method: 'POST', credentials: 'include', body } };
          })()
        : {
            url: '/api/etsy/feed-search-results',
            options: {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ rawText: feedRawText, seed: seedPhrase.trim(), projectId: requestedProjectId, confirm })
            }
          };
      const res = await fetch(request.url, request.options);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to feed Etsy search data');
      if (activeProjectIdRef.current !== requestedProjectId) return;

      if (data.preview && !data.committed) {
        setFeedPreview(data);
        if (onShowToast) onShowToast(`Đã parse ${data.sellers?.length || 0} listing blocks. Hãy kiểm tra Preview trước khi lưu.`);
        return;
      }

      if (data.seed) {
        setSeedPhrase(data.seed);
      }
      if (Array.isArray(data.sellers) && data.sellers.length > 0) {
        setScannedSellers(data.sellers);
      }
      if (Array.isArray(data.keywords) && data.keywords.length > 0) {
        setMcpResult({
          source: data.source,
          evidenceState: data.evidenceState,
          provider: data.provider || null,
          observedAt: data.observedAt || null,
          importedAt: data.importedAt || null,
          keywords: data.keywords,
          sellers: data.sellers,
          trendingKeywordsStr: data.keywords.join(', ')
        });
      }
      if (onShowToast) onShowToast(`✓ Đã lưu ${data.sellers?.length || 0} listing evidence vào Project #${requestedProjectId}. Tags được ghi rõ là HeyEtsy suggestions.`);
      setIsFeedModalOpen(false);
      setFeedRawText('');
      setFeedFile(null);
      setFeedPreview(null);
      await refreshEvidenceHealth(requestedProjectId);
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
      if (res.ok && data.success && Array.isArray(data.projects)) {
        setProjects(data.projects);
        setActiveProject(prev => prev ? (data.projects.find(project => project.id === prev.id) || null) : null);
        return data.projects;
      }
    } catch (e) {}
    return [];
  }, []);

  const handleProjectCreated = async ({ id, seedPhrase: createdSeed }) => {
    const loaded = await fetchProjects();
    const project = loaded.find(item => Number(item.id) === Number(id));
    setActiveProject(project || null);
    setSeedPhrase(createdSeed);
    setActiveStage('workflow');
  };

  const fetchData = async () => {
    if (!activeProject?.id) {
      setTrends([]);
      setEvidenceHealth(null);
      return;
    }
    const requestedProjectId = activeProject.id;
    await refreshEvidenceHealth(requestedProjectId);
    try {
      const trendsRes = await fetch(`/api/trends?projectId=${encodeURIComponent(requestedProjectId)}`, { credentials: 'include' });
      if (trendsRes.ok) {
        const trendsData = await trendsRes.json();
        if (activeProjectIdRef.current !== requestedProjectId || Number(trendsData.projectId) !== Number(requestedProjectId)) return;
        const etsyTrends = Array.isArray(trendsData.trends)
          ? trendsData.trends.filter(trend => trend.keywords_detailed)
          : [];
        setTrends(etsyTrends);
      }
    } catch (e) {
      console.warn('Failed to fetch Etsy workspace data', e);
    }
  };

  useEffect(() => {
    fetchData();
    fetchProjects();
  }, [fetchProjects, activeProject?.id, refreshEvidenceHealth]);
  const handleTransition = async (targetState) => {
    if (!activeProject) return;
    const requestedProjectId = activeProject.id;
    try {
      const res = await fetch(`/api/projects/${activeProject.id}/transition`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetState })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Transition failed');
      if (activeProjectIdRef.current !== requestedProjectId) return false;
      if (onShowToast) onShowToast(`✓ Chuyển trạng thái dự án sang ${data.state} thành công!`);
      setActiveProject(prev => prev?.id === requestedProjectId ? ({ ...prev, state: data.state }) : prev);
      fetchProjects();
      return true;
    } catch (err) {
      if (onShowToast) onShowToast(`⚠ Transition error: ${err.message}`);
      return false;
    }
  };

  const handleFileUpload = async (file) => {
    if (!file) return;
    if (!activeProject?.id) {
      if (onShowToast) onShowToast('Hãy chọn Active Project trước khi nạp dữ liệu Etsy.');
      return;
    }
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
    if (!activeProject?.id) {
      if (onShowToast) onShowToast('Hãy chọn Active Project trước khi tạo listing.');
      return;
    }
    setDraftingTrendId(trendId);
    try {
      const res = await fetch(`/api/trends/${trendId}/draft`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProject.id })
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
    if (!activeProject?.id) {
      if (onShowToast) onShowToast('Hãy chọn Active Project trước khi kéo dữ liệu MCP.');
      return;
    }
    if (!seedPhrase.trim()) {
      if (onShowToast) onShowToast('Vui lòng nhập Từ khóa Hạt nhân (Seed Phrase).');
      return;
    }
    const requestedProjectId = activeProject.id;

    setMcpPulling(true);
    setMcpResult(null);

    try {
      const res = await fetch('/api/mcp/pull-etsy', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: requestedProjectId,
          seed: seedPhrase.trim(),
          category: selectedCategory
        })
      });

      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data.error || 'Failed to pull Etsy MCP');
      if (activeProjectIdRef.current !== requestedProjectId) return;

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
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: '260px' }}>
          <label htmlFor="etsy-active-project" style={{ fontSize: '0.72rem', fontWeight: 800, color: '#9a3412' }}>
            Active Project (bắt buộc)
          </label>
          <select
            id="etsy-active-project"
            value={activeProject?.id || ''}
            onChange={(event) => {
              const selectedId = Number(event.target.value);
              const selected = projects.find(project => project.id === selectedId) || null;
              setActiveProject(selected);
              setSeedPhrase(selected?.seed_phrase || '');
              setActiveStage('workflow');
            }}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #fdba74', background: '#fff' }}
          >
            <option value="">— Chọn project —</option>
            {projects.map(project => (
              <option key={project.id} value={project.id}>
                #{project.id} {project.name || project.seed_phrase || 'Untitled'} — {project.state}
              </option>
            ))}
          </select>
        </div>
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
              {activeProject.state === 'EVIDENCE_INTAKE' && <span style={{ fontSize: '0.72rem' }}>Accept evidence ở Gate bên dưới</span>}
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
            onClick={() => activeProject ? setIsFeedModalOpen(true) : onShowToast?.('Tạo hoặc chọn Active Project trước khi mở Etsy Feed.')}
            disabled={!activeProject}
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
            cursor: activeProject ? 'pointer' : 'not-allowed',
            opacity: activeProject ? 1 : 0.6,
              marginTop: '15px'
            }}
            title="Nạp CSV, HTML, TXT hoặc text Etsy/HeyEtsy; luôn xem Preview trước khi lưu"
          >
            <Sparkles size={16} color="#059669" />
            <span>📥 Nạp kết quả Etsy</span>
          </button>

          <button
            onClick={handleMcpPull}
            disabled={mcpPulling || !activeProject || !seedPhrase.trim()}
            className="btn btn-primary"
            style={{
              background: '#ea580c',
              fontWeight: 800,
              padding: '9px 18px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: (mcpPulling || !activeProject || !seedPhrase.trim()) ? 'not-allowed' : 'pointer',
              marginTop: '15px',
              boxShadow: '0 4px 12px rgba(234, 88, 12, 0.25)'
            }}
          >
            <RefreshCw size={16} className={mcpPulling ? 'spinner' : ''} />
            <span>{mcpPulling ? 'Đang kéo MCP...' : '⚡ Auto-Pull Live Tags (MCP)'}</span>
          </button>
        </div>
      </div>

      {!activeProject && <ProjectSetupCard marketplace="ETSY" seedPhrase={seedPhrase} onCreated={handleProjectCreated} onShowToast={onShowToast} accent="#ea580c" />}

      <SmartPullAnalyticsBar
        marketplace="ETSY"
        activeProjectId={activeProject?.id || null}
        initialSeed={seedPhrase}
        onShowToast={onShowToast}
        onProceedToDraft={({ seed, tags, intelligence }) => {
          if (seed) setSeedPhrase(seed);
          const sellers = Array.isArray(intelligence?.listings) ? intelligence.listings : [];
          setScannedSellers(sellers);
          setMcpResult({
            source: intelligence?.source || 'SMART_PULL',
            evidenceState: intelligence?.evidenceState || null,
            provider: intelligence?.provider || null,
            observedAt: intelligence?.observedAt || null,
            importedAt: intelligence?.importedAt || null,
            keywords: Array.isArray(tags) ? tags : [],
            sellers,
            trendingKeywordsStr: Array.isArray(tags) ? tags.join(', ') : ''
          });
          setActiveStage('workflow');
        }}
      />

      <ProjectEvidenceGate activeProject={activeProject} onTransition={handleTransition} onShowToast={onShowToast} accent="#ea580c" />

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
            disabled={!activeProject || activeProject.state === 'EVIDENCE_INTAKE'}
        >
          <Brain size={18} />
          <span>🧠 Stage 2: Nghiên Cứu Sâu & Học DNA Đối Thủ (Research Hub)</span>
        </button>

          <button
            className={`command-stage-tab ${activeStage === 'mkl' ? 'active-etsy' : ''}`}
            onClick={() => setActiveStage('mkl')}
            disabled={!activeProject || !['MKL_FROZEN', 'DRAFT_GENERATED', 'PRODUCT_TRUTH_VERIFIED', 'PRODUCT_TRUTH_CONFIRMED', 'VALIDATED', 'MANAGER_APPROVED', 'PUBLISH_READY'].includes(activeProject.state)}
        >
          <Database size={18} />
          <span>📊 Stage 3: Ma Trận 13 Tags & Từ Khóa Etsy</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* 3. FOCUSED STAGE WORKSPACE CONTENT                       */}
      {/* ======================================================== */}

      {/* STAGE 1: WORKFLOW ENGINE */}
      <div style={{ display: activeStage === 'workflow' ? 'flex' : 'none', flexDirection: 'column', gap: '20px' }}>
          
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
                  onClick={async () => {
                    if (!activeProject) {
                      onShowToast?.('Tạo hoặc chọn Active Project trước khi chuyển Stage 2.');
                      return;
                    }
                    if (activeProject?.state === 'EVIDENCE_INTAKE') {
                      const transitioned = await handleTransition('RESEARCH_ACCEPTED');
                      if (!transitioned) return;
                      setActiveStage('research');
                      return;
                    }
                    if (activeProject.state !== 'RESEARCH_ACCEPTED') {
                      onShowToast?.('Accept evidence đủ điều kiện trước khi vào Research DNA.');
                      return;
                    }
                    setActiveStage('research');
                  }}
                  disabled={!activeProject || !mcpResult}
                  title={!activeProject ? 'Chọn Active Project trước.' : !mcpResult ? 'Nạp observed research từ MCP hoặc Etsy Feed trước.' : undefined}
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

      {/* STAGE 2: DEEP RESEARCH & DNA MIRROR (2-COLUMN GRID) */}
      {activeStage === 'research' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
            {/* Google Trends Velocity */}
            <GoogleTrendsWidget seedPhrase={seedPhrase} onShowToast={onShowToast} />
            
            {/* Etsy Learning Box */}
            <LearningBoxWidget platform="ETSY" onShowToast={onShowToast} scannedSellers={scannedSellers} />
          </div>

          <div className="studio-panel" style={{ padding: '18px', borderLeft: '4px solid #2563eb' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div><h4 style={{ margin: 0 }}>Evidence Health — Project research</h4><p style={{ margin: '5px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Bạn đang có dữ liệu gì, thiếu gì và cần làm gì tiếp. Chỉ hiển thị tình trạng dữ liệu, không chấm điểm hoặc đổi workflow.</p></div>
              <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#1d4ed8' }}>{evidenceHealth?.scope || 'READ_ONLY_RESEARCH_STATUS'}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(205px, 1fr))', gap: '9px', marginTop: '12px' }}>
              {(evidenceHealth?.layers || []).map(layer => <div key={layer.key} style={{ border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px', background: '#f8fbff' }}>
                <div style={{ fontWeight: 800, fontSize: '0.8rem' }}>{layer.label}</div>
                <div style={{ marginTop: '3px', color: layer.state === 'MAPPED' ? '#047857' : '#64748b', fontWeight: 700, fontSize: '0.75rem' }}>{layer.state} · {layer.count}</div>
                <div style={{ marginTop: '5px', fontSize: '0.7rem', color: '#475569' }}><b>Source:</b> {Array.isArray(layer.provenance) ? layer.provenance.join(', ') : layer.provenance}</div>
                <div style={{ marginTop: '3px', fontSize: '0.7rem', color: '#475569' }}><b>DB:</b> {(layer.dbStates || []).join(', ')} · <b>Semantic:</b> {(layer.semanticStates || []).join(', ')}</div>
                {(layer.dbStates || []).includes('OBSERVED') && <div style={{ marginTop: '3px', fontSize: '0.7rem', color: '#9a3412' }}><b>OBSERVED</b> = đã ghi nhận trong evidence ledger, không đồng nghĩa dữ liệu đã được xác minh độc lập.</div>}
                <div style={{ marginTop: '3px', fontSize: '0.7rem', color: '#475569' }}><b>Observed:</b> {layer.observedAt} · <b>Imported:</b> {layer.importedAt}</div>
                <div style={{ marginTop: '5px', fontSize: '0.7rem', color: '#475569' }}>{layer.allowedUse}</div>
              </div>)}
            </div>
            {evidenceHealth && <><div style={{ marginTop: '10px', fontSize: '0.75rem' }}><b>Freshness:</b> observed {evidenceHealth.freshness?.observedAt || 'UNKNOWN'} · imported {evidenceHealth.freshness?.importedAt || 'UNKNOWN'} · capture {evidenceHealth.freshness?.oldestCaptureAt || 'UNKNOWN'} → {evidenceHealth.freshness?.newestCaptureAt || 'UNKNOWN'}</div><div style={{ marginTop: '5px', fontSize: '0.75rem' }}><b>Field coverage:</b> {Object.entries(evidenceHealth.fieldCoverage || {}).map(([field, value]) => `${field}: ${value.known}/${value.total} (${value.coveragePercent}%, ${value.status})`).join(' · ') || 'UNKNOWN'}</div><div style={{ marginTop: '5px', fontSize: '0.75rem' }}><b>Coverage groups:</b> {Object.entries(evidenceHealth.fieldGroups || {}).map(([group, value]) => `${group}: ${value.known}/${value.total} (${value.coveragePercent}%, ${value.status})`).join(' · ') || 'UNKNOWN'}</div>{(evidenceHealth.summary?.rowAccounting || []).length > 0 && <div style={{ marginTop: '5px', fontSize: '0.75rem' }}><b>CSV row receipt:</b> {(evidenceHealth.summary.rowAccounting || []).map(item => `${item.status}: input ${item.inputRows ?? 'UNKNOWN'} · valid ${item.validRows ?? 'UNKNOWN'} · unique ${item.uniqueRows ?? 'UNKNOWN'} · deduped ${item.duplicateRowsRemoved ?? 'UNKNOWN'} · returned ${item.returnedRows ?? 'UNKNOWN'} · truncated ${item.truncatedRows ?? 'UNKNOWN'}`).join(' | ')}</div>}{(evidenceHealth.summary?.unmappedSourceColumns || []).length > 0 && <div style={{ marginTop: '5px', fontSize: '0.75rem', color: '#9a3412' }}><b>UNMAPPED source columns:</b> {evidenceHealth.summary.unmappedSourceColumns.join(', ')}</div>}</>}
            {(evidenceHealth?.actions || []).length > 0 && <div style={{ marginTop: '9px', padding: '9px', borderRadius: '7px', background: '#fff7ed', fontSize: '0.75rem' }}><b>Next action:</b> {evidenceHealth.actions[0]}</div>}
          </div>

          {/* Stage 2 Acceptance Gate */}
          <div className="studio-panel" style={{ padding: '20px 24px', borderLeft: '4px solid #ea580c', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff7ed', borderRadius: '12px' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: '#c2410c' }}>
                🧠 Stage 2: Competitor DNA & Trend Research
              </div>
              <div style={{ fontSize: '0.8rem', color: '#ea580c', marginTop: '2px' }}>
                Review dữ liệu observed trước khi accept DNA. Chỉ evidence đã accept và project ở RESEARCH_ACCEPTED mới mở bước này.
              </div>
            </div>

            <button
              onClick={async () => {
                if (activeProject?.state === 'RESEARCH_ACCEPTED') {
                  await handleTransition('DNA_ACCEPTED');
                } else if (onShowToast) {
                  onShowToast('Project phải ở trạng thái RESEARCH_ACCEPTED trước khi chấp nhận DNA.');
                }
              }}
              disabled={activeProject?.state !== 'RESEARCH_ACCEPTED'}
              className="btn btn-primary"
              style={{ background: '#ea580c', fontWeight: 800, padding: '10px 20px', borderRadius: '8px', cursor: 'pointer' }}
            >
              <span>➡️ Chấp Nhận Research DNA (sau đó Freeze MKL để mở Stage 3)</span>
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

          <MasterKeywordTable marketplace="ETSY" activeProjectId={activeProject?.id || null} onShowToast={onShowToast} />
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
            maxWidth: '1050px',
            maxHeight: '90vh',
            overflowY: 'auto',
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
                  📋 Nạp kết quả Etsy vào Project
                </h3>
              </div>
              <button
                onClick={() => { setIsFeedModalOpen(false); setFeedPreview(null); setFeedFile(null); }}
                style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: '#475569', margin: '0 0 14px 0', lineHeight: 1.5 }}>
              Ưu tiên chọn <b>CSV export</b> hoặc <b>HTML Etsy đã lưu</b>; clipboard HeyEtsy vẫn được hỗ trợ. Dữ liệu giữ <b>thứ tự nguồn</b>, giữ số <b>0</b> khác với UNKNOWN và không tự được gọi là “Top Seller”. Chúng dùng để phân tích pattern/keyword, không tự thành Product Truth hay publish evidence.
            </p>

            <div style={{ marginBottom: '14px', padding: '9px 12px', borderRadius: '8px', background: '#eef2ff', color: '#3730a3', fontSize: '0.78rem', fontWeight: 700 }}>
              Active Project: {activeProject?.id ? `#${activeProject.id} — ${activeProject.name || activeProject.seed_phrase}` : 'Chưa chọn Project'} · Smart Pull dùng URL/seed để hỏi MCP; hộp này dùng file/text bạn đã thu thập.
            </div>

            {!feedPreview ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px', marginBottom: '14px', fontSize: '0.76rem' }}>
                  <div style={{ padding: '10px', borderRadius: '8px', background: '#ecfdf5', border: '1px solid #a7f3d0' }}><b>1. Chọn nguồn</b><br />CSV / HTML / TXT hoặc paste.</div>
                  <div style={{ padding: '10px', borderRadius: '8px', background: '#eff6ff', border: '1px solid #bfdbfe' }}><b>2. Xem Preview</b><br />Kiểm tra title, shop, giá và UNKNOWN.</div>
                  <div style={{ padding: '10px', borderRadius: '8px', background: '#fff7ed', border: '1px solid #fed7aa' }}><b>3. Xác nhận lưu</b><br />Lưu artifact audit có hash, không mở publish.</div>
                </div>
                <input ref={feedFileInputRef} type="file" accept=".csv,.html,.htm,.txt,text/csv,text/html,text/plain" onChange={(event) => { setFeedFile(event.target.files?.[0] || null); setFeedRawText(''); setFeedPreview(null); }} style={{ display: 'none' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', marginBottom: '12px', border: '1px dashed #34d399', borderRadius: '10px', background: '#f0fdf4' }}>
                  <FileSpreadsheet size={20} color="#059669" />
                  <div style={{ flex: 1, fontSize: '0.8rem' }}><b>{feedFile ? feedFile.name : 'Chưa chọn file'}</b><br /><span style={{ color: '#475569' }}>CSV export phù hợp để giữ toàn bộ dòng kết quả; HTML Etsy đã lưu dùng ItemList có sẵn.</span></div>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => feedFileInputRef.current?.click()}>Chọn file</button>
                  {feedFile && <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setFeedFile(null); if (feedFileInputRef.current) feedFileInputRef.current.value = ''; }}>Bỏ file</button>}
                </div>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', marginBottom: '6px' }}>Hoặc dán text HeyEtsy (không cần khi đã chọn file)</div>
              <textarea
                value={feedRawText}
                disabled={Boolean(feedFile)}
                onChange={(e) => { setFeedRawText(e.target.value); setFeedFile(null); setFeedPreview(null); }}
                placeholder={'Dán toàn bộ text search result tại đây…\n\nVí dụ cấu trúc:\n413 results, with ads\nMost relevant\nSearch results\n[Listing title]\n[Listing title]\n4.7\n(113)\nBy\n[Shop name]\n…\nHeyEtsy.com'}
                rows={12}
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
              </>
            ) : (
              <div style={{ marginBottom: '16px', display: 'grid', gap: '12px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '0.78rem' }}>
                  <span className="badge">Parsed: {feedPreview.count} listings</span>
                  <span className="badge">Nguồn: {feedPreview.inputFormat}{feedPreview.sourceFileName ? ` · ${feedPreview.sourceFileName}` : ''}</span>
                  <span className="badge">Results page: {feedPreview.searchContext?.resultCount ?? 'UNKNOWN'}</span>
                  <span className="badge">Sort: {feedPreview.searchContext?.sortMode || 'UNKNOWN'}</span>
                  <span className="badge">Contains ads: {feedPreview.searchContext?.pageContainsAds ? 'YES' : 'UNKNOWN/NO'}</span>
                  <span className="badge">Duplicates removed: {feedPreview.duplicatesRemoved || 0}</span>
                  <span className="badge">Tags suggestions: {feedPreview.keywords?.length || 0}</span>
                </div>
                <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '10px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                        <th style={{ padding: '8px' }}>Rank nguồn</th>
                        <th style={{ padding: '8px' }}>Listing / Shop</th>
                        <th style={{ padding: '8px' }}>Rating</th>
                        <th style={{ padding: '8px' }}>Giá</th>
                        <th style={{ padding: '8px' }}>Total Views</th>
                        <th style={{ padding: '8px' }}>Total Sold</th>
                        <th style={{ padding: '8px' }}>24h</th>
                        <th style={{ padding: '8px' }}>Tags</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(feedPreview.sellers || []).map(seller => (
                        <tr key={seller.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '8px', fontWeight: 800 }}>#{seller.sourceRank}</td>
                          <td style={{ padding: '8px', minWidth: '260px' }}>
                            <div style={{ fontWeight: 700 }}>{seller.title || 'UNKNOWN'}</div>
                            <div style={{ color: '#64748b' }}>{seller.shopName || 'Shop UNKNOWN'}</div>
                          </td>
                          <td style={{ padding: '8px' }}>{seller.rating ?? '—'} ({seller.reviewCount ?? '—'})</td>
                          <td style={{ padding: '8px' }}>{seller.price || '—'}</td>
                          <td style={{ padding: '8px' }}>{seller.totalViews ?? '—'}</td>
                          <td style={{ padding: '8px' }}>{seller.totalSold ?? '—'}</td>
                          <td style={{ padding: '8px' }}>Views {seller.views24h ?? '—'} / Sold {seller.sold24h ?? '—'}</td>
                          <td style={{ padding: '8px' }}>{seller.tags?.length || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ fontSize: '0.76rem', color: '#92400e', background: '#fffbeb', padding: '9px 11px', borderRadius: '8px' }}>
                  Preview chưa ghi DB hoặc file. “Most relevant” có thể chứa quảng cáo; hệ thống không gọi các dòng này là Top Seller và không xếp hạng lại khi metric UNKNOWN. Khi lưu, đây vẫn là `UNVERIFIED_INPUT`, không phải evidence đủ điều kiện Research Accepted.
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  if (feedPreview) setFeedPreview(null);
                  else { setFeedRawText(''); setFeedFile(null); if (feedFileInputRef.current) feedFileInputRef.current.value = ''; }
                }}
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
                {feedPreview ? '← Sửa nội dung paste' : 'Xóa nội dung'}
              </button>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                onClick={() => { setIsFeedModalOpen(false); setFeedPreview(null); setFeedFile(null); }}
                  className="btn btn-secondary"
                  style={{ padding: '8px 16px', borderRadius: '8px' }}
                >
                  Hủy bỏ
                </button>
                {!feedPreview ? (
                  <button
                    onClick={() => handleFeedSearchResults({ confirm: false })}
                    disabled={feedSubmitting || (!feedFile && !feedRawText.trim()) || !activeProject?.id}
                    className="btn btn-primary"
                    style={{ background: '#059669', color: '#fff', fontWeight: 700, padding: '8px 20px', borderRadius: '8px' }}
                  >
                    <Zap size={16} /> {feedSubmitting ? 'Đang phân tích…' : 'Phân tích & Xem trước'}
                  </button>
                ) : (
                  <button
                    onClick={() => handleFeedSearchResults({ confirm: true })}
                    disabled={feedSubmitting || !activeProject?.id}
                    className="btn btn-primary"
                    style={{ background: '#059669', color: '#fff', fontWeight: 700, padding: '8px 20px', borderRadius: '8px' }}
                  >
                    <Database size={16} /> {feedSubmitting ? 'Đang lưu…' : `Xác nhận lưu ${feedPreview.count} listings`}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
