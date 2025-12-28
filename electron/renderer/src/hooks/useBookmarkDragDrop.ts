import { useState, useCallback } from 'react'
import { BookmarkNode } from '@/../../preload/index'

interface DragState {
  draggedItem: BookmarkNode | null
  dragOverItem: BookmarkNode | null
  dragPosition: 'before' | 'after' | 'over' | null
}

interface DragHandlers {
  draggable: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}

export function useBookmarkDragDrop(
  parentId: string,
  onMove: (itemId: string, newParentId: string, newIndex: number) => Promise<void>
) {
  const [dragState, setDragState] = useState<DragState>({
    draggedItem: null,
    dragOverItem: null,
    dragPosition: null
  })

  const getDragHandlers = useCallback(
    (bookmark: BookmarkNode, index: number): DragHandlers => {
      return {
        draggable: true,

        onDragStart: (e: React.DragEvent) => {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('application/x-bookmark-id', bookmark.id)
          e.dataTransfer.setData('application/x-bookmark-type', bookmark.type)
          e.dataTransfer.setData('application/x-bookmark-parent', parentId)
          e.dataTransfer.setData('application/x-bookmark-index', String(index))

          setDragState({
            draggedItem: bookmark,
            dragOverItem: null,
            dragPosition: null
          })

          // Set drag image
          const dragImage = (e.target as HTMLElement).cloneNode(true) as HTMLElement
          dragImage.style.opacity = '0.8'
          document.body.appendChild(dragImage)
          e.dataTransfer.setDragImage(dragImage, 0, 0)
          setTimeout(() => document.body.removeChild(dragImage), 0)
        },

        onDragEnd: () => {
          setDragState({
            draggedItem: null,
            dragOverItem: null,
            dragPosition: null
          })
        },

        onDragOver: (e: React.DragEvent) => {
          e.preventDefault()
          e.stopPropagation()

          const draggedId = e.dataTransfer.getData('application/x-bookmark-id')
          if (!draggedId || draggedId === bookmark.id) {
            return
          }

          // Determine drop position based on cursor position
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
          const midX = rect.left + rect.width / 2

          let position: 'before' | 'after' | 'over'

          if (bookmark.type === 'folder') {
            // For folders, allow dropping inside
            const thirdX = rect.width / 3
            if (e.clientX < rect.left + thirdX) {
              position = 'before'
            } else if (e.clientX > rect.right - thirdX) {
              position = 'after'
            } else {
              position = 'over'
            }
          } else {
            // For bookmarks, only before/after
            position = e.clientX < midX ? 'before' : 'after'
          }

          setDragState((prev) => ({
            ...prev,
            dragOverItem: bookmark,
            dragPosition: position
          }))

          e.dataTransfer.dropEffect = 'move'
        },

        onDragLeave: (e: React.DragEvent) => {
          e.stopPropagation()
          
          // Only clear if leaving the actual element
          const relatedTarget = e.relatedTarget as HTMLElement
          if (!relatedTarget || !(e.currentTarget as HTMLElement).contains(relatedTarget)) {
            setDragState((prev) => ({
              ...prev,
              dragOverItem: prev.dragOverItem?.id === bookmark.id ? null : prev.dragOverItem,
              dragPosition: prev.dragOverItem?.id === bookmark.id ? null : prev.dragPosition
            }))
          }
        },

        onDrop: async (e: React.DragEvent) => {
          e.preventDefault()
          e.stopPropagation()

          const draggedId = e.dataTransfer.getData('application/x-bookmark-id')
          const draggedParent = e.dataTransfer.getData('application/x-bookmark-parent')
          const draggedIndex = parseInt(e.dataTransfer.getData('application/x-bookmark-index'), 10)

          if (!draggedId || draggedId === bookmark.id) {
            setDragState({
              draggedItem: null,
              dragOverItem: null,
              dragPosition: null
            })
            return
          }

          let newParentId = parentId
          let newIndex = index

          if (dragState.dragPosition === 'over' && bookmark.type === 'folder') {
            // Drop inside folder
            newParentId = bookmark.id
            newIndex = 0
          } else if (dragState.dragPosition === 'before') {
            // Drop before this item
            newIndex = index
          } else if (dragState.dragPosition === 'after') {
            // Drop after this item
            newIndex = index + 1
          }

          // Adjust index if moving within same parent
          if (draggedParent === newParentId && draggedIndex < newIndex) {
            newIndex -= 1
          }

          try {
            await onMove(draggedId, newParentId, newIndex)
          } catch (error) {
            console.error('Failed to move bookmark:', error)
          }

          setDragState({
            draggedItem: null,
            dragOverItem: null,
            dragPosition: null
          })
        }
      }
    },
    [parentId, onMove, dragState.dragPosition]
  )

  const getFolderDropHandlers = useCallback(
    (folder: BookmarkNode): Partial<DragHandlers> => {
      return {
        draggable: true,

        onDragOver: (e: React.DragEvent) => {
          e.preventDefault()
          e.stopPropagation()

          const draggedId = e.dataTransfer.getData('application/x-bookmark-id')
          if (!draggedId || draggedId === folder.id) {
            return
          }

          setDragState((prev) => ({
            ...prev,
            dragOverItem: folder,
            dragPosition: 'over'
          }))

          e.dataTransfer.dropEffect = 'move'
        },

        onDragLeave: () => {
          setDragState((prev) => ({
            ...prev,
            dragOverItem: prev.dragOverItem?.id === folder.id ? null : prev.dragOverItem,
            dragPosition: prev.dragOverItem?.id === folder.id ? null : prev.dragPosition
          }))
        },

        onDrop: async (e: React.DragEvent) => {
          e.preventDefault()
          e.stopPropagation()

          const draggedId = e.dataTransfer.getData('application/x-bookmark-id')
          if (!draggedId || draggedId === folder.id) {
            setDragState({
              draggedItem: null,
              dragOverItem: null,
              dragPosition: null
            })
            return
          }

          try {
            await onMove(draggedId, folder.id, 0)
          } catch (error) {
            console.error('Failed to move bookmark into folder:', error)
          }

          setDragState({
            draggedItem: null,
            dragOverItem: null,
            dragPosition: null
          })
        }
      }
    },
    [onMove]
  )

  return {
    dragState,
    getDragHandlers,
    getFolderDropHandlers
  }
}

