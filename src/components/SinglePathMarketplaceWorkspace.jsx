import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CanonicalCommerceWorkflow from './CanonicalCommerceWorkflow';
import ProjectSetupCard from './ProjectSetupCard';

const CATEGORIES = Object.freeze([
  'Jewelry', 'Embroidery', 'Acrylic', 'Blanket', 'Apparel: Sweatshirt',
  'Apparel: Shirt', 'Apparel: Hoodie', 'Mug'
]);

async function loadProjects() {
  const response = await fetch('/api/projects', { credentials: 'include' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.error || `HTTP_${response.status}`);
  return payload.projects || [];
}

export default function SinglePathMarketplaceWorkspace({ marketplace, onSelectListing, onShowToast }) {
  const accent = marketplace === 'AMAZON' ? '#0369a1' : '#c2410c';
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [category, setCategory] = useState('Jewelry');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const toastRef = useRef(onShowToast);
  toastRef.current = onShowToast;

  const refreshProjects = useCallback(async preferredId => {
    setLoading(true); setError('');
    try {
      const rows = await loadProjects();
      setProjects(rows);
      setActiveProjectId(previous => {
        const requested = Number(preferredId || previous);
        if (rows.some(item => Number(item.id) === requested)) return String(requested);
        return rows[0] ? String(rows[0].id) : '';
      });
      if (rows.length) setShowCreate(false);
    } catch (caught) {
      setError(caught.message);
      toastRef.current?.(`Không tải được project: ${caught.message}`, 'error');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { refreshProjects(); }, [marketplace, refreshProjects]);

  const activeProject = useMemo(() => projects.find(item => String(item.id) === String(activeProjectId)) || null,
    [projects, activeProjectId]);

  return <div data-testid={`r43-single-path-${marketplace.toLowerCase()}`} style={{ display: 'grid', gap: 14 }}>
    <section className="studio-panel" style={{ padding: '16px 20px', borderLeft: `4px solid ${accent}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, color: accent }}>OmniSeller {marketplace} — Single Staff Path</h2>
          <p style={{ margin: '5px 0 0', color: '#475569', fontSize: '.82rem' }}>
            Dùng chung tài khoản, workspace và project. Các workflow legacy không còn xuất hiện trong điều hướng staff.
          </p>
        </div>
        <button type="button" onClick={() => setShowCreate(value => !value)} style={{ border: `1px solid ${accent}`, color: accent, background: '#fff', borderRadius: 8, padding: '8px 12px', fontWeight: 800 }}>
          {showCreate ? 'Đóng tạo project' : 'Tạo project mới'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
        <label style={{ fontWeight: 800 }}>Active Project {' '}
          <select aria-label={`Active ${marketplace} project`} value={activeProjectId} disabled={loading || !projects.length}
            onChange={event => setActiveProjectId(event.target.value)}>
            {!projects.length && <option value="">{loading ? 'Đang tải…' : 'Chưa có project'}</option>}
            {projects.map(project => <option key={project.id} value={project.id}>#{project.id} {project.name}</option>)}
          </select>
        </label>
        {activeProject && <span style={{ color: '#475569', fontSize: '.78rem' }}>
          Seed: <b>{activeProject.seed_phrase}</b> · legacy state chỉ để tương thích: {activeProject.state}
        </span>}
        <button type="button" onClick={() => refreshProjects(activeProjectId)} disabled={loading}>Tải lại project</button>
      </div>
      {error && <div role="alert" style={{ marginTop: 10, color: '#991b1b' }}>{error}</div>}
    </section>

    {(showCreate || (!loading && !projects.length)) && <div style={{ display: 'grid', gap: 8 }}>
      <label style={{ width: 'fit-content' }}>Loại sản phẩm {' '}
        <select value={category} onChange={event => setCategory(event.target.value)}>
          {CATEGORIES.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <ProjectSetupCard marketplace={marketplace} category={category} seedPhrase="" accent={accent}
        onShowToast={onShowToast} onCreated={async created => { await refreshProjects(created.id); }} />
    </div>}

    {activeProject && <CanonicalCommerceWorkflow activeProject={activeProject} marketplace={marketplace}
      onSelectListing={onSelectListing} onShowToast={onShowToast} />}
  </div>;
}
