import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Send, X } from 'lucide-react'
import { ChatMessage } from './ChatMessage'
import { ContextBadge } from './ContextBadge'
import { assistantStore, useAssistantStore, AssistantMode, AssistantTab } from '@/stores/assistantStore'
import { cn } from '@/lib/utils'

interface AssistantSidebarProps {
  activeUrl?: string | null
  selectedText?: string | null
  topOffset?: number
}

const MODE_COLORS = {
  ask: {
    bg: 'from-blue-500/10 via-violet-500/10 to-purple-500/10',
    border: 'border-violet-500/20',
    text: 'text-violet-400',
    button: 'bg-violet-500/10 border-violet-500/30 text-violet-300'
  },
  agent: {
    bg: 'from-emerald-500/10 via-teal-500/10 to-green-500/10',
    border: 'border-teal-500/20',
    text: 'text-teal-400',
    button: 'bg-teal-500/10 border-teal-500/30 text-teal-300'
  },
  plan: {
    bg: 'from-amber-500/10 via-orange-500/10 to-yellow-500/10',
    border: 'border-orange-500/20',
    text: 'text-orange-400',
    button: 'bg-orange-500/10 border-orange-500/30 text-orange-300'
  }
}

const MODE_PLACEHOLDERS = {
  ask: 'Ask me anything...',
  agent: 'What should I do?',
  plan: 'What would you like to accomplish?'
}

export function AssistantSidebar({ activeUrl, selectedText, topOffset = 0 }: AssistantSidebarProps) {
  const { isSending, messages, pageContext, mode, activeTab } = useAssistantStore((s) => s)
  const [input, setInput] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    assistantStore.setPageContext({ url: activeUrl ?? null, selectedText: selectedText ?? null })
  }, [activeUrl, selectedText])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        assistantStore.close()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  const currentContext = useMemo(() => {
    return {
      url: pageContext?.url ?? activeUrl ?? null,
      selectedText: pageContext?.selectedText ?? selectedText ?? null
    }
  }, [activeUrl, pageContext?.selectedText, pageContext?.url, selectedText])

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed) return

    // Only "ask" mode is functional
    if (mode !== 'ask') {
      return
    }

    const userMessageId = `user-${Date.now()}`
    const assistantMessageId = `assistant-${Date.now()}`

    assistantStore.addMessage({
      id: userMessageId,
      role: 'user',
      content: trimmed
    })

    assistantStore.addMessage({
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      pending: true
    })

    setInput('')
    assistantStore.setSending(true)

    const response = await window.electronAPI.assistant.sendMessage(trimmed, {
      url: currentContext.url,
      selectedText: currentContext.selectedText
    })

    if (response?.error) {
      assistantStore.updateMessage(assistantMessageId, {
        pending: false,
        error: response.error,
        content: ''
      })
    } else {
      assistantStore.updateMessage(assistantMessageId, {
        pending: false,
        content: response?.response ?? ''
      })
    }

    assistantStore.setSending(false)
  }

  const handleModeChange = (newMode: AssistantMode) => {
    assistantStore.setMode(newMode)
  }

  const handleTabChange = (newTab: AssistantTab) => {
    assistantStore.setActiveTab(newTab)
  }

  const modeStyles = MODE_COLORS[mode]
  const isNotAskMode = mode !== 'ask'

  return (
    <motion.aside
      initial={{ opacity: 0, x: 32 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 32 }}
      transition={{ type: 'spring', stiffness: 240, damping: 26 }}
      className="relative flex w-[420px] flex-col border-l border-zinc-800 bg-zinc-950"
      style={{
        height: `calc(100vh - ${topOffset}px)`
      }}
    >
      {/* Animated background gradient */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className={cn('absolute inset-0 bg-gradient-to-br', modeStyles.bg)}
          animate={{
            opacity: [0.3, 0.5, 0.3]
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 flex h-full flex-col">
        {/* Header with mode selector */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg bg-zinc-900/60 p-1">
              <button
                onClick={() => handleModeChange('ask')}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                  mode === 'ask'
                    ? 'bg-violet-500/20 text-violet-300 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                )}
              >
                Ask
              </button>
              <button
                onClick={() => handleModeChange('agent')}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                  mode === 'agent'
                    ? 'bg-teal-500/20 text-teal-300 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                )}
              >
                Agent
              </button>
              <button
                onClick={() => handleModeChange('plan')}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                  mode === 'plan'
                    ? 'bg-orange-500/20 text-orange-300 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                )}
              >
                Plan
              </button>
            </div>
          </div>
          <button
            aria-label="Close assistant"
            onClick={() => assistantStore.close()}
            className="rounded-md p-2 text-zinc-500 transition hover:bg-zinc-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab navigation */}
        <div className="flex items-center gap-1 border-b border-zinc-800 px-4">
          <button
            onClick={() => handleTabChange('chat')}
            className={cn(
              'relative px-4 py-2.5 text-sm font-medium transition-colors',
              activeTab === 'chat'
                ? cn('text-white', modeStyles.text)
                : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            Chat
            {activeTab === 'chat' && (
              <motion.div
                layoutId="activeTab"
                className={cn('absolute bottom-0 left-0 right-0 h-0.5', modeStyles.button.split(' ')[0])}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
          </button>
          <button
            onClick={() => handleTabChange('workflows')}
            className={cn(
              'relative px-4 py-2.5 text-sm font-medium transition-colors',
              activeTab === 'workflows'
                ? cn('text-white', modeStyles.text)
                : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            Workflows
            {activeTab === 'workflows' && (
              <motion.div
                layoutId="activeTab"
                className={cn('absolute bottom-0 left-0 right-0 h-0.5', modeStyles.button.split(' ')[0])}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
          </button>
          <button
            onClick={() => handleTabChange('agents')}
            className={cn(
              'relative px-4 py-2.5 text-sm font-medium transition-colors',
              activeTab === 'agents'
                ? cn('text-white', modeStyles.text)
                : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            Agents
            {activeTab === 'agents' && (
              <motion.div
                layoutId="activeTab"
                className={cn('absolute bottom-0 left-0 right-0 h-0.5', modeStyles.button.split(' ')[0])}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
          </button>
        </div>

        {/* Context badge (only for chat tab) */}
        {activeTab === 'chat' && (
          <div className="border-b border-zinc-900 px-4 py-3">
            <ContextBadge url={currentContext.url} selectedText={currentContext.selectedText ?? undefined} />
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'chat' && (
            <div ref={listRef} className="h-full overflow-y-auto px-4 py-4">
              <div className="flex flex-col gap-3">
                {messages.map((message) => (
                  <ChatMessage key={message.id} message={message} />
                ))}
                {messages.length === 0 && (
                  <div className={cn(
                    'rounded-lg border border-dashed bg-zinc-900/40 p-4 text-sm text-zinc-500',
                    modeStyles.border
                  )}>
                    {mode === 'ask' && 'Ask me to navigate, fill forms, or summarize what you see.'}
                    {mode === 'agent' && 'Agent mode will help you accomplish complex tasks automatically.'}
                    {mode === 'plan' && 'Plan mode will help you break down and execute multi-step workflows.'}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'workflows' && (
            <div className="flex h-full items-center justify-center px-4">
              <div className="text-center">
                <div className={cn('text-lg font-semibold', modeStyles.text)}>Workflows</div>
                <p className="mt-2 text-sm text-zinc-500">Coming soon</p>
                <p className="mt-1 text-xs text-zinc-600">
                  Create and manage custom workflows for repetitive tasks
                </p>
              </div>
            </div>
          )}

          {activeTab === 'agents' && (
            <div className="flex h-full items-center justify-center px-4">
              <div className="text-center">
                <div className={cn('text-lg font-semibold', modeStyles.text)}>Agents</div>
                <p className="mt-2 text-sm text-zinc-500">Coming soon</p>
                <p className="mt-1 text-xs text-zinc-600">
                  Browse and use specialized AI agents for different tasks
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Input section (only for chat tab) */}
        {activeTab === 'chat' && (
          <div className="border-t border-zinc-800 bg-zinc-950/80 px-4 py-3">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className={cn(
                  'flex-1 rounded-md border bg-zinc-900/80 px-3 py-2',
                  modeStyles.border
                )}>
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={isNotAskMode ? `${MODE_PLACEHOLDERS[mode]} (Coming soon)` : MODE_PLACEHOLDERS[mode]}
                    rows={3}
                    disabled={isNotAskMode}
                    className="w-full resize-none bg-transparent text-sm text-white outline-none placeholder:text-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !isNotAskMode) {
                        e.preventDefault()
                        handleSend()
                      }
                    }}
                  />
                </div>
                <button
                  onClick={handleSend}
                  disabled={isSending || !input.trim() || isNotAskMode}
                  className={cn(
                    'rounded-md border px-3 py-2 text-sm font-medium transition',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    'flex items-center gap-2',
                    modeStyles.button,
                    !isNotAskMode && 'hover:opacity-80'
                  )}
                >
                  {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send
                </button>
              </div>
              <div className="text-[11px] text-zinc-600">
                {isNotAskMode 
                  ? `${mode.charAt(0).toUpperCase() + mode.slice(1)} mode is not yet available`
                  : 'Enter to send • Shift+Enter for new line • Ctrl/Cmd+K to toggle'
                }
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.aside>
  )
}
