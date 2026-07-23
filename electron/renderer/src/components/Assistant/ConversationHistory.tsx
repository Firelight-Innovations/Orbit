import { useState } from 'react'
import { MessageSquare, SquarePen, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StoredConversation, relativeTime } from './conversationStorage'

/**
 * Previous chats.
 *
 * An overlay over the transcript rather than a separate tab — the assistant is
 * 420px wide, so a full-height sheet that dismisses back to where you were
 * costs less than a navigation. Same visual language as the rest of the panel:
 * hairline borders, the #161b22 surface, teal for the active row.
 *
 * Delete asks for a second click on the same row instead of a dialog (see the
 * note in ModeSuggestion.tsx about native modals in this renderer).
 */

interface ConversationHistoryProps {
  conversations: StoredConversation[]
  /** The conversation currently loaded in the panel, if it's one of these. */
  activeId: string
  onSelect: (conversation: StoredConversation) => void
  onDelete: (id: string) => void
  onNewChat: () => void
  onClose: () => void
}

export function ConversationHistory({
  conversations,
  activeId,
  onSelect,
  onDelete,
  onNewChat,
  onClose
}: ConversationHistoryProps): JSX.Element {
  // Id of the row awaiting a confirming second click on its trash button.
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  return (
    <div className="orbit-rise absolute inset-0 z-40 flex flex-col bg-[#0d1117]">
      <div className="flex shrink-0 items-center justify-between border-b border-[#21262d] px-4 py-2.5">
        <h3 className="text-[12px] font-medium text-white/70">Previous chats</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onNewChat}
            title="New chat"
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-white/45 transition-colors duration-150 hover:bg-[#21262d] hover:text-white/80"
          >
            <SquarePen size={13} />
            New
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close history"
            className="rounded-md p-1.5 text-white/35 transition-colors duration-150 hover:bg-[#21262d] hover:text-white/80"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="orbit-scroll flex-1 overflow-y-auto px-2 py-2">
        {conversations.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <MessageSquare size={20} className="mb-3 text-white/20" />
            <p className="text-[12px] text-white/40">No previous chats yet.</p>
            <p className="mt-1 text-[11px] text-white/25">
              Conversations are saved on this device as you go.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {conversations.map((conversation) => {
              const isActive = conversation.id === activeId
              const isConfirming = confirmingId === conversation.id

              return (
                <li key={conversation.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onSelect(conversation)}
                    className={cn(
                      'flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 pr-9 text-left transition-colors duration-150',
                      isActive ? 'bg-[#21262d]/70' : 'hover:bg-[#161b22]'
                    )}
                  >
                    <span
                      className={cn(
                        'w-full truncate text-[12px]',
                        isActive ? 'text-teal-300' : 'text-white/80'
                      )}
                    >
                      {conversation.title}
                    </span>
                    <span className="text-[10px] text-white/30">
                      {relativeTime(conversation.updatedAt)} ·{' '}
                      {conversation.messages.filter((message) => message.role === 'user').length}{' '}
                      message
                      {conversation.messages.filter((message) => message.role === 'user').length ===
                      1
                        ? ''
                        : 's'}
                    </span>
                  </button>

                  <button
                    type="button"
                    title={isConfirming ? 'Click again to delete' : 'Delete chat'}
                    onClick={() => {
                      if (isConfirming) {
                        onDelete(conversation.id)
                        setConfirmingId(null)
                      } else {
                        setConfirmingId(conversation.id)
                      }
                    }}
                    onBlur={() => setConfirmingId((id) => (id === conversation.id ? null : id))}
                    className={cn(
                      'absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 transition-colors duration-150',
                      isConfirming
                        ? 'bg-red-500/15 text-red-400'
                        : 'text-white/0 hover:bg-[#21262d] hover:text-white/70 group-hover:text-white/35'
                    )}
                  >
                    <Trash2 size={12} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
