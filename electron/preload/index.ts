import { contextBridge, ipcRenderer } from 'electron'

export interface TabInfo {
  id: string
  title: string
  url: string
}

export interface WindowState {
  id: number
  tabs: TabInfo[]
  activeTabId: string | null
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

  // Tab state updates from main process
  onTabsUpdated: (callback: (state: WindowState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: WindowState) => callback(state)
    ipcRenderer.on('tabs:updated', handler)
    return () => ipcRenderer.removeListener('tabs:updated', handler)
  },

  // API
  getApiPort: () => ipcRenderer.invoke('api:getPort'),
  isApiReady: () => ipcRenderer.invoke('api:isReady')
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
      onTabsUpdated: (callback: (state: WindowState) => void) => () => void
      getApiPort: () => Promise<number | null>
      isApiReady: () => Promise<boolean>
    }
  }
}

