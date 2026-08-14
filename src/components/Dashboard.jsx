import React, { useState, useEffect, useRef } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, 
  PieChart, Pie, Cell, Tooltip 
} from 'recharts';
import { 
  TrendingUp, Layers, CheckCircle2, Clock, UploadCloud, 
  FileSpreadsheet, Sparkles, RefreshCw, ArrowRight, ShieldCheck, 
  Zap, AlertCircle, Database, Check, Eye, Play, FileText, ChevronRight, Tag
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const CATEGORY_COLORS = {
  'Jewelry': '#ec4899',
  'Custom Jewelry': '#ec4899',
  'Acrylic': '#06b6d4',
  'Custom Acrylic': '#06b6d4',
  'Blanket': '#8b5cf6',
  'Custom Blanket': '#8b5cf6',
  'Embroidery': '#f59e0b',
  'Custom Embroidery': '#f59e0b',
  'AI Co-Pilot Draft': '#10b981'
};

export default function Dashboard({ onSelectListing, onApproveListing, onShowToast }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [trends, setTrends] = useState([]);
  const [pendingListings, setPendingListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [draftingTrendId, setDraftingTrendId] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('Jewelry');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // 1. Fetch Summary Stats
      const summaryRes = await fetch('http://localhost:3001/api/analytics-summary');
      if (summaryRes.ok) {
        const summary = await summaryRes.json();
        setData(summary);
      }

      // 2. Fetch Trends Queue
      const trendsRes = await fetch('http://localhost:3001/api/trends');
      if (trendsRes.ok) {
        const trendsData = await trendsRes.json();
        setTrends(trendsData);
      }

      // 3. Fetch Listings for QA Queue
      const listingsRes = await fetch('http://localhost:3001/api/listings');
      if (listingsRes.ok) {
        const listingsData = await listingsRes.json();
        const pending = listingsData
          .filter(item => item.status === 'NEEDS_QA')
          .map(item => ({
            ...item.payload,
            dbId: item.id,
            status: item.status,
            generatedAt: item.generatedAt,
            categoryName: item.categoryName
          }));
        setPendingListings(pending);
      }
    } catch (e) {
      console.error('Failed to load dashboard data', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleFileUpload = async (file) => {
    if (!file) return;
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.csv') && !file.name.endsWith('.xls')) {
      setUploadStatus({ type: 'error', message: 'Vui lòng chọn file .xlsx, .xls hoặc .csv xuất từ Helium 10' });
      return;
    }

    setUploading(true);
    setUploadStatus(null);

    const formData = new FormData();
    formData.append('reportFile', file);
    formData.append('category', selectedCategory);

    try {
      const res = await fetch('http://localhost:3001/api/upload-h10', {
        method: 'POST',
        body: formData
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Upload failed');

      setUploadStatus({
        type: 'success',
        trendId: result.trendId,
        message: `Đã nạp thành công ${result.totalRows} dòng từ "${result.fileName}"! Đã chấm điểm A10 Opportunity Score cho ${result.topKeywords.length} từ khóa.`,
        keywords: result.topKeywords,
        topKeywordsDetailed: result.topKeywordsDetailed || [],
        flaggedIpKeywords: result.flaggedIpKeywords || [],
        category: result.category
      });
      fetchDashboardData();
    } catch (err) {
      setUploadStatus({ type: 'error', message: err.message });
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

      if (onShowToast) onShowToast('✅ Đã tạo listing thành công bằng Gemini 3.6 Flash!');
      fetchDashboardData();

      if (onSelectListing && result.listing) {
        onSelectListing(result.listing);
      }
    } catch (err) {
      if (onShowToast) onShowToast(`Lỗi tạo listing: ${err.message}`);
    } finally {
      setDraftingTrendId(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const listingStats = data?.listingStats || { totalListings: 0, approvedListings: 0, pendingListings: 0 };
  const trendStats = data?.trendStats || { totalTrends: 0, processedTrends: 0 };
  const categoryBreakdown = data?.categoryBreakdown || [];

  const pieData = categoryBreakdown.map(c => ({
    name: c.categoryName || 'Other',
    value: c.count
  }));

  const isManager = user?.role === 'MANAGER' || user?.role === 'OWNER' || user?.role === 'ADMIN';

  return (
    <div style={{ maxWidth: '1380px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '28px' }}>
      
      {/* Header Banner */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        flexWrap: 'wrap', 
        gap: '16px',
        padding: '24px 28px',
        background: 'linear-gradient(135deg, #0f766e 0%, #115e59 100%)',
        borderRadius: '16px',
        color: '#ffffff',
        boxShadow: '0 10px 25px -5px rgba(15, 118, 110, 0.25)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span style={{ background: 'rgba(255, 255, 255, 0.2)', padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.5px' }}>
              PRO MAX COCKPIT
            </span>
            <span style={{ fontSize: '0.8rem', color: '#99f6e4' }}>● Live Database Connected</span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>
            OmniSeller E-Commerce Command Center
          </h1>
          <p style={{ margin: '4px 0 0 0', color: '#ccfbf1', fontSize: '0.9rem', opacity: 0.9 }}>
            Quản lý từ khóa Helium 10, phân tích cơ sở dữ liệu listing Amazon FBM & Etsy, và duyệt sản phẩm cho Store Owner.
          </p>
        </div>

        <button 
          onClick={fetchDashboardData}
          disabled={loading}
          className="btn"
          style={{ 
            background: 'rgba(255, 255, 255, 0.15)', 
            color: '#ffffff', 
            border: '1px solid rgba(255, 255, 255, 0.3)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: '10px',
            cursor: 'pointer',
            fontWeight: 600
          }}
        >
          <RefreshCw size={16} className={loading ? 'spinner' : ''} />
          <span>Làm mới dữ liệu</span>
        </button>
      </div>

      {/* Metric Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '18px' }}>
        
        {/* Card 1: Total Listings */}
        <div className="studio-panel" style={{ padding: '22px 24px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Tổng Listing Trong Kho
              </div>
              <div style={{ fontSize: '2.2rem', fontWeight: 800, marginTop: '8px', color: 'var(--text-primary)' }}>
                {listingStats.totalListings}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Database size={13} /> Dữ liệu thực từ SQLite
              </div>
            </div>
            <div style={{ background: '#ecfdf5', padding: '14px', borderRadius: '14px', color: '#059669' }}>
              <Layers size={26} />
            </div>
          </div>
        </div>

        {/* Card 2: Approved Listings */}
        <div className="studio-panel" style={{ padding: '22px 24px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Listing Đã Duyệt (Manager)
              </div>
              <div style={{ fontSize: '2.2rem', fontWeight: 800, marginTop: '8px', color: '#16a34a' }}>
                {listingStats.approvedListings || 0}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#16a34a', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldCheck size={13} /> Sẵn sàng Export CSV
              </div>
            </div>
            <div style={{ background: '#dcfce7', padding: '14px', borderRadius: '14px', color: '#16a34a' }}>
              <CheckCircle2 size={26} />
            </div>
          </div>
        </div>

        {/* Card 3: Pending QA */}
        <div className="studio-panel" style={{ padding: '22px 24px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Chờ Owner/Manager Duyệt
              </div>
              <div style={{ fontSize: '2.2rem', fontWeight: 800, marginTop: '8px', color: '#d97706' }}>
                {listingStats.pendingListings || 0}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#d97706', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={13} /> Hàng đợi kiểm duyệt
              </div>
            </div>
            <div style={{ background: '#fef3c7', padding: '14px', borderRadius: '14px', color: '#d97706' }}>
              <Zap size={26} />
            </div>
          </div>
        </div>

        {/* Card 4: Keyword Trends */}
        <div className="studio-panel" style={{ padding: '22px 24px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Cụm Từ Khóa H10
              </div>
              <div style={{ fontSize: '2.2rem', fontWeight: 800, marginTop: '8px', color: '#0284c7' }}>
                {trendStats.totalTrends}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Check size={13} /> {trendStats.processedTrends || 0} đợt đã sinh listing
              </div>
            </div>
            <div style={{ background: '#e0f2fe', padding: '14px', borderRadius: '14px', color: '#0284c7' }}>
              <TrendingUp size={26} />
            </div>
          </div>
        </div>

      </div>

      {/* Section 1: Owner Review & QA Queue (Nơi Owner duyệt các listing mới) */}
      <div className="studio-panel" style={{ padding: '28px', borderLeft: '5px solid #f59e0b' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px', margin: 0, color: 'var(--text-primary)' }}>
              <ShieldCheck size={22} style={{ color: '#d97706' }} />
              Hàng Đợi Kiểm Duyệt Listing (Owner / Manager QA Queue)
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
              Đây là nơi <strong>Store Owner</strong> xem xét, chỉnh sửa và phê duyệt các listing do AI tạo trước khi xuất bản ra thị trường.
            </p>
          </div>
          <span style={{ 
            background: pendingListings.length > 0 ? '#fef3c7' : '#dcfce7', 
            color: pendingListings.length > 0 ? '#92400e' : '#166534', 
            padding: '6px 14px', 
            borderRadius: '20px', 
            fontWeight: 700, 
            fontSize: '0.85rem' 
          }}>
            {pendingListings.length} Listing Đang Chờ Duyệt
          </span>
        </div>

        {pendingListings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 20px', background: 'var(--bg-subtle)', borderRadius: '12px' }}>
            <CheckCircle2 size={36} style={{ color: '#16a34a', margin: '0 auto 10px auto' }} />
            <h4 style={{ margin: '0 0 4px 0', fontSize: '1rem', color: 'var(--text-primary)' }}>Tất cả listing đã được phê duyệt!</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
              Không có listing nào đang chờ QA. Hãy nạp thêm file Helium 10 ở bên dưới để tạo listing mới.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {pendingListings.map((item) => (
              <div 
                key={item.dbId}
                style={{ 
                  background: 'var(--bg-surface)', 
                  border: '1px solid var(--border-subtle)', 
                  borderRadius: '12px', 
                  padding: '16px 20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '16px',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                <div style={{ flex: 1, minWidth: '280px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ 
                      fontSize: '0.75rem', 
                      background: CATEGORY_COLORS[item.categoryName] ? `${CATEGORY_COLORS[item.categoryName]}20` : 'var(--primary-light)', 
                      color: CATEGORY_COLORS[item.categoryName] || 'var(--primary)', 
                      fontWeight: 700, 
                      padding: '2px 8px', 
                      borderRadius: '4px' 
                    }}>
                      {item.categoryName || 'Custom Product'}
                    </span>
                    <span style={{ fontSize: '0.75rem', background: '#fef3c7', color: '#92400e', fontWeight: 600, padding: '2px 8px', borderRadius: '4px' }}>
                      ⏳ NEEDS_QA
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {new Date(item.generatedAt || Date.now()).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: '4px' }}>
                    {item.amazonTitle || item.etsyTitle || 'Untitled Listing'}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    <strong>Etsy:</strong> {item.etsyTitle || 'Chưa có tiêu đề Etsy'}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button 
                    className="btn btn-secondary btn-sm"
                    onClick={() => onSelectListing && onSelectListing(item)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Eye size={14} />
                    <span>Mở Review Trong Studio</span>
                  </button>
                  
                  {isManager && (
                    <button 
                      className="btn btn-primary btn-sm"
                      onClick={async () => {
                        if (onApproveListing) {
                          await onApproveListing(item);
                          fetchDashboardData();
                        }
                      }}
                      style={{ background: '#16a34a', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <CheckCircle2 size={14} />
                      <span>Duyệt Ngay (Approve)</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Helium 10 Ingestion Engine + Category Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '24px' }}>
        
        {/* Helium 10 Upload Dropzone */}
        <div className="studio-panel" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <FileSpreadsheet size={22} style={{ color: 'var(--primary)' }} />
                Helium 10 & CSV Keyword Ingestion Engine
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                Thả file báo cáo Cerebro, Magnet, hoặc Black Box (.xlsx / .csv) để tự động bóc tách từ khóa.
              </p>
            </div>

            {/* Category Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Danh mục:</span>
              <select 
                value={selectedCategory} 
                onChange={(e) => setSelectedCategory(e.target.value)}
                style={{ 
                  padding: '6px 12px', 
                  borderRadius: '8px', 
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-primary)',
                  fontWeight: 600,
                  fontSize: '0.85rem'
                }}
              >
                <option value="Jewelry">✨ Custom Jewelry</option>
                <option value="Acrylic">💡 Custom Acrylic</option>
                <option value="Blanket">🛋️ Custom Blanket</option>
                <option value="Embroidery">🧵 Custom Embroidery</option>
              </select>
            </div>
          </div>

          {/* Drag & Drop Area */}
          <div 
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${isDragging ? 'var(--primary)' : 'var(--border-strong)'}`,
              background: isDragging ? 'var(--primary-light)' : 'var(--bg-subtle)',
              borderRadius: '14px',
              padding: '32px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px'
            }}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileUpload(e.target.files[0]);
                }
              }}
            />
            <div style={{ background: 'var(--bg-surface)', padding: '16px', borderRadius: '50%', color: 'var(--primary)', boxShadow: 'var(--shadow-md)' }}>
              <UploadCloud size={32} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                {uploading ? 'Đang đọc và phân tích file H10...' : 'Kéo thả file Helium 10 / CSV vào đây hoặc nhấn để chọn'}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Hỗ trợ Cerebro Reverse ASIN, Magnet Keywords, Black Box (.xlsx, .csv).
              </div>
            </div>
          </div>

          {/* Status Message & Live Keyword Breakdown */}
          {uploadStatus && (
            <div style={{ 
              padding: '20px', 
              borderRadius: '12px', 
              fontSize: '0.875rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              background: uploadStatus.type === 'success' ? '#ecfdf5' : '#fef2f2',
              color: uploadStatus.type === 'success' ? '#065f46' : '#991b1b',
              border: `1px solid ${uploadStatus.type === 'success' ? '#a7f3d0' : '#fecaca'}`
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
                  {uploadStatus.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                  <span>{uploadStatus.message}</span>
                </div>
                {uploadStatus.trendId && (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={draftingTrendId === uploadStatus.trendId}
                    onClick={() => handleManualDraft(uploadStatus.trendId)}
                    style={{ background: '#0f766e', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Zap size={14} className={draftingTrendId === uploadStatus.trendId ? 'spinner' : ''} />
                    <span>{draftingTrendId === uploadStatus.trendId ? 'Đang gọi Gemini 3.6...' : '⚡ Tạo Listing Ngay Bằng AI'}</span>
                  </button>
                )}
              </div>

              {/* IP / Trademark Flagged Keywords Alert */}
              {uploadStatus.flaggedIpKeywords && uploadStatus.flaggedIpKeywords.length > 0 && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 14px', color: '#92400e', fontSize: '0.8rem' }}>
                  <strong>🛡️ Đã tự động chặn {uploadStatus.flaggedIpKeywords.length} từ khóa dính Trademark / Bản quyền:</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                    {uploadStatus.flaggedIpKeywords.map((ipKw, i) => (
                      <span key={i} style={{ background: '#fee2e2', color: '#991b1b', padding: '2px 6px', borderRadius: '4px', textDecoration: 'line-through' }}>
                        {ipKw}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Master Keyword List (MKL) Table with Opportunity Scores */}
              {uploadStatus.topKeywordsDetailed && uploadStatus.topKeywordsDetailed.length > 0 ? (
                <div style={{ overflowX: 'auto', background: '#ffffff', borderRadius: '8px', border: '1px solid #d1fae5', padding: '8px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                        <th style={{ padding: '6px 8px' }}>Rank</th>
                        <th style={{ padding: '6px 8px' }}>Cụm Từ Khóa (Keyword Phrase)</th>
                        <th style={{ padding: '6px 8px' }}>Search Volume</th>
                        <th style={{ padding: '6px 8px' }}>Competing</th>
                        <th style={{ padding: '6px 8px' }}>Title Density</th>
                        <th style={{ padding: '6px 8px' }}>A10 Opportunity Score</th>
                        <th style={{ padding: '6px 8px' }}>Chiến Lược Đặt Từ Khóa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {uploadStatus.topKeywordsDetailed.map((k) => (
                        <tr key={k.rank} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '6px 8px', fontWeight: 700, color: '#0f766e' }}>#{k.rank}</td>
                          <td style={{ padding: '6px 8px', fontWeight: 600, color: '#0f172a' }}>{k.keyword}</td>
                          <td style={{ padding: '6px 8px', color: '#0369a1', fontWeight: 600 }}>{k.searchVolume ? k.searchVolume.toLocaleString() : 'N/A'}</td>
                          <td style={{ padding: '6px 8px', color: '#64748b' }}>{k.competingProducts ? k.competingProducts.toLocaleString() : 'N/A'}</td>
                          <td style={{ padding: '6px 8px', color: k.titleDensity <= 5 ? '#16a34a' : '#d97706', fontWeight: 600 }}>
                            {k.titleDensity !== null ? k.titleDensity : 'N/A'}
                          </td>
                          <td style={{ padding: '6px 8px', fontWeight: 700, color: '#0f766e' }}>
                            <span style={{ background: '#ecfdf5', padding: '2px 6px', borderRadius: '4px', border: '1px solid #a7f3d0' }}>
                              ⚡ {k.opportunityScore}
                            </span>
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <span style={{ 
                              fontSize: '0.75rem', 
                              fontWeight: 600, 
                              padding: '2px 8px', 
                              borderRadius: '4px',
                              background: k.rank <= 3 ? '#fef3c7' : k.rank <= 8 ? '#e0f2fe' : '#f1f5f9',
                              color: k.rank <= 3 ? '#92400e' : k.rank <= 8 ? '#0369a1' : '#475569'
                            }}>
                              {k.tierBadge}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : uploadStatus.keywords && uploadStatus.keywords.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px', opacity: 0.8 }}>
                    Các từ khóa H10 hàng đầu đã được nạp:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {uploadStatus.keywords.map((kw, i) => (
                      <span key={i} style={{ background: '#ffffff', padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', border: '1px solid #a7f3d0', color: '#047857', fontWeight: 500 }}>
                        #{i + 1} {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Folder Tip */}
          <div style={{ background: 'var(--bg-subtle)', padding: '12px 16px', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
            <span>
              <strong>Thư mục tự động:</strong> Bạn cũng có thể copy file trực tiếp vào thư mục <code>data/imports/</code> trên máy tính, Agent 1 sẽ tự động nhận diện và nạp dữ liệu.
            </span>
          </div>
        </div>

        {/* Category Breakdown & Distribution */}
        <div className="studio-panel" style={{ padding: '28px', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '6px' }}>Phân Bố Listing Theo Danh Mục</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Tổng hợp các sản phẩm đã được tạo trong cơ sở dữ liệu.
          </p>

          {categoryBreakdown.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              Chưa có listing nào trong kho.
            </div>
          ) : (
            <div style={{ height: '220px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.name] || '#0f766e'} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Category List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
            {categoryBreakdown.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ 
                    width: '10px', 
                    height: '10px', 
                    borderRadius: '50%', 
                    background: CATEGORY_COLORS[item.categoryName] || '#0f766e' 
                  }} />
                  <span style={{ fontWeight: 600 }}>{item.categoryName}</span>
                </div>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{item.count} listings</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Section 3: Helium 10 Keyword Batches Queue (Xem chi tiết từng đợt import) */}
      <div className="studio-panel" style={{ padding: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <Tag size={22} style={{ color: 'var(--primary)' }} />
              Nhật Ký & Hàng Đợi Cụm Từ Khóa Helium 10 ({trends.length})
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
              Theo dõi chi tiết các bộ từ khóa H10 đã import và trạng thái sinh listing của AI.
            </p>
          </div>
        </div>

        {trends.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--text-muted)', background: 'var(--bg-subtle)', borderRadius: '10px' }}>
            Chưa có đợt từ khóa nào được nạp. Hãy tải lên file Helium 10 ở trên.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {trends.map((t) => (
              <div 
                key={t.id}
                style={{
                  padding: '14px 18px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '10px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px'
                }}
              >
                <div style={{ flex: 1, minWidth: '300px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ 
                      fontSize: '0.75rem', 
                      background: CATEGORY_COLORS[t.category] ? `${CATEGORY_COLORS[t.category]}20` : 'var(--primary-light)',
                      color: CATEGORY_COLORS[t.category] || 'var(--primary)',
                      fontWeight: 700, 
                      padding: '2px 8px', 
                      borderRadius: '4px' 
                    }}>
                      {t.category}
                    </span>
                    <span style={{ 
                      fontSize: '0.75rem', 
                      background: t.processed ? '#dcfce7' : '#fef3c7', 
                      color: t.processed ? '#166534' : '#92400e', 
                      fontWeight: 600, 
                      padding: '2px 8px', 
                      borderRadius: '4px' 
                    }}>
                      {t.processed ? '✅ Đã sinh listing' : '⏳ Chờ AI Draft'}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {new Date(t.discoveredAt).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    <strong>Keywords:</strong> {t.trending_keywords}
                  </div>
                </div>

                {!t.processed && (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={draftingTrendId === t.id}
                    onClick={() => handleManualDraft(t.id)}
                    style={{ background: '#0f766e', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Zap size={14} className={draftingTrendId === t.id ? 'spinner' : ''} />
                    <span>{draftingTrendId === t.id ? 'Đang tạo...' : 'Tạo Listing'}</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}


