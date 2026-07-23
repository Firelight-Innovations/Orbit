# Orbit AI Search

The Orbit AI Search feature provides an intelligent, privacy-focused search experience that aggregates results from multiple search engines and ranks them by relevance.

## Features

- **Multi-Engine Search**: Simultaneously queries Google, Bing, and DuckDuckGo
- **AI Overview**: Extracts and displays Google's AI-generated overview when available
- **Ad-Free Results**: Automatically filters out advertisements from all search engines
- **Smart Ranking**: Results are ranked based on:
  - Source engine weight (Google > Bing > DuckDuckGo)
  - Position in original search results
  - Deduplication by normalized URL
- **Result Caching**: Stores search results for 1 hour to improve performance
- **Resource Optimization**: Throttles images and fonts in hidden tabs for faster searches
- **Privacy-Focused**: Uses the existing Chromium instance - no external API calls

## Usage

### From URL Bar

Navigate to any of these formats:

```
orbit://search
orbit://search?q=your+query+here
orbit://search?q=firelight%20innovations
```

### From Search Box

1. Navigate to `orbit://search`
2. Enter your query in the search box
3. Press Enter or click the search button
4. Results appear within 10 seconds

## Technical Architecture

### Components

1. **AI Search Service** (`electron/main/services/aiSearchService.ts`)
   - Connects to Chromium via Chrome DevTools Protocol (CDP)
   - Creates hidden browser contexts for parallel searches
   - Scrapes organic results and AI overviews
   - Implements caching with SQLite database

2. **IPC Handler** (`electron/main/ipc.ts`)
   - Exposes `aiSearch:run` method to renderer process
   - Handles errors gracefully

3. **Search UI** (`electron/renderer/src/components/Search/SearchPage.tsx`)
   - Minimalist, space-themed design
   - Animated starfield background
   - Real-time loading states
   - Click-to-navigate results

### Search Flow

```
User Query → IPC Bridge → AI Search Service
                              ↓
                    Check Cache (1hr TTL)
                              ↓
                   [Google] [Bing] [DuckDuckGo]
                              ↓
                    Parallel Scraping (10s timeout)
                              ↓
                    Extract Results + AI Overview
                              ↓
                    Filter Ads & Deduplicate
                              ↓
                    Rank & Merge Results
                              ↓
                    Cache & Return JSON
                              ↓
                    Display in UI
```

### Result Schema

```typescript
interface SearchResponse {
  query: string
  aiOverview: GoogleAIOverview | null
  results: SearchResult[]
  cached: boolean
  timestamp: number
  error?: string
}

interface SearchResult {
  title: string
  snippet: string
  url: string
  source: 'google' | 'bing' | 'duckduckgo'
  rank: number
  faviconUrl: string | null
  positionInSource: number
}
```

## Configuration

Edit `CONFIG` in `aiSearchService.ts`:

```typescript
const CONFIG = {
  cacheTTL: 60 * 60 * 1000,      // 1 hour cache
  searchTimeout: 10000,            // 10 second timeout
  maxResults: 20,                  // Max results to return
  throttleImages: true,            // Block images in hidden tabs
  throttleFonts: true              // Block fonts in hidden tabs
}
```

## Performance

- **Parallel Execution**: All three search engines query simultaneously
- **10-Second Timeout**: Search fails gracefully if engines don't respond
- **Resource Throttling**: Images and fonts blocked to reduce bandwidth
- **Result Caching**: 1-hour TTL reduces repeated queries
- **Connection Reuse**: Reuses existing Chromium instance via CDP

## Privacy & Security

- No external APIs - all searches use standard search engine interfaces
- No tracking or analytics
- Results cached locally only
- Uses existing browser session (respects your cookies/login state)

## Troubleshooting

### "Failed to connect to browser" Error

The remote debugging port may not be available. Check console logs for the port number.

### No Results Returned

1. Check your internet connection
2. Verify search engines are accessible
3. Try clearing the cache: `aiSearchService.clearCache()`

### Slow Performance

- Increase `searchTimeout` if on slow connection
- Enable throttling: `throttleImages: true, throttleFonts: true`
- Check cache is working (look for "Results from cache" message)

## Future Enhancements

Planned features:
- [ ] Conversational AI chat interface (Perplexity-style)
- [ ] Image search results
- [ ] News and video result cards
- [ ] Search history and suggestions
- [ ] Custom search engine preferences
- [ ] Advanced filtering options
- [ ] Export results as PDF/JSON

