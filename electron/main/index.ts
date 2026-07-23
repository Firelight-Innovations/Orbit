import { app, BrowserWindow, WebContentsView, ipcMain, screen } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { setupIpcHandlers } from './ipc'
import { PythonBackend } from './python'
import { closeSearchHistoryService, getSearchHistoryService } from './services/searchHistory'
import { closeSearchSuggestionsService } from './services/searchSuggestions'
import { closeAISearchService } from './services/aiSearchService'
// Enable remote debugging on a fixed port so Playwright can attach
// Note: Port 9222 is freed by scripts/free-port.js before Electron starts
app.commandLine.appendSwitch('remote-debugging-port', '9222')

// Disable Electron's prewarmed "spare" renderer so it can't surface as an
// extra empty-URL CDP page target. (Note: the main hang was the window's own
// root webContents having no document — fixed by loading a blank doc into it
// in createWindow. This switch just keeps stray spare renderers from adding
// more unresponsive targets for Playwright's connect_over_cdp() to attach to.)
app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess')

// Get the app icon path
const iconPath = join(__dirname, '../../resources/orbit_logo.png')

// Store for managing windows and their tabs
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
  isAssistantOpen?: boolean
}

// Height of title bar + navigation bar + bookmarks bar in pixels
const HEADER_HEIGHT = 112
// Width of assistant sidebar when open
const ASSISTANT_WIDTH = 420

const windowStates = new Map<number, WindowState>()
// Map of tabId -> WebContentsView for each browser tab
const tabViews = new Map<string, WebContentsView>()
// Map of windowId -> Set of tabIds that belong to that window
const windowTabViews = new Map<number, Set<string>>()
// Map of windowId -> UI WebContentsView (the React app)
const uiViews = new Map<number, WebContentsView>()
// Map of windowId -> sidebar WebContentsView (the assistant, its own renderer)
const sidebarViews = new Map<number, WebContentsView>()
let pythonBackend: PythonBackend | null = null
let debuggingPort: number | null = 9222

// Helper to check if URL is internal (orbit://) or external (http/https)
function isInternalUrl(url: string): boolean {
  return url.startsWith('orbit://')
}

// Normalize URL - add https:// if no protocol specified
function normalizeUrl(url: string): string {
  if (url.startsWith('orbit://')) return url
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  if (url.startsWith('file://')) return url
  // Assume https for URLs without protocol
  return `https://${url}`
}

// Update bounds of the UI view (covers full window, always on top)
function updateUIViewBounds(window: BrowserWindow, uiView: WebContentsView): void {
  const bounds = window.getContentBounds()
  uiView.setBounds({
    x: 0,
    y: 0,
    width: bounds.width,
    height: bounds.height
  })
}

// Update bounds of a tab view to fill the content area below the header
function updateTabViewBounds(window: BrowserWindow, view: WebContentsView): void {
  const bounds = window.getContentBounds()
  const state = windowStates.get(window.id)
  const isAssistantOpen = state?.isAssistantOpen ?? false
  const contentWidth = isAssistantOpen ? bounds.width - ASSISTANT_WIDTH : bounds.width
  
  view.setBounds({
    x: 0,
    y: HEADER_HEIGHT,
    width: contentWidth,
    height: bounds.height - HEADER_HEIGHT
  })
}

// Toggle UI view between fullscreen (covers whole window) and header-only mode
// When header-only, clicks in content area go directly to the tab view below
function setUIViewFullscreen(window: BrowserWindow, fullscreen: boolean): void {
  const uiView = uiViews.get(window.id)
  if (!uiView) return

  const bounds = window.getContentBounds()
  if (fullscreen) {
    // UI covers full window - captures all clicks
    uiView.setBounds({
      x: 0,
      y: 0,
      width: bounds.width,
      height: bounds.height
    })
  } else {
    // UI covers only header - clicks in content area go to tab view
    uiView.setBounds({
      x: 0,
      y: 0,
      width: bounds.width,
      height: HEADER_HEIGHT
    })
  }
}

// Reorder views so UI is always on top
function bringUIToFront(window: BrowserWindow): void {
  const uiView = uiViews.get(window.id)
  if (uiView) {
    // Remove and re-add UI view to bring it to front
    window.contentView.removeChildView(uiView)
    window.contentView.addChildView(uiView)
  }
  // Keep the sidebar view above the UI view so it stays interactive
  const sidebarView = sidebarViews.get(window.id)
  if (sidebarView) {
    window.contentView.removeChildView(sidebarView)
    window.contentView.addChildView(sidebarView)
  }
}

// Position the sidebar view in the right column below the header
function updateSidebarViewBounds(window: BrowserWindow): void {
  const sidebarView = sidebarViews.get(window.id)
  if (!sidebarView) return

  const bounds = window.getContentBounds()
  sidebarView.setBounds({
    x: bounds.width - ASSISTANT_WIDTH,
    y: HEADER_HEIGHT,
    width: ASSISTANT_WIDTH,
    height: bounds.height - HEADER_HEIGHT
  })
}

// Focus the active tab's web content (returns keyboard/scroll to the page)
function focusActiveTab(window: BrowserWindow): void {
  const state = windowStates.get(window.id)
  if (!state?.activeTabId) return
  const view = tabViews.get(state.activeTabId)
  view?.webContents.focus()
}

// Focus the sidebar view (so its input is immediately typable)
function focusSidebar(window: BrowserWindow): void {
  const sidebarView = sidebarViews.get(window.id)
  sidebarView?.webContents.focus()
}

// Send page context to a window's sidebar view (main -> sidebar renderer)
function sendAssistantContext(
  windowId: number,
  context: { url?: string | null; selectedText?: string | null }
): void {
  const sidebarView = sidebarViews.get(windowId)
  if (sidebarView && !sidebarView.webContents.isDestroyed()) {
    sidebarView.webContents.send('assistant:context', context)
  }
}

// Notify both renderers that the assistant open-state changed, so each store
// stays in sync no matter which view triggered the toggle.
function broadcastAssistantOpen(windowId: number, isOpen: boolean): void {
  const uiView = uiViews.get(windowId)
  if (uiView && !uiView.webContents.isDestroyed()) {
    uiView.webContents.send('assistant:openChanged', isOpen)
  }
  const sidebarView = sidebarViews.get(windowId)
  if (sidebarView && !sidebarView.webContents.isDestroyed()) {
    sidebarView.webContents.send('assistant:openChanged', isOpen)
  }
}

// Create a WebContentsView for a tab
function createTabView(window: BrowserWindow, tabId: string, url: string): WebContentsView {
  const view = new WebContentsView({
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Store the view
  tabViews.set(tabId, view)

  // Track which window owns this tab
  if (!windowTabViews.has(window.id)) {
    windowTabViews.set(window.id, new Set())
  }
  windowTabViews.get(window.id)!.add(tabId)

  // Add view to window (will be below UI view)
  window.contentView.addChildView(view)
  
  // Bring UI back to front after adding tab view
  bringUIToFront(window)

  // Set initial bounds
  updateTabViewBounds(window, view)

  // Load the URL
  view.webContents.loadURL(normalizeUrl(url))

  // Setup event listeners for this view
  setupViewEventListeners(window, tabId, view)

  return view
}

// Show a specific tab's view, hide others
function showTabView(window: BrowserWindow, activeTabId: string): void {
  const windowTabs = windowTabViews.get(window.id)
  if (!windowTabs) return

  for (const tabId of windowTabs) {
    const view = tabViews.get(tabId)
    if (view) {
      if (tabId === activeTabId) {
        view.setVisible(true)
        updateTabViewBounds(window, view)
      } else {
        view.setVisible(false)
      }
    }
  }
}

// Hide all tab views for a window (used when showing internal pages)
function hideAllTabViews(window: BrowserWindow): void {
  const windowTabs = windowTabViews.get(window.id)
  if (!windowTabs) return

  for (const tabId of windowTabs) {
    const view = tabViews.get(tabId)
    if (view) {
      view.setVisible(false)
    }
  }
}

// Destroy a tab's view
function destroyTabView(tabId: string): void {
  const view = tabViews.get(tabId)
  if (view) {
    // Find the window that owns this view and remove it
    for (const [windowId, tabs] of windowTabViews) {
      if (tabs.has(tabId)) {
        const window = BrowserWindow.fromId(windowId)
        if (window) {
          window.contentView.removeChildView(view)
        }
        tabs.delete(tabId)
        break
      }
    }
    tabViews.delete(tabId)
  }
}

// Try to get default favicon from site root
async function tryFetchDefaultFavicon(url: string): Promise<string | null> {
  try {
    const urlObj = new URL(url)
    const faviconUrl = `${urlObj.protocol}//${urlObj.host}/favicon.ico`
    
    // Check if the favicon exists by making a HEAD request
    const response = await fetch(faviconUrl, { method: 'HEAD' })
    if (response.ok) {
      const contentType = response.headers.get('content-type')
      // Verify it's actually an image
      if (contentType && contentType.startsWith('image/')) {
        return faviconUrl
      }
    }
  } catch {
    // Silently fail - favicon not available
  }
  return null
}

// Custom scrollbar CSS to inject into external pages
const ORBIT_SCROLLBAR_CSS = `
::-webkit-scrollbar {
  width: 15px;
  height: 15px;
}

::-webkit-scrollbar-track {
  background: rgba(17, 17, 19, 0.6);
  border-left: 1px solid rgba(39, 39, 42, 0.4);
}

::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #52525b 0%, #3f3f46 100%);
  border-radius: 6px;
  border: 2px solid transparent;
  background-clip: padding-box;
}

::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, #8b5cf6 0%, #7c3aed 100%);
  border: 2px solid transparent;
  background-clip: padding-box;
  box-shadow: 0 0 12px rgba(139, 92, 246, 0.5);
}

::-webkit-scrollbar-thumb:active {
  background: linear-gradient(180deg, #a78bfa 0%, #8b5cf6 100%);
  border: 2px solid transparent;
  background-clip: padding-box;
}

::-webkit-scrollbar-corner {
  background: rgba(17, 17, 19, 0.6);
}
`

// Setup event listeners for a WebContentsView
function setupViewEventListeners(window: BrowserWindow, tabId: string, view: WebContentsView): void {
  const webContents = view.webContents
  let faviconReceived = false

  // Inject custom scrollbar CSS when page loads
  webContents.on('dom-ready', () => {
    webContents.insertCSS(ORBIT_SCROLLBAR_CSS).catch(() => {
      // Silently fail if CSS injection fails (e.g., on certain pages)
    })
  })

  // Update tab info when navigation happens
  webContents.on('did-navigate', () => {
    faviconReceived = false // Reset favicon flag on navigation
    updateTabFromView(window, tabId, view)
  })

  webContents.on('did-navigate-in-page', () => {
    updateTabFromView(window, tabId, view)
  })

  // Track loading state
  webContents.on('did-start-loading', () => {
    updateTabLoadingState(window, tabId, true)
  })

  webContents.on('did-stop-loading', () => {
    updateTabLoadingState(window, tabId, false)
  })

  // Update title when page title changes
  webContents.on('page-title-updated', (_event, title) => {
    updateTabTitle(window, tabId, title)
  })

  // Update favicon when page reports it
  webContents.on('page-favicon-updated', (_event, favicons) => {
    if (favicons.length > 0) {
      faviconReceived = true
      updateTabFavicon(window, tabId, favicons[0])
    }
  })

  // Fallback: Try to fetch favicon from /favicon.ico if page-favicon-updated doesn't fire
  // Also record the visit to search history
  webContents.on('did-finish-load', async () => {
    const currentUrl = webContents.getURL()
    const currentTitle = webContents.getTitle()

    // Wait a short moment to see if page-favicon-updated fires
    setTimeout(async () => {
      let currentFavicon: string | undefined

      if (!faviconReceived) {
        const favicon = await tryFetchDefaultFavicon(currentUrl)
        if (favicon) {
          currentFavicon = favicon
          updateTabFavicon(window, tabId, favicon)
        }
      } else {
        // Get favicon from tab state
        const state = windowStates.get(window.id)
        const tab = state?.tabs.find(t => t.id === tabId)
        currentFavicon = tab?.favicon
      }

      // Record the visit to search history
      try {
        const searchHistoryService = getSearchHistoryService()
        searchHistoryService.addVisitEntry(currentUrl, currentTitle, currentFavicon)
      } catch (error) {
        console.error('Error recording visit:', error)
      }
    }, 500)
  })
}

// Update tab info from the view's current state
function updateTabFromView(window: BrowserWindow, tabId: string, view: WebContentsView): void {
  const state = windowStates.get(window.id)
  if (!state) return

  const tab = state.tabs.find(t => t.id === tabId)
  if (!tab) return

  const webContents = view.webContents
  tab.url = webContents.getURL()
  tab.canGoBack = webContents.canGoBack()
  tab.canGoForward = webContents.canGoForward()

  broadcastTabUpdate(window.id, state)
}

// Update tab loading state
function updateTabLoadingState(window: BrowserWindow, tabId: string, isLoading: boolean): void {
  const state = windowStates.get(window.id)
  if (!state) return

  const tab = state.tabs.find(t => t.id === tabId)
  if (tab) {
    tab.isLoading = isLoading
    broadcastTabUpdate(window.id, state)
  }
}

// Update tab title
function updateTabTitle(window: BrowserWindow, tabId: string, title: string): void {
  const state = windowStates.get(window.id)
  if (!state) return

  const tab = state.tabs.find(t => t.id === tabId)
  if (tab) {
    tab.title = title || 'Untitled'
    broadcastTabUpdate(window.id, state)
  }
}

// Update tab favicon
function updateTabFavicon(window: BrowserWindow, tabId: string, favicon: string): void {
  const state = windowStates.get(window.id)
  if (!state) return

  const tab = state.tabs.find(t => t.id === tabId)
  if (tab) {
    tab.favicon = favicon
    broadcastTabUpdate(window.id, state)
  }
}

// Broadcast tab state update to renderer (via UI view's webContents)
function broadcastTabUpdate(windowId: number, state: WindowState): void {
  const uiView = uiViews.get(windowId)
  if (uiView) {
    uiView.webContents.send('tabs:updated', state)
  }
  // Keep the assistant sidebar's active URL in sync with the foreground tab.
  const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
  sendAssistantContext(windowId, { url: activeTab?.url ?? null })
}

function createWindow(initialTabs?: TabInfo[]): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  const mainWindow = new BrowserWindow({
    width: Math.min(1400, width),
    height: Math.min(900, height),
    minWidth: 400,
    minHeight: 300,
    frame: false, // Frameless for custom title bar
    titleBarStyle: 'hidden',
    backgroundColor: '#0f0f0f',
    icon: iconPath
  })

  // Load a blank document into the window's root webContents. All real content
  // lives in child WebContentsViews (UI/sidebar/tabs), so the root would
  // otherwise stay a document-less "empty URL" page target. Playwright's
  // connect_over_cdp() auto-attaches to every page target and blocks forever on
  // that one (Page.enable/Runtime.enable never respond), hanging the AI agent's
  // browser connection for the full timeout. Giving the root a real (dark,
  // to match backgroundColor and avoid a white flash behind the transparent UI)
  // document makes it respond immediately so the connection succeeds.
  mainWindow.loadURL(
    'data:text/html,' +
      encodeURIComponent('<!doctype html><meta charset="utf-8"><body style="margin:0;background:#0f0f0f"></body>')
  )

  // Create the UI WebContentsView (React app) - this will be on TOP
  const uiView = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      // Make the background transparent so we can see through to tab content
      transparent: true
    }
  })

  // Set UI view background color (with transparency support)
  uiView.setBackgroundColor('#00000000') // Fully transparent

  // Store the UI view
  uiViews.set(mainWindow.id, uiView)

  // Add UI view to window
  mainWindow.contentView.addChildView(uiView)

  // Set UI view bounds to cover full window
  updateUIViewBounds(mainWindow, uiView)

  // Create the sidebar WebContentsView (assistant) - its own renderer, layered
  // ABOVE the UI view so it owns its right-hand column and never fights the
  // content view for clicks/focus.
  const sidebarView = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  sidebarViews.set(mainWindow.id, sidebarView)
  mainWindow.contentView.addChildView(sidebarView)
  sidebarView.setVisible(false)
  updateSidebarViewBounds(mainWindow)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    sidebarView.webContents.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/sidebar.html`)
  } else {
    sidebarView.webContents.loadFile(join(__dirname, '../renderer/sidebar.html'))
  }

  // Initialize window state
  const defaultTab: TabInfo = {
    id: `tab-${Date.now()}`,
    title: 'New Tab',
    url: 'orbit://newtab',
    isLoading: false,
    canGoBack: false,
    canGoForward: false
  }

  const tabs = initialTabs || [defaultTab]
  const activeTabId = tabs[0]?.id || defaultTab.id

  windowStates.set(mainWindow.id, {
    id: mainWindow.id,
    tabs: tabs,
    activeTabId: activeTabId
  })

  // Initialize window tab views set
  windowTabViews.set(mainWindow.id, new Set())

  // Handle window resize - update all view bounds
  mainWindow.on('resize', () => {
    // Update UI view bounds
    updateUIViewBounds(mainWindow, uiView)

    // Update sidebar view bounds
    updateSidebarViewBounds(mainWindow)

    // Update tab view bounds
    const windowTabs = windowTabViews.get(mainWindow.id)
    if (windowTabs) {
      for (const tabId of windowTabs) {
        const view = tabViews.get(tabId)
        if (view) {
          updateTabViewBounds(mainWindow, view)
        }
      }
    }
  })

  // Clean up on close
  mainWindow.on('closed', () => {
    // Destroy all views for this window
    const windowTabs = windowTabViews.get(mainWindow.id)
    if (windowTabs) {
      for (const tabId of windowTabs) {
        tabViews.delete(tabId)
      }
      windowTabViews.delete(mainWindow.id)
    }
    uiViews.delete(mainWindow.id)
    sidebarViews.delete(mainWindow.id)
    windowStates.delete(mainWindow.id)
  })

  // Load the renderer into the UI view
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    uiView.webContents.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    uiView.webContents.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // After renderer loads, create views for any external URL tabs
  uiView.webContents.once('did-finish-load', () => {
    for (const tab of tabs) {
      if (!isInternalUrl(tab.url)) {
        createTabView(mainWindow, tab.id, tab.url)
      }
    }
    // Show the active tab's view if it exists
    const activeTab = tabs.find(t => t.id === activeTabId)
    if (activeTab && !isInternalUrl(activeTab.url)) {
      showTabView(mainWindow, activeTabId)
    }

    // Open DevTools on launch only when explicitly requested. An open DevTools
    // window shows up as a `devtools://` CDP page target that Playwright's
    // connect_over_cdp() tries to auto-attach to and hangs on (15s timeout),
    // which breaks the AI agent's browser connection. Opt in with ORBIT_DEVTOOLS=1.
    if (process.env['ORBIT_DEVTOOLS'] === '1') {
      uiView.webContents.openDevTools({ mode: 'detach' })
    }
  })

  // Watch shortcuts for dev tools
  optimizer.watchWindowShortcuts(mainWindow as unknown as Electron.BrowserWindow)

  return mainWindow
}

// Create a new window with specific tabs (for detaching)
function createWindowWithTabs(tabs: TabInfo[]): BrowserWindow {
  return createWindow(tabs)
}

app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.orbit.app')

  // Port 9222 is freed by the predev script before Electron starts
  console.log(`Remote debugging enabled on port ${debuggingPort}`)

  // Start Python backend
  pythonBackend = new PythonBackend()
  await pythonBackend.start()

  // Setup IPC handlers
  setupIpcHandlers(windowStates, createWindowWithTabs, pythonBackend)

  // Create the main window
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', async () => {
  // Stop Python backend
  if (pythonBackend) {
    await pythonBackend.stop()
  }

  // Close search history database
  closeSearchHistoryService()

  // Close search suggestions service
  closeSearchSuggestionsService()

  // Close AI search service
  closeAISearchService()

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Export debugging port getter
export function getDebuggingPort(): number | null {
  return debuggingPort
}

// Update all tab view bounds for a window (called when assistant opens/closes)
export function updateAllTabViewBounds(windowId: number): void {
  const window = BrowserWindow.fromId(windowId)
  if (!window) return

  const windowTabs = windowTabViews.get(windowId)
  if (windowTabs) {
    for (const tabId of windowTabs) {
      const view = tabViews.get(tabId)
      if (view) {
        updateTabViewBounds(window, view)
      }
    }
  }
}

// Export for IPC access
export {
  windowStates,
  createWindowWithTabs,
  tabViews,
  createTabView,
  destroyTabView,
  showTabView,
  hideAllTabViews,
  isInternalUrl,
  normalizeUrl,
  broadcastTabUpdate,
  setUIViewFullscreen,
  updateSidebarViewBounds,
  focusActiveTab,
  focusSidebar,
  sendAssistantContext,
  broadcastAssistantOpen,
  sidebarViews,
  HEADER_HEIGHT
}
export type { TabInfo, WindowState }
