import React, { useMemo, useState } from 'react';

const FIELDS = [
  ['productName', 'Tên sản phẩm thật'],
  ['productType', 'Loại sản phẩm / contract'],
  ['materials', 'Chất liệu (phân cách bằng dấu phẩy)'],
  ['sizes', 'Kích thước / khối lượng / số lượng'],
  ['personalization', 'Hướng dẫn cá nhân hóa'],
  ['process', 'Quy trình thật (thêu, khắc, in...)'],
  ['packaging', 'Bao bì / phụ kiện đi kèm'],
  ['origin', 'Nơi sản xuất / ship-from đã xác nhận'],
  ['digitalDetails', 'Chi tiết sản phẩm số / định dạng file'],
  ['usageRights', 'Quyền sử dụng / giấy phép'],
  ['audience', 'Đối tượng sử dụng'],
  ['occasion', 'Dịp tặng / ngữ cảnh phù hợp']
];

function initialValues(card) {
  return Object.fromEntries(FIELDS.map(([key]) => {
    const value = card?.facts?.[key]?.value;
    if (key === 'personalization') return [key, value?.instructions || ''];
    if (Array.isArray(value)) return [key, value.join(', ')];
    return [key, value == null ? '' : String(value)];
  }));
}

export default function ProductTruthEditor({ listing, onSaved, onCancel, onShowToast }) {
  const existing = listing?.productTruthCard;
  const seed = useMemo(() => initialValues(existing), [existing]);
  const [values, setValues] = useState(seed);
  const [basis, setBasis] = useState('PHYSICAL_INSPECTION');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    try {
      const facts = {};
      for (const [key, label] of FIELDS) {
        const text = String(values[key] || '').trim();
        if (!text) {
          facts[key] = { disposition: 'UNKNOWN', reason: `${label}: chưa được nhân viên xác nhận` };
          continue;
        }
        let value = text;
        if (key === 'materials') value = text.split(',').map(item => item.trim()).filter(Boolean);
        if (key === 'personalization') value = { supported: true, instructions: text };
        facts[key] = { disposition: 'ASSERTED', value, basis };
      }
      const response = await fetch(`/api/listings/${listing.dbId}/product-truth`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedVersion: listing.listingVersion || 1, facts, notes })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'PRODUCT_TRUTH_SAVE_FAILED');
      onShowToast?.(result.status === 'CLAIM_RISK_BLOCKED'
        ? 'Đã lưu Product Truth; copy hiện có chứa claim chưa được chứng thực.'
        : 'Đã lưu Product Truth và gắn audit/version thành công.');
      await onSaved?.(result);
    } catch (error) {
      onShowToast?.(`Không thể lưu Product Truth: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ width: '100%', padding: 16, background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 10 }}>
      <div style={{ marginBottom: 12 }}>
        <strong>Product Truth — listing #{listing.dbId}, version {listing.listingVersion || 1}</strong>
        <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
          Điền điều đã xác nhận; ô trống được lưu rõ là UNKNOWN. Keyword/research không tự trở thành sự thật sản phẩm.
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
        {FIELDS.map(([key, label]) => (
          <label key={key} style={{ fontSize: 12, fontWeight: 600 }}>
            {label}
            <input
              className="form-input"
              value={values[key] || ''}
              onChange={event => setValues(current => ({ ...current, [key]: event.target.value }))}
              placeholder="Để trống nếu chưa biết"
              style={{ marginTop: 4 }}
            />
          </label>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) 2fr', gap: 10, marginTop: 12 }}>
        <label style={{ fontSize: 12, fontWeight: 600 }}>
          Căn cứ cho các ô đã điền
          <select className="form-input" value={basis} onChange={event => setBasis(event.target.value)} style={{ marginTop: 4 }}>
            <option value="PHYSICAL_INSPECTION">Kiểm tra sản phẩm thật</option>
            <option value="SUPPLIER_SPEC">Thông số supplier</option>
            <option value="PRODUCTION_WORKFLOW">Quy trình sản xuất</option>
            <option value="RIGHTS_RECORD">Hồ sơ quyền / license</option>
            <option value="OTHER">Căn cứ khác</option>
          </select>
        </label>
        <label style={{ fontSize: 12, fontWeight: 600 }}>
          Ghi chú nội bộ (không phải factual authority)
          <input className="form-input" value={notes} onChange={event => setNotes(event.target.value)} style={{ marginTop: 4 }} />
        </label>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel} disabled={saving}>Đóng</button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !listing.dbId}>
          {saving ? 'Đang lưu...' : 'Lưu Product Truth + tạo audit'}
        </button>
      </div>
    </form>
  );
}
