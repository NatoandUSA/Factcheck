import React, { useEffect, useState, useRef } from 'react';
import { 
  FileSpreadsheet, Layers, Sparkles, Database, ArrowRight, CheckCircle2, 
  Copy, UploadCloud, AlertCircle, Zap, ShieldCheck, Award, ExternalLink, RefreshCw
} from 'lucide-react';
import MasterKeywordTable from './MasterKeywordTable';
import { parseJsonResponse } from '../utils/apiResponse';
import { deriveXrayUploadOutcome } from '../utils/xrayUploadOutcome.js';

export default function AmazonPipelineWorkflow({ 
  seedPhrase, 
  selectedCategory, 
  activeProjectId, 
  onShowToast, 
  onSelectListing, 
  onProceedToStage,
  onUpdateXraySellers,
  onUpdateCerebroSummary,
  onGenerateListingDirect,
  isDrafting
}) {
  // Step 1: Feed Xray State
  const [xrayFiles, setXrayFiles] = useState([]);
  const [xrayAsinsInput, setXrayAsinsInput] = useState('');
  const [xraySellers, setXraySellers] = useState([]);
  const [xrayProvenance, setXrayProvenance] = useState(null);
  const [xrayCommitted, setXrayCommitted] = useState(false);
  const [xrayLoading, setXrayLoading] = useState(false);
  const [xrayError, setXrayError] = useState(null);
  const [isXrayDragging, setIsXrayDragging] = useState(false);
  const xrayInputRef = useRef(null);

  // Step 2: Batch 10 ASINs State
  const [batches, setBatches] = useState([]);
  const [activeBatchIndex, setActiveBatchIndex] = useState(0);

  // Step 3: Feed Cerebro State
  const [cerebroFiles, setCerebroFiles] = useState([]);
  const [cerebroLoading, setCerebroLoading] = useState(false);
  const [isCerebroDragging, setIsCerebroDragging] = useState(false);
  const [cerebroKeywords, setCerebroKeywords] = useState([]);
  const [cerebroSummary, setCerebroSummary] = useState(null);
  const cerebroInputRef = useRef(null);

  // Step 4: Listing Generation State
  const [drafting, setDrafting] = useState(false);
  const [draftedListing, setDraftedListing] = useState(null);

  const activeProjectIdRef = useRef(null);
  activeProjectIdRef.current = activeProjectId || null;

  useEffect(() => {
    const requestedProjectId = activeProjectId || null;
    let current = true;
    const clearProjectXrayState = () => {
      setBatches([]);
      setActiveBatchIndex(0);
      setXraySellers([]);
      setXrayProvenance(null);
      setXrayCommitted(false);
      setXrayError(null);
      onUpdateXraySellers?.([]);
    };

    // Clear synchronously on every project switch. A prior project's rows
    // must never remain visible while the next project's import is loading.
    clearProjectXrayState();
    if (!requestedProjectId) return () => { current = false; };

    fetch(`/api/projects/${encodeURIComponent(requestedProjectId)}/research-imports/AMAZON_XRAY_REPORT_V1`, { credentials: 'include' })
      .then(async response => {
        const data = await parseJsonResponse(response);
        const validImport = data?.import === null
          || (data?.import && typeof data.import === 'object' && !Array.isArray(data.import)
            && data.import.metadata && typeof data.import.metadata === 'object' && !Array.isArray(data.import.metadata)
            && Array.isArray(data.import.metadata.batches) && Array.isArray(data.import.metadata.xraySellers));
        if (!response.ok || data?.success !== true || !validImport) {
          throw new Error(data?.error || 'XRAY_REHYDRATION_FAILED');
        }
        return data;
      })
      .then(data => {
        if (!current || activeProjectIdRef.current !== requestedProjectId) return;
        const metadata = data.import?.metadata;
        if (!metadata) return;
        setBatches(Array.isArray(metadata.batches) ? metadata.batches : []);
        setXraySellers(Array.isArray(metadata.xraySellers) ? metadata.xraySellers : []);
        setXrayProvenance(metadata.reportProvenance || null);
        setXrayCommitted(true);
        onUpdateXraySellers?.(Array.isArray(metadata.xraySellers) ? metadata.xraySellers : []);
      })
      .catch(error => {
        if (!current || activeProjectIdRef.current !== requestedProjectId) return;
        clearProjectXrayState();
        const message = `Không thể tải lại dữ liệu Xray cho project hiện tại: ${error.message || 'UNKNOWN_ERROR'}`;
        setXrayError(message);
        onShowToast?.(message, 'error');
      });
    return () => { current = false; };
  }, [activeProjectId]);

  // B1: Handle Feed Xray — preview first; the same files are reparsed on confirm.
  const handleXrayUpload = async (fileList, confirm = false) => {
    if (!fileList || (fileList.length === 0 && !fileList[0])) return;
    if (!activeProjectId) {
      onShowToast?.('Tạo hoặc chọn Active Project trước khi nạp Xray để dữ liệu được bind đúng project.');
      return;
    }
    const filesArray = Array.from(fileList);
    setXrayLoading(true);
    setXrayFiles(filesArray);
    setXrayError(null);

    const formData = new FormData();
    filesArray.forEach((file) => {
      formData.append('reportFile', file);
    });
    formData.append('category', selectedCategory);
    formData.append('marketplace', 'AMAZON');
    formData.append('seedPhrase', seedPhrase || selectedCategory);
    if (activeProjectId) formData.append('projectId', activeProjectId);
    formData.append('confirm', String(confirm));

    let outcome;
    try {
      const res = await fetch('/api/upload-h10', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });
      const data = await parseJsonResponse(res);
      outcome = deriveXrayUploadOutcome({ ok: res.ok, data });
    } catch (err) {
      outcome = deriveXrayUploadOutcome({ error: err });
    }

    setBatches(outcome.batches);
    setXraySellers(outcome.xraySellers);
    setXrayProvenance(outcome.reportProvenance || null);
    setXrayCommitted(outcome.status === 'SUCCESS' && outcome.committed === true);
    if (onUpdateXraySellers && outcome.xraySellers) {
      onUpdateXraySellers(outcome.xraySellers);
    }
    setXrayError(outcome.status === 'SUCCESS' ? null : outcome.errorMessage);
    if (onShowToast) onShowToast(outcome.toastMessage, outcome.toastType);
    setXrayLoading(false);
  };

  // Copy space-separated ASINs to clipboard for 1-Click Cerebro paste
  const handleCopy10Asins = (asinsArray) => {
    const text = (asinsArray || []).join(' ');
    navigator.clipboard.writeText(text);
    if (onShowToast) onShowToast(`📋 Đã copy ${(asinsArray || []).length} ASINs (dạng dấu cách) vào Clipboard! Dán trực tiếp vào H10 Cerebro.`);
  };

  // B3: Handle Feed Cerebro Report — Supports Multi-File Upload
  const handleCerebroUpload = async (fileList) => {
    if (!fileList || (fileList.length === 0 && !fileList[0])) return;
    if (!activeProjectId) {
      onShowToast?.('Tạo hoặc chọn Active Project trước khi nạp Cerebro để dữ liệu được bind đúng project.');
      return;
    }
    const filesArray = Array.from(fileList);
    setCerebroLoading(true);
    setCerebroFiles(filesArray);

    const formData = new FormData();
    filesArray.forEach((file) => {
      formData.append('reportFile', file);
    });
    formData.append('category', selectedCategory);
    formData.append('marketplace', 'AMAZON');
    formData.append('seedPhrase', seedPhrase || 'para el amor de mi vida');
    if (activeProjectId) formData.append('projectId', activeProjectId);

    try {
      const res = await fetch('/api/upload-h10', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch (e) { throw new Error('Server returned invalid JSON'); }
      if (!res.ok) throw new Error(data.error || 'Upload Cerebro failed');

      setCerebroSummary(data);
      const kws = data.topKeywordsDetailed || [];
      setCerebroKeywords(kws);

      if (onUpdateCerebroSummary) {
        onUpdateCerebroSummary(data, kws);
      }

      if (onShowToast) onShowToast(`✓ [B3] Đã nạp Cerebro (${filesArray.length} file, ${data.totalRows} từ khóa)! Đã tính điểm MKL 5-Tier ở B4.`);
    } catch (err) {
      if (onShowToast) onShowToast(`Lỗi nạp Cerebro: ${err.message}`);
    } finally {
      setCerebroLoading(false);
    }
  };

  // B4: Generate Amazon A10 Listing from MKL or Direct Seed
  const handleGenerateListing = async () => {
    if (onGenerateListingDirect) {
      return onGenerateListingDirect();
    }
    if (!seedPhrase.trim()) {
      if (onShowToast) onShowToast('Vui lòng nhập Từ khóa Hạt nhân (Seed Phrase) ở đầu trang.');
      return;
    }
    if (!cerebroSummary?.trendId || cerebroKeywords.length === 0) {
      if (onShowToast) onShowToast('Nạp Cerebro ở Bước 3 trước khi tạo listing.');
      return;
    }

    setDrafting(true);
    try {
      const res = await fetch(`/api/trends/${cerebroSummary.trendId}/draft`, {
        method: 'POST',
        credentials: 'include'
      });

      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data.error || 'Drafting failed');

      setDraftedListing(data.listing);
      if (onShowToast) onShowToast('✅ [B4] Đã tạo thành công Amazon Listing & A+ Content chuẩn 75 chars!');
      if (onSelectListing && data.listing) {
        onSelectListing(data.listing);
      }
    } catch (err) {
      if (onShowToast) onShowToast(`Lỗi tạo listing: ${err.message}`);
    } finally {
      setDrafting(false);
    }
  };

  const activeBatch = batches[activeBatchIndex] || (batches.length > 0 ? batches[0] : null);
  const canUpload = Boolean(activeProjectId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* 4-Step Visual Flow Indicator */}
      <div style={{
        background: 'var(--bg-surface)',
        borderRadius: '16px',
        padding: '18px 24px',
        border: '1px solid #bae6fd',
        boxShadow: '0 4px 12px rgba(2, 132, 199, 0.06)'
      }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
          🔄 Amazon A10 4-Step Standard Operating Procedure (Quy Trình Chuẩn 4 Bước)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          {[
            { step: 'B1', title: 'Feed Xray', desc: 'Nạp file Xray 15-20 ASINs', active: true, done: xraySellers.length > 0 },
            { step: 'B2', title: 'Xuất Batch ASINs', desc: 'Gom nhóm ASINs theo batch 10', active: xraySellers.length > 0, done: batches.length > 0 },
            { step: 'B3', title: 'Feed Cerebro', desc: 'Nạp báo cáo Reverse ASIN', active: batches.length > 0, done: cerebroKeywords.length > 0 },
            { step: 'B4', title: 'Master KW & Listing', desc: 'Phân tầng 3 Tiers & Sinh A10', active: cerebroKeywords.length > 0, done: Boolean(draftedListing) }
          ].map((item, i) => (
            <div 
              key={i} 
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                background: item.done ? '#f0fdf4' : item.active ? '#f0f9ff' : '#f8fafc',
                border: item.done ? '2px solid #22c55e' : item.active ? '2px solid #0284c7' : '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}
            >
              <div style={{
                background: item.done ? '#16a34a' : item.active ? '#0284c7' : '#94a3b8',
                color: '#fff',
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '0.75rem',
                flexShrink: 0
              }}>
                {item.done ? '✓' : item.step}
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.85rem', color: item.done ? '#15803d' : item.active ? '#0369a1' : '#64748b' }}>
                  {item.title}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ======================================================== */}
      {/* BƯỚC 1: FEED XRAY */}
      {/* ======================================================== */}
      <div className="studio-panel" style={{ padding: '24px', borderLeft: '4px solid #0284c7' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: '#0369a1', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileSpreadsheet size={20} />
              BƯỚC 1: Feed Báo Cáo Helium 10 Xray
            </h3>
            <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Thả file Xray (.xlsx / .csv) xuất từ trang tìm kiếm Amazon cho Seed Phrase "{seedPhrase}".
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Danh mục:</span>
            <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '4px 10px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700 }}>
              {selectedCategory}
            </span>
          </div>
        </div>

        {!canUpload && <div style={{ marginBottom: '12px', padding: '10px 12px', borderRadius: '8px', background: '#fffbeb', color: '#92400e', fontSize: '0.82rem' }}>Bắt đầu bằng “Tạo project” ở đầu trang. Sau khi project được chọn, upload Xray sẽ được bind đúng marketplace/workspace/project.</div>}

        <div 
          onDragOver={(e) => { if (!canUpload) return; e.preventDefault(); setIsXrayDragging(true); }}
          onDragLeave={() => setIsXrayDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsXrayDragging(false);
            if (canUpload && e.dataTransfer.files?.length) handleXrayUpload(e.dataTransfer.files);
          }}
          onClick={() => canUpload && xrayInputRef.current?.click()}
          style={{
            border: `2px dashed ${isXrayDragging ? '#0284c7' : '#93c5fd'}`,
            background: isXrayDragging ? '#e0f2fe' : '#f0f9ff',
            padding: '24px',
            borderRadius: '12px',
            textAlign: 'center',
            cursor: canUpload ? 'pointer' : 'not-allowed',
            opacity: canUpload ? 1 : 0.65,
            transition: 'all 0.15s ease'
          }}
        >
          <input 
            type="file" 
            ref={xrayInputRef} 
            multiple
            disabled={!canUpload}
            onChange={(e) => { if (e.target.files?.length) handleXrayUpload(e.target.files); }}
            accept=".xlsx,.xls,.csv,.html"
            style={{ display: 'none' }}
          />
          <UploadCloud size={32} style={{ color: '#0284c7', margin: '0 auto 8px' }} />
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0369a1' }}>
            {xrayFiles.length > 0 
              ? `✓ Đã nạp ${xrayFiles.length} file Xray: ${xrayFiles.map(f => f.name).join(', ')}` 
              : 'Kéo thả 1 hoặc nhiều file Helium 10 Xray (.xlsx / .csv) vào đây hoặc bấm để chọn'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Hỗ trợ chọn nhiều file Xray cùng lúc — Hệ thống tự động gộp ASINs, loại trùng và chia Batch 10
          </div>
        </div>

        {xraySellers.length > 0 && !xrayCommitted && (
          <button
            type="button"
            disabled={xrayLoading}
            onClick={() => handleXrayUpload(xrayFiles, true)}
            style={{ marginTop: '12px', padding: '10px 16px', borderRadius: '8px', border: 0, background: '#0369a1', color: 'white', fontWeight: 700 }}
          >
            Xác nhận lưu Xray vào project
          </button>
        )}

        {xrayError && (
          <div style={{
            marginTop: '12px',
            padding: '12px 16px',
            borderRadius: '10px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            fontSize: '0.85rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertCircle size={16} />
            <span>Không thể nạp Xray: {xrayError}</span>
          </div>
        )}

        {xrayProvenance && (
          <div style={{ marginTop: '12px', padding: '10px 12px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #cbd5e1', color: '#475569', fontSize: '0.78rem' }}>
            <strong>Imported Staff Xray report — snapshot, not live verified.</strong> Manual review only; this data cannot satisfy Product Truth, approval, export, or publish gates. Capture time: {xrayProvenance.captureTime || 'UNKNOWN'}.
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* BƯỚC 2: XUẤT BATCH ASINS */}
      {/* ======================================================== */}
      {batches.length > 0 && (
        <div className="studio-panel" style={{ padding: '24px', borderLeft: '4px solid #d97706' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: '#b45309', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={20} />
                BƯỚC 2: Xuất Batch ASINs Đối Thủ ({batches.length} Batches)
              </h3>
              <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Gom nhóm ASINs (tối đa 10/batch) từ report snapshot để nạp vào Cerebro. Metadata chỉ là source-reported, không phải dữ liệu Amazon live.
              </p>
            </div>

            {activeBatch && (
              <button
                onClick={() => handleCopy10Asins(activeBatch.asins)}
                className="btn btn-primary btn-sm"
                style={{ background: '#d97706', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}
              >
                <Copy size={14} />
                <span>📋 Copy 1-Click 10 ASINs</span>
              </button>
            )}
          </div>

          {/* Batch Selector Tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
            {batches.map((b, idx) => (
              <button
                key={idx}
                onClick={() => setActiveBatchIndex(idx)}
                style={{
                  background: activeBatchIndex === idx ? '#fef3c7' : '#f8fafc',
                  border: activeBatchIndex === idx ? '2px solid #d97706' : '1px solid #e2e8f0',
                  color: activeBatchIndex === idx ? '#92400e' : '#475569',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
              >
                {b.batchName || b.name}
              </button>
            ))}
          </div>

          {/* ASINs Table with Rich Xray Metrics for Staff Manual Review */}
          {activeBatch && (
            <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid #fde68a' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left', minWidth: '1000px' }}>
                <thead>
                  <tr style={{ background: '#fffbeb', borderBottom: '2px solid #fde68a', color: '#92400e' }}>
                    <th style={{ padding: '10px 12px', fontWeight: 700 }}>STT</th>
                    <th style={{ padding: '10px 12px', fontWeight: 700 }}>Sản Phẩm & ASIN</th>
                    <th style={{ padding: '10px 12px', fontWeight: 700, minWidth: '220px' }}>Tiêu Đề & Brand</th>
                    <th style={{ padding: '10px 12px', fontWeight: 700 }}>Giá / Fees</th>
                    <th style={{ padding: '10px 12px', fontWeight: 700 }}>Sales (ASIN / Parent)</th>
                    <th style={{ padding: '10px 12px', fontWeight: 700 }}>Revenue (source snapshot)</th>
                    <th style={{ padding: '10px 12px', fontWeight: 700 }}>Rank / Rating (source snapshot)</th>
                    <th style={{ padding: '10px 12px', fontWeight: 700 }}>Fulfillment / Seller</th>
                    <th style={{ padding: '10px 12px', fontWeight: 700 }}>Ngày Tạo / ABA</th>
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(activeBatch?.items) ? activeBatch.items : (activeBatch?.asins || []).map(asin => ({ asin, title: null, price: null, sales: null }))).map((item, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #fef3c7', background: i % 2 === 0 ? '#fff' : '#fffdf5' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#92400e' }}>#{i + 1}</td>
                      
                      {/* ASIN & Image */}
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {item?.imageUrl && (
                            <img 
                              src={item.imageUrl} 
                              alt="Thumbnail" 
                              style={{ width: '36px', height: '36px', objectFit: 'contain', borderRadius: '4px', border: '1px solid #e2e8f0', background: '#fff' }} 
                            />
                          )}
                          <div>
                            <a 
                              href={item?.url || `https://www.amazon.com/dp/${item?.asin}`} 
                              target="_blank" 
                              rel="noreferrer" 
                              style={{ fontFamily: 'monospace', fontWeight: 800, color: '#0369a1', textDecoration: 'none' }}
                            >
                              {item?.asin || '—'} ↗
                            </a>
                            <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
                              {item?.isBestSeller === true && (
                                <span style={{ background: '#fef08a', color: '#854d0e', fontSize: '0.65rem', padding: '1px 4px', borderRadius: '3px', fontWeight: 800 }}>
                                  #1 Best Seller
                                </span>
                              )}
                              {item?.isSponsored === true && (
                                <span style={{ background: '#f1f5f9', color: '#475569', fontSize: '0.65rem', padding: '1px 4px', borderRadius: '3px', fontWeight: 700 }}>
                                  Sponsored
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Title & Brand */}
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontWeight: 600, color: '#1e293b', lineHeight: 1.3, maxHeight: '2.6em', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item?.title || '—'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '3px', display: 'flex', gap: '8px' }}>
                          {item?.brand && <span>Brand: <strong>{item.brand}</strong></span>}
                          {item?.titleCharCount && <span>({item.titleCharCount} ký tự)</span>}
                        </div>
                      </td>

                      {/* Price & Fees */}
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontWeight: 800, color: '#16a34a', fontSize: '0.9rem' }}>
                          {typeof item?.price === 'number' ? `$${item.price.toFixed(2)}` : (item?.price || '—')}
                        </div>
                        {typeof item?.fees === 'number' && (
                          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>
                            Fees: ${item.fees.toFixed(2)}
                          </div>
                        )}
                      </td>

                      {/* Sales */}
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontWeight: 800, color: '#0284c7', fontSize: '0.9rem' }}>
                          {typeof item?.sales === 'number' ? item.sales.toLocaleString() : '—'}
                        </div>
                        {item?.salesScope && item.salesScope !== 'UNKNOWN' && <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{item.salesScope} source field</div>}
                        {typeof item?.parentSales === 'number' && item?.parentSales !== item?.sales && (
                          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                            Parent source: {item.parentSales.toLocaleString()}
                          </div>
                        )}
                      </td>

                      {/* Revenue */}
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontWeight: 800, color: '#0f172a' }}>
                          {typeof item?.revenue === 'number' ? `$${item.revenue.toLocaleString()}` : '—'}
                        </div>
                        {item?.revenueScope && item.revenueScope !== 'UNKNOWN' && <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{item.revenueScope} source field</div>}
                        {typeof item?.parentRevenue === 'number' && item?.parentRevenue !== item?.revenue && (
                          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                            Parent source: ${item.parentRevenue.toLocaleString()}
                          </div>
                        )}
                      </td>

                      {/* BSR & Ratings */}
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontWeight: 700, color: '#7e22ce' }}>
                          {typeof item?.bsr === 'number' ? `#${item.bsr.toLocaleString()}` : '—'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {typeof item?.ratingValue === 'number' && <span>⭐ {item.ratingValue.toFixed(1)}</span>}
                          {typeof item?.ratingCount === 'number' && <span>({item.ratingCount.toLocaleString()} ratings)</span>}
                          {typeof item?.reviewCount === 'number' && <span>({item.reviewCount.toLocaleString()} reviews)</span>}
                        </div>
                      </td>

                      {/* Fulfillment & Seller */}
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{
                            background: item?.fulfillment?.toUpperCase() === 'FBA' ? '#dbeafe' : '#f1f5f9',
                            color: item?.fulfillment?.toUpperCase() === 'FBA' ? '#1d4ed8' : '#475569',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            fontWeight: 800,
                            fontSize: '0.7rem'
                          }}>
                            {item?.fulfillment || 'UNKNOWN'}
                          </span>
                          {item?.buyBox && (
                            <span style={{ fontSize: '0.72rem', color: '#334155', fontWeight: 600 }}>
                              {item.buyBox}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '3px' }}>
                          {item?.sellerCountry && <span>{item.sellerCountry}</span>}
                          {typeof item?.sellerAge === 'number' && <span> • {item.sellerAge} mo</span>}
                        </div>
                      </td>

                      {/* Creation Date / ABA */}
                      <td style={{ padding: '10px 12px', fontSize: '0.75rem', color: '#475569' }}>
                        <div>{item?.creationDate || '—'}</div>
                        {item?.abaMostClicked && (
                          <div style={{ color: '#0369a1', fontWeight: 700, marginTop: '2px', fontSize: '0.7rem' }}>
                            ABA: {item.abaMostClicked}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* BƯỚC 3: FEED CEREBRO REVERSE ASIN */}
      {/* ======================================================== */}
      <div className="studio-panel" style={{ padding: '24px', borderLeft: '4px solid #16a34a' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: '#15803d', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Database size={20} />
              BƯỚC 3: Feed Báo Cáo Helium 10 Cerebro (Reverse 10 ASINs)
            </h3>
            <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Nạp 1 hoặc nhiều file xuất từ Helium 10 Cerebro để gộp và bóc tách toàn bộ từ khóa.
            </p>
          </div>

          {cerebroSummary && (
            <div style={{ background: '#dcfce7', color: '#15803d', padding: '4px 12px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700 }}>
              ✓ Đã nạp {cerebroSummary.totalRows} từ khóa Cerebro
            </div>
          )}
        </div>

        {!canUpload && <div style={{ marginBottom: '12px', padding: '10px 12px', borderRadius: '8px', background: '#fffbeb', color: '#92400e', fontSize: '0.82rem' }}>Cerebro chỉ nhận sau khi Active Project được chọn.</div>}

        <div 
          onDragOver={(e) => { if (!canUpload) return; e.preventDefault(); setIsCerebroDragging(true); }}
          onDragLeave={() => setIsCerebroDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsCerebroDragging(false);
            if (canUpload && e.dataTransfer.files?.length) handleCerebroUpload(e.dataTransfer.files);
          }}
          onClick={() => canUpload && cerebroInputRef.current?.click()}
          style={{
            border: `2px dashed ${isCerebroDragging ? '#16a34a' : '#86efac'}`,
            background: isCerebroDragging ? '#dcfce7' : '#f0fdf4',
            padding: '24px',
            borderRadius: '12px',
            textAlign: 'center',
            cursor: canUpload ? 'pointer' : 'not-allowed',
            opacity: canUpload ? 1 : 0.65,
            transition: 'all 0.15s ease'
          }}
        >
          <input 
            type="file" 
            ref={cerebroInputRef} 
            multiple
            disabled={!canUpload}
            onChange={(e) => { if (e.target.files?.length) handleCerebroUpload(e.target.files); }}
            accept=".xlsx,.xls,.csv,.html"
            style={{ display: 'none' }}
          />
          <UploadCloud size={32} style={{ color: '#16a34a', margin: '0 auto 8px' }} />
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#15803d' }}>
            {cerebroFiles.length > 0 
              ? `✓ Đã nạp ${cerebroFiles.length} file Cerebro: ${cerebroFiles.map(f => f.name).join(', ')}` 
              : 'Kéo thả 1 hoặc nhiều file Helium 10 Cerebro (.xlsx / .csv) vào đây hoặc bấm để chọn'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Hỗ trợ nạp nhiều file Cerebro cùng lúc — Tự động hợp nhất Search Volume, CPR và Title Density
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* BƯỚC 4: MASTER KEYWORD LIST & SINH LISTING A10 */}
      {/* ======================================================== */}
      <div className="studio-panel" style={{ padding: '24px', borderLeft: '4px solid #7e22ce' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: '#7e22ce', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={20} />
              BƯỚC 4: Master Keyword Intelligence (MKL 5-Tier Research Pack)
            </h3>
            <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Phân tầng 👑 Tier 1 (Title ≤ 75c), 📦 Tier 2 (Backend 249b), 💡 Tier 3 (Highlights 125c), 💎 Tier 4 (5 Bullets), ✨ Tier 5 (A+).
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={handleGenerateListing}
              disabled={drafting || isDrafting || (!cerebroSummary?.trendId && cerebroKeywords.length === 0)}
              className="btn btn-primary"
              style={{
                background: 'linear-gradient(135deg, #16a34a 0%, #0284c7 100%)',
                fontWeight: 800,
                padding: '10px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(22, 163, 74, 0.25)',
                cursor: (drafting || isDrafting) ? 'not-allowed' : 'pointer'
              }}
            >
              {(drafting || isDrafting) ? <RefreshCw size={16} className="spinner" /> : <Zap size={16} />}
              <span>{(drafting || isDrafting) ? 'Đang tạo...' : '⚡ Sinh Nhanh Listing A10'}</span>
            </button>

            <button
              onClick={() => onProceedToStage && onProceedToStage('research')}
              className="btn btn-primary"
              style={{
                background: '#0284c7',
                fontWeight: 800,
                padding: '10px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(2, 132, 199, 0.25)',
                cursor: 'pointer'
              }}
            >
              <ArrowRight size={16} />
              <span>➡️ Chuyển Sang Stage 2 (Research DNA)</span>
            </button>
          </div>
        </div>

        {(cerebroKeywords.length === 0 || !cerebroSummary?.trendId) && (
          <div style={{ fontSize: '0.8rem', color: '#9a3412', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px' }}>
            ⚠️ Nạp Cerebro ở Bước 3 trước — chưa có Master Keyword List thì chưa thể tạo listing.
          </div>
        )}

        {/* Master Keyword Table */}
        <MasterKeywordTable marketplace="AMAZON" keywords={cerebroKeywords} onShowToast={onShowToast} />

      </div>

    </div>
  );
}
