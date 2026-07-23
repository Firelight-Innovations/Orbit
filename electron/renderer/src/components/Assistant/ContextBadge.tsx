interface ContextBadgeProps {
  url?: string | null
  selectedText?: string | null
}

export function ContextBadge({ url, selectedText }: ContextBadgeProps) {
  if (!url && !selectedText) return null

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-400">
      {url && (
        <span className="truncate max-w-[240px]" title={url}>
          {url}
        </span>
      )}
      {selectedText && (
        <span className="rounded-sm bg-zinc-800 px-2 py-1 text-[11px] text-zinc-300" title={selectedText}>
          “{selectedText.slice(0, 80)}{selectedText.length > 80 ? '…' : ''}”
        </span>
      )}
    </div>
  )
}

