import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, ShieldCheck, Plus, Trash2, X, Lock, CheckCircle2, AlertTriangle, RefreshCw, Key
} from 'lucide-react';

export default function UnifiedIpGateModal({ isOpen, onClose, onShowToast }) {
  const [library, setLibrary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newTerm, setNewTerm] = useState('');
  const [selectedCat, setSelectedCat] = useState('custom_brands');
  const [actionType, setActionType] = useState('block');
  const [submitting, setSubmitting] = useState(false);

  const fetchLibrary = async () => {
    try {
      setLoading(true);
      const res = await fetch('http://localhost:3001/api/ip-guard/library');
      if (res.ok) {
        const data = await res.json();
        setLibrary(data.library);
      }
    } catch (e) {
      console.error('Failed to load IP library', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLibrary();
    }
  }, [isOpen]);

  const handleAddTerm = async (e) => {
    e.preventDefault();
    if (!newTerm.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('http://localhost:3001/api/ip-guard/custom-term', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term: newTerm.trim(),
          category: selectedCat,
          action: actionType
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add term');
      
      if (onShowToast) onShowToast(`✓ ${data.message}`);
      setNewTerm('');
      fetchLibrary();
    } catch (err) {
      if (onShowToast) onShowToast(`Lỗi: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '850px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
        border: '1px solid var(--border-subtle)',
        overflow: 'hidden'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(135deg, #1e293b, #0f172a)',
          color: '#fff'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: '#dc2626', padding: '8px', borderRadius: '8px' }}>
              <ShieldAlert size={22} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.15rem' }}>
                Unified IP & Trademark Gate (2-in-1 Guard)
              </div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>
                Cổng bảo vệ bản quyền chung cho cả 2 Workspace <strong>Amazon A10</strong> và <strong>Etsy Contextual</strong>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '6px' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Add Term Form */}
          <form onSubmit={handleAddTerm} style={{ background: 'var(--bg-subtle)', padding: '16px 20px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={16} style={{ color: 'var(--primary)' }} />
              Thêm từ khóa cần chặn hoặc cho phép vào Cổng IP Gate:
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="form-input"
                style={{ flex: 2, minWidth: '200px' }}
                placeholder="Nhập tên Brand, Nhân vật, hoặc Cụm từ cần kiểm duyệt..."
                value={newTerm}
                onChange={(e) => setNewTerm(e.target.value)}
              />
              <select
                className="form-input"
                style={{ flex: 1, minWidth: '140px' }}
                value={selectedCat}
                onChange={(e) => setSelectedCat(e.target.value)}
              >
                <option value="custom_brands">Brand Đối Thủ</option>
                <option value="entertainment_characters">Phim / Nhân Vật</option>
                <option value="luxury_and_apparel">Thời Trang / Phụ Kiện</option>
                <option value="sports_and_leagues">Thể Thao / CLB</option>
              </select>
              <select
                className="form-input"
                style={{ width: '130px' }}
                value={actionType}
                onChange={(e) => setActionType(e.target.value)}
              >
                <option value="block">⛔ Chặn (Block)</option>
                <option value="whitelist">✓ Cho Phép</option>
              </select>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting || !newTerm.trim()}
                style={{ background: actionType === 'block' ? '#dc2626' : '#16a34a' }}
              >
                {submitting ? 'Đang lưu...' : 'Thêm Vào IP Gate'}
              </button>
            </div>
          </form>

          {/* Active Protection Categories */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              <RefreshCw size={24} className="spinner" style={{ margin: '0 auto 8px auto' }} />
              Đang tải danh mục bảo vệ bản quyền...
            </div>
          ) : library?.block ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                Các danh mục nhãn hiệu đang được IP Guard tự động chặn:
              </div>

              {Object.entries(library.block).map(([catKey, terms]) => {
                if (catKey.startsWith('_') || !Array.isArray(terms)) return null;
                return (
                  <div key={catKey} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '14px 18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'capitalize', color: 'var(--text-primary)' }}>
                        🛡️ {catKey.replace(/_/g, ' ')} ({terms.length} terms)
                      </span>
                      <span style={{ fontSize: '0.75rem', background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                        AUTO-BLOCK
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {terms.slice(0, 15).map((term, tIdx) => (
                        <span key={tIdx} style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', border: '1px solid var(--border-subtle)' }}>
                          {term}
                        </span>
                      ))}
                      {terms.length > 15 && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center', marginLeft: '4px' }}>
                          +{terms.length - 15} more...
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        {/* Modal Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end', background: 'var(--bg-subtle)' }}>
          <button className="btn btn-secondary" onClick={onClose}>
            Đóng Cổng IP Gate
          </button>
        </div>
      </div>
    </div>
  );
}
