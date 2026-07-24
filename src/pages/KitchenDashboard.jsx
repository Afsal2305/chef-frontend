import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock, CheckCircle, ChefHat, UtensilsCrossed, Bell, XCircle } from 'lucide-react'

const statusColors = {
  pending: { bg: '#FEF3C7', text: '#D97706', label: 'Pending' },
  preparing: { bg: '#DBEAFE', text: '#2563EB', label: 'Preparing' },
  ready: { bg: '#D1FAE5', text: '#16A34A', label: 'Ready' },
  served: { bg: '#F3F4F6', text: '#6B7280', label: 'Served' },
  cancelled: { bg: '#FEE2E2', text: '#DC2626', label: 'Cancelled' },
}

export default function KitchenDashboard() {
  const [kots, setKots] = useState([])
  const [activeTab, setActiveTab] = useState('all')
  const [stats, setStats] = useState({ all: 0, pending: 0, preparing: 0, ready: 0, served: 0 })
  const [chefModal, setChefModal] = useState(null)
  const [chefForm, setChefForm] = useState({ username: '', code: '' })
  const [chefError, setChefError] = useState('')
  const [chefLoading, setChefLoading] = useState(false)
  const [error, setError] = useState('')
  const audioRef = useRef(null)

  // Track current chef identity in memory (shared device — no persistence)
  const currentChefRef = useRef(null)

  useEffect(() => {
    fetchKOTs(); fetchStats()
    let iv
    const startPolling = () => { iv = setInterval(() => { fetchKOTs(); fetchStats() }, 10000) }
    const stopPolling = () => { if (iv) { clearInterval(iv); iv = null } }
    startPolling()
    document.addEventListener('visibilitychange', () => { document.hidden ? stopPolling() : startPolling() })
    return () => { stopPolling(); document.removeEventListener('visibilitychange', stopPolling) }
  }, [])
  useEffect(() => { fetchKOTs() }, [activeTab])

  const fetchKOTs = async () => {
    try {
      const res = await fetch(`/api/kitchen?status=${activeTab}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setKots(Array.isArray(data) ? data : [])
    } catch (err) { console.error('Failed to fetch KOTs:', err); setKots([]) }
  }

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/kitchen/stats')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setStats(data || { all: 0, pending: 0, preparing: 0, ready: 0, served: 0 })
    } catch (err) { console.error('Failed to fetch stats:', err) }
  }

  const updateStatus = async (id, status, chefData) => {
    try {
      const body = { status, ...chefData }
      const res = await fetch(`/api/kitchen/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (res.ok) {
        fetchKOTs()
        fetchStats()
        if (status === 'ready') {
          try { new Notification('KOT Ready', { body: 'An order is ready for serving!' }) } catch (e) {}
          try { if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.play() } } catch (e) {}
        }
      } else {
        throw new Error(data.error || 'Failed to update')
      }
    } catch (err) {
      setError(err.message)
      setTimeout(() => setError(''), 4000)
    }
  }

  const cancelKot = async (id) => {
    if (!window.confirm('Are you sure you want to cancel this order?')) return
    try {
      const res = await fetch(`/api/kitchen/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled', chef_username: currentChefRef.current?.username, chef_code: currentChefRef.current?.code })
      })
      if (res.ok) {
        fetchKOTs()
        fetchStats()
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to cancel')
        setTimeout(() => setError(''), 4000)
      }
    } catch (err) { console.error('Failed to cancel KOT:', err) }
  }

  const handleStartPreparing = (kot) => {
    // If already identified, use stored chef identity
    if (currentChefRef.current) {
      updateStatus(kot.id, 'preparing', {
        chef_username: currentChefRef.current.username,
        chef_code: currentChefRef.current.code
      })
      return
    }
    setChefModal(kot)
    setChefForm({ username: '', code: '' })
    setChefError('')
  }

  const handleChefSubmit = async () => {
    setChefError('')
    if (!chefForm.username.trim() || !chefForm.code.trim()) {
      setChefError('Please enter both username and chef code')
      return
    }
    setChefLoading(true)
    try {
      await updateStatus(chefModal.id, 'preparing', {
        chef_username: chefForm.username.trim(),
        chef_code: chefForm.code.trim()
      })
      // Store chef identity in session memory
      currentChefRef.current = {
        username: chefForm.username.trim(),
        code: chefForm.code.trim()
      }
      setChefModal(null)
      setChefForm({ username: '', code: '' })
    } catch (err) {
      setChefError(err.message)
    } finally {
      setChefLoading(false)
    }
  }

  const handleUpdateWithChef = (kot, newStatus) => {
    if (currentChefRef.current) {
      updateStatus(kot.id, newStatus, {
        chef_username: currentChefRef.current.username,
        chef_code: currentChefRef.current.code
      })
    } else {
      // Need to identify first
      setChefModal(kot)
      setChefForm({ username: '', code: '' })
      setChefError('')
    }
  }

  const getElapsed = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    return `${hrs}h ${mins % 60}m ago`
  }

  const tabs = [
    { key: 'all', label: 'All', count: stats.all },
    { key: 'pending', label: 'Pending', count: stats.pending },
    { key: 'preparing', label: 'Preparing', count: stats.preparing },
    { key: 'ready', label: 'Ready', count: stats.ready },
    { key: 'served', label: 'Served', count: stats.served },
  ]

  return (
    <motion.div className="page" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <audio ref={audioRef} src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACAf39/f4B/f3+AgH9/f3+AgH9/f3+AgH9/f3+AgIB/f39/gIB/f3+AgH9/f3+AgH9/f3+AgH9/f3+AgH9/f38" />

      <div className="page-header">
        <div>
          <h2>Kitchen Display</h2>
          <p>Real-time kitchen order management</p>
        </div>
        <div className="page-header-actions">
          {currentChefRef.current && (
            <span className="chef-session-badge">
              <ChefHat size={14} strokeWidth={1.5} />
              {currentChefRef.current.username}
              <button className="chef-clear-btn" onClick={() => { currentChefRef.current = null }}>
                Clear
              </button>
            </span>
          )}
          <button className="btn btn-secondary" onClick={() => { fetchKOTs(); fetchStats() }}>
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="message-bar error">{error}</div>
      )}

      <div className="kot-stats-bar">
        {tabs.map(tab => (
          <div
            key={tab.key}
            className={`kot-stat-chip ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <span className="kot-stat-count">{tab.count}</span>
            <span className="kot-stat-label">{tab.label}</span>
          </div>
        ))}
      </div>

      <div className="kot-grid">
        <AnimatePresence mode="popLayout">
          {kots.map(kot => (
            <motion.div
              key={kot.id}
              className="kot-card"
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <div className="kot-card-header" style={{ borderLeftColor: statusColors[kot.status]?.bg }}>
                <div className="kot-card-top">
                  <span className="kot-number">#{kot.kot_number?.replace('KOT-', '')}</span>
                  <span className={`kot-status-badge ${kot.status}`}>
                    {statusColors[kot.status]?.label}
                  </span>
                </div>
                <div className="kot-card-meta">
                  <span className="kot-table">Table {kot.table_number || '-'}</span>
                  <span className="kot-type">{kot.order_type?.replace('_', ' ')}</span>
                </div>
                <div className="kot-card-time">
                  <Clock size={14} strokeWidth={1.5} />
                  {getElapsed(kot.created_at)}
                </div>
                {kot.waiter_name && <div className="kot-waiter">👨‍🍳 {kot.waiter_name}</div>}
                {kot.assigned_chef_name && (
                  <div className="kot-assigned-chef">
                    <ChefHat size={13} strokeWidth={1.5} /> {kot.assigned_chef_name}
                    {kot.assigned_time && <span className="kot-chef-time"> · {getElapsed(kot.assigned_time)}</span>}
                  </div>
                )}
              </div>

              <div className="kot-card-body">
                <table className="kot-items-table">
                  <thead>
                    <tr><th>Item</th><th>Qty</th><th>Notes</th></tr>
                  </thead>
                  <tbody>
                    {kot.items?.map(item => (
                      <tr key={item.id}>
                        <td>
                          {item.item_name}
                          {item.variant_name && <span className="kot-variant"> ({item.variant_name})</span>}
                          {item.addon_names && <div className="kot-addons">+ {(typeof item.addon_names === 'string' ? JSON.parse(item.addon_names || '[]') : item.addon_names || []).join(', ')}</div>}
                        </td>
                        <td className="kot-qty">{item.quantity}</td>
                        <td className="kot-notes">{item.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="kot-card-actions">
                {kot.status === 'pending' && (
                  <button className="btn btn-primary btn-sm" onClick={() => handleStartPreparing(kot)}>
                    <ChefHat size={14} strokeWidth={1.5} /> Start Preparing
                  </button>
                )}
                {kot.status === 'preparing' && (
                  <button className="btn btn-success btn-sm" onClick={() => handleUpdateWithChef(kot, 'ready')}>
                    <CheckCircle size={14} strokeWidth={1.5} /> Mark Ready
                  </button>
                )}
                {kot.status === 'ready' && (
                  <button className="btn btn-secondary btn-sm" onClick={() => handleUpdateWithChef(kot, 'served')}>
                    <UtensilsCrossed size={14} strokeWidth={1.5} /> Mark Served
                  </button>
                )}
                {kot.status === 'preparing' && currentChefRef.current && (
                  <button className="btn btn-ghost btn-sm" onClick={() => handleUpdateWithChef(kot, 'pending')}>
                    Revert
                  </button>
                )}
                {['pending', 'preparing'].includes(kot.status) && (
                  <button className="btn btn-danger btn-sm" onClick={() => cancelKot(kot.id)}>
                    <XCircle size={14} strokeWidth={1.5} /> Cancel
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {kots.length === 0 && (
          <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
            <ChefHat size={48} strokeWidth={1} />
            <p>No {activeTab === 'all' ? '' : activeTab} orders in the kitchen.</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {chefModal && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setChefModal(null)}>
            <motion.div className="modal" style={{ maxWidth: 400 }} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} onClick={e => e.stopPropagation()}>
              <div className="chef-modal-header">
                <ChefHat size={24} strokeWidth={1.5} />
                <h3>Chef Identification</h3>
              </div>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 16, fontSize: 14 }}>
                Enter your credentials to take this order.
              </p>
              <div className="form-group">
                <label>Chef Username</label>
                <input type="text" value={chefForm.username} onChange={e => setChefForm({ ...chefForm, username: e.target.value })} placeholder="Enter your username" />
              </div>
              <div className="form-group">
                <label>Chef Code</label>
                <input type="text" value={chefForm.code} onChange={e => setChefForm({ ...chefForm, code: e.target.value })} placeholder="Enter your unique code" />
              </div>
              {chefError && <p className="error-msg" style={{ fontSize: 13, marginBottom: 8 }}>{chefError}</p>}
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => setChefModal(null)}>Cancel</button>
                <button className="btn btn-primary" disabled={chefLoading} onClick={handleChefSubmit}>
                  {chefLoading ? 'Validating...' : 'Confirm & Start'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
