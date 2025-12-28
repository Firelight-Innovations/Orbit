import { BookmarkNode } from '@/../../preload/index'
import { Folder, ChevronRight, ChevronDown } from 'lucide-react'
import { useState } from 'react'

interface FolderTreeProps {
  roots: { bookmark_bar: BookmarkNode; other: BookmarkNode; synced: BookmarkNode } | null
  selectedFolderId: string | null
  onSelectFolder: (folderId: string) => void
}

export function FolderTree({ roots, selectedFolderId, onSelectFolder }: FolderTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      return next
    })
  }

  const renderFolder = (folder: BookmarkNode, depth = 0) => {
    const isExpanded = expandedFolders.has(folder.id)
    const isSelected = selectedFolderId === folder.id
    const hasChildren = folder.children && folder.children.some(c => c.type === 'folder')

    return (
      <div key={folder.id}>
        <div
          className={`flex items-center gap-2 px-3 py-2 cursor-pointer rounded-md hover:bg-secondary/50 transition-colors ${
            isSelected ? 'bg-secondary' : ''
          }`}
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
          onClick={() => onSelectFolder(folder.id)}
        >
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleFolder(folder.id)
              }}
              className="p-0.5 hover:bg-secondary rounded"
            >
              {isExpanded ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
            </button>
          )}
          {!hasChildren && <div className="w-5" />}
          <Folder size={16} className="text-muted-foreground" />
          <span className="text-sm flex-1 truncate">{folder.name}</span>
        </div>

        {isExpanded && folder.children && (
          <div>
            {folder.children
              .filter(child => child.type === 'folder')
              .map(child => renderFolder(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  if (!roots) {
    return <div className="p-4 text-sm text-muted-foreground">No folders</div>
  }

  return (
    <div className="flex flex-col gap-1">
      {renderFolder(roots.bookmark_bar, 0)}
      {renderFolder(roots.other, 0)}
    </div>
  )
}

