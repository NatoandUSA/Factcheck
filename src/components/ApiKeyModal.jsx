import React, { useState, useEffect } from 'react';
import { Key, ShieldCheck, X, Check, ExternalLink } from 'lucide-react';
import { getStoredApiKey, setStoredApiKey } from '../services/geminiService';

export default function ApiKeyModal({ isOpen, onClose, onKeySaved }) {
  const [apiKey, setApiKey] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setApiKey(getStoredApiKey());
      setSavedSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    setStoredApiKey(apiKey);
    setSavedSuccess(true);
    
    // Sync with backend for Agent Engine
    try {
      await fetch('http://localhost:3001/api/settings/apikey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey })
      });
    } catch (err) {
      console.warn("Failed to sync API key to backend.", err);
    }

    if (onKeySaved) onKeySaved(apiKey);
    setTimeout(() => {
      onClose();
    }, 600);
  };

  const handleClear = async () => {
    setStoredApiKey('');
    setApiKey('');
    
    try {
      await fetch('http://localhost:3001/api/settings/apikey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: '' }) // Clear on backend
      });
    } catch (err) {}

    if (onKeySaved) onKeySaved('');
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: '#ccfbf1', padding: '8px', borderRadius: '8px', color: '#0f766e' }}>
              <Key size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.15rem' }}>Gemini AI Engine Settings</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Configure your API key for direct Google Gemini Multimodal model access</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSave}>
          <div className="form-group">
            <label className="form-label">
              <span>Google Gemini API Key</span>
              <a 
                href="https://aistudio.google.com/app/apikey" 
                target="_blank" 
                rel="noreferrer"
                style={{ fontSize: '0.75rem', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
              >
                Get Free Gemini Key <ExternalLink size={12} />
              </a>
            </label>
            <input
              type="password"
              className="form-input"
              placeholder="AIzaSy..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>

          <div style={{ background: 'var(--bg-subtle)', padding: '12px 14px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>
              <ShieldCheck size={16} style={{ color: 'var(--success)' }} />
              <span>Synced with Local Storage & Backend Agent Hub</span>
            </div>
            Your key is stored in your browser's local storage and synced securely to your local SQLite database for the background Agent Drafter to use. If no key is entered, the app uses the built-in mock engine.
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {apiKey ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleClear} style={{ color: 'var(--danger)' }}>
                Remove Key
              </button>
            ) : <div />}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                {savedSuccess ? (
                  <>
                    <Check size={16} /> Saved!
                  </>
                ) : 'Save Key'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
