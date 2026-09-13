import React, { useEffect, useState } from 'react';
import { FolderPlus, LoaderCircle } from 'lucide-react';
import { parseJsonResponse } from '../utils/apiResponse';
import { useAuth } from '../context/AuthContext';

const CLASSIFICATIONS = Object.freeze({
  'Apparel: Sweatshirt': ['CUSTOM_SWEATSHIRT', 'APPAREL_SWEATSHIRT', 'custom-sweatshirt-v1'],
  'Apparel: Shirt': ['CUSTOM_SHIRT', 'APPAREL_SHIRT', 'custom-shirt-v1'],
  'Apparel: Hoodie': ['CUSTOM_HOODIE', 'APPAREL_HOODIE', 'custom-hoodie-v1'],
  Mug: ['CUSTOM_MUG', 'MUG', 'custom-mug-v1'],
  Blanket: ['CUSTOM_BLANKET', 'BLANKET', 'custom-blanket-v1'],
  Jewelry: ['CUSTOM_NECKLACE', 'JEWELRY_NECKLACE', 'custom-necklace-v1'],
  Embroidery: ['CUSTOM_EMBROIDERY', 'CUSTOM_EMBROIDERY', 'custom-embroidery-v1'],
  Acrylic: ['CUSTOM_ACRYLIC', 'CUSTOM_ACRYLIC', 'custom-acrylic-v1']
});

export function canonicalProjectClassification(category) {
  const key = String(category || '').includes('Jewelry') ? 'Jewelry' : String(category || '');
  const [productTypeId, categoryId, productFamilyVersion] = CLASSIFICATIONS[key] || CLASSIFICATIONS.Jewelry;
  return Object.freeze({ mediaClass: 'NON_MEDIA', productTypeId, categoryId, productFamilyVersion });
}

export default function ProjectSetupCard({ marketplace, category, seedPhrase = '', onCreated, onShowToast,
  onRequireLogin, accent = '#0284c7' }) {
  const { user, authLoading, invalidateSession } = useAuth();
  const [name, setName] = useState('');
  const [seed, setSeed] = useState(seedPhrase);
  const [referenceAsin, setReferenceAsin] = useState('');
  const [locale, setLocale] = useState('en-US');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!seed) setSeed(seedPhrase);
  }, [seedPhrase, seed]);

  const createProject = async (event) => {
    event.preventDefault();
    if (!user) {
      onShowToast?.('Hãy đăng nhập trước khi tạo project.', 'error');
      onRequireLogin?.();
      return;
    }
    if (!name.trim() || !seed.trim()) {
      onShowToast?.('Nhập tên project và seed phrase trước khi tạo project.');
      return;
    }
    setCreating(true);
    try {
      const classification = canonicalProjectClassification(category);
      const response = await fetch('/api/projects', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), seedPhrase: seed.trim(), referenceAsin: referenceAsin.trim() || undefined,
          locale, ...classification })
      });
      const data = await parseJsonResponse(response);
      if (!response.ok) {
        if (response.status === 401) {
          invalidateSession();
          onRequireLogin?.();
        }
        throw new Error(response.status === 401
          ? 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.'
          : data.message || data.error || 'PROJECT_CREATE_FAILED');
      }
      onShowToast?.(`Đã tạo project #${data.projectId} ở trạng thái EVIDENCE_INTAKE.`);
      setName('');
      setReferenceAsin('');
      await onCreated?.({ id: data.projectId, seedPhrase: seed.trim() });
    } catch (error) {
      onShowToast?.(`Không thể tạo project: ${error.message}`);
    } finally {
      setCreating(false);
    }
  };

  if (authLoading) return <section className="studio-panel" style={{ padding: '16px 20px', borderLeft: `4px solid ${accent}` }}>
    Đang kiểm tra phiên đăng nhập…
  </section>;

  if (!user) return <section data-testid="project-login-required" className="studio-panel"
    style={{ padding: '16px 20px', borderLeft: `4px solid ${accent}`, background: '#fffbeb' }}>
    <div style={{ fontWeight: 800, color: '#92400e' }}>Cần đăng nhập trước khi tạo project</div>
    <p style={{ margin: '6px 0 12px', color: '#78350f', fontSize: '.82rem' }}>
      Project luôn thuộc một tài khoản và workspace. Dữ liệu nhập ở đây sẽ được giữ qua lần khởi động lại backend.
    </p>
    <button type="button" className="btn btn-primary" onClick={onRequireLogin}>Đăng nhập để bắt đầu</button>
  </section>;

  return (
    <section className="studio-panel" style={{ padding: '16px 20px', borderLeft: `4px solid ${accent}`, background: '#f8fafc' }}>
      <div style={{ fontWeight: 800, color: accent, marginBottom: '4px' }}><FolderPlus size={17} style={{ verticalAlign: 'middle', marginRight: '7px' }} />Chưa có Active Project — tạo project trước</div>
      <p style={{ margin: '0 0 12px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Project giữ đúng marketplace/workspace và là nơi evidence được bind. Tạo project không publish hay tạo listing.</p>
      <form onSubmit={createProject} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(180px, 1fr) minmax(140px, .7fr) minmax(125px, .55fr) auto', gap: '8px' }}>
        <input aria-label="Tên project" value={name} onChange={event => setName(event.target.value)} placeholder={`Ví dụ: ${marketplace} – Nurse gifts`} />
        <input aria-label="Seed phrase project" value={seed} onChange={event => setSeed(event.target.value)} placeholder="Seed phrase bắt buộc" />
        <input aria-label="Reference ASIN optional" value={referenceAsin} onChange={event => setReferenceAsin(event.target.value)} placeholder="ASIN tham chiếu (tuỳ chọn)" />
        <select aria-label="Listing locale" value={locale} onChange={event => setLocale(event.target.value)}>
          <option value="en-US">English (US)</option>
          <option value="es-US">Español (US)</option>
        </select>
        <button className="btn btn-primary" type="submit" disabled={creating} style={{ background: accent, whiteSpace: 'nowrap' }}>
          {creating ? <LoaderCircle size={15} className="spinner" /> : <FolderPlus size={15} />} {creating ? 'Đang tạo…' : 'Tạo project'}
        </button>
      </form>
    </section>
  );
}
