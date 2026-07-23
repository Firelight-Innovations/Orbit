import React, { useEffect, useRef, useState } from 'react'
import {
  ChevronRight,
  Sparkles,
  Globe,
  Search,
  BookOpen,
  Wrench,
  Brain,
  Check,
  AlertCircle,
  MousePointerClick,
  Loader2
} from 'lucide-react'
import { AgentStep, AgentStepKind, AgentSource } from '@/stores/assistantStore'
import { cn } from '@/lib/utils'
import { faviconFor } from './sourceUtils'

/**
 * The agent's work timeline — a collapsible card above the answer.
 *
 * Expanded while the turn is running (watching the agent work is the point),
 * then auto-collapsed once it finishes. An explicit user toggle sticks.
 *
 * Renders nothing when there are no steps, which is what keeps the plain
 * text-only stream (all the backend emits today) looking like a normal chat.
 */

interface AgentStepsProps {
  steps: AgentStep[]
  /** Transient "doing X right now" line from a `status`/`thinking` event. */
  statusLabel?: string | null
  running?: boolean
}

// `tool: Wrench` is the fallback for any tool name the UI doesn't recognise.
const KIND_ICON: Record<AgentStepKind, React.ElementType> = {
  thought: Brain,
  tool: Wrench,
  search: Search,
  navigate: Globe,
  read: BookOpen,
  interact: MousePointerClick
}

const formatDuration = (step: AgentStep): string | null => {
  if (!step.endedAt) return null
  const ms = step.endedAt - step.startedAt
  if (ms < 100) return null
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

const stringify = (value: unknown): string =>
  typeof value === 'string' ? value : JSON.stringify(value) ?? String(value)

/**
 * Tool arguments, one verbatim monospace chip per key. Generic over any JSON
 * shape — keys are whatever the tool sent, values are stringified as-is.
 * Truncated here; the expanded panel shows them in full.
 */
function ArgChips({ args }: { args: Record<string, unknown> }): JSX.Element | null {
  const entries = Object.entries(args).filter(
    ([, value]) => value !== null && value !== undefined && value !== ''
  )
  if (!entries.length) return null

  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {entries.slice(0, 4).map(([key, value]) => {
        const rendered = stringify(value)
        return (
          <span
            key={key}
            title={`${key}: ${rendered}`}
            className="max-w-full truncate rounded-md border border-[#21262d] bg-[#0d1117] px-2 py-1 font-mono text-[10px] text-white/50"
          >
            <span className="text-white/30">{key}:</span> {rendered}
          </span>
        )
      })}
      {entries.length > 4 && (
        <span className="self-center font-mono text-[10px] text-white/25">
          +{entries.length - 4}
        </span>
      )}
    </div>
  )
}

/** A labelled monospace panel used for the full args JSON and the raw result. */
function DetailPanel({
  title,
  body,
  tone = 'default'
}: {
  title: string
  body: string
  tone?: 'default' | 'error'
}): JSX.Element {
  return (
    <div className="mt-1.5">
      <div className="mb-1 font-mono text-[9px] uppercase tracking-wider text-white/25">
        {title}
      </div>
      <pre
        className={cn(
          'orbit-scroll max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border p-2 font-mono text-[10px] leading-relaxed',
          tone === 'error'
            ? 'border-red-500/20 bg-red-500/5 text-red-300'
            : 'border-[#21262d] bg-[#0d1117] text-white/55'
        )}
      >
        {body}
      </pre>
    </div>
  )
}

/** Capped favicon row for the results a step produced. */
function ResultFavicons({ sources }: { sources: AgentSource[] }): JSX.Element {
  const shown = sources.slice(0, 8)
  return (
    <div className="mt-2 flex items-center gap-1">
      {shown.map((source) => {
        const icon = faviconFor(source.url, source.favicon)
        return (
          <a
            key={source.id}
            href={source.url}
            target="_blank"
            rel="noreferrer"
            title={source.title || source.url}
            className="transition-transform hover:scale-110"
          >
            <img
              src={icon ?? undefined}
              alt=""
              className="h-5 w-5 rounded-full border border-[#21262d] bg-[#0d1117]"
              loading="lazy"
              onError={(event) => {
                event.currentTarget.style.visibility = 'hidden'
              }}
            />
          </a>
        )
      })}
      {sources.length > shown.length && (
        <span className="ml-1 text-[10px] text-white/40">+{sources.length - shown.length} more</span>
      )}
    </div>
  )
}

/**
 * One step in the timeline.
 *
 * For a tool call the raw `toolName` is the headline, in monospace, always
 * visible without expanding — you can see exactly which tool ran. Under it sits
 * the plain-English description, then truncated argument chips. Expanding
 * reveals the complete args JSON and the raw result or error.
 *
 * Nothing here is specific to any tool: name, args, result and error are all
 * rendered generically, so an unknown tool shows up correctly on its own.
 */
function StepRow({ step, isLast }: { step: AgentStep; isLast: boolean }): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const Icon = KIND_ICON[step.kind] ?? Wrench
  const duration = formatDuration(step)

  const argEntries = Object.entries(step.args ?? {})
  const hasResult = Boolean(step.result || step.error)
  // Only offer expansion when there's something more than the header shows.
  const canExpand =
    argEntries.length > 0 || hasResult || Boolean(step.detail) || Boolean(step.screenshot)

  // Thoughts have no tool; their reasoning text is the content.
  const headline = step.toolName ?? step.label

  return (
    <div className="flex gap-2.5">
      {/* Badge + connector rail */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            'rounded-full border p-1.5',
            step.status === 'running'
              ? 'border-teal-500/40 bg-teal-500/10 text-teal-400'
              : step.status === 'error'
                ? 'border-red-500/30 bg-red-500/10 text-red-400'
                : 'border-[#21262d] bg-[#0d1117] text-white/45'
          )}
        >
          <Icon size={12} />
        </div>
        {!isLast && <div className="min-h-[20px] w-0.5 flex-1 bg-[#21262d]" />}
      </div>

      <div className={cn('min-w-0 flex-1', isLast ? 'pb-0' : 'pb-3')}>
        <button
          type="button"
          disabled={!canExpand}
          onClick={() => setExpanded((value) => !value)}
          className={cn(
            'flex w-full items-center gap-1.5 text-left',
            canExpand && 'group'
          )}
        >
          {/* The tool name, verbatim and always visible. */}
          <span
            className={cn(
              'min-w-0 truncate font-mono text-[11.5px]',
              step.status === 'running'
                ? 'text-teal-300'
                : step.status === 'error'
                  ? 'text-red-300'
                  : 'text-white/85',
              canExpand && 'group-hover:text-white'
            )}
          >
            {headline}
          </span>

          {step.status === 'running' && (
            <Loader2 size={10} className="shrink-0 animate-spin text-teal-400" />
          )}
          {step.status === 'done' && <Check size={11} className="shrink-0 text-white/25" />}
          {step.status === 'error' && <AlertCircle size={11} className="shrink-0 text-red-400" />}

          {duration && (
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-white/25">
              {duration}
            </span>
          )}

          {canExpand && (
            <ChevronRight
              size={11}
              className={cn(
                'ml-auto shrink-0 text-white/20 transition-transform duration-200 group-hover:text-white/50',
                expanded && 'rotate-90'
              )}
            />
          )}
        </button>

        {/* Plain-English description, when it adds something over the name. */}
        {step.toolName && step.label && step.label !== step.toolName && (
          <p className="mt-0.5 truncate text-[11px] leading-4 text-white/40">{step.label}</p>
        )}

        {/* Reasoning text stays visible; it's the substance of a thought step. */}
        {step.detail && (
          <p
            className={cn(
              'mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-white/45',
              !expanded && 'line-clamp-4'
            )}
          >
            {step.detail}
          </p>
        )}

        {/* Collapsed preview of the arguments. */}
        {!expanded && step.args && <ArgChips args={step.args} />}

        {expanded && (
          <div className="orbit-unfurl">
            {/* The agent's view at this step, when the harness attached one. */}
            {step.screenshot && (
              <div className="mt-1.5">
                <div className="mb-1 font-mono text-[9px] uppercase tracking-wider text-white/25">
                  view
                </div>
                <img
                  src={step.screenshot}
                  alt="The agent's view of the page at this step"
                  loading="lazy"
                  className="w-full rounded-md border border-[#21262d] bg-[#0d1117]"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none'
                  }}
                />
              </div>
            )}
            {argEntries.length > 0 && (
              <DetailPanel title="args" body={JSON.stringify(step.args, null, 2)} />
            )}
            {step.error ? (
              <DetailPanel title="error" body={step.error} tone="error" />
            ) : step.result ? (
              <DetailPanel title="result" body={step.result} />
            ) : null}
          </div>
        )}

        {/* Errors stay visible collapsed — a failure shouldn't need a click. */}
        {!expanded && step.error && (
          <p className="mt-1.5 rounded-md border border-red-500/20 bg-red-500/5 px-2 py-1 text-[11px] text-red-400">
            {step.error}
          </p>
        )}

        {step.sources?.length ? <ResultFavicons sources={step.sources} /> : null}
      </div>
    </div>
  )
}

export function AgentSteps({ steps, statusLabel, running }: AgentStepsProps): JSX.Element | null {
  // A turn that mounts already finished (scrollback, remount) starts collapsed;
  // one that mounts mid-flight starts open and collapses when it lands.
  const [expanded, setExpanded] = useState(() => running !== false)
  const userToggled = useRef(false)
  const wasRunning = useRef(running)

  // Auto-collapse on completion, unless the user has taken control of the card.
  useEffect(() => {
    if (wasRunning.current && !running && !userToggled.current) {
      setExpanded(false)
    }
    wasRunning.current = running
  }, [running])

  if (!steps.length && !statusLabel) return null

  const completed = steps.filter((step) => step.status !== 'running').length
  const heading = running
    ? `Working · ${completed} of ${steps.length} steps`
    : `Completed · ${steps.length} step${steps.length === 1 ? '' : 's'}`

  // While collapsed and running, surface the live step — tool name included —
  // so the card still tells you what's happening without being opened.
  const liveStep = steps.find((step) => step.status === 'running')

  return (
    <div className="orbit-rise overflow-hidden rounded-lg border border-[#21262d] bg-[#161b22]">
      <button
        type="button"
        onClick={() => {
          userToggled.current = true
          setExpanded((value) => !value)
        }}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-[#21262d]/60"
      >
        {running ? (
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-500" />
          </span>
        ) : (
          <Sparkles size={13} className="shrink-0 text-white/40" />
        )}

        <span className="flex-1 truncate text-[12px] font-medium text-white/70">{heading}</span>

        <ChevronRight
          size={14}
          className={cn(
            'shrink-0 text-white/30 transition-transform duration-200',
            expanded && 'rotate-90'
          )}
        />
      </button>

      {!expanded && running && (
        <div className="orbit-breathe flex items-center gap-1.5 border-t border-[#21262d] px-3 py-2 text-[11px] text-teal-300">
          {liveStep?.toolName && (
            <span className="shrink-0 font-mono">{liveStep.toolName}</span>
          )}
          <span className="min-w-0 truncate text-teal-300/70">
            {statusLabel || liveStep?.label || 'Working'}
          </span>
        </div>
      )}

      {expanded && (
        <div className="orbit-unfurl border-t border-[#21262d] px-3 py-3">
          {steps.map((step, index) => (
            <StepRow key={step.id} step={step} isLast={index === steps.length - 1} />
          ))}

          {/* A status arriving before any step still gets a line. */}
          {running && statusLabel && !steps.some((step) => step.status === 'running') && (
            <div className={cn('flex gap-2.5', steps.length && 'pt-3')}>
              <div className="rounded-full border border-teal-500/40 bg-teal-500/10 p-1.5 text-teal-400">
                <Sparkles size={12} />
              </div>
              <span className="orbit-breathe flex-1 pt-1 text-[12px] text-teal-300">
                {statusLabel}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
