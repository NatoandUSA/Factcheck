import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import AmazonWorkspace from './components/AmazonWorkspace';
import EtsyWorkspace from './components/EtsyWorkspace';
import ProductListingPageSimulator from './components/ProductListingPageSimulator';
import ListingHistory from './components/ListingHistory';
import ApiKeyModal from './components/ApiKeyModal';
import LoginModal from './components/LoginModal';
import UserManagementModal from './components/UserManagementModal';
import { useAuth } from './context/AuthContext';
import { generateListingAI } from './services/geminiService.js';
import { buildVerifiedAiRequest, projectVerifiedAiInput } from './utils/aiTruthBoundary.js';

export default function App() {
  const [activeTab, setActiveTab] = useState('amazon-workspace');
  const [currentListing, setCurrentListing] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [history, setHistory] = useState([]);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isUserManagementModalOpen, setIsUserManagementModalOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const { user, switchWorkspace } = useAuth();

  const handleTabChange = async (tab) => {
    if (tab === 'etsy-workspace' && user && user.marketplace !== 'ETSY') {
      try {
        await switchWorkspace({ marketplace: 'ETSY' });
        setActiveTab(tab);
        showToast('Đã chuyển sang phiên làm việc Etsy Workspace');
      } catch (e) {
        showToast(`Không thể chuyển sang Etsy Workspace: ${e.message}`);
        console.warn('Could not switch to Etsy workspace:', e.message);
      }
    } else if (tab === 'amazon-workspace' && user && user.marketplace !== 'AMAZON') {
      try {
        await switchWorkspace({ marketplace: 'AMAZON' });
        setActiveTab(tab);
        showToast('Đã chuyển sang phiên làm việc Amazon Workspace');
      } catch (e) {
        showToast(`Không thể chuyển sang Amazon Workspace: ${e.message}`);
        console.warn('Could not switch to Amazon workspace:', e.message);
      }
    } else {
      setActiveTab(tab);
    }
  };

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
    const verifiedProjection = projectVerifiedAiInput(formData);
    if (!verifiedProjection.eligible) {
      showToast('Generation blocked: select a listing with a current, IP-cleared Product Truth Card first.');
      return;
    }
    const verifiedRequest = buildVerifiedAiRequest(verifiedProjection, { tone: formData?.tone });
    setIsGenerating(true);
    try {
      const result = await generateListingAI(verifiedRequest);
      const enrichedResult = {
        ...result,
        id: Date.now(),
        categoryName: verifiedRequest.category.name,
        categoryIcon: '✨',
        categoryBadge: 'VERIFIED PRODUCT TRUTH',
        status: 'NEEDS_QA'
      };

      // Post to backend to enforce AMZ-style strict gating. The backend is the
      // sole catalog authority: if this write doesn't succeed, the listing is
      // NOT_PERSISTED and must not be shown or saved as if it were.
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
        } else {
          enrichedResult.status = 'NOT_PERSISTED';
        }
      } catch (backendErr) {
        console.warn('Backend unavailable, listing was not persisted', backendErr);
        enrichedResult.status = 'NOT_PERSISTED';
      }

      setCurrentListing(enrichedResult);

      if (enrichedResult.dbId) {
        showToast('Generated Amazon & Etsy listings successfully! Awaiting QA.');
        // Auto save to history -- only for listings the backend actually persisted.
        handleSaveToHistory(enrichedResult, false);
      } else {
        showToast('Draft generated but NOT saved (backend unavailable) -- this draft will be lost on refresh.');
      }
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
    // Approval consumes an already-created structured evidence card. A text
    // prompt is not evidence and must never manufacture factual authority.
    if (!listingToApprove.productTruthCard) {
      showToast('Approval blocked: create a version-bound Product Truth Card first.');
      return;
    }
    try {
      const res = await fetch(`/api/listings/${listingToApprove.dbId}/approve`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: listingToApprove.listingVersion || listingToApprove.listing_version || 1,
          productTruthCard: listingToApprove.productTruthCard
        })
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || errBody.error || 'Not authorized or server error');
      }
      const data = await res.json();

      const updated = { ...listingToApprove, status: data.status, approvedVersion: data.approvedVersion, approvedHash: data.approvedHash };
      setCurrentListing(updated);
      handleSaveToHistory(updated, false);
      showToast('Listing Approved by Manager!');
    } catch (e) {
      showToast(`Approval failed: ${e.message}`);
    }
  };

  const handleUpdateListing = async (updatedListing) => {
    if (!updatedListing?.dbId) {
      showToast('Error: Cannot save an offline listing.');
      return;
    }
    try {
      const res = await fetch(`/api/listings/${updatedListing.dbId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: updatedListing.listingVersion || updatedListing.listing_version || 1,
          amazonTitle: updatedListing.amazonTitle,
          etsyTitle: updatedListing.etsyTitle,
          categoryName: updatedListing.categoryName,
          payload: updatedListing
        })
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || errBody.error || 'Not authorized or server error');
      }
      const data = await res.json();

      const saved = { ...updatedListing, status: data.status, listingVersion: data.listingVersion, ipVerdict: data.ipVerdict, ipHits: data.ipHits };
      setCurrentListing(saved);
      handleSaveToHistory(saved, false);
      showToast('Đã lưu Variation Plan!');
    } catch (e) {
      showToast(`Lưu thất bại: ${e.message}`);
    }
  };

  return (
    <div>
      <Header
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
        onOpenLoginModal={() => setIsLoginModalOpen(true)}
        onOpenUserManagementModal={() => setIsUserManagementModalOpen(true)}
        historyCount={history.length}
      />

      <main className="main-content">
        {/* TAB 1: Amazon A10 Workspace */}
        {activeTab === 'amazon-workspace' && (
          <AmazonWorkspace
            onSelectListing={(item) => {
              handleSelectFromHistory(item);
              setActiveTab('product-page');
            }}
            onApproveListing={handleApproveListing}
            onShowToast={showToast}
            onViewHistory={() => setActiveTab('history')}
          />
        )}

        {/* TAB 2: Etsy Contextual Workspace */}
        {activeTab === 'etsy-workspace' && (
          <EtsyWorkspace
            onSelectListing={(item) => {
              handleSelectFromHistory(item);
              setActiveTab('product-page');
            }}
            onApproveListing={handleApproveListing}
            onShowToast={showToast}
            onViewHistory={() => setActiveTab('history')}
          />
        )}

        {/* TAB 3: Product Listing Page Simulator */}
        {activeTab === 'product-page' && (
          <ProductListingPageSimulator
            currentListing={currentListing}
            history={history}
            onSelectListing={handleSelectFromHistory}
            onUpdateListing={handleUpdateListing}
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

      <UserManagementModal
        isOpen={isUserManagementModalOpen}
        onClose={() => setIsUserManagementModalOpen(false)}
        onShowToast={showToast}
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
