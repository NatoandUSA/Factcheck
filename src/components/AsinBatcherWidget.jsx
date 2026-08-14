import React, { useState } from 'react';
import { Layers, CheckCircle2, ArrowRight, FileSpreadsheet, Sparkles, HelpCircle } from 'lucide-react';

export default function AsinBatcherWidget({ onShowToast }) {
  const [asinInput, setAsinInput] = useState('');
  const [seedKeyword, setSeedKeyword] = useState('Mother In Law Necklace');
  const [batchResult, setBatchResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleCreateBatches = async () => {
    if (!asinInput.trim()) {
      onShowToast?.('Vui lòng dán danh sách 11 - 15 ASINs từ báo cáo Xray!', 'warning');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('http://localhost:3001/api/asins/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asins: asinInput, seedKeyword })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setBatchResult(data);
        onShowToast?.(`Đã tạo thành công ${data.batchCount} Batch (mỗi Batch 10 ASINs)!`, 'success');
      } else {
        onShowToast?.(data.error || 'Lỗi phân chia Batch ASINs', 'error');
      }
    } catch (err) {
      onShowToast?.(`Lỗi: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="studio-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={20} style={{ color: '#d97706' }} />
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>
              Xray ASIN Batching Assistant (Bước 2: Phân nhóm 10 ASINs / Batch)
            </h3>
          </div>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Dán 11 - 15 ASINs đối thủ từ H10 Xray để tự động tạo 2 - 5 Batch (mỗi Batch 10 ASINs) kèm giải thích lý do trước khi chạy Cerebro.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Từ khóa Hạt giống (Seed Phrase):
          </label>
          <input 
            type="text" 
            value={seedKeyword}
            onChange={(e) => setSeedKeyword(e.target.value)}
            placeholder="Ví dụ: Mother In Law Necklace"
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color, #cbd5e1)', fontSize: '0.85rem' }}
          />

          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Danh sách 11 - 15 ASINs đối thủ từ Xray:
          </label>
          <textarea
            rows={5}
            value={asinInput}
            onChange={(e) => setAsinInput(e.target.value)}
            placeholder="Dán ASINs ở đây (mỗi ASIN một dòng hoặc phân tách bằng dấu phẩy):&#10;B0GYZP478P&#10;B08N5KWB9H&#10;B07XQ8N3ZM..."
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color, #cbd5e1)', fontSize: '0.85rem', fontFamily: 'monospace' }}
          />

          <button
            className="btn btn-primary"
            disabled={loading}
            onClick={handleCreateBatches}
            style={{ background: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px' }}
          >
            <Sparkles size={16} className={loading ? 'spinner' : ''} />
            <span>{loading ? 'Đang phân tích...' : '⚡ Tạo Các Batch 10 ASINs'}</span>
          </button>
        </div>

        <div>
          {!batchResult ? (
            <div style={{ background: 'var(--panel-header-bg, #f8fafc)', border: '1px border-dashed var(--border-color, #cbd5e1)', borderRadius: '12px', padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <FileSpreadsheet size={36} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
              <div>Kết quả phân chia Batch và Lệnh chạy Cerebro sẽ hiển thị tại đây.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '360px', overflowY: 'auto' }}>
              <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '10px 14px', borderRadius: '8px', color: '#065f46', fontSize: '0.85rem', fontWeight: 600 }}>
                ✅ Đã phân tích thành công {batchResult.totalInputAsins} ASINs $\rightarrow$ Tạo {batchResult.batchCount} Batch cho Niche "{batchResult.seedKeyword}".
              </div>

              {batchResult.batches.map((b) => (
                <div key={b.batchNumber} style={{ background: '#ffffff', border: '1px solid var(--border-color, #cbd5e1)', borderRadius: '10px', padding: '14px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
                  <div style={{ fontWeight: 700, color: '#b45309', fontSize: '0.9rem', marginBottom: '4px' }}>
                    {b.batchName} ({b.asinCount} ASINs)
                  </div>
                  <p style={{ margin: '0 0 8px 0', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                    💡 <strong>Lý do chọn Batch:</strong> {b.rationale}
                  </p>
                  <div style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', fontSize: '0.75rem', fontFamily: 'monospace', color: '#334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{b.cerebroCommand}</span>
                    <button 
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        navigator.clipboard.writeText(b.asins.join(', '));
                        onShowToast?.(`Đã copy 10 ASINs của ${b.batchName}!`, 'info');
                      }}
                      style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                    >
                      Copy 10 ASINs
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
