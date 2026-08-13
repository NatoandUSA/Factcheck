import React from 'react';
import { Home, X, Bot, Compass, CalendarCheck, MessageSquare, Sparkles, MapPin } from 'lucide-react';

export default function HomestayRoadmapModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '680px' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: '#ccfbf1', padding: '10px', borderRadius: '10px', color: '#0f766e' }}>
              <Home size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.25rem' }}>Hue Homestay Multi-Agent Hub</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Automated Hospitality & Concierge Agents for your Hue, Vietnam Homestay
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
          <div style={{ background: 'var(--bg-subtle)', padding: '16px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', fontSize: '0.9rem', marginBottom: '6px', color: '#0f766e' }}>
              <MessageSquare size={16} />
              <span>Guest Concierge Agent</span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              Auto-replies to inquiries in English, Vietnamese, and French. Provides instant check-in details, WiFi codes, directions from Da Nang / Phu Bai airport.
            </p>
          </div>

          <div style={{ background: 'var(--bg-subtle)', padding: '16px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', fontSize: '0.9rem', marginBottom: '6px', color: '#0f766e' }}>
              <Compass size={16} />
              <span>Hue Culinary & Tour Guide</span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              Generates customized itineraries (Imperial Citadel, Perfume River dragon boat, Royal Tombs, Bún Bò Huế food tours, evening walking streets).
            </p>
          </div>

          <div style={{ background: 'var(--bg-subtle)', padding: '16px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', fontSize: '0.9rem', marginBottom: '6px', color: '#0f766e' }}>
              <CalendarCheck size={16} />
              <span>Multi-OTA Calendar Sync</span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              Syncs iCal availability across Airbnb, Booking.com, and Agoda to eliminate double bookings automatically.
            </p>
          </div>

          <div style={{ background: 'var(--bg-subtle)', padding: '16px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', fontSize: '0.9rem', marginBottom: '6px', color: '#0f766e' }}>
              <Sparkles size={16} />
              <span>5-Star Review Booster</span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              Sends post-checkout thank you notes with local gift recommendations and handles feedback resolution proactively.
            </p>
          </div>
        </div>

        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.825rem', color: '#166534', marginBottom: '20px' }}>
          <MapPin size={20} style={{ flexShrink: 0 }} />
          <span>
            <strong>Phase 2 Module:</strong> As agreed in our planning session, this hospitality suite connects into the unified backend once your E-Commerce listing engine is live!
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={onClose}>
            Back to Listing Studio
          </button>
        </div>
      </div>
    </div>
  );
}
