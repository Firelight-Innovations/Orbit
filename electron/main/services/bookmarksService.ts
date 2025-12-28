import { watch, readFileSync, writeFileSync, existsSync, FSWatcher } from 'fs'
import { join } from 'path'
import { getProfileDir, getActiveProfileId } from './profileService'
import { EventEmitter } from 'events'

// Chrome Bookmarks JSON structure
export interface BookmarkNode {
  id: string
  name: string
  type: 'folder' | 'url'
  url?: string
  date_added?: string
  date_modified?: string
  children?: BookmarkNode[]
  guid?: string
  date_last_used?: string
}

export interface ChromeBookmarks {
  checksum: string
  roots: {
    bookmark_bar: BookmarkNode
    other: BookmarkNode
    synced: BookmarkNode
  }
  version: number
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

/**
 * Service for managing Chrome bookmarks with live sync
 * Reads/writes directly to Chrome's Bookmarks file
 */
export class BookmarksService extends EventEmitter {
  private bookmarksPath: string | null = null
  private watcher: FSWatcher | null = null
  private cachedBookmarks: ChromeBookmarks | null = null
  private isWriting = false
  private debounceTimer: NodeJS.Timeout | null = null

  constructor() {
    super()
  }

  /**
   * Initialize the service with the active profile
   */
  initialize(): boolean {
    const profileId = getActiveProfileId()
    if (!profileId) {
      console.error('No active profile found')
      return false
    }

    const profileDir = getProfileDir(profileId)
    this.bookmarksPath = join(profileDir, 'Bookmarks')

    if (!existsSync(this.bookmarksPath)) {
      console.warn('Bookmarks file not found:', this.bookmarksPath)
      return false
    }

    // Load initial bookmarks
    this.loadBookmarks()

    // Start watching for changes
    this.startWatching()

    return true
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.cachedBookmarks = null
    this.bookmarksPath = null
  }

  /**
   * Start watching the bookmarks file for external changes
   */
  private startWatching(): void {
    if (!this.bookmarksPath || this.watcher) return

    try {
      this.watcher = watch(this.bookmarksPath, (eventType) => {
        // Ignore changes we made ourselves
        if (this.isWriting) return

        // Debounce rapid changes
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer)
        }

        this.debounceTimer = setTimeout(() => {
          console.log('Bookmarks file changed externally, reloading...')
          this.loadBookmarks()
          this.emit('changed')
        }, 100)
      })
    } catch (error) {
      console.error('Failed to watch bookmarks file:', error)
    }
  }

  /**
   * Load bookmarks from file
   */
  private loadBookmarks(): void {
    if (!this.bookmarksPath) return

    try {
      const content = readFileSync(this.bookmarksPath, 'utf-8')
      this.cachedBookmarks = JSON.parse(content)
    } catch (error) {
      console.error('Failed to load bookmarks:', error)
      this.cachedBookmarks = null
    }
  }

  /**
   * Save bookmarks to file with atomic write
   */
  private saveBookmarks(bookmarks: ChromeBookmarks): boolean {
    if (!this.bookmarksPath) return false

    try {
      this.isWriting = true

      // Write to temporary file first
      const tmpPath = `${this.bookmarksPath}.tmp`
      const content = JSON.stringify(bookmarks, null, 3)
      writeFileSync(tmpPath, content, 'utf-8')

      // Backup original
      const backupPath = `${this.bookmarksPath}.bak`
      if (existsSync(this.bookmarksPath)) {
        writeFileSync(backupPath, readFileSync(this.bookmarksPath))
      }

      // Rename temp to actual
      writeFileSync(this.bookmarksPath, readFileSync(tmpPath))

      // Update cache
      this.cachedBookmarks = bookmarks

      // Clean up temp file
      if (existsSync(tmpPath)) {
        const fs = require('fs')
        fs.unlinkSync(tmpPath)
      }

      return true
    } catch (error) {
      console.error('Failed to save bookmarks:', error)
      return false
    } finally {
      // Reset writing flag after a short delay
      setTimeout(() => {
        this.isWriting = false
      }, 200)
    }
  }

  /**
   * Get bookmarks bar items
   */
  getBookmarksBar(): BookmarkNode | null {
    if (!this.cachedBookmarks) {
      this.loadBookmarks()
    }
    return this.cachedBookmarks?.roots.bookmark_bar ?? null
  }

  /**
   * Get all bookmark roots
   */
  getAllRoots(): ChromeBookmarks['roots'] | null {
    if (!this.cachedBookmarks) {
      this.loadBookmarks()
    }
    return this.cachedBookmarks?.roots ?? null
  }

  /**
   * Find a bookmark node by ID (recursive search)
   */
  private findNodeById(id: string, node?: BookmarkNode): BookmarkNode | null {
    if (!this.cachedBookmarks && !node) {
      return null
    }

    const searchNode = node ?? this.cachedBookmarks!.roots.bookmark_bar
    
    if (searchNode.id === id) {
      return searchNode
    }

    if (searchNode.children) {
      for (const child of searchNode.children) {
        const found = this.findNodeById(id, child)
        if (found) return found
      }
    }

    // Also search other roots if no node provided
    if (!node && this.cachedBookmarks) {
      const otherFound = this.findNodeById(id, this.cachedBookmarks.roots.other)
      if (otherFound) return otherFound
      
      const syncedFound = this.findNodeById(id, this.cachedBookmarks.roots.synced)
      if (syncedFound) return syncedFound
    }

    return null
  }

  /**
   * Generate a unique ID for a new bookmark
   */
  private generateId(): string {
    return String(Date.now())
  }

  /**
   * Generate a GUID for a bookmark (Chrome format)
   */
  private generateGuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }

  /**
   * Create a new bookmark or folder
   */
  createBookmark(parentId: string, data: BookmarkCreateData, index?: number): BookmarkNode | null {
    if (!this.cachedBookmarks) return null

    const parent = this.findNodeById(parentId)
    if (!parent || parent.type !== 'folder') {
      console.error('Parent not found or is not a folder')
      return null
    }

    const newNode: BookmarkNode = {
      id: this.generateId(),
      guid: this.generateGuid(),
      name: data.name,
      type: data.type,
      date_added: String(Date.now() * 1000), // Chrome uses microseconds
      date_modified: String(Date.now() * 1000),
    }

    if (data.type === 'url' && data.url) {
      newNode.url = data.url
    } else if (data.type === 'folder') {
      newNode.children = []
    }

    if (!parent.children) {
      parent.children = []
    }

    // Insert at specific index or append
    if (index !== undefined && index >= 0 && index <= parent.children.length) {
      parent.children.splice(index, 0, newNode)
    } else {
      parent.children.push(newNode)
    }

    parent.date_modified = String(Date.now() * 1000)

    if (this.saveBookmarks(this.cachedBookmarks)) {
      this.emit('changed')
      return newNode
    }

    return null
  }

  /**
   * Update a bookmark
   */
  updateBookmark(id: string, updates: BookmarkUpdateData): boolean {
    if (!this.cachedBookmarks) return false

    const node = this.findNodeById(id)
    if (!node) {
      console.error('Bookmark not found:', id)
      return false
    }

    if (updates.name !== undefined) {
      node.name = updates.name
    }

    if (updates.url !== undefined && node.type === 'url') {
      node.url = updates.url
    }

    node.date_modified = String(Date.now() * 1000)

    if (this.saveBookmarks(this.cachedBookmarks)) {
      this.emit('changed')
      return true
    }

    return false
  }

  /**
   * Delete a bookmark
   */
  deleteBookmark(id: string): boolean {
    if (!this.cachedBookmarks) return false

    // Find parent containing this node
    const deleteFromNode = (node: BookmarkNode): boolean => {
      if (node.children) {
        const index = node.children.findIndex(child => child.id === id)
        if (index !== -1) {
          node.children.splice(index, 1)
          node.date_modified = String(Date.now() * 1000)
          return true
        }

        for (const child of node.children) {
          if (deleteFromNode(child)) {
            return true
          }
        }
      }
      return false
    }

    const deleted = deleteFromNode(this.cachedBookmarks.roots.bookmark_bar) ||
                    deleteFromNode(this.cachedBookmarks.roots.other) ||
                    deleteFromNode(this.cachedBookmarks.roots.synced)

    if (deleted && this.saveBookmarks(this.cachedBookmarks)) {
      this.emit('changed')
      return true
    }

    return false
  }

  /**
   * Move a bookmark to a new parent and/or index
   */
  moveBookmark(id: string, newParentId: string, newIndex: number): boolean {
    if (!this.cachedBookmarks) return false

    const node = this.findNodeById(id)
    const newParent = this.findNodeById(newParentId)

    if (!node || !newParent || newParent.type !== 'folder') {
      console.error('Node or parent not found, or parent is not a folder')
      return false
    }

    // Remove from old parent
    const removeFromNode = (parent: BookmarkNode): boolean => {
      if (parent.children) {
        const index = parent.children.findIndex(child => child.id === id)
        if (index !== -1) {
          parent.children.splice(index, 1)
          parent.date_modified = String(Date.now() * 1000)
          return true
        }

        for (const child of parent.children) {
          if (removeFromNode(child)) {
            return true
          }
        }
      }
      return false
    }

    const removed = removeFromNode(this.cachedBookmarks.roots.bookmark_bar) ||
                    removeFromNode(this.cachedBookmarks.roots.other) ||
                    removeFromNode(this.cachedBookmarks.roots.synced)

    if (!removed) {
      console.error('Failed to remove node from old parent')
      return false
    }

    // Add to new parent at specified index
    if (!newParent.children) {
      newParent.children = []
    }

    const insertIndex = Math.max(0, Math.min(newIndex, newParent.children.length))
    newParent.children.splice(insertIndex, 0, node)
    newParent.date_modified = String(Date.now() * 1000)

    if (this.saveBookmarks(this.cachedBookmarks)) {
      this.emit('changed')
      return true
    }

    return false
  }

  /**
   * Search bookmarks by query
   */
  searchBookmarks(query: string, maxResults = 50): BookmarkNode[] {
    if (!this.cachedBookmarks) return []

    const results: BookmarkNode[] = []
    const lowerQuery = query.toLowerCase()

    const searchNode = (node: BookmarkNode) => {
      if (results.length >= maxResults) return

      if (node.type === 'url') {
        const matchesName = node.name.toLowerCase().includes(lowerQuery)
        const matchesUrl = node.url?.toLowerCase().includes(lowerQuery)
        
        if (matchesName || matchesUrl) {
          results.push(node)
        }
      }

      if (node.children) {
        for (const child of node.children) {
          searchNode(child)
        }
      }
    }

    searchNode(this.cachedBookmarks.roots.bookmark_bar)
    searchNode(this.cachedBookmarks.roots.other)
    searchNode(this.cachedBookmarks.roots.synced)

    return results
  }
}

// Singleton instance
let bookmarksService: BookmarksService | null = null

export function getBookmarksService(): BookmarksService {
  if (!bookmarksService) {
    bookmarksService = new BookmarksService()
    bookmarksService.initialize()
  }
  return bookmarksService
}

export function closeBookmarksService(): void {
  if (bookmarksService) {
    bookmarksService.cleanup()
    bookmarksService = null
  }
}

