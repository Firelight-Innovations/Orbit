import { useEffect, useState } from 'react'
import { TitleBar } from './components/TitleBar/TitleBar'
import { NavigationBar } from './components/NavigationBar/NavigationBar'
import { TabContent } from './components/Tabs/TabContent'
import orbitLogo from './assets/orbit_logo.png'

// Height of header (title bar + navigation bar) - must match HEADER_HEIGHT in main process
const HEADER_HEIGHT = 80

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
  
  // Attention-based focus system: when true, web content receives all mouse events
  const [webContentHasAttention, setWebContentHasAttention] = useState(false)

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

  // Check if current tab is showing an internal page (rendered by React)
  // External pages are rendered by WebContentsView in the main process
  const isInternalPage = activeTab?.url.startsWith('orbit://') ?? true

  // Give attention to web content when clicking the content area
  const handleContentClick = () => {
    setWebContentHasAttention(true)
    window.electronAPI.setUIIgnoreMouseEvents(true)
  }

  // Mouse tracking to exit attention mode when mouse enters header area
  useEffect(() => {
    // Only track when web content has attention and on external pages
    if (!webContentHasAttention || isInternalPage) return

    const handleMouseMove = (e: MouseEvent) => {
      // When mouse enters header area, remove attention from web content
      if (e.clientY < HEADER_HEIGHT) {
        setWebContentHasAttention(false)
        window.electronAPI.setUIIgnoreMouseEvents(false)
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
    }
  }, [webContentHasAttention, isInternalPage])

  // Reset attention when switching tabs or pages
  useEffect(() => {
    setWebContentHasAttention(false)
    window.electronAPI.setUIIgnoreMouseEvents(false)
  }, [activeTab?.id, isInternalPage])

  // Handle navigation from the URL bar
  const handleNavigate = (url: string) => {
    if (activeTab) {
      window.electronAPI.navigate(activeTab.id, url)
    }
  }

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
          // Placeholder for external pages - WebContentsView renders behind
          // Click to give attention to web content, then pointer-events: none to let clicks through
          <div 
            className="browser-view-placeholder"
            onClick={handleContentClick}
            style={{ pointerEvents: webContentHasAttention ? 'none' : 'auto', cursor: webContentHasAttention ? 'default' : 'pointer' }}
          >
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
