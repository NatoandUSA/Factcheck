import React, { useState, useEffect } from 'react';
import { Key, ShieldCheck, X, Check, ExternalLink, Cpu, Sparkles } from 'lucide-react';
import { getStoredApiKey, setStoredApiKey } from '../services/geminiService';

export default function ApiKeyModal({ isOpen, onClose, onKeySaved }) {
  const [activeProvider, setActiveProvider] = useState('GEMINI');
  const [geminiKey, setGeminiKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [claudeKey, setClaudeKey] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setGeminiKey(getStoredApiKey() || '');
      setSavedSuccess(false);

      // Fetch saved keys from backend
      fetch('http://localhost:3001/api/settings/llm')
        .then(res => res.json())
        .then(data => {
          if (data.activeProvider) setActiveProvider(data.activeProvider);
        })
        .catch(err => console.warn('Could not fetch LLM settings', err));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (geminiKey) setStoredApiKey(geminiKey);

    try {
      await fetch('http://localhost:3001/api/settings/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          geminiApiKey: geminiKey,
          openaiApiKey: openaiKey,
          claudeApiKey: claudeKey,
          activeProvider
        })
      });
      setSavedSuccess(true);
      if (onKeySaved) onKeySaved(geminiKey);
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err) {
      console.warn("Failed to sync API keys to backend.", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '580px' }} onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: '#f3e8ff', padding: '10px', borderRadius: '10px', color: '#7e22ce' }}>
              <Cpu size={22} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>Multi-LLM AI Engine Control Center</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                Hỗ trợ song song Google Gemini, OpenAI (GPT-4o), và Anthropic (Claude 3.5 Sonnet)
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          
          {/* Active Provider Selector */}
          <div style={{ background: 'var(--bg-subtle)', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 700, display: 'block', marginBottom: '8px', color: 'var(--text-primary)' }}>
              🎯 Chọn Mô Hình AI Mặc Định Để Viết Listing:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {[
                { id: 'GEMINI', name: 'Google Gemini', desc: 'Gemini 3.6 Flash', color: '#0284c7', border: '#bae6fd', bg: '#f0f9ff' },
                { id: 'OPENAI', name: 'OpenAI GPT-4o', desc: 'GPT-4o Engine', color: '#16a34a', border: '#bbf7d0', bg: '#f0fdf4' },
                { id: 'CLAUDE', name: 'Anthropic Claude', desc: 'Claude 3.5 Sonnet', color: '#ea580c', border: '#fed7aa', bg: '#fff7ed' }
              ].map(p => (
                <div
                  key={p.id}
                  onClick={() => setActiveProvider(p.id)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    background: activeProvider === p.id ? p.bg : '#fff',
                    border: activeProvider === p.id ? `2px solid ${p.color}` : '1px solid var(--border-color)',
                    textAlign: 'center',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: '0.8rem', color: activeProvider === p.id ? p.color : 'var(--text-primary)' }}>{p.name}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{p.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 1. Google Gemini */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, color: '#0369a1' }}>🔵 Google Gemini API Key</span>
              <a 
                href="https://aistudio.google.com/app/apikey" 
                target="_blank" 
                rel="noreferrer"
                style={{ fontSize: '0.75rem', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
              >
                Lấy Key Gemini Miễn Phí <ExternalLink size={11} />
              </a>
            </label>
            <input
              type="password"
              className="form-input"
              placeholder="AIzaSy..."
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
            />
          </div>

          {/* 2. OpenAI GPT-4o */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, color: '#15803d' }}>🟢 OpenAI GPT API Key (GPT-4o)</span>
              <a 
                href="https://platform.openai.com/api-keys" 
                target="_blank" 
                rel="noreferrer"
                style={{ fontSize: '0.75rem', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
              >
                Lấy OpenAI Key <ExternalLink size={11} />
              </a>
            </label>
            <input
              type="password"
              className="form-input"
              placeholder="sk-proj-..."
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
            />
          </div>

          {/* 3. Anthropic Claude 3.5 */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, color: '#c2410c' }}>🟠 Anthropic Claude API Key (Claude 3.5)</span>
              <a 
                href="https://console.anthropic.com/settings/keys" 
                target="_blank" 
                rel="noreferrer"
                style={{ fontSize: '0.75rem', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
              >
                Lấy Claude Key <ExternalLink size={11} />
              </a>
            </label>
            <input
              type="password"
              className="form-input"
              placeholder="sk-ant-api..."
              value={claudeKey}
              onChange={(e) => setClaudeKey(e.target.value)}
            />
          </div>

          {/* Privacy Note */}
          <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldCheck size={16} style={{ color: '#16a34a', flexShrink: 0 }} />
            <span>Mọi API Key được bảo mật an toàn cục bộ trong SQLite và không bao giờ gửi ra server bên ngoài.</span>
          </div>

          {/* Footer Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={onClose}
              style={{ fontSize: '0.85rem' }}
            >
              Hủy
            </button>
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={loading}
              style={{ 
                background: savedSuccess ? '#16a34a' : '#7e22ce',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 700,
                fontSize: '0.85rem'
              }}
            >
              {savedSuccess ? (
                <>
                  <Check size={16} />
                  <span>Đã lưu thành công!</span>
                </>
              ) : (
                <>
                  <Cpu size={16} />
                  <span>{loading ? 'Đang lưu...' : 'Lưu Cấu Hình Multi-LLM'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
