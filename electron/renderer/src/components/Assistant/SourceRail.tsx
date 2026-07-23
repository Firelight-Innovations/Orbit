import { Layers3 } from 'lucide-react'
import { AgentSource } from '@/stores/assistantStore'
import { domainOf, faviconFor } from './sourceUtils'

/**
 * Citations for a turn, shown above the answer.
 *
 * Simplicity uses a 3-up card grid; at 420px of sidebar that would be unreadable,
 * so the same cards live in a horizontally scrolling rail instead. Each card is
 * numbered to match the inline `[n]` chips in the answer.
 *
 * Renders nothing when the backend hasn't sent a `sources` event.
 */

interface SourceRailProps {
  sources: AgentSource[]
}

export function SourceRail({ sources }: SourceRailProps): JSX.Element | null {
  if (!sources.length) return null

  return (
    <div className="orbit-rise">
      <div className="mb-2 flex items-center gap-1.5">
        <Layers3 size={14} className="text-white/40" />
        <span className="text-[13px] font-medium text-white/70">Sources</span>
        <span className="text-[11px] tabular-nums text-white/30">{sources.length}</span>
      </div>

      <div className="orbit-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {sources.map((source, index) => {
          const icon = faviconFor(source.url, source.favicon)
          return (
            <a
              key={source.id}
              href={source.url}
              target="_blank"
              rel="noreferrer"
              title={source.title || source.url}
              className="flex w-[168px] shrink-0 flex-col gap-1.5 rounded-lg border border-[#21262d] bg-[#161b22] p-2.5 transition-colors duration-200 hover:border-[#30363d] hover:bg-[#21262d]/60"
            >
              <div className="flex items-center gap-1.5">
                {icon && (
                  <img
                    src={icon}
                    alt=""
                    className="h-3.5 w-3.5 shrink-0 rounded-sm"
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none'
                    }}
                  />
                )}
                <span className="flex-1 truncate text-[10px] text-white/45">
                  {domainOf(source.url)}
                </span>
                <span className="text-[10px] tabular-nums text-white/25">{index + 1}</span>
              </div>

              <span className="line-clamp-2 text-[11px] leading-snug text-white/80">
                {source.title || domainOf(source.url)}
              </span>

              {source.snippet && (
                <span className="line-clamp-2 text-[10px] leading-snug text-white/35">
                  {source.snippet}
                </span>
              )}
            </a>
          )
        })}
      </div>
    </div>
  )
}
