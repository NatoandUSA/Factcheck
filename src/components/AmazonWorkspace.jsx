import React, { useState, useEffect, useRef } from 'react';
import { 
  FileSpreadsheet, UploadCloud, CheckCircle2, AlertCircle, Zap, 
  Sparkles, Layers, ShieldCheck, Database, RefreshCw, ArrowRight
} from 'lucide-react';
import GoogleTrendsWidget from './GoogleTrendsWidget';
import AsinBatcherWidget from './AsinBatcherWidget';
import UnifiedIpGateModal from './UnifiedIpGateModal';

export default function AmazonWorkspace({ onSelectListing, onApproveListing, onShowToast }) {
  const [seedPhrase, setSeedPhrase] = useState('mom sweatshirt');
  const [selectedCategory, setSelectedCategory] = useState('Apparel: Sweatshirt');
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [draftingTrendId, setDraftingTrendId] = useState(null);
  const [isIpModalOpen, setIsIpModalOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [trends, setTrends] = useState([]);
  const [summaryStats, setSummaryStats] = useState(null);
  const fileInputRef = useRef(null);

  const fetchData = async () => {
    try {
      const summaryRes = await fetch('http://localhost:3001/api/analytics-summary');
      if (summaryRes.ok) {
        const sum = await summaryRes.json();
        setSummaryStats(sum);
      }
      const trendsRes = await fetch('http://localhost:3001/api/trends');
      if (trendsRes.ok) {
        const tr = await trendsRes.json();
        setTrends(tr.filter(t => t.source !== 'ETSY_MCP_LIVE'));
      }
    } catch (e) {
      console.warn('Failed to fetch Amazon workspace data', e);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleFileUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    setUploadStatus(null);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', selectedCategory);

    try {
      const res = await fetch('http://localhost:3001/api/upload-trends', {
        method: 'POST',
        body: formData
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Upload failed');

      setUploadStatus({
        type: 'success',
        trendId: result.trendId,
        message: `Đã nạp thành công ${result.totalRows} dòng từ "${result.fileName}"! Đã tính điểm A10 Opportunity Score.`,
        topKeywordsDetailed: result.topKeywordsDetailed || [],
        flaggedIpKeywords: result.flaggedIpKeywords || [],
        category: result.category
      });
      if (onShowToast) onShowToast(`✓ Đã nạp thành công dữ liệu Amazon H10!`);
      fetchData();
    } catch (err) {
      setUploadStatus({ type: 'error', message: err.message });
      if (onShowToast) onShowToast(`Lỗi: ${err.message}`);
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

      if (onShowToast) onShowToast('✅ Đã tạo Amazon Listing & A+ Content thành công!');
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
        border: '1px solid #bae6fd',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        boxShadow: '0 4px 12px rgba(2, 132, 199, 0.08)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '320px' }}>
          <div style={{ background: '#0284c7', color: '#fff', padding: '10px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: '#0369a1' }}>
              📍 0. Amazon A10 Master Seed Phrase (Từ khóa Hạt nhân):
            </div>
            <input
              type="text"
              className="form-input"
              style={{
                fontSize: '1rem',
                fontWeight: 700,
                color: '#0f172a',
                background: '#f0f9ff',
                marginTop: '4px',
                border: '1px solid #7dd3fc'
              }}
              value={seedPhrase}
              onChange={(e) => setSeedPhrase(e.target.value)}
              placeholder="Ví dụ: mom sweatshirt, personalized acrylic song plaque..."
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

      {/* Google Trends Cross-Check (Anchored on Amazon Seed Phrase) */}
      <GoogleTrendsWidget seedPhrase={seedPhrase} onShowToast={onShowToast} />

      {/* Amazon A10 Ingestion Engine Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '24px' }}>
        
        {/* Helium 10 Cerebro/Magnet Dropzone */}
        <div className="studio-panel" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '18px', borderLeft: '4px solid #0284c7' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px', margin: 0, color: '#0369a1' }}>
                <FileSpreadsheet size={22} style={{ color: '#0284c7' }} />
                Bước 1: Nạp Báo Cáo Helium 10 Cerebro / Magnet
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                Thả file `.xlsx` / `.csv` xuất từ Helium 10 để bóc tách từ khóa và tính điểm A10.
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
                <option value="Apparel: Shirt">👕 Apparel: Shirt</option>
                <option value="Apparel: Hoodie">🧥 Apparel: Hoodie</option>
                <option value="Mug">☕ Mug (Cốc/Ly)</option>
                <option value="Blanket">🛋️ Blanket (Chăn/Mền)</option>
                <option value="Jewelry">✨ Custom Jewelry</option>
                <option value="Embroidery">🧵 Custom Embroidery</option>
                <option value="Acrylic">💡 Custom Acrylic</option>
              </select>
            </div>
          </div>

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
              border: `2px dashed ${isDragging ? '#0284c7' : 'var(--border-strong)'}`,
              background: isDragging ? '#e0f2fe' : 'var(--bg-subtle)',
              borderRadius: '14px',
              padding: '36px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px'
            }}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) handleFileUpload(e.target.files[0]);
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

          {/* Upload Status Card */}
          {uploadStatus && (
            <div style={{ 
              padding: '16px 20px', 
              borderRadius: '12px', 
              fontSize: '0.85rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              background: uploadStatus.type === 'success' ? '#ecfdf5' : '#fef2f2',
              color: uploadStatus.type === 'success' ? '#065f46' : '#991b1b',
              border: `1px solid ${uploadStatus.type === 'success' ? '#a7f3d0' : '#fecaca'}`
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
                  {uploadStatus.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                  <span>{uploadStatus.message}</span>
                </div>
                {uploadStatus.trendId && (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={draftingTrendId === uploadStatus.trendId}
                    onClick={() => handleManualDraft(uploadStatus.trendId)}
                    style={{ background: '#0284c7', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Zap size={14} className={draftingTrendId === uploadStatus.trendId ? 'spinner' : ''} />
                    <span>{draftingTrendId === uploadStatus.trendId ? 'Đang gọi Gemini...' : '⚡ Tạo Amazon Listing'}</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Amazon A10 Algorithm Rules Info Panel */}
        <div className="studio-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: '#0369a1' }}>
            📐 Quy Tắc Thuật Toán Amazon A10 (Best Practices)
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <div style={{ background: '#f0f9ff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #bae6fd' }}>
              <strong style={{ color: '#0369a1' }}>👑 Tier 1 (Title 130-180 chars):</strong> Chứa Top 1-3 từ khóa có Search Volume cao nhất và Title Density $\le 5$.
            </div>
            <div style={{ background: '#f0f9ff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #bae6fd' }}>
              <strong style={{ color: '#0369a1' }}>💎 Tier 2 (5 Bullets):</strong> Bắt đầu bằng `[IN HOA HOOK]`, phân bổ 15 từ khóa Tier 2 vào tính năng & độ bền.
            </div>
            <div style={{ background: '#f0f9ff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #bae6fd' }}>
              <strong style={{ color: '#0369a1' }}>📦 Tier 3 (249 Bytes Search Terms):</strong> Phân cách bằng dấu cách (space-only), không dấu phẩy, không lặp lại từ khóa đã có ở Title.
            </div>
            <div style={{ background: '#f0f9ff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #bae6fd' }}>
              <strong style={{ color: '#0369a1' }}>✨ Amazon A+ Content:</strong> 10 Modules hình ảnh & câu chuyện thương hiệu nâng tỷ lệ chuyển đổi lên +25%.
            </div>
          </div>
        </div>
      </div>

      {/* Step 2: Helium 10 Xray ASIN Batching Assistant */}
      <AsinBatcherWidget onShowToast={onShowToast} />

      {/* Amazon Batches Queue */}
      {trends.length > 0 && (
        <div className="studio-panel" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '14px', color: '#0369a1' }}>
            Hàng Đợi Từ Khóa Amazon Helium 10 ({trends.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {trends.map((t) => (
              <div key={t.id} style={{ padding: '14px 18px', background: 'var(--bg-subtle)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border-subtle)' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a' }}>{t.category}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{t.trending_keywords}</div>
                </div>
                {!t.processed && (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={draftingTrendId === t.id}
                    onClick={() => handleManualDraft(t.id)}
                    style={{ background: '#0284c7' }}
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
