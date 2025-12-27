import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

// === TYPES ===

export interface FiSuggestion {
  id: number
  type: 'fi-suggestion'
  displayText: string
  url: null
  favicon: null
  visitCount: 0
  isFiSuggestion: true
}

interface CacheEntry {
  suggestions: string[]
  cachedAt: number
}

interface SearchSuggestionsConfig {
  enabled: boolean              // User preference (skeleton)
  memoryCacheTTL: number        // In milliseconds
  dbCacheTTL: number            // In milliseconds
  maxRequestsPerSecond: number  // Rate limit
  maxMemoryCacheSize: number    // Max entries in memory cache
}

// === PLACEHOLDER: USER_PREFERENCES ===
// TODO: Integrate with actual user preferences service
interface UserPreferences {
  fiSuggestionsEnabled: boolean
}

class UserPreferencesService {
  getPreferences(): UserPreferences {
    // Default: suggestions enabled
    return { fiSuggestionsEnabled: true }
  }

  setPreferences(_prefs: Partial<UserPreferences>): void {
    // TODO: Persist preferences when implemented
  }
}

const userPreferencesService = new UserPreferencesService()
// === END PLACEHOLDER ===

// === RATE LIMITER ===

/**
 * Token Bucket Rate Limiter
 * Allows bursts while maintaining average rate limit
 */
class TokenBucketRateLimiter {
  private tokens: number
  private lastRefill: number
  private readonly maxTokens: number
  private readonly refillRate: number // tokens per millisecond

  constructor(maxRequestsPerSecond: number) {
    this.maxTokens = maxRequestsPerSecond
    this.tokens = maxRequestsPerSecond
    this.refillRate = maxRequestsPerSecond / 1000
    this.lastRefill = Date.now()
  }

  /**
   * Try to consume a token. Returns true if allowed, false if rate limited.
   */
  tryConsume(): boolean {
    this.refill()
    
    if (this.tokens >= 1) {
      this.tokens -= 1
      return true
    }
    
    return false
  }

  private refill(): void {
    const now = Date.now()
    const elapsed = now - this.lastRefill
    const tokensToAdd = elapsed * this.refillRate
    
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd)
    this.lastRefill = now
  }
}

// === LRU CACHE ===

/**
 * Simple LRU Cache with TTL support
 */
class LRUCache<T> {
  private cache: Map<string, { value: T; cachedAt: number }>
  private readonly maxSize: number
  private readonly ttl: number

  constructor(maxSize: number, ttlMs: number) {
    this.cache = new Map()
    this.maxSize = maxSize
    this.ttl = ttlMs
  }

  get(key: string): T | null {
    const entry = this.cache.get(key)
    
    if (!entry) return null
    
    // Check TTL
    if (Date.now() - entry.cachedAt > this.ttl) {
      this.cache.delete(key)
      return null
    }
    
    // Move to end (most recently used)
    this.cache.delete(key)
    this.cache.set(key, entry)
    
    return entry.value
  }

  set(key: string, value: T): void {
    // Delete if exists (to update position)
    this.cache.delete(key)
    
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey) {
        this.cache.delete(oldestKey)
      }
    }
    
    this.cache.set(key, { value, cachedAt: Date.now() })
  }

  clear(): void {
    this.cache.clear()
  }
}

// === SEARCH SUGGESTIONS SERVICE ===

/**
 * SearchSuggestionsService - Fetches and caches search suggestions from external APIs.
 * Features:
 * - In-memory LRU cache with TTL
 * - SQLite database cache for persistence
 * - Token bucket rate limiting
 * - User preferences integration (skeleton)
 * - Error handling with graceful fallback
 */
export class SearchSuggestionsService {
  private db: Database.Database | null = null
  private dbPath: string
  private memoryCache: LRUCache<string[]>
  private rateLimiter: TokenBucketRateLimiter
  private config: SearchSuggestionsConfig

  constructor(config?: Partial<SearchSuggestionsConfig>) {
    this.config = {
      enabled: true,
      memoryCacheTTL: 5 * 60 * 1000,      // 5 minutes
      dbCacheTTL: 24 * 60 * 60 * 1000,    // 24 hours
      maxRequestsPerSecond: 10,
      maxMemoryCacheSize: 100,
      ...config
    }

    // Store database in app's user data directory
    const userDataPath = app.getPath('userData')
    this.dbPath = join(userDataPath, 'search_history.db')

    // Initialize in-memory cache
    this.memoryCache = new LRUCache<string[]>(
      this.config.maxMemoryCacheSize,
      this.config.memoryCacheTTL
    )

    // Initialize rate limiter
    this.rateLimiter = new TokenBucketRateLimiter(this.config.maxRequestsPerSecond)
  }

  /**
   * Initialize database connection and create tables
   */
  initialize(): void {
    if (this.db) return

    this.db = new Database(this.dbPath)
    this.db.pragma('journal_mode = WAL')

    // Create fi_suggestions_cache table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS fi_suggestions_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query TEXT NOT NULL UNIQUE,
        suggestions TEXT NOT NULL,
        cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        hit_count INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_fi_cache_query ON fi_suggestions_cache(query);
      CREATE INDEX IF NOT EXISTS idx_fi_cache_time ON fi_suggestions_cache(cached_at);
    `)

    // Cleanup expired entries on initialization
    this.cleanupExpiredCache()
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  /**
   * Get search suggestions for a query
   * Checks memory cache -> DB cache -> external API
   */
  async getSuggestions(query: string): Promise<FiSuggestion[]> {
    // Check user preferences
    const prefs = userPreferencesService.getPreferences()
    if (!prefs.fiSuggestionsEnabled || !this.config.enabled) {
      return []
    }

    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery || normalizedQuery.length < 2) {
      return []
    }

    try {
      // 1. Check in-memory cache
      const memoryCached = this.memoryCache.get(normalizedQuery)
      if (memoryCached) {
        return this.convertToFiSuggestions(memoryCached)
      }

      // 2. Check database cache
      const dbCached = this.getCachedFromDB(normalizedQuery)
      if (dbCached) {
        // Populate memory cache
        this.memoryCache.set(normalizedQuery, dbCached)
        return this.convertToFiSuggestions(dbCached)
      }

      // 3. Check rate limiter
      if (!this.rateLimiter.tryConsume()) {
        console.warn('Fi Suggestions: Rate limit exceeded')
        return []
      }

      // 4. Fetch from external API
      const suggestions = await this.fetchFromGoogle(normalizedQuery)
      
      if (suggestions.length > 0) {
        // Save to both caches
        this.memoryCache.set(normalizedQuery, suggestions)
        this.saveToDBCache(normalizedQuery, suggestions)
      }

      return this.convertToFiSuggestions(suggestions)
    } catch (error) {
      console.error('Fi Suggestions: Error fetching suggestions:', error)
      return []
    }
  }

  /**
   * Fetch suggestions from Google's Suggest API
   */
  private async fetchFromGoogle(query: string): Promise<string[]> {
    try {
      const url = `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(query)}`
      
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000) // 3 second timeout
      
      const response = await fetch(url, { 
        signal: controller.signal,
        headers: {
          'Accept': 'application/json'
        }
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        console.warn(`Fi Suggestions: Google API returned ${response.status}`)
        return []
      }

      const data = await response.json()
      // Response format: [query, [suggestions], [], {"google:suggesttype": [...]}]
      const suggestions = data[1] as string[]
      
      // Filter out the original query and limit results
      return suggestions
        .filter(s => s.toLowerCase() !== query.toLowerCase())
        .slice(0, 8)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn('Fi Suggestions: Request timed out')
      } else {
        console.error('Fi Suggestions: Fetch error:', error)
      }
      return []
    }
  }

  /**
   * Get cached suggestions from database
   */
  private getCachedFromDB(query: string): string[] | null {
    if (!this.db) return null

    try {
      const row = this.db.prepare(`
        SELECT suggestions, cached_at, id
        FROM fi_suggestions_cache
        WHERE query = ?
      `).get(query) as { suggestions: string; cached_at: string; id: number } | undefined

      if (!row) return null

      // Check if expired
      const cachedAt = new Date(row.cached_at).getTime()
      if (Date.now() - cachedAt > this.config.dbCacheTTL) {
        // Expired, delete and return null
        this.db.prepare('DELETE FROM fi_suggestions_cache WHERE id = ?').run(row.id)
        return null
      }

      // Update hit count
      this.db.prepare(`
        UPDATE fi_suggestions_cache 
        SET hit_count = hit_count + 1 
        WHERE id = ?
      `).run(row.id)

      return JSON.parse(row.suggestions) as string[]
    } catch (error) {
      console.error('Fi Suggestions: DB read error:', error)
      return null
    }
  }

  /**
   * Save suggestions to database cache
   */
  private saveToDBCache(query: string, suggestions: string[]): void {
    if (!this.db) return

    try {
      this.db.prepare(`
        INSERT OR REPLACE INTO fi_suggestions_cache (query, suggestions, cached_at, hit_count)
        VALUES (?, ?, CURRENT_TIMESTAMP, 0)
      `).run(query, JSON.stringify(suggestions))
    } catch (error) {
      console.error('Fi Suggestions: DB write error:', error)
    }
  }

  /**
   * Remove expired entries from database cache
   */
  private cleanupExpiredCache(): void {
    if (!this.db) return

    try {
      const ttlHours = Math.floor(this.config.dbCacheTTL / (1000 * 60 * 60))
      this.db.prepare(`
        DELETE FROM fi_suggestions_cache 
        WHERE cached_at < datetime('now', '-${ttlHours} hours')
      `).run()
    } catch (error) {
      console.error('Fi Suggestions: Cleanup error:', error)
    }
  }

  /**
   * Convert raw suggestion strings to FiSuggestion objects
   */
  private convertToFiSuggestions(suggestions: string[]): FiSuggestion[] {
    return suggestions.map((text, index) => ({
      id: -(1000 + index), // Negative IDs to distinguish from history
      type: 'fi-suggestion' as const,
      displayText: text,
      url: null,
      favicon: null,
      visitCount: 0 as const,
      isFiSuggestion: true as const
    }))
  }

  /**
   * Clear all cached suggestions (memory and database)
   */
  clearCache(): void {
    this.memoryCache.clear()
    
    if (this.db) {
      try {
        this.db.prepare('DELETE FROM fi_suggestions_cache').run()
      } catch (error) {
        console.error('Fi Suggestions: Clear cache error:', error)
      }
    }
  }
}

// === SINGLETON ===

let searchSuggestionsService: SearchSuggestionsService | null = null

export function getSearchSuggestionsService(): SearchSuggestionsService {
  if (!searchSuggestionsService) {
    searchSuggestionsService = new SearchSuggestionsService()
    searchSuggestionsService.initialize()
  }
  return searchSuggestionsService
}

export function closeSearchSuggestionsService(): void {
  if (searchSuggestionsService) {
    searchSuggestionsService.close()
    searchSuggestionsService = null
  }
}

