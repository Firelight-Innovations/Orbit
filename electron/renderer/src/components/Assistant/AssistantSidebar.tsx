import { useRef, useEffect, useState, useCallback } from 'react'
import { X, History, SquarePen } from 'lucide-react'
import { assistantStore, useAssistantStore, AssistantMode, AssistantTab } from '@/stores/assistantStore'
import { cn } from '@/lib/utils'
import { applyAssistantEvent, AssistantStreamEvent } from './agentEvents'
import { ChatTurn } from './ChatTurn'
import { Composer } from './Composer'
import { ConversationHistory } from './ConversationHistory'
import { ModeSuggestion } from './ModeSuggestion'
import { modeConfig } from './modes'
import { looksLikeTask } from './taskIntent'
import {
  StoredConversation,
  loadConversations,
  saveConversation,
  deleteConversation,
  loadMode,
  saveMode
} from './conversationStorage'
import './assistant.css'

/**
 * Assistant sidebar — a Perplexity-style answer surface modelled on Simplicity.
 *
 * Layout, top to bottom:
 *   header (chat/workflows tabs, history, new chat, close)
 *   transcript — full-width turns, no bubbles: question as a serif heading,
 *     then the agent's step timeline, its sources, then the answer
 *   composer — pinned, with the mode picker and send/stop
 *
 * Streaming: every SSE event is handed to `applyAssistantEvent` (see
 * agentEvents.ts), which is the one place that knows the wire contract. When
 * the backend sends only `chunk`/`done` — which is all it sends today — no
 * steps or sources exist, those blocks render nothing, and the turn degrades to
 * a plain streaming answer.
 *
 * History lives entirely in this renderer's localStorage (conversationHistory.ts).
 * The `conversationId` is carried through unchanged when a chat is restored,
 * because the backend keys its own server-side history on that same value.
 */

/**
 * How long the transcript has to stop changing before it's written to storage.
 * Streaming fires a store update per chunk; without this we'd serialise the
 * whole conversation dozens of times a second.
 */
const PERSIST_DEBOUNCE_MS = 700

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

  // --- previous chats ------------------------------------------------------
  const [conversations, setConversations] = useState<StoredConversation[]>(() =>
    loadConversations()
  )
  const [showHistory, setShowHistory] = useState(false)
  const persistTimerRef = useRef<number | null>(null)
  // Set for one tick when a conversation is restored, so re-hydrating the panel
  // doesn't immediately re-save it and bump it to the top of the list.
  const skipPersistRef = useRef(false)

  // --- ask -> agent nudge --------------------------------------------------
  // The message held back while the user answers the "this looks like a task"
  // prompt. `null` means nothing is pending.
  const [pendingTask, setPendingTask] = useState<string | null>(null)
  // Messages the user has already declined to escalate. Denying once is enough;
  // retyping the same thing shouldn't re-open the prompt.
  const declinedRef = useRef<Set<string>>(new Set())

  // Keep the store's copy of page context in step with the props pushed over IPC.
  useEffect(() => {
    assistantStore.setPageContext({ url: activeUrl ?? null, selectedText: selectedText ?? null })
  }, [activeUrl, selectedText])

  // Restore the last-used mode. Read through `normalizeMode`, so a `plan` value
  // written by a build that still had that mode comes back as `ask`.
  useEffect(() => {
    assistantStore.setMode(loadMode())
  }, [])

  useEffect(() => {
    saveMode(mode)
  }, [mode])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // Escape peels one layer at a time rather than jumping straight to close.
      if (showHistory) setShowHistory(false)
      else assistantStore.close()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showHistory])

  useEffect(() => {
    return () => {
      cleanupRef.current?.()
      if (persistTimerRef.current !== null) window.clearTimeout(persistTimerRef.current)
    }
  }, [])

  // Persist the live conversation. Debounced because `messages` changes on every
  // streamed chunk; the trailing write lands once the turn goes quiet.
  useEffect(() => {
    if (!messages.length) return
    if (skipPersistRef.current) {
      skipPersistRef.current = false
      return
    }

    if (persistTimerRef.current !== null) window.clearTimeout(persistTimerRef.current)
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null
      setConversations(saveConversation(conversationId, messages))
    }, PERSIST_DEBOUNCE_MS)

    return () => {
      if (persistTimerRef.current !== null) window.clearTimeout(persistTimerRef.current)
    }
  }, [messages, conversationId])

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
    async (message: string, assistantMessageId: string, sendMode: AssistantMode) => {
      try {
        const response = await window.electronAPI.assistant.sendMessage(
          message,
          {
            url: pageContext?.url ?? activeUrl ?? null,
            selectedText: pageContext?.selectedText ?? selectedText ?? null
          },
          sendMode,
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
    [activeUrl, selectedText, pageContext, conversationId]
  )

  const handleSendStreaming = useCallback(
    (message: string, assistantMessageId: string, sendMode: AssistantMode) => {
      const contextToSend = {
        url: pageContext?.url ?? activeUrl ?? null,
        selectedText: pageContext?.selectedText ?? selectedText ?? null
      }

      const cleanup = window.electronAPI.assistant.sendMessageStream(
        message,
        contextToSend,
        sendMode,
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
    [activeUrl, selectedText, pageContext, conversationId]
  )

  /**
   * Commit a message to the transcript and start the turn.
   *
   * `sendMode` is passed explicitly rather than read from the store: accepting
   * the agent-mode nudge switches the mode and sends in the same tick, and the
   * `mode` this component closed over is still the old value at that point.
   */
  const dispatchSend = useCallback(
    (message: string, sendMode: AssistantMode) => {
      assistantStore.addMessage({
        id: `user-${Date.now()}`,
        role: 'user',
        content: message,
        mode: sendMode
      })

      const assistantMessageId = `assistant-${Date.now()}`
      assistantStore.addMessage({
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        pending: true,
        streaming: true,
        mode: sendMode
      })

      setInput('')
      assistantStore.setSending(true)

      try {
        handleSendStreaming(message, assistantMessageId, sendMode)
      } catch {
        void handleSendBuffered(message, assistantMessageId, sendMode)
      }
    },
    [handleSendStreaming, handleSendBuffered]
  )

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || isSending) return

    // Only ask mode gets the nudge, and only once per distinct message.
    if (mode === 'ask' && !declinedRef.current.has(trimmed) && looksLikeTask(trimmed)) {
      setPendingTask(trimmed)
      return
    }

    dispatchSend(trimmed, mode)
  }, [input, isSending, mode, dispatchSend])

  /** Nudge accepted: switch the composer to agent mode and send there. */
  const handleAcceptAgentMode = useCallback(() => {
    if (!pendingTask) return
    assistantStore.setMode('agent')
    dispatchSend(pendingTask, 'agent')
    setPendingTask(null)
  }, [pendingTask, dispatchSend])

  /**
   * Editing the composer while the nudge is up invalidates it — the prompt was
   * about the old text, so silently dismiss rather than send something the user
   * has moved on from.
   */
  const handleInputChange = useCallback(
    (next: string) => {
      setInput(next)
      if (pendingTask && next.trim() !== pendingTask) setPendingTask(null)
    },
    [pendingTask]
  )

  /** Nudge declined: send unchanged, and remember not to ask about this again. */
  const handleDenyAgentMode = useCallback(() => {
    if (!pendingTask) return
    declinedRef.current.add(pendingTask)
    dispatchSend(pendingTask, 'ask')
    setPendingTask(null)
  }, [pendingTask, dispatchSend])

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

  // --- previous chats: new / open / delete ---------------------------------

  /**
   * Write the live conversation now, cancelling any debounced write.
   *
   * Called before anything that swaps the transcript out, so a chat can't be
   * lost inside the debounce window. Reads straight from the store rather than
   * from props so it never works off a stale closure.
   */
  const flushPersist = useCallback(() => {
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current)
      persistTimerRef.current = null
    }
    const live = assistantStore.getState()
    setConversations(
      live.messages.length
        ? saveConversation(live.conversationId, live.messages)
        : loadConversations()
    )
  }, [])

  // Opening the sheet flushes first, so the chat you're currently in is already
  // in the list and up to date when it appears.
  useEffect(() => {
    if (showHistory) flushPersist()
  }, [showHistory, flushPersist])

  /**
   * Start a fresh thread. The outgoing conversation has already been written to
   * storage by the persist effect, so nothing is lost — `clearMessages` just
   * mints a new `conversationId`, which starts a new bucket on the backend too.
   */
  const handleNewChat = useCallback(() => {
    cleanupRef.current?.()
    cleanupRef.current = null
    assistantStore.setSending(false)
    flushPersist()
    assistantStore.clearMessages()
    setPendingTask(null)
    setShowHistory(false)
    setInput('')
  }, [flushPersist])

  const handleSelectConversation = useCallback(
    (conversation: StoredConversation) => {
      // Abandon anything still streaming into the thread we're leaving, and get
      // it written out before it's replaced.
      cleanupRef.current?.()
      cleanupRef.current = null
      flushPersist()
      // The restore itself must not be treated as an edit worth re-saving.
      skipPersistRef.current = true
      assistantStore.loadConversation(conversation.id, conversation.messages)
      setPendingTask(null)
      setShowHistory(false)
    },
    [flushPersist]
  )

  const handleDeleteConversation = useCallback(
    (id: string) => {
      setConversations(deleteConversation(id))
      // Deleting the chat you're looking at empties the panel rather than
      // leaving an orphaned transcript that would just be re-saved.
      if (id === conversationId) {
        assistantStore.clearMessages()
        setPendingTask(null)
      }
    },
    [conversationId]
  )

  const activeMode = modeConfig(mode)
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
          <button
            type="button"
            onClick={() => setShowHistory((open) => !open)}
            title="Previous chats"
            className={cn(
              'rounded-md p-1.5 transition-colors duration-150 hover:bg-[#21262d] hover:text-white/80',
              showHistory ? 'bg-[#21262d] text-white/80' : 'text-white/35'
            )}
          >
            <History size={14} />
          </button>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleNewChat}
              title="New chat"
              className="rounded-md p-1.5 text-white/35 transition-colors duration-150 hover:bg-[#21262d] hover:text-white/80"
            >
              <SquarePen size={14} />
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
        // `relative` anchors the history sheet, which overlays the transcript
        // and the composer without unmounting either.
        <div className="relative flex min-h-0 flex-1 flex-col">
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

          {pendingTask && (
            <ModeSuggestion
              message={pendingTask}
              onAccept={handleAcceptAgentMode}
              onDeny={handleDenyAgentMode}
            />
          )}

          <Composer
            value={input}
            onChange={handleInputChange}
            onSubmit={handleSend}
            onStop={handleStop}
            isSending={isSending}
            mode={mode}
            onModeChange={(next: AssistantMode) => assistantStore.setMode(next)}
            pageUrl={pageContext?.url ?? activeUrl}
            selectedText={pageContext?.selectedText ?? selectedText}
          />

          {showHistory && (
            <ConversationHistory
              conversations={conversations}
              activeId={conversationId}
              onSelect={handleSelectConversation}
              onDelete={handleDeleteConversation}
              onNewChat={handleNewChat}
              onClose={() => setShowHistory(false)}
            />
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <h2 className="orbit-serif text-[24px] tracking-tight text-white/60">Workflows</h2>
          <p className="mt-2 text-[12px] text-white/30">Saved multi-step routines land here soon.</p>
        </div>
      )}
    </aside>
  )
}
