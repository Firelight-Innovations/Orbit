import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { BookmarkNode } from '@/../../preload/index'
import {
  ExternalLink,
  PanelTop,
  Pencil,
  Trash2,
  FolderOpen,
  FileText,
  FolderPlus,
  Scissors,
  Copy as CopyIcon,
  Settings
} from 'lucide-react'

interface BookmarkMenuProps {
  bookmark: BookmarkNode
  isOpen: boolean
  position: { x: number; y: number }
  onClose: () => void
  onOpenNewTab: () => void
  onOpenNewWindow: () => void
  onOpenAll?: () => void
  onEdit: () => void
  onDelete: () => void
  onAddBookmark?: () => void
  onAddFolder?: () => void
  onOpenManager?: () => void
}

export function BookmarkMenu({
  bookmark,
  isOpen,
  position,
  onClose,
  onOpenNewTab,
  onOpenNewWindow,
  onOpenAll,
  onEdit,
  onDelete,
  onAddBookmark,
  onAddFolder,
  onOpenManager
}: BookmarkMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const isFolder = bookmark.type === 'folder'

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
        document.removeEventListener('keydown', handleEscape)
      }
    }
  }, [isOpen, onClose])

  const portalRoot = document.getElementById('dropdown-portal')
  if (!isOpen || !portalRoot) return null

  // Adjust position to keep menu on screen
  const menuWidth = 240
  const menuMaxHeight = 500
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  let adjustedX = position.x
  let adjustedY = position.y

  // Keep menu within horizontal bounds
  if (adjustedX + menuWidth > viewportWidth) {
    adjustedX = viewportWidth - menuWidth - 10
  }

  // Keep menu within vertical bounds
  if (adjustedY + menuMaxHeight > viewportHeight) {
    adjustedY = Math.max(10, viewportHeight - menuMaxHeight - 10)
  }

  const menuContent = (
    <div
      ref={menuRef}
      className="bookmark-menu"
      style={{
        position: 'fixed',
        top: adjustedY,
        left: adjustedX,
        zIndex: 10000
      }}
    >
      {!isFolder && (
        <>
          <div className="bookmark-menu-item" onClick={onOpenNewTab}>
            <ExternalLink size={16} />
            <span>Open in new tab</span>
          </div>
          <div className="bookmark-menu-item" onClick={onOpenNewWindow}>
            <PanelTop size={16} />
            <span>Open in new window</span>
          </div>
          <div className="bookmark-menu-separator" />
        </>
      )}

      {isFolder && onOpenAll && (
        <>
          <div className="bookmark-menu-item" onClick={onOpenAll}>
            <FolderOpen size={16} />
            <span>Open all bookmarks</span>
          </div>
          <div className="bookmark-menu-separator" />
        </>
      )}

      <div className="bookmark-menu-item" onClick={onEdit}>
        <Pencil size={16} />
        <span>Edit...</span>
      </div>

      <div className="bookmark-menu-separator" />

      <div className="bookmark-menu-item disabled">
        <Scissors size={16} />
        <span>Cut</span>
      </div>

      <div className="bookmark-menu-item disabled">
        <CopyIcon size={16} />
        <span>Copy</span>
      </div>

      <div className="bookmark-menu-item disabled">
        <span style={{ marginLeft: '24px' }}>Paste</span>
      </div>

      <div className="bookmark-menu-separator" />

      <div className="bookmark-menu-item danger" onClick={onDelete}>
        <Trash2 size={16} />
        <span>Delete</span>
      </div>

      {isFolder && (
        <>
          <div className="bookmark-menu-separator" />
          {onAddBookmark && (
            <div className="bookmark-menu-item" onClick={onAddBookmark}>
              <FileText size={16} />
              <span>Add page...</span>
            </div>
          )}
          {onAddFolder && (
            <div className="bookmark-menu-item" onClick={onAddFolder}>
              <FolderPlus size={16} />
              <span>Add folder...</span>
            </div>
          )}
        </>
      )}

      {onOpenManager && (
        <>
          <div className="bookmark-menu-separator" />
          <div className="bookmark-menu-item" onClick={onOpenManager}>
            <Settings size={16} />
            <span>Bookmark manager</span>
          </div>
        </>
      )}
    </div>
  )

  return createPortal(menuContent, portalRoot)
}

