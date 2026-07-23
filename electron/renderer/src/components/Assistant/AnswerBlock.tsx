import React from 'react'
import { AgentSource } from '@/stores/assistantStore'
import { domainOf } from './sourceUtils'

/**
 * Answer body.
 *
 * Renders a useful subset of markdown without pulling in a parser dependency:
 * fenced code, headings, lists, blockquotes, rules, and inline bold/italic/
 * code/links. Inline `[1]` citation markers become chips when the turn has
 * sources. Everything unrecognised falls through as plain text, so a raw
 * non-markdown answer still reads correctly.
 *
 * Styling lives in assistant.css under `.orbit-prose`.
 */

interface AnswerBlockProps {
  content: string
  sources?: AgentSource[]
  streaming?: boolean
}

// --- inline -----------------------------------------------------------------

// Ordered alternation: code first so ** inside `code` isn't treated as bold.
const INLINE_PATTERN =
  /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]*\]\([^)\s]+\))|(\[\d+\])|(https?:\/\/[^\s<>()]+)/g

function CitationChip({ index, source }: { index: number; source?: AgentSource }): JSX.Element {
  const label = source ? domainOf(source.url) : String(index)
  const chip = (
    <span className="mx-0.5 inline-flex h-[17px] -translate-y-px items-center gap-1 rounded-full bg-[#21262d] px-1.5 align-middle text-[10px] font-medium text-white/70">
      {source?.favicon && (
        <img src={source.favicon} alt="" className="h-2.5 w-2.5 rounded-sm" loading="lazy" />
      )}
      <span className="tabular-nums">{label}</span>
    </span>
  )

  if (!source) return chip
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noreferrer"
      title={source.title || source.url}
      className="no-underline hover:brightness-125"
    >
      {chip}
    </a>
  )
}

function renderInline(text: string, sources?: AgentSource[]): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let cursor = 0
  let key = 0

  INLINE_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = INLINE_PATTERN.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index))
    const token = match[0]

    if (token.startsWith('`')) {
      nodes.push(<code key={key++}>{token.slice(1, -1)}</code>)
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('*')) {
      nodes.push(<em key={key++}>{token.slice(1, -1)}</em>)
    } else if (token.startsWith('[') && token.includes('](')) {
      const split = token.indexOf('](')
      nodes.push(
        <a key={key++} href={token.slice(split + 2, -1)} target="_blank" rel="noreferrer">
          {token.slice(1, split)}
        </a>
      )
    } else if (/^\[\d+\]$/.test(token)) {
      const index = Number(token.slice(1, -1))
      // Only upgrade to a chip when we actually have that source; otherwise the
      // bracket is probably just part of the text.
      const source = sources?.[index - 1]
      nodes.push(
        source ? (
          <CitationChip key={key++} index={index} source={source} />
        ) : (
          token
        )
      )
    } else {
      nodes.push(
        <a key={key++} href={token} target="_blank" rel="noreferrer">
          {token}
        </a>
      )
    }
    cursor = match.index + token.length
  }

  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}

// --- blocks -----------------------------------------------------------------

type Block =
  | { type: 'code'; lang?: string; lines: string[] }
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'quote'; lines: string[] }
  | { type: 'rule' }
  | { type: 'paragraph'; lines: string[] }

function parseBlocks(content: string): Block[] {
  const lines = content.split('\n')
  const blocks: Block[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]

    // Fenced code — kept open-ended so a mid-stream fence still renders.
    const fence = /^```(\w*)\s*$/.exec(line)
    if (fence) {
      const body: string[] = []
      index += 1
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        body.push(lines[index])
        index += 1
      }
      index += 1
      blocks.push({ type: 'code', lang: fence[1] || undefined, lines: body })
      continue
    }

    if (!line.trim()) {
      index += 1
      continue
    }

    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
      blocks.push({ type: 'rule' })
      index += 1
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      const level = Math.min(heading[1].length, 3) as 1 | 2 | 3
      blocks.push({ type: 'heading', level, text: heading[2] })
      index += 1
      continue
    }

    if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line)
      const items: string[] = []
      while (
        index < lines.length &&
        (ordered ? /^\s*\d+[.)]\s+/.test(lines[index]) : /^\s*[-*+]\s+/.test(lines[index]))
      ) {
        items.push(lines[index].replace(ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/, ''))
        index += 1
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }

    if (/^\s*>\s?/.test(line)) {
      const body: string[] = []
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        body.push(lines[index].replace(/^\s*>\s?/, ''))
        index += 1
      }
      blocks.push({ type: 'quote', lines: body })
      continue
    }

    const paragraph: string[] = []
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,6}\s|```|\s*[-*+]\s|\s*\d+[.)]\s|\s*>)/.test(lines[index]) &&
      !/^\s*(---+|\*\*\*+|___+)\s*$/.test(lines[index])
    ) {
      paragraph.push(lines[index])
      index += 1
    }
    if (paragraph.length) blocks.push({ type: 'paragraph', lines: paragraph })
    else index += 1
  }

  return blocks
}

export function AnswerBlock({ content, sources, streaming }: AnswerBlockProps): JSX.Element {
  const blocks = React.useMemo(() => parseBlocks(content), [content])
  const caret = streaming ? <span className="orbit-caret" /> : null
  const lastIndex = blocks.length - 1

  return (
    <div className="orbit-prose">
      {blocks.map((block, index) => {
        const trailing = index === lastIndex ? caret : null

        switch (block.type) {
          case 'code':
            return (
              <pre key={index}>
                <code>{block.lines.join('\n')}</code>
              </pre>
            )
          case 'rule':
            return <hr key={index} />
          case 'heading': {
            const Tag = (['h1', 'h2', 'h3'] as const)[block.level - 1]
            return <Tag key={index}>{renderInline(block.text, sources)}</Tag>
          }
          case 'list': {
            const Tag = block.ordered ? 'ol' : 'ul'
            return (
              <Tag key={index}>
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    {renderInline(item, sources)}
                    {itemIndex === block.items.length - 1 ? trailing : null}
                  </li>
                ))}
              </Tag>
            )
          }
          case 'quote':
            return (
              <blockquote key={index}>
                {renderInline(block.lines.join(' '), sources)}
                {trailing}
              </blockquote>
            )
          default:
            return (
              <p key={index}>
                {renderInline(block.lines.join('\n'), sources)}
                {trailing}
              </p>
            )
        }
      })}
      {/* Caret needs somewhere to live before the first block arrives. */}
      {!blocks.length && caret ? <p>{caret}</p> : null}
    </div>
  )
}
