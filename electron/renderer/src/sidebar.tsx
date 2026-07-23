import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { AssistantSidebar } from './components/Assistant/AssistantSidebar'
import { assistantStore } from './stores/assistantStore'
import './styles/global.css'

/**
 * Sidebar entry point.
 *
 * The assistant lives in its own WebContentsView (a separate renderer) so it
 * never fights the web content view for clicks/focus. It can't read the main
 * App state directly, so page context (active URL + text selection) arrives
 * over IPC from the main process via `assistant.onContext`.
 */
function SidebarApp() {
  const [activeUrl, setActiveUrl] = useState<string | null>(null)
  const [selectedText, setSelectedText] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribeContext = window.electronAPI.assistant.onContext((context) => {
      if (context.url !== undefined) {
        setActiveUrl(context.url ?? null)
      }
      if (context.selectedText !== undefined) {
        setSelectedText(context.selectedText ?? null)
      }
    })

    // Mark the store open while the sidebar view is mounted/visible so the
    // component's own open/close controls behave consistently.
    const unsubscribeOpen = window.electronAPI.assistant.onOpenChanged((isOpen) => {
      assistantStore.syncOpen(isOpen)
    })

    return () => {
      unsubscribeContext()
      unsubscribeOpen()
    }
  }, [])

  return <AssistantSidebar activeUrl={activeUrl} selectedText={selectedText} topOffset={0} />
}

ReactDOM.createRoot(document.getElementById('sidebar-root')!).render(
  <React.StrictMode>
    <SidebarApp />
  </React.StrictMode>
)
