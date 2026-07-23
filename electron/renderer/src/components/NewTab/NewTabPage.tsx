import { useState, useEffect } from 'react'
import { BookmarkNode } from '@/../../preload/index'
import { Plus } from 'lucide-react'
import orbitLogo from '../../assets/orbit_logo.png'
import { AutocompleteDropdown } from '../NavigationBar/AutocompleteDropdown'
import { useUrlInput } from '../../hooks/useUrlInput'
import '../NavigationBar/NavigationBar.css'

interface NewTabPageProps {
  onNavigate: (url: string) => void
}

export function NewTabPage({ onNavigate }: NewTabPageProps) {
  const [shortcuts, setShortcuts] = useState<BookmarkNode[]>([])

  const {
    inputValue,
    suggestions,
    isFocused,
    showDropdown,
    selectedIndex,
    anchorRect,
    inputRef,
    dropdownRef,
    anchorRef: urlBarRef,
    handleInputChange,
    handleKeyDown,
    handleFocus,
    handleBlur,
    handleSelectSuggestion,
    handleDeleteSuggestion,
    performNavigation
  } = useUrlInput({ onNavigate })

  useEffect(() => {
    loadShortcuts()

    // Subscribe to bookmark changes
    const unsubscribe = window.electronAPI.bookmarks.onBookmarksChanged(() => {
      loadShortcuts()
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const loadShortcuts = async () => {
    try {
      const bar = await window.electronAPI.bookmarks.getBookmarksBar()
      if (bar && bar.children) {
        // Get first 10 bookmarks (not folders)
        const bookmarkItems = bar.children
          .filter(item => item.type === 'url')
          .slice(0, 10)
        setShortcuts(bookmarkItems)
      }
    } catch (error) {
      console.error('Failed to load shortcuts:', error)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    performNavigation(inputValue)
  }

  const handleShortcutClick = (url: string) => {
    onNavigate(url)
  }

  const getFaviconUrl = (url: string) => {
    try {
      const urlObj = new URL(url)
      return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`
    } catch {
      return orbitLogo
    }
  }

  const getShortName = (name: string) => {
    if (name.length <= 12) return name
    return name.substring(0, 12) + '...'
  }

  return (
    // Simplicity's home screen is a single centred column on a flat base tone;
    // no gradient wash behind it.
    <div className="flex h-full w-full flex-col items-center justify-center bg-[var(--surface-base)]">
      {/* Search Bar */}
      <div className="w-full max-w-2xl px-8 mb-12">
        <form onSubmit={handleSubmit}>
          <div
            ref={urlBarRef}
            className={`url-bar ${isFocused ? 'focused' : ''}`}
          >
            <img src={orbitLogo} alt="Orbit" className="url-favicon" />
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={handleFocus}
              onBlur={handleBlur}
              placeholder="Search or enter URL"
              spellCheck={false}
              className="url-input !outline-none !ring-0 !border-0 focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:outline-none"
              autoFocus
              role="combobox"
              aria-expanded={showDropdown}
              aria-autocomplete="both"
              aria-controls="autocomplete-dropdown"
            />
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
        </form>
      </div>

      {/* Shortcuts Grid */}
      {shortcuts.length > 0 && (
        <div className="w-full max-w-4xl px-8">
          <div className="grid grid-cols-5 gap-6">
            {shortcuts.map((shortcut) => (
              <button
                key={shortcut.id}
                onClick={() => handleShortcutClick(shortcut.url!)}
                className="group flex flex-col items-center gap-3 rounded-xl p-4 transition-colors hover:bg-[var(--surface-raised)]"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] transition-colors group-hover:border-[var(--border-default)]">
                  <img
                    src={getFaviconUrl(shortcut.url!)}
                    alt={shortcut.name}
                    className="w-10 h-10"
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).src = orbitLogo
                    }}
                  />
                </div>
                <span className="text-center text-sm text-white/60 transition-colors group-hover:text-white/90">
                  {getShortName(shortcut.name)}
                </span>
              </button>
            ))}

            {/* Add Shortcut Button */}
            <button
              onClick={() => onNavigate('orbit://bookmarks')}
              className="group flex flex-col items-center gap-3 rounded-xl p-4 transition-colors hover:bg-[var(--surface-raised)]"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-[var(--border-subtle)] transition-colors group-hover:border-[var(--border-default)]">
                <Plus className="h-8 w-8 text-white/40" />
              </div>
              <span className="text-center text-sm text-white/40 transition-colors group-hover:text-white/60">
                Add shortcut
              </span>
            </button>
          </div>
        </div>
      )}

      {shortcuts.length === 0 && (
        <div className="text-center text-white/40">
          <p className="mb-4">No bookmarks yet</p>
          <button
            onClick={() => onNavigate('orbit://bookmarks')}
            className="rounded-full bg-[var(--accent-primary)] px-6 py-3 text-white transition-colors hover:bg-[var(--accent-hover)]"
          >
            Manage Bookmarks
          </button>
        </div>
      )}
    </div>
  )
}

