import React from 'react'
import { Compass, Hammer, ListChecks } from 'lucide-react'
import { AssistantMode } from '@/stores/assistantStore'

/**
 * The three assistant modes, in one place so the composer, the mode picker and
 * the empty state can't drift apart.
 *
 * Accents follow Simplicity's palette: sky for asking, teal for agentic work
 * (it reserves teal for research state), purple for planning.
 */
export interface ModeConfig {
  icon: React.ElementType
  /** One-liner under the mode name in the picker. */
  tagline: string
  /** Composer placeholder. */
  placeholder: string
  /** Empty-state headline and blurb. */
  headline: string
  blurb: string
  accentText: string
}

export const MODES: Record<AssistantMode, ModeConfig> = {
  ask: {
    icon: Compass,
    tagline: 'Answer questions about the page or the web',
    placeholder: 'Ask anything…',
    headline: 'Ask, and see the work.',
    blurb: 'Questions about this page, or anything on the web.',
    accentText: 'text-[#24a0ed]'
  },
  agent: {
    icon: Hammer,
    tagline: 'Browse and act on your behalf',
    placeholder: 'Tell the agent what to do…',
    headline: 'Let the agent drive.',
    blurb: 'It navigates, clicks and reads — every step shown as it happens.',
    accentText: 'text-teal-400'
  },
  plan: {
    icon: ListChecks,
    tagline: 'Break a task into steps before running it',
    placeholder: 'Describe what you want to plan…',
    headline: 'Plan it out first.',
    blurb: 'Turn a fuzzy goal into an ordered set of steps.',
    accentText: 'text-[#ce93d8]'
  }
}

/** Display order for the picker. */
export const MODE_ORDER: AssistantMode[] = ['ask', 'agent', 'plan']
