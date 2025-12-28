import { useState, useEffect, useRef } from 'react'
import { BookmarkNode } from '@/../../preload/index'
import { BookmarkItem } from './BookmarkItem'
import { FolderDropdown } from './FolderDropdown'
import { EditBookmarkDialog } from './EditBookmarkDialog'
import { BookmarkMenu } from './BookmarkMenu'
import { ChevronRight } from 'lucide-react'
import { useBookmarkDragDrop } from '../../hooks/useBookmarkDragDrop'
import './BookmarksBar.css'

interface BookmarksBarProps {
  onNavigate: (url: string) => void
}

export function BookmarksBar({ onNavigate }: BookmarksBarProps) {
  const [bookmarks, setBookmarks] = useState<BookmarkNode | null>(null)
  const [showOverflow, setShowOverflow] = useState(false)
  const [visibleBookmarks, setVisibleBookmarks] = useState<BookmarkNode[]>([])
  const [overflowBookmarks, setOverflowBookmarks] = useState<BookmarkNode[]>([])
  const scrollableRef = useRef<HTMLDivElement>(null)
  const [editingBookmark, setEditingBookmark] = useState<BookmarkNode | null>(null)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [menuState, setMenuState] = useState<{
    bookmark: BookmarkNode | null
    position: { x: number; y: number }
    isOpen: boolean
  }>({
    bookmark: null,
    position: { x: 0, y: 0 },
    isOpen: false
  })

  // Load bookmarks on mount
  useEffect(() => {
    loadBookmarks()

    // Subscribe to changes
    const unsubscribe = window.electronAPI.bookmarks.onBookmarksChanged(() => {
      loadBookmarks()
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const loadBookmarks = async () => {
    try {
      const bar = await window.electronAPI.bookmarks.getBookmarksBar()
      setBookmarks(bar)
    } catch (error) {
      console.error('Failed to load bookmarks:', error)
    }
  }

  // Drag and drop handler
  const handleMove = async (itemId: string, newParentId: string, newIndex: number) => {
    await window.electronAPI.bookmarks.moveBookmark(itemId, newParentId, newIndex)
  }

  const { dragState, getDragHandlers, getFolderDropHandlers } = useBookmarkDragDrop(
    bookmarks?.id || '',
    handleMove
  )

  // Calculate visible vs overflow bookmarks
  useEffect(() => {
    if (!bookmarks?.children || !scrollableRef.current) {
      setVisibleBookmarks([])
      setOverflowBookmarks([])
      return
    }

    // For now, show all in scrollable area
    // TODO: Implement proper overflow detection based on width
    setVisibleBookmarks(bookmarks.children)
    setOverflowBookmarks([])
    setShowOverflow(false)
  }, [bookmarks])

  const handleContextMenu = (e: React.MouseEvent, bookmark: BookmarkNode) => {
    e.preventDefault()
    e.stopPropagation()
    setMenuState({
      bookmark,
      position: { x: e.clientX, y: e.clientY },
      isOpen: true
    })
  }

  const handleCloseMenu = () => {
    setMenuState({
      bookmark: null,
      position: { x: 0, y: 0 },
      isOpen: false
    })
  }

  const handleEdit = (bookmark: BookmarkNode) => {
    setEditingBookmark(bookmark)
    setShowEditDialog(true)
    handleCloseMenu()
  }

  const handleDelete = async (bookmark: BookmarkNode) => {
    handleCloseMenu()
    if (confirm(`Are you sure you want to delete "${bookmark.name}"?`)) {
      await window.electronAPI.bookmarks.deleteBookmark(bookmark.id)
    }
  }

  const handleOpenNewTab = (bookmark: BookmarkNode) => {
    handleCloseMenu()
    if (bookmark.type === 'url' && bookmark.url) {
      window.electronAPI.createTab({
        id: `tab-${Date.now()}`,
        title: bookmark.name,
        url: bookmark.url
      })
    }
  }

  const handleOpenNewWindow = (bookmark: BookmarkNode) => {
    handleCloseMenu()
    // TODO: Implement open in new window
    console.log('Open in new window:', bookmark)
  }

  const handleOpenAll = (folder: BookmarkNode) => {
    handleCloseMenu()
    if (folder.children) {
      folder.children.forEach((child) => {
        if (child.type === 'url' && child.url) {
          window.electronAPI.createTab({
            id: `tab-${Date.now()}-${Math.random()}`,
            title: child.name,
            url: child.url
          })
        }
      })
    }
  }

  const handleOpenManager = () => {
    handleCloseMenu()
    handleNavigate('orbit://bookmarks')
  }

  const handleSaveEdit = async (id: string, updates: any) => {
    await window.electronAPI.bookmarks.updateBookmark(id, updates)
  }

  const handleNavigate = (url: string) => {
    onNavigate(url)
  }

  // Remove context menu click handler - no longer needed
  useEffect(() => {
    // Cleanup only
  }, [])

  if (!bookmarks || !bookmarks.children || bookmarks.children.length === 0) {
    return (
      <div className="bookmarks-bar">
        <div className="bookmarks-bar-empty">
          No bookmarks yet
        </div>
      </div>
    )
  }

  return (
    <div className="bookmarks-bar">
      <div className="bookmarks-bar-content">
        <div ref={scrollableRef} className="bookmarks-bar-scrollable">
          {visibleBookmarks.map((bookmark, index) => {
            const isDragging = dragState.draggedItem?.id === bookmark.id
            const dragPosition = dragState.dragOverItem?.id === bookmark.id 
              ? dragState.dragPosition 
              : null

            if (bookmark.type === 'folder') {
              return (
                <FolderDropdown
                  key={bookmark.id}
                  folder={bookmark}
                  onNavigate={handleNavigate}
                  onContextMenu={handleContextMenu}
                  dragHandlers={getDragHandlers(bookmark, index)}
                  isDragOver={dragPosition === 'over'}
                />
              )
            } else {
              return (
                <BookmarkItem
                  key={bookmark.id}
                  bookmark={bookmark}
                  onNavigate={handleNavigate}
                  onOpenMenu={handleContextMenu}
                  dragHandlers={getDragHandlers(bookmark, index)}
                  isDragging={isDragging}
                  dragPosition={dragPosition}
                />
              )
            }
          })}
        </div>

        {showOverflow && overflowBookmarks.length > 0 && (
          <div className="overflow-menu-button">
            <ChevronRight size={16} />
          </div>
        )}
      </div>

      {/* Bookmark Menu */}
      {menuState.bookmark && (
        <BookmarkMenu
          bookmark={menuState.bookmark}
          isOpen={menuState.isOpen}
          position={menuState.position}
          onClose={handleCloseMenu}
          onOpenNewTab={() => handleOpenNewTab(menuState.bookmark!)}
          onOpenNewWindow={() => handleOpenNewWindow(menuState.bookmark!)}
          onOpenAll={menuState.bookmark.type === 'folder' ? () => handleOpenAll(menuState.bookmark!) : undefined}
          onEdit={() => handleEdit(menuState.bookmark!)}
          onDelete={() => handleDelete(menuState.bookmark!)}
          onOpenManager={handleOpenManager}
        />
      )}

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

