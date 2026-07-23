import { useState } from 'react'
import { AlertTriangle, Check, Copy, Sparkles } from 'lucide-react'
import { AssistantMessage } from '@/stores/assistantStore'
import { AgentSteps } from './AgentSteps'
import { SourceRail } from './SourceRail'
import { AnswerBlock } from './AnswerBlock'

/**
 * One message in the transcript, laid out Simplicity-style: full-width blocks,
 * no bubbles. The question is a display heading; below it the agent's work,
 * its sources, then the answer.
 */

interface ChatTurnProps {
  message: AssistantMessage
  /** Draw the hairline that separates this turn from the one above. */
  showDivider: boolean
}

function CopyButton({ text }: { text: string }): JSX.Element {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      }}
      title="Copy answer"
      className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-white/35 transition-colors duration-150 hover:bg-[#21262d] hover:text-white/70"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

export function ChatTurn({ message, showDivider }: ChatTurnProps): JSX.Element {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="orbit-rise">
        {showDivider && <div className="mb-5 h-px w-full bg-[#161b22]" />}
        <h2 className="orbit-serif break-words text-[22px] leading-tight tracking-tight text-white">
          {message.content}
        </h2>
      </div>
    )
  }

  const steps = message.steps ?? []
  const sources = message.sources ?? []
  const isRunning = Boolean(message.streaming || message.pending)
  const hasAnswer = message.content.length > 0

  return (
    <div className="orbit-rise flex flex-col gap-4">
      <AgentSteps steps={steps} statusLabel={message.statusLabel} running={isRunning} />

      <SourceRail sources={sources} />

      {message.error ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-[12px] text-red-400">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span className="break-words">{message.error}</span>
        </div>
      ) : hasAnswer ? (
        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <Sparkles size={14} className="text-white/40" />
            <span className="text-[13px] font-medium text-white/70">Answer</span>
          </div>
          <AnswerBlock
            content={message.content}
            sources={sources}
            streaming={Boolean(message.streaming)}
          />
          {!isRunning && (
            <div className="mt-2 flex items-center">
              <CopyButton text={message.content} />
            </div>
          )}
        </div>
      ) : (
        // Nothing has arrived yet. Skeleton bars, matching Simplicity's loader.
        isRunning &&
        !steps.length && (
          <div className="animate-pulse space-y-2 py-1">
            <div className="h-2 w-full rounded-full bg-[#161b22]" />
            <div className="h-2 w-9/12 rounded-full bg-[#161b22]" />
            <div className="h-2 w-10/12 rounded-full bg-[#161b22]" />
          </div>
        )
      )}
    </div>
  )
}
