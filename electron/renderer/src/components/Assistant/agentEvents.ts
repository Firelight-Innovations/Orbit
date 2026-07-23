/**
 * ============================================================================
 * ASSISTANT STREAM EVENT CONTRACT  —  renderer <-> backend
 * ============================================================================
 *
 * Every object the backend writes as an SSE `data:` line is forwarded verbatim
 * by the main process (electron/main/ipc.ts) to `assistant:streamEvent`, and
 * lands here. This file is the single source of truth for that wire shape.
 *
 * WHAT THE BACKEND EMITS TODAY (backend/src/core/runner.py StreamEvent):
 *
 *     { type, content, tool_name, tool_args, tool_result }
 *
 *   with `type` one of: "chunk" | "tool_start" | "tool_end" | "done" | "error"
 *   (plus "thinking" from the assistant router). In practice it is mostly the
 *   final answer re-chunked, so a turn looks like: chunk* -> done.
 *
 * WHAT THE UI IS READY TO CONSUME  <-- HARNESS TEAM: emit these when ready
 *
 *   Every field below is OPTIONAL and additive. The UI degrades to a plain
 *   streaming answer when only `chunk`/`done` arrive, so the backend can adopt
 *   these one at a time without a coordinated release.
 *
 *   ── "thought" ────────────────────────────────────────────────────────────
 *     { type: "thought", content: "The page didn't load, I'll retry with..." }
 *     Free-form model reasoning. Rendered as its own node in the timeline.
 *
 *   ── "status" ─────────────────────────────────────────────────────────────
 *     { type: "status", content: "Reading search results" }
 *     A transient one-line "what I'm doing right now" label. Replaces the
 *     previous status; not kept in the timeline. Cleared on `done`.
 *
 *   ── "tool_start" ─────────────────────────────────────────────────────────
 *     { type: "tool_start", tool_name: "navigate_to",
 *       tool_args: { url: "https://google.com" },
 *       id?: "call_abc",        // stable id — REQUIRED to correlate parallel
 *                               // tool calls; without it we fall back to
 *                               // "last running call with this tool_name"
 *       label?: "Navigating to google.com" }   // overrides our derived label
 *
 *     `tool_name` is rendered VERBATIM in the UI (monospace, always visible
 *     without expanding), so send the real registered name — `navigate_to`,
 *     `take_snapshot`, `click`, `type`, `scroll`, `press_key`, anything new.
 *     `tool_args` is rendered as raw JSON, so send the raw arguments object;
 *     any shape works and no key is special-cased for correctness.
 *
 *     Nothing about the renderer is keyed to a fixed set of tool names. An
 *     unrecognised name gets a generic icon and a title-cased label, and its
 *     args and result still render in full. Adding a tool to the harness
 *     requires NO renderer change.
 *
 *   ── "tool_end" ───────────────────────────────────────────────────────────
 *     { type: "tool_end", tool_name: "navigate_to", id?: "call_abc",
 *       tool_result?: "Loaded google.com (200)",
 *       status?: "ok" | "error", error?: "Timed out after 30s" }
 *
 *     A step with no matching tool_end stays in the `running` state until the
 *     turn ends, at which point it is closed out silently. `status: "error"`
 *     (or a non-empty `error`) turns the step red and shows `error` in place of
 *     `tool_result`.
 *
 *     `tool_result` is displayed verbatim in a monospace, pre-wrapped, scrolling
 *     panel — a YAML page snapshot renders fine as-is, no parsing needed here.
 *
 *   ── screenshots ──────────────────────────────────────────────────────────
 *     Any tool_start / tool_end may carry `screenshot`, e.g. the 1024x1024
 *     set-of-marks image for the turn:
 *
 *       { type: "tool_end", tool_name: "take_snapshot", id: "call_abc",
 *         tool_result: "<yaml…>",
 *         screenshot: "data:image/png;base64,iVBORw0…" }
 *
 *     Rendered in the expanded step under a `VIEW` label. A plain http(s) URL
 *     works too. A broken image hides itself rather than showing a torn icon.
 *     Attach it to whichever step it depicts — usually the snapshot call.
 *
 *   ── element references ───────────────────────────────────────────────────
 *     Ref IDs (`e17`) travel in `tool_args` like any other argument and need no
 *     special handling — `{ "ref": "e17" }` renders as a `ref: e17` chip. The
 *     UI never interprets coordinates or refs, so the harness moving to refs
 *     changes nothing here.
 *
 *   ── "sources" ────────────────────────────────────────────────────────────
 *     { type: "sources", sources: [ { url, title?, snippet?, favicon? } ] }
 *     Citations for the answer. Rendered as a source rail above the answer and
 *     used to resolve inline `[1]` markers into clickable chips. May be sent
 *     more than once; sources are merged and de-duplicated by URL.
 *     Can also ride along on a `tool_end` (same `sources` field) to attach
 *     results directly to the step that produced them.
 *
 *   ── "chunk" / "done" / "error" ───────────────────────────────────────────
 *     Unchanged from today.
 *
 * NOTE ON "thinking": the current router emits `{type:"thinking", content}`.
 * We route it to the transient status line rather than the answer body — the
 * old UI wrote it into `content`, so the placeholder text ended up prefixed to
 * the real answer once chunks started arriving.
 */

import { assistantStore, AgentSource, AgentStep, AgentStepKind } from '@/stores/assistantStore'

/** Sources as they arrive on the wire (id is assigned client-side). */
export interface AgentSourceEvent {
  url: string
  title?: string
  snippet?: string
  favicon?: string
}

/** The full union of fields the renderer understands on an SSE event. */
export interface AssistantStreamEvent {
  type: string

  /** Answer text (`chunk`), reasoning (`thought`), label (`status`), message (`error`). */
  content?: string

  // --- tool events (emitted today) ---
  tool_name?: string
  tool_args?: Record<string, unknown>
  tool_result?: string

  // --- proposed extensions (see header) ---
  /** Stable correlation id shared by a tool_start / tool_end pair. */
  id?: string
  /** Human-readable override for the step label. */
  label?: string
  /** Outcome of a tool_end. Defaults to "ok". */
  status?: 'ok' | 'error'
  /** Failure detail for a tool_end. */
  error?: string
  /** Citations, on a `sources` event or attached to a `tool_end`. */
  sources?: AgentSourceEvent[]
  /**
   * The agent's view at this step — data URI or URL. Attach to a `tool_start`
   * or `tool_end` and it renders in the expanded step. Safe to omit.
   */
  screenshot?: string
  /** Explicit timeline category; otherwise derived from `tool_name`. */
  kind?: AgentStepKind
}

// ---------------------------------------------------------------------------
// Tool name -> human sentence
// ---------------------------------------------------------------------------

const hostOf = (value: unknown): string => {
  if (typeof value !== 'string' || !value) return ''
  try {
    return new URL(value.includes('://') ? value : `https://${value}`).hostname.replace(/^www\./, '')
  } catch {
    return value
  }
}

const firstString = (args: Record<string, unknown> | undefined, keys: string[]): string => {
  if (!args) return ''
  for (const key of keys) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

const titleCase = (name: string): string => {
  const words = name.replace(/^(browser|page|fi)[_-]/, '').replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Which timeline icon a tool gets.
 *
 * Heuristic only — this is NOT a registry of supported tools. Anything that
 * matches nothing gets the generic `tool` (wrench) icon, so a tool added to the
 * harness tomorrow renders correctly with no change here.
 */
export function stepKindForTool(toolName: string): AgentStepKind {
  const name = toolName.toLowerCase()
  if (/(search|query|google|bing|duckduckgo)/.test(name)) return 'search'
  if (/(navigate|goto|go_to|open_url|visit)/.test(name)) return 'navigate'
  if (/(snapshot|screenshot|read_page|extract|get_text|accessibility)/.test(name)) return 'read'
  if (/(click|type|fill|input|press|key|scroll|hover|drag|select)/.test(name)) return 'interact'
  return 'tool'
}

/**
 * The plain-English sentence shown under the tool name, e.g.
 * `navigate_to {url}` -> "Navigating to google.com".
 *
 * Same contract as `stepKindForTool`: purely additive polish on top of names we
 * happen to recognise. An unknown tool falls through to a title-cased version of
 * its own name, and its arguments are still rendered verbatim either way — so
 * nothing here needs updating when the harness gains a tool.
 */
export function describeTool(toolName: string, args?: Record<string, unknown>): string {
  const name = toolName.toLowerCase()

  if (/(navigate|goto|go_to|open_url|visit)/.test(name)) {
    const host = hostOf(firstString(args, ['url', 'href', 'link', 'target']))
    return host ? `Navigating to ${host}` : 'Navigating'
  }
  if (/(search|query)/.test(name)) {
    const query = firstString(args, ['query', 'q', 'search', 'text'])
    return query ? `Searching for "${query}"` : 'Searching the web'
  }
  if (/screenshot/.test(name)) return 'Capturing a screenshot'
  if (/snapshot|accessibility/.test(name)) return 'Taking a page snapshot'
  if (/(read_page|extract|get_text|get_content|scrape)/.test(name)) return 'Reading the page'
  if (/click/.test(name)) {
    const target = firstString(args, ['element', 'text', 'label', 'selector', 'ref'])
    return target ? `Clicking ${target}` : 'Clicking an element'
  }
  if (/(press|key)/.test(name)) {
    const combo = firstString(args, ['key', 'keys', 'combination', 'combo', 'shortcut'])
    return combo ? `Pressing ${combo}` : 'Pressing a key'
  }
  if (/(type|fill|input)/.test(name)) {
    const value = firstString(args, ['text', 'value', 'input'])
    return value ? `Typing "${truncate(value, 40)}"` : 'Typing'
  }
  if (/scroll/.test(name)) return 'Scrolling the page'
  if (/(wait|sleep)/.test(name)) return 'Waiting for the page'

  return titleCase(toolName)
}

const truncate = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value

// ---------------------------------------------------------------------------
// Event -> store
// ---------------------------------------------------------------------------

let stepCounter = 0
const nextStepId = (): string => `step-${Date.now().toString(36)}-${(stepCounter += 1)}`

const normalizeSources = (sources: AgentSourceEvent[] | undefined): AgentSource[] =>
  (sources ?? [])
    .filter((source) => typeof source?.url === 'string' && source.url)
    .map((source) => ({
      id: source.url,
      url: source.url,
      title: source.title,
      snippet: source.snippet,
      favicon: source.favicon
    }))

/** What the caller should do after this event. */
export interface EventOutcome {
  finished?: boolean
  failed?: string
}

/**
 * Apply one stream event to a message in the store.
 *
 * Unknown `type` values are ignored rather than throwing, so the backend can
 * ship new event kinds ahead of the UI without breaking a live conversation.
 */
export function applyAssistantEvent(
  messageId: string,
  event: AssistantStreamEvent
): EventOutcome {
  switch (event.type) {
    case 'chunk':
      if (event.content) assistantStore.appendChunk(messageId, event.content)
      return {}

    // The old placeholder event. Treated as a transient status, never as answer
    // text — writing it into `content` would prefix the real answer with it.
    case 'thinking':
    case 'status':
      assistantStore.setStatusLabel(messageId, event.content || 'Thinking')
      return {}

    case 'thought':
      if (event.content) {
        assistantStore.addStep(messageId, {
          id: event.id || nextStepId(),
          kind: 'thought',
          label: event.label || 'Thinking',
          detail: event.content,
          status: 'done',
          startedAt: Date.now(),
          endedAt: Date.now()
        })
      }
      return {}

    case 'tool_start': {
      const toolName = event.tool_name || 'tool'
      assistantStore.addStep(messageId, {
        id: event.id || nextStepId(),
        kind: event.kind || stepKindForTool(toolName),
        label: event.label || describeTool(toolName, event.tool_args),
        status: 'running',
        toolName,
        args: event.tool_args || {},
        screenshot: event.screenshot,
        startedAt: Date.now()
      })
      return {}
    }

    case 'tool_end': {
      // Prefer the explicit id; fall back to the most recent running step with
      // the same tool name (what today's backend allows us to do).
      const patch: Partial<AgentStep> = {
        status: event.status === 'error' || event.error ? 'error' : 'done',
        result: event.tool_result,
        error: event.error,
        endedAt: Date.now(),
        sources: event.sources ? normalizeSources(event.sources) : undefined,
        screenshot: event.screenshot
      }
      if (event.id) {
        assistantStore.updateStep(messageId, event.id, patch)
      } else {
        assistantStore.resolveRunningStep(messageId, event.tool_name, patch)
      }
      if (event.sources?.length) {
        assistantStore.addSources(messageId, normalizeSources(event.sources))
      }
      return {}
    }

    case 'sources':
      assistantStore.addSources(messageId, normalizeSources(event.sources))
      return {}

    case 'done':
      assistantStore.completeStreaming(messageId)
      return { finished: true }

    case 'error':
      assistantStore.failMessage(messageId, event.content || 'Unknown error')
      return { finished: true, failed: event.content || 'Unknown error' }

    default:
      return {}
  }
}
