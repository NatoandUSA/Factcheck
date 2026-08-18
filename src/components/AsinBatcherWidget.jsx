import React, { useState } from 'react';
import { Layers, CheckCircle2, ArrowRight, FileSpreadsheet, Sparkles, HelpCircle } from 'lucide-react';
import { parseJsonResponse } from '../utils/apiResponse';

export default function AsinBatcherWidget({ onShowToast }) {
  const [asinInput, setAsinInput] = useState('');
  const [seedKeyword, setSeedKeyword] = useState('Mother In Law Necklace');
  const [batchResult, setBatchResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleCreateBatches = async () => {
    if (!asinInput.trim()) {
      onShowToast?.('Vui lòng dán 10 - 30 ASINs hợp lệ để phân batch.', 'warning');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/asins/batch', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asins: asinInput, seedKeyword })
      });

      const data = await parseJsonResponse(res);
      if (res.ok && data.success) {
        setBatchResult(data);
        onShowToast?.(`Đã tạo ${data.batchCount} Batch từ ${data.totalCleanAsins} ASINs đã cung cấp.`, 'success');
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
              Xray ASIN Batching Assistant (Bước 2: tối đa 10 ASINs / Batch)
            </h3>
          </div>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Dán 10 - 30 ASINs để chia thành các Batch tối đa 10 ASINs trước khi chạy Cerebro. Công cụ chỉ phân nhóm các identifier bạn cung cấp; nó không tự xác nhận Child/Parent status hay hiệu suất thị trường.
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

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Danh sách 10 - 30 ASINs từ Xray hoặc nguồn Staff đã kiểm tra:
            </label>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setAsinInput('B0DV4DSJ63 B0CPHXX2ZF B0CWQVR8MM B0G5NM4HM5 B0CPHV9JLX B0D1G8YB7K B0C7NYZYMP B0B8VL9QY5 B0F2788CZN B0DKBMF3LC B0FF9G91CH B0D25LRB3W B0DB5JC1LX B0D2525G6K B0FBM1D77B B0GVYGSJ1Z B0F5N1WCBM B0GGR92NT8 B0CCFYRH46 B09JZ1RT12 B0CQVF4RHM B0BCV9RTS3 B099Z5MK5N B09H2DB3T7 B097JF8R57 B0D6K6WCHK B0CWQVZ3C4 B0BBBG4QMF');
                setSeedKeyword('regalo para el amor de mi vida');
                onShowToast?.('Đã nạp 30 ASINs mẫu (demo) — chỉ để thử giao diện, không phải dữ liệu thị trường xác thực.', 'info');
              }}
              style={{ fontSize: '0.72rem', color: '#0284c7', background: '#e0f2fe', border: '1px solid #bae6fd', padding: '2px 8px', borderRadius: '6px' }}
            >
              📥 Nạp 30 ASINs Mẫu (Demo, không xác thực)
            </button>
          </div>
          <textarea
            rows={5}
            value={asinInput}
            onChange={(e) => setAsinInput(e.target.value)}
            placeholder="Dán ASINs ở đây (10 - 30 identifier, mỗi ASIN 10 ký tự chữ/số)..."
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color, #cbd5e1)', fontSize: '0.85rem', fontFamily: 'monospace' }}
          />

          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', padding: '10px 12px', borderRadius: '8px', fontSize: '0.78rem', color: '#0369a1', lineHeight: '1.4' }}>
            ℹ️ <strong>Quy tắc vận hành:</strong>
            <ul style={{ margin: '4px 0 0 0', paddingLeft: '16px' }}>
              <li><strong>Cerebro:</strong> tối đa 10 ASINs mỗi lần. Trước khi dùng, Staff phải tự xác minh identifier phù hợp với mục tiêu nghiên cứu (ví dụ Child ASIN nếu workflow yêu cầu).</li>
              <li><strong>OmniSeller:</strong> chỉ phân batch; không tự gán Child/Parent status, sales, BSR hay chất lượng thị trường cho ASIN thủ công.</li>
            </ul>
          </div>

          <button
            className="btn btn-primary"
            disabled={loading}
            onClick={handleCreateBatches}
            style={{ background: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px' }}
          >
            <Sparkles size={16} className={loading ? 'spinner' : ''} />
            <span>{loading ? 'Đang phân tích...' : '⚡ Phân Chia Thành Batch (tối đa 10 ASINs / Batch)'}</span>
          </button>
        </div>

        <div>
          {!batchResult ? (
            <div style={{ background: 'var(--panel-header-bg, #f8fafc)', border: '1px border-dashed var(--border-color, #cbd5e1)', borderRadius: '12px', padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <FileSpreadsheet size={36} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
              <div>Kết quả phân chia Batch ASINs (đúng theo identifier bạn cung cấp) và lệnh dán Cerebro sẽ hiển thị tại đây.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '380px', overflowY: 'auto' }}>
              <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '10px 14px', borderRadius: '8px', color: '#065f46', fontSize: '0.85rem', fontWeight: 600 }}>
                ✅ Đã tạo {batchResult.batchCount} Batch từ {batchResult.totalCleanAsins} ASINs đã cung cấp cho "{batchResult.seedKeyword}".
              </div>

              {batchResult.batches.map((b) => (
                <div key={b.batchNumber} style={{ background: '#ffffff', border: '1px solid var(--border-color, #cbd5e1)', borderRadius: '10px', padding: '14px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
                  <div style={{ fontWeight: 700, color: '#b45309', fontSize: '0.9rem', marginBottom: '4px' }}>
                    {b.batchName} ({b.asinCount} ASINs)
                  </div>
                  <p style={{ margin: '0 0 8px 0', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                    💡 <strong>Logic sắp xếp:</strong> {b.rationale}
                  </p>
                  <div style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', fontSize: '0.75rem', fontFamily: 'monospace', color: '#334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }}>
                      {b.asins.join(' ')}
                    </span>
                    <button 
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        navigator.clipboard.writeText(b.asins.join(' '));
                        onShowToast?.(`Đã copy ${b.asinCount} ASINs của ${b.batchName} để dán vào H10 Cerebro!`, 'info');
                      }}
                      style={{ fontSize: '0.7rem', padding: '3px 10px', background: '#d97706', color: '#fff', border: 'none', fontWeight: 700 }}
                    >
                      Copy {b.asinCount} ASINs Dán H10 Cerebro
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
