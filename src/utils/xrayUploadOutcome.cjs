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

  const normalizeText = value => typeof value === 'string' && value.trim() ? value.trim() : null;
  const normalizeNumber = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const normalizeBoolean = value => value === true ? true : (value === false ? false : null);
  const normalizeEnum = (value, allowed) => allowed.includes(value) ? value : 'UNKNOWN';
  const normalizeObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

  // Preserve observed Xray columns end-to-end. A field not present in the
  // uploaded report remains null/UNKNOWN; the client never creates a display
  // value for it. This whitelist avoids spreading untrusted upload fields.
  const normalizeItem = item => ({
    asin: normalizeText(item?.asin),
    title: normalizeText(item?.title),
    brand: normalizeText(item?.brand),
    price: normalizeNumber(item?.price),
    fees: normalizeNumber(item?.fees),
    sales: normalizeNumber(item?.sales),
    parentSales: normalizeNumber(item?.parentSales),
    salesScope: normalizeEnum(item?.salesScope, ['ASIN', 'UNKNOWN']),
    parentSalesScope: normalizeEnum(item?.parentSalesScope, ['PARENT', 'UNKNOWN']),
    revenue: normalizeNumber(item?.revenue),
    parentRevenue: normalizeNumber(item?.parentRevenue),
    revenueScope: normalizeEnum(item?.revenueScope, ['ASIN', 'UNKNOWN']),
    parentRevenueScope: normalizeEnum(item?.parentRevenueScope, ['PARENT', 'UNKNOWN']),
    bsr: normalizeNumber(item?.bsr),
    rankSourceHeader: normalizeText(item?.rankSourceHeader),
    ratingValue: normalizeNumber(item?.ratingValue),
    ratingCount: normalizeNumber(item?.ratingCount),
    reviewCount: normalizeNumber(item?.reviewCount),
    reviewVelocity: normalizeNumber(item?.reviewVelocity),
    buyBox: normalizeText(item?.buyBox),
    fulfillment: normalizeText(item?.fulfillment),
    category: normalizeText(item?.category),
    seller: normalizeText(item?.seller),
    sellerCountry: normalizeText(item?.sellerCountry),
    sellerAge: normalizeNumber(item?.sellerAge),
    creationDate: normalizeText(item?.creationDate),
    abaMostClicked: normalizeText(item?.abaMostClicked),
    isBestSeller: normalizeBoolean(item?.isBestSeller),
    isSponsored: normalizeBoolean(item?.isSponsored),
    imageUrl: normalizeText(item?.imageUrl),
    titleCharCount: normalizeNumber(item?.titleCharCount),
    activeSellers: normalizeNumber(item?.activeSellers),
    url: normalizeText(item?.url),
    urlProvenance: normalizeText(item?.urlProvenance),
    evidenceState: normalizeEnum(item?.evidenceState, ['SOURCE_REPORTED', 'MANUAL_ASSERTION', 'UNKNOWN']),
    fieldProvenance: normalizeObject(item?.fieldProvenance)
  });

  const batches = data.batches.map((b, idx) => {
    const asins = Array.isArray(b.asins) ? b.asins : [];
    const items = Array.isArray(b.items) && b.items.length > 0
      ? b.items.map(normalizeItem)
      : asins.map(asin => normalizeItem({ asin }));

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
    reportProvenance: data.reportProvenance && typeof data.reportProvenance === 'object'
      ? data.reportProvenance
      : null,
    committed: data.committed === true,
    evidenceId: Number.isInteger(data.evidenceId) ? data.evidenceId : null,
    toastMessage: `✓ [B1] Đã nạp & bóc tách thành công file Xray! Tự động tạo ${batches.length} Batch ở B2.`,
    toastType: 'success',
    errorMessage: null
  };
}

module.exports = { deriveXrayUploadOutcome };
