import React from 'react';
import { Sparkles, Key, Layers, FileSpreadsheet, History, Bot, UserCircle, LogOut, Server, Activity } from 'lucide-react';
import { getStoredApiKey } from '../services/geminiService';
import { useAuth } from '../context/AuthContext';

export default function Header({ activeTab, setActiveTab, onOpenApiKeyModal, onOpenLoginModal, historyCount = 0 }) {
  const hasKey = Boolean(getStoredApiKey());
  const { user, logout } = useAuth();

  return (
    <header className="header">
      <div className="header-inner">
        <div className="logo-group">
          <div className="logo-badge">
            <Bot size={22} />
          </div>
          <div>
            <div className="logo-title">OmniSeller Studio</div>
            <div className="logo-sub">Amazon FBM & Etsy Multi-Agent Hub</div>
          </div>
        </div>

        <nav className="nav-tabs">
          <button
            className={`nav-tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <Activity size={16} />
            <span>Dashboard</span>
          </button>

          <button
            className={`nav-tab-btn ${activeTab === 'single' ? 'active' : ''}`}
            onClick={() => setActiveTab('single')}
          >
            <Sparkles size={16} />
            <span>Listing Studio</span>
          </button>

          <button
            className={`nav-tab-btn ${activeTab === 'batch' ? 'active' : ''}`}
            onClick={() => setActiveTab('batch')}
          >
            <FileSpreadsheet size={16} />
            <span>Batch CSV Engine</span>
          </button>

          <button
            className={`nav-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <History size={16} />
            <span>Saved Catalog ({historyCount})</span>
          </button>

          <button
            className={`nav-tab-btn ${activeTab === 'agents' ? 'active' : ''}`}
            onClick={() => setActiveTab('agents')}
            style={{ color: 'var(--primary)' }}
          >
            <Server size={16} />
            <span>Agent Hub</span>
          </button>
        </nav>

        <div className="header-actions">
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.2 }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{user.name}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{user.role}</span>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={logout} title="Sign Out">
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={onOpenLoginModal}>
              <UserCircle size={14} />
              <span>Sign In</span>
            </button>
          )}

          <button 
            className="btn btn-secondary btn-sm"
            onClick={onOpenApiKeyModal}
            title="Configure Gemini API Key"
          >
            <Key size={14} style={{ color: hasKey ? '#16a34a' : '#d97706' }} />
          </button>
        </div>
      </div>
    </header>
  );
}
