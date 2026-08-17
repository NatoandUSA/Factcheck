import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import AmazonWorkspace from './components/AmazonWorkspace';
import EtsyWorkspace from './components/EtsyWorkspace';
import ProductListingPageSimulator from './components/ProductListingPageSimulator';
import ListingHistory from './components/ListingHistory';
import ApiKeyModal from './components/ApiKeyModal';
import LoginModal from './components/LoginModal';
import { useAuth } from './context/AuthContext';

export default function App() {
  const [activeTab, setActiveTab] = useState('amazon-workspace');
  const [currentListing, setCurrentListing] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [history, setHistory] = useState([]);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const { user } = useAuth();

  // Load history only from the authenticated backend. Listing data must not be
  // restored from a browser cache that is outside workspace authorization.
  const fetchListings = async () => {
    if (!user) {
      setHistory([]);
      return;
    }
    try {
      const res = await fetch('/api/listings', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const backendHistory = data.map(item => ({
          ...item.payload,
          dbId: item.id,
          status: item.status,
          generatedAt: item.generatedAt
        }));
        setHistory(backendHistory);
        return;
      }
    } catch (e) {
      console.warn('Backend unavailable; authenticated listing history was not loaded');
    }
    setHistory([]);
  };

  useEffect(() => {
    fetchListings();
  }, [user?.workspaceId]);

  // Save history to localStorage
  const saveHistoryToStorage = (updatedList) => {
    setHistory(updatedList);
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
        const res = await fetch('/api/listings', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amazonTitle: enrichedResult.amazonTitle,
            etsyTitle: enrichedResult.etsyTitle,
            categoryName: enrichedResult.categoryName,
            payload: enrichedResult
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
      const res = await fetch(`/api/listings/${listingToApprove.dbId}/approve`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedVersion: listingToApprove.listingVersion || listingToApprove.listing_version || 1 })
      });
      if (!res.ok) throw new Error('Not authorized or server error');
      const data = await res.json();
      
      const updated = { ...listingToApprove, status: data.status, approvedVersion: data.approvedVersion, approvedHash: data.approvedHash };
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
        onOpenLoginModal={() => setIsLoginModalOpen(true)}
        historyCount={history.length}
      />

      <main className="app-container">
        {/* TAB 1: 🔵 Amazon A10 Workspace */}
        {activeTab === 'amazon-workspace' && (
          <div style={{ marginTop: '24px' }}>
            <AmazonWorkspace 
              onSelectListing={(item) => {
                handleSelectFromHistory(item);
                setActiveTab('product-page');
              }}
              onApproveListing={handleApproveListing}
              onShowToast={showToast}
            />
          </div>
        )}

        {/* TAB 2: 🟠 Etsy Contextual Workspace */}
        {activeTab === 'etsy-workspace' && (
          <div style={{ marginTop: '24px' }}>
            <EtsyWorkspace
              onSelectListing={(item) => {
                handleSelectFromHistory(item);
                setActiveTab('product-page');
              }}
              onApproveListing={handleApproveListing}
              onShowToast={showToast}
              onViewHistory={() => setActiveTab('history')}
            />
          </div>
        )}

        {/* TAB 3: 🛍️ 100% Real Amazon & Etsy Product Page Simulator */}
        {activeTab === 'product-page' && (
          <ProductListingPageSimulator
            currentListing={currentListing}
            history={history}
            onSelectListing={handleSelectFromHistory}
            onShowToast={showToast}
          />
        )}

        {/* TAB 4: Saved Catalog History */}
        {activeTab === 'history' && (
          <div style={{ marginTop: '24px' }}>
            <ListingHistory
              history={history}
              onSelectListing={(item) => {
                handleSelectFromHistory(item);
                setActiveTab('product-page');
              }}
              onDeleteListing={handleDeleteHistoryItem}
              onClearHistory={handleClearHistory}
              onShowToast={showToast}
              onRefresh={fetchListings}
              onApproveListing={handleApproveListing}
            />
          </div>
        )}
      </main>

      {/* Modals */}
      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        onKeySaved={() => showToast('Gemini API settings updated!')}
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
