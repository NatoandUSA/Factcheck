import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import { TrendingUp, DollarSign, Package, Activity } from 'lucide-react';

const COLORS = {
  'KEEP': '#3b82f6',
  'SCALE': '#10b981',
  'CHANGE_MAIN_PHOTO_OR_PRICE': '#f59e0b',
  'CHANGE_TAGS_OR_TITLE': '#8b5cf6',
  'KILL_LISTING': '#ef4444'
};

const ACTION_LABELS = {
  'KEEP': 'Keep',
  'SCALE': 'Scale',
  'CHANGE_MAIN_PHOTO_OR_PRICE': 'Change Photo/Price',
  'CHANGE_TAGS_OR_TITLE': 'Change Tags/Title',
  'KILL_LISTING': 'Kill'
};

export default function Dashboard() {
  const [analytics, setAnalytics] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await fetch('http://localhost:3001/api/analytics');
        if (res.ok) {
          const data = await res.json();
          setAnalytics(data);
        }
      } catch (e) {
        console.error('Failed to load analytics', e);
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  const totalRevenue = analytics.reduce((sum, item) => sum + (item.totalRevenue || 0), 0);
  const totalProducts = analytics.reduce((sum, item) => sum + (item.count || 0), 0);

  const pieData = analytics.map(item => ({
    name: ACTION_LABELS[item.action] || item.action,
    value: item.count,
    originalAction: item.action
  }));

  const barData = analytics.map(item => ({
    name: ACTION_LABELS[item.action] || item.action,
    revenue: item.totalRevenue,
    orders: item.totalOrders
  }));

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading Analytics...</div>;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Activity size={24} style={{ color: 'var(--primary)' }}/> Business Analytics
        </h2>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
        <div className="studio-panel" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ background: '#dcfce7', padding: '16px', borderRadius: '50%', color: '#166534' }}>
            <DollarSign size={24} />
          </div>
          <div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '4px' }}>Total Pipeline Revenue</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>${totalRevenue.toLocaleString()}</div>
          </div>
        </div>

        <div className="studio-panel" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ background: '#e0e7ff', padding: '16px', borderRadius: '50%', color: '#3730a3' }}>
            <Package size={24} />
          </div>
          <div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '4px' }}>Products Tracked</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{totalProducts}</div>
          </div>
        </div>

        <div className="studio-panel" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ background: '#fef3c7', padding: '16px', borderRadius: '50%', color: '#b45309' }}>
            <TrendingUp size={24} />
          </div>
          <div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '4px' }}>Scaling Items</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>
              {analytics.find(a => a.action === 'SCALE')?.count || 0}
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        
        <div className="studio-panel" style={{ padding: '24px' }}>
          <h3 style={{ marginBottom: '24px', fontSize: '1.1rem' }}>Product Lifecycle Distribution</h3>
          {analytics.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No feedback data yet.</div>
          ) : (
            <div style={{ height: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[entry.originalAction] || '#cbd5e1'} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="studio-panel" style={{ padding: '24px' }}>
          <h3 style={{ marginBottom: '24px', fontSize: '1.1rem' }}>Revenue by Action Stage</h3>
          {analytics.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No feedback data yet.</div>
          ) : (
            <div style={{ height: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="revenue" fill="#10b981" name="Revenue ($)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
