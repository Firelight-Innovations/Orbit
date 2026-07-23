import React from 'react'
import { Compass, Hammer } from 'lucide-react'
import { AssistantMode } from '@/stores/assistantStore'

/**
 * The assistant modes, in one place so the composer, the mode picker and the
 * empty state can't drift apart.
 *
 * Accents follow Simplicity's palette: sky for asking, teal for agentic work
 * (it reserves teal for research state).
 *
 * NOTE: `plan` used to be a third mode. It was removed from the UI — the
 * backend still understands it, it is simply unreachable from here. Anything
 * that could still be holding the string (localStorage from an older build, a
 * message saved in conversation history) goes through `normalizeMode` below.
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
  }
}

/** Display order for the picker. */
export const MODE_ORDER: AssistantMode[] = ['ask', 'agent']

/**
 * Coerce anything that claims to be a mode into one we can actually render.
 * Retired modes (`plan`) and junk both fall back to `ask`, so a stale value can
 * never leave the empty state or the composer with nothing to draw.
 */
export function normalizeMode(value: unknown): AssistantMode {
  return value === 'agent' ? 'agent' : 'ask'
}

/** Config for a mode, defensive against a value that slipped past normalization. */
export function modeConfig(mode: AssistantMode): ModeConfig {
  return MODES[mode] ?? MODES.ask
}
