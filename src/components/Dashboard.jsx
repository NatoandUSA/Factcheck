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
import AsinBatcherWidget from './AsinBatcherWidget';
import MasterKeywordTable from './MasterKeywordTable';
import GoogleTrendsWidget from './GoogleTrendsWidget';
import UnifiedIpGateModal from './UnifiedIpGateModal';
import { parseJsonResponse } from '../utils/apiResponse';


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

export default function Dashboard({ onSelectListing, onApproveListing, onShowToast, forcedLane = 'AMAZON' }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [trends, setTrends] = useState([]);
  const [pendingListings, setPendingListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [draftingTrendId, setDraftingTrendId] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('Jewelry');
  const [activeChannel, setActiveChannel] = useState('ALL'); // 'ALL', 'AMAZON', 'ETSY'
  const [activeLane, setActiveLane] = useState(forcedLane); // 'AMAZON' | 'ETSY'
  const [seedPhrase, setSeedPhrase] = useState('mom sweatshirt');
  const [etsySeed, setEtsySeed] = useState('nurse sweatshirt');
  const [isIpModalOpen, setIsIpModalOpen] = useState(false);
  const [mcpPulling, setMcpPulling] = useState(false);
  const [mcpResult, setMcpResult] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (forcedLane) {
      setActiveLane(forcedLane);
    }
  }, [forcedLane]);


  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // 1. Fetch Summary Stats
      const summaryRes = await fetch('/api/analytics-summary', { credentials: 'include' });
      if (summaryRes.ok) {
        const summary = await summaryRes.json();
        setData(summary);
      }

      // 2. Fetch Trends Queue
      const trendsRes = await fetch('/api/trends', { credentials: 'include' });
      if (trendsRes.ok) {
        const trendsData = await trendsRes.json();
        setTrends(trendsData);
      }

      // 3. Fetch Listings for QA Queue
      const listingsRes = await fetch('/api/listings', { credentials: 'include' });
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
    formData.append('marketplace', 'AMAZON');

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
      const res = await fetch(`/api/trends/${trendId}/draft`, {
        method: 'POST',
        credentials: 'include'
      });
      const result = await parseJsonResponse(res);
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

  const handleMcpPull = async () => {
    if (!etsySeed.trim()) return;
    setMcpPulling(true);
    setMcpResult(null);
    try {
      const res = await fetch('/api/mcp/pull-etsy', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: etsySeed, category: selectedCategory })
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data.error || 'Failed to pull from MCP');
      
      setMcpResult(data);
      if (onShowToast) onShowToast(`⚡ Đã tự động kéo ${data.keywords.length} từ khóa Etsy từ MCP!`);
      fetchDashboardData();
    } catch (err) {
      if (onShowToast) onShowToast(`Lỗi kéo MCP: ${err.message}`);
    } finally {
      setMcpPulling(false);
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

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
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
            <span>Làm mới</span>
          </button>

          <button 
            onClick={async () => {
              if (window.confirm('⚠️ Bạn có chắc chắn muốn XÓA TOÀN BỘ dữ liệu cũ để nạp lại dữ liệu mới? Action này sẽ reset toàn bộ Database.')) {
                try {
                  const password = window.prompt('Xác thực lại: nhập mật khẩu OWNER');
                  if (!password) return;
                  const meRes = await fetch('/api/auth/me', { credentials: 'include' });
                  const me = await meRes.json();
                  if (!meRes.ok) throw new Error('Phiên đăng nhập không hợp lệ');
                  const reauthRes = await fetch('/api/auth/reauth', {
                    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password, purpose: 'RESET_DATABASE' })
                  });
                  const reauth = await reauthRes.json();
                  if (!reauthRes.ok) throw new Error('Xác thực lại thất bại');
                  const confirmation = window.prompt(`Nhập chính xác: RESET ${me.user.workspaceId}`);
                  if (confirmation !== `RESET ${me.user.workspaceId}`) throw new Error('Chuỗi xác nhận không khớp');
                  const res = await fetch('/api/reset-database', {
                    method: 'DELETE', credentials: 'include',
                    headers: { 'Content-Type': 'application/json', 'X-Reset-Nonce': reauth.nonce },
                    body: JSON.stringify({ confirmation })
                  });
                  if (res.ok) {
                    onShowToast?.('Đã xóa dữ liệu cũ và Reset DB thành công!', 'success');
                    fetchDashboardData();
                  } else {
                    const data = await res.json();
                    throw new Error(data.error || 'Reset bị từ chối');
                  }
                } catch (e) {
                  onShowToast?.(`Lỗi: ${e.message}`, 'error');
                }
              }
            }}
            className="btn"
            style={{ 
              background: '#ef4444', 
              color: '#ffffff', 
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              borderRadius: '10px',
              cursor: 'pointer',
              fontWeight: 600,
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
            }}
          >
            <span>🗑️ Reset DB</span>
          </button>
        </div>
      </div>


      {/* Dual Channel Architecture Switcher */}
      <div style={{
        display: 'flex',
        gap: '12px',
        background: 'var(--panel-bg, #ffffff)',
        padding: '8px 12px',
        borderRadius: '14px',
        border: '1px solid var(--border-color, #e2e8f0)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
      }}>
        <button
          onClick={() => setActiveChannel('ALL')}
          style={{
            flex: 1,
            padding: '10px 16px',
            borderRadius: '10px',
            border: 'none',
            background: activeChannel === 'ALL' ? 'var(--primary-color, #0f766e)' : 'transparent',
            color: activeChannel === 'ALL' ? '#ffffff' : 'var(--text-secondary, #64748b)',
            fontWeight: 700,
            fontSize: '0.9rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s'
          }}
        >
          <Layers size={18} />
          <span>Tất cả Sàn (Master Feed)</span>
        </button>

        <button
          onClick={() => setActiveChannel('AMAZON')}
          style={{
            flex: 1,
            padding: '10px 16px',
            borderRadius: '10px',
            border: 'none',
            background: activeChannel === 'AMAZON' ? '#d97706' : 'transparent',
            color: activeChannel === 'AMAZON' ? '#ffffff' : 'var(--text-secondary, #64748b)',
            fontWeight: 700,
            fontSize: '0.9rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s'
          }}
        >
          <span>📦 Amazon FBM Studio (H10 & IP Guard)</span>
        </button>

        <button
          onClick={() => setActiveChannel('ETSY')}
          style={{
            flex: 1,
            padding: '10px 16px',
            borderRadius: '10px',
            border: 'none',
            background: activeChannel === 'ETSY' ? '#ea580c' : 'transparent',
            color: activeChannel === 'ETSY' ? '#ffffff' : 'var(--text-secondary, #64748b)',
            fontWeight: 700,
            fontSize: '0.9rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s'
          }}
        >
          <span>🧡 Etsy Studio (YTrends & 13 Tags)</span>
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

      {/* Section 2: Global Seed Phrase Anchor Bar + Unified IP Gate Control */}
      <div style={{
        background: 'var(--bg-surface)',
        borderRadius: '16px',
        padding: '18px 24px',
        border: '1px solid var(--border-subtle)',
        marginBottom: '20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        boxShadow: 'var(--shadow-sm)'
      }}>
        {/* Seed Phrase Anchor Input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '300px' }}>
          <div style={{ background: '#f59e0b', color: '#fff', padding: '8px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: '#d97706' }}>
              📍 0. Master Seed Phrase Keyword (Neo Trọng Tâm Niche):
            </div>
            <input
              type="text"
              className="form-input"
              style={{
                fontSize: '1rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                background: 'var(--bg-subtle)',
                marginTop: '4px',
                border: '1px solid var(--border-subtle)'
              }}
              value={seedPhrase}
              onChange={(e) => {
                setSeedPhrase(e.target.value);
                setEtsySeed(e.target.value);
              }}
              placeholder="Nhập từ khóa hạt nhân (e.g. mom sweatshirt, nurse hoodie, acrylic lamp)..."
            />
          </div>
        </div>

        {/* 2-in-1 Unified IP Gate Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
              boxShadow: '0 2px 6px rgba(220, 38, 38, 0.15)'
            }}
          >
            <ShieldCheck size={18} color="#dc2626" />
            <span>🛡️ Cổng Bảo Vệ IP Gate (2-in-1)</span>
          </button>
        </div>
      </div>

      {/* Dual Workspace Selector Tabs */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        <button
          onClick={() => setActiveLane('AMAZON')}
          style={{
            flex: 1,
            padding: '16px 20px',
            borderRadius: '12px',
            border: activeLane === 'AMAZON' ? '2px solid #0284c7' : '1px solid var(--border-subtle)',
            background: activeLane === 'AMAZON' ? '#f0f9ff' : 'var(--bg-surface)',
            color: activeLane === 'AMAZON' ? '#0369a1' : 'var(--text-secondary)',
            fontWeight: 800,
            fontSize: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            cursor: 'pointer',
            boxShadow: activeLane === 'AMAZON' ? '0 4px 14px rgba(2,132,199,0.2)' : 'none',
            transition: 'all 0.2s ease'
          }}
        >
          <span style={{ fontSize: '1.4rem' }}>🔵</span>
          <div style={{ textAlign: 'left' }}>
            <div>Workspace 1: Amazon A10 Engine</div>
            <div style={{ fontSize: '0.75rem', fontWeight: 400, opacity: 0.85 }}>Helium 10 Cerebro, Xray 10 ASINs, A+ Content</div>
          </div>
        </button>

        <button
          onClick={() => setActiveLane('ETSY')}
          style={{
            flex: 1,
            padding: '16px 20px',
            borderRadius: '12px',
            border: activeLane === 'ETSY' ? '2px solid #ea580c' : '1px solid var(--border-subtle)',
            background: activeLane === 'ETSY' ? '#fff7ed' : 'var(--bg-surface)',
            color: activeLane === 'ETSY' ? '#c2410c' : 'var(--text-secondary)',
            fontWeight: 800,
            fontSize: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            cursor: 'pointer',
            boxShadow: activeLane === 'ETSY' ? '0 4px 14px rgba(234,88,12,0.2)' : 'none',
            transition: 'all 0.2s ease'
          }}
        >
          <span style={{ fontSize: '1.4rem' }}>🟠</span>
          <div style={{ textAlign: 'left' }}>
            <div>Workspace 2: Etsy Contextual Engine</div>
            <div style={{ fontSize: '0.75rem', fontWeight: 400, opacity: 0.85 }}>YTrends MCP Live Pull, eRank, 13 Tags Pool</div>
          </div>
        </button>
      </div>

      {/* Google Trends Cross-Check Widget (Anchored on Seed Phrase) */}
      <GoogleTrendsWidget seedPhrase={activeLane === 'AMAZON' ? seedPhrase : (etsySeed || seedPhrase)} onShowToast={onShowToast} />

      {/* Grid: Selected Workspace Pipeline + Category Distribution */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '24px' }}>
        
        {/* Left Column: Lane Specific Controller */}
        {activeLane === 'AMAZON' ? (
          /* AMAZON LANE: Helium 10 Ingestion */
          <div className="studio-panel" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '18px', borderLeft: '4px solid #0284c7' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px', margin: 0, color: '#0369a1' }}>
                  <FileSpreadsheet size={22} style={{ color: '#0284c7' }} />
                  Amazon A10 Keyword Ingestion (Helium 10 / CSV)
                </h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Nạp báo cáo Cerebro Multi-ASIN hoặc Magnet (.xlsx / .csv) để tính điểm <strong>A10 Opportunity Score</strong>.
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
                  <option value="Mug">☕ Mug (Cốc/Ly)</option>
                  <option value="Apparel: Shirt">👕 Apparel: Shirt</option>
                  <option value="Apparel: Sweatshirt">🧥 Apparel: Sweatshirt</option>
                  <option value="Apparel: Hoodie">🧥 Apparel: Hoodie</option>
                  <option value="Blanket">🛋️ Blanket (Chăn/Mền)</option>
                  <option value="Hat/Cap">🧢 Hat / Cap (Nón/Mũ)</option>
                  <option value="Ornament">🎄 Ornament (Giáng sinh/Lưu niệm)</option>
                  <option value="Jewelry">✨ Custom Jewelry</option>
                  <option value="Embroidery">🧵 Custom Embroidery</option>
                  <option value="Acrylic">💡 Custom Acrylic</option>
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
                border: `2px dashed ${isDragging ? '#0284c7' : 'var(--border-strong)'}`,
                background: isDragging ? '#e0f2fe' : 'var(--bg-subtle)',
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
              <div style={{ background: '#fff', padding: '16px', borderRadius: '50%', color: '#0284c7', boxShadow: 'var(--shadow-md)' }}>
                <UploadCloud size={32} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                  {uploading ? 'Đang phân tích Search Volume & Title Density...' : 'Kéo thả file Helium 10 (.xlsx / .csv) vào đây'}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Tự động tính tỷ lệ Vàng A10 & loại trừ 100% rủi ro Trademark IP.
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ETSY LANE: Live MCP Pull + eRank/YTrends */
          <div className="studio-panel" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '18px', borderLeft: '4px solid #ea580c' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px', margin: 0, color: '#c2410c' }}>
                  <Sparkles size={22} style={{ color: '#ea580c' }} />
                  Etsy Live MCP Auto-Pull Engine (mcp.trends.ytuong.ai)
                </h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Tự động cào từ khóa xu hướng, 13 Tags và điểm Momentum trực tiếp từ Etsy.
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

            {/* MCP Seed Input & 1-Click Pull Button */}
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '12px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#9a3412', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Zap size={16} /> Nhập Seed Keyword Etsy hoặc Ngách Quà Tặng:
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  className="form-input"
                  style={{ flex: 1, minWidth: '220px', background: '#fff' }}
                  placeholder="Ví dụ: nurse sweatshirt, mom gift, anniversary plaque..."
                  value={etsySeed}
                  onChange={(e) => setEtsySeed(e.target.value)}
                />
                <button
                  className="btn btn-primary"
                  onClick={handleMcpPull}
                  disabled={mcpPulling}
                  style={{ background: '#ea580c', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}
                >
                  <RefreshCw size={16} className={mcpPulling ? 'spinner' : ''} />
                  <span>{mcpPulling ? 'Đang gọi MCP Server...' : '⚡ Auto-Pull Live Trends'}</span>
                </button>
              </div>

              {/* MCP Live Result Display */}
              {mcpResult && (
                <div style={{ background: '#ffffff', borderRadius: '8px', padding: '12px 16px', border: '1px solid #fdba74', marginTop: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#c2410c' }}>
                      ✓ Đã bóc tách {mcpResult.keywords.length} Etsy Tags cho "{mcpResult.seed}"
                    </div>
                    {mcpResult.trendId && (
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={draftingTrendId === mcpResult.trendId}
                        onClick={() => handleManualDraft(mcpResult.trendId)}
                        style={{ background: '#c2410c', fontSize: '0.8rem' }}
                      >
                        <Zap size={14} />
                        <span>Tạo Etsy Listing</span>
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {mcpResult.keywords.map((kw, i) => (
                      <span key={i} style={{ background: '#ffedd5', color: '#9a3412', padding: '2px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600 }}>
                        #{i + 1} {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Drag & Drop Area for eRank/EverBee CSV/HTML */}
            <div 
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
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
              <div style={{ color: '#ea580c' }}><FileSpreadsheet size={26} /></div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                Hoặc nạp file xuất từ eRank, EverBee, YTrends (.html / .csv)
              </div>
            </div>

            {/* Status Message & Live Keyword Breakdown */}
            {uploadStatus && (
              <div style={{ 
                padding: '16px', 
                borderRadius: '12px', 
                fontSize: '0.85rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                background: uploadStatus.type === 'success' ? '#ecfdf5' : '#fef2f2',
                color: uploadStatus.type === 'success' ? '#065f46' : '#991b1b',
                border: `1px solid ${uploadStatus.type === 'success' ? '#a7f3d0' : '#fecaca'}`
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
                    {uploadStatus.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                    <span>{uploadStatus.message}</span>
                  </div>
                  {uploadStatus.trendId && (
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={draftingTrendId === uploadStatus.trendId}
                      onClick={() => handleManualDraft(uploadStatus.trendId)}
                      style={{ background: '#0f766e', fontSize: '0.75rem' }}
                    >
                      <Zap size={12} />
                      <span>{draftingTrendId === uploadStatus.trendId ? 'Đang gọi AI...' : 'Tạo Listing'}</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

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

      {/* Step 2: Helium 10 Xray ASIN Batching Assistant */}
      <AsinBatcherWidget onShowToast={onShowToast} />

      {/* Step 4: Master Keyword List Table */}
      <MasterKeywordTable />

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

      {/* 2-in-1 Unified IP & Trademark Gate Modal */}
      <UnifiedIpGateModal
        isOpen={isIpModalOpen}
        onClose={() => setIsIpModalOpen(false)}
        onShowToast={onShowToast}
      />

    </div>
  );
}

