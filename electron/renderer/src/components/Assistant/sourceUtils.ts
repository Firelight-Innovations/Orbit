/** Shared helpers for rendering citations. */

/** "https://www.google.com/search?q=x" -> "google.com" */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0] || url
  }
}

/**
 * Favicon URL for a source. Prefers whatever the backend supplied, otherwise
 * falls back to Google's favicon service (the same one Simplicity uses).
 */
export function faviconFor(url: string, provided?: string): string | null {
  if (provided) return provided
  try {
    const host = new URL(url).hostname
    return `https://s2.googleusercontent.com/s2/favicons?domain=${host}&sz=32`
  } catch {
    return null
  }
}
