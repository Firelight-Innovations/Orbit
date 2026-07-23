import { BookmarkNode } from '@/../../preload/index'
import { ExternalLink, Folder, MoreVertical } from 'lucide-react'
import orbitLogo from '../../assets/orbit_logo.png'
import { Button } from '../ui/button'

interface BookmarksListProps {
  bookmarks: BookmarkNode[]
  onNavigate: (url: string) => void
  onEdit: (bookmark: BookmarkNode) => void
  onDelete: (bookmark: BookmarkNode) => void
}

export function BookmarksList({
  bookmarks,
  onNavigate,
  onEdit,
  onDelete
}: BookmarksListProps) {
  const getFaviconUrl = (url: string) => {
    try {
      const urlObj = new URL(url)
      return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`
    } catch {
      return orbitLogo
    }
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return ''
    try {
      // Chrome stores dates in microseconds
      const timestamp = parseInt(dateString, 10) / 1000
      const date = new Date(timestamp)
      return date.toLocaleDateString()
    } catch {
      return ''
    }
  }

  if (bookmarks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No bookmarks in this folder
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1 p-4">
      {bookmarks.map((bookmark) => (
        <div
          key={bookmark.id}
          className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-secondary/50 transition-colors group"
        >
          <div className="flex-shrink-0">
            {bookmark.type === 'folder' ? (
              <Folder size={20} className="text-muted-foreground" />
            ) : (
              <img
                src={getFaviconUrl(bookmark.url!)}
                alt=""
                className="w-5 h-5"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).src = orbitLogo
                }}
              />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="text-sm font-medium truncate cursor-pointer hover:underline"
                onClick={() => bookmark.type === 'url' && bookmark.url && onNavigate(bookmark.url)}
              >
                {bookmark.name}
              </span>
              {bookmark.type === 'url' && (
                <button
                  onClick={() => bookmark.url && window.electronAPI.createTab({
                    id: `tab-${Date.now()}`,
                    title: bookmark.name,
                    url: bookmark.url
                  })}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Open in new tab"
                >
                  <ExternalLink size={14} className="text-muted-foreground" />
                </button>
              )}
            </div>
            {bookmark.type === 'url' && bookmark.url && (
              <div className="text-xs text-muted-foreground truncate">
                {bookmark.url}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {bookmark.date_added && (
              <span className="text-xs text-muted-foreground">
                {formatDate(bookmark.date_added)}
              </span>
            )}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(bookmark)}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(bookmark)}
                className="text-[var(--error)] hover:bg-[var(--error-soft)] hover:text-[var(--error)]"
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

