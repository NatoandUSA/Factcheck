import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserCircle, ShieldCheck, X } from 'lucide-react';

export default function LoginModal({ isOpen, onClose }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email);
      onClose();
    } catch (err) {
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

          {error && <div style={{ color: 'var(--danger)', fontSize: '0.8rem', marginBottom: '16px' }}>{error}</div>}

          <div style={{ background: 'var(--bg-subtle)', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <ShieldCheck size={14} style={{ display: 'inline', marginBottom: '-2px', color: 'var(--success)' }} /> 
            <strong> Demo Accounts Available:</strong>
            <ul style={{ paddingLeft: '20px', marginTop: '6px' }}>
              <li>owner@omniseller.local (Owner)</li>
              <li>manager@omniseller.local (Manager)</li>
              <li>seller@omniseller.local (Seller)</li>
              <li>designer@omniseller.local (Designer)</li>
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
