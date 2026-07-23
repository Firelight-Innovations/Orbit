import { useState, useEffect, useRef } from 'react'
import { Search, Sparkles, Globe, Loader2 } from 'lucide-react'
import { Card, CardContent } from '../ui/card'
import { motion, AnimatePresence } from 'framer-motion'

interface SearchResult {
  title: string
  snippet: string
  url: string
  source: 'google' | 'bing' | 'duckduckgo'
  rank: number
  faviconUrl: string | null
  positionInSource: number
}

interface GoogleAIOverview {
  content: string
  sources: Array<{ title: string; url: string }>
}

interface SearchResponse {
  query: string
  aiOverview: GoogleAIOverview | null
  results: SearchResult[]
  cached: boolean
  timestamp: number
  error?: string
}

export function SearchPage() {
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Get query from URL if present
    const params = new URLSearchParams(window.location.search)
    const urlQuery = params.get('q')
    if (urlQuery) {
      setQuery(urlQuery)
      handleSearch(urlQuery)
    }

    // Focus input
    inputRef.current?.focus()
  }, [])

  const handleSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return

    setIsLoading(true)
    try {
      const results = await window.electronAPI.aiSearch.run(searchQuery)
      setSearchResults(results)
    } catch (error) {
      console.error('Search error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleSearch(query)
  }

  const handleResultClick = async (url: string) => {
    // Get current tab state
    const state = await window.electronAPI.getTabState()
    if (state && state.activeTabId) {
      // Navigate current tab to the URL
      await window.electronAPI.navigate(state.activeTabId, url)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--surface-base)] text-white">
      {/* Animated background stars */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {[...Array(50)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-white rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              opacity: Math.random() * 0.5 + 0.2
            }}
            animate={{
              scale: [1, 1.5, 1],
              opacity: [0.2, 0.8, 0.2]
            }}
            transition={{
              duration: Math.random() * 3 + 2,
              repeat: Infinity,
              delay: Math.random() * 2
            }}
          />
        ))}
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-8">
        {/* Logo and search bar */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12"
        >
          <div className="flex items-center justify-center mb-8">
            <Sparkles className="w-8 h-8 text-[var(--accent-primary)] mr-3" />
            <h1 className="orbit-serif text-5xl text-white">
              Orbit Search
            </h1>
          </div>

          <form onSubmit={handleSubmit} className="relative">
            <div className="relative flex items-center">
              <Search className="absolute left-4 w-5 h-5 text-white/40" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the cosmos..."
                className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] py-4 pl-12 pr-4 text-lg shadow-sm shadow-black/20 transition-colors placeholder:text-white/30 focus:border-[var(--border-default)] focus:outline-none"
              />
              {isLoading && (
                <Loader2 className="absolute right-4 w-5 h-5 text-[var(--accent-primary)] animate-spin" />
              )}
            </div>
          </form>
        </motion.div>

        {/* Results */}
        <AnimatePresence mode="wait">
          {searchResults && !isLoading && (
            <motion.div
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {/* AI Overview */}
              {searchResults.aiOverview && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <Card className="border-[var(--research)]/25 bg-[var(--research-soft)]">
                    <CardContent className="p-6">
                      <div className="flex items-start gap-3">
                        <Sparkles className="w-5 h-5 text-[var(--research)] mt-1 flex-shrink-0" />
                        <div className="flex-1">
                          <h2 className="mb-2 text-lg font-semibold text-[var(--research)]">
                            AI Overview
                          </h2>
                          <p className="leading-relaxed text-white/85">
                            {searchResults.aiOverview.content}
                          </p>
                          {searchResults.aiOverview.sources.length > 0 && (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {searchResults.aiOverview.sources.map((source, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => handleResultClick(source.url)}
                                  className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-1 text-xs text-white/70 transition-colors hover:border-[var(--border-default)] hover:text-white"
                                >
                                  {source.title || new URL(source.url).hostname}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* Search Results */}
              <div className="space-y-4">
                {searchResults.results.map((result, index) => (
                  <motion.div
                    key={`${result.url}-${index}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 * (index + 1) }}
                  >
                    <Card className="group cursor-pointer border-[var(--border-subtle)] bg-[var(--surface-raised)] transition-colors hover:border-[var(--border-default)]">
                      <CardContent className="p-5">
                        <button
                          onClick={() => handleResultClick(result.url)}
                          className="w-full text-left"
                        >
                          <div className="flex items-start gap-3">
                            {result.faviconUrl && (
                              <img
                                src={result.faviconUrl}
                                alt=""
                                className="w-6 h-6 rounded mt-1 flex-shrink-0"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none'
                                }}
                              />
                            )}
                            {!result.faviconUrl && (
                              <Globe className="w-6 h-6 text-white/40 mt-1 flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <h3 className="mb-1 line-clamp-2 text-xl font-medium text-[var(--accent-secondary)] transition-colors group-hover:text-[var(--accent-primary)]">
                                {result.title}
                              </h3>
                              <p className="mb-2 truncate text-sm text-white/40">
                                {new URL(result.url).hostname}
                              </p>
                              <p className="line-clamp-2 leading-relaxed text-white/60">
                                {result.snippet}
                              </p>
                              <div className="flex items-center gap-2 mt-3">
                                <span className={`text-xs px-2 py-1 rounded-full ${
                                  result.source === 'google'
                                    ? 'bg-[var(--accent-soft)] text-[var(--accent-secondary)]'
                                    : result.source === 'bing'
                                    ? 'bg-[var(--success)]/12 text-[var(--success)]'
                                    : 'bg-[var(--warning)]/12 text-[var(--warning)]'
                                }`}>
                                  {result.source}
                                </span>
                                <span className="text-xs text-white/25">
                                  #{result.positionInSource}
                                </span>
                              </div>
                            </div>
                          </div>
                        </button>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>

              {searchResults.results.length === 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-12"
                >
                  <p className="text-white/40">No results found for "{searchResults.query}"</p>
                </motion.div>
              )}

              {searchResults.cached && (
                <p className="mt-4 text-center text-xs text-white/25">
                  Results from cache
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading state */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-20"
          >
            <Loader2 className="w-12 h-12 text-[var(--accent-primary)] animate-spin mb-4" />
            <p className="text-white/40">Searching across the web...</p>
          </motion.div>
        )}

        {/* Empty state */}
        {!searchResults && !isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <Sparkles className="w-16 h-16 text-[var(--accent-primary)] mx-auto mb-4 opacity-40" />
            <p className="text-lg text-white/40">Enter a query to search the cosmos</p>
          </motion.div>
        )}
      </div>
    </div>
  )
}

