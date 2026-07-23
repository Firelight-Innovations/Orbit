import { useSyncExternalStore } from 'react'

export type AssistantRole = 'user' | 'assistant'
export type AssistantMode = 'ask' | 'agent' | 'plan'
export type AssistantTab = 'chat' | 'workflows'
export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'error'

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
  status: ToolCallStatus
  result?: string
  error?: string
}

/**
 * Agent work timeline.
 *
 * A step is one visible unit of "what the agent did": a thought, a tool call, a
 * navigation, a search. The renderer builds these from the SSE stream — see
 * components/Assistant/agentEvents.ts for the wire contract the backend fills.
 */
/**
 * Only affects which icon a step gets. `tool` is the catch-all — any tool name
 * the UI doesn't recognise lands there and still renders correctly.
 */
export type AgentStepKind = 'thought' | 'tool' | 'search' | 'navigate' | 'read' | 'interact'
export type AgentStepStatus = 'running' | 'done' | 'error'

/** A citation backing the answer. `id` is the URL unless the backend gives one. */
export interface AgentSource {
  id: string
  url: string
  title?: string
  snippet?: string
  favicon?: string
}

export interface AgentStep {
  id: string
  kind: AgentStepKind
  /** Human sentence shown in the timeline, e.g. "Navigating to google.com". */
  label: string
  /** Longer body — reasoning text for thoughts. */
  detail?: string
  status: AgentStepStatus
  toolName?: string
  args?: Record<string, unknown>
  result?: string
  error?: string
  startedAt: number
  endedAt?: number
  /** Results this step produced, if any. */
  sources?: AgentSource[]
  /**
   * The agent's view at this step — e.g. the 1024x1024 set-of-marks screenshot
   * the harness captures per turn. Any value usable as an <img src> works: a
   * `data:image/...;base64,...` URI or an http(s) URL. Shown in the expanded
   * step detail; omitted entirely when absent.
   */
  screenshot?: string
}

export interface AssistantMessage {
  id: string
  role: AssistantRole
  content: string
  pending?: boolean
  streaming?: boolean
  error?: string | null
  mode?: AssistantMode
  toolCalls?: ToolCall[]
  /** Ordered record of the agent's work for this turn. */
  steps?: AgentStep[]
  /** Merged, de-duplicated citations for this turn. */
  sources?: AgentSource[]
  /** Transient "what I'm doing right now" line; cleared when the turn ends. */
  statusLabel?: string | null
  timestamp?: number
}

interface PageContext {
  url?: string | null
  selectedText?: string | null
}

interface ConnectionStatus {
  connected: boolean
  pageUrl?: string
  error?: string
}

interface AssistantState {
  isOpen: boolean
  isSending: boolean
  messages: AssistantMessage[]
  pageContext: PageContext | null
  mode: AssistantMode
  activeTab: AssistantTab
  connectionStatus: ConnectionStatus
  conversationId: string
}

type Listener = () => void

const listeners = new Set<Listener>()

// Generate a conversation id; the backend keys server-side history on this.
// Regenerated on clear so a fresh chat starts a fresh history bucket.
const newConversationId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `conv-${Date.now()}-${Math.random().toString(36).slice(2)}`

let state: AssistantState = {
  isOpen: false,
  isSending: false,
  messages: [],
  pageContext: null,
  mode: 'ask',
  activeTab: 'chat',
  connectionStatus: { connected: false },
  conversationId: newConversationId()
}

const notify = () => {
  listeners.forEach((listener) => listener())
}

const setState = (updater: Partial<AssistantState> | ((prev: AssistantState) => AssistantState)) => {
  state = typeof updater === 'function' ? updater(state) : { ...state, ...updater }
  notify()
}

export const assistantStore = {
  getState: () => state,
  subscribe: (listener: Listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  
  // Sidebar visibility
  open: () => {
    setState({ isOpen: true })
    window.electronAPI.assistant.setState(true)
  },
  close: () => {
    setState({ isOpen: false })
    window.electronAPI.assistant.setState(false)
  },
  toggle: () => {
    const newState = !state.isOpen
    setState({ isOpen: newState })
    window.electronAPI.assistant.setState(newState)
  },
  // Sync open-state from the main process WITHOUT re-issuing setState. Used to
  // keep this renderer's store in step when the other view opens/closes the
  // assistant (the two views are separate renderers with separate stores).
  syncOpen: (isOpen: boolean) => setState({ isOpen }),
  
  // Context
  setPageContext: (pageContext: PageContext | null) => setState({ pageContext }),
  
  // Basic message operations
  addMessage: (message: AssistantMessage) =>
    setState((prev) => ({ 
      ...prev, 
      messages: [...prev.messages, { ...message, timestamp: Date.now() }] 
    })),
  updateMessage: (id: string, updates: Partial<AssistantMessage>) =>
    setState((prev) => ({
      ...prev,
      messages: prev.messages.map((msg) => (msg.id === id ? { ...msg, ...updates } : msg))
    })),
  clearMessages: () => setState({ messages: [], conversationId: newConversationId() }),
  
  // Streaming support
  appendChunk: (id: string, chunk: string) =>
    setState((prev) => ({
      ...prev,
      messages: prev.messages.map((msg) =>
        msg.id === id
          ? { ...msg, content: msg.content + chunk, streaming: true }
          : msg
      )
    })),
  
  // Finishes a turn: stops the caret, drops the transient status line, and
  // closes out any step the backend never sent a tool_end for.
  completeStreaming: (id: string) =>
    setState((prev) => ({
      ...prev,
      messages: prev.messages.map((msg) =>
        msg.id === id
          ? {
              ...msg,
              streaming: false,
              pending: false,
              statusLabel: null,
              steps: msg.steps?.map((step) =>
                step.status === 'running'
                  ? { ...step, status: 'done' as AgentStepStatus, endedAt: Date.now() }
                  : step
              )
            }
          : msg
      )
    })),

  // Terminal failure for a turn. Mirrors completeStreaming so a half-finished
  // timeline doesn't keep spinning after an error.
  failMessage: (id: string, error: string) =>
    setState((prev) => ({
      ...prev,
      messages: prev.messages.map((msg) =>
        msg.id === id
          ? {
              ...msg,
              streaming: false,
              pending: false,
              statusLabel: null,
              error,
              steps: msg.steps?.map((step) =>
                step.status === 'running'
                  ? { ...step, status: 'error' as AgentStepStatus, endedAt: Date.now() }
                  : step
              )
            }
          : msg
      )
    })),

  // --- Agent work timeline -------------------------------------------------

  setStatusLabel: (id: string, statusLabel: string | null) =>
    setState((prev) => ({
      ...prev,
      messages: prev.messages.map((msg) => (msg.id === id ? { ...msg, statusLabel } : msg))
    })),

  addStep: (messageId: string, step: AgentStep) =>
    setState((prev) => ({
      ...prev,
      messages: prev.messages.map((msg) =>
        msg.id === messageId ? { ...msg, steps: [...(msg.steps || []), step] } : msg
      )
    })),

  updateStep: (messageId: string, stepId: string, updates: Partial<AgentStep>) =>
    setState((prev) => ({
      ...prev,
      messages: prev.messages.map((msg) =>
        msg.id === messageId
          ? {
              ...msg,
              steps: msg.steps?.map((step) =>
                step.id === stepId ? { ...step, ...updates } : step
              )
            }
          : msg
      )
    })),

  // Fallback correlation for backends that don't send a stable call id: close
  // the most recent still-running step, preferring one matching `toolName`.
  resolveRunningStep: (
    messageId: string,
    toolName: string | undefined,
    updates: Partial<AgentStep>
  ) =>
    setState((prev) => ({
      ...prev,
      messages: prev.messages.map((msg) => {
        if (msg.id !== messageId || !msg.steps?.length) return msg
        const running = msg.steps
          .map((step, index) => ({ step, index }))
          .filter(({ step }) => step.status === 'running')
        const match =
          [...running].reverse().find(({ step }) => !toolName || step.toolName === toolName) ??
          [...running].reverse()[0]
        if (!match) return msg
        return {
          ...msg,
          steps: msg.steps.map((step, index) =>
            index === match.index ? { ...step, ...updates } : step
          )
        }
      })
    })),

  // Merge citations, de-duplicated by url so repeated `sources` events are safe.
  addSources: (messageId: string, sources: AgentSource[]) =>
    setState((prev) => ({
      ...prev,
      messages: prev.messages.map((msg) => {
        if (msg.id !== messageId || !sources.length) return msg
        const seen = new Set((msg.sources || []).map((source) => source.url))
        const added = sources.filter((source) => !seen.has(source.url))
        return added.length ? { ...msg, sources: [...(msg.sources || []), ...added] } : msg
      })
    })),


  // Tool call tracking
  addToolCall: (messageId: string, toolCall: ToolCall) =>
    setState((prev) => ({
      ...prev,
      messages: prev.messages.map((msg) =>
        msg.id === messageId
          ? { ...msg, toolCalls: [...(msg.toolCalls || []), toolCall] }
          : msg
      )
    })),
  
  updateToolCall: (messageId: string, toolCallId: string, updates: Partial<ToolCall>) =>
    setState((prev) => ({
      ...prev,
      messages: prev.messages.map((msg) =>
        msg.id === messageId
          ? {
              ...msg,
              toolCalls: msg.toolCalls?.map((tc) =>
                tc.id === toolCallId ? { ...tc, ...updates } : tc
              )
            }
          : msg
      )
    })),
  
  // State management
  setSending: (isSending: boolean) => setState({ isSending }),
  setMode: (mode: AssistantMode) => setState({ mode }),
  setActiveTab: (activeTab: AssistantTab) => setState({ activeTab }),
  
  // Connection status
  setConnectionStatus: (status: ConnectionStatus) => 
    setState({ connectionStatus: status }),
  
  // Connect to browser
  connect: async () => {
    try {
      const result = await window.electronAPI.assistant.connect()
      setState({ connectionStatus: result })
      return result
    } catch (error) {
      const errorStatus = { 
        connected: false, 
        error: error instanceof Error ? error.message : 'Connection failed' 
      }
      setState({ connectionStatus: errorStatus })
      return errorStatus
    }
  },
  
  // Get connection status
  refreshStatus: async () => {
    try {
      const result = await window.electronAPI.assistant.getStatus()
      setState({ connectionStatus: { ...result, connected: result.connected } })
      return result
    } catch {
      return { connected: false }
    }
  }
}

export function useAssistantStore<T>(selector: (state: AssistantState) => T): T {
  return useSyncExternalStore(assistantStore.subscribe, () => selector(state))
}

