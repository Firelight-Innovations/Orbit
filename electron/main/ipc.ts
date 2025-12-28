import { ipcMain, BrowserWindow } from 'electron'
import type { TabInfo, WindowState } from './index'
import type { PythonBackend } from './python'
import {
  tabViews,
  createTabView,
  destroyTabView,
  showTabView,
  hideAllTabViews,
  isInternalUrl,
  normalizeUrl,
  broadcastTabUpdate,
  setUIViewFullscreen
} from './index'
import { getSearchHistoryService } from './services/searchHistory'
import { getSearchSuggestionsService } from './services/searchSuggestions'
import * as profileService from './services/profileService'
import * as chromeImporter from './services/chromeImporter'
import { getBookmarksService } from './services/bookmarksService'
import type { BookmarkCreateData, BookmarkUpdateData } from './services/bookmarksService'

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

  // UI view size control - for click-through to web content
  // When web content has attention, shrink UI view to header only so clicks reach tab view
  ipcMain.on('ui:setIgnoreMouseEvents', (event, ignore: boolean) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return

    // When ignore=true, shrink UI to header only (web content gets clicks)
    // When ignore=false, expand UI to full window (UI captures all clicks)
    setUIViewFullscreen(window, !ignore)
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
      // Initialize default tab properties
      const newTab: TabInfo = {
        ...tab,
        isLoading: false,
        canGoBack: false,
        canGoForward: false
      }
      state.tabs.push(newTab)
      state.activeTabId = newTab.id

      // If it's an external URL, create a WebContentsView for it
      if (!isInternalUrl(newTab.url)) {
        createTabView(window, newTab.id, newTab.url)
        showTabView(window, newTab.id)
      } else {
        // Hide all tab views when showing internal page
        hideAllTabViews(window)
      }

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
        // Destroy the WebContentsView if it exists
        destroyTabView(tabId)

        state.tabs.splice(tabIndex, 1)

        // If we closed the active tab, activate an adjacent one
        if (state.activeTabId === tabId) {
          const newIndex = Math.min(tabIndex, state.tabs.length - 1)
          state.activeTabId = state.tabs[newIndex]?.id ?? null

          // Show the new active tab's view if it exists
          if (state.activeTabId) {
            const newActiveTab = state.tabs[newIndex]
            if (newActiveTab && !isInternalUrl(newActiveTab.url)) {
              showTabView(window, state.activeTabId)
            } else {
              hideAllTabViews(window)
            }
          }
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

      // Show/hide appropriate views
      const activeTab = state.tabs.find((t) => t.id === tabId)
      if (activeTab && !isInternalUrl(activeTab.url)) {
        showTabView(window, tabId)
      } else {
        hideAllTabViews(window)
      }

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

    // Destroy the view in the source window (it will be recreated in new window)
    destroyTabView(tabId)

    // Remove tab from source window
    const [detachedTab] = state.tabs.splice(tabIndex, 1)

    // Update active tab in source window
    if (state.activeTabId === tabId) {
      const newIndex = Math.min(tabIndex, state.tabs.length - 1)
      state.activeTabId = state.tabs[newIndex]?.id ?? null

      // Show the new active tab's view
      if (state.activeTabId) {
        const newActiveTab = state.tabs[newIndex]
        if (newActiveTab && !isInternalUrl(newActiveTab.url)) {
          showTabView(sourceWindow, state.activeTabId)
        } else {
          hideAllTabViews(sourceWindow)
        }
      }
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
      const sourceWindow = findWindowFromWebContents(event.sender.id)
      if (!sourceWindow) return null

      const sourceState = windowStates.get(sourceWindow.id)
      const targetState = windowStates.get(targetWindowId)
      if (!sourceState || !targetState) return null

      const tabIndex = sourceState.tabs.findIndex((t) => t.id === tabId)
      if (tabIndex === -1) return null

      // Destroy the view in the source window
      destroyTabView(tabId)

      // Remove from source
      const [tab] = sourceState.tabs.splice(tabIndex, 1)

      // Add to target (if insertIndex is -1, append to end)
      const actualInsertIndex = insertIndex < 0 ? targetState.tabs.length : insertIndex
      targetState.tabs.splice(actualInsertIndex, 0, tab)
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

      // Create view in target window if needed
      const targetWindow = BrowserWindow.fromId(targetWindowId)
      if (targetWindow) {
        if (!isInternalUrl(tab.url)) {
          createTabView(targetWindow, tab.id, tab.url)
          showTabView(targetWindow, tab.id)
        } else {
          hideAllTabViews(targetWindow)
        }
        // Focus the target window
        targetWindow.focus()
      }

      broadcastTabUpdate(targetWindowId, targetState)

      return { sourceState, targetState }
    }
  )

  // Navigation handlers
  ipcMain.handle('tabs:navigate', (event, tabId: string, url: string) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return null

    const state = windowStates.get(window.id)
    if (!state) return null

    const tab = state.tabs.find((t) => t.id === tabId)
    if (!tab) return null

    const normalizedUrl = normalizeUrl(url)
    tab.url = normalizedUrl

    if (isInternalUrl(normalizedUrl)) {
      // Navigating to internal page - destroy view if exists and hide all
      destroyTabView(tabId)
      hideAllTabViews(window)
    } else {
      // Navigating to external URL
      let view = tabViews.get(tabId)
      if (!view) {
        // Create new view for this tab
        view = createTabView(window, tabId, normalizedUrl)
      } else {
        // Load URL in existing view
        view.webContents.loadURL(normalizedUrl)
      }
      showTabView(window, tabId)
    }

    broadcastTabUpdate(window.id, state)
    return state
  })

  ipcMain.handle('tabs:goBack', (event, tabId: string) => {
    const view = tabViews.get(tabId)
    if (view && view.webContents.canGoBack()) {
      view.webContents.goBack()
      return true
    }
    return false
  })

  ipcMain.handle('tabs:goForward', (event, tabId: string) => {
    const view = tabViews.get(tabId)
    if (view && view.webContents.canGoForward()) {
      view.webContents.goForward()
      return true
    }
    return false
  })

  ipcMain.handle('tabs:reload', (event, tabId: string) => {
    const view = tabViews.get(tabId)
    if (view) {
      view.webContents.reload()
      return true
    }
    return false
  })

  ipcMain.handle('tabs:stop', (event, tabId: string) => {
    const view = tabViews.get(tabId)
    if (view) {
      view.webContents.stop()
      return true
    }
    return false
  })

  // Control tab view visibility (used when autocomplete dropdown is open)
  ipcMain.handle('tabs:setViewVisible', (event, visible: boolean) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return

    const state = windowStates.get(window.id)
    if (!state?.activeTabId) return

    const activeTab = state.tabs.find(t => t.id === state.activeTabId)
    if (activeTab && !isInternalUrl(activeTab.url)) {
      if (visible) {
        showTabView(window, state.activeTabId)
      } else {
        hideAllTabViews(window)
      }
    }
  })

  // Get all windows with their bounds (for tab recombination)
  ipcMain.handle('windows:getAll', (event) => {
    const currentWindow = BrowserWindow.fromWebContents(event.sender)
    const currentWindowId = currentWindow?.id
    
    const allWindows = BrowserWindow.getAllWindows()
    return allWindows
      .filter(win => win.id !== currentWindowId) // Exclude current window
      .map(win => ({
        id: win.id,
        bounds: win.getBounds()
      }))
  })

  // Python backend API
  ipcMain.handle('api:getPort', () => {
    return pythonBackend?.getPort() ?? null
  })

  ipcMain.handle('api:isReady', () => {
    return pythonBackend?.isReady() ?? false
  })

  // Search History handlers
  ipcMain.handle('searchHistory:query', async (_event, input: string, limit?: number) => {
    try {
      const service = getSearchHistoryService()
      return await service.querySuggestions(input, limit ?? 8)
    } catch (error) {
      console.error('Error querying search history:', error)
      return []
    }
  })

  ipcMain.handle('searchHistory:addSearch', (_event, query: string) => {
    try {
      const service = getSearchHistoryService()
      return service.addSearchEntry(query)
    } catch (error) {
      console.error('Error adding search entry:', error)
      return null
    }
  })

  ipcMain.handle('searchHistory:addVisit', (_event, url: string, title?: string, favicon?: string) => {
    try {
      const service = getSearchHistoryService()
      return service.addVisitEntry(url, title, favicon)
    } catch (error) {
      console.error('Error adding visit entry:', error)
      return null
    }
  })

  ipcMain.handle('searchHistory:getRecent', (_event, limit?: number) => {
    try {
      const service = getSearchHistoryService()
      return service.getRecentSuggestions(limit ?? 8)
    } catch (error) {
      console.error('Error getting recent suggestions:', error)
      return []
    }
  })

  ipcMain.handle('searchHistory:delete', (_event, id: number) => {
    try {
      const service = getSearchHistoryService()
      return service.deleteEntry(id)
    } catch (error) {
      console.error('Error deleting search history entry:', error)
      return false
    }
  })

  ipcMain.handle('searchHistory:clear', () => {
    try {
      const service = getSearchHistoryService()
      service.clearHistory()
      return true
    } catch (error) {
      console.error('Error clearing search history:', error)
      return false
    }
  })

  // Fi Suggestions handlers
  ipcMain.handle('fiSuggestions:get', async (_event, query: string) => {
    try {
      const service = getSearchSuggestionsService()
      return await service.getSuggestions(query)
    } catch (error) {
      console.error('Error fetching Fi suggestions:', error)
      return []
    }
  })

  // Profile Management handlers
  ipcMain.handle('profile:isFirstLaunch', () => {
    return profileService.isFirstLaunch()
  })

  ipcMain.handle('profile:isOnboardingComplete', () => {
    return profileService.isOnboardingComplete()
  })

  ipcMain.handle('profile:completeOnboarding', () => {
    profileService.completeOnboarding()
    return true
  })

  ipcMain.handle('profile:getProfiles', () => {
    return profileService.getProfiles()
  })

  ipcMain.handle('profile:getActiveProfile', () => {
    return profileService.getActiveProfile()
  })

  ipcMain.handle('profile:getActiveProfileId', () => {
    return profileService.getActiveProfileId()
  })

  ipcMain.handle('profile:createProfile', (event, name: string, color?: string, avatar?: string) => {
    const profile = profileService.createProfile(
      name,
      (color as profileService.ProfileColor) || profileService.PROFILE_COLORS[0],
      avatar
    )
    
    // Broadcast profile list update to all windows
    const allProfiles = profileService.getProfiles()
    BrowserWindow.getAllWindows().forEach(window => {
      window.webContents.send('profiles:updated', allProfiles)
    })
    
    return profile
  })

  ipcMain.handle('profile:updateProfile', (event, profileId: string, updates: Partial<profileService.OrbitProfile>) => {
    const result = profileService.updateProfile(profileId, updates)
    
    // Broadcast profile list update to all windows
    const allProfiles = profileService.getProfiles()
    BrowserWindow.getAllWindows().forEach(window => {
      window.webContents.send('profiles:updated', allProfiles)
    })
    
    // If this is the active profile, also broadcast active profile change
    const activeProfileId = profileService.getActiveProfileId()
    if (activeProfileId === profileId) {
      const activeProfile = profileService.getActiveProfile()
      BrowserWindow.getAllWindows().forEach(window => {
        window.webContents.send('profile:changed', activeProfile)
      })
    }
    
    return result
  })

  ipcMain.handle('profile:deleteProfile', (event, profileId: string) => {
    const result = profileService.deleteProfile(profileId)
    
    // Broadcast profile list update to all windows
    if (result) {
      const allProfiles = profileService.getProfiles()
      BrowserWindow.getAllWindows().forEach(window => {
        window.webContents.send('profiles:updated', allProfiles)
      })
    }
    
    return result
  })

  ipcMain.handle('profile:setActiveProfile', (event, profileId: string) => {
    const result = profileService.setActiveProfile(profileId)
    
    // Broadcast profile change to all windows
    if (result) {
      const activeProfile = profileService.getActiveProfile()
      BrowserWindow.getAllWindows().forEach(window => {
        window.webContents.send('profile:changed', activeProfile)
      })
    }
    
    return result
  })

  ipcMain.handle('profile:getProfileColors', () => {
    return profileService.PROFILE_COLORS
  })

  // Chrome Import handlers
  ipcMain.handle('chrome:isInstalled', () => {
    return chromeImporter.isChromeInstalled()
  })

  ipcMain.handle('chrome:detectProfiles', () => {
    return chromeImporter.detectChromeProfiles()
  })

  ipcMain.handle('chrome:getProfileSummary', (_event, profilePath: string) => {
    const profiles = chromeImporter.detectChromeProfiles()
    const profile = profiles.find(p => p.path === profilePath)
    if (!profile) return null
    return chromeImporter.getProfileDataSummary(profile)
  })

  ipcMain.handle('chrome:importProfile', async (event, chromeProfilePath: string, newProfileName: string, categories?: string[]) => {
    const profiles = chromeImporter.detectChromeProfiles()
    const chromeProfile = profiles.find(p => p.path === chromeProfilePath)
    
    if (!chromeProfile) {
      return { success: false, error: 'Chrome profile not found' }
    }

    const importCategories = categories as chromeImporter.ImportCategory[] | undefined

    // Note: Progress callback would need WebSocket or similar for real-time updates
    // For now, we'll do the import synchronously
    const result = await chromeImporter.importChromeProfile(
      chromeProfile,
      newProfileName,
      importCategories
    )
    
    // Broadcast profile list update to all windows after successful import
    if (result.success) {
      const allProfiles = profileService.getProfiles()
      BrowserWindow.getAllWindows().forEach(window => {
        window.webContents.send('profiles:updated', allProfiles)
      })
    }
    
    return result
  })

  ipcMain.handle('chrome:isRunning', () => {
    return chromeImporter.isChromeRunning()
  })

  // Bookmarks handlers
  ipcMain.handle('bookmarks:getBar', () => {
    try {
      const bookmarksService = getBookmarksService()
      return bookmarksService.getBookmarksBar()
    } catch (error) {
      console.error('Error getting bookmarks bar:', error)
      return null
    }
  })

  ipcMain.handle('bookmarks:getAllRoots', () => {
    try {
      const bookmarksService = getBookmarksService()
      return bookmarksService.getAllRoots()
    } catch (error) {
      console.error('Error getting all roots:', error)
      return null
    }
  })

  ipcMain.handle('bookmarks:create', (_event, parentId: string, data: BookmarkCreateData, index?: number) => {
    try {
      const bookmarksService = getBookmarksService()
      return bookmarksService.createBookmark(parentId, data, index)
    } catch (error) {
      console.error('Error creating bookmark:', error)
      return null
    }
  })

  ipcMain.handle('bookmarks:update', (_event, id: string, updates: BookmarkUpdateData) => {
    try {
      const bookmarksService = getBookmarksService()
      return bookmarksService.updateBookmark(id, updates)
    } catch (error) {
      console.error('Error updating bookmark:', error)
      return false
    }
  })

  ipcMain.handle('bookmarks:delete', (_event, id: string) => {
    try {
      const bookmarksService = getBookmarksService()
      return bookmarksService.deleteBookmark(id)
    } catch (error) {
      console.error('Error deleting bookmark:', error)
      return false
    }
  })

  ipcMain.handle('bookmarks:move', (_event, id: string, newParentId: string, newIndex: number) => {
    try {
      const bookmarksService = getBookmarksService()
      return bookmarksService.moveBookmark(id, newParentId, newIndex)
    } catch (error) {
      console.error('Error moving bookmark:', error)
      return false
    }
  })

  ipcMain.handle('bookmarks:search', (_event, query: string, maxResults?: number) => {
    try {
      const bookmarksService = getBookmarksService()
      return bookmarksService.searchBookmarks(query, maxResults)
    } catch (error) {
      console.error('Error searching bookmarks:', error)
      return []
    }
  })

  // Setup bookmarks change listener - only once
  try {
    const bookmarksService = getBookmarksService()
    
    // Remove any existing listeners to avoid duplicates
    bookmarksService.removeAllListeners('changed')
    
    // Add the broadcast listener
    bookmarksService.on('changed', () => {
      console.log('Bookmarks changed, broadcasting to all windows...')
      // Broadcast to all windows
      BrowserWindow.getAllWindows().forEach(window => {
        try {
          if (!window.isDestroyed()) {
            window.webContents.send('bookmarks:changed')
          }
        } catch (error) {
          console.error('Error sending bookmarks:changed to window:', error)
        }
      })
    })
  } catch (error) {
    console.error('Error setting up bookmarks change listener:', error)
  }

  // Development/testing helpers
  ipcMain.handle('profile:resetFirstLaunch', () => {
    profileService.resetFirstLaunch()
    return true
  })
}
