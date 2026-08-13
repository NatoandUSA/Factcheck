import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Loader2, X, CheckCircle2 } from 'lucide-react';

export default function AgentChat({ onClose, contextListing, onListingGenerated }) {
  const [messages, setMessages] = useState([
    { role: 'model', content: "Hello! I'm your AI E-commerce Co-Pilot. Tell me what to draft and I'll generate a full listing instantly.\n\nExamples:\n• \"Draft an Amazon listing for an acrylic LED night light\"\n• \"Write listing for a personalized grandma blanket\"\n• \"Create a couples anniversary hoodie listing\"" }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (text = input) => {
    if (!text.trim()) return;

    const userMessage = { role: 'user', content: text };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMessage] })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to fetch response');

      setMessages(prev => [...prev, { role: 'model', content: data.reply, hasListing: !!data.listing }]);
      
      // Auto-load listing into the draft editor
      if (data.listing && onListingGenerated) {
        onListingGenerated(data.listing);
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'model', content: `⚠️ Error: ${error.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const quickActions = [
    "Draft an Amazon + Etsy listing for an Acrylic LED night light gift",
    "Write a listing for a personalized grandma blanket",
    "Create a couples embroidered hoodie listing"
  ];

  return (
    <div className="agent-chat-container">
      <div className="chat-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="bot-avatar"><Bot size={18} /></div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>AI Co-Pilot</h3>
            <div style={{ fontSize: '0.75rem', color: 'var(--success)' }}>● Online</div>
          </div>
        </div>
        <button className="btn-icon" onClick={onClose}><X size={18} /></button>
      </div>

      <div className="chat-messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`chat-message-row ${msg.role}`}>
            <div className={`chat-bubble ${msg.role}`}>
              {msg.role === 'model' && <Sparkles size={14} className="sparkle-icon" />}
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{msg.content}</div>
              {msg.hasListing && (
                <div style={{ 
                  marginTop: '8px', 
                  padding: '6px 10px', 
                  background: 'rgba(34, 197, 94, 0.1)', 
                  borderRadius: '6px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px',
                  fontSize: '0.8rem',
                  color: '#16a34a',
                  fontWeight: 500
                }}>
                  <CheckCircle2 size={14} />
                  Listing auto-loaded into draft editor →
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="chat-message-row model">
            <div className="chat-bubble model loading">
              <Loader2 size={16} className="spinner" /> Drafting your listing...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {messages.length === 1 && (
        <div className="chat-quick-actions">
          {quickActions.map((action, i) => (
            <button key={i} className="quick-action-btn" onClick={() => handleSend(action)}>
              {action}
            </button>
          ))}
        </div>
      )}

      <div className="chat-input-area">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tell me what product listing to draft..."
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <button 
          className="btn btn-primary send-btn" 
          onClick={() => handleSend()}
          disabled={!input.trim() || isLoading}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
