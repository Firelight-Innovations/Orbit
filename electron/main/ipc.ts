import { ipcMain, BrowserWindow } from 'electron'
import type { TabInfo, WindowState } from './index'
import type { PythonBackend } from './python'

export function setupIpcHandlers(
  windowStates: Map<number, WindowState>,
  createWindowWithTabs: (tabs: TabInfo[]) => BrowserWindow,
  pythonBackend: PythonBackend | null
): void {
  // Window control handlers
  ipcMain.on('window:minimize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    window?.minimize()
  })

  ipcMain.on('window:maximize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window?.isMaximized()) {
      window.unmaximize()
    } else {
      window?.maximize()
    }
  })

  ipcMain.on('window:close', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    window?.close()
  })

  ipcMain.handle('window:isMaximized', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    return window?.isMaximized() ?? false
  })

  // Tab management handlers
  ipcMain.handle('tabs:getState', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return null
    return windowStates.get(window.id) ?? null
  })

  ipcMain.handle('tabs:create', (event, tab: TabInfo) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return null

    const state = windowStates.get(window.id)
    if (state) {
      state.tabs.push(tab)
      state.activeTabId = tab.id
      broadcastTabUpdate(window.id, state)
    }
    return state
  })

  ipcMain.handle('tabs:close', (event, tabId: string) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return null

    const state = windowStates.get(window.id)
    if (state) {
      const tabIndex = state.tabs.findIndex((t) => t.id === tabId)
      if (tabIndex !== -1) {
        state.tabs.splice(tabIndex, 1)

        // If we closed the active tab, activate an adjacent one
        if (state.activeTabId === tabId) {
          const newIndex = Math.min(tabIndex, state.tabs.length - 1)
          state.activeTabId = state.tabs[newIndex]?.id ?? null
        }

        // If no tabs left, close the window
        if (state.tabs.length === 0) {
          window.close()
          return null
        }

        broadcastTabUpdate(window.id, state)
      }
    }
    return state
  })

  ipcMain.handle('tabs:activate', (event, tabId: string) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return null

    const state = windowStates.get(window.id)
    if (state) {
      state.activeTabId = tabId
      broadcastTabUpdate(window.id, state)
    }
    return state
  })

  ipcMain.handle('tabs:reorder', (event, fromIndex: number, toIndex: number) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return null

    const state = windowStates.get(window.id)
    if (state && fromIndex >= 0 && fromIndex < state.tabs.length) {
      const [tab] = state.tabs.splice(fromIndex, 1)
      state.tabs.splice(toIndex, 0, tab)
      broadcastTabUpdate(window.id, state)
    }
    return state
  })

  ipcMain.handle('tabs:updateTitle', (event, tabId: string, title: string) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return null

    const state = windowStates.get(window.id)
    if (state) {
      const tab = state.tabs.find((t) => t.id === tabId)
      if (tab) {
        tab.title = title
        broadcastTabUpdate(window.id, state)
      }
    }
    return state
  })

  // Tab detachment - create new window with the detached tab
  ipcMain.handle('tabs:detach', (event, tabId: string, screenX: number, screenY: number) => {
    const sourceWindow = BrowserWindow.fromWebContents(event.sender)
    if (!sourceWindow) return null

    const state = windowStates.get(sourceWindow.id)
    if (!state || state.tabs.length <= 1) return null // Don't detach if it's the only tab

    const tabIndex = state.tabs.findIndex((t) => t.id === tabId)
    if (tabIndex === -1) return null

    // Remove tab from source window
    const [detachedTab] = state.tabs.splice(tabIndex, 1)

    // Update active tab in source window
    if (state.activeTabId === tabId) {
      const newIndex = Math.min(tabIndex, state.tabs.length - 1)
      state.activeTabId = state.tabs[newIndex]?.id ?? null
    }

    broadcastTabUpdate(sourceWindow.id, state)

    // Create new window with the detached tab
    const newWindow = createWindowWithTabs([detachedTab])
    newWindow.setPosition(Math.round(screenX - 100), Math.round(screenY - 20))

    return { sourceState: state, newWindowId: newWindow.id }
  })

  // Transfer tab to another window
  ipcMain.handle(
    'tabs:transfer',
    (event, tabId: string, targetWindowId: number, insertIndex: number) => {
      const sourceWindow = BrowserWindow.fromWebContents(event.sender)
      if (!sourceWindow) return null

      const sourceState = windowStates.get(sourceWindow.id)
      const targetState = windowStates.get(targetWindowId)
      if (!sourceState || !targetState) return null

      const tabIndex = sourceState.tabs.findIndex((t) => t.id === tabId)
      if (tabIndex === -1) return null

      // Remove from source
      const [tab] = sourceState.tabs.splice(tabIndex, 1)

      // Add to target
      targetState.tabs.splice(insertIndex, 0, tab)
      targetState.activeTabId = tab.id

      // Update source active tab
      if (sourceState.activeTabId === tabId) {
        const newIndex = Math.min(tabIndex, sourceState.tabs.length - 1)
        sourceState.activeTabId = sourceState.tabs[newIndex]?.id ?? null
      }

      // Close source window if no tabs left
      if (sourceState.tabs.length === 0) {
        sourceWindow.close()
      } else {
        broadcastTabUpdate(sourceWindow.id, sourceState)
      }

      broadcastTabUpdate(targetWindowId, targetState)

      return { sourceState, targetState }
    }
  )

  // Python backend API
  ipcMain.handle('api:getPort', () => {
    return pythonBackend?.getPort() ?? null
  })

  ipcMain.handle('api:isReady', () => {
    return pythonBackend?.isReady() ?? false
  })
}

function broadcastTabUpdate(windowId: number, state: WindowState): void {
  const window = BrowserWindow.fromId(windowId)
  if (window) {
    window.webContents.send('tabs:updated', state)
  }
}

