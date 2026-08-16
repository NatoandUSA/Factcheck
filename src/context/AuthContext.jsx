import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(async res => res.ok ? res.json() : null)
      .then(data => setUser(data?.user || null))
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false));
  }, []);

  const login = async ({ email, password, workspaceId }) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, ...(workspaceId ? { workspaceId } : {}) })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(data.message || 'Đăng nhập thất bại');
      error.code = data.error;
      error.workspaces = data.workspaces || [];
      throw error;
    }
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    const res = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });
    if (!res.ok) throw new Error('Không thể thu hồi phiên đăng nhập');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, authLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
