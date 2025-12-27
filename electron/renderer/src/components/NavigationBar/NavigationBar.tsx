import { useState, useEffect, useRef, KeyboardEvent } from 'react'
import { useSearchHistory, type AutocompleteSuggestion } from '../../hooks/useSearchHistory'
import { AutocompleteDropdown, type AutocompleteDropdownRef } from './AutocompleteDropdown'
import { buildSearchUrl } from '../../config/searchEngines'
import orbitLogo from '../../assets/orbit_logo.png'
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
  // Track user's actual typed input for inline autocomplete
  const [userTypedValue, setUserTypedValue] = useState('')
  // Track if we should apply inline autocomplete (disabled during deletion)
  const [enableInlineAutocomplete, setEnableInlineAutocomplete] = useState(true)
  
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

  // Query suggestions when user types and focused
  useEffect(() => {
    if (isFocused && userTypedValue) {
      query(userTypedValue)
      setSelectedIndex(-1) // Reset selection on new input
    }
  }, [userTypedValue, isFocused, query])

  // Find best inline autocomplete match and apply it
  useEffect(() => {
    if (!isFocused || !enableInlineAutocomplete || !userTypedValue.trim()) {
      return
    }

    // Find first suggestion that starts with user's input (case-insensitive)
    // Skip search-action type suggestions for inline autocomplete
    const userLower = userTypedValue.toLowerCase()
    const match = suggestions.find(s => {
      if (s.type === 'search-action') return false
      const text = s.type === 'visit' && s.url ? s.url : s.displayText
      return text.toLowerCase().startsWith(userLower)
    })

    if (match) {
      const fullText = match.type === 'visit' && match.url ? match.url : match.displayText
      // Only apply if the match is longer than what user typed
      if (fullText.length > userTypedValue.length) {
        // Preserve the user's original casing for the typed portion
        const autocompletedValue = userTypedValue + fullText.slice(userTypedValue.length)
        setInputValue(autocompletedValue)
        
        // Select the autocompleted portion (will appear highlighted)
        requestAnimationFrame(() => {
          if (inputRef.current) {
            inputRef.current.setSelectionRange(userTypedValue.length, autocompletedValue.length)
          }
        })
        return
      }
    }

    // No match found, just show what user typed
    setInputValue(userTypedValue)
  }, [suggestions, userTypedValue, isFocused, enableInlineAutocomplete])

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

  const handleOrbitLogoClick = () => {
    onNavigate('orbit://search')
    setShowDropdown(false)
    inputRef.current?.blur()
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
          // Tab accepts inline autocomplete or selected suggestion
          e.preventDefault()
          if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
            // Use arrow-selected suggestion
            const suggestion = suggestions[selectedIndex]
            const value = suggestion.type === 'visit' && suggestion.url 
              ? suggestion.url 
              : suggestion.displayText
            setInputValue(value)
            setUserTypedValue(value)
            setSelectedIndex(-1)
          } else if (inputValue !== userTypedValue) {
            // Accept inline autocomplete
            setUserTypedValue(inputValue)
            // Move cursor to end
            requestAnimationFrame(() => {
              inputRef.current?.setSelectionRange(inputValue.length, inputValue.length)
            })
          }
          return

        case 'ArrowRight': {
          // Right arrow at end of typed text accepts inline autocomplete
          const selectionStart = inputRef.current?.selectionStart ?? 0
          if (selectionStart === userTypedValue.length && inputValue !== userTypedValue) {
            e.preventDefault()
            setUserTypedValue(inputValue)
            requestAnimationFrame(() => {
              inputRef.current?.setSelectionRange(inputValue.length, inputValue.length)
            })
          }
          return
        }
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      
      // If a suggestion is selected via arrow keys, use it
      if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
        handleSelectSuggestion(suggestions[selectedIndex])
      } else {
        // Use the full input value (includes inline autocomplete if active)
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

  /**
   * Handle input changes with inline autocomplete logic
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    const selectionStart = e.target.selectionStart ?? newValue.length
    
    // Determine if user is typing forward or deleting
    // If selection was at end and new value is shorter, user deleted
    // If new value is longer or equal and caret moved forward, user typed
    const isTypingForward = newValue.length >= userTypedValue.length && selectionStart >= userTypedValue.length
    
    if (isTypingForward) {
      // User is typing forward - update typed value and enable autocomplete
      setUserTypedValue(newValue)
      setEnableInlineAutocomplete(true)
    } else {
      // User deleted something - disable inline autocomplete, show exactly what they typed
      setUserTypedValue(newValue)
      setInputValue(newValue)
      setEnableInlineAutocomplete(false)
    }
  }

  const handleFocus = () => {
    setIsFocused(true)
    setSelectedIndex(-1)
    // Select all text on focus
    inputRef.current?.select()
    // Initialize user typed value from current input
    setUserTypedValue(inputValue)
    setEnableInlineAutocomplete(true)
    // Query for initial suggestions (recent history)
    query(inputValue)
  }

  const handleBlur = () => {
    setIsFocused(false)
    setSelectedIndex(-1)
    // Reset inline autocomplete state
    setEnableInlineAutocomplete(true)
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
          className="url-input"
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
