import { Hammer } from 'lucide-react'

/**
 * "This looks like a task" nudge.
 *
 * Shown between the transcript and the composer when the user sends something
 * from ask mode that `taskIntent.looksLikeTask` reads as an instruction rather
 * than a question.
 *
 * Deliberately NOT `window.confirm()`: a native modal blocks the Electron
 * renderer's event loop, and in a WebContentsView-backed sidebar that can wedge
 * the whole window. This is a normal element in the normal flow.
 */

interface ModeSuggestionProps {
  /** The message being held back, echoed so the user knows what this is about. */
  message: string
  /** Switch to agent mode and send. */
  onAccept: () => void
  /** Send as-is in ask mode, and don't ask again for this message. */
  onDeny: () => void
}

export function ModeSuggestion({ message, onAccept, onDeny }: ModeSuggestionProps): JSX.Element {
  return (
    <div
      role="alertdialog"
      aria-label="Switch to agent mode?"
      className="orbit-rise mx-4 mb-2 rounded-xl border border-teal-500/30 bg-teal-500/[0.06] p-3"
    >
      <div className="flex items-start gap-2">
        <Hammer size={13} className="mt-0.5 shrink-0 text-teal-400" />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-white/85">
            This looks like a task. Switch to agent mode?
          </p>
          <p className="mt-0.5 truncate text-[11px] text-white/40" title={message}>
            {message}
          </p>
          <p className="mt-1 text-[10.5px] leading-snug text-white/30">
            Agent mode can navigate, click and type on your behalf. Ask mode will just answer.
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onDeny}
          className="rounded-md border border-[#21262d] px-2.5 py-1 text-[11px] text-white/55 transition-colors duration-150 hover:bg-[#21262d] hover:text-white/85"
        >
          Deny
        </button>
        <button
          type="button"
          onClick={onAccept}
          className="rounded-md bg-teal-500 px-2.5 py-1 text-[11px] font-medium text-[#08131a] transition-colors duration-150 hover:bg-teal-400"
        >
          Accept
        </button>
      </div>
    </div>
  )
}
