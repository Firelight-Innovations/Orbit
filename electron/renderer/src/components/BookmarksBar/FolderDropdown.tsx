import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { BookmarkNode } from '@/../../preload/index'
import { Folder, ChevronDown } from 'lucide-react'
import orbitLogo from '../../assets/orbit_logo.png'
import { motion, AnimatePresence } from 'framer-motion'

interface FolderDropdownProps {
  folder: BookmarkNode
  onNavigate: (url: string) => void
  onContextMenu: (e: React.MouseEvent, bookmark: BookmarkNode) => void
  dragHandlers?: {
    draggable: boolean
    onDragStart: (e: React.DragEvent) => void
    onDragEnd: (e: React.DragEvent) => void
    onDragOver: (e: React.DragEvent) => void
    onDragLeave: (e: React.DragEvent) => void
    onDrop: (e: React.DragEvent) => void
  }
  isDragOver?: boolean
}

export function FolderDropdown({
  folder,
  onNavigate,
  onContextMenu,
  dragHandlers,
  isDragOver
}: FolderDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLDivElement>(null)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Update anchor rect when dropdown opens
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const updateRect = () => {
        setAnchorRect(buttonRef.current?.getBoundingClientRect() ?? null)
      }
      updateRect()
      window.addEventListener('resize', updateRect)
      return () => window.removeEventListener('resize', updateRect)
    }
  }, [isOpen])

  const handleClick = () => {
    setIsOpen(!isOpen)
  }

  const handleItemClick = (url: string) => {
    onNavigate(url)
    setIsOpen(false)
  }

  const handleOpenAll = () => {
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
    setIsOpen(false)
  }

  const getFaviconUrl = (url: string) => {
    try {
      const urlObj = new URL(url)
      return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`
    } catch {
      return orbitLogo
    }
  }

  const renderItem = (item: BookmarkNode) => {
    if (item.type === 'folder') {
      return (
        <div
          key={item.id}
          className="folder-dropdown-item"
          onContextMenu={(e) => onContextMenu(e, item)}
        >
          <Folder className="folder-icon" size={16} />
          <span className="bookmark-name">{item.name}</span>
        </div>
      )
    }

    return (
      <div
        key={item.id}
        className="folder-dropdown-item"
        onClick={() => handleItemClick(item.url!)}
        onContextMenu={(e) => onContextMenu(e, item)}
      >
        <img
          src={getFaviconUrl(item.url!)}
          alt=""
          className="bookmark-favicon"
          onError={(e) => {
            ;(e.target as HTMLImageElement).src = orbitLogo
          }}
        />
        <span className="bookmark-name">{item.name}</span>
      </div>
    )
  }

  const hasBookmarks = folder.children && folder.children.some(c => c.type === 'url')

  // Get portal root element
  const portalRoot = document.getElementById('dropdown-portal')

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={buttonRef}
        className={`bookmark-folder ${isOpen ? 'open' : ''} ${isDragOver ? 'drag-over' : ''}`}
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, folder)}
        {...dragHandlers}
      >
        <Folder className="folder-icon" size={16} />
        <span className="bookmark-name">{folder.name}</span>
        <ChevronDown className="folder-chevron" size={12} />
      </div>

      {/* Render dropdown via portal */}
      {isOpen && portalRoot && anchorRect && createPortal(
        <AnimatePresence>
          <motion.div
            ref={dropdownRef}
            className="folder-dropdown"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'fixed',
              top: anchorRect.bottom + 2,
              left: anchorRect.left,
              minWidth: anchorRect.width,
              zIndex: 1000
            }}
          >
            {folder.children && folder.children.length > 0 ? (
              <>
                {folder.children.map(renderItem)}
                {hasBookmarks && (
                  <>
                    <div className="folder-dropdown-separator" />
                    <div
                      className="folder-dropdown-item"
                      onClick={handleOpenAll}
                      style={{ fontWeight: 500 }}
                    >
                      Open all bookmarks
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="folder-dropdown-item" style={{ color: 'var(--text-muted)' }}>
                Empty folder
              </div>
            )}
          </motion.div>
        </AnimatePresence>,
        portalRoot
      )}
    </div>
  )
}

