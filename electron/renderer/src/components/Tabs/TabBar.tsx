import { useRef, useState, useCallback } from 'react'
import { Tab } from './Tab'
import './TabBar.css'

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

interface TabBarProps {
  windowState: WindowState | null
  onStateChange: (state: WindowState | null) => void
}

export function TabBar({ windowState, onStateChange }: TabBarProps) {
  const [draggedTab, setDraggedTab] = useState<string | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const tabBarRef = useRef<HTMLDivElement>(null)
  const dragStartPos = useRef<{ x: number; y: number } | null>(null)

  const handleNewTab = async () => {
    const newTab: TabInfo = {
      id: `tab-${Date.now()}`,
      title: 'New Tab',
      url: 'orbit://home'
    }
    const state = await window.electronAPI.createTab(newTab)
    onStateChange(state)
  }

  const handleCloseTab = async (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const state = await window.electronAPI.closeTab(tabId)
    onStateChange(state)
  }

  const handleActivateTab = async (tabId: string) => {
    if (tabId !== windowState?.activeTabId) {
      const state = await window.electronAPI.activateTab(tabId)
      onStateChange(state)
    }
  }

  const handleDragStart = useCallback(
    (tabId: string, e: React.DragEvent) => {
      setDraggedTab(tabId)
      dragStartPos.current = { x: e.clientX, y: e.clientY }

      // Set drag image
      const target = e.currentTarget as HTMLElement
      e.dataTransfer.setDragImage(target, target.offsetWidth / 2, target.offsetHeight / 2)
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', tabId)
    },
    []
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setDragOverIndex(index)
    },
    []
  )

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null)
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent, toIndex: number) => {
      e.preventDefault()

      if (!windowState || !draggedTab) return

      const fromIndex = windowState.tabs.findIndex((t) => t.id === draggedTab)
      if (fromIndex !== -1 && fromIndex !== toIndex) {
        const state = await window.electronAPI.reorderTabs(fromIndex, toIndex)
        onStateChange(state)
      }

      setDraggedTab(null)
      setDragOverIndex(null)
      dragStartPos.current = null
    },
    [windowState, draggedTab, onStateChange]
  )

  const handleDragEnd = useCallback(
    async (e: React.DragEvent) => {
      // Check if dragged outside the tab bar (for detachment)
      if (draggedTab && tabBarRef.current && dragStartPos.current) {
        const rect = tabBarRef.current.getBoundingClientRect()
        const threshold = 50 // pixels outside the tab bar to trigger detachment

        const isOutside =
          e.clientY < rect.top - threshold ||
          e.clientY > rect.bottom + threshold ||
          e.clientX < rect.left - threshold ||
          e.clientX > rect.right + threshold

        if (isOutside && windowState && windowState.tabs.length > 1) {
          // Detach the tab to a new window
          await window.electronAPI.detachTab(draggedTab, e.screenX, e.screenY)
        }
      }

      setDraggedTab(null)
      setDragOverIndex(null)
      dragStartPos.current = null
    },
    [draggedTab, windowState]
  )

  if (!windowState) return null

  return (
    <div className="tab-bar" ref={tabBarRef}>
      <div className="tabs-container">
        {windowState.tabs.map((tab, index) => (
          <Tab
            key={tab.id}
            tab={tab}
            isActive={tab.id === windowState.activeTabId}
            isDragging={tab.id === draggedTab}
            isDragOver={index === dragOverIndex}
            onActivate={() => handleActivateTab(tab.id)}
            onClose={(e) => handleCloseTab(tab.id, e)}
            onDragStart={(e) => handleDragStart(tab.id, e)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
          />
        ))}
      </div>
      <button className="new-tab-btn" onClick={handleNewTab} title="New Tab">
        <svg viewBox="0 0 16 16" fill="none">
          <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <div className="tab-bar-spacer" />
    </div>
  )
}

