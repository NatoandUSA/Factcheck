import React, { useState, useEffect } from 'react';
import { X, Users, UserPlus, Copy, Check, ShieldCheck, Key, Lock, Mail, User } from 'lucide-react';

export default function UserManagementModal({ isOpen, onClose, onShowToast }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  // New User Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('password123');
  const [role, setRole] = useState('SELLER');
  const [createdCredential, setCreatedCredential] = useState(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/owner/users', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (e) {
      console.warn('Failed to load owner users list', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
      setCreatedCredential(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) {
      if (onShowToast) onShowToast('Vui lòng điền đầy đủ Tên, Email và Mật khẩu.');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/owner/users', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password: password.trim(),
          role
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Lỗi tạo tài khoản');
      }

      const newCred = {
        name: name.trim(),
        email: email.trim(),
        password: password.trim(),
        role
      };
      setCreatedCredential(newCred);
      if (onShowToast) onShowToast(`✓ Đã tạo thành công tài khoản ${role} cho ${name}!`);

      // Reset form fields
      setName('');
      setEmail('');
      setPassword('password123');
      fetchUsers();
    } catch (err) {
      if (onShowToast) onShowToast(`Tạo thất bại: ${err.message}`);
    } finally {
      setCreating(false);
    }
  };

  const handleCopyCredential = (credText, id) => {
    navigator.clipboard.writeText(credText);
    setCopiedId(id);
    if (onShowToast) onShowToast('📋 Đã copy thông tin đăng nhập vào Clipboard!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        borderRadius: '16px',
        maxWidth: '850px',
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.25)',
        border: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          justify: 'space-between',
          alignItems: 'center',
          background: '#f0f9ff',
          borderTopLeftRadius: '16px',
          borderTopRightRadius: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: '#0284c7', color: '#fff', padding: '8px', borderRadius: '10px' }}>
              <Users size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0369a1' }}>
                Quản Lý Quyền & Đăng Nhập Nhân Viên (Owner Hub)
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Tạo tài khoản Staff/Testing và cấp quyền truy cập thử nghiệm cho các thành viên nhóm.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '8px' }}
          >
            <X size={20} color="#64748b" />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Form Tạo Tài Khoản */}
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            padding: '20px',
            border: '1px solid #bae6fd',
            boxShadow: '0 2px 8px rgba(2, 132, 199, 0.05)'
          }}>
            <h4 style={{ margin: '0 0 14px 0', fontSize: '1rem', fontWeight: 800, color: '#0284c7', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserPlus size={18} />
              Tạo Tài Khoản Thử Nghiệm Mới
            </h4>

            <form onSubmit={handleCreateUser} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Tên Nhân Viên / Tester:
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="Ví dụ: Nguyễn Văn A"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{ paddingLeft: '34px', width: '100%', fontSize: '0.85rem' }}
                  />
                  <User size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Email Đăng Nhập:
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="email"
                    required
                    className="form-input"
                    placeholder="staff1@omniseller.local"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{ paddingLeft: '34px', width: '100%', fontSize: '0.85rem' }}
                  />
                  <Mail size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Mật Khẩu Ban Đầu:
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="password123"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ paddingLeft: '34px', width: '100%', fontSize: '0.85rem' }}
                  />
                  <Lock size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Vai Trò / Quyền Hạn:
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #bae6fd', fontSize: '0.85rem', fontWeight: 700 }}
                >
                  <option value="SELLER">SELLER (Nhân Viên Tạo Listing & Upload)</option>
                  <option value="MANAGER">MANAGER (Quản Lý & Duyệt Listing)</option>
                </select>
              </div>

              <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button
                  type="submit"
                  disabled={creating}
                  className="btn btn-primary"
                  style={{ background: '#0284c7', fontWeight: 800, padding: '10px 24px', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <UserPlus size={16} />
                  <span>{creating ? 'Đang tạo...' : '➕ Tạo Tài Khoản Nhân Viên'}</span>
                </button>
              </div>
            </form>

            {/* Thẻ Copy Nhanh Thông Tin Vừa Tạo */}
            {createdCredential && (
              <div style={{
                marginTop: '16px',
                background: '#f0fdf4',
                border: '1px solid #86efac',
                borderRadius: '10px',
                padding: '14px',
                display: 'flex',
                justify: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#15803d' }}>
                    ✅ Đã tạo tài khoản cho {createdCredential.name}!
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#166534', marginTop: '2px' }}>
                    Email: <strong>{createdCredential.email}</strong> | Pass: <strong>{createdCredential.password}</strong> | Quyền: <strong>{createdCredential.role}</strong>
                  </div>
                </div>

                <button
                  onClick={() => handleCopyCredential(
                    `Thông tin tài khoản OmniSeller:\n- Email: ${createdCredential.email}\n- Mật khẩu: ${createdCredential.password}\n- Quyền: ${createdCredential.role}`,
                    'new-cred'
                  )}
                  className="btn btn-secondary btn-sm"
                  style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#15803d', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {copiedId === 'new-cred' ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedId === 'new-cred' ? 'Đã Copy!' : '📋 Copy Giao Nhân Viên'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Bảng Danh Sách Tài Khoản Trong Workspace */}
          <div>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={18} color="#0284c7" />
              Danh Sách Nhân Viên Workspace ({users.length})
            </h4>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>Đang tải danh sách nhân viên...</div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid var(--border-subtle)', borderRadius: '12px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
                      <th style={{ padding: '10px 14px', fontWeight: 700 }}>ID</th>
                      <th style={{ padding: '10px 14px', fontWeight: 700 }}>Họ & Tên</th>
                      <th style={{ padding: '10px 14px', fontWeight: 700 }}>Email Đăng Nhập</th>
                      <th style={{ padding: '10px 14px', fontWeight: 700 }}>Quyền Hạn</th>
                      <th style={{ padding: '10px 14px', fontWeight: 700 }}>Trạng Thái</th>
                      <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const credInfo = `Email: ${u.email}\nRole: ${u.role}`;
                      return (
                        <tr key={u.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--text-secondary)' }}>#{u.id}</td>
                          <td style={{ padding: '10px 14px', fontWeight: 800, color: '#0f172a' }}>{u.name}</td>
                          <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#0369a1' }}>{u.email}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 800,
                              background: u.role === 'OWNER' ? '#fef3c7' : u.role === 'MANAGER' ? '#e0f2fe' : '#f1f5f9',
                              color: u.role === 'OWNER' ? '#92400e' : u.role === 'MANAGER' ? '#0369a1' : '#475569'
                            }}>
                              {u.role}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ color: '#16a34a', fontWeight: 700, fontSize: '0.75rem' }}>● ACTIVE</span>
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                            <button
                              onClick={() => handleCopyCredential(credInfo, u.id)}
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                            >
                              {copiedId === u.id ? <Check size={12} /> : <Copy size={12} />}
                              <span>{copiedId === u.id ? 'Copied' : 'Copy Email'}</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
