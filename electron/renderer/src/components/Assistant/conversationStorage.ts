/**
 * ============================================================================
 * Previous chats  —  renderer-side conversation persistence
 * ============================================================================
 *
 * The sidebar is its own renderer (see sidebar.tsx), so `localStorage` here is
 * private to the assistant and survives app restarts without touching the main
 * process or the backend.
 *
 * WHAT IS STORED, and why it is trimmed:
 *
 *   A live `AssistantMessage` can carry a full set-of-marks screenshot as a
 *   base64 data URI (hundreds of KB each) plus raw tool results that may be an
 *   entire page snapshot. `localStorage` gives us roughly 5 MB *total*, so we
 *   strip screenshots and cap result/detail text before writing. Everything the
 *   transcript needs to re-render — the answer, the step timeline, the tool
 *   names and args, the sources — is kept.
 *
 * CONVERSATION ID: the key is the store's `conversationId`, which is also what
 * the backend keys its own server-side history on. Loading an old conversation
 * restores that exact id so the two halves stay in step.
 */

import { AssistantMessage, AgentStep } from '@/stores/assistantStore'
import { normalizeMode } from './modes'

export interface StoredConversation {
  /** Same value as the store's `conversationId`. */
  id: string
  /** Derived from the first user message. */
  title: string
  createdAt: number
  updatedAt: number
  messages: AssistantMessage[]
}

const STORAGE_KEY = 'orbit.assistant.conversations.v1'
const MODE_KEY = 'orbit.assistant.mode.v1'

/** Most recent N conversations are kept; older ones fall off the end. */
export const MAX_CONVERSATIONS = 50
/** Messages kept per conversation — a runaway agent loop shouldn't fill the quota. */
const MAX_MESSAGES = 120
/** Steps kept per assistant turn. */
const MAX_STEPS = 40
/** Character cap on any single verbatim blob (tool result, reasoning text). */
const MAX_BLOB_CHARS = 1500
const MAX_TITLE_CHARS = 60

const truncate = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value

// ---------------------------------------------------------------------------
// Trimming
// ---------------------------------------------------------------------------

/** Drop the screenshot and cap the verbatim blobs on one step. */
function trimStep(step: AgentStep): AgentStep {
  const { screenshot: _screenshot, ...rest } = step
  return {
    ...rest,
    detail: rest.detail ? truncate(rest.detail, MAX_BLOB_CHARS) : undefined,
    result: rest.result ? truncate(rest.result, MAX_BLOB_CHARS) : undefined
  }
}

/**
 * Make a message safe to persist: no in-flight flags (a reloaded turn must not
 * come back with a spinner), no transient status line, no huge payloads.
 */
function trimMessage(message: AssistantMessage): AssistantMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    error: message.error ?? null,
    mode: message.mode ? normalizeMode(message.mode) : undefined,
    timestamp: message.timestamp,
    steps: message.steps?.length ? message.steps.slice(-MAX_STEPS).map(trimStep) : undefined,
    sources: message.sources?.length ? message.sources : undefined,
    pending: false,
    streaming: false,
    statusLabel: null
  }
}

/** Restore-side normalization. Mirrors `trimMessage`; guards against old shapes. */
function reviveMessage(message: AssistantMessage): AssistantMessage {
  return {
    ...message,
    mode: message.mode ? normalizeMode(message.mode) : undefined,
    pending: false,
    streaming: false,
    statusLabel: null
  }
}

/** First user message, condensed to a single readable line. */
export function deriveTitle(messages: AssistantMessage[]): string {
  const first = messages.find((message) => message.role === 'user' && message.content.trim())
  if (!first) return 'New chat'
  return truncate(first.content.trim().replace(/\s+/g, ' '), MAX_TITLE_CHARS)
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/**
 * Every read and write goes through try/catch. `localStorage` can throw for
 * reasons that have nothing to do with us (quota, disabled storage, a partition
 * that isn't ready) and none of them should take the sidebar down — the worst
 * acceptable outcome is "history silently doesn't persist".
 */
function readRaw(): StoredConversation[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return (parsed as StoredConversation[])
      .filter(
        (conversation) =>
          conversation &&
          typeof conversation.id === 'string' &&
          Array.isArray(conversation.messages)
      )
      .map((conversation) => ({
        ...conversation,
        title: conversation.title || deriveTitle(conversation.messages),
        createdAt: conversation.createdAt || conversation.updatedAt || Date.now(),
        updatedAt: conversation.updatedAt || conversation.createdAt || Date.now(),
        messages: conversation.messages.map(reviveMessage)
      }))
  } catch {
    return []
  }
}

/**
 * Write, shedding the oldest conversations if we hit the quota.
 *
 * Returns the list that actually made it to disk, so callers always render what
 * is really stored rather than what they hoped to store.
 */
function writeRaw(conversations: StoredConversation[]): StoredConversation[] {
  let candidate = conversations.slice(0, MAX_CONVERSATIONS)

  // Up to a handful of attempts, halving the tail each time. A quota error is
  // recoverable — dropping ancient chats is much better than losing the current
  // one or throwing into a render.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(candidate))
      return candidate
    } catch {
      if (candidate.length <= 1) {
        // Even one conversation won't fit (or storage is unavailable entirely).
        try {
          window.localStorage.removeItem(STORAGE_KEY)
        } catch {
          /* nothing left to try */
        }
        return []
      }
      candidate = candidate.slice(0, Math.max(1, Math.floor(candidate.length / 2)))
    }
  }

  return candidate
}

/** All stored conversations, newest first. */
export function loadConversations(): StoredConversation[] {
  return readRaw().sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * Upsert the live conversation. Called as the transcript changes, so it is
 * write-heavy by nature — callers debounce it (see AssistantSidebar).
 */
export function saveConversation(
  id: string,
  messages: AssistantMessage[]
): StoredConversation[] {
  if (!messages.length) return loadConversations()

  const existing = readRaw()
  const previous = existing.find((conversation) => conversation.id === id)
  const now = Date.now()

  const entry: StoredConversation = {
    id,
    title: deriveTitle(messages),
    createdAt: previous?.createdAt ?? messages[0]?.timestamp ?? now,
    updatedAt: now,
    messages: messages.slice(-MAX_MESSAGES).map(trimMessage)
  }

  const next = [entry, ...existing.filter((conversation) => conversation.id !== id)].sort(
    (a, b) => b.updatedAt - a.updatedAt
  )

  return writeRaw(next)
}

export function deleteConversation(id: string): StoredConversation[] {
  const next = readRaw()
    .filter((conversation) => conversation.id !== id)
    .sort((a, b) => b.updatedAt - a.updatedAt)
  return writeRaw(next)
}

// ---------------------------------------------------------------------------
// Mode preference
// ---------------------------------------------------------------------------

/**
 * The composer's mode survives a restart. Read through `normalizeMode` so a
 * `plan` written by an older build lands on `ask` instead of rendering nothing.
 */
export function loadMode(): 'ask' | 'agent' {
  try {
    return normalizeMode(window.localStorage.getItem(MODE_KEY))
  } catch {
    return 'ask'
  }
}

export function saveMode(mode: 'ask' | 'agent'): void {
  try {
    window.localStorage.setItem(MODE_KEY, mode)
  } catch {
    /* preference is a nicety; never break send on it */
  }
}

/** Human "2m ago" / "Yesterday" style stamp for the history list. */
export function relativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
