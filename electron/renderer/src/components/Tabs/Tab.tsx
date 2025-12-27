import './Tab.css'

interface TabInfo {
  id: string
  title: string
  url: string
}

interface TabProps {
  tab: TabInfo
  isActive: boolean
  isDragging: boolean
  isDragOver: boolean
  onActivate: () => void
  onClose: (e: React.MouseEvent) => void
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
  onDragEnd: (e: React.DragEvent) => void
}

export function Tab({
  tab,
  isActive,
  isDragging,
  isDragOver,
  onActivate,
  onClose,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd
}: TabProps) {
  const classNames = ['tab']
  if (isActive) classNames.push('active')
  if (isDragging) classNames.push('dragging')
  if (isDragOver) classNames.push('drag-over')

  return (
    <div
      className={classNames.join(' ')}
      onClick={onActivate}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className="tab-icon">
        <svg viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </div>
      <span className="tab-title">{tab.title}</span>
      <button className="tab-close" onClick={onClose} title="Close tab">
        <svg viewBox="0 0 12 12" fill="none">
          <path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
    </div>
  )
}

