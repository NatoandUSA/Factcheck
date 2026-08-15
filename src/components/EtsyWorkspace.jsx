import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, Zap, RefreshCw, FileSpreadsheet, UploadCloud, CheckCircle2, 
  AlertCircle, ShieldCheck, Tag, ShoppingBag, Eye, DollarSign, ArrowRight
} from 'lucide-react';
import GoogleTrendsWidget from './GoogleTrendsWidget';
import UnifiedIpGateModal from './UnifiedIpGateModal';

export default function EtsyWorkspace({ onSelectListing, onApproveListing, onShowToast }) {
  const [seedPhrase, setSeedPhrase] = useState('nurse sweatshirt');
  const [selectedCategory, setSelectedCategory] = useState('Apparel: Sweatshirt');
  const [mcpPulling, setMcpPulling] = useState(false);
  const [mcpResult, setMcpResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [draftingTrendId, setDraftingTrendId] = useState(null);
  const [isIpModalOpen, setIsIpModalOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [trends, setTrends] = useState([]);
  const fileInputRef = useRef(null);

  const fetchData = async () => {
    try {
      const trendsRes = await fetch('http://localhost:3001/api/trends');
      if (trendsRes.ok) {
        const tr = await trendsRes.json();
        setTrends(tr.filter(t => t.source === 'ETSY_MCP_LIVE' || (t.category && t.category.includes('Etsy'))));
      }
    } catch (e) {
      console.warn('Failed to fetch Etsy workspace data', e);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleMcpPull = async () => {
    if (!seedPhrase.trim()) return;
    setMcpPulling(true);
    setMcpResult(null);
    try {
      const res = await fetch('http://localhost:3001/api/mcp/pull-etsy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: seedPhrase.trim(), category: selectedCategory })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to pull from MCP');
      
      setMcpResult(data);
      if (onShowToast) onShowToast(`⚡ Đã kéo thành công ${data.keywords.length} Etsy Tags từ MCP!`);
      fetchData();
    } catch (err) {
      if (onShowToast) onShowToast(`Lỗi kéo MCP: ${err.message}`);
    } finally {
      setMcpPulling(false);
    }
  };

  const handleFileUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    setUploadStatus(null);
    const formData = new FormData();
    formData.append('reportFile', file);
    formData.append('file', file);
    formData.append('category', selectedCategory);

    try {
      const res = await fetch('http://localhost:3001/api/upload-h10', {
        method: 'POST',
        body: formData
      });
      const text = await res.text();
      let result;
      try {
        result = JSON.parse(text);
      } catch (parseErr) {
        throw new Error(`Lỗi kết nối máy chủ (${res.status}): Vui lòng kiểm tra backend server.`);
      }

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
      const res = await fetch(`http://localhost:3001/api/trends/${trendId}/draft`, {
        method: 'POST'
      });
      const result = await res.json();
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

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* 0. Master Seed Phrase Anchor Bar + IP Gate Button */}
      <div style={{
        background: 'var(--bg-surface)',
        borderRadius: '16px',
        padding: '18px 24px',
        border: '1px solid #fed7aa',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        boxShadow: '0 4px 12px rgba(234, 88, 12, 0.08)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '320px' }}>
          <div style={{ background: '#ea580c', color: '#fff', padding: '10px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: '#c2410c' }}>
              📍 0. Etsy Master Seed Phrase (Dịp Lễ / Ngách Quà Tặng):
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
              placeholder="Ví dụ: nurse sweatshirt, mom gift, 1st anniversary plaque..."
            />
          </div>
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
            cursor: 'pointer'
          }}
        >
          <ShieldCheck size={18} color="#dc2626" />
          <span>🛡️ Cổng Bảo Vệ IP Gate (2-in-1)</span>
        </button>
      </div>

      {/* Google Trends Cross-Check (Anchored on Etsy Seed Phrase) */}
      <GoogleTrendsWidget seedPhrase={seedPhrase} onShowToast={onShowToast} />

      {/* Etsy Live MCP Engine + Category Selector */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '24px' }}>
        
        {/* Left Column: MCP Auto-Pull Card */}
        <div className="studio-panel" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '18px', borderLeft: '4px solid #ea580c' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px', margin: 0, color: '#c2410c' }}>
                <Sparkles size={22} style={{ color: '#ea580c' }} />
                Bước 1: Live MCP Auto-Pull Từ YTrends Server
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                Cào tự động doanh thu ngách, tốc độ xem 24h, và 13 Tags độc lập từ Etsy.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Danh mục:</span>
              <select 
                value={selectedCategory} 
                onChange={(e) => setSelectedCategory(e.target.value)}
                style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', fontWeight: 600, fontSize: '0.85rem' }}
              >
                <option value="Apparel: Sweatshirt">🧥 Apparel: Sweatshirt</option>
                <option value="Mug">☕ Mug (Cốc/Ly)</option>
                <option value="Apparel: Shirt">👕 Apparel: Shirt</option>
                <option value="Apparel: Hoodie">🧥 Apparel: Hoodie</option>
                <option value="Blanket">🛋️ Blanket (Chăn/Mền)</option>
                <option value="Jewelry">✨ Custom Jewelry</option>
                <option value="Embroidery">🧵 Custom Embroidery</option>
                <option value="Acrylic">💡 Custom Acrylic</option>
              </select>
            </div>
          </div>

          {/* MCP Action Box */}
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '12px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary"
                onClick={handleMcpPull}
                disabled={mcpPulling || !seedPhrase.trim()}
                style={{ background: '#ea580c', flex: 1, padding: '12px 20px', fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <RefreshCw size={18} className={mcpPulling ? 'spinner' : ''} />
                <span>{mcpPulling ? 'Đang gọi YTrends MCP Server...' : `⚡ Auto-Pull Live Trends cho "${seedPhrase}"`}</span>
              </button>
            </div>

            {/* MCP Real-Time Result */}
            {mcpResult && (
              <div style={{ background: '#ffffff', borderRadius: '10px', padding: '16px', border: '1px solid #fdba74', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#c2410c' }}>
                      ✓ Đã bóc tách {mcpResult.keywords.length} Etsy Tags cho "{mcpResult.seed}"
                    </div>
                    {mcpResult.overview && (
                      <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
                        Doanh thu ngách: <strong>${mcpResult.overview.total_revenue_usd?.toLocaleString()}</strong> | Lượt xem 24h: <strong>{mcpResult.overview.avg_views_24h} views</strong> | Điểm Cơ Hội: <strong style={{ color: '#ea580c' }}>{mcpResult.overview.opportunity_score}/100</strong>
                      </div>
                    )}
                  </div>

                  {mcpResult.trendId && (
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={draftingTrendId === mcpResult.trendId}
                      onClick={() => handleManualDraft(mcpResult.trendId)}
                      style={{ background: '#c2410c', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Zap size={14} className={draftingTrendId === mcpResult.trendId ? 'spinner' : ''} />
                      <span>{draftingTrendId === mcpResult.trendId ? 'Đang tạo...' : '⚡ Tạo Etsy Listing Ngay'}</span>
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {mcpResult.keywords.map((kw, i) => (
                    <span key={i} style={{ background: '#ffedd5', color: '#9a3412', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, border: '1px solid #fed7aa' }}>
                      #{i + 1} {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* eRank / EverBee Drag & Drop Area */}
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
              background: isDragging ? '#fff7ed' : 'var(--bg-subtle)',
              borderRadius: '14px',
              padding: '24px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px'
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
            <div style={{ color: '#ea580c' }}><FileSpreadsheet size={28} /></div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>
              {uploading ? 'Đang phân tích dữ liệu Etsy...' : 'Hoặc nạp file xuất từ eRank, EverBee, YTrends (.html / .csv)'}
            </div>
          </div>
        </div>

        {/* Etsy Contextual SEO Rules Panel */}
        <div className="studio-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: '#c2410c' }}>
            🏷️ Quy Tắc Thuật Toán Etsy SEO & Quà Tặng
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <div style={{ background: '#fff7ed', padding: '10px 14px', borderRadius: '8px', border: '1px solid #fed7aa' }}>
              <strong style={{ color: '#c2410c' }}>✨ Etsy Title (&lt; 140 chars):</strong> 40 ký tự đầu là quan trọng nhất cho hiển thị di động. Chứa Dịp lễ + Người nhận.
            </div>
            <div style={{ background: '#fff7ed', padding: '10px 14px', borderRadius: '8px', border: '1px solid #fed7aa' }}>
              <strong style={{ color: '#c2410c' }}>🏷️ Đúng 13 Tags Độc Lập:</strong> Mỗi tag tối đa 20 ký tự, không lặp lại từ đơn lẻ, kết hợp long-tail keywords.
            </div>
            <div style={{ background: '#fff7ed', padding: '10px 14px', borderRadius: '8px', border: '1px solid #fed7aa' }}>
              <strong style={{ color: '#c2410c' }}>🎁 Personalization & Story:</strong> Mô tả chi tiết chất liệu thủ công, thời gian hoàn thiện 24h và đóng gói hộp quà.
            </div>
            <div style={{ background: '#fff7ed', padding: '10px 14px', borderRadius: '8px', border: '1px solid #fed7aa' }}>
              <strong style={{ color: '#c2410c' }}>📸 12 Photos Chuẩn Best Seller:</strong> Đầy đủ ảnh flatlay ấm cúng, ảnh cầm trên tay, bảng màu và ảnh xưởng chế tác.
            </div>
          </div>
        </div>
      </div>

      {/* Etsy Batches Queue */}
      {trends.length > 0 && (
        <div className="studio-panel" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '14px', color: '#c2410c' }}>
            Hàng Đợi Từ Khóa Etsy Đã Nạp ({trends.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {trends.map((t) => (
              <div key={t.id} style={{ padding: '14px 18px', background: 'var(--bg-subtle)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border-subtle)' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a' }}>{t.category} (Nguồn: {t.source})</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{t.trending_keywords}</div>
                </div>
                {!t.processed && (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={draftingTrendId === t.id}
                    onClick={() => handleManualDraft(t.id)}
                    style={{ background: '#ea580c' }}
                  >
                    <Zap size={14} />
                    <span>Tạo Listing</span>
                  </button>
                )}
              </div>
            ))}
          </div>
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
