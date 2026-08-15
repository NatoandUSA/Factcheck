import React, { useState, useEffect } from 'react';
import { Database, Search, ShieldCheck, ShieldAlert, Sparkles, RefreshCw } from 'lucide-react';

export default function MasterKeywordTable() {
  const [keywords, setKeywords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchMasterKeywords = async () => {
    try {
      setLoading(true);
      const res = await fetch('http://localhost:3001/api/master-keywords');
      if (res.ok) {
        const data = await res.json();
        setKeywords(data.keywords || []);
      }
    } catch (err) {
      console.error('Failed to fetch master keywords:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMasterKeywords();
  }, []);

  const filtered = keywords.filter(k => 
    k.keyword.toLowerCase().includes(searchTerm.toLowerCase()) ||
    k.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="studio-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database size={20} style={{ color: '#0f766e' }} />
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>
              Master Keyword List (Thống kê Từ khóa Nạp từ H10/YTrends)
            </h3>
          </div>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Tổng hợp từ tất cả các file báo cáo Cerebro/Xray & YTrends đã được bóc tách và lọc IP Guard.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="Tìm từ khóa..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                padding: '6px 12px 6px 30px',
                borderRadius: '8px',
                border: '1px solid var(--border-color, #cbd5e1)',
                fontSize: '0.85rem'
              }}
            />
          </div>

          <button 
            onClick={fetchMasterKeywords}
            disabled={loading}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} className={loading ? 'spinner' : ''} />
            <span>Tải lại</span>
          </button>
        </div>
      </div>

      <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-color, #e2e8f0)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '10px 14px', fontWeight: 'bold' }}>STT</th>
              <th style={{ padding: '10px 14px', fontWeight: 'bold' }}>Cụm Từ Khóa (Keyword Phrase)</th>
              <th style={{ padding: '10px 14px', fontWeight: 'bold' }}>Danh Mục (Category)</th>
              <th style={{ padding: '10px 14px', fontWeight: 'bold' }}>Kiểm Duyệt IP Guard</th>
              <th style={{ padding: '10px 14px', fontWeight: 'bold' }}>Thời Gian Nạp</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Chưa có dữ liệu từ khóa. Hãy thả file H10 hoặc YTrends vào khung Nạp File bên trên.
                </td>
              </tr>
            ) : (
              filtered.map((item, index) => (
                <tr key={index} style={{ borderBottom: '1px solid var(--border-color, #f1f5f9)' }}>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>#{index + 1}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{item.keyword}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>
                      {item.category}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {item.ipVerdict === 'BLOCK' ? (
                      <span style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, fontSize: '0.75rem' }}>
                        <ShieldAlert size={14} /> BLOCK ({item.ipHits.join(', ')})
                      </span>
                    ) : (
                      <span style={{ color: '#16a34a', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, fontSize: '0.75rem' }}>
                        <ShieldCheck size={14} /> PASSED
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    {new Date(item.discoveredAt).toLocaleString('vi-VN')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
