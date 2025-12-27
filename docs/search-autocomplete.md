# Search Bar Autocomplete

This document describes the autocomplete feature for the navigation bar's URL/search input.

## Overview

The autocomplete feature provides Chrome-like suggestions as users type in the URL bar. It shows:
- **Previous searches** - Search queries the user has entered
- **Visited URLs** - Pages the user has visited, with titles and favicons

Suggestions are ranked by visit frequency and recency, with prefix matches prioritized.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Renderer Process                          │
│  ┌─────────────────┐    ┌──────────────────────┐                │
│  │  NavigationBar  │───▶│ AutocompleteDropdown │                │
│  └────────┬────────┘    └──────────────────────┘                │
│           │                        ▲                             │
│           ▼                        │                             │
│  ┌─────────────────────────────────┴─┐                          │
│  │       useSearchHistory Hook       │                          │
│  └─────────────────┬─────────────────┘                          │
│                    │ IPC                                         │
└────────────────────┼────────────────────────────────────────────┘
                     │
┌────────────────────┼────────────────────────────────────────────┐
│                    ▼           Main Process                      │
│  ┌─────────────────────────────────┐                            │
│  │        IPC Handlers             │                            │
│  │  (searchHistory:query, etc.)    │                            │
│  └─────────────────┬───────────────┘                            │
│                    │                                             │
│                    ▼                                             │
│  ┌─────────────────────────────────┐                            │
│  │    SearchHistoryService         │                            │
│  │    (SQLite backend)             │                            │
│  └─────────────────┬───────────────┘                            │
│                    │                                             │
│                    ▼                                             │
│  ┌─────────────────────────────────┐                            │
│  │  search_history.db (SQLite)     │                            │
│  │  Location: app.getPath('userData')                           │
│  └─────────────────────────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

## Key Components

### Main Process

#### `electron/main/services/searchHistory.ts`

The core service that manages the SQLite database for search history.

**Key Classes/Functions:**
- `SearchHistoryService` - Main service class with methods for CRUD operations
- `getSearchHistoryService()` - Singleton accessor
- `closeSearchHistoryService()` - Cleanup on app shutdown

**Database Schema:**
```sql
CREATE TABLE search_history (
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
```

### Renderer Process

#### `electron/renderer/src/hooks/useSearchHistory.ts`

React hook for managing autocomplete state with debounced queries.

**Usage:**
```tsx
const {
  suggestions,      // Current suggestions array
  isLoading,        // Loading state
  query,            // Trigger a search
  addSearch,        // Record a search query
  addVisit,         // Record a URL visit
  clearSuggestions, // Clear current suggestions
  deleteSuggestion  // Delete a suggestion
} = useSearchHistory({ debounceMs: 150, maxSuggestions: 8 });
```

#### `electron/renderer/src/components/NavigationBar/AutocompleteDropdown.tsx`

The dropdown component that displays suggestions.

**Features:**
- Keyboard navigation (Arrow Up/Down, Enter, Escape, Tab)
- Visual distinction between search queries and visited URLs
- Favicon display for visited sites
- Delete button to remove individual suggestions
- Text highlighting for matching portions

### IPC API

Available via `window.electronAPI.searchHistory`:

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `query(input, limit?)` | `string, number?` | `Promise<AutocompleteSuggestion[]>` | Get matching suggestions |
| `addSearch(query)` | `string` | `Promise<SearchHistoryEntry \| null>` | Record a search |
| `addVisit(url, title?, favicon?)` | `string, string?, string?` | `Promise<SearchHistoryEntry \| null>` | Record a visit |
| `getRecent(limit?)` | `number?` | `Promise<AutocompleteSuggestion[]>` | Get recent entries |
| `delete(id)` | `number` | `Promise<boolean>` | Delete an entry |
| `clear()` | - | `Promise<boolean>` | Clear all history |

## Placeholder Logic

The codebase includes placeholder logic for future features. These are marked with special comments:

### User Profiles
```typescript
// === PLACEHOLDER: USER_PROFILE ===
// TODO: Replace with actual user profile integration
const userId = 'default';
// === END PLACEHOLDER ===
```

**Location:** `electron/main/services/searchHistory.ts`

**Purpose:** All search history is currently stored under a default user. When user profiles are implemented, replace `DefaultUserProfileService` with the actual profile service to get the current user's ID.

### AI-Powered Autocomplete
```typescript
// === PLACEHOLDER: AI_AUTOCOMPLETE ===
// TODO: Implement Cursor-like intelligent suggestions
async function getAISuggestions(query: string): Promise<Suggestion[]> {
    return []; // Future: Call AI service for smart completions
}
// === END PLACEHOLDER ===
```

**Locations:**
- `electron/main/services/searchHistory.ts` - Service integration point
- `electron/renderer/src/components/NavigationBar/AutocompleteDropdown.tsx` - UI section (commented out)
- `electron/renderer/src/components/NavigationBar/AutocompleteDropdown.css` - Styles (commented out)

**Purpose:** Add intelligent, context-aware suggestions similar to Cursor's command palette. Could include:
- Natural language query interpretation
- Predictive text completion
- Search query refinement suggestions
- Context-aware URL suggestions based on current workflow

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↓` / `↑` | Navigate through suggestions |
| `Enter` | Select current suggestion or navigate to input |
| `Tab` | Fill input with selected suggestion (without navigating) |
| `Escape` | Close dropdown (first press) / Restore URL and blur (second press) |

## Data Flow

### Recording a Search
1. User types in URL bar and presses Enter
2. `NavigationBar` calls `addSearch()` from the hook
3. Hook calls `window.electronAPI.searchHistory.addSearch()`
4. IPC handler invokes `SearchHistoryService.addSearchEntry()`
5. Service inserts/updates the SQLite database

### Recording a Visit
1. `WebContentsView` fires `did-finish-load` event
2. Main process calls `SearchHistoryService.addVisitEntry()` with URL, title, favicon
3. Service inserts/updates the SQLite database

### Querying Suggestions
1. User focuses URL bar or types
2. Hook debounces input (150ms default)
3. Hook calls `window.electronAPI.searchHistory.query()`
4. IPC handler invokes `SearchHistoryService.querySuggestions()`
5. Service queries SQLite with ranking logic
6. Results returned to renderer and displayed in dropdown

## Database Location

The SQLite database is stored at:
```
{app.getPath('userData')}/search_history.db
```

Platform-specific paths:
- **Windows:** `%APPDATA%/Orbit/search_history.db`
- **macOS:** `~/Library/Application Support/Orbit/search_history.db`
- **Linux:** `~/.config/Orbit/search_history.db`

## Performance Considerations

- **Debouncing:** 150ms debounce on input to reduce database queries
- **Result limit:** Default 8 suggestions to keep UI responsive
- **SQLite indexes:** Indexes on `query`, `url`, `user_id`, and `last_visited` for fast lookups
- **WAL mode:** SQLite runs in WAL mode for better concurrent access

