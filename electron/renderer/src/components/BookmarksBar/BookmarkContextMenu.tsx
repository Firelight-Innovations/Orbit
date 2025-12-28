import { BookmarkNode } from '@/../../preload/index'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../ui/dropdown-menu'
import {
  ExternalLink,
  PanelTop,
  Pencil,
  Trash2,
  FolderOpen,
  FileText,
  FolderPlus
} from 'lucide-react'

interface BookmarkContextMenuProps {
  bookmark: BookmarkNode
  trigger: React.ReactNode
  onOpenNewTab: () => void
  onOpenNewWindow: () => void
  onOpenAll?: () => void
  onEdit: () => void
  onDelete: () => void
  onAddBookmark?: () => void
  onAddFolder?: () => void
}

export function BookmarkContextMenu({
  bookmark,
  trigger,
  onOpenNewTab,
  onOpenNewWindow,
  onOpenAll,
  onEdit,
  onDelete,
  onAddBookmark,
  onAddFolder
}: BookmarkContextMenuProps) {
  const isFolder = bookmark.type === 'folder'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {!isFolder && (
          <>
            <DropdownMenuItem onClick={onOpenNewTab}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Open in new tab
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenNewWindow}>
              <PanelTop className="mr-2 h-4 w-4" />
              Open in new window
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        {isFolder && onOpenAll && (
          <>
            <DropdownMenuItem onClick={onOpenAll}>
              <FolderOpen className="mr-2 h-4 w-4" />
              Open all bookmarks
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        {isFolder && onAddBookmark && (
          <DropdownMenuItem onClick={onAddBookmark}>
            <FileText className="mr-2 h-4 w-4" />
            Add page...
          </DropdownMenuItem>
        )}

        {isFolder && onAddFolder && (
          <DropdownMenuItem onClick={onAddFolder}>
            <FolderPlus className="mr-2 h-4 w-4" />
            Add folder...
          </DropdownMenuItem>
        )}

        {isFolder && (onAddBookmark || onAddFolder) && (
          <DropdownMenuSeparator />
        )}

        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit...
        </DropdownMenuItem>

        <DropdownMenuItem onClick={onDelete} className="text-red-600">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

