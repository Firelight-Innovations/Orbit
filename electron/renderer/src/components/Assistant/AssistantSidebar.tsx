import { useRef, useEffect, useState, useCallback } from 'react'
import { X, Trash2 } from 'lucide-react'
import { assistantStore, useAssistantStore, AssistantMode, AssistantTab } from '@/stores/assistantStore'
import { cn } from '@/lib/utils'
import { applyAssistantEvent, AssistantStreamEvent } from './agentEvents'
import { ChatTurn } from './ChatTurn'
import { Composer } from './Composer'
import { MODES } from './modes'
import './assistant.css'

/**
 * Assistant sidebar — a Perplexity-style answer surface modelled on Simplicity.
 *
 * Layout, top to bottom:
 *   header (chat/workflows tabs, clear, close)
 *   transcript — full-width turns, no bubbles: question as a serif heading,
 *     then the agent's step timeline, its sources, then the answer
 *   composer — pinned, with the mode picker and send/stop
 *
 * Streaming: every SSE event is handed to `applyAssistantEvent` (see
 * agentEvents.ts), which is the one place that knows the wire contract. When
 * the backend sends only `chunk`/`done` — which is all it sends today — no
 * steps or sources exist, those blocks render nothing, and the turn degrades to
 * a plain streaming answer.
 */

interface AssistantSidebarProps {
  activeUrl?: string | null
  selectedText?: string | null
  topOffset?: number
}

export function AssistantSidebar({
  activeUrl,
  selectedText,
  topOffset = 0
}: AssistantSidebarProps): JSX.Element {
  const { isSending, messages, pageContext, mode, activeTab, conversationId } = useAssistantStore(
    (state) => state
  )
  const [input, setInput] = useState('')
  const cleanupRef = useRef<(() => void) | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  // Keep the store's copy of page context in step with the props pushed over IPC.
  useEffect(() => {
    assistantStore.setPageContext({ url: activeUrl ?? null, selectedText: selectedText ?? null })
  }, [activeUrl, selectedText])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') assistantStore.close()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    return () => {
      cleanupRef.current?.()
    }
  }, [])

  // Stick to the bottom, but only while the user is already near it — scrolling
  // up to read a source shouldn't get yanked back down by the next chunk.
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight
    if (distanceFromBottom < 160) {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [messages])

  // Fallback for when the streaming bridge can't be established at all. Keeps
  // the non-streaming `assistant.sendMessage` IPC path alive and reachable.
  const handleSendBuffered = useCallback(
    async (message: string, assistantMessageId: string) => {
      try {
        const response = await window.electronAPI.assistant.sendMessage(
          message,
          {
            url: pageContext?.url ?? activeUrl ?? null,
            selectedText: pageContext?.selectedText ?? selectedText ?? null
          },
          mode,
          conversationId
        )

        if (response?.error) {
          assistantStore.failMessage(assistantMessageId, response.error)
        } else {
          assistantStore.updateMessage(assistantMessageId, {
            content: response?.response ?? ''
          })
          assistantStore.completeStreaming(assistantMessageId)
        }
      } catch (error) {
        assistantStore.failMessage(
          assistantMessageId,
          error instanceof Error ? error.message : 'Unknown error'
        )
      } finally {
        assistantStore.setSending(false)
      }
    },
    [activeUrl, selectedText, pageContext, mode, conversationId]
  )

  const handleSendStreaming = useCallback(
    (message: string, assistantMessageId: string) => {
      const contextToSend = {
        url: pageContext?.url ?? activeUrl ?? null,
        selectedText: pageContext?.selectedText ?? selectedText ?? null
      }

      const cleanup = window.electronAPI.assistant.sendMessageStream(
        message,
        contextToSend,
        mode,
        conversationId,
        {
          onEvent: (event) => {
            const outcome = applyAssistantEvent(
              assistantMessageId,
              event as AssistantStreamEvent
            )
            if (outcome.finished) {
              assistantStore.setSending(false)
              cleanupRef.current = null
            }
          },
          onError: (error) => {
            assistantStore.failMessage(assistantMessageId, error)
            assistantStore.setSending(false)
            cleanupRef.current = null
          },
          onComplete: () => {
            cleanupRef.current = null
          }
        }
      )

      cleanupRef.current = cleanup
      return true
    },
    [activeUrl, selectedText, pageContext, mode, conversationId]
  )

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || isSending) return

    assistantStore.addMessage({
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      mode
    })

    const assistantMessageId = `assistant-${Date.now()}`
    assistantStore.addMessage({
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      pending: true,
      streaming: true,
      mode
    })

    setInput('')
    assistantStore.setSending(true)

    try {
      handleSendStreaming(trimmed, assistantMessageId)
    } catch {
      void handleSendBuffered(trimmed, assistantMessageId)
    }
  }, [input, isSending, mode, handleSendStreaming, handleSendBuffered])

  const handleStop = useCallback(() => {
    cleanupRef.current?.()
    cleanupRef.current = null
    assistantStore.setSending(false)
    assistantStore.getState().messages.forEach((message) => {
      if (message.streaming) {
        assistantStore.completeStreaming(message.id)
        assistantStore.updateMessage(message.id, {
          content: message.content ? `${message.content}\n\n_Stopped._` : '_Stopped._'
        })
      }
    })
  }, [])

  const activeMode = MODES[mode]
  const EmptyIcon = activeMode.icon

  const TabButton = ({ tab, label }: { tab: AssistantTab; label: string }): JSX.Element => (
    <button
      type="button"
      onClick={() => assistantStore.setActiveTab(tab)}
      className={cn(
        'relative px-1 pb-2 pt-1 text-[12px] transition-colors duration-150',
        activeTab === tab ? 'text-white' : 'text-white/40 hover:text-white/70'
      )}
    >
      {label}
      {activeTab === tab && (
        <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-teal-400" />
      )}
    </button>
  )

  return (
    <aside
      className="orbit-assistant flex w-[420px] flex-col overflow-hidden border-l border-[#21262d] bg-[#0d1117]"
      style={{ height: `calc(100vh - ${topOffset}px)` }}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-[#21262d] px-4 pt-3">
        <nav className="flex items-center gap-5">
          <TabButton tab="chat" label="Chat" />
          <TabButton tab="workflows" label="Workflows" />
        </nav>

        <div className="flex items-center gap-1 pb-2">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => assistantStore.clearMessages()}
              title="New chat"
              className="rounded-md p-1.5 text-white/35 transition-colors duration-150 hover:bg-[#21262d] hover:text-white/80"
            >
              <Trash2 size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={() => assistantStore.close()}
            title="Close"
            className="rounded-md p-1.5 text-white/35 transition-colors duration-150 hover:bg-[#21262d] hover:text-white/80"
          >
            <X size={15} />
          </button>
        </div>
      </header>

      {activeTab === 'chat' ? (
        <>
          <div ref={scrollRef} className="orbit-scroll relative flex-1 overflow-y-auto px-4 py-5">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-4 text-center">
                <EmptyIcon size={22} className={cn('mb-4', activeMode.accentText)} />
                <h2 className="orbit-serif text-[28px] leading-tight tracking-tight text-white/75">
                  {activeMode.headline}
                </h2>
                <p className="mt-2 max-w-[260px] text-[12px] leading-relaxed text-white/35">
                  {activeMode.blurb}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {messages.map((message, index) => (
                  <ChatTurn
                    key={message.id}
                    message={message}
                    showDivider={message.role === 'user' && index > 0}
                  />
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <Composer
            value={input}
            onChange={setInput}
            onSubmit={handleSend}
            onStop={handleStop}
            isSending={isSending}
            mode={mode}
            onModeChange={(next: AssistantMode) => assistantStore.setMode(next)}
            pageUrl={pageContext?.url ?? activeUrl}
            selectedText={pageContext?.selectedText ?? selectedText}
          />
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <h2 className="orbit-serif text-[24px] tracking-tight text-white/60">Workflows</h2>
          <p className="mt-2 text-[12px] text-white/30">Saved multi-step routines land here soon.</p>
        </div>
      )}
    </aside>
  )
}
