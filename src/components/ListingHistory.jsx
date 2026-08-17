import React, { useState } from 'react';
import { History, Eye, Trash2, Download, Search, Sparkles, TrendingUp, ChevronDown, ChevronUp, AlertCircle, RefreshCw, CheckCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function ListingHistory({ history, onSelectListing, onDeleteListing, onClearHistory, onShowToast, onRefresh, onApproveListing }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'NEEDS_QA' | 'MANAGER_APPROVED'
  const [expandedFeedbackId, setExpandedFeedbackId] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const { user } = useAuth();

  const handleRefresh = async () => {
    setSyncing(true);
    await onRefresh();
    setSyncing(false);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  const isManager = user?.role === 'MANAGER' || user?.role === 'OWNER' || user?.role === 'ADMIN';

  const pendingCount = history.filter(h => h.status === 'NEEDS_QA').length;
  const approvedCount = history.filter(h => h.status === 'MANAGER_APPROVED').length;

  const filteredHistory = history.filter(item => {
    const query = searchTerm.toLowerCase();
    const amzTitle = (item.amazonTitle || '').toLowerCase();
    const etsyTitle = (item.etsyTitle || '').toLowerCase();
    const cat = (item.categoryName || item.category?.name || '').toLowerCase();
    const matchesSearch = amzTitle.includes(query) || etsyTitle.includes(query) || cat.includes(query);

    if (!matchesSearch) return false;
    if (statusFilter === 'NEEDS_QA') return item.status === 'NEEDS_QA';
    if (statusFilter === 'MANAGER_APPROVED') return item.status === 'MANAGER_APPROVED';
    return true;
  });

  const handleFeedbackSubmit = async (e, item) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const views = parseInt(formData.get('views') || 0, 10);
    const orders = parseInt(formData.get('orders') || 0, 10);
    const revenue = parseFloat(formData.get('revenue') || 0);

    try {
      const res = await fetch(`/api/listings/${item.dbId}/feedback`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ views, orders, revenue })
      });
      if (!res.ok) throw new Error('Failed to submit feedback');
      const data = await res.json();
      
      onShowToast(`Feedback processed. Recommended Action: ${data.action.replace(/_/g, ' ')}`);
      setExpandedFeedbackId(null);
    } catch (err) {
      onShowToast(`Feedback error: ${err.message}`);
    }
  };

  return (
    <div className="studio-panel" style={{ maxWidth: '1200px', margin: '0 auto', position: 'relative' }}>
      {showToast && (
        <div style={{
          position: 'absolute', top: '-40px', right: '0', 
          background: 'var(--success)', color: 'white', 
          padding: '8px 12px', borderRadius: '4px', fontSize: '0.8rem',
          display: 'flex', alignItems: 'center', gap: '6px',
          animation: 'fade-in 0.3s'
        }}>
          <CheckCircle size={14} /> Drafts Synced!
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '1.35rem', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <History size={22} style={{ color: 'var(--primary)' }} />
            <span>Kho Lưu Trữ & Duyệt Listing ({history.length})</span>
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Xem toàn bộ listing Amazon FBM & Etsy, duyệt listing chờ QA và khôi phục vào Studio.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {onRefresh && (
            <button className="btn btn-secondary btn-sm" onClick={handleRefresh} disabled={syncing}>
              <RefreshCw size={14} className={syncing ? "spin-icon" : ""} />
              <span>{syncing ? 'Đang đồng bộ...' : 'Đồng bộ từ Database'}</span>
            </button>
          )}
          {history.length > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={onClearHistory} style={{ color: 'var(--danger)' }}>
              <Trash2 size={14} />
              <span>Xóa toàn bộ</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '18px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            className={`btn btn-sm ${statusFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setStatusFilter('ALL')}
          >
            Tất cả ({history.length})
          </button>
          <button 
            className={`btn btn-sm ${statusFilter === 'NEEDS_QA' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setStatusFilter('NEEDS_QA')}
            style={statusFilter === 'NEEDS_QA' ? { background: '#d97706' } : {}}
          >
            ⏳ Chờ Duyệt ({pendingCount})
          </button>
          <button 
            className={`btn btn-sm ${statusFilter === 'MANAGER_APPROVED' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setStatusFilter('MANAGER_APPROVED')}
            style={statusFilter === 'MANAGER_APPROVED' ? { background: '#16a34a' } : {}}
          >
            ✅ Đã Phê Duyệt ({approvedCount})
          </button>
        </div>

        <div style={{ flex: 1, minWidth: '240px', maxWidth: '400px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="form-input"
            style={{ paddingLeft: '36px', height: '36px' }}
            placeholder="Tìm theo từ khóa, danh mục, tiêu đề..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {history.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
          <div style={{ background: 'var(--bg-subtle)', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', color: 'var(--text-muted)' }}>
            <Sparkles size={28} />
          </div>
          <h4 style={{ fontSize: '1.1rem', marginBottom: '6px' }}>Chưa có listing nào trong kho</h4>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Khi bạn tạo listing từ Studio hoặc nạp file Helium 10, listing sẽ được lưu trữ tự động tại đây.
          </p>
        </div>
      ) : filteredHistory.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
          Không có listing nào khớp với bộ lọc hiện tại.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredHistory.map((item, index) => (
            <div
              key={item.id || item.dbId || index}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                padding: '16px 20px',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ flex: 1, minWidth: '280px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '0.75rem', background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: '700', padding: '2px 8px', borderRadius: '4px' }}>
                    {item.categoryName || item.category?.name || 'Custom Product'}
                  </span>
                  <span style={{ fontSize: '0.75rem', background: item.status === 'MANAGER_APPROVED' ? '#dcfce7' : '#fef3c7', color: item.status === 'MANAGER_APPROVED' ? '#166534' : '#92400e', fontWeight: '600', padding: '2px 8px', borderRadius: '4px' }}>
                    {item.status === 'MANAGER_APPROVED' ? '✅ ĐÃ DUYỆT' : '⏳ CHỜ QA'}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {new Date(item.generatedAt || Date.now()).toLocaleString()}
                  </span>
                  {item.authorName && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      · 👤 {item.authorName}
                    </span>
                  )}
                </div>
                <div style={{ fontWeight: '600', fontSize: '0.95rem', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.amazonTitle || item.etsyTitle || 'Untitled Listing'}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <strong>Etsy:</strong> {item.etsyTitle}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {isManager && item.status === 'NEEDS_QA' && onApproveListing && (
                  <button
                    className="btn btn-sm"
                    onClick={async () => {
                      await onApproveListing(item);
                      if (onRefresh) onRefresh();
                    }}
                    style={{ background: '#16a34a', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <CheckCircle size={14} />
                    <span>Duyệt</span>
                  </button>
                )}

                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => onSelectListing(item)}
                >
                  <Eye size={14} />
                  <span>Mở Xem</span>
                </button>

                <button
                  className="btn btn-secondary btn-sm"
                  style={{ color: 'var(--primary)', padding: '6px' }}
                  onClick={() => setExpandedFeedbackId(expandedFeedbackId === item.id ? null : item.id)}
                  title="7-Day Performance Feedback"
                  disabled={!item.dbId}
                >
                  <TrendingUp size={14} />
                  <span>Feedback</span>
                  {expandedFeedbackId === item.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ color: 'var(--danger)', padding: '6px' }}
                  onClick={() => onDeleteListing(index)}
                  title="Delete from Catalog"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              
              {expandedFeedbackId === item.id && (
                <div style={{ width: '100%', marginTop: '16px', padding: '16px', background: 'var(--bg-subtle)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <h5 style={{ fontSize: '0.9rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)' }}>
                    <AlertCircle size={16} /> 7-Day Post-Launch Feedback Loop (ETSY Style)
                  </h5>
                  <form onSubmit={(e) => handleFeedbackSubmit(e, item)} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '100px' }}>
                      <label className="form-label">Views</label>
                      <input type="number" name="views" className="form-input" required min="0" />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '100px' }}>
                      <label className="form-label">Orders</label>
                      <input type="number" name="orders" className="form-input" required min="0" />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '100px' }}>
                      <label className="form-label">Revenue ($)</label>
                      <input type="number" name="revenue" className="form-input" required min="0" step="0.01" />
                    </div>
                    <button type="submit" className="btn btn-primary btn-sm" style={{ height: '38px' }}>
                      Get AI Action
                    </button>
                  </form>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
