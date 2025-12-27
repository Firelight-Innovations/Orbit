import { useEffect, useState } from 'react'
import { TabBar } from '../Tabs/TabBar'
import './TitleBar.css'

interface TabInfo {
  id: string
  title: string
  url: string
}

interface WindowState {
  id: number
  tabs: TabInfo[]
  activeTabId: string | null
}

interface TitleBarProps {
  windowState: WindowState | null
  onStateChange: (state: WindowState | null) => void
}

export function TitleBar({ windowState, onStateChange }: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    // Check initial maximize state
    window.electronAPI.isMaximized().then(setIsMaximized)

    // Listen for window resize to update maximize state
    const handleResize = () => {
      window.electronAPI.isMaximized().then(setIsMaximized)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handleMinimize = () => window.electronAPI.minimize()
  const handleMaximize = () => window.electronAPI.maximize()
  const handleClose = () => window.electronAPI.close()

  return (
    <header className="title-bar">
      <div className="title-bar-drag-region">
        <div className="app-icon">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
            <circle cx="12" cy="12" r="4" fill="currentColor" />
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>

      <TabBar windowState={windowState} onStateChange={onStateChange} />

      <div className="window-controls">
        <button
          className="window-control-btn minimize"
          onClick={handleMinimize}
          title="Minimize"
        >
          <svg viewBox="0 0 12 12" fill="none">
            <rect x="2" y="5.5" width="8" height="1" fill="currentColor" />
          </svg>
        </button>
        <button
          className="window-control-btn maximize"
          onClick={handleMaximize}
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? (
            <svg viewBox="0 0 12 12" fill="none">
              <rect x="3" y="1" width="8" height="8" stroke="currentColor" fill="none" />
              <rect x="1" y="3" width="8" height="8" stroke="currentColor" fill="var(--bg-tertiary)" />
            </svg>
          ) : (
            <svg viewBox="0 0 12 12" fill="none">
              <rect x="1.5" y="1.5" width="9" height="9" stroke="currentColor" fill="none" />
            </svg>
          )}
        </button>
        <button
          className="window-control-btn close"
          onClick={handleClose}
          title="Close"
        >
          <svg viewBox="0 0 12 12" fill="none">
            <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
    </header>
  )
}

