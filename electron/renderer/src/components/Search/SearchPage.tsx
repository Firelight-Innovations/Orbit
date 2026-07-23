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
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-black text-white">
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
            <Sparkles className="w-8 h-8 text-violet-400 mr-3" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-violet-400 to-purple-600 bg-clip-text text-transparent">
              Orbit Search
            </h1>
          </div>

          <form onSubmit={handleSubmit} className="relative">
            <div className="relative flex items-center">
              <Search className="absolute left-4 w-5 h-5 text-zinc-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the cosmos..."
                className="w-full pl-12 pr-4 py-4 bg-zinc-900/50 border border-zinc-700 rounded-2xl text-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent backdrop-blur-sm transition-all"
              />
              {isLoading && (
                <Loader2 className="absolute right-4 w-5 h-5 text-violet-400 animate-spin" />
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
                  <Card className="bg-gradient-to-br from-violet-900/20 to-purple-900/20 border-violet-700/30">
                    <CardContent className="p-6">
                      <div className="flex items-start gap-3">
                        <Sparkles className="w-5 h-5 text-violet-400 mt-1 flex-shrink-0" />
                        <div className="flex-1">
                          <h2 className="text-lg font-semibold text-violet-300 mb-2">
                            AI Overview
                          </h2>
                          <p className="text-zinc-300 leading-relaxed">
                            {searchResults.aiOverview.content}
                          </p>
                          {searchResults.aiOverview.sources.length > 0 && (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {searchResults.aiOverview.sources.map((source, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => handleResultClick(source.url)}
                                  className="text-xs px-3 py-1 bg-violet-800/30 hover:bg-violet-700/40 rounded-full text-violet-200 transition-colors"
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
                    <Card className="bg-zinc-900/40 border-zinc-800 hover:bg-zinc-900/60 hover:border-zinc-700 transition-all cursor-pointer group">
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
                              <Globe className="w-6 h-6 text-zinc-500 mt-1 flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <h3 className="text-xl font-medium text-violet-300 group-hover:text-violet-200 mb-1 line-clamp-2">
                                {result.title}
                              </h3>
                              <p className="text-sm text-zinc-500 mb-2 truncate">
                                {new URL(result.url).hostname}
                              </p>
                              <p className="text-zinc-400 line-clamp-2 leading-relaxed">
                                {result.snippet}
                              </p>
                              <div className="flex items-center gap-2 mt-3">
                                <span className={`text-xs px-2 py-1 rounded-full ${
                                  result.source === 'google'
                                    ? 'bg-blue-900/30 text-blue-300'
                                    : result.source === 'bing'
                                    ? 'bg-green-900/30 text-green-300'
                                    : 'bg-orange-900/30 text-orange-300'
                                }`}>
                                  {result.source}
                                </span>
                                <span className="text-xs text-zinc-600">
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
                  <p className="text-zinc-500">No results found for "{searchResults.query}"</p>
                </motion.div>
              )}

              {searchResults.cached && (
                <p className="text-center text-xs text-zinc-600 mt-4">
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
            <Loader2 className="w-12 h-12 text-violet-400 animate-spin mb-4" />
            <p className="text-zinc-500">Searching across the web...</p>
          </motion.div>
        )}

        {/* Empty state */}
        {!searchResults && !isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <Sparkles className="w-16 h-16 text-violet-400 mx-auto mb-4 opacity-50" />
            <p className="text-zinc-500 text-lg">Enter a query to search the cosmos</p>
          </motion.div>
        )}
      </div>
    </div>
  )
}

