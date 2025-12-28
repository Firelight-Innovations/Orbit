import { BookmarkNode } from '@/../../preload/index'
import { Folder } from 'lucide-react'
import orbitLogo from '../../assets/orbit_logo.png'
import React from 'react'

interface BookmarkItemProps {
  bookmark: BookmarkNode
  onNavigate: (url: string) => void
  onOpenMenu: (e: React.MouseEvent, bookmark: BookmarkNode) => void
  dragHandlers?: {
    draggable: boolean
    onDragStart: (e: React.DragEvent) => void
    onDragEnd: (e: React.DragEvent) => void
    onDragOver: (e: React.DragEvent) => void
    onDragLeave: (e: React.DragEvent) => void
    onDrop: (e: React.DragEvent) => void
  }
  isDragging?: boolean
  dragPosition?: 'before' | 'after' | 'over' | null
}

export function BookmarkItem({
  bookmark,
  onNavigate,
  onOpenMenu,
  dragHandlers,
  isDragging,
  dragPosition
}: BookmarkItemProps) {
  const [isDraggingState, setIsDraggingState] = React.useState(false)

  const handleMouseDown = (e: React.MouseEvent) => {
    // Middle click - open in new tab
    if (e.button === 1 && bookmark.type === 'url' && bookmark.url) {
      e.preventDefault()
      window.electronAPI.createTab({
        id: `tab-${Date.now()}`,
        title: bookmark.name,
        url: bookmark.url
      })
    }
  }

  const handleClick = (e: React.MouseEvent) => {
    // Don't navigate if we just finished dragging
    if (isDraggingState) {
      e.preventDefault()
      e.stopPropagation()
      return
    }

    e.preventDefault()
    e.stopPropagation()
    
    // Left click - navigate directly
    if (bookmark.type === 'url' && bookmark.url) {
      onNavigate(bookmark.url)
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Right click - open menu
    onOpenMenu(e, bookmark)
  }

  // Wrap drag handlers to track drag state
  const wrappedDragHandlers = dragHandlers ? {
    ...dragHandlers,
    onDragStart: (e: React.DragEvent) => {
      setIsDraggingState(true)
      dragHandlers.onDragStart(e)
    },
    onDragEnd: (e: React.DragEvent) => {
      dragHandlers.onDragEnd(e)
      // Reset dragging state after a short delay
      setTimeout(() => setIsDraggingState(false), 100)
    }
  } : undefined

  // Get favicon URL or use default
  const getFaviconUrl = () => {
    if (!bookmark.url) return orbitLogo
    try {
      const url = new URL(bookmark.url)
      return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=32`
    } catch {
      return orbitLogo
    }
  }

  const className = `bookmark-item ${isDragging ? 'dragging' : ''} ${
    dragPosition === 'before' ? 'drag-over-before' : ''
  } ${dragPosition === 'after' ? 'drag-over-after' : ''}`

  if (bookmark.type === 'folder') {
    return null // Folders are handled separately
  }

  return (
    <div
      className={className}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onMouseDown={handleMouseDown}
      title={bookmark.url}
      {...wrappedDragHandlers}
    >
      <img
        src={getFaviconUrl()}
        alt=""
        className="bookmark-favicon"
        onError={(e) => {
          ;(e.target as HTMLImageElement).src = orbitLogo
        }}
      />
      <span className="bookmark-name">{bookmark.name}</span>
    </div>
  )
}

