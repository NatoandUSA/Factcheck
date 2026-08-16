import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserCircle, ShieldCheck, X } from 'lucide-react';

export default function LoginModal({ isOpen, onClose }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [workspaces, setWorkspaces] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login({ email, password, workspaceId: workspaceId ? Number(workspaceId) : undefined });
      onClose();
    } catch (err) {
      if (err.code === 'WORKSPACE_SELECTION_REQUIRED') {
        setWorkspaces(err.workspaces);
        setError('Tài khoản có nhiều workspace. Hãy chọn Amazon hoặc Etsy rồi đăng nhập lại.');
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: '#ccfbf1', padding: '8px', borderRadius: '8px', color: '#0f766e' }}>
              <UserCircle size={24} />
            </div>
            <h3 style={{ fontSize: '1.2rem' }}>Sign In to OmniSeller</h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. manager@omniseller.local"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {workspaces.length > 0 && (
            <div className="form-group">
              <label className="form-label">Workspace</label>
              <select className="form-input" value={workspaceId} onChange={e => setWorkspaceId(e.target.value)} required>
                <option value="">Chọn workspace</option>
                {workspaces.map(workspace => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.marketplace} — {workspace.name} ({workspace.role})
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && <div style={{ color: 'var(--danger)', fontSize: '0.8rem', marginBottom: '16px' }}>{error}</div>}

          <div style={{ background: 'var(--bg-subtle)', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <ShieldCheck size={14} style={{ display: 'inline', marginBottom: '-2px', color: 'var(--success)' }} /> 
            <strong> Demo Accounts Available:</strong>
            <ul style={{ paddingLeft: '20px', marginTop: '6px' }}>
              <li>owner@omniseller.local (Owner)</li>
              <li>manager@omniseller.local (Manager)</li>
              <li>seller@omniseller.local (Seller)</li>
              <li>Mật khẩu fixture kiểm thử không được sử dụng trong production</li>
            </ul>
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
