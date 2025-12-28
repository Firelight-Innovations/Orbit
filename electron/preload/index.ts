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

export interface OrbitProfile {
  id: string
  name: string
  color: string
  avatar?: string
  createdAt: string
  lastUsed: string
  isImported: boolean
  chromeProfileName?: string
}

export interface ChromeProfileInfo {
  name: string
  directoryName: string
  email?: string
  avatar?: string
  isDefault: boolean
  path: string
}

export type ImportCategory = 'bookmarks' | 'history' | 'cookies' | 'extensions' | 'passwords' | 'preferences'

export interface BookmarkNode {
  id: string
  name: string
  type: 'folder' | 'url'
  url?: string
  date_added?: string
  date_modified?: string
  children?: BookmarkNode[]
  guid?: string
}

export interface BookmarkCreateData {
  name: string
  url?: string
  type: 'folder' | 'url'
}

export interface BookmarkUpdateData {
  name?: string
  url?: string
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  
  // Window namespace (for better organization)
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  },

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
  },

  // AI Search
  aiSearch: {
    run: (query: string) => ipcRenderer.invoke('aiSearch:run', query)
  },

  // Assistant
  assistant: {
    sendMessage: (
      message: string,
      pageContext?: { url?: string | null; selectedText?: string | null }
    ) =>
      ipcRenderer.invoke('assistant:sendMessage', {
        message,
        pageContext
      }),
    setState: (isOpen: boolean) => ipcRenderer.invoke('assistant:setState', isOpen)
  },

  // Profile Management
  profile: {
    isFirstLaunch: () => ipcRenderer.invoke('profile:isFirstLaunch'),
    isOnboardingComplete: () => ipcRenderer.invoke('profile:isOnboardingComplete'),
    completeOnboarding: () => ipcRenderer.invoke('profile:completeOnboarding'),
    getProfiles: () => ipcRenderer.invoke('profile:getProfiles'),
    getActiveProfile: () => ipcRenderer.invoke('profile:getActiveProfile'),
    getActiveProfileId: () => ipcRenderer.invoke('profile:getActiveProfileId'),
    createProfile: (name: string, color?: string, avatar?: string) =>
      ipcRenderer.invoke('profile:createProfile', name, color, avatar),
    updateProfile: (profileId: string, updates: Partial<OrbitProfile>) =>
      ipcRenderer.invoke('profile:updateProfile', profileId, updates),
    deleteProfile: (profileId: string) =>
      ipcRenderer.invoke('profile:deleteProfile', profileId),
    setActiveProfile: (profileId: string) =>
      ipcRenderer.invoke('profile:setActiveProfile', profileId),
    getProfileColors: () => ipcRenderer.invoke('profile:getProfileColors'),
    resetFirstLaunch: () => ipcRenderer.invoke('profile:resetFirstLaunch'),
    
    // Profile change events
    onProfileChanged: (callback: (profile: OrbitProfile | null) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, profile: OrbitProfile | null) => callback(profile)
      ipcRenderer.on('profile:changed', handler)
      return () => ipcRenderer.removeListener('profile:changed', handler)
    },
    onProfilesUpdated: (callback: (profiles: OrbitProfile[]) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, profiles: OrbitProfile[]) => callback(profiles)
      ipcRenderer.on('profiles:updated', handler)
      return () => ipcRenderer.removeListener('profiles:updated', handler)
    }
  },

  // Chrome Import
  chrome: {
    isInstalled: () => ipcRenderer.invoke('chrome:isInstalled'),
    detectProfiles: () => ipcRenderer.invoke('chrome:detectProfiles'),
    getProfileSummary: (profilePath: string) =>
      ipcRenderer.invoke('chrome:getProfileSummary', profilePath),
    importProfile: (chromeProfilePath: string, newProfileName: string, categories?: ImportCategory[]) =>
      ipcRenderer.invoke('chrome:importProfile', chromeProfilePath, newProfileName, categories),
    isRunning: () => ipcRenderer.invoke('chrome:isRunning')
  },

  // Bookmarks
  bookmarks: {
    getBookmarksBar: () =>
      ipcRenderer.invoke('bookmarks:getBar'),
    getAllRoots: () =>
      ipcRenderer.invoke('bookmarks:getAllRoots'),
    createBookmark: (parentId: string, data: BookmarkCreateData, index?: number) =>
      ipcRenderer.invoke('bookmarks:create', parentId, data, index),
    updateBookmark: (id: string, updates: BookmarkUpdateData) =>
      ipcRenderer.invoke('bookmarks:update', id, updates),
    deleteBookmark: (id: string) =>
      ipcRenderer.invoke('bookmarks:delete', id),
    moveBookmark: (id: string, newParentId: string, newIndex: number) =>
      ipcRenderer.invoke('bookmarks:move', id, newParentId, newIndex),
    searchBookmarks: (query: string, maxResults?: number) =>
      ipcRenderer.invoke('bookmarks:search', query, maxResults),
    onBookmarksChanged: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('bookmarks:changed', handler)
      return () => ipcRenderer.removeListener('bookmarks:changed', handler)
    }
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
      window: {
        minimize: () => void
        maximize: () => void
        close: () => void
        isMaximized: () => Promise<boolean>
      }
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
      aiSearch: {
        run: (query: string) => Promise<{
          query: string
          aiOverview: { content: string; sources: Array<{ title: string; url: string }> } | null
          results: Array<{
            title: string
            snippet: string
            url: string
            source: 'google' | 'bing' | 'duckduckgo'
            rank: number
            faviconUrl: string | null
            positionInSource: number
          }>
          cached: boolean
          timestamp: number
          error?: string
        }>
      }
      assistant: {
        sendMessage: (
          message: string,
          pageContext?: { url?: string | null; selectedText?: string | null }
        ) => Promise<{
          response?: string
          took_ms?: number
          error?: string
        }>
      }
      profile: {
        isFirstLaunch: () => Promise<boolean>
        isOnboardingComplete: () => Promise<boolean>
        completeOnboarding: () => Promise<boolean>
        getProfiles: () => Promise<OrbitProfile[]>
        getActiveProfile: () => Promise<OrbitProfile | null>
        getActiveProfileId: () => Promise<string | null>
        createProfile: (name: string, color?: string, avatar?: string) => Promise<OrbitProfile>
        updateProfile: (profileId: string, updates: Partial<OrbitProfile>) => Promise<OrbitProfile | null>
        deleteProfile: (profileId: string) => Promise<boolean>
        setActiveProfile: (profileId: string) => Promise<boolean>
        getProfileColors: () => Promise<string[]>
        resetFirstLaunch: () => Promise<boolean>
      }
      chrome: {
        isInstalled: () => Promise<boolean>
        detectProfiles: () => Promise<ChromeProfileInfo[]>
        getProfileSummary: (profilePath: string) => Promise<Record<ImportCategory, boolean> | null>
        importProfile: (chromeProfilePath: string, newProfileName: string, categories?: ImportCategory[]) => Promise<{ success: boolean; profileId?: string; error?: string }>
        isRunning: () => Promise<boolean>
      }
      bookmarks: {
        getBookmarksBar: () => Promise<BookmarkNode | null>
        getAllRoots: () => Promise<{ bookmark_bar: BookmarkNode; other: BookmarkNode; synced: BookmarkNode } | null>
        createBookmark: (parentId: string, data: BookmarkCreateData, index?: number) => Promise<BookmarkNode | null>
        updateBookmark: (id: string, updates: BookmarkUpdateData) => Promise<boolean>
        deleteBookmark: (id: string) => Promise<boolean>
        moveBookmark: (id: string, newParentId: string, newIndex: number) => Promise<boolean>
        searchBookmarks: (query: string, maxResults?: number) => Promise<BookmarkNode[]>
        onBookmarksChanged: (callback: () => void) => () => void
      }
    }
  }
}
