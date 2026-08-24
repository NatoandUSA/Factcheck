import React, { useEffect, useState } from 'react';
import { FolderPlus, LoaderCircle } from 'lucide-react';
import { parseJsonResponse } from '../utils/apiResponse';

export default function ProjectSetupCard({ marketplace, seedPhrase = '', onCreated, onShowToast, accent = '#0284c7' }) {
  const [name, setName] = useState('');
  const [seed, setSeed] = useState(seedPhrase);
  const [referenceAsin, setReferenceAsin] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!seed) setSeed(seedPhrase);
  }, [seedPhrase, seed]);

  const createProject = async (event) => {
    event.preventDefault();
    if (!name.trim() || !seed.trim()) {
      onShowToast?.('Nhập tên project và seed phrase trước khi tạo project.');
      return;
    }
    setCreating(true);
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), seedPhrase: seed.trim(), referenceAsin: referenceAsin.trim() || undefined })
      });
      const data = await parseJsonResponse(response);
      if (!response.ok) throw new Error(data.message || data.error || 'PROJECT_CREATE_FAILED');
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

  return (
    <section className="studio-panel" style={{ padding: '16px 20px', borderLeft: `4px solid ${accent}`, background: '#f8fafc' }}>
      <div style={{ fontWeight: 800, color: accent, marginBottom: '4px' }}><FolderPlus size={17} style={{ verticalAlign: 'middle', marginRight: '7px' }} />Chưa có Active Project — tạo project trước</div>
      <p style={{ margin: '0 0 12px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Project giữ đúng marketplace/workspace và là nơi evidence được bind. Tạo project không publish hay tạo listing.</p>
      <form onSubmit={createProject} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(180px, 1fr) minmax(140px, .7fr) auto', gap: '8px' }}>
        <input aria-label="Tên project" value={name} onChange={event => setName(event.target.value)} placeholder={`Ví dụ: ${marketplace} – Nurse gifts`} />
        <input aria-label="Seed phrase project" value={seed} onChange={event => setSeed(event.target.value)} placeholder="Seed phrase bắt buộc" />
        <input aria-label="Reference ASIN optional" value={referenceAsin} onChange={event => setReferenceAsin(event.target.value)} placeholder="ASIN tham chiếu (tuỳ chọn)" />
        <button className="btn btn-primary" type="submit" disabled={creating} style={{ background: accent, whiteSpace: 'nowrap' }}>
          {creating ? <LoaderCircle size={15} className="spinner" /> : <FolderPlus size={15} />} {creating ? 'Đang tạo…' : 'Tạo project'}
        </button>
      </form>
    </section>
  );
}
