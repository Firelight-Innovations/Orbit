import { useEffect, useState } from 'react'
import { TitleBar } from './components/TitleBar/TitleBar'
import { NavigationBar } from './components/NavigationBar/NavigationBar'
import { TabContent } from './components/Tabs/TabContent'
import orbitLogo from './assets/orbit_logo.png'

interface TabInfo {
  id: string
  title: string
  url: string
  isLoading?: boolean
  canGoBack?: boolean
  canGoForward?: boolean
  favicon?: string
}

interface WindowState {
  id: number
  tabs: TabInfo[]
  activeTabId: string | null
}

function App() {
  const [windowState, setWindowState] = useState<WindowState | null>(null)
  const [apiPort, setApiPort] = useState<number | null>(null)

  useEffect(() => {
    // Load initial state
    window.electronAPI.getTabState().then(setWindowState)
    window.electronAPI.getApiPort().then(setApiPort)

    // Subscribe to tab updates
    const unsubscribe = window.electronAPI.onTabsUpdated((state) => {
      setWindowState(state)
    })

    return unsubscribe
  }, [])

  const activeTab = windowState?.tabs.find((tab) => tab.id === windowState.activeTabId)

  // Handle navigation from the URL bar
  const handleNavigate = (url: string) => {
    if (activeTab) {
      window.electronAPI.navigate(activeTab.id, url)
    }
  }

  // Check if current tab is showing an internal page (rendered by React)
  // External pages are rendered by WebContentsView in the main process
  const isInternalPage = activeTab?.url.startsWith('orbit://') ?? true

  return (
    <div className="app">
      <TitleBar windowState={windowState} onStateChange={setWindowState} />
      <NavigationBar activeTab={activeTab ?? null} onNavigate={handleNavigate} />
      <main className="app-content">
        {/* Only render React content for internal pages (orbit://) */}
        {/* External pages are rendered by WebContentsView overlay from main process */}
        {isInternalPage ? (
          activeTab ? (
            <TabContent tab={activeTab} apiPort={apiPort} />
          ) : (
            <div className="welcome-screen">
              <div className="welcome-logo">
                <img src={orbitLogo} alt="Orbit" />
              </div>
              <h1 className="welcome-title">Welcome to Orbit</h1>
              <p className="welcome-subtitle">Create a new tab to get started</p>
            </div>
          )
        ) : (
          // Placeholder for external pages - WebContentsView renders on top
          <div className="browser-view-placeholder">
            {activeTab?.isLoading && (
              <div className="browser-loading-state">
                <div className="browser-loading-spinner" />
                <p>Loading {activeTab.url}...</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

export default App
