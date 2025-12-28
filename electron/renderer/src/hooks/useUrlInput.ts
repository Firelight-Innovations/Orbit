import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { buildSearchUrl } from '../config/searchEngines'
import { AutocompleteDropdownRef } from '../components/NavigationBar/AutocompleteDropdown'
import { useSearchHistory, type AutocompleteSuggestion } from './useSearchHistory'

interface UseUrlInputOptions {
  onNavigate: (url: string) => void
  defaultSearchEngine?: string
  debounceMs?: number
  maxSuggestions?: number
}

export function useUrlInput({
  onNavigate,
  defaultSearchEngine = 'orbit',
  debounceMs = 150,
  maxSuggestions = 8
}: UseUrlInputOptions) {
  const [inputValue, setInputValue] = useState('')
  const [userTypedValue, setUserTypedValue] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const [enableInlineAutocomplete, setEnableInlineAutocomplete] = useState(true)

  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<AutocompleteDropdownRef>(null)
  const anchorRef = useRef<HTMLDivElement>(null)

  const {
    suggestions,
    query,
    addSearch,
    clearSuggestions,
    deleteSuggestion
  } = useSearchHistory({ debounceMs, maxSuggestions })

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

    const userLower = userTypedValue.toLowerCase()
    const match = suggestions.find(s => {
      if (s.type === 'search-action') return false
      const text = s.type === 'visit' && s.url ? s.url : s.displayText
      return text.toLowerCase().startsWith(userLower)
    })

    if (match) {
      const fullText = match.type === 'visit' && match.url ? match.url : match.displayText
      if (fullText.length > userTypedValue.length) {
        const autocompletedValue = userTypedValue + fullText.slice(userTypedValue.length)
        setInputValue(autocompletedValue)

        requestAnimationFrame(() => {
          if (inputRef.current) {
            inputRef.current.setSelectionRange(userTypedValue.length, autocompletedValue.length)
          }
        })
        return
      }
    }

    setInputValue(userTypedValue)
  }, [suggestions, userTypedValue, isFocused, enableInlineAutocomplete])

  // Show dropdown when focused, hide on blur with slight delay
  useEffect(() => {
    if (isFocused) {
      setShowDropdown(true)
    } else {
      const timer = setTimeout(() => {
        setShowDropdown(false)
        clearSuggestions()
      }, 150)
      return () => clearTimeout(timer)
    }
  }, [isFocused, clearSuggestions])

  // Track anchor size for portal positioning
  useEffect(() => {
    if (showDropdown && anchorRef.current) {
      const updateRect = () => {
        setAnchorRect(anchorRef.current?.getBoundingClientRect() ?? null)
      }
      updateRect()
      window.addEventListener('resize', updateRect)
      return () => window.removeEventListener('resize', updateRect)
    }
  }, [showDropdown])

  const performNavigation = (value: string, searchEngineId: string = defaultSearchEngine) => {
    const trimmed = value.trim()
    if (!trimmed) return

    if (isLikelyUrl(trimmed)) {
      onNavigate(trimmed)
    } else {
      addSearch(trimmed)
      const searchUrl = buildSearchUrl(searchEngineId, trimmed)
      onNavigate(searchUrl)
    }

    setShowDropdown(false)
    inputRef.current?.blur()
  }

  const handleSelectSuggestion = (suggestion: AutocompleteSuggestion) => {
    if (suggestion.type === 'search-action' && suggestion.searchEngine) {
      setInputValue(suggestion.displayText)
      addSearch(suggestion.displayText)
      const searchUrl = buildSearchUrl(suggestion.searchEngine, suggestion.displayText)
      onNavigate(searchUrl)
    } else if (suggestion.type === 'visit' && suggestion.url) {
      setInputValue(suggestion.url)
      onNavigate(suggestion.url)
    } else {
      setInputValue(suggestion.displayText)
      performNavigation(suggestion.displayText)
    }
    setShowDropdown(false)
    inputRef.current?.blur()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (showDropdown && suggestions.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev))
          return

        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1))
          return

        case 'Tab':
          e.preventDefault()
          if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
            const suggestion = suggestions[selectedIndex]
            const value =
              suggestion.type === 'visit' && suggestion.url
                ? suggestion.url
                : suggestion.displayText
            setInputValue(value)
            setUserTypedValue(value)
            setSelectedIndex(-1)
          } else if (inputValue !== userTypedValue) {
            setUserTypedValue(inputValue)
            requestAnimationFrame(() => {
              inputRef.current?.setSelectionRange(inputValue.length, inputValue.length)
            })
          }
          return

        case 'ArrowRight': {
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

      if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
        handleSelectSuggestion(suggestions[selectedIndex])
      } else {
        const searchEngine = e.shiftKey ? 'google' : defaultSearchEngine
        performNavigation(inputValue, searchEngine)
      }
    } else if (e.key === 'Escape') {
      if (showDropdown) {
        setShowDropdown(false)
        setSelectedIndex(-1)
      } else {
        inputRef.current?.blur()
      }
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    const selectionStart = e.target.selectionStart ?? newValue.length

    const isTypingForward = newValue.length >= userTypedValue.length && selectionStart >= userTypedValue.length

    if (isTypingForward) {
      setUserTypedValue(newValue)
      setEnableInlineAutocomplete(true)
    } else {
      setUserTypedValue(newValue)
      setInputValue(newValue)
      setEnableInlineAutocomplete(false)
    }
  }

  const handleFocus = () => {
    setIsFocused(true)
    setSelectedIndex(-1)
    inputRef.current?.select()
    setUserTypedValue(inputValue)
    setEnableInlineAutocomplete(true)
    query(inputValue)
  }

  const handleBlur = () => {
    setIsFocused(false)
    setSelectedIndex(-1)
    setEnableInlineAutocomplete(true)
  }

  const handleDeleteSuggestion = async (id: number) => {
    await deleteSuggestion(id)
    if (selectedIndex >= suggestions.length - 1) {
      setSelectedIndex(Math.max(-1, suggestions.length - 2))
    }
  }

  return {
    // state
    inputValue,
    setInputValue,
    userTypedValue,
    setUserTypedValue,
    suggestions,
    isFocused,
    showDropdown,
    setShowDropdown,
    selectedIndex,
    setSelectedIndex,
    anchorRect,
    // refs
    inputRef,
    dropdownRef,
    anchorRef,
    // handlers
    handleInputChange,
    handleKeyDown,
    handleFocus,
    handleBlur,
    handleSelectSuggestion,
    handleDeleteSuggestion,
    performNavigation
  }
}

// Check if input looks like a URL rather than a search query
export function isLikelyUrl(input: string): boolean {
  if (/^https?:\/\//i.test(input)) return true
  if (input.startsWith('orbit://')) return true
  if (/^[^\s]+\.[^\s]+$/.test(input)) return true
  if (/^localhost(:\d+)?$/i.test(input)) return true
  if (/^\d+\.\d+\.\d+\.\d+(:\d+)?$/.test(input)) return true
  return false
}

