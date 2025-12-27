import { useState, useEffect, useRef, KeyboardEvent } from 'react'
import { useSearchHistory, type AutocompleteSuggestion } from '../../hooks/useSearchHistory'
import { AutocompleteDropdown, type AutocompleteDropdownRef } from './AutocompleteDropdown'
import { buildSearchUrl } from '../../config/searchEngines'
import './NavigationBar.css'

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
  const [inputValue, setInputValue] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<AutocompleteDropdownRef>(null)
  const urlBarRef = useRef<HTMLDivElement>(null)

  const {
    suggestions,
    query,
    addSearch,
    clearSuggestions,
    deleteSuggestion
  } = useSearchHistory({ debounceMs: 150, maxSuggestions: 8 })

  // Update input value when active tab URL changes
  useEffect(() => {
    if (activeTab && !isFocused) {
      setInputValue(activeTab.url)
    }
  }, [activeTab?.url, isFocused])

  // Query suggestions when input changes and focused
  useEffect(() => {
    if (isFocused) {
      query(inputValue)
      setSelectedIndex(-1) // Reset selection on new input
    }
  }, [inputValue, isFocused, query])

  // Show dropdown whenever URL bar is focused (Chrome-like behavior)
  useEffect(() => {
    if (isFocused) {
      setShowDropdown(true)
    } else {
      // Small delay before hiding to allow click events on dropdown
      const timer = setTimeout(() => {
        setShowDropdown(false)
        clearSuggestions()
      }, 150)
      return () => clearTimeout(timer)
    }
  }, [isFocused, clearSuggestions])

  // Update anchor rect for portal positioning when dropdown shows
  useEffect(() => {
    if (showDropdown && urlBarRef.current) {
      const updateRect = () => {
        setAnchorRect(urlBarRef.current?.getBoundingClientRect() ?? null)
      }
      updateRect()
      window.addEventListener('resize', updateRect)
      return () => window.removeEventListener('resize', updateRect)
    }
  }, [showDropdown])

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

  /**
   * Navigate to a URL or search query
   * @param value - The URL or search query
   * @param searchEngineId - Optional search engine to use (defaults to 'orbit')
   */
  const performNavigation = (value: string, searchEngineId: string = 'orbit') => {
    const trimmed = value.trim()
    if (!trimmed) return

    // Record the search/navigation
    if (isLikelyUrl(trimmed)) {
      // It's a URL - will be recorded as visit when page loads
      onNavigate(trimmed)
    } else {
      // It's a search query - record it and use search engine
      addSearch(trimmed)
      const searchUrl = buildSearchUrl(searchEngineId, trimmed)
      onNavigate(searchUrl)
    }

    setShowDropdown(false)
    inputRef.current?.blur()
  }

  /**
   * Handle selecting a suggestion from the dropdown
   */
  const handleSelectSuggestion = (suggestion: AutocompleteSuggestion) => {
    if (suggestion.type === 'search-action' && suggestion.searchEngine) {
      // It's a search action - use the specified search engine
      setInputValue(suggestion.displayText)
      addSearch(suggestion.displayText)
      const searchUrl = buildSearchUrl(suggestion.searchEngine, suggestion.displayText)
      onNavigate(searchUrl)
    } else if (suggestion.type === 'visit' && suggestion.url) {
      // Navigate to the URL
      setInputValue(suggestion.url)
      onNavigate(suggestion.url)
    } else {
      // It's a past search - use the display text with default engine
      setInputValue(suggestion.displayText)
      performNavigation(suggestion.displayText)
    }
    setShowDropdown(false)
    inputRef.current?.blur()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Handle dropdown navigation
    if (showDropdown && suggestions.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(prev => 
            prev < suggestions.length - 1 ? prev + 1 : prev
          )
          return

        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1))
          return

        case 'Tab':
          // Tab to select current suggestion without navigating
          if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
            e.preventDefault()
            const suggestion = suggestions[selectedIndex]
            if (suggestion.type === 'visit' && suggestion.url) {
              setInputValue(suggestion.url)
            } else {
              setInputValue(suggestion.displayText)
            }
            setSelectedIndex(-1)
          }
          return
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      
      // If a suggestion is selected, use it
      if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
        handleSelectSuggestion(suggestions[selectedIndex])
      } else {
        // Shift+Enter uses Google, regular Enter uses Orbit (default)
        const searchEngine = e.shiftKey ? 'google' : 'orbit'
        performNavigation(inputValue, searchEngine)
      }
    } else if (e.key === 'Escape') {
      if (showDropdown) {
        // First escape closes dropdown
        setShowDropdown(false)
        setSelectedIndex(-1)
      } else {
        // Second escape restores URL and blurs
        if (activeTab) {
          setInputValue(activeTab.url)
        }
        inputRef.current?.blur()
      }
    }
  }

  const handleFocus = () => {
    setIsFocused(true)
    setSelectedIndex(-1)
    // Select all text on focus
    inputRef.current?.select()
    // Query for initial suggestions (recent history)
    query(inputValue)
  }

  const handleBlur = () => {
    setIsFocused(false)
    setSelectedIndex(-1)
    // Restore URL if input is empty
    if (!inputValue.trim() && activeTab) {
      setInputValue(activeTab.url)
    }
  }

  const handleDeleteSuggestion = async (id: number) => {
    await deleteSuggestion(id)
    // Adjust selected index if needed
    if (selectedIndex >= suggestions.length - 1) {
      setSelectedIndex(Math.max(-1, suggestions.length - 2))
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

      <div 
        ref={urlBarRef}
        className={`url-bar ${isFocused ? 'focused' : ''} ${activeTab?.isLoading ? 'loading' : ''}`}
      >
        {activeTab?.favicon && !isFocused && (
          <img src={activeTab.favicon} alt="" className="url-favicon" />
        )}
        {!activeTab?.favicon && !isFocused && (
          <div className="url-icon">
            {activeTab?.url.startsWith('orbit://') ? (
              <svg viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="8" cy="8" r="2" fill="currentColor" />
              </svg>
            ) : activeTab?.url.startsWith('https://') ? (
              <svg viewBox="0 0 16 16" fill="none">
                <rect x="3" y="7" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            )}
          </div>
        )}
        <input
          ref={inputRef}
          type="text"
          className="url-input"
          value={displayUrl}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="Search or enter URL"
          spellCheck={false}
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          aria-controls="autocomplete-dropdown"
        />
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

// Check if input looks like a URL rather than a search query
function isLikelyUrl(input: string): boolean {
  // Has protocol
  if (/^https?:\/\//i.test(input)) return true
  if (input.startsWith('orbit://')) return true
  
  // Looks like a domain (contains dot, no spaces)
  if (/^[^\s]+\.[^\s]+$/.test(input)) return true
  
  // localhost or IP
  if (/^localhost(:\d+)?$/i.test(input)) return true
  if (/^\d+\.\d+\.\d+\.\d+(:\d+)?$/.test(input)) return true
  
  return false
}
