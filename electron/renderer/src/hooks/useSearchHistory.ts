import { useState, useCallback, useRef, useEffect } from 'react'

export interface AutocompleteSuggestion {
  id: number
  type: 'search' | 'visit' | 'search-action'
  displayText: string
  url: string | null
  favicon: string | null
  visitCount: number
  aiConfidence?: number
  // Search action fields
  searchEngine?: string    // 'orbit' | 'google'
  actionLabel?: string     // 'Search Orbit'
  shortcut?: string        // 'Shift+Enter'
}

interface UseSearchHistoryOptions {
  debounceMs?: number
  maxSuggestions?: number
}

interface UseSearchHistoryReturn {
  suggestions: AutocompleteSuggestion[]
  isLoading: boolean
  query: (input: string) => void
  addSearch: (searchQuery: string) => Promise<void>
  addVisit: (url: string, title?: string, favicon?: string) => Promise<void>
  clearSuggestions: () => void
  deleteSuggestion: (id: number) => Promise<boolean>
}

/**
 * Hook for managing search history and autocomplete suggestions.
 * Provides debounced querying and suggestion management.
 */
export function useSearchHistory(options: UseSearchHistoryOptions = {}): UseSearchHistoryReturn {
  const { debounceMs = 150, maxSuggestions = 8 } = options
  
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([])
  const [isLoading, setIsLoading] = useState(false)
  
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastQueryRef = useRef<string>('')

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  /**
   * Query suggestions with debouncing
   */
  const query = useCallback((input: string) => {
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    lastQueryRef.current = input

    // If empty, get recent suggestions immediately
    if (!input.trim()) {
      setIsLoading(true)
      window.electronAPI.searchHistory.getRecent(maxSuggestions)
        .then((results) => {
          // Only update if this is still the current query
          if (lastQueryRef.current === input) {
            setSuggestions(results)
          }
        })
        .catch((error) => {
          console.error('Error fetching recent suggestions:', error)
          setSuggestions([])
        })
        .finally(() => {
          if (lastQueryRef.current === input) {
            setIsLoading(false)
          }
        })
      return
    }

    // Debounce the query for non-empty input
    setIsLoading(true)
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const results = await window.electronAPI.searchHistory.query(input, maxSuggestions)
        // Only update if this is still the current query
        if (lastQueryRef.current === input) {
          setSuggestions(results)
        }
      } catch (error) {
        console.error('Error querying suggestions:', error)
        if (lastQueryRef.current === input) {
          setSuggestions([])
        }
      } finally {
        if (lastQueryRef.current === input) {
          setIsLoading(false)
        }
      }
    }, debounceMs)
  }, [debounceMs, maxSuggestions])

  /**
   * Record a search query
   */
  const addSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) return
    
    try {
      await window.electronAPI.searchHistory.addSearch(searchQuery)
    } catch (error) {
      console.error('Error recording search:', error)
    }
  }, [])

  /**
   * Record a URL visit
   */
  const addVisit = useCallback(async (url: string, title?: string, favicon?: string) => {
    if (!url.trim()) return
    
    try {
      await window.electronAPI.searchHistory.addVisit(url, title, favicon)
    } catch (error) {
      console.error('Error recording visit:', error)
    }
  }, [])

  /**
   * Clear current suggestions
   */
  const clearSuggestions = useCallback(() => {
    setSuggestions([])
    lastQueryRef.current = ''
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
  }, [])

  /**
   * Delete a specific suggestion from history
   */
  const deleteSuggestion = useCallback(async (id: number): Promise<boolean> => {
    try {
      const success = await window.electronAPI.searchHistory.delete(id)
      if (success) {
        // Remove from current suggestions
        setSuggestions(prev => prev.filter(s => s.id !== id))
      }
      return success
    } catch (error) {
      console.error('Error deleting suggestion:', error)
      return false
    }
  }, [])

  return {
    suggestions,
    isLoading,
    query,
    addSearch,
    addVisit,
    clearSuggestions,
    deleteSuggestion
  }
}

