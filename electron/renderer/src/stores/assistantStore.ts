import { useSyncExternalStore } from 'react'

export type AssistantRole = 'user' | 'assistant'
export type AssistantMode = 'ask' | 'agent' | 'plan'
export type AssistantTab = 'chat' | 'workflows' | 'agents'

export interface AssistantMessage {
  id: string
  role: AssistantRole
  content: string
  pending?: boolean
  error?: string | null
}

interface PageContext {
  url?: string | null
  selectedText?: string | null
}

interface AssistantState {
  isOpen: boolean
  isSending: boolean
  messages: AssistantMessage[]
  pageContext: PageContext | null
  mode: AssistantMode
  activeTab: AssistantTab
}

type Listener = () => void

const listeners = new Set<Listener>()

let state: AssistantState = {
  isOpen: false,
  isSending: false,
  messages: [],
  pageContext: null,
  mode: 'ask',
  activeTab: 'chat'
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
  open: () => setState({ isOpen: true }),
  close: () => setState({ isOpen: false }),
  toggle: () => setState((prev) => ({ ...prev, isOpen: !prev.isOpen })),
  setPageContext: (pageContext: PageContext | null) => setState({ pageContext }),
  addMessage: (message: AssistantMessage) =>
    setState((prev) => ({ ...prev, messages: [...prev.messages, message] })),
  updateMessage: (id: string, updates: Partial<AssistantMessage>) =>
    setState((prev) => ({
      ...prev,
      messages: prev.messages.map((msg) => (msg.id === id ? { ...msg, ...updates } : msg))
    })),
  setSending: (isSending: boolean) => setState({ isSending }),
  setMode: (mode: AssistantMode) => setState({ mode }),
  setActiveTab: (activeTab: AssistantTab) => setState({ activeTab })
}

export function useAssistantStore<T>(selector: (state: AssistantState) => T): T {
  return useSyncExternalStore(assistantStore.subscribe, () => selector(state))
}

