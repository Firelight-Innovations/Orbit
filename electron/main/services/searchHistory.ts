import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

// === TYPES ===

export interface SearchHistoryEntry {
  id: number
  type: 'search' | 'visit'
  query: string | null
  url: string | null
  title: string | null
  favicon: string | null
  visitCount: number
  lastVisited: string
  userId: string
}

export interface AutocompleteSuggestion {
  id: number
  type: 'search' | 'visit' | 'search-action'
  displayText: string
  url: string | null
  favicon: string | null
  visitCount: number
  // === PLACEHOLDER: AI_AUTOCOMPLETE ===
  // TODO: Add confidence score from AI suggestions
  aiConfidence?: number
  // === END PLACEHOLDER ===
  // Search action fields
  searchEngine?: string    // 'orbit' | 'google'
  actionLabel?: string     // 'Search Orbit'
  shortcut?: string        // 'Shift+Enter'
}

// === PLACEHOLDER: USER_PROFILE ===
// TODO: Replace with actual user profile service integration
interface UserProfileService {
  getCurrentUserId(): string
}

class DefaultUserProfileService implements UserProfileService {
  getCurrentUserId(): string {
    // Default user until profile system is implemented
    return 'default'
  }
}

const userProfileService: UserProfileService = new DefaultUserProfileService()
// === END PLACEHOLDER ===

// === PLACEHOLDER: AI_AUTOCOMPLETE ===
// TODO: Implement Cursor-like intelligent suggestions
interface AIAutocompleteService {
  getSuggestions(query: string, context?: string): Promise<AutocompleteSuggestion[]>
}

class DefaultAIAutocompleteService implements AIAutocompleteService {
  async getSuggestions(_query: string, _context?: string): Promise<AutocompleteSuggestion[]> {
    // Future: Call AI service for smart completions
    // This could include:
    // - Context-aware URL suggestions
    // - Natural language query interpretation
    // - Predictive text completion
    // - Search query refinement suggestions
    return []
  }
}

const aiAutocompleteService: AIAutocompleteService = new DefaultAIAutocompleteService()
// === END PLACEHOLDER ===

/**
 * SearchHistoryService - SQLite-backed service for storing and querying
 * search history and visited URLs with semantic matching support.
 */
export class SearchHistoryService {
  private db: Database.Database | null = null
  private dbPath: string

  constructor() {
    // Store database in app's user data directory
    const userDataPath = app.getPath('userData')
    this.dbPath = join(userDataPath, 'search_history.db')
  }

  /**
   * Initialize the database connection and create tables if needed
   */
  initialize(): void {
    if (this.db) return

    this.db = new Database(this.dbPath)
    
    // Enable WAL mode for better concurrent access
    this.db.pragma('journal_mode = WAL')
    
    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS search_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK(type IN ('search', 'visit')),
        query TEXT,
        url TEXT,
        title TEXT,
        favicon TEXT,
        visit_count INTEGER DEFAULT 1,
        last_visited DATETIME DEFAULT CURRENT_TIMESTAMP,
        user_id TEXT DEFAULT 'default'
      );

      CREATE INDEX IF NOT EXISTS idx_search_history_query ON search_history(query);
      CREATE INDEX IF NOT EXISTS idx_search_history_url ON search_history(url);
      CREATE INDEX IF NOT EXISTS idx_search_history_user ON search_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_search_history_last_visited ON search_history(last_visited DESC);
    `)
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  /**
   * Add or update a search entry
   */
  addSearchEntry(query: string): SearchHistoryEntry {
    if (!this.db) throw new Error('Database not initialized')
    
    // === PLACEHOLDER: USER_PROFILE ===
    const userId = userProfileService.getCurrentUserId()
    // === END PLACEHOLDER ===

    // Check if this search already exists for this user
    const existing = this.db.prepare(`
      SELECT * FROM search_history 
      WHERE type = 'search' AND query = ? AND user_id = ?
    `).get(query, userId) as SearchHistoryEntry | undefined

    if (existing) {
      // Update existing entry
      this.db.prepare(`
        UPDATE search_history 
        SET visit_count = visit_count + 1, last_visited = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(existing.id)

      return this.getEntryById(existing.id)!
    } else {
      // Insert new entry
      const result = this.db.prepare(`
        INSERT INTO search_history (type, query, user_id)
        VALUES ('search', ?, ?)
      `).run(query, userId)

      return this.getEntryById(result.lastInsertRowid as number)!
    }
  }

  /**
   * Add or update a visit entry (when user visits a URL)
   */
  addVisitEntry(url: string, title?: string, favicon?: string): SearchHistoryEntry {
    if (!this.db) throw new Error('Database not initialized')
    
    // === PLACEHOLDER: USER_PROFILE ===
    const userId = userProfileService.getCurrentUserId()
    // === END PLACEHOLDER ===

    // Check if this URL already exists for this user
    const existing = this.db.prepare(`
      SELECT * FROM search_history 
      WHERE type = 'visit' AND url = ? AND user_id = ?
    `).get(url, userId) as SearchHistoryEntry | undefined

    if (existing) {
      // Update existing entry
      this.db.prepare(`
        UPDATE search_history 
        SET visit_count = visit_count + 1, 
            last_visited = CURRENT_TIMESTAMP,
            title = COALESCE(?, title),
            favicon = COALESCE(?, favicon)
        WHERE id = ?
      `).run(title ?? null, favicon ?? null, existing.id)

      return this.getEntryById(existing.id)!
    } else {
      // Insert new entry
      const result = this.db.prepare(`
        INSERT INTO search_history (type, url, title, favicon, user_id)
        VALUES ('visit', ?, ?, ?, ?)
      `).run(url, title ?? null, favicon ?? null, userId)

      return this.getEntryById(result.lastInsertRowid as number)!
    }
  }

  /**
   * Get an entry by ID
   */
  private getEntryById(id: number): SearchHistoryEntry | null {
    if (!this.db) throw new Error('Database not initialized')

    const row = this.db.prepare(`
      SELECT id, type, query, url, title, favicon, 
             visit_count as visitCount, last_visited as lastVisited, user_id as userId
      FROM search_history WHERE id = ?
    `).get(id) as SearchHistoryEntry | undefined

    return row ?? null
  }

  /**
   * Check if input looks like a URL rather than a search query
   */
  private isLikelyUrl(input: string): boolean {
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

  /**
   * Query suggestions based on input text
   * Returns matching searches and visits, ranked by relevance
   */
  async querySuggestions(input: string, limit: number = 8): Promise<AutocompleteSuggestion[]> {
    if (!this.db) throw new Error('Database not initialized')
    if (!input.trim()) return this.getRecentSuggestions(limit)

    // === PLACEHOLDER: USER_PROFILE ===
    const userId = userProfileService.getCurrentUserId()
    // === END PLACEHOLDER ===

    const searchTerm = `%${input}%`
    const prefixTerm = `${input}%`

    // Query database for matching entries
    // Ranking: prefix matches score higher, then by visit_count and recency
    const rows = this.db.prepare(`
      SELECT 
        id, type, query, url, title, favicon,
        visit_count as visitCount,
        CASE 
          WHEN type = 'search' AND query LIKE ? THEN 100
          WHEN type = 'visit' AND (url LIKE ? OR title LIKE ?) THEN 100
          ELSE 0
        END as prefixBoost
      FROM search_history
      WHERE user_id = ? AND (
        (type = 'search' AND query LIKE ?) OR
        (type = 'visit' AND (url LIKE ? OR title LIKE ?))
      )
      ORDER BY prefixBoost DESC, visit_count DESC, last_visited DESC
      LIMIT ?
    `).all(
      prefixTerm, prefixTerm, prefixTerm,
      userId,
      searchTerm, searchTerm, searchTerm,
      limit
    ) as Array<{
      id: number
      type: 'search' | 'visit'
      query: string | null
      url: string | null
      title: string | null
      favicon: string | null
      visitCount: number
      prefixBoost: number
    }>

    // Convert to AutocompleteSuggestion format
    const dbSuggestions: AutocompleteSuggestion[] = rows.map(row => ({
      id: row.id,
      type: row.type,
      displayText: row.type === 'search' 
        ? row.query! 
        : (row.title || row.url || ''),
      url: row.url,
      favicon: row.favicon,
      visitCount: row.visitCount
    }))

    // Generate search action suggestions for non-URL queries
    const searchActions: AutocompleteSuggestion[] = []
    if (input.trim() && !this.isLikelyUrl(input)) {
      // Add Orbit action (default)
      searchActions.push({
        id: -1,
        type: 'search-action',
        displayText: input,
        url: null,
        favicon: null,
        visitCount: 0,
        searchEngine: 'orbit',
        actionLabel: 'Search with Fi',
        shortcut: 'Enter'
      })
      
      // Add "Search Google" action (secondary)
      searchActions.push({
        id: -2,
        type: 'search-action',
        displayText: input,
        url: null,
        favicon: null,
        visitCount: 0,
        searchEngine: 'google',
        actionLabel: 'Search Google',
        shortcut: 'Shift+Enter'
      })
    }

    // === PLACEHOLDER: AI_AUTOCOMPLETE ===
    // TODO: Merge AI suggestions with database results
    const aiSuggestions = await aiAutocompleteService.getSuggestions(input)
    
    // Future: Implement intelligent merging of AI and DB suggestions
    // For now, just append AI suggestions (which are empty)
    // === END PLACEHOLDER ===

    // Return search actions first, then history, then AI suggestions
    // Allow extra items for search actions so we don't cut off history
    const allSuggestions = [...searchActions, ...dbSuggestions, ...aiSuggestions]
    return allSuggestions.slice(0, limit + searchActions.length)
  }

  /**
   * Get recent entries when no search input is provided
   */
  getRecentSuggestions(limit: number = 8): AutocompleteSuggestion[] {
    if (!this.db) throw new Error('Database not initialized')

    // === PLACEHOLDER: USER_PROFILE ===
    const userId = userProfileService.getCurrentUserId()
    // === END PLACEHOLDER ===

    const rows = this.db.prepare(`
      SELECT id, type, query, url, title, favicon, visit_count as visitCount
      FROM search_history
      WHERE user_id = ?
      ORDER BY last_visited DESC
      LIMIT ?
    `).all(userId, limit) as Array<{
      id: number
      type: 'search' | 'visit'
      query: string | null
      url: string | null
      title: string | null
      favicon: string | null
      visitCount: number
    }>

    return rows.map(row => ({
      id: row.id,
      type: row.type,
      displayText: row.type === 'search' 
        ? row.query! 
        : (row.title || row.url || ''),
      url: row.url,
      favicon: row.favicon,
      visitCount: row.visitCount
    }))
  }

  /**
   * Delete a specific entry
   */
  deleteEntry(id: number): boolean {
    if (!this.db) throw new Error('Database not initialized')

    const result = this.db.prepare(`
      DELETE FROM search_history WHERE id = ?
    `).run(id)

    return result.changes > 0
  }

  /**
   * Clear all history for current user
   */
  clearHistory(): void {
    if (!this.db) throw new Error('Database not initialized')

    // === PLACEHOLDER: USER_PROFILE ===
    const userId = userProfileService.getCurrentUserId()
    // === END PLACEHOLDER ===

    this.db.prepare(`
      DELETE FROM search_history WHERE user_id = ?
    `).run(userId)
  }
}

// Singleton instance
let searchHistoryService: SearchHistoryService | null = null

export function getSearchHistoryService(): SearchHistoryService {
  if (!searchHistoryService) {
    searchHistoryService = new SearchHistoryService()
    searchHistoryService.initialize()
  }
  return searchHistoryService
}

export function closeSearchHistoryService(): void {
  if (searchHistoryService) {
    searchHistoryService.close()
    searchHistoryService = null
  }
}

