/**
 * ============================================================================
 * "Is the user asking us to DO something?"  —  ask-mode -> agent-mode nudge
 * ============================================================================
 *
 * A tiny, deliberately conservative client-side heuristic. When the user is in
 * `ask` mode and types something that reads like a task ("go to amazon and buy
 * batteries") rather than a question ("what does this page say?"), the sidebar
 * offers to switch to `agent` mode before sending.
 *
 * DESIGN BIAS: prefer a MISS over a FALSE POSITIVE. A prompt that appears on
 * every ordinary question is far more annoying than one that occasionally fails
 * to appear, so every rule below errs towards returning `false`.
 *
 * The whole thing is one pure function over the raw input string — no store, no
 * DOM, no network — so it is trivial to tune and to test. The word lists are
 * exported for exactly that reason.
 */

/**
 * Politeness / filler that can sit in front of a real imperative. Stripped
 * (repeatedly) before we look for the verb, so "hey, can you go to google"
 * reduces to "go to google".
 *
 * Order matters: longer phrases must come before their own prefixes so that
 * "can you" is consumed before the bare question-word check ever sees "can".
 */
export const LEADING_FILLER: readonly string[] = [
  'i would like you to',
  "i'd like you to",
  'i want you to',
  'i need you to',
  'i would like to',
  "i'd like to",
  'i want to',
  'i need to',
  'go ahead and',
  'could you please',
  'can you please',
  'would you please',
  'will you please',
  'could you',
  'can you',
  'would you',
  'will you',
  'could u',
  'can u',
  'help me',
  'for me',
  'try to',
  'try and',
  'please',
  'pls',
  'plz',
  'hey',
  'hi',
  'yo',
  'ok',
  'okay',
  'now',
  'then',
  'also',
  'just',
  'first'
]

/**
 * Words that open a question. If the message starts with one of these AFTER
 * filler is stripped, it is a question and we never prompt — this is the rule
 * that keeps the nudge quiet during normal Q&A use.
 *
 * The "produce me some prose" verbs (explain / summarize / write / …) live here
 * too: they are requests, but they are requests for TEXT, which is exactly what
 * ask mode is for.
 */
export const QUESTION_OPENERS: ReadonlySet<string> = new Set([
  'what',
  "what's",
  'whats',
  'why',
  "why's",
  'how',
  "how's",
  'hows',
  'who',
  "who's",
  'whos',
  'whom',
  'whose',
  'when',
  "when's",
  'where',
  "where's",
  'wheres',
  'which',
  'is',
  'are',
  'am',
  'was',
  'were',
  'do',
  'does',
  'did',
  'can',
  'could',
  'should',
  'shall',
  'would',
  'will',
  'has',
  'have',
  'had',
  'may',
  'might',
  'must',
  "isn't",
  "aren't",
  "doesn't",
  "don't",
  "didn't",
  "can't",
  "shouldn't",
  "won't",
  'explain',
  'describe',
  'define',
  'summarize',
  'summarise',
  'tldr',
  'compare',
  'contrast',
  'tell',
  'give',
  'show',
  'list',
  'analyze',
  'analyse',
  'review',
  'critique',
  'translate',
  'rewrite',
  'rephrase',
  'brainstorm',
  'suggest',
  'recommend',
  'teach',
  'walk',
  'think',
  'draft',
  'write'
])

/**
 * Single-word imperative openers that mean "operate the browser for me".
 *
 * Kept narrow on purpose. Broad English verbs (get, take, make, do, use, set,
 * run, save, start, read, check, look, watch, help) are NOT here: they open far
 * too many perfectly ordinary questions to be worth the false positives.
 */
export const ACTION_VERBS: ReadonlySet<string> = new Set([
  // navigation
  'go',
  'goto',
  'navigate',
  'open',
  'visit',
  'browse',
  'load',
  'refresh',
  'reload',
  // interaction
  'click',
  'tap',
  'press',
  'type',
  'enter',
  'fill',
  'submit',
  'select',
  'choose',
  'scroll',
  'hover',
  'drag',
  'toggle',
  'close',
  'dismiss',
  // retrieval that implies driving the browser
  'search',
  'find',
  'lookup',
  'scrape',
  'extract',
  // transactions
  'buy',
  'purchase',
  'order',
  'reorder',
  'book',
  'reserve',
  'checkout',
  'pay',
  'bid',
  // account / forms
  'login',
  'signin',
  'signup',
  'register',
  'subscribe',
  'unsubscribe',
  'apply',
  'schedule',
  'cancel',
  // content actions
  'download',
  'upload',
  'send',
  'post',
  'share',
  'bookmark',
  'add',
  'remove',
  'delete',
  'rename',
  'play',
  'pause'
])

/**
 * Multi-word imperative openers. Checked before the single-word list because
 * their first token is often too generic to trust on its own ("log", "sign",
 * "take", "check", "fill").
 */
export const ACTION_PHRASES: readonly string[] = [
  'log in',
  'log into',
  'log on',
  'log out',
  'sign in',
  'sign into',
  'sign up',
  'sign out',
  'take me to',
  'bring me to',
  'add to cart',
  'add to my cart',
  'check out',
  'look up',
  'fill out',
  'fill in',
  'turn on',
  'turn off',
  'switch to',
  'scroll down',
  'scroll up',
  'scroll to',
  'zoom in',
  'zoom out',
  'pull up',
  'set up'
]

/**
 * Two-word openers where a listed action verb is actually part of a noun
 * phrase. These are the false positives worth hard-coding away; the list is
 * meant to grow as real ones show up.
 */
export const AMBIGUOUS_BIGRAMS: readonly string[] = [
  'open source',
  'open ai',
  'open standard',
  'find out',
  'search engine',
  'search engines',
  'search results',
  'order of',
  'order in',
  'type of',
  'types of',
  'add up',
  'press release',
  'press coverage',
  'play store',
  'select few',
  'post about',
  'share of',
  'share price',
  'send off',
  'book about',
  'book by',
  'book called',
  'book review',
  'go over',
  'go through',
  'go about',
  'click through rate'
]

/**
 * Pasting a wall of text ("summarise this" + 3 paragraphs) should never trigger
 * the nudge, however it happens to begin.
 */
const MAX_TASK_LENGTH = 400

/** Strip filler from the front of `text`, repeatedly, until nothing matches. */
function stripFiller(text: string): { rest: string; strippedRequestPhrase: boolean } {
  let rest = text
  let strippedRequestPhrase = false

  // Bounded loop — filler stacks ("hey, please can you go…") but not deeply.
  for (let pass = 0; pass < 4; pass += 1) {
    const before = rest
    for (const filler of LEADING_FILLER) {
      // Match only on a word boundary so "cancel" isn't eaten by "can".
      if (rest === filler || rest.startsWith(`${filler} `) || rest.startsWith(`${filler},`)) {
        // Remember whether the user phrased this as a polite request — that is
        // the one case where a trailing "?" does not mean "this is a question".
        if (filler.startsWith('can') || filler.startsWith('could') || filler.startsWith('would') || filler.startsWith('will')) {
          strippedRequestPhrase = true
        }
        rest = rest.slice(filler.length).replace(/^[,\s]+/, '')
        break
      }
    }
    if (rest === before) break
  }

  return { rest, strippedRequestPhrase }
}

/**
 * Does this message read as "do something for me" rather than "answer this"?
 *
 * Returns `true` only when the message, after filler is stripped, opens with a
 * recognised browser-action imperative and shows no sign of being a question.
 * Everything ambiguous returns `false`.
 */
export function looksLikeTask(input: string): boolean {
  const raw = (input ?? '').trim()
  if (!raw) return false
  if (raw.length > MAX_TASK_LENGTH) return false

  // Normalize: lowercase, curly quotes to straight, collapse whitespace.
  const normalized = raw
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

  const { rest, strippedRequestPhrase } = stripFiller(normalized)
  if (!rest) return false

  // A trailing question mark means "question" unless the user wrapped an
  // imperative in a polite request ("can you go to google.com?").
  if (raw.endsWith('?') && !strippedRequestPhrase) return false

  // Only the first clause decides. "Go to X and tell me what it says" is a
  // task; "What is X, go figure" is not — and the opener is what separates them.
  const firstClause = rest.split(/[.;\n]/)[0]?.trim() || rest

  const words = firstClause.split(' ').filter(Boolean)
  if (!words.length) return false

  const first = words[0].replace(/^[^a-z']+/, '').replace(/[^a-z']+$/, '')
  if (!first) return false

  // Questions win outright, even if an action verb appears later in the
  // sentence ("what happens if I click the button?").
  if (QUESTION_OPENERS.has(first)) return false

  const bigram = words.length > 1 ? `${first} ${words[1].replace(/[^a-z']+$/, '')}` : first
  if (AMBIGUOUS_BIGRAMS.includes(bigram)) return false

  if (ACTION_PHRASES.some((phrase) => firstClause === phrase || firstClause.startsWith(`${phrase} `))) {
    return true
  }

  return ACTION_VERBS.has(first)
}
