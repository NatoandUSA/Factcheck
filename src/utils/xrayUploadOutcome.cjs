/**
 * Safe, dependency-free CommonJS implementation of deriveXrayUploadOutcome.
 * Zero dynamic code compilation.
 */

function deriveXrayUploadOutcome({ ok, data, error } = {}) {
  if (error) {
    return {
      status: 'ERROR',
      batches: [],
      xraySellers: [],
      toastMessage: `Lỗi nạp Xray: ${error.message || String(error)}`,
      toastType: 'error',
      errorMessage: error.message || String(error)
    };
  }

  if (!ok || !data || data.success === false) {
    const reason = (data && data.error) || 'Upload failed.';
    return {
      status: 'INSUFFICIENT_EVIDENCE',
      batches: [],
      xraySellers: [],
      toastMessage: `⚠ [B1] Xray upload rejected: ${reason}`,
      toastType: 'error',
      errorMessage: reason
    };
  }

  if (!data.isXray || !Array.isArray(data.batches) || data.batches.length === 0) {
    return {
      status: 'INSUFFICIENT_EVIDENCE',
      batches: [],
      xraySellers: [],
      toastMessage: '⚠ [B1] File không chứa dữ liệu Xray ASIN hợp lệ (không có batch nào được tạo).',
      toastType: 'error',
      errorMessage: 'No Xray batches were returned.'
    };
  }

  const batches = data.batches.map((b, idx) => {
    const asins = Array.isArray(b.asins) ? b.asins : [];
    const items = Array.isArray(b.items) && b.items.length > 0
      ? b.items.map(it => ({
          asin: it.asin,
          title: it.title ?? null,
          price: typeof it.price === 'number' ? it.price : null,
          sales: typeof it.sales === 'number' ? it.sales : null
        }))
      : asins.map(asin => ({ asin, title: null, price: null, sales: null }));

    return {
      name: b.batchName || b.name || `Batch ${idx + 1} (${asins.length} ASINs)`,
      rationale: b.rationale || null,
      asins,
      items
    };
  });

  return {
    status: 'SUCCESS',
    batches,
    xraySellers: batches.flatMap(b => b.items),
    toastMessage: `✓ [B1] Đã nạp & bóc tách thành công file Xray! Tự động tạo ${batches.length} Batch ở B2.`,
    toastType: 'success',
    errorMessage: null
  };
}

module.exports = { deriveXrayUploadOutcome };
