import { useEffect, useState } from 'react'
import { TitleBar } from './components/TitleBar/TitleBar'
import { TabContent } from './components/Tabs/TabContent'
import orbitLogo from './assets/orbit_logo.png'

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

  return (
    <div className="app">
      <TitleBar windowState={windowState} onStateChange={setWindowState} />
      <main className="app-content">
        {activeTab ? (
          <TabContent tab={activeTab} apiPort={apiPort} />
        ) : (
          <div className="welcome-screen">
            <div className="welcome-logo">
              <img src={orbitLogo} alt="Orbit" />
            </div>
            <h1 className="welcome-title">Welcome to Orbit</h1>
            <p className="welcome-subtitle">Create a new tab to get started</p>
          </div>
        )}
      </main>
    </div>
  )
}

export default App

