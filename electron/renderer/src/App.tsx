import { useEffect, useState } from 'react'
import { TitleBar } from './components/TitleBar/TitleBar'
import { NavigationBar } from './components/NavigationBar/NavigationBar'
import { BookmarksBar } from './components/BookmarksBar/BookmarksBar'
import { TabContent } from './components/Tabs/TabContent'
import { WelcomeScreen } from './components/Welcome/WelcomeScreen'
import { ProfilesPage } from './components/Profiles/ProfilesPage'
import { SearchPage } from './components/Search/SearchPage'
import orbitLogo from './assets/orbit_logo.png'
import { AssistantSidebar } from './components/Assistant/AssistantSidebar'
import { assistantStore, useAssistantStore } from './stores/assistantStore'

// Height of header (title bar + navigation bar + bookmarks bar) - must match HEADER_HEIGHT in main process
const HEADER_HEIGHT = 112

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
  const [showWelcome, setShowWelcome] = useState<boolean | null>(null) // null = loading
  
  // Attention-based focus system: when true, web content receives all mouse events
  const [webContentHasAttention, setWebContentHasAttention] = useState(false)
  const [selectedText, setSelectedText] = useState<string | null>(null)
  const isAssistantOpen = useAssistantStore((s) => s.isOpen)

  useEffect(() => {
    // Check if onboarding is complete
    checkOnboardingStatus()
    
    // Load initial state
    window.electronAPI.getTabState().then(setWindowState)
    window.electronAPI.getApiPort().then(setApiPort)

    // Subscribe to tab updates
    const unsubscribe = window.electronAPI.onTabsUpdated((state) => {
      setWindowState(state)
    })

    return unsubscribe
  }, [])

  // Global shortcut for assistant (Ctrl/Cmd + K)
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isCmdK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'
      if (isCmdK) {
        event.preventDefault()
        assistantStore.toggle()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const checkOnboardingStatus = async () => {
    try {
      const isComplete = await window.electronAPI.profile.isOnboardingComplete()
      setShowWelcome(!isComplete)
    } catch (error) {
      console.error('Failed to check onboarding status:', error)
      // Default to not showing welcome if there's an error
      setShowWelcome(false)
    }
  }

  const handleWelcomeComplete = () => {
    setShowWelcome(false)
  }

  const activeTab = windowState?.tabs.find((tab) => tab.id === windowState.activeTabId)

  // Check if current tab is showing an internal page (rendered by React)
  // External pages are rendered by WebContentsView in the main process
  const isInternalPage = activeTab?.url.startsWith('orbit://') ?? true

  // Give attention to web content when clicking the content area
  const handleContentClick = () => {
    setWebContentHasAttention(true)
    window.electronAPI.setUIIgnoreMouseEvents(true)
  }

  // Mouse tracking to exit attention mode when mouse enters header area or assistant sidebar
  useEffect(() => {
    // Only track when web content has attention and on external pages
    if (!webContentHasAttention || isInternalPage) return

    const handleMouseMove = (e: MouseEvent) => {
      // When mouse enters header area or assistant sidebar area, remove attention from web content
      const inHeader = e.clientY < HEADER_HEIGHT
      const inAssistant = isAssistantOpen && e.clientX > window.innerWidth - 420
      
      if (inHeader || inAssistant) {
        setWebContentHasAttention(false)
        window.electronAPI.setUIIgnoreMouseEvents(false)
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
    }
  }, [webContentHasAttention, isInternalPage, isAssistantOpen])

  // Reset attention when switching tabs or pages
  useEffect(() => {
    setWebContentHasAttention(false)
    window.electronAPI.setUIIgnoreMouseEvents(false)
  }, [activeTab?.id, isInternalPage])

  // Capture selected text via context menu to share with assistant
  useEffect(() => {
    const handleContextMenu = () => {
      const selection = window.getSelection()?.toString().trim()
      setSelectedText(selection || null)
      assistantStore.setPageContext({
        url: activeTab?.url ?? null,
        selectedText: selection || null
      })
    }

    window.addEventListener('contextmenu', handleContextMenu)
    return () => window.removeEventListener('contextmenu', handleContextMenu)
  }, [activeTab?.url])

  // Handle navigation from the URL bar
  const handleNavigate = (url: string) => {
    if (activeTab) {
      window.electronAPI.navigate(activeTab.id, url)
    }
  }

  // Render content based on the current URL
  const renderContent = () => {
    if (!activeTab) {
      return (
        <div className="welcome-screen">
          <div className="welcome-logo">
            <img src={orbitLogo} alt="Orbit" />
          </div>
          <h1 className="welcome-title">Welcome to Orbit</h1>
          <p className="welcome-subtitle">Create a new tab to get started</p>
        </div>
      )
    }

    const url = activeTab.url

    // Handle different internal pages
    if (url.startsWith('orbit://search')) {
      return <SearchPage />
    }

    if (url.startsWith('orbit://profiles')) {
      return <ProfilesPage onNavigate={handleNavigate} />
    }

    // Default TabContent for other internal pages
    return <TabContent tab={activeTab} apiPort={apiPort} onNavigate={handleNavigate} />
  }

  // Show bookmarks bar on all tabs
  const showBookmarksBar = !!activeTab

  // Show loading state while checking onboarding
  if (showWelcome === null) {
    return (
      <div className="app">
        <div className="flex h-full items-center justify-center bg-[#0a0a0b]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  // Show welcome screen for new users
  if (showWelcome) {
    return (
      <div className="app">
        <WelcomeScreen onComplete={handleWelcomeComplete} />
      </div>
    )
  }

  return (
    <div className="app">
      <TitleBar windowState={windowState} onStateChange={setWindowState} />
      <NavigationBar activeTab={activeTab ?? null} onNavigate={handleNavigate} />
      {showBookmarksBar && <BookmarksBar onNavigate={handleNavigate} />}
      <main className="app-content flex">
        <div
          className="flex-1"
          style={{
            width: isAssistantOpen ? 'calc(100% - 420px)' : '100%',
            transition: 'width 180ms ease'
          }}
        >
          {/* Only render React content for internal pages (orbit://) */}
          {/* External pages are rendered by WebContentsView overlay from main process */}
          {isInternalPage ? (
            renderContent()
          ) : (
            // Placeholder for external pages - WebContentsView renders behind
            // Click to give attention to web content, then pointer-events: none to let clicks through
            <div 
              className="browser-view-placeholder h-full"
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
        </div>
        {isAssistantOpen && (
          <AssistantSidebar
            activeUrl={activeTab?.url ?? null}
            selectedText={selectedText}
            topOffset={HEADER_HEIGHT}
          />
        )}
      </main>
    </div>
  )
}

export default App
