import { useState } from 'react'
import { BookmarkNode, BookmarkUpdateData } from '@/../../preload/index'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '../ui/dialog'
import { Button } from '../ui/button'

interface EditBookmarkDialogProps {
  bookmark: BookmarkNode | null
  isOpen: boolean
  onClose: () => void
  onSave: (id: string, updates: BookmarkUpdateData) => Promise<void>
}

export function EditBookmarkDialog({
  bookmark,
  isOpen,
  onClose,
  onSave
}: EditBookmarkDialogProps) {
  const [name, setName] = useState(bookmark?.name || '')
  const [url, setUrl] = useState(bookmark?.url || '')
  const [isSaving, setIsSaving] = useState(false)

  // Update state when bookmark changes
  useState(() => {
    if (bookmark) {
      setName(bookmark.name)
      setUrl(bookmark.url || '')
    }
  })

  const handleSave = async () => {
    if (!bookmark) return

    setIsSaving(true)
    try {
      const updates: BookmarkUpdateData = { name }
      if (bookmark.type === 'url') {
        updates.url = url
      }
      await onSave(bookmark.id, updates)
      onClose()
    } catch (error) {
      console.error('Failed to save bookmark:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    setName(bookmark?.name || '')
    setUrl(bookmark?.url || '')
    onClose()
  }

  if (!bookmark) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {bookmark.type === 'folder' ? 'Edit Folder' : 'Edit Bookmark'}
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="name" className="text-sm font-medium">
              Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Bookmark name"
            />
          </div>

          {bookmark.type === 'url' && (
            <div className="flex flex-col gap-2">
              <label htmlFor="url" className="text-sm font-medium">
                URL
              </label>
              <input
                id="url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="https://example.com"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

