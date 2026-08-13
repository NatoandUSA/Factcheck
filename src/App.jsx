import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import SingleListingGenerator from './components/SingleListingGenerator';
import ListingOutputViewer from './components/ListingOutputViewer';
import BatchCsvGenerator from './components/BatchCsvGenerator';
import ListingHistory from './components/ListingHistory';
import AgentHub from './components/AgentHub';
import ApiKeyModal from './components/ApiKeyModal';
import HomestayRoadmapModal from './components/HomestayRoadmapModal';
import LoginModal from './components/LoginModal';
import { generateListingAI } from './services/geminiService';
import { useAuth } from './context/AuthContext';
import { CATEGORIES, OCCASIONS, TONES } from './data/categoryPresets';

const HISTORY_STORAGE_KEY = 'omni_listing_history_v1';

export default function App() {
  const [activeTab, setActiveTab] = useState('single');
  const [currentListing, setCurrentListing] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [history, setHistory] = useState([]);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [isHomestayModalOpen, setIsHomestayModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const { user } = useAuth();

  // Load history from backend (source of truth) and fallback to localStorage
  const fetchListings = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/listings');
      if (res.ok) {
        const data = await res.json();
        const backendHistory = data.map(item => ({
          ...item.payload,
          dbId: item.id,
          status: item.status,
          generatedAt: item.generatedAt
        }));
        setHistory(backendHistory);
        return; // Success, skip local storage
      }
    } catch (e) {
      console.warn('Backend unavailable, falling back to local history');
    }
    
    // Fallback to local storage if backend fails
    try {
      const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch (e) {
      console.warn('Failed to parse local history', e);
    }
  };

  useEffect(() => {
    fetchListings();
  }, []);

  // Save history to localStorage
  const saveHistoryToStorage = (updatedList) => {
    setHistory(updatedList);
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updatedList));
    } catch (e) {
      console.warn('Failed to save history to localStorage', e);
    }
  };

  const showToast = (message) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2800);
  };

  const handleGenerateListing = async (formData) => {
    setIsGenerating(true);
    try {
      const result = await generateListingAI(formData);
      const enrichedResult = {
        ...result,
        id: Date.now(),
        categoryName: formData.category?.name || 'Custom Product',
        categoryIcon: formData.category?.icon || '✨',
        categoryBadge: formData.category?.badge || '',
        status: 'NEEDS_QA'
      };

      // Post to backend to enforce AMZ-style strict gating
      try {
        const res = await fetch('http://localhost:3001/api/listings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amazonTitle: enrichedResult.amazonTitle,
            etsyTitle: enrichedResult.etsyTitle,
            categoryName: enrichedResult.categoryName,
            payload: enrichedResult,
            authorId: user?.id || null
          })
        });
        if (res.ok) {
          const dbData = await res.json();
          enrichedResult.dbId = dbData.id;
          enrichedResult.status = dbData.status; // NEEDS_QA
        }
      } catch (backendErr) {
        console.warn('Backend unavailable, falling back to local only mode', backendErr);
      }

      setCurrentListing(enrichedResult);
      showToast('Generated Amazon & Etsy listings successfully! Awaiting QA.');
      
      // Auto save to history
      handleSaveToHistory(enrichedResult, false);
    } catch (err) {
      console.error(err);
      showToast(`Error: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveToHistory = (listingToSave, notify = true) => {
    if (!listingToSave) return;
    const exists = history.some(h => h.id === listingToSave.id);
    let updated;
    if (exists) {
      updated = history.map(h => h.id === listingToSave.id ? listingToSave : h);
    } else {
      updated = [listingToSave, ...history];
    }
    saveHistoryToStorage(updated);
    if (notify) showToast('Saved listing to your catalog!');
  };

  const handleDeleteHistoryItem = (index) => {
    const updated = history.filter((_, i) => i !== index);
    saveHistoryToStorage(updated);
    showToast('Listing removed from catalog.');
  };

  const handleClearHistory = () => {
    if (window.confirm('Are you sure you want to clear your saved catalog?')) {
      saveHistoryToStorage([]);
      showToast('Catalog cleared.');
    }
  };

  const handleSelectFromHistory = (item) => {
    setCurrentListing(item);
    setActiveTab('single');
    showToast(`Loaded "${item.amazonTitle || item.etsyTitle}"`);
  };

  const handleApproveListing = async (listingToApprove) => {
    if (!listingToApprove?.dbId) {
      showToast('Error: Cannot approve an offline listing.');
      return;
    }
    try {
      const res = await fetch(`http://localhost:3001/api/listings/${listingToApprove.dbId}/approve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id, userRole: user?.role })
      });
      if (!res.ok) throw new Error('Not authorized or server error');
      const data = await res.json();
      
      const updated = { ...listingToApprove, status: data.status };
      setCurrentListing(updated);
      handleSaveToHistory(updated, false);
      showToast('Listing Approved by Manager!');
    } catch (e) {
      showToast(`Approval failed: ${e.message}`);
    }
  };

  return (
    <div>
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
        onOpenHomestayModal={() => setIsHomestayModalOpen(true)}
        onOpenLoginModal={() => setIsLoginModalOpen(true)}
        historyCount={history.length}
      />

      <main className="app-container">
        {/* TAB 1: Single Listing Studio */}
        {activeTab === 'single' && (
          <div className="studio-grid">
            <SingleListingGenerator
              onGenerate={handleGenerateListing}
              isGenerating={isGenerating}
            />
            <ListingOutputViewer
              listing={currentListing}
              onSaveListing={handleSaveToHistory}
              onShowToast={showToast}
              onApproveListing={handleApproveListing}
            />
          </div>
        )}

        {/* TAB 2: Batch CSV Engine */}
        {activeTab === 'batch' && (
          <div style={{ marginTop: '24px' }}>
            <BatchCsvGenerator
              onShowToast={showToast}
              onSaveListing={handleSaveToHistory}
            />
          </div>
        )}

        {/* TAB 3: Saved Catalog History */}
        {activeTab === 'history' && (
          <div style={{ marginTop: '24px' }}>
            <ListingHistory
              history={history}
              onSelectListing={handleSelectFromHistory}
              onDeleteListing={handleDeleteHistoryItem}
              onClearHistory={handleClearHistory}
              onShowToast={showToast}
              onRefresh={fetchListings}
            />
          </div>
        )}

        {/* TAB 4: Agent Hub */}
        {activeTab === 'agents' && (
          <div style={{ marginTop: '24px' }}>
            <AgentHub onShowToast={showToast} />
          </div>
        )}
      </main>

      {/* Modals */}
      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        onKeySaved={() => showToast('Gemini API settings updated!')}
      />

      <HomestayRoadmapModal
        isOpen={isHomestayModalOpen}
        onClose={() => setIsHomestayModalOpen(false)}
      />

      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
      />

      {/* Toast Notification Container */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
