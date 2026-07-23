import { useEffect, useRef, useState } from 'react'
import { ArrowUp, ChevronDown, Square, Globe, TextQuote } from 'lucide-react'
import { AssistantMode } from '@/stores/assistantStore'
import { cn } from '@/lib/utils'
import { domainOf } from './sourceUtils'
import { MODES, MODE_ORDER, modeConfig } from './modes'

/**
 * Message composer.
 *
 * The card *is* the form (Simplicity's pattern): rounded-2xl surface, hairline
 * border that brightens on focus-within, autosizing transparent textarea, and a
 * control row that's always visible — mode picker on the left, circular send on
 * the right. Send swaps to a stop button while a turn is streaming.
 */

interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onStop: () => void
  isSending: boolean
  mode: AssistantMode
  onModeChange: (mode: AssistantMode) => void
  pageUrl?: string | null
  selectedText?: string | null
}

export function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  isSending,
  mode,
  onModeChange,
  pageUrl,
  selectedText
}: ComposerProps): JSX.Element {
  const [showModePicker, setShowModePicker] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  // Autosize without pulling in react-textarea-autosize.
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`
  }, [value])

  // Dismiss the mode picker on any outside click.
  useEffect(() => {
    if (!showModePicker) return
    const handler = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setShowModePicker(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showModePicker])

  const activeMode = modeConfig(mode)
  const ActiveIcon = activeMode.icon
  const hasContext = Boolean(pageUrl || selectedText)

  return (
    <div className="relative">
      {/* Scrim so the transcript fades out behind the composer rather than
          hard-stopping at its edge. */}
      <div className="pointer-events-none absolute inset-x-0 -top-10 h-10 bg-gradient-to-t from-[#0d1117] to-transparent" />

      <div className="px-4 pb-4">
        {hasContext && (
          <div className="mb-2 flex items-center gap-1.5 overflow-hidden px-1">
            {pageUrl && (
              <span
                title={pageUrl}
                className="flex min-w-0 items-center gap-1 rounded-full border border-[#21262d] bg-[#161b22] px-2 py-0.5 text-[10px] text-white/45"
              >
                <Globe size={9} className="shrink-0" />
                <span className="truncate">{domainOf(pageUrl)}</span>
              </span>
            )}
            {selectedText && (
              <span
                title={selectedText}
                className="flex min-w-0 items-center gap-1 rounded-full border border-[#21262d] bg-[#161b22] px-2 py-0.5 text-[10px] text-white/45"
              >
                <TextQuote size={9} className="shrink-0" />
                <span className="truncate">selection</span>
              </span>
            )}
          </div>
        )}

        {/* `orbit-composer` is the focus target for the whole card — see the
            focus block in assistant.css for why this can't be a Tailwind
            utility. */}
        <div className="orbit-composer rounded-2xl border border-[#21262d] bg-[#161b22] p-3 shadow-sm shadow-black/20 transition-colors duration-200">
          <textarea
            ref={textareaRef}
            value={value}
            rows={1}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                onSubmit()
              }
            }}
            placeholder={activeMode.placeholder}
            className="orbit-composer-input orbit-scroll max-h-[180px] w-full resize-none bg-transparent px-1 text-[13px] leading-relaxed text-white placeholder-white/30"
          />

          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="relative" ref={pickerRef}>
              {showModePicker && (
                <div className="absolute bottom-full left-0 z-50 mb-2 w-[190px] overflow-hidden rounded-lg border border-[#21262d] bg-[#161b22] shadow-xl shadow-black/40">
                  {MODE_ORDER.map((key) => {
                    const config = MODES[key]
                    const Icon = config.icon
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          onModeChange(key)
                          setShowModePicker(false)
                        }}
                        className={cn(
                          'flex w-full items-start gap-2 px-2.5 py-2 text-left transition-colors duration-150 hover:bg-[#21262d]',
                          mode === key && 'bg-[#21262d]/70'
                        )}
                      >
                        <Icon size={13} className={cn('mt-0.5 shrink-0', config.accentText)} />
                        <span className="min-w-0">
                          <span className="block text-[12px] capitalize text-white/85">{key}</span>
                          <span className="block text-[10px] leading-snug text-white/35">
                            {config.tagline}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowModePicker((open) => !open)}
                className="flex items-center gap-1.5 rounded-md border border-[#21262d] px-2 py-1 text-[11px] text-white/60 transition-colors duration-150 hover:bg-[#21262d] hover:text-white/85"
              >
                <ActiveIcon size={12} className={activeMode.accentText} />
                <span className="capitalize">{mode}</span>
                <ChevronDown size={11} className="text-white/30" />
              </button>
            </div>

            {isSending ? (
              <button
                type="button"
                onClick={onStop}
                title="Stop"
                className="rounded-full bg-white p-2 text-black transition-opacity duration-150 hover:opacity-85"
              >
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSubmit}
                disabled={!value.trim()}
                title="Send"
                className="rounded-full bg-[#24a0ed] p-2 text-white transition-colors duration-150 hover:bg-[#1b8fd6] disabled:bg-[#ececec21] disabled:text-white/30"
              >
                <ArrowUp size={15} />
              </button>
            )}
          </div>
        </div>

        <p className="mt-2 text-center text-[10px] text-white/20">
          Orbit can make mistakes. Verify important info.
        </p>
      </div>
    </div>
  )
}
