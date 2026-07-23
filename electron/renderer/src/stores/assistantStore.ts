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

export interface AssistantMessage {
  id: string
  role: AssistantRole
  content: string
  pending?: boolean
  streaming?: boolean
  error?: string | null
  mode?: AssistantMode
  toolCalls?: ToolCall[]
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
  
  completeStreaming: (id: string) =>
    setState((prev) => ({
      ...prev,
      messages: prev.messages.map((msg) =>
        msg.id === id ? { ...msg, streaming: false, pending: false } : msg
      )
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

