import React, { useState, useEffect } from 'react';
import { Bot, Terminal, Power, PowerOff, Activity, Clock, Server } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function AgentHub({ onShowToast }) {
  const { user } = useAuth();
  const [agents, setAgents] = useState([]);
  const [logs, setLogs] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchAgentsAndLogs = async () => {
    try {
      const agentRes = await fetch('http://localhost:3001/api/agents');
      if (agentRes.ok) setAgents(await agentRes.json());

      const logRes = await fetch('http://localhost:3001/api/agents/logs');
      if (logRes.ok) setLogs(await logRes.json());
    } catch (err) {
      console.error("Agent Hub Error:", err);
    }
  };

  useEffect(() => {
    fetchAgentsAndLogs();
    
    let intervalId;
    if (autoRefresh) {
      intervalId = setInterval(fetchAgentsAndLogs, 3000); // Poll every 3s
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [autoRefresh]);

  const toggleAgent = async (id, currentStatus) => {
    const newStatus = currentStatus === 'ONLINE' ? 'OFFLINE' : 'ONLINE';
    try {
      const res = await fetch(`http://localhost:3001/api/agents/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        onShowToast(`Agent commanded to go ${newStatus}`);
        fetchAgentsAndLogs(); // refresh immediately
      }
    } catch (err) {
      onShowToast(`Failed to toggle agent: ${err.message}`);
    }
  };

  if (!user || (user.role !== 'MANAGER' && user.role !== 'OWNER' && user.role !== 'ADMIN')) {
    return (
      <div className="studio-panel" style={{ textAlign: 'center', padding: '60px 20px', maxWidth: '800px', margin: '0 auto' }}>
        <Bot size={48} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
        <h3>Access Denied</h3>
        <p style={{ color: 'var(--text-secondary)' }}>Only Managers and Owners can access the Agent Hub Command Center.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Header */}
      <div className="studio-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.4rem', marginBottom: '6px' }}>
              <Server size={24} style={{ color: 'var(--primary)' }} />
              Multi-Agent Hub
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Manage your autonomous AI workforce. Turn agents ON to let them research and draft listings in the background.
            </p>
          </div>
          <button 
            className={`btn ${autoRefresh ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <Activity size={14} />
            <span>Live Sync {autoRefresh ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '20px' }}>
        
        {/* Agents List (Left Column) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {agents.map(agent => (
            <div key={agent.id} className="studio-panel" style={{ padding: '20px', borderLeft: agent.status === 'ONLINE' ? '4px solid var(--success)' : '4px solid var(--text-muted)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem', marginBottom: '8px' }}>
                    <Bot size={18} style={{ color: agent.status === 'ONLINE' ? 'var(--success)' : 'var(--text-muted)' }} />
                    {agent.name}
                  </h3>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    <strong>Role:</strong> {agent.role}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} />
                    <strong>Last Active:</strong> {agent.lastActive ? new Date(agent.lastActive).toLocaleTimeString() : 'Never'}
                  </div>
                </div>
                
                <button
                  className="btn btn-sm"
                  style={{
                    background: agent.status === 'ONLINE' ? '#fee2e2' : '#dcfce7',
                    color: agent.status === 'ONLINE' ? '#991b1b' : '#166534',
                    border: 'none',
                    fontWeight: 600
                  }}
                  onClick={() => toggleAgent(agent.id, agent.status)}
                >
                  {agent.status === 'ONLINE' ? <PowerOff size={14} /> : <Power size={14} />}
                  <span>{agent.status === 'ONLINE' ? 'STOP' : 'START'}</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Live Terminal (Right Column) */}
        <div className="studio-panel" style={{ padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '500px' }}>
          <div style={{ background: '#1e293b', color: '#cbd5e1', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #334155' }}>
            <Terminal size={16} />
            <span style={{ fontSize: '0.85rem', fontWeight: 600, letterSpacing: '0.5px' }}>AGENT SYSTEM LOGS</span>
          </div>
          <div style={{ background: '#0f172a', flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', fontFamily: 'var(--font-mono)' }}>
            {logs.length === 0 ? (
              <div style={{ color: '#475569', fontSize: '0.85rem', textAlign: 'center', marginTop: '20px' }}>Waiting for agent activity...</div>
            ) : (
              logs.map(log => (
                <div key={log.id} style={{ fontSize: '0.8rem', display: 'flex', gap: '12px', borderBottom: '1px solid #1e293b', paddingBottom: '8px' }}>
                  <div style={{ color: '#64748b', whiteSpace: 'nowrap' }}>
                    [{new Date(log.timestamp).toLocaleTimeString()}]
                  </div>
                  <div style={{ color: '#38bdf8', minWidth: '100px' }}>
                    &lt;{log.agentName}&gt;
                  </div>
                  <div style={{ color: '#f8fafc', flex: 1, wordBreak: 'break-word' }}>
                    {log.message}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        
      </div>
    </div>
  );
}
