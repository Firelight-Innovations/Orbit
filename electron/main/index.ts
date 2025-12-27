import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { setupIpcHandlers } from './ipc'
import { PythonBackend } from './python'

// Get the app icon path
const iconPath = join(__dirname, '../../resources/orbit_logo.png')

// Store for managing windows and their tabs
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

const windowStates = new Map<number, WindowState>()
let pythonBackend: PythonBackend | null = null

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
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Initialize window state
  const defaultTab: TabInfo = {
    id: `tab-${Date.now()}`,
    title: 'New Tab',
    url: 'orbit://home'
  }

  windowStates.set(mainWindow.id, {
    id: mainWindow.id,
    tabs: initialTabs || [defaultTab],
    activeTabId: initialTabs?.[0]?.id || defaultTab.id
  })

  // Clean up on close
  mainWindow.on('closed', () => {
    windowStates.delete(mainWindow.id)
  })

  // Load the renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

// Create a new window with specific tabs (for detaching)
function createWindowWithTabs(tabs: TabInfo[]): BrowserWindow {
  return createWindow(tabs)
}

app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.orbit.app')

  // Default open or close DevTools by F12 in development
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

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

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Export for IPC access
export { windowStates, createWindowWithTabs }
export type { TabInfo, WindowState }

