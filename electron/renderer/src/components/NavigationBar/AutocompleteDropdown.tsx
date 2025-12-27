import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import type { AutocompleteSuggestion } from '../../hooks/useSearchHistory'
import './AutocompleteDropdown.css'

interface AutocompleteDropdownProps {
  suggestions: AutocompleteSuggestion[]
  selectedIndex: number
  onSelect: (suggestion: AutocompleteSuggestion) => void
  onDelete?: (id: number) => void
  inputValue: string
}

export interface AutocompleteDropdownRef {
  scrollSelectedIntoView: () => void
}

/**
 * Dropdown component for displaying autocomplete suggestions.
 * Styled similar to Chrome's omnibox with support for keyboard navigation.
 * Supports search actions, history, and visits with visual grouping.
 */
export const AutocompleteDropdown = forwardRef<AutocompleteDropdownRef, AutocompleteDropdownProps>(
  function AutocompleteDropdown(
    { suggestions, selectedIndex, onSelect, onDelete, inputValue },
    ref
  ) {
    const listRef = useRef<HTMLUListElement>(null)
    const selectedItemRef = useRef<HTMLLIElement>(null)

    // Expose method to scroll selected item into view
    useImperativeHandle(ref, () => ({
      scrollSelectedIntoView: () => {
        selectedItemRef.current?.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth'
        })
      }
    }))

    // Scroll selected item into view when selection changes
    useEffect(() => {
      selectedItemRef.current?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      })
    }, [selectedIndex])

    // Group suggestions by type
    const searchActions = suggestions.filter(s => s.type === 'search-action')
    const historySuggestions = suggestions.filter(s => s.type !== 'search-action')

    // Highlight matching text in the suggestion
    const highlightMatch = (text: string) => {
      if (!inputValue.trim()) return text

      const lowerText = text.toLowerCase()
      const lowerInput = inputValue.toLowerCase()
      const matchIndex = lowerText.indexOf(lowerInput)

      if (matchIndex === -1) return text

      const before = text.slice(0, matchIndex)
      const match = text.slice(matchIndex, matchIndex + inputValue.length)
      const after = text.slice(matchIndex + inputValue.length)

      return (
        <>
          {before}
          <span className="highlight">{match}</span>
          {after}
        </>
      )
    }

    // Get icon for search engine
    const getSearchEngineIcon = (engine?: string) => {
      if (engine === 'google') {
        // Google "G" icon
        return (
          <svg viewBox="0 0 16 16" fill="none" className="suggestion-icon google-icon">
            <path d="M8 3.5c1.25 0 2.38.47 3.25 1.25l2.37-2.37C12.13 1.02 10.17 0 8 0 4.87 0 2.17 1.73.82 4.27l2.75 2.13C4.22 4.53 5.92 3.5 8 3.5z" fill="#EA4335"/>
            <path d="M15.5 8.18c0-.65-.06-1.28-.17-1.88H8v3.56h4.21c-.18.97-.73 1.79-1.56 2.34l2.52 1.96c1.48-1.36 2.33-3.37 2.33-5.98z" fill="#4285F4"/>
            <path d="M3.57 9.6c-.22-.65-.35-1.34-.35-2.06s.13-1.41.35-2.06L.82 3.35C.3 4.39 0 5.55 0 6.8s.3 2.41.82 3.45l2.75-2.13z" fill="#FBBC05"/>
            <path d="M8 13.5c-2.08 0-3.78-1.03-4.43-2.53l-2.75 2.13C2.17 15.27 4.87 17 8 17c2.17 0 4.13-1.02 5.62-2.62l-2.52-1.96c-.87.58-1.96.92-3.1.92z" fill="#34A853"/>
          </svg>
        )
      }
      
      // Orbit icon (default)
      return (
        <svg viewBox="0 0 16 16" fill="none" className="suggestion-icon orbit-icon">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="8" cy="8" r="2" fill="currentColor" />
          <ellipse cx="8" cy="8" rx="6" ry="2.5" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
        </svg>
      )
    }

    // Get icon for suggestion type
    const getIcon = (suggestion: AutocompleteSuggestion) => {
      if (suggestion.type === 'search-action') {
        return getSearchEngineIcon(suggestion.searchEngine)
      }

      if (suggestion.type === 'search') {
        // Search icon
        return (
          <svg viewBox="0 0 16 16" fill="none" className="suggestion-icon search-icon">
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )
      }

      // For visits, try to show favicon or fallback to globe icon
      if (suggestion.favicon) {
        return (
          <img 
            src={suggestion.favicon} 
            alt="" 
            className="suggestion-icon suggestion-favicon"
            onError={(e) => {
              // Fallback to globe icon on error
              e.currentTarget.style.display = 'none'
              e.currentTarget.nextElementSibling?.classList.remove('hidden')
            }}
          />
        )
      }

      // Globe icon for URLs
      return (
        <svg viewBox="0 0 16 16" fill="none" className="suggestion-icon visit-icon">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
          <ellipse cx="8" cy="8" rx="3" ry="6" stroke="currentColor" strokeWidth="1.5" />
          <path d="M2 8h12" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )
    }

    // Calculate actual index in the combined list
    const getActualIndex = (isAction: boolean, localIndex: number) => {
      if (isAction) {
        return localIndex
      }
      return searchActions.length + localIndex
    }

    // Render a search action item
    const renderSearchAction = (suggestion: AutocompleteSuggestion, localIndex: number) => {
      const actualIndex = getActualIndex(true, localIndex)
      return (
        <li
          key={suggestion.id}
          ref={actualIndex === selectedIndex ? selectedItemRef : null}
          className={`autocomplete-item search-action-item ${actualIndex === selectedIndex ? 'selected' : ''}`}
          onClick={() => onSelect(suggestion)}
          onMouseDown={(e) => e.preventDefault()}
          role="option"
          aria-selected={actualIndex === selectedIndex}
        >
          <div className="suggestion-icon-container">
            {getIcon(suggestion)}
          </div>
          
          <div className="suggestion-content">
            <span className="suggestion-text">
              {highlightMatch(suggestion.displayText)}
            </span>
          </div>

          {suggestion.shortcut && (
            <span className="shortcut-hint">{suggestion.shortcut}</span>
          )}

          <div className="action-label">
            <span>{suggestion.actionLabel}</span>
            <svg viewBox="0 0 16 16" fill="none" className="action-arrow">
              <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </li>
      )
    }

    // Render a history/visit item
    const renderHistoryItem = (suggestion: AutocompleteSuggestion, localIndex: number) => {
      const actualIndex = getActualIndex(false, localIndex)
      return (
        <li
          key={suggestion.id}
          ref={actualIndex === selectedIndex ? selectedItemRef : null}
          className={`autocomplete-item ${actualIndex === selectedIndex ? 'selected' : ''}`}
          onClick={() => onSelect(suggestion)}
          onMouseDown={(e) => e.preventDefault()}
          role="option"
          aria-selected={actualIndex === selectedIndex}
        >
          <div className="suggestion-icon-container">
            {getIcon(suggestion)}
            {/* Hidden fallback globe icon for favicon errors */}
            {suggestion.favicon && (
              <svg viewBox="0 0 16 16" fill="none" className="suggestion-icon visit-icon hidden">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
                <ellipse cx="8" cy="8" rx="3" ry="6" stroke="currentColor" strokeWidth="1.5" />
                <path d="M2 8h12" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            )}
          </div>
          
          <div className="suggestion-content">
            <span className="suggestion-text">
              {highlightMatch(suggestion.displayText)}
            </span>
            {suggestion.type === 'visit' && suggestion.url && (
              <span className="suggestion-url">
                {formatUrl(suggestion.url)}
              </span>
            )}
          </div>

          <div className="suggestion-meta">
            {suggestion.type === 'search' && (
              <span className="suggestion-type-badge">Search</span>
            )}
            {suggestion.visitCount > 1 && (
              <span className="suggestion-visit-count" title={`Visited ${suggestion.visitCount} times`}>
                {suggestion.visitCount}
              </span>
            )}
          </div>

          {onDelete && suggestion.id > 0 && (
            <button
              className="suggestion-delete"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(suggestion.id)
              }}
              onMouseDown={(e) => e.preventDefault()}
              title="Remove from history"
            >
              <svg viewBox="0 0 16 16" fill="none">
                <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </li>
      )
    }

    return (
      <div className="autocomplete-dropdown">
        {suggestions.length === 0 ? (
          <div className="autocomplete-empty">
            <div className="empty-icon">
              <svg viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <span>Type to search or enter a URL</span>
          </div>
        ) : (
          <ul ref={listRef} className="autocomplete-list" role="listbox">
            {/* Search Actions Section */}
            {searchActions.map((suggestion, index) => renderSearchAction(suggestion, index))}
            
            {/* Divider between search actions and history */}
            {searchActions.length > 0 && historySuggestions.length > 0 && (
              <li className="suggestion-divider" role="separator" aria-hidden="true" />
            )}
            
            {/* History Section */}
            {historySuggestions.map((suggestion, index) => renderHistoryItem(suggestion, index))}
          </ul>
        )}

        {/* === PLACEHOLDER: AI_AUTOCOMPLETE === */}
        {/* TODO: Add AI suggestions section here when implemented */}
        {/* This would show intelligent completions from the AI service */}
        {/* <div className="ai-suggestions-section">
          <div className="ai-suggestions-header">
            <span className="ai-icon">✨</span>
            <span>AI Suggestions</span>
          </div>
          <ul className="ai-suggestions-list">
            ... AI-powered suggestions ...
          </ul>
        </div> */}
        {/* === END PLACEHOLDER === */}
      </div>
    )
  }
)

/**
 * Format URL for display (remove protocol, trim trailing slash)
 */
function formatUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    let display = urlObj.host + urlObj.pathname
    if (display.endsWith('/')) {
      display = display.slice(0, -1)
    }
    return display
  } catch {
    return url
  }
}
