import { useState, useEffect } from 'react'
import { AutocompleteDropdown } from './AutocompleteDropdown'
import { ProfileButton } from './ProfileButton'
import { Sparkles, Star } from 'lucide-react'
import { EditBookmarkDialog } from '../BookmarksBar/EditBookmarkDialog'
import { BookmarkNode } from '@/../../preload/index'
import orbitLogo from '../../assets/orbit_logo.png'
import './NavigationBar.css'
import { assistantStore } from '@/stores/assistantStore'
import { useUrlInput } from '../../hooks/useUrlInput'

interface TabInfo {
  id: string
  title: string
  url: string
  isLoading?: boolean
  canGoBack?: boolean
  canGoForward?: boolean
  favicon?: string
}

interface NavigationBarProps {
  activeTab: TabInfo | null
  onNavigate: (url: string) => void
}

export function NavigationBar({ activeTab, onNavigate }: NavigationBarProps) {
  const [isBookmarked, setIsBookmarked] = useState(false)
  const [existingBookmark, setExistingBookmark] = useState<BookmarkNode | null>(null)
  const [showBookmarkDialog, setShowBookmarkDialog] = useState(false)

  const {
    inputValue,
    setInputValue,
    userTypedValue,
    setUserTypedValue,
    suggestions,
    isFocused,
    showDropdown,
    setShowDropdown,
    selectedIndex,
    anchorRect,
    inputRef,
    dropdownRef,
    anchorRef: urlBarRef,
    handleInputChange,
    handleKeyDown,
    handleFocus: omniboxFocus,
    handleBlur: omniboxBlur,
    handleSelectSuggestion,
    handleDeleteSuggestion
  } = useUrlInput({ onNavigate })

  // Update input value when active tab URL changes
  useEffect(() => {
    if (activeTab && !isFocused) {
      setInputValue(activeTab.url)
      setUserTypedValue(activeTab.url)
    }
  }, [activeTab?.url, isFocused, setUserTypedValue])

  // Check if current page is bookmarked
  useEffect(() => {
    if (!activeTab || activeTab.url.startsWith('orbit://')) {
      setIsBookmarked(false)
      setExistingBookmark(null)
      return
    }

    checkIfBookmarked(activeTab.url)
  }, [activeTab?.url])

  const checkIfBookmarked = async (url: string) => {
    try {
      const roots = await window.electronAPI.bookmarks.getAllRoots()
      if (!roots) {
        setIsBookmarked(false)
        return
      }

      // Search all bookmarks for this URL
      const findBookmark = (node: BookmarkNode): BookmarkNode | null => {
        if (node.type === 'url' && node.url === url) {
          return node
        }
        if (node.children) {
          for (const child of node.children) {
            const found = findBookmark(child)
            if (found) return found
          }
        }
        return null
      }

      const bookmark = findBookmark(roots.bookmark_bar) || 
                       findBookmark(roots.other) || 
                       findBookmark(roots.synced)

      if (bookmark) {
        setIsBookmarked(true)
        setExistingBookmark(bookmark)
      } else {
        setIsBookmarked(false)
        setExistingBookmark(null)
      }
    } catch (error) {
      console.error('Failed to check if bookmarked:', error)
      setIsBookmarked(false)
    }
  }

  const handleBack = () => {
    if (activeTab?.canGoBack) {
      window.electronAPI.goBack(activeTab.id)
    }
  }

  const handleForward = () => {
    if (activeTab?.canGoForward) {
      window.electronAPI.goForward(activeTab.id)
    }
  }

  const handleReloadOrStop = () => {
    if (!activeTab) return
    
    if (activeTab.isLoading) {
      window.electronAPI.stop(activeTab.id)
    } else {
      window.electronAPI.reload(activeTab.id)
    }
  }

  const handleOrbitLogoClick = () => {
    onNavigate('orbit://search')
    setShowDropdown(false)
    inputRef.current?.blur()
  }

  const handleFocus = () => {
    omniboxFocus()
  }

  const handleBlur = () => {
    omniboxBlur()
    if (!inputValue.trim() && activeTab) {
      setInputValue(activeTab.url)
      setUserTypedValue(activeTab.url)
    }
  }

  const handleStarClick = () => {
    if (!activeTab || activeTab.url.startsWith('orbit://')) return

    if (isBookmarked && existingBookmark) {
      // Edit existing bookmark
      setShowBookmarkDialog(true)
    } else {
      // Create new bookmark
      createBookmark()
    }
  }

  const createBookmark = async () => {
    if (!activeTab) return

    try {
      const roots = await window.electronAPI.bookmarks.getAllRoots()
      if (!roots) return

      const bookmarkBarId = roots.bookmark_bar.id

      await window.electronAPI.bookmarks.createBookmark(bookmarkBarId, {
        name: activeTab.title || 'Untitled',
        url: activeTab.url,
        type: 'url'
      })

      // Refresh bookmark status
      await checkIfBookmarked(activeTab.url)
    } catch (error) {
      console.error('Failed to create bookmark:', error)
    }
  }

  const handleSaveBookmark = async (id: string, updates: any) => {
    await window.electronAPI.bookmarks.updateBookmark(id, updates)
    if (activeTab) {
      await checkIfBookmarked(activeTab.url)
    }
  }

  const handleDeleteBookmark = async () => {
    if (existingBookmark) {
      if (confirm(`Remove bookmark "${existingBookmark.name}"?`)) {
        await window.electronAPI.bookmarks.deleteBookmark(existingBookmark.id)
        setIsBookmarked(false)
        setExistingBookmark(null)
        setShowBookmarkDialog(false)
      }
    }
  }

  // Display URL without protocol for cleaner look (only when not focused)
  const displayUrl = isFocused ? inputValue : formatDisplayUrl(inputValue)

  return (
    <div className="navigation-bar">
      <div className="nav-buttons">
        <button
          className="nav-btn"
          onClick={handleBack}
          disabled={!activeTab?.canGoBack}
          title="Go back"
        >
          <svg viewBox="0 0 16 16" fill="none">
            <path
              d="M10 3L5 8L10 13"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          className="nav-btn"
          onClick={handleForward}
          disabled={!activeTab?.canGoForward}
          title="Go forward"
        >
          <svg viewBox="0 0 16 16" fill="none">
            <path
              d="M6 3L11 8L6 13"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          className="nav-btn"
          onClick={handleReloadOrStop}
          disabled={!activeTab || activeTab.url.startsWith('orbit://')}
          title={activeTab?.isLoading ? 'Stop' : 'Reload'}
        >
          {activeTab?.isLoading ? (
            <svg viewBox="0 0 16 16" fill="none">
              <path
                d="M3 3L13 13M13 3L3 13"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" fill="none">
              <path
                d="M13.5 8A5.5 5.5 0 1 1 8 2.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M8 1V4L11 2.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      </div>

      <button
        type="button"
        className="url-brand url-brand-button"
        onClick={handleOrbitLogoClick}
        title="Go to Orbit search"
        aria-label="Go to Orbit search"
      >
        <img src={orbitLogo} alt="Orbit" className="url-brand-logo" />
      </button>

      <div 
        ref={urlBarRef}
        className={`url-bar ${isFocused ? 'focused' : ''} ${activeTab?.isLoading ? 'loading' : ''}`}
      >
        {activeTab?.favicon && !isFocused && (
          <img src={activeTab.favicon} alt="" className="url-favicon" />
        )}
        {!activeTab?.favicon && !isFocused && (
          <img src={orbitLogo} alt="" className="url-favicon" />
        )}
        <input
          ref={inputRef}
          type="text"
          className="url-input !outline-none !ring-0 !border-0 focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:outline-none"
          value={displayUrl}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="Search or enter URL"
          spellCheck={false}
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="both"
          aria-controls="autocomplete-dropdown"
        />
        {/* Star Button - only show for external pages */}
        {activeTab && !activeTab.url.startsWith('orbit://') && !activeTab.isLoading && (
          <button
            className="star-button"
            onClick={handleStarClick}
            title={isBookmarked ? 'Edit bookmark' : 'Bookmark this page'}
          >
            <Star
              size={16}
              fill={isBookmarked ? 'currentColor' : 'none'}
              strokeWidth={2}
            />
          </button>
        )}

        {activeTab?.isLoading && (
          <div className="loading-indicator">
            <div className="loading-spinner" />
          </div>
        )}

        {/* Autocomplete Dropdown - rendered via Portal for proper z-index layering */}
        {showDropdown && (
          <AutocompleteDropdown
            ref={dropdownRef}
            suggestions={suggestions}
            selectedIndex={selectedIndex}
            onSelect={handleSelectSuggestion}
            onDelete={handleDeleteSuggestion}
            inputValue={inputValue}
            anchorRect={anchorRect}
          />
        )}
      </div>

      {/* Profile Button + Assistant */}
      <div className="profile-button-container">
        <button
          className="nav-btn"
          onClick={() => assistantStore.toggle()}
          title="Open assistant (Ctrl/Cmd+K)"
        >
          <Sparkles size={16} />
        </button>
        <ProfileButton onNavigate={onNavigate} />
      </div>

      {/* Bookmark Edit Dialog */}
      {existingBookmark && (
        <EditBookmarkDialog
          bookmark={existingBookmark}
          isOpen={showBookmarkDialog}
          onClose={() => setShowBookmarkDialog(false)}
          onSave={handleSaveBookmark}
        />
      )}
    </div>
  )
}

// Format URL for display (remove protocol for cleaner look)
function formatDisplayUrl(url: string): string {
  if (!url) return ''
  if (url.startsWith('orbit://')) return url
  
  try {
    const urlObj = new URL(url)
    // Show full URL for non-standard ports
    if (urlObj.port && urlObj.port !== '80' && urlObj.port !== '443') {
      return url.replace(/^https?:\/\//, '')
    }
    return urlObj.host + urlObj.pathname + urlObj.search + urlObj.hash
  } catch {
    return url
  }
}
