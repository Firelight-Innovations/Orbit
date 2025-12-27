import { useEffect, useState } from 'react'
import './TabContent.css'
import orbitLogo from '../../assets/orbit_logo.png'

interface TabInfo {
  id: string
  title: string
  url: string
}

interface TabContentProps {
  tab: TabInfo
  apiPort: number | null
}

interface ApiStatus {
  status: string
  message: string
  version: string
  docs_url: string
}

export function TabContent({ tab, apiPort }: TabContentProps) {
  const [apiStatus, setApiStatus] = useState<ApiStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (tab.url === 'orbit://home' && apiPort) {
      setLoading(true)
      setError(null)

      fetch(`http://127.0.0.1:${apiPort}/api/health`)
        .then((res) => res.json())
        .then((data) => {
          setApiStatus(data)
          setLoading(false)
        })
        .catch((err) => {
          setError(err.message)
          setLoading(false)
        })
    }
  }, [tab.url, apiPort])

  if (tab.url === 'orbit://home') {
    return (
      <div className="tab-content home">
        <div className="home-container">
          <div className="home-header">
            <div className="orbit-logo">
              <img src={orbitLogo} alt="Orbit" />
            </div>
            <h1>Welcome to Orbit</h1>
            <p className="subtitle">Your intelligent browsing companion</p>
          </div>

          <div className="status-section">
            <h2>Backend Status</h2>
            {loading && <p className="status-loading">Connecting to backend...</p>}
            {error && <p className="status-error">Error: {error}</p>}
            {apiStatus && (
              <div className="status-card">
                <div className="status-row">
                  <span className="status-label">Status</span>
                  <span className="status-value success">{apiStatus.status}</span>
                </div>
                <div className="status-row">
                  <span className="status-label">Version</span>
                  <span className="status-value">{apiStatus.version}</span>
                </div>
                <div className="status-row">
                  <span className="status-label">Message</span>
                  <span className="status-value">{apiStatus.message}</span>
                </div>
                <div className="status-row">
                  <span className="status-label">API Docs</span>
                  <a
                    className="status-link"
                    href={`http://127.0.0.1:${apiPort}/docs`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open Swagger UI
                  </a>
                </div>
              </div>
            )}
            {!apiPort && !loading && (
              <p className="status-waiting">Waiting for backend to start...</p>
            )}
          </div>

          <div className="features-section">
            <h2>Features</h2>
            <div className="features-grid">
              <div className="feature-card">
                <div className="feature-icon">
                  <svg viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
                    <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
                    <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
                    <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </div>
                <h3>Chrome-like Tabs</h3>
                <p>Drag tabs to reorder or detach them into new windows</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="2" />
                    <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="2" />
                    <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </div>
                <h3>Python Backend</h3>
                <p>FastAPI powers the backend with automatic OpenAPI docs</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">
                  <svg viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                    <path
                      d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <h3>Custom UI</h3>
                <p>Modern, dark-themed interface with custom title bar</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="tab-content">
      <div className="tab-content-placeholder">
        <p>Content for: {tab.url}</p>
      </div>
    </div>
  )
}

