import { chromium, Browser, Page } from 'playwright'
import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { getDebuggingPort } from '../index'

// === TYPES ===

export interface SearchResult {
  title: string
  snippet: string
  url: string
  source: 'google' | 'bing' | 'duckduckgo'
  rank: number
  faviconUrl: string | null
  positionInSource: number
}

export interface GoogleAIOverview {
  content: string
  sources: Array<{ title: string; url: string }>
}

export interface SearchResponse {
  query: string
  aiOverview: GoogleAIOverview | null
  results: SearchResult[]
  cached: boolean
  timestamp: number
}

interface CacheEntry {
  query: string
  response: string // JSON stringified SearchResponse
  cached_at: number
}

// === CONFIGURATION ===

const CONFIG = {
  cacheTTL: 60 * 60 * 1000, // 1 hour in milliseconds
  searchTimeout: 10000, // 10 seconds
  maxResults: 20,
  throttleImages: true,
  throttleFonts: true
}

// === AI SEARCH SERVICE ===

export class AISearchService {
  private db: Database.Database | null = null
  private dbPath: string
  private browser: Browser | null = null

  constructor() {
    const userDataPath = app.getPath('userData')
    this.dbPath = join(userDataPath, 'ai_search_cache.db')
  }

  /**
   * Initialize database and browser connection
   */
  async initialize(): Promise<void> {
    // Initialize database
    if (!this.db) {
      this.db = new Database(this.dbPath)
      this.db.pragma('journal_mode = WAL')

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS search_cache (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          query TEXT NOT NULL UNIQUE,
          response TEXT NOT NULL,
          cached_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_search_query ON search_cache(query);
        CREATE INDEX IF NOT EXISTS idx_search_time ON search_cache(cached_at);
      `)

      // Cleanup expired entries
      this.cleanupExpiredCache()
    }
  }

  /**
   * Connect to existing Chromium instance via CDP
   */
  private async connectBrowser(): Promise<Browser | null> {
    if (this.browser && this.browser.isConnected()) {
      return this.browser
    }

    const port = getDebuggingPort()
    if (!port) {
      console.error('Debugging port not available')
      return null
    }

    try {
      // Use IPv4 loopback to avoid potential IPv6 (::1) binding issues
      this.browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
      console.log('Connected to existing Chromium instance')
      return this.browser
    } catch (error) {
      console.error('Failed to connect to Chromium:', error)
      return null
    }
  }

  /**
   * Search across Google, Bing, and DuckDuckGo
   */
  async search(query: string): Promise<SearchResponse> {
    const normalizedQuery = query.trim().toLowerCase()

    // Check cache first
    const cached = this.getCachedSearch(normalizedQuery)
    if (cached) {
      console.log('Returning cached search results')
      return cached
    }

    // Connect to browser
    const browser = await this.connectBrowser()
    if (!browser) {
      throw new Error('Failed to connect to browser')
    }

    // Run searches in parallel with timeout
    const searchPromises = [
      this.searchGoogle(browser, query),
      this.searchBing(browser, query),
      this.searchDuckDuckGo(browser, query)
    ]

    const results = await Promise.race([
      Promise.all(searchPromises),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Search timeout')), CONFIG.searchTimeout)
      )
    ])

    const [googleResults, bingResults, ddgResults] = results

    // Merge and rank results
    const allResults = this.mergeAndRankResults([
      ...googleResults.results,
      ...bingResults.results,
      ...ddgResults.results
    ])

    const response: SearchResponse = {
      query,
      aiOverview: googleResults.aiOverview,
      results: allResults,
      cached: false,
      timestamp: Date.now()
    }

    // Cache the response
    this.cacheSearch(normalizedQuery, response)

    return response
  }

  /**
   * Search Google and extract AI overview + organic results
   */
  private async searchGoogle(browser: Browser, query: string): Promise<{
    results: SearchResult[]
    aiOverview: GoogleAIOverview | null
  }> {
    const context = await browser.newContext()
    const page = await context.newPage()

    try {
      // Throttle resources
      if (CONFIG.throttleImages || CONFIG.throttleFonts) {
        await page.route('**/*', (route) => {
          const resourceType = route.request().resourceType()
          if (
            (CONFIG.throttleImages && resourceType === 'image') ||
            (CONFIG.throttleFonts && resourceType === 'font')
          ) {
            route.abort()
          } else {
            route.continue()
          }
        })
      }

      await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}`, {
        waitUntil: 'domcontentloaded',
        timeout: 8000
      })

      // Extract AI Overview
      let aiOverview: GoogleAIOverview | null = null
      try {
        const aiBlock = await page.$('[data-attrid="SGFeaturedContentCard"], .lr_container, .kp-wholepage-osrp')
        if (aiBlock) {
          const content = await aiBlock.textContent()
          const sourceLinks = await aiBlock.$$('a[href^="http"]')
          const sources = await Promise.all(
            sourceLinks.slice(0, 5).map(async (link) => ({
              title: (await link.textContent()) || '',
              url: (await link.getAttribute('href')) || ''
            }))
          )
          aiOverview = { content: content || '', sources }
        }
      } catch (e) {
        console.log('No AI overview found on Google')
      }

      // Extract organic results (skip ads)
      const results: SearchResult[] = []
      const searchResults = await page.$$('#search .g:not(.g-blk), #rso > div > div > div')

      for (let i = 0; i < Math.min(searchResults.length, 10); i++) {
        const result = searchResults[i]
        try {
          // Skip if it's an ad
          const isAd = await result.evaluate((el) => {
            return el.closest('[data-text-ad]') !== null || el.textContent?.includes('Ad ·') || false
          })
          if (isAd) continue

          const titleEl = await result.$('h3')
          const linkEl = await result.$('a')
          const snippetEl = await result.$('.VwiC3b, .yXK7lf, .lEBKkf')

          if (titleEl && linkEl) {
            const title = (await titleEl.textContent()) || ''
            const url = (await linkEl.getAttribute('href')) || ''
            const snippet = (await snippetEl?.textContent()) || ''

            if (title && url && url.startsWith('http')) {
              results.push({
                title,
                snippet,
                url,
                source: 'google',
                rank: 0, // Will be calculated later
                faviconUrl: await this.getFaviconUrl(url),
                positionInSource: i + 1
              })
            }
          }
        } catch (e) {
          continue
        }
      }

      return { results, aiOverview }
    } catch (error) {
      console.error('Google search error:', error)
      return { results: [], aiOverview: null }
    } finally {
      await page.close()
      await context.close()
    }
  }

  /**
   * Search Bing and extract organic results
   */
  private async searchBing(browser: Browser, query: string): Promise<{ results: SearchResult[] }> {
    const context = await browser.newContext()
    const page = await context.newPage()

    try {
      if (CONFIG.throttleImages || CONFIG.throttleFonts) {
        await page.route('**/*', (route) => {
          const resourceType = route.request().resourceType()
          if (
            (CONFIG.throttleImages && resourceType === 'image') ||
            (CONFIG.throttleFonts && resourceType === 'font')
          ) {
            route.abort()
          } else {
            route.continue()
          }
        })
      }

      await page.goto(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, {
        waitUntil: 'domcontentloaded',
        timeout: 8000
      })

      const results: SearchResult[] = []
      const searchResults = await page.$$('#b_results > li.b_algo')

      for (let i = 0; i < Math.min(searchResults.length, 10); i++) {
        const result = searchResults[i]
        try {
          // Skip ads
          const isAd = await result.evaluate((el) => {
            return el.classList.contains('b_ad') || el.closest('.b_ad') !== null
          })
          if (isAd) continue

          const titleEl = await result.$('h2 a')
          const snippetEl = await result.$('.b_caption p, .b_lineclamp2, .b_lineclamp3')

          if (titleEl) {
            const title = (await titleEl.textContent()) || ''
            const url = (await titleEl.getAttribute('href')) || ''
            const snippet = (await snippetEl?.textContent()) || ''

            if (title && url && url.startsWith('http')) {
              results.push({
                title,
                snippet,
                url,
                source: 'bing',
                rank: 0,
                faviconUrl: await this.getFaviconUrl(url),
                positionInSource: i + 1
              })
            }
          }
        } catch (e) {
          continue
        }
      }

      return { results }
    } catch (error) {
      console.error('Bing search error:', error)
      return { results: [] }
    } finally {
      await page.close()
      await context.close()
    }
  }

  /**
   * Search DuckDuckGo and extract organic results
   */
  private async searchDuckDuckGo(browser: Browser, query: string): Promise<{ results: SearchResult[] }> {
    const context = await browser.newContext()
    const page = await context.newPage()

    try {
      if (CONFIG.throttleImages || CONFIG.throttleFonts) {
        await page.route('**/*', (route) => {
          const resourceType = route.request().resourceType()
          if (
            (CONFIG.throttleImages && resourceType === 'image') ||
            (CONFIG.throttleFonts && resourceType === 'font')
          ) {
            route.abort()
          } else {
            route.continue()
          }
        })
      }

      await page.goto(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`, {
        waitUntil: 'domcontentloaded',
        timeout: 8000
      })

      // Wait for results to load
      await page.waitForSelector('[data-result], .result', { timeout: 3000 }).catch(() => {})

      const results: SearchResult[] = []
      const searchResults = await page.$$('[data-result="1"], .result:not(.result--ad)')

      for (let i = 0; i < Math.min(searchResults.length, 10); i++) {
        const result = searchResults[i]
        try {
          // Skip ads
          const isAd = await result.evaluate((el) => {
            return el.classList.contains('result--ad') || el.closest('.results--ads') !== null
          })
          if (isAd) continue

          const titleEl = await result.$('h2 a, .result__title a')
          const snippetEl = await result.$('.result__snippet, .snippet')

          if (titleEl) {
            const title = (await titleEl.textContent()) || ''
            const url = (await titleEl.getAttribute('href')) || ''
            const snippet = (await snippetEl?.textContent()) || ''

            if (title && url && url.startsWith('http')) {
              results.push({
                title,
                snippet,
                url,
                source: 'duckduckgo',
                rank: 0,
                faviconUrl: await this.getFaviconUrl(url),
                positionInSource: i + 1
              })
            }
          }
        } catch (e) {
          continue
        }
      }

      return { results }
    } catch (error) {
      console.error('DuckDuckGo search error:', error)
      return { results: [] }
    } finally {
      await page.close()
      await context.close()
    }
  }

  /**
   * Merge, deduplicate, and rank results from all sources
   */
  private mergeAndRankResults(results: SearchResult[]): SearchResult[] {
    // Deduplicate by normalized URL
    const seenUrls = new Map<string, SearchResult>()

    for (const result of results) {
      const normalizedUrl = this.normalizeUrl(result.url)
      const existing = seenUrls.get(normalizedUrl)

      if (!existing || this.getSourceWeight(result.source) > this.getSourceWeight(existing.source)) {
        seenUrls.set(normalizedUrl, result)
      }
    }

    // Rank results
    const uniqueResults = Array.from(seenUrls.values())
    uniqueResults.forEach((result) => {
      // Ranking score: source weight + position bonus
      const sourceWeight = this.getSourceWeight(result.source)
      const positionBonus = Math.max(0, 10 - result.positionInSource)
      result.rank = sourceWeight * 10 + positionBonus
    })

    // Sort by rank (descending)
    uniqueResults.sort((a, b) => b.rank - a.rank)

    return uniqueResults.slice(0, CONFIG.maxResults)
  }

  /**
   * Get weight for search source (higher = better)
   */
  private getSourceWeight(source: 'google' | 'bing' | 'duckduckgo'): number {
    switch (source) {
      case 'google':
        return 3
      case 'bing':
        return 2
      case 'duckduckgo':
        return 1
      default:
        return 1
    }
  }

  /**
   * Normalize URL for deduplication
   */
  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url)
      // Remove trailing slash, www prefix, and query params for comparison
      let normalized = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`
      normalized = normalized.replace(/\/$/, '')
      normalized = normalized.replace(/^https?:\/\/www\./, 'https://')
      return normalized
    } catch {
      return url
    }
  }

  /**
   * Get favicon URL for a domain
   */
  private async getFaviconUrl(url: string): Promise<string | null> {
    try {
      const urlObj = new URL(url)
      return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`
    } catch {
      return null
    }
  }

  /**
   * Get cached search results
   */
  private getCachedSearch(query: string): SearchResponse | null {
    if (!this.db) return null

    try {
      const row = this.db
        .prepare('SELECT response, cached_at FROM search_cache WHERE query = ?')
        .get(query) as CacheEntry | undefined

      if (!row) return null

      // Check if expired
      if (Date.now() - row.cached_at > CONFIG.cacheTTL) {
        this.db.prepare('DELETE FROM search_cache WHERE query = ?').run(query)
        return null
      }

      const response = JSON.parse(row.response) as SearchResponse
      response.cached = true
      return response
    } catch (error) {
      console.error('Error reading cache:', error)
      return null
    }
  }

  /**
   * Cache search results
   */
  private cacheSearch(query: string, response: SearchResponse): void {
    if (!this.db) return

    try {
      this.db
        .prepare(
          'INSERT OR REPLACE INTO search_cache (query, response, cached_at) VALUES (?, ?, ?)'
        )
        .run(query, JSON.stringify(response), Date.now())
    } catch (error) {
      console.error('Error writing cache:', error)
    }
  }

  /**
   * Cleanup expired cache entries
   */
  private cleanupExpiredCache(): void {
    if (!this.db) return

    try {
      const expiredTime = Date.now() - CONFIG.cacheTTL
      this.db.prepare('DELETE FROM search_cache WHERE cached_at < ?').run(expiredTime)
    } catch (error) {
      console.error('Error cleaning up cache:', error)
    }
  }

  /**
   * Clear all cached searches
   */
  clearCache(): void {
    if (!this.db) return

    try {
      this.db.prepare('DELETE FROM search_cache').run()
    } catch (error) {
      console.error('Error clearing cache:', error)
    }
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }

    if (this.browser) {
      this.browser.close().catch(() => {})
      this.browser = null
    }
  }
}

// === SINGLETON ===

let aiSearchService: AISearchService | null = null

export async function getAISearchService(): Promise<AISearchService> {
  if (!aiSearchService) {
    aiSearchService = new AISearchService()
    await aiSearchService.initialize()
  }
  return aiSearchService
}

export function closeAISearchService(): void {
  if (aiSearchService) {
    aiSearchService.close()
    aiSearchService = null
  }
}

