import { useState, useEffect } from 'react'
import { BookmarkNode } from '@/../../preload/index'
import { FolderTree } from './FolderTree'
import { BookmarksList } from './BookmarksList'
import { EditBookmarkDialog } from '../BookmarksBar/EditBookmarkDialog'
import { Search, Plus, FolderPlus, ArrowLeft } from 'lucide-react'
import { Button } from '../ui/button'

interface BookmarksManagerPageProps {
  onNavigate: (url: string) => void
}

export function BookmarksManagerPage({ onNavigate }: BookmarksManagerPageProps) {
  const [roots, setRoots] = useState<{
    bookmark_bar: BookmarkNode
    other: BookmarkNode
    synced: BookmarkNode
  } | null>(null)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [currentFolder, setCurrentFolder] = useState<BookmarkNode | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<BookmarkNode[]>([])
  const [editingBookmark, setEditingBookmark] = useState<BookmarkNode | null>(null)
  const [showEditDialog, setShowEditDialog] = useState(false)

  useEffect(() => {
    loadBookmarks()

    const unsubscribe = window.electronAPI.bookmarks.onBookmarksChanged(() => {
      loadBookmarks()
    })

    return () => {
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (roots && !selectedFolderId) {
      // Select bookmarks bar by default
      setSelectedFolderId(roots.bookmark_bar.id)
    }
  }, [roots, selectedFolderId])

  useEffect(() => {
    if (selectedFolderId && roots) {
      // Find the selected folder
      const folder = findFolderById(selectedFolderId, [
        roots.bookmark_bar,
        roots.other,
        roots.synced
      ])
      setCurrentFolder(folder)
    }
  }, [selectedFolderId, roots])

  const loadBookmarks = async () => {
    try {
      const allRoots = await window.electronAPI.bookmarks.getAllRoots()
      setRoots(allRoots)
    } catch (error) {
      console.error('Failed to load bookmarks:', error)
    }
  }

  const findFolderById = (
    id: string,
    nodes: BookmarkNode[]
  ): BookmarkNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node
      if (node.children) {
        const found = findFolderById(id, node.children)
        if (found) return found
      }
    }
    return null
  }

  const handleSearch = async () => {
    if (searchQuery.trim()) {
      const results = await window.electronAPI.bookmarks.searchBookmarks(
        searchQuery,
        50
      )
      setSearchResults(results)
    } else {
      setSearchResults([])
    }
  }

  const handleEdit = (bookmark: BookmarkNode) => {
    setEditingBookmark(bookmark)
    setShowEditDialog(true)
  }

  const handleDelete = async (bookmark: BookmarkNode) => {
    if (confirm(`Are you sure you want to delete "${bookmark.name}"?`)) {
      await window.electronAPI.bookmarks.deleteBookmark(bookmark.id)
    }
  }

  const handleSaveEdit = async (id: string, updates: any) => {
    await window.electronAPI.bookmarks.updateBookmark(id, updates)
  }

  const handleAddBookmark = async () => {
    const name = prompt('Bookmark name:')
    const url = prompt('Bookmark URL:')
    if (name && url && selectedFolderId) {
      await window.electronAPI.bookmarks.createBookmark(selectedFolderId, {
        name,
        url,
        type: 'url'
      })
    }
  }

  const handleAddFolder = async () => {
    const name = prompt('Folder name:')
    if (name && selectedFolderId) {
      await window.electronAPI.bookmarks.createBookmark(selectedFolderId, {
        name,
        type: 'folder'
      })
    }
  }

  const displayedBookmarks = searchQuery.trim() 
    ? searchResults 
    : (currentFolder?.children || [])

  return (
    <div className="flex h-full w-full bg-background">
      {/* Left Sidebar - Folder Tree */}
      <div className="w-64 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold">Bookmarks</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          <FolderTree
            roots={roots}
            selectedFolderId={selectedFolderId}
            onSelectFolder={setSelectedFolderId}
          />
        </div>
      </div>

      {/* Right Pane - Bookmarks List */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="border-b border-border p-4">
          <div className="flex items-center gap-4 mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigate('orbit://home')}
            >
              <ArrowLeft size={16} className="mr-2" />
              Back
            </Button>
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddBookmark}
            >
              <Plus size={16} className="mr-2" />
              Add Bookmark
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddFolder}
            >
              <FolderPlus size={16} className="mr-2" />
              Add Folder
            </Button>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                if (e.target.value.trim()) {
                  handleSearch()
                } else {
                  setSearchResults([])
                }
              }}
              placeholder="Search bookmarks..."
              className="w-full pl-10 pr-4 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* Breadcrumb */}
        {currentFolder && !searchQuery.trim() && (
          <div className="px-4 py-2 border-b border-border text-sm text-muted-foreground">
            {currentFolder.name}
          </div>
        )}

        {searchQuery.trim() && (
          <div className="px-4 py-2 border-b border-border text-sm text-muted-foreground">
            Search results for "{searchQuery}"
          </div>
        )}

        {/* Bookmarks List */}
        <div className="flex-1 overflow-y-auto">
          <BookmarksList
            bookmarks={displayedBookmarks}
            onNavigate={onNavigate}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </div>
      </div>

      {/* Edit Dialog */}
      <EditBookmarkDialog
        bookmark={editingBookmark}
        isOpen={showEditDialog}
        onClose={() => {
          setShowEditDialog(false)
          setEditingBookmark(null)
        }}
        onSave={handleSaveEdit}
      />
    </div>
  )
}

