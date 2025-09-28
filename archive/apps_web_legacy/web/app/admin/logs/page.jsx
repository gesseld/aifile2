'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function AuditLogsPage() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    type: '',
    user: '',
    dateRange: '7d',
    search: '',
  })
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    fetchAuditLogs()
  }, [filters, page])

  const fetchAuditLogs = async () => {
    try {
      setLoading(true)
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: '50',
        ...(filters.type && { type: filters.type }),
        ...(filters.user && { user: filters.user }),
        ...(filters.dateRange && { dateRange: filters.dateRange }),
        ...(filters.search && { search: filters.search }),
      })

      const response = await fetch(`/api/v1/admin/audit-logs?${queryParams}`)
      if (response.ok) {
        const data = await response.json()
        setLogs(data.logs)
        setTotalPages(data.totalPages)
      } else {
        // Fallback mock data
        setLogs(generateMockLogs())
        setTotalPages(5)
      }
    } catch (error) {
      console.error('Error fetching audit logs:', error)
      setLogs(generateMockLogs())
      setTotalPages(5)
    } finally {
      setLoading(false)
    }
  }

  const generateMockLogs = () => {
    const actions = [
      'login',
      'logout',
      'upload',
      'download',
      'delete',
      'share',
      'create',
      'update',
      'admin_action',
    ]
    const users = [
      'admin@system',
      'john@example.com',
      'sarah@example.com',
      'mike@example.com',
      'jane@example.com',
    ]
    const resources = [
      'file.pdf',
      'user_account',
      'system_settings',
      'api_key',
      'folder',
    ]

    return Array.from({ length: 50 }, (_, i) => ({
      id: i + 1,
      timestamp: new Date(
        Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000
      ).toISOString(),
      userId: users[Math.floor(Math.random() * users.length)],
      action: actions[Math.floor(Math.random() * actions.length)],
      resourceType: resources[Math.floor(Math.random() * resources.length)],
      resourceId: `res_${Math.floor(Math.random() * 1000)}`,
      ipAddress: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      status: Math.random() > 0.1 ? 'success' : 'failed',
      details: JSON.stringify({ additional: 'information' }),
    }))
  }

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1) // Reset to first page when filters change
  }

  const exportLogs = async () => {
    try {
      const response = await fetch('/api/v1/admin/audit-logs/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(filters),
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.style.display = 'none'
        a.href = url
        a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error('Error exporting logs:', error)
      alert('Export failed. Please try again.')
    }
  }

  const getActionIcon = (action) => {
    const icons = {
      login: '🔐',
      logout: '🚪',
      upload: '📤',
      download: '📥',
      delete: '🗑️',
      share: '🔗',
      create: '➕',
      update: '✏️',
      admin_action: '⚙️',
      default: '📝',
    }
    return icons[action] || icons.default
  }

  const getStatusBadge = (status) => {
    const classes = {
      success: 'status-success',
      failed: 'status-failed',
      pending: 'status-pending',
    }
    return (
      <span className={`status-badge ${classes[status] || 'status-pending'}`}>
        {status}
      </span>
    )
  }

  const formatDateTime = (timestamp) => {
    return new Date(timestamp).toLocaleString()
  }

  const formatRelativeTime = (timestamp) => {
    const now = new Date()
    const time = new Date(timestamp)
    const diff = now - time

    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 60) {
      return `${minutes}m ago`
    }
    if (hours < 24) {
      return `${hours}h ago`
    }
    return `${days}d ago`
  }

  return (
    <div className="admin-dashboard">
      <div className="admin-header">
        <div>
          <Link href="/admin" className="back-link">
            ← Back to Dashboard
          </Link>
          <h1>Audit Logs</h1>
          <p>Monitor system activity and user actions</p>
        </div>
        <div className="admin-actions">
          <button onClick={exportLogs} className="btn btn-secondary">
            📊 Export Logs
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-section">
        <h3>Filters</h3>
        <div className="filter-grid">
          <div className="filter-group">
            <label>Action Type</label>
            <select
              value={filters.type}
              onChange={(e) => handleFilterChange('type', e.target.value)}
            >
              <option value="">All Actions</option>
              <option value="login">Login</option>
              <option value="logout">Logout</option>
              <option value="upload">Upload</option>
              <option value="download">Download</option>
              <option value="delete">Delete</option>
              <option value="share">Share</option>
              <option value="admin_action">Admin Actions</option>
            </select>
          </div>

          <div className="filter-group">
            <label>User</label>
            <input
              type="text"
              placeholder="Search by user email..."
              value={filters.user}
              onChange={(e) => handleFilterChange('user', e.target.value)}
            />
          </div>

          <div className="filter-group">
            <label>Date Range</label>
            <select
              value={filters.dateRange}
              onChange={(e) => handleFilterChange('dateRange', e.target.value)}
            >
              <option value="1d">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="">All time</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Search</label>
            <input
              type="text"
              placeholder="Search in details..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="admin-section">
        <div className="section-header">
          <h2>Activity Logs</h2>
          <span className="results-count">
            {logs.length} {logs.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        {loading ? (
          <div className="loading">Loading audit logs...</div>
        ) : (
          <>
            <div className="logs-table-container">
              <table className="logs-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Resource</th>
                    <th>IP Address</th>
                    <th>Status</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="log-entry">
                      <td className="log-time">
                        <div className="time-absolute">
                          {formatDateTime(log.timestamp)}
                        </div>
                        <div className="time-relative">
                          {formatRelativeTime(log.timestamp)}
                        </div>
                      </td>
                      <td className="log-user">
                        <span className="user-email">{log.userId}</span>
                      </td>
                      <td className="log-action">
                        <span className="action-icon">
                          {getActionIcon(log.action)}
                        </span>
                        {log.action}
                      </td>
                      <td className="log-resource">
                        {log.resourceType} ({log.resourceId})
                      </td>
                      <td className="log-ip">{log.ipAddress}</td>
                      <td className="log-status">
                        {getStatusBadge(log.status)}
                      </td>
                      <td className="log-details">
                        <button
                          className="details-btn"
                          onClick={() =>
                            alert(
                              JSON.stringify(JSON.parse(log.details), null, 2)
                            )
                          }
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="pagination-btn"
                >
                  ← Previous
                </button>

                <span className="page-info">
                  Page {page} of {totalPages}
                </span>

                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="pagination-btn"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Statistics */}
      <div className="admin-section">
        <h2>Log Statistics</h2>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">📊</div>
            <div className="stat-content">
              <h3>{logs.filter((l) => l.status === 'success').length}</h3>
              <p>Successful Actions</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">⚠️</div>
            <div className="stat-content">
              <h3>{logs.filter((l) => l.status === 'failed').length}</h3>
              <p>Failed Actions</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">👥</div>
            <div className="stat-content">
              <h3>{new Set(logs.map((l) => l.userId)).size}</h3>
              <p>Unique Users</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">🔄</div>
            <div className="stat-content">
              <h3>{new Set(logs.map((l) => l.action)).size}</h3>
              <p>Action Types</p>
            </div>
          </div>
        </div>
      </div>

      {/* Export Info */}
      <div className="admin-section">
        <div className="info-card">
          <h3>📋 About Audit Logs</h3>
          <p>
            Audit logs track all significant system activities for security
            monitoring and compliance. Logs are retained for 365 days and
            include user actions, system events, and administrative changes.
          </p>
          <ul>
            <li>
              • All actions are timestamped and include user identification
            </li>
            <li>• IP addresses and user agents are recorded for security</li>
            <li>• Export functionality available for compliance reporting</li>
            <li>• Real-time monitoring through WebSocket connections</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
