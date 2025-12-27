/**
 * Search Engine Configuration
 * Defines available search engines and their URL templates.
 */

export interface SearchEngine {
  id: string
  name: string
  urlTemplate: string  // {query} placeholder will be replaced
  shortcut?: string    // e.g., 'Shift+Enter'
  isDefault?: boolean
}

export const searchEngines: SearchEngine[] = [
  {
    id: 'orbit',
    name: 'Orbit',
    urlTemplate: 'orbit://search?q={query}',
    isDefault: true
  },
  {
    id: 'google',
    name: 'Google',
    urlTemplate: 'https://www.google.com/search?q={query}',
    shortcut: 'Shift+Enter'
  }
]

/**
 * Get the default search engine
 */
export function getDefaultEngine(): SearchEngine {
  return searchEngines.find(e => e.isDefault) ?? searchEngines[0]
}

/**
 * Get a search engine by ID
 */
export function getEngineById(id: string): SearchEngine | undefined {
  return searchEngines.find(e => e.id === id)
}

/**
 * Build a search URL for the given engine and query
 */
export function buildSearchUrl(engineId: string, query: string): string {
  const engine = getEngineById(engineId)
  if (!engine) {
    // Fallback to default engine
    const defaultEngine = getDefaultEngine()
    return defaultEngine.urlTemplate.replace('{query}', encodeURIComponent(query))
  }
  return engine.urlTemplate.replace('{query}', encodeURIComponent(query))
}

