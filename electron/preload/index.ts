import { contextBridge, ipcRenderer } from 'electron'

export interface TabInfo {
  id: string
  title: string
  url: string
  isLoading?: boolean
  canGoBack?: boolean
  canGoForward?: boolean
  favicon?: string
}

export interface WindowState {
  id: number
  tabs: TabInfo[]
  activeTabId: string | null
}

export interface AutocompleteSuggestion {
  id: number
  type: 'search' | 'visit' | 'search-action'
  displayText: string
  url: string | null
  favicon: string | null
  visitCount: number
  aiConfidence?: number
  // Search action fields
  searchEngine?: string    // 'orbit' | 'google'
  actionLabel?: string     // 'Search Orbit'
  shortcut?: string        // 'Shift+Enter'
}

export interface SearchHistoryEntry {
  id: number
  type: 'search' | 'visit'
  query: string | null
  url: string | null
  title: string | null
  favicon: string | null
  visitCount: number
  lastVisited: string
  userId: string
}

export interface FiSuggestion {
  id: number
  type: 'fi-suggestion'
  displayText: string
  url: null
  favicon: null
  visitCount: 0
  isFiSuggestion: true
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  // Tab management
  getTabState: () => ipcRenderer.invoke('tabs:getState'),
  createTab: (tab: TabInfo) => ipcRenderer.invoke('tabs:create', tab),
  closeTab: (tabId: string) => ipcRenderer.invoke('tabs:close', tabId),
  activateTab: (tabId: string) => ipcRenderer.invoke('tabs:activate', tabId),
  reorderTabs: (fromIndex: number, toIndex: number) =>
    ipcRenderer.invoke('tabs:reorder', fromIndex, toIndex),
  updateTabTitle: (tabId: string, title: string) =>
    ipcRenderer.invoke('tabs:updateTitle', tabId, title),
  detachTab: (tabId: string, screenX: number, screenY: number) =>
    ipcRenderer.invoke('tabs:detach', tabId, screenX, screenY),
  transferTab: (tabId: string, targetWindowId: number, insertIndex: number) =>
    ipcRenderer.invoke('tabs:transfer', tabId, targetWindowId, insertIndex),

  // Navigation
  navigate: (tabId: string, url: string) => ipcRenderer.invoke('tabs:navigate', tabId, url),
  goBack: (tabId: string) => ipcRenderer.invoke('tabs:goBack', tabId),
  goForward: (tabId: string) => ipcRenderer.invoke('tabs:goForward', tabId),
  reload: (tabId: string) => ipcRenderer.invoke('tabs:reload', tabId),
  stop: (tabId: string) => ipcRenderer.invoke('tabs:stop', tabId),

  // Tab view visibility (for autocomplete dropdown overlay)
  setTabViewVisible: (visible: boolean) => ipcRenderer.invoke('tabs:setViewVisible', visible),

  // UI view mouse event control (for click-through to web content)
  setUIIgnoreMouseEvents: (ignore: boolean) => ipcRenderer.send('ui:setIgnoreMouseEvents', ignore),

  // Tab state updates from main process
  onTabsUpdated: (callback: (state: WindowState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: WindowState) => callback(state)
    ipcRenderer.on('tabs:updated', handler)
    return () => ipcRenderer.removeListener('tabs:updated', handler)
  },

  // Windows
  getAllWindows: () => ipcRenderer.invoke('windows:getAll'),

  // API
  getApiPort: () => ipcRenderer.invoke('api:getPort'),
  isApiReady: () => ipcRenderer.invoke('api:isReady'),

  // Search History
  searchHistory: {
    query: (input: string, limit?: number) =>
      ipcRenderer.invoke('searchHistory:query', input, limit),
    addSearch: (query: string) =>
      ipcRenderer.invoke('searchHistory:addSearch', query),
    addVisit: (url: string, title?: string, favicon?: string) =>
      ipcRenderer.invoke('searchHistory:addVisit', url, title, favicon),
    getRecent: (limit?: number) =>
      ipcRenderer.invoke('searchHistory:getRecent', limit),
    delete: (id: number) =>
      ipcRenderer.invoke('searchHistory:delete', id),
    clear: () =>
      ipcRenderer.invoke('searchHistory:clear')
  },

  // Fi Search Suggestions
  fiSuggestions: {
    get: (query: string) =>
      ipcRenderer.invoke('fiSuggestions:get', query)
  }
})

// Type declarations for the renderer
declare global {
  interface Window {
    electronAPI: {
      minimize: () => void
      maximize: () => void
      close: () => void
      isMaximized: () => Promise<boolean>
      getTabState: () => Promise<WindowState | null>
      createTab: (tab: TabInfo) => Promise<WindowState | null>
      closeTab: (tabId: string) => Promise<WindowState | null>
      activateTab: (tabId: string) => Promise<WindowState | null>
      reorderTabs: (fromIndex: number, toIndex: number) => Promise<WindowState | null>
      updateTabTitle: (tabId: string, title: string) => Promise<WindowState | null>
      detachTab: (
        tabId: string,
        screenX: number,
        screenY: number
      ) => Promise<{ sourceState: WindowState; newWindowId: number } | null>
      transferTab: (
        tabId: string,
        targetWindowId: number,
        insertIndex: number
      ) => Promise<{ sourceState: WindowState; targetState: WindowState } | null>
      navigate: (tabId: string, url: string) => Promise<WindowState | null>
      goBack: (tabId: string) => Promise<boolean>
      goForward: (tabId: string) => Promise<boolean>
      reload: (tabId: string) => Promise<boolean>
      stop: (tabId: string) => Promise<boolean>
      setTabViewVisible: (visible: boolean) => Promise<void>
      setUIIgnoreMouseEvents: (ignore: boolean) => void
      onTabsUpdated: (callback: (state: WindowState) => void) => () => void
      getAllWindows: () => Promise<Array<{ id: number; bounds: { x: number; y: number; width: number; height: number } }>>
      getApiPort: () => Promise<number | null>
      isApiReady: () => Promise<boolean>
      searchHistory: {
        query: (input: string, limit?: number) => Promise<AutocompleteSuggestion[]>
        addSearch: (query: string) => Promise<SearchHistoryEntry | null>
        addVisit: (url: string, title?: string, favicon?: string) => Promise<SearchHistoryEntry | null>
        getRecent: (limit?: number) => Promise<AutocompleteSuggestion[]>
        delete: (id: number) => Promise<boolean>
        clear: () => Promise<boolean>
      }
      fiSuggestions: {
        get: (query: string) => Promise<FiSuggestion[]>
      }
    }
  }
}
